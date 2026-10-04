/**
 * 差分 20261004-ingest-redistributed-revisions の受入テスト: cli_bulk_download（取り込みの判定）
 *
 * 期待値の正本は specs/changes/20261004-ingest-redistributed-revisions/specs/cli_bulk_download/spec.md。
 * 医師法施行規則（323M40000100047）の 4 版の fixture は src/test-helpers/redistributed-revisions-fixture.ts。
 * e-Gov への通信は vi.stubGlobal('fetch', …) で差し替え、実際の e-Gov には問い合わせない。
 * 取り込みの件数の表示（032）は cli_output.test.ts にある。
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type DatabaseT from 'better-sqlite3';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb } from '../../db/index.js';
import { initSchema } from '../../db/schema.js';
import { ingestZip } from '../../services/bulk/ingester.js';
import {
  captureOutput,
  runCliWith,
  setupEnv,
  stubEgov,
  type TestEnv,
  withDb,
} from '../../test-helpers/cli-db-harness.js';
import {
  DAY_20260902,
  DAY_20260917,
  DAY_20261001,
  FULL_20261002,
  footprintOf,
  forceStatuses,
  ISHI_LAW_ID,
  type IshiEntries,
  ishiMemoryZip,
  ishiZip,
  REV_0814,
  REV_0917,
  REV_1001,
  REV_20270401,
  STATUS_FIXED,
  STATUS_V0190,
  statusesOf,
} from '../../test-helpers/redistributed-revisions-fixture.js';

/** ingestZip の結果のうち、このテストで見る件数 */
interface Counts {
  upserted: number;
  unchanged: number;
  status_changed: number;
}

/** 1 日分の差分を取り込む（--sync・--bulk-download-by-date と同じ渡し方） */
async function ingestDay(
  db: DatabaseT.Database,
  entries: IshiEntries,
  nowIso: string
): Promise<Counts> {
  const r = (await ingestZip({
    db,
    zip: ishiMemoryZip(entries),
    source: 'incremental',
    updateSyncState: false,
    nowIso,
  })) as unknown as Counts;
  return { upserted: r.upserted, unchanged: r.unchanged, status_changed: r.status_changed };
}

describe('cli_bulk_download の取り込みの判定（差分 20261004-ingest-redistributed-revisions）', () => {
  let db: DatabaseT.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
  });

  afterEach(() => {
    closeDb(db);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-031 09-02 → 09-17 → 10-01 の差分を順に取り込むと、4 版が例の表の「この規則での状態」になる', async () => {
    const c0902 = await ingestDay(db, DAY_20260902, '2026-09-02T07:00:00.000Z');
    expect(c0902).toEqual({ upserted: 4, unchanged: 0, status_changed: 0 });
    expect(statusesOf(db)).toEqual(STATUS_V0190);

    const c0917 = await ingestDay(db, DAY_20260917, '2026-09-17T07:00:00.000Z');
    expect(c0917).toEqual({ upserted: 0, unchanged: 1, status_changed: 1 });
    expect(statusesOf(db)).toEqual({
      [REV_0814]: 'PreviousEnforced',
      [REV_0917]: 'CurrentEnforced',
      [REV_1001]: 'UnEnforced',
      [REV_20270401]: 'UnEnforced',
    });

    const c1001 = await ingestDay(db, DAY_20261001, '2026-10-01T07:00:00.000Z');
    // `…_20270401_…` は DB も CSV も未施行なので unchanged にだけ数える
    expect(c1001).toEqual({ upserted: 0, unchanged: 2, status_changed: 1 });
    expect(statusesOf(db)).toEqual(STATUS_FIXED);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-031 SPEC-EGOV-CLI-BULK-DOWNLOAD-014 状態だけを書き換えた版は、ほかの列（content_hash・fetched_at・updated）・条の本文・法令名の索引が前回のまま', async () => {
    await ingestDay(db, DAY_20260902, '2026-09-02T07:00:00.000Z');
    const before = footprintOf(db, REV_0917);
    expect(before.articles.length).toBe(2);
    expect(before.lawsFts.length).toBe(1);

    const c = await ingestDay(db, DAY_20260917, '2026-09-17T07:00:00.000Z');
    expect(c.unchanged).toBe(1);
    expect(c.upserted).toBe(0);

    const after = footprintOf(db, REV_0917);
    expect(after).toEqual(before);
    expect(after.law.fetched_at).toBe('2026-09-02T07:00:00.000Z');
    expect(after.law.updated).toBe('2026-09-02T07:00:00.000Z');
    expect(statusesOf(db)[REV_0917]).toBe('CurrentEnforced');
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-031 DB が UnEnforced で CSV の未施行の欄も ○ なら何も書き換えず、unchanged にだけ数える', async () => {
    await ingestDay(db, DAY_20260902, '2026-09-02T07:00:00.000Z');
    const before = footprintOf(db, REV_1001);

    const c = await ingestDay(db, [[REV_1001, true]], '2026-09-10T07:00:00.000Z');
    expect(c).toEqual({ upserted: 0, unchanged: 1, status_changed: 0 });
    expect(statusesOf(db)).toEqual(STATUS_V0190);
    expect(footprintOf(db, REV_1001)).toEqual(before);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-031 DB が CurrentEnforced・PreviousEnforced なら、CSV の未施行の欄が ○ で届いても UnEnforced に戻さない', async () => {
    await ingestDay(db, DAY_20260902, '2026-09-02T07:00:00.000Z');
    await ingestDay(db, DAY_20260917, '2026-09-17T07:00:00.000Z');
    await ingestDay(db, DAY_20261001, '2026-10-01T07:00:00.000Z');
    expect(statusesOf(db)).toEqual(STATUS_FIXED);

    const c = await ingestDay(
      db,
      [
        [REV_0814, true],
        [REV_0917, true],
        [REV_1001, true],
      ],
      '2026-10-02T07:00:00.000Z'
    );
    expect(c).toEqual({ upserted: 0, unchanged: 3, status_changed: 0 });
    expect(statusesOf(db)).toEqual(STATUS_FIXED);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-031 SPEC-EGOV-CLI-BULK-DOWNLOAD-016 施行日がより新しい現行の版がすでにあれば、状態だけを書き換えた版を PreviousEnforced にする', async () => {
    await ingestDay(db, DAY_20260902, '2026-09-02T07:00:00.000Z');
    // 10-01 の配り直しを先に取り込み、09-17 の配り直しが後から届く
    await ingestDay(db, DAY_20261001, '2026-10-01T07:00:00.000Z');
    expect(statusesOf(db)[REV_1001]).toBe('CurrentEnforced');

    const c = await ingestDay(db, DAY_20260917, '2026-10-02T07:00:00.000Z');
    expect(c).toEqual({ upserted: 0, unchanged: 1, status_changed: 1 });
    expect(statusesOf(db)).toEqual(STATUS_FIXED);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-016 0917 が UnEnforced・0814 が CurrentEnforced の DB に 09-17 の配り直しが届くと、0917 が CurrentEnforced・0814 が PreviousEnforced', async () => {
    await ingestDay(db, DAY_20260902, '2026-09-02T07:00:00.000Z');
    expect(statusesOf(db)[REV_0917]).toBe('UnEnforced');
    expect(statusesOf(db)[REV_0814]).toBe('CurrentEnforced');

    await ingestDay(db, DAY_20260917, '2026-09-17T07:00:00.000Z');
    expect(statusesOf(db)[REV_0917]).toBe('CurrentEnforced');
    expect(statusesOf(db)[REV_0814]).toBe('PreviousEnforced');
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-016 SPEC-EGOV-CLI-BULK-DOWNLOAD-031 1 つの zip で状態だけを書き換える版が新しい順に並んでいても、新しい版が現行として残る', async () => {
    await ingestDay(db, DAY_20260902, '2026-09-02T07:00:00.000Z');

    const c = await ingestDay(
      db,
      [
        [REV_1001, false],
        [REV_0917, false],
      ],
      '2026-10-01T07:00:00.000Z'
    );
    expect(c).toEqual({ upserted: 0, unchanged: 2, status_changed: 2 });
    expect(statusesOf(db)).toEqual(STATUS_FIXED);
  });
});

// ---------- CLI の経路（--bulk-download-by-date・--bulk-download-everything） ----------

describe('cli_bulk_download の CLI の経路（差分 20261004-ingest-redistributed-revisions）', () => {
  let env: TestEnv;
  let dbPath: string;

  beforeEach(() => {
    env = setupEnv('td-redistributed-bulk-');
    captureOutput();
    dbPath = join(env.root, 'db', 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    mkdirSync(join(env.root, 'db'), { recursive: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    env.restore();
  });

  /** 版 3 の DB を作る。fill で中身を入れる */
  async function seed(fill?: (db: DatabaseT.Database) => Promise<void> | void): Promise<void> {
    const db = new Database(dbPath);
    try {
      initSchema(db);
      await fill?.(db);
    } finally {
      db.close();
    }
  }

  /** v0.19.0 で 09-02 → 09-17 → 10-01 を取り込んだ後の DB（状態が残っている） */
  async function seedV0190(): Promise<void> {
    await seed(async (db) => {
      for (const [day, iso] of [
        [DAY_20260902, '2026-09-02T07:00:00.000Z'],
        [DAY_20260917, '2026-09-17T07:00:00.000Z'],
        [DAY_20261001, '2026-10-01T07:00:00.000Z'],
      ] as const) {
        await ingestZip({
          db,
          zip: ishiMemoryZip(day),
          source: 'incremental',
          updateSyncState: false,
          nowIso: iso,
        });
      }
      forceStatuses(db, STATUS_V0190);
      db.prepare(
        `INSERT INTO sync_state (id, last_sync_date, last_full_dl_at, total_laws, bulk_source)
         VALUES (1, '2026-10-01', '2026-09-01T03:00:00.000Z', 4, 'incremental')`
      ).run();
    });
  }

  const statuses = (lawId = ISHI_LAW_ID) => withDb(dbPath, (db) => statusesOf(db, lawId));

  async function byDate(yyyymmdd: string, entries: IshiEntries): Promise<number> {
    stubEgov({ days: { [yyyymmdd]: ishiZip(entries) } });
    const r = await runCliWith(['--bulk-download-by-date', yyyymmdd]);
    vi.unstubAllGlobals();
    return r.exitCode;
  }

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-031 --bulk-download-by-date で 09-02 → 09-17 → 10-01 を順に取り込むと例の表の「この規則での状態」', async () => {
    await seed();
    expect(await byDate('20260902', DAY_20260902)).toBe(0);
    expect(statuses()).toEqual(STATUS_V0190);
    expect(await byDate('20260917', DAY_20260917)).toBe(0);
    expect(await byDate('20261001', DAY_20261001)).toBe(0);
    expect(statuses()).toEqual(STATUS_FIXED);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-033 SPEC-EGOV-CLI-BULK-DOWNLOAD-031 v0.19.0 で状態が残った DB に全件の zip を取り込むと、4 版とも例の表の「この規則での状態」になる', async () => {
    await seedV0190();
    const before0917 = withDb(dbPath, (db) => footprintOf(db, REV_0917));
    const before1001 = withDb(dbPath, (db) => footprintOf(db, REV_1001));

    stubEgov({ full: ishiZip(FULL_20261002) });
    const r = await runCliWith(['--bulk-download-everything']);
    expect(r.exitCode).toBe(0);
    expect(statuses()).toEqual(STATUS_FIXED);
    // 条の本文と、current_revision_status 以外の列は書き換えない
    expect(withDb(dbPath, (db) => footprintOf(db, REV_0917))).toEqual(before0917);
    expect(withDb(dbPath, (db) => footprintOf(db, REV_1001))).toEqual(before1001);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-033 全件の CSV に無く、現行の版の施行日以前（同じ日を含む）の UnEnforced の版だけを PreviousEnforced にする', async () => {
    await seedV0190();
    await seed((db) => {
      const ins = db.prepare(
        `INSERT INTO laws (law_revision_id, law_id, law_type, law_num, law_title,
          amendment_enforcement_date, current_revision_status, repeal_status, updated, fetched_at, content_hash)
         VALUES (?, ?, 'Act', 'n', 't', ?, ?, 'None', 'u', 'f', 'h')`
      );
      // 法令 X: 現行の版（施行日 2026-04-01）と、全件の CSV に無い未施行の版 4 つ
      ins.run('X_20260401_A', 'X', '2026-04-01', 'CurrentEnforced');
      ins.run('X_20260301_B', 'X', '2026-03-01', 'UnEnforced'); // 現行より前 → 前の版
      ins.run('X_20260401_C', 'X', '2026-04-01', 'UnEnforced'); // 同じ日 → 前の版
      ins.run('X_20270101_D', 'X', '2027-01-01', 'UnEnforced'); // 現行より後 → 残す
      ins.run('X_NODATE_E', 'X', null, 'UnEnforced'); // 施行日なし → 残す
      // 法令 Y: 現行の版が無い
      ins.run('Y_20200101_A', 'Y', '2020-01-01', 'UnEnforced');
    });

    stubEgov({ full: ishiZip(FULL_20261002) });
    expect((await runCliWith(['--bulk-download-everything'])).exitCode).toBe(0);

    expect(statuses()).toEqual(STATUS_FIXED);
    expect(statuses('X')).toEqual({
      X_20260401_A: 'CurrentEnforced',
      X_20260301_B: 'PreviousEnforced',
      X_20260401_C: 'PreviousEnforced',
      X_20270101_D: 'UnEnforced',
      X_NODATE_E: 'UnEnforced',
    });
    expect(statuses('Y')).toEqual({ Y_20200101_A: 'UnEnforced' });
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-033 --bulk-download-by-date では CSV に無い未施行の版を前の版にしない', async () => {
    await seedV0190();
    expect(await byDate('20261002', FULL_20261002)).toBe(0);
    // `…_20261001_…` は 031 で現行に、`…_20260814_…` は 016 で前の版になるが、`…_20260917_…` は残る
    expect(statuses()).toEqual({
      [REV_0814]: 'PreviousEnforced',
      [REV_0917]: 'UnEnforced',
      [REV_1001]: 'CurrentEnforced',
      [REV_20270401]: 'UnEnforced',
    });
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-011 施行日の前日の差分に未施行の欄が空で届いた版は、その日に CurrentEnforced になり、前の現行の版は PreviousEnforced', async () => {
    await seed();
    expect(await byDate('20260917', DAY_20260917)).toBe(0);
    expect(statuses()).toEqual({ [REV_0917]: 'CurrentEnforced' });

    // 日本時間 2026-09-30 の昼に、施行日 2026-10-01 の版を取り込む
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T03:00:00.000Z'));
    expect(await byDate('20260930', [[REV_1001, false]])).toBe(0);
    expect(statuses()).toEqual({
      [REV_0917]: 'PreviousEnforced',
      [REV_1001]: 'CurrentEnforced',
    });
  });
});
