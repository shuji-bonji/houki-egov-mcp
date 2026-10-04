/**
 * 差分 20261001-t2-error-codes の受入テスト — INTERNAL_ERROR にする場面
 *
 * 期待値の正本: specs/changes/20261001-t2-error-codes/specs/{common_errors,search_fulltext,cli_status,verify_citations}/spec.md
 * - 同期の記録の日付を解釈できないとき（search_fulltext と --status）
 * - verify_citations で e-Gov との通信と関係の無い例外が起きたとき
 * HOUKI_EGOV_DB_PATH は import 時に読まれるので、--status は設定してから CLI を動的 import する。
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSchema } from '../../db/schema.js';
import * as lawTree from '../../services/law-tree.js';
import { seedTestDb } from '../../test-helpers/law-db-fixture.js';
import {
  type AnyObj,
  type Harness,
  lawDataResponse,
  SHOTOKU,
  startHarness,
} from '../../test-helpers/mcp-harness.js';
import { handleSearchFulltext } from '../../tools/handlers.js';

/** 案内のコマンド（SPEC-EGOV-DB-SCHEMA-029）。HOUKI_EGOV_DB_PATH で決めたときは、この前に変数が付く */
const BULK_HINT_COMMAND = 'npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything';

/** 取り込み済みの DB を作り、sync_state.last_sync_date を書き換える */
async function seedWithSyncDate(path: string, lastSyncDate: string): Promise<void> {
  const db = new Database(path);
  try {
    initSchema(db);
    await seedTestDb(db);
    db.prepare(
      `INSERT INTO sync_state (id, last_sync_date, last_full_dl_at, total_laws)
       VALUES (1, ?, '2026-05-01T03:00:00+09:00', 3)
       ON CONFLICT(id) DO UPDATE SET last_sync_date = excluded.last_sync_date`
    ).run(lastSyncDate);
  } finally {
    db.close();
  }
}

describe('同期の記録の日付を解釈できない (20261001-t2-error-codes)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'houki-egov-t2-sync-'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    rmSync(root, { recursive: true, force: true });
  });

  it('SPEC-EGOV-COMMON-ERRORS-031 解釈できない last_sync_date は INTERNAL_ERROR（retryable: false）で、全件の取り込みを案内する', async () => {
    for (const value of ['2026/05/08', '', '2026-02-30']) {
      const path = join(root, `bad-${value.replace(/\W/g, '_') || 'empty'}.db`);
      await seedWithSyncDate(path, value);
      const r = (await handleSearchFulltext({ keyword: '軽減税率' }, { dbPath: path })) as AnyObj;
      expect(r.code, value).toBe('INTERNAL_ERROR');
      expect(r.retryable, value).toBe(false);
      expect(r.error, value).toBe(`同期の記録の日付を読めません: ${value}`);
      expect(r.hint, value).toContain(BULK_HINT_COMMAND);
      expect(r, value).not.toHaveProperty('next_actions');
      expect(typeof r.detail?.cause, value).toBe('string');
    }
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-035 last_sync_date が 2026/05/08 なら hits を返さず INTERNAL_ERROR。2026-05-08 なら今までどおり', async () => {
    const bad = join(root, 'bad.db');
    await seedWithSyncDate(bad, '2026/05/08');
    const r = (await handleSearchFulltext({ keyword: '軽減税率' }, { dbPath: bad })) as AnyObj;
    expect(r.code).toBe('INTERNAL_ERROR');
    expect(r.retryable).toBe(false);
    expect(r.error).toContain('2026/05/08');
    expect(r).not.toHaveProperty('hits');

    const good = join(root, 'good.db');
    await seedWithSyncDate(good, '2026-05-08');
    const ok = (await handleSearchFulltext({ keyword: '軽減税率' }, { dbPath: good })) as AnyObj;
    expect(ok.source).toBe('bulk');
    expect(Array.isArray(ok.hits)).toBe(true);
    expect(ok.freshness.last_sync_date).toBe('2026-05-08');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-035 sync_state に行が無いときは今までどおり freshness: null でエラーにしない', async () => {
    const path = join(root, 'nosync.db');
    const db = new Database(path);
    initSchema(db);
    await seedTestDb(db);
    db.prepare('DELETE FROM sync_state').run();
    db.close();
    const r = (await handleSearchFulltext({ keyword: '軽減税率' }, { dbPath: path })) as AnyObj;
    expect(r.source).toBe('bulk');
    expect(r.freshness).toBeNull();
  });

  async function runStatus(dbPath: string) {
    const saved = process.env.HOUKI_EGOV_DB_PATH;
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    const out: string[] = [];
    const err: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      out.push(a.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      err.push(a.map(String).join(' '));
    });
    vi.resetModules();
    try {
      const { runCli } = await import('../../cli/index.js');
      const result = await runCli(['node', 'index.js', '--status']);
      return { result, out, err };
    } finally {
      if (saved === undefined) delete process.env.HOUKI_EGOV_DB_PATH;
      else process.env.HOUKI_EGOV_DB_PATH = saved;
      vi.resetModules();
    }
  }

  it('SPEC-EGOV-CLI-STATUS-009 解釈できない last_sync_date では 1〜4 行目を出した後 [ERROR] を出して exit 1（コマンドは SPEC-EGOV-DB-SCHEMA-029 の形）', async () => {
    const path = join(root, 'status-bad.db');
    await seedWithSyncDate(path, '2026/05/08');
    const { result, out, err } = await runStatus(path);
    expect(result.exitCode).toBe(1);
    expect(out[0]).toMatch(/^\[status\] /);
    expect(out[1]).toMatch(/^ {2}DB: /);
    expect(out[2]).toMatch(/^ {2}laws: /);
    expect(out[3]).toMatch(/^ {2}articles: /);
    expect(out.some((l) => l.includes('sync:'))).toBe(false);
    // HOUKI_EGOV_DB_PATH で DB を決めているので、コマンドの前に同じ変数が付く
    expect(
      err.some(
        (l) =>
          l.startsWith('[ERROR] 同期の記録を読めません: 2026/05/08（HOUKI_EGOV_DB_PATH=') &&
          l.endsWith(` ${BULK_HINT_COMMAND} で作り直してください）`)
      )
    ).toBe(true);
  });

  it('SPEC-EGOV-CLI-STATUS-009 last_sync_date が 2026-05-08 なら今までどおり同期の欄を出して exit 0', async () => {
    const path = join(root, 'status-good.db');
    await seedWithSyncDate(path, '2026-05-08');
    const { result, out } = await runStatus(path);
    expect(result.exitCode).toBe(0);
    expect(out.some((l) => l.includes('last_sync_date:  2026-05-08'))).toBe(true);
  });
});

describe('verify_citations の e-Gov と関係の無い例外 (20261001-t2-error-codes)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness(
      (url) => (url.pathname.includes('/law_data/') ? lawDataResponse(SHOTOKU) : null),
      { fastRetry: true }
    );
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await h.close();
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-043 法令本文を読む処理の例外は SOURCE_API_ERROR にせず INTERNAL_ERROR（results は返さない）', async () => {
    vi.spyOn(lawTree, 'findArticle').mockImplementation(() => {
      throw new Error('boom');
    });
    const r = await h.call('verify_citations', {
      citations: [{ law_name: '所得税法', article: '9' }],
    });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('INTERNAL_ERROR');
    expect(r.body.error).toBe('内部エラーが発生しました: boom');
    expect(r.body.detail.cause).toBe('boom');
    expect(r.body).not.toHaveProperty('results');
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-043 法令本文の取得が 503 のときは今までどおり SOURCE_API_ERROR', async () => {
    h.setRoute((url) =>
      url.pathname.includes('/law_data/') ? new Response('', { status: 503 }) : null
    );
    const r = await h.call('verify_citations', {
      citations: [{ law_name: '所得税法', article: '9' }],
    });
    expect(r.body.code).toBe('SOURCE_API_ERROR');
  });
});
