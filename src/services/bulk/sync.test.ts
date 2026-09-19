/**
 * Phase 2-8: 差分同期 (--sync) のテスト
 *
 * 実ネットワーク・実 DB は使わず、`SyncStore` と DL / ingest を差し替えて
 * 「どの日を、どの順で、どこまで進めたか」を検証する。
 * SQLite を使う `createSqliteSyncStore` は ingester.test.ts と同じ in-memory DB で確認する。
 */

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initSchema } from '../../db/schema.js';
import type { IngestResult } from './ingester.js';
import {
  createSqliteSyncStore,
  dateRangeInclusive,
  daysBetween,
  fromYyyymmdd,
  isNoDiffResponse,
  planSync,
  runSync,
  type SyncStore,
  todayJst,
  toYyyymmdd,
} from './sync.js';
import { BulkFetchError, BulkHttpError } from './zip-fetcher.js';

/** 2026-09-19 12:00 JST */
const NOW = Date.parse('2026-09-19T03:00:00Z');

function memoryStore(initial: string | null): SyncStore & { history: string[] } {
  let last = initial;
  const history: string[] = [];
  return {
    history,
    lastSyncDate: () => last,
    markSynced: (d) => {
      last = d;
      history.push(d);
    },
  };
}

function ingestResult(upserted: number, unchanged = 0): IngestResult {
  return {
    csvRows: upserted + unchanged,
    xmlSeen: upserted + unchanged,
    unchanged,
    upserted,
    failed: 0,
    durationMs: 1,
  };
}

describe('日付ヘルパ', () => {
  it('todayJst は JST の日付を返す (UTC では前日でも)', () => {
    // 2026-09-18 20:00 UTC = 2026-09-19 05:00 JST
    expect(todayJst(Date.parse('2026-09-18T20:00:00Z'))).toBe('2026-09-19');
    expect(todayJst(Date.parse('2026-09-18T14:59:00Z'))).toBe('2026-09-18');
  });

  it('toYyyymmdd / fromYyyymmdd', () => {
    expect(toYyyymmdd('2026-09-07')).toBe('20260907');
    expect(fromYyyymmdd('20260907')).toBe('2026-09-07');
  });

  it('daysBetween は日数差 (後ろ向きは負)', () => {
    expect(daysBetween('2026-09-07', '2026-09-19')).toBe(12);
    expect(daysBetween('2026-09-19', '2026-09-19')).toBe(0);
    expect(daysBetween('2026-09-19', '2026-09-18')).toBe(-1);
  });

  it('dateRangeInclusive は両端を含み、月をまたぐ', () => {
    expect(dateRangeInclusive('2026-08-30', '2026-09-02')).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
    expect(dateRangeInclusive('2026-09-19', '2026-09-19')).toEqual(['2026-09-19']);
    expect(dateRangeInclusive('2026-09-20', '2026-09-19')).toEqual([]);
  });
});

describe('planSync', () => {
  it('sync_state が無ければ no-state', () => {
    expect(planSync({ lastSyncDate: null, nowMs: NOW, limitDays: 90 })).toEqual({
      kind: 'no-state',
    });
  });

  it('最終同期日を含めて今日までを並べる', () => {
    const plan = planSync({ lastSyncDate: '2026-09-17', nowMs: NOW, limitDays: 90 });
    expect(plan).toEqual({
      kind: 'dates',
      from: '2026-09-17',
      to: '2026-09-19',
      dates: ['2026-09-17', '2026-09-18', '2026-09-19'],
    });
  });

  it('同じ日に 2 回目を実行すると、今日 1 日だけを確認し直す', () => {
    const plan = planSync({ lastSyncDate: '2026-09-19', nowMs: NOW, limitDays: 90 });
    expect(plan.kind).toBe('dates');
    if (plan.kind === 'dates') expect(plan.dates).toEqual(['2026-09-19']);
  });

  it('limitDays を超えて空いていれば full-required', () => {
    const plan = planSync({ lastSyncDate: '2026-05-01', nowMs: NOW, limitDays: 90 });
    expect(plan).toEqual({
      kind: 'full-required',
      lastSyncDate: '2026-05-01',
      daysSince: 141,
      limitDays: 90,
    });
  });

  it('ちょうど limitDays なら差分で追う', () => {
    const plan = planSync({ lastSyncDate: '2026-06-21', nowMs: NOW, limitDays: 90 });
    expect(plan.kind).toBe('dates');
    if (plan.kind === 'dates') expect(plan.dates).toHaveLength(91);
  });
});

describe('isNoDiffResponse', () => {
  it('HTTP 404 / 500 は「その日の差分なし」', () => {
    expect(isNoDiffResponse(new BulkHttpError('HTTP 500', 500))).toBe(true);
    expect(isNoDiffResponse(new BulkHttpError('HTTP 404', 404))).toBe(true);
  });

  it('それ以外は失敗', () => {
    expect(isNoDiffResponse(new BulkHttpError('HTTP 503', 503))).toBe(false);
    expect(isNoDiffResponse(new BulkFetchError('network'))).toBe(false);
    expect(isNoDiffResponse(new Error('x'))).toBe(false);
  });
});

describe('runSync', () => {
  it('差分のある日は取り込み、無い日は飛ばし、日ごとに store を進める', async () => {
    const store = memoryStore('2026-09-16');
    const downloaded: string[] = [];
    const cleaned: string[] = [];
    const result = await runSync({
      store,
      nowMs: NOW,
      checkReachable: async () => {},
      downloadDay: async (d) => {
        downloaded.push(d);
        if (d === '20260916' || d === '20260919') throw new BulkHttpError('HTTP 500', 500);
        return { zipPath: `/tmp/R${d}.zip`, bytes: 1000 };
      },
      ingestDay: async (p) => ingestResult(p.includes('20260917') ? 3 : 5, 1),
      cleanupDay: async (p) => {
        cleaned.push(p);
      },
    });

    expect(downloaded).toEqual(['20260916', '20260917', '20260918', '20260919']);
    expect(result.days.map((d) => [d.date, d.status])).toEqual([
      ['2026-09-16', 'empty'],
      ['2026-09-17', 'ingested'],
      ['2026-09-18', 'ingested'],
      ['2026-09-19', 'empty'],
    ]);
    expect(result.days[1].ingest?.upserted).toBe(3);
    expect(result.failed).toBeUndefined();
    expect(store.history).toEqual(['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19']);
    expect(result.lastSyncDate).toBe('2026-09-19');
    expect(cleaned).toEqual(['/tmp/R20260917.zip', '/tmp/R20260918.zip']);
  });

  it('差分なし以外の失敗で止まり、成功した日までを store に残す', async () => {
    const store = memoryStore('2026-09-16');
    const result = await runSync({
      store,
      nowMs: NOW,
      checkReachable: async () => {},
      downloadDay: async (d) => {
        if (d === '20260918') throw new BulkFetchError('bulk DL に 3 回失敗しました: ECONNRESET');
        return { zipPath: `/tmp/R${d}.zip`, bytes: 10 };
      },
      ingestDay: async () => ingestResult(1),
    });
    expect(result.days.map((d) => d.date)).toEqual(['2026-09-16', '2026-09-17']);
    expect(result.failed).toEqual({
      date: '2026-09-18',
      message: 'bulk DL に 3 回失敗しました: ECONNRESET',
    });
    expect(store.history).toEqual(['2026-09-16', '2026-09-17']);
    expect(result.lastSyncDate).toBe('2026-09-17');
  });

  it('ingest の失敗でも同じように止まる (取得済み zip は消す)', async () => {
    const store = memoryStore('2026-09-18');
    const cleaned: string[] = [];
    const result = await runSync({
      store,
      nowMs: NOW,
      checkReachable: async () => {},
      downloadDay: async (d) => ({ zipPath: `/tmp/R${d}.zip`, bytes: 10 }),
      ingestDay: async (p) => {
        if (p.includes('20260919')) throw new Error('CSV が見つかりません');
        return ingestResult(1);
      },
      cleanupDay: async (p) => {
        cleaned.push(p);
      },
    });
    expect(result.failed?.date).toBe('2026-09-19');
    expect(store.history).toEqual(['2026-09-18']);
    expect(cleaned).toEqual(['/tmp/R20260918.zip', '/tmp/R20260919.zip']);
  });

  it('e-Gov に届かなければ何もせず throw する', async () => {
    const store = memoryStore('2026-09-18');
    let downloads = 0;
    await expect(
      runSync({
        store,
        nowMs: NOW,
        checkReachable: async () => {
          throw new BulkFetchError('e-Gov に接続できません');
        },
        downloadDay: async () => {
          downloads++;
          return { zipPath: '/tmp/x.zip', bytes: 0 };
        },
        ingestDay: async () => ingestResult(0),
      })
    ).rejects.toThrow('e-Gov に接続できません');
    expect(downloads).toBe(0);
    expect(store.history).toEqual([]);
  });

  it('no-state / full-required では接続確認もしない', async () => {
    let reached = 0;
    const deps = {
      nowMs: NOW,
      checkReachable: async () => {
        reached++;
      },
      downloadDay: async () => ({ zipPath: '/tmp/x.zip', bytes: 0 }),
      ingestDay: async () => ingestResult(0),
    };
    const r1 = await runSync({ ...deps, store: memoryStore(null) });
    expect(r1.plan.kind).toBe('no-state');
    const r2 = await runSync({ ...deps, store: memoryStore('2026-01-01') });
    expect(r2.plan.kind).toBe('full-required');
    expect(reached).toBe(0);
  });

  it('onDay は日ごとに index / total 付きで呼ばれる', async () => {
    const calls: [string, number, number][] = [];
    await runSync({
      store: memoryStore('2026-09-18'),
      nowMs: NOW,
      checkReachable: async () => {},
      downloadDay: async () => {
        throw new BulkHttpError('HTTP 500', 500);
      },
      ingestDay: async () => ingestResult(0),
      onDay: (r, i, total) => {
        calls.push([r.date, i, total]);
      },
    });
    expect(calls).toEqual([
      ['2026-09-18', 0, 2],
      ['2026-09-19', 1, 2],
    ]);
  });
});

describe('createSqliteSyncStore', () => {
  it('sync_state が無ければ null、markSynced で last_sync_date を進め last_full_dl_at は保つ', () => {
    const db = new Database(':memory:');
    initSchema(db);
    const store = createSqliteSyncStore(db);
    expect(store.lastSyncDate()).toBeNull();

    db.prepare(
      `INSERT INTO sync_state (id, last_sync_date, last_full_dl_at, total_laws, bulk_source)
       VALUES (1, '2026-09-07', '2026-09-07T01:00:00Z', 10205, 'all_xml')`
    ).run();
    expect(store.lastSyncDate()).toBe('2026-09-07');

    store.markSynced('2026-09-19');
    const row = db.prepare('SELECT * FROM sync_state WHERE id = 1').get() as Record<
      string,
      unknown
    >;
    expect(row.last_sync_date).toBe('2026-09-19');
    expect(row.last_full_dl_at).toBe('2026-09-07T01:00:00Z');
    expect(row.bulk_source).toBe('incremental');
    expect(row.total_laws).toBe(0); // laws が空なので DB の件数 0
    db.close();
  });
});
