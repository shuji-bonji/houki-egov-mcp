/**
 * 差分 20261003-db-cli の受入テスト: cli_status
 *
 * 期待値の正本は specs/changes/20261003-db-cli/specs/cli_status/spec.md。
 * 今日（日本時間）は 2026-05-09 に固定する。
 */

import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type DatabaseT from 'better-sqlite3';
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

const require = createRequire(import.meta.url);
const pkg = require('../../../package.json') as { name: string; version: string };

let env: TestEnv;
let out: Output;

beforeEach(() => {
  env = setupEnv('td-db-cli-status-');
  out = captureOutput();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-09T03:00:00.000Z'));
  stubEgov({});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  env.restore();
});

function insertLaw(db: DatabaseT.Database, lawId: string, revision: string): void {
  db.prepare(
    `INSERT INTO laws (law_revision_id, law_id, law_type, law_num, law_title,
      promulgation_date, current_revision_status, repeal_status, updated, fetched_at, content_hash)
     VALUES (?, ?, 'Act', 'n', 't', '2020-01-01', 'CurrentEnforced', 'None', 'u', 'f', 'h')`
  ).run(`${lawId}_${revision}`, lawId);
}

function insertArticles(db: DatabaseT.Database, lawRevisionId: string, n: number): void {
  const ins = db.prepare(
    `INSERT INTO articles (law_revision_id, article_num, ord, body, body_raw) VALUES (?, ?, ?, 'b', 'b')`
  );
  for (let i = 1; i <= n; i++) ins.run(lawRevisionId, String(i), i);
}

function seedCurrent(
  dbPath: string,
  fill: (db: DatabaseT.Database) => void,
  sync?: { lastSyncDate: string; lastFullDlAt: string }
): void {
  const db = new Database(dbPath);
  try {
    initSchema(db);
    fill(db);
    if (sync) {
      db.prepare(
        `INSERT INTO sync_state (id, last_sync_date, last_full_dl_at, total_laws, bulk_source)
         VALUES (1, ?, ?, 1, 'all_xml')`
      ).run(sync.lastSyncDate, sync.lastFullDlAt);
    }
  } finally {
    db.close();
  }
}

async function status(dbPath: string): Promise<number> {
  process.env.HOUKI_EGOV_DB_PATH = dbPath;
  return (await runCliWith(['--status'])).exitCode;
}

describe('cli_status（差分 20261003-db-cli）', () => {
  it('SPEC-EGOV-CLI-STATUS-005 版・DB の場所・DB の場所の設定・法令の数と版の数・条の件数と同期の欄を出して exit 0、標準エラー出力は空', async () => {
    mkdirSync(join(env.root, 'x'));
    const dbPath = join(env.root, 'x', 'laws.db');
    seedCurrent(
      dbPath,
      (db) => {
        insertLaw(db, 'L1', 'A');
        insertArticles(db, 'L1_A', 2);
      },
      { lastSyncDate: '2026-05-08', lastFullDlAt: '2026-05-01T03:00:00.000Z' }
    );
    expect(await status(dbPath)).toBe(0);
    expect(lines(out.stdout)).toEqual([
      `[status] ${pkg.name} v${pkg.version}`,
      `  DB: ${dbPath}`,
      '  DB の場所の設定: HOUKI_EGOV_DB_PATH（MCP クライアントから起動したサーバーは、シェルの環境変数を受け継がないことがあります）',
      '  laws:     1 (版: 1)',
      '  articles: 2',
      '  sync:',
      '    last_sync_date:  2026-05-08',
      '    last_full_dl_at: 2026-05-01T03:00:00.000Z',
      '    days_since_sync: 1',
      '    staleness:       fresh',
      '  差分を取り込むには --sync を実行してください',
    ]);
    expect(lines(out.stderr)).toEqual([]);
  });

  it('SPEC-EGOV-CLI-STATUS-005 同じ法令の現行の版と前の版の 2 行がある DB では laws:     1 (版: 2)', async () => {
    const dbPath = join(env.root, 'laws.db');
    seedCurrent(dbPath, (db) => {
      insertLaw(db, 'L1', 'A');
      insertLaw(db, 'L1', 'B');
    });
    expect(await status(dbPath)).toBe(0);
    expect(lines(out.stdout)).toContain('  laws:     1 (版: 2)');
  });

  it('SPEC-EGOV-CLI-STATUS-005 同期の状態が無く空の DB なら 3 行目の後に 0 (版: 0)・0 と未取り込みの 1 行で exit 0', async () => {
    const dbPath = join(env.root, 'laws.db');
    seedCurrent(dbPath, () => {});
    expect(await status(dbPath)).toBe(0);
    expect(lines(out.stdout).slice(3)).toEqual([
      '  laws:     0 (版: 0)',
      '  articles: 0',
      '  sync:     (まだ bulk DL されていません — --bulk-download-everything を実行)',
    ]);
  });

  it('SPEC-EGOV-CLI-STATUS-004 HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS=60 なら outdated の警告の上限は 60 日', async () => {
    process.env.HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS = '60';
    const dbPath = join(env.root, 'laws.db');
    seedCurrent(dbPath, () => {}, {
      lastSyncDate: '2026-04-01',
      lastFullDlAt: '2026-04-01T03:00:00.000Z',
    });
    expect(await status(dbPath)).toBe(0);
    expect(lines(out.stdout)).toContain(
      `  ⚠ bulk DB が 38 日前のデータです。最新化するには \`HOUKI_EGOV_DB_PATH='${dbPath}' npx -y @shuji-bonji/houki-egov-mcp@latest --sync\` (最終同期から 60 日を超えていれば \`--bulk-download-everything\`) を実行してください`
    );
  });

  it('SPEC-EGOV-CLI-STATUS-004 環境変数が無ければ上限は 90 日、fresh と stale では警告を出さない', async () => {
    const dbPath = join(env.root, 'laws.db');
    seedCurrent(dbPath, () => {}, {
      lastSyncDate: '2026-04-01',
      lastFullDlAt: '2026-04-01T03:00:00.000Z',
    });
    expect(await status(dbPath)).toBe(0);
    expect(lines(out.stdout).some((l) => l.includes('(最終同期から 90 日を超えていれば'))).toBe(
      true
    );

    out.stdout.length = 0;
    const db2 = join(env.root, 'laws2.db');
    seedCurrent(db2, () => {}, {
      lastSyncDate: '2026-04-20',
      lastFullDlAt: '2026-04-01T03:00:00.000Z',
    });
    expect(await status(db2)).toBe(0);
    expect(lines(out.stdout).some((l) => l.includes('⚠'))).toBe(false);
  });

  for (const locale of ['en_US.UTF-8', 'de_DE.UTF-8']) {
    it(`SPEC-EGOV-CLI-STATUS-008 法令 1,234 件（版 1 つずつ）・条 5 件の DB では LANG=${locale} でも laws:     1,234 (版: 1,234)`, async () => {
      const saved = process.env.LANG;
      process.env.LANG = locale;
      try {
        const dbPath = join(env.root, `big-${locale}.db`);
        seedCurrent(dbPath, (db) => {
          const tx = db.transaction(() => {
            for (let i = 0; i < 1234; i++) insertLaw(db, `L${i}`, 'A');
          });
          tx();
          insertArticles(db, 'L0_A', 5);
        });
        expect(await status(dbPath)).toBe(0);
        const o = lines(out.stdout);
        expect(o).toContain('  laws:     1,234 (版: 1,234)');
        expect(o).toContain('  articles: 5');
      } finally {
        if (saved === undefined) delete process.env.LANG;
        else process.env.LANG = saved;
      }
    });
  }

  it('SPEC-EGOV-CLI-STATUS-010 DB が無いときは作らずに、4 行を出して exit 0', async () => {
    const dbPath = join(env.root, 'empty', 'a', 'laws.db');
    mkdirSync(join(env.root, 'empty'));
    expect(await status(dbPath)).toBe(0);
    expect(lines(out.stdout)).toEqual([
      `[status] ${pkg.name} v${pkg.version}`,
      `  DB: ${dbPath}`,
      '  DB の場所の設定: HOUKI_EGOV_DB_PATH（MCP クライアントから起動したサーバーは、シェルの環境変数を受け継がないことがあります）',
      `  (DB がまだありません — HOUKI_EGOV_DB_PATH='${dbPath}' npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything で作ります)`,
    ]);
    expect(lines(out.stderr)).toEqual([]);
    expect(existsSync(join(env.root, 'empty', 'a'))).toBe(false);
  });

  it('SPEC-EGOV-CLI-STATUS-010 版の記録が無い DB（テーブルの無い SQLite）も同じ 4 行で exit 0、テーブルを作らない', async () => {
    const dbPath = join(env.root, 'laws.db');
    new Database(dbPath).close();
    expect(await status(dbPath)).toBe(0);
    expect(lines(out.stdout)[3]).toBe(
      `  (DB がまだありません — HOUKI_EGOV_DB_PATH='${dbPath}' npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything で作ります)`
    );
    const db = new Database(dbPath, { readonly: true });
    try {
      expect(db.prepare('SELECT name FROM sqlite_master').all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('SPEC-EGOV-CLI-STATUS-011 版 2 の DB では 1〜3 行目の後に古い版のエラー（SPEC-EGOV-DB-SCHEMA-025 の文）を出して exit 1、件数は出さず DB も変わらない', async () => {
    const dbPath = join(env.root, 'laws.db');
    seedVersionedDb(dbPath, '2');
    expect(await status(dbPath)).toBe(1);
    expect(lines(out.stdout)).toEqual([
      `[status] ${pkg.name} v${pkg.version}`,
      `  DB: ${dbPath}`,
      '  DB の場所の設定: HOUKI_EGOV_DB_PATH（MCP クライアントから起動したサーバーは、シェルの環境変数を受け継がないことがあります）',
    ]);
    expect(lines(out.stderr)).toEqual([
      `[ERROR] DB の版 (2) が古いため使えません。HOUKI_EGOV_DB_PATH='${dbPath}' npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything で作り直してください（取り込んだ中身は消え、全件の zip 約 290 MB を取り直します）`,
    ]);
    const s = snapshot(dbPath);
    expect(s.schemaVersion).toBe('2');
    expect(s.laws).toBe(1);
  });

  it('SPEC-EGOV-CLI-STATUS-011 版 4 の DB では新しい版のエラーを出して exit 1', async () => {
    const dbPath = join(env.root, 'laws.db');
    seedVersionedDb(dbPath, '4');
    expect(await status(dbPath)).toBe(1);
    expect(lines(out.stderr)).toEqual([
      '[ERROR] DB の版 (4) がこの houki-egov-mcp の版 (3) より新しいため、DB を変更しません。houki-egov-mcp を新しい版に更新するか、HOUKI_EGOV_DB_PATH で別のファイルを指定してください',
    ]);
    expect(snapshot(dbPath).schemaVersion).toBe('4');
  });
});
