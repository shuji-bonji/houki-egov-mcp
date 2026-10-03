/**
 * 差分 20261003-db-cli の受入テスト: search_fulltext
 *
 * 期待値の正本は specs/changes/20261003-db-cli/specs/search_fulltext/spec.md。
 * e-Gov の法令検索（search_law への切り替え先）は fetch を差し替えて 0 件を返す。
 * 環境変数は import 時に読まれるので、設定してから vi.resetModules() の後にハンドラーを読み込む。
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSchema } from '../../db/schema.js';
import { ingestZip } from '../../services/bulk/ingester.js';
import { createMemoryZip } from '../../services/bulk/zip-reader.js';
import {
  CSV_KAIREKI,
  CSV_YOKIN,
  captureOutput,
  csvText,
  REV_KAIREKI,
  REV_YOKIN,
  seedVersionedDb,
  setupEnv,
  snapshot,
  type TestEnv,
  XML_KAIREKI,
  XML_YOKIN,
} from '../../test-helpers/cli-db-harness.js';

// biome-ignore lint/suspicious/noExplicitAny: 応答の形をテストで自由に辿るため
type AnyObj = Record<string, any>;

let env: TestEnv;

beforeEach(() => {
  env = setupEnv('td-db-cli-sf-');
  captureOutput();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ total_count: 0, count: 0, laws: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    )
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  env.restore();
});

async function search(args: AnyObj, dbPath?: string): Promise<AnyObj> {
  vi.resetModules();
  const { handleSearchFulltext } = await import('../../tools/handlers.js');
  return (await handleSearchFulltext(
    args as { keyword: string },
    dbPath ? { dbPath } : {}
  )) as AnyObj;
}

async function seedCurrent(
  dbPath: string,
  laws: Array<[csv: string, rev: string, xml: string]>,
  lastSyncDate?: string
): Promise<void> {
  const db = new Database(dbPath);
  try {
    initSchema(db);
    await ingestZip({
      db,
      zip: createMemoryZip([
        { path: 'all_law_list.csv', content: csvText(laws.map((l) => l[0])) },
        ...laws.map(([, rev, xml]) => ({ path: `${rev}/${rev}.xml`, content: xml })),
      ]),
      source: 'all_xml',
      updateSyncState: false,
    });
    if (lastSyncDate) {
      db.prepare(
        `INSERT INTO sync_state (id, last_sync_date, last_full_dl_at, total_laws, bulk_source)
         VALUES (1, ?, '2026-04-01T03:00:00.000Z', 1, 'all_xml')`
      ).run(lastSyncDate);
    }
  } finally {
    db.close();
  }
}

describe('search_fulltext（差分 20261003-db-cli）', () => {
  it('SPEC-EGOV-SEARCH-FULLTEXT-004 段落だけの本則に当たったヒットは article_num 本則、caption と chapter_path は null', async () => {
    const dbPath = join(env.root, 'laws.db');
    await seedCurrent(dbPath, [[CSV_KAIREKI, REV_KAIREKI, XML_KAIREKI]]);
    const r = await search({ keyword: '今般改暦ノ儀' }, dbPath);
    expect(r.source).toBe('bulk');
    const hit = r.hits.find((h: AnyObj) => h.match_type === 'article');
    expect(hit).toMatchObject({
      law_id: '105DF0000000337',
      article_num: '本則',
      caption: null,
      chapter_path: null,
    });
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-004 本則の条・枝番号の条は 1・30の2 の形のまま', async () => {
    const dbPath = join(env.root, 'laws.db');
    await seedCurrent(dbPath, [[CSV_YOKIN, REV_YOKIN, XML_YOKIN]]);
    const r = await search({ keyword: '預金者等の保護' }, dbPath);
    expect(r.hits[0]?.article_num).toBe('1');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-023 MCP サーバーを HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS=60 で起動したときは warning に「最終同期から 60 日を超えていれば」を含む', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-09T03:00:00.000Z'));
    process.env.HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS = '60';
    const dbPath = join(env.root, 'laws.db');
    await seedCurrent(dbPath, [[CSV_YOKIN, REV_YOKIN, XML_YOKIN]], '2026-04-01');
    const r = await search({ keyword: '預金者等の保護' }, dbPath);
    expect(r.freshness.staleness).toBe('outdated');
    expect(r.freshness.days_since_sync).toBe(38);
    expect(r.freshness.warning).toContain('最終同期から 60 日を超えていれば');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-023 環境変数が無ければ warning の上限は 90 日', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-09T03:00:00.000Z'));
    const dbPath = join(env.root, 'laws.db');
    await seedCurrent(dbPath, [[CSV_YOKIN, REV_YOKIN, XML_YOKIN]], '2026-04-01');
    const r = await search({ keyword: '預金者等の保護' }, dbPath);
    expect(r.freshness.warning).toContain('最終同期から 90 日を超えていれば');
    expect(r.freshness.warning).toContain('日前');
    expect(r.freshness.warning).toContain('bulk-download');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-036 版 3 の DB では、本文の １８３―２ は 183-2 でも １８３―２ でも当たる', async () => {
    const dbPath = join(env.root, 'laws.db');
    const xml = XML_YOKIN.replace('第二条の本文。', '様式第１８３―２号による届出。');
    await seedCurrent(dbPath, [[CSV_YOKIN, REV_YOKIN, xml]]);
    for (const keyword of ['183-2', '１８３―２']) {
      const r = await search({ keyword }, dbPath);
      expect(r.source, keyword).toBe('bulk');
      expect(
        r.hits.some((h: AnyObj) => h.law_id === '346AC0000000034' && h.article_num === '2'),
        keyword
      ).toBe(true);
    }
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-036 版 2 の DB は引かずに search_law への切り替え（040）を返す', async () => {
    const dbPath = join(env.root, 'laws.db');
    seedVersionedDb(dbPath, '2');
    const r = await search({ keyword: '183-2' }, dbPath);
    expect(r.source).toBe('api-fallback');
    expect(r.note.startsWith('bulk DB の版 (2) がこの houki-egov-mcp (3) より古いため、')).toBe(
      true
    );
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-039 フォルダーの無い場所では作らずに bulk DL 未実行のための切り替えを返す', async () => {
    mkdirSync(join(env.root, 'empty'));
    const dbPath = join(env.root, 'empty', 'a', 'laws.db');
    const r = await search({ keyword: '消費税法' }, dbPath);
    expect(r.source).toBe('api-fallback');
    expect(r.note.startsWith('bulk DL 未実行のため')).toBe(true);
    expect(r.next_actions[0].action).toBe('bulk_download_everything');
    expect(existsSync(join(env.root, 'empty', 'a'))).toBe(false);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-039 HOUKI_EGOV_DB_PATH の場所にも作らない', async () => {
    mkdirSync(join(env.root, 'empty'));
    process.env.HOUKI_EGOV_DB_PATH = join(env.root, 'empty', 'a', 'laws.db');
    const r = await search({ keyword: '消費税法' });
    expect(r.note.startsWith('bulk DL 未実行のため')).toBe(true);
    expect(existsSync(join(env.root, 'empty', 'a'))).toBe(false);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-039 版の記録が無い DB（テーブルの無い SQLite）は、書き込まずに bulk DL 未実行のための切り替え', async () => {
    const dbPath = join(env.root, 'laws.db');
    new Database(dbPath).close();
    const r = await search({ keyword: '消費税法' }, dbPath);
    expect(r.note.startsWith('bulk DL 未実行のため')).toBe(true);
    const db = new Database(dbPath, { readonly: true });
    try {
      expect(db.prepare('SELECT name FROM sqlite_master').all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-040 版 2 の DB: note は古いための文で --bulk-download-everything を含み、next_actions は 2 件、版は 2 のまま', async () => {
    const dbPath = join(env.root, 'laws.db');
    seedVersionedDb(dbPath, '2');
    const r = await search({ keyword: '適格請求書' }, dbPath);
    expect(r.source).toBe('api-fallback');
    expect(r.note.startsWith('bulk DB の版 (2) がこの houki-egov-mcp (3) より古いため、')).toBe(
      true
    );
    expect(r.note).toContain('--bulk-download-everything');
    expect(r.next_actions.map((a: AnyObj) => a.action)).toEqual([
      'bulk_download_everything',
      'search_law',
    ]);
    expect(r.fallback).toBeDefined();
    const s = snapshot(dbPath);
    expect(s.schemaVersion).toBe('2');
    expect(s.laws).toBe(1);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-040 版 4 の DB: note は新しいための文で更新を案内し --bulk-download-everything は案内しない、next_actions は search_law の 1 件', async () => {
    const dbPath = join(env.root, 'laws.db');
    seedVersionedDb(dbPath, '4');
    const r = await search({ keyword: '適格請求書' }, dbPath);
    expect(r.source).toBe('api-fallback');
    expect(r.note.startsWith('bulk DB の版 (4) がこの houki-egov-mcp (3) より新しいため、')).toBe(
      true
    );
    expect(r.note).toContain('新しい版に更新');
    expect(r.note).not.toContain('--bulk-download-everything');
    expect(r.next_actions).toHaveLength(1);
    expect(r.next_actions[0].action).toBe('search_law');
    expect(snapshot(dbPath).schemaVersion).toBe('4');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-040 版を読めない DB: note は読めないための文で、ファイルを消してから --bulk-download-everything を案内、next_actions は search_law の 1 件', async () => {
    const dbPath = join(env.root, 'laws.db');
    seedVersionedDb(dbPath, 'abc');
    const r = await search({ keyword: '適格請求書' }, dbPath);
    expect(r.source).toBe('api-fallback');
    expect(r.note.startsWith('bulk DB の版を読めないため (schema_version: abc)、')).toBe(true);
    expect(r.note).toContain('消して');
    expect(r.note).toContain('--bulk-download-everything');
    expect(r.next_actions).toHaveLength(1);
    expect(r.next_actions[0].action).toBe('search_law');
    expect(snapshot(dbPath).schemaVersion).toBe('abc');
  });
});
