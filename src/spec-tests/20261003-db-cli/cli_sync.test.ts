/**
 * 差分 20261003-db-cli の受入テスト: cli_sync
 *
 * 期待値の正本は specs/changes/20261003-db-cli/specs/cli_sync/spec.md。
 * 今日（日本時間）は 2026-09-19 に固定する。
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSchema } from '../../db/schema.js';
import {
  captureOutput,
  lines,
  type Output,
  runCliWith,
  seedVersionedDb,
  setupEnv,
  snapshot,
  stubEgov,
  type TestEnv,
} from '../../test-helpers/cli-db-harness.js';

let env: TestEnv;
let out: Output;
let dbPath: string;

beforeEach(() => {
  env = setupEnv('td-db-cli-sync-');
  out = captureOutput();
  dbPath = join(env.root, 'db', 'laws.db');
  process.env.HOUKI_EGOV_DB_PATH = dbPath;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-19T03:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  env.restore();
});

function seedCurrentDb(lastSyncDate?: string): void {
  mkdirSync(join(env.root, 'db'), { recursive: true });
  const db = new Database(dbPath);
  try {
    initSchema(db);
    if (lastSyncDate) {
      db.prepare(
        `INSERT INTO sync_state (id, last_sync_date, last_full_dl_at, total_laws, bulk_source)
         VALUES (1, ?, '2026-09-07T04:53:21.112Z', 0, 'all_xml')`
      ).run(lastSyncDate);
    }
  } finally {
    db.close();
  }
}

describe('cli_sync（差分 20261003-db-cli）', () => {
  it('SPEC-EGOV-CLI-SYNC-005 3 日とも HTTP 500 なら、差分 zip の取得は 1 日 1 回の 3 回で、3 日とも確認済み', async () => {
    process.env.HOUKI_EGOV_BULK_RETRY = '3';
    seedCurrentDb('2026-09-17');
    const e500 = { status: 500, statusText: 'Internal Server Error' };
    const egov = stubEgov({
      head: 200,
      days: { '20260917': e500, '20260918': e500, '20260919': e500 },
    });
    expect((await runCliWith(['--sync'])).exitCode).toBe(0);
    expect(egov.zipCalls()).toHaveLength(3);
    expect(snapshot(dbPath).syncState[0]?.last_sync_date).toBe('2026-09-19');
  });

  it('SPEC-EGOV-CLI-SYNC-005 HTTP 404 も 1 回目で差分なし', async () => {
    process.env.HOUKI_EGOV_BULK_RETRY = '3';
    seedCurrentDb('2026-09-19');
    const egov = stubEgov({ head: 200, days: { '20260919': { status: 404 } } });
    expect((await runCliWith(['--sync'])).exitCode).toBe(0);
    expect(egov.zipCalls()).toHaveLength(1);
    expect(lines(out.stderr)).toContain('  [1/1] 2026-09-19: 差分なし');
  });

  it('SPEC-EGOV-CLI-SYNC-005 HTTP 503 は差分なしにせず、HOUKI_EGOV_BULK_RETRY 回まで取り直す', async () => {
    process.env.HOUKI_EGOV_BULK_RETRY = '2';
    seedCurrentDb('2026-09-19');
    const egov = stubEgov({
      head: 200,
      days: { '20260919': { status: 503, statusText: 'Service Unavailable' } },
    });
    expect((await runCliWith(['--sync'])).exitCode).toBe(1);
    expect(egov.zipCalls()).toHaveLength(2);
    expect(snapshot(dbPath).syncState[0]?.last_sync_date).toBe('2026-09-19');
  }, 15_000);

  it('SPEC-EGOV-CLI-SYNC-009 DB ファイルの無い場所では、作らずに全件の取り込みを促して exit 1', async () => {
    const egov = stubEgov({ head: 200, days: {} });
    expect((await runCliWith(['--sync'])).exitCode).toBe(1);
    expect(lines(out.stderr)).toEqual([
      '[sync] 差分同期',
      `  DB: ${dbPath}`,
      '[sync] まだ全件取り込みが行われていません。先に --bulk-download-everything を実行してください',
    ]);
    expect(egov.fn).not.toHaveBeenCalled();
    expect(existsSync(dbPath)).toBe(false);
    expect(existsSync(join(env.root, 'db'))).toBe(false);
  });

  it('SPEC-EGOV-CLI-SYNC-009 同期の状態が無い版 3 の DB でも同じ文で exit 1、e-Gov へ接続しない', async () => {
    seedCurrentDb();
    const egov = stubEgov({ head: 200, days: {} });
    expect((await runCliWith(['--sync'])).exitCode).toBe(1);
    expect(lines(out.stderr).at(-1)).toBe(
      '[sync] まだ全件取り込みが行われていません。先に --bulk-download-everything を実行してください'
    );
    expect(egov.fn).not.toHaveBeenCalled();
  });

  it('SPEC-EGOV-CLI-SYNC-019 版 2 の DB では 2 行の後に古い版のエラー（SPEC-EGOV-DB-SCHEMA-025 の文）を出して exit 1、DB は変わらない', async () => {
    mkdirSync(join(env.root, 'db'));
    seedVersionedDb(dbPath, '2');
    const egov = stubEgov({ head: 200, days: {} });
    expect((await runCliWith(['--sync'])).exitCode).toBe(1);
    expect(lines(out.stderr)).toEqual([
      '[sync] 差分同期',
      `  DB: ${dbPath}`,
      `[ERROR] DB の版 (2) が古いため使えません。HOUKI_EGOV_DB_PATH='${dbPath}' npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything で作り直してください（取り込んだ中身は消え、全件の zip 約 290 MB を取り直します）`,
    ]);
    expect(egov.fn).not.toHaveBeenCalled();
    const s = snapshot(dbPath);
    expect(s.schemaVersion).toBe('2');
    expect(s.laws).toBe(1);
  });

  it('SPEC-EGOV-CLI-SYNC-019 --bulk-download-incremental も同じ。版 4 は新しい版のエラーで exit 1', async () => {
    mkdirSync(join(env.root, 'db'));
    seedVersionedDb(dbPath, '4');
    const egov = stubEgov({ head: 200, days: {} });
    expect((await runCliWith(['--bulk-download-incremental'])).exitCode).toBe(1);
    expect(lines(out.stderr).at(-1)).toMatch(
      /^\[ERROR\] DB の版 \(4\) がこの houki-egov-mcp の版 \(3\) より新しいため、DB を変更しません。/
    );
    expect(egov.fn).not.toHaveBeenCalled();
    expect(snapshot(dbPath).schemaVersion).toBe('4');
  });

  it('SPEC-EGOV-CLI-SYNC-019 開けない DB（SQLite でないファイル）は DB を開けませんの文で exit 1', async () => {
    mkdirSync(join(env.root, 'db'));
    writeFileSync(dbPath, 'not sqlite '.repeat(50));
    const egov = stubEgov({ head: 200, days: {} });
    expect((await runCliWith(['--sync'])).exitCode).toBe(1);
    expect(lines(out.stderr)).toEqual([
      '[sync] 差分同期',
      `  DB: ${dbPath}`,
      '[ERROR] DB を開けません: file is not a database',
    ]);
    expect(egov.fn).not.toHaveBeenCalled();
  });
});
