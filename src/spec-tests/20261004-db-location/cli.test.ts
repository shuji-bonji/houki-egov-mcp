/**
 * 差分 20261004-db-location の受入テスト: CLI（--status・--sync・--bulk-download-by-date）
 *
 * 期待値の正本は specs/changes/20261004-db-location/specs/{cli_status,cli_sync,cli_bulk_download,db_schema}/spec.md。
 * - ADDED: SPEC-EGOV-CLI-STATUS-013（3 行目の DB の場所の設定）・014（同じフォルダーの別の laws*.db の [WARN]）
 * - MODIFIED: SPEC-EGOV-CLI-STATUS-004・005・006・009・010・011・012、SPEC-EGOV-CLI-SYNC-019・021、
 *   SPEC-EGOV-CLI-BULK-DOWNLOAD-030
 * - SPEC-EGOV-DB-SCHEMA-028 の --status の例（相対パスの HOUKI_EGOV_DB_PATH）
 *
 * DB の場所は環境変数（HOUKI_EGOV_DB_PATH・XDG_CACHE_HOME・HOME）で決め、HOME は一時ディレクトリの下にする。
 * 今日（日本時間）は vi.useFakeTimers({ toFake: ['Date'] }) で固定する。
 */

import { existsSync, mkdirSync, truncateSync, utimesSync, writeFileSync } from 'node:fs';
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
  stubEgov,
  type TestEnv,
} from '../../test-helpers/cli-db-harness.js';
import {
  insertRevision,
  REVS_20261005,
  seedDb,
} from '../../test-helpers/redistributed-revisions-cli.js';

const require = createRequire(import.meta.url);
const pkg = require('../../../package.json') as { name: string; version: string };
const LINE1 = `[status] ${pkg.name} v${pkg.version}`;
const NPX = 'npx -y @shuji-bonji/houki-egov-mcp@latest';
const BY_ENV =
  '（MCP クライアントから起動したサーバーは、シェルの環境変数を受け継がないことがあります）';
const SETTING_DEFAULT = '  DB の場所の設定: 既定';
const SETTING_HOUKI = `  DB の場所の設定: HOUKI_EGOV_DB_PATH${BY_ENV}`;
const SETTING_XDG = `  DB の場所の設定: XDG_CACHE_HOME${BY_ENV}`;
const WARN_HEAD = '[WARN] 同じフォルダーに、この DB のほかに laws*.db のファイルがあります: ';
const WARN_TAIL = '。MCP サーバーと CLI が別のファイルを開いていないか確かめてください';

let env: TestEnv;
let out: Output;
let home: string;
let cacheDir: string;

beforeEach(() => {
  env = setupEnv('td-db-location-cli-');
  home = join(env.root, 'home');
  cacheDir = join(home, '.cache', 'houki-egov-mcp');
  out = captureOutput();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-09T03:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  env.restore();
});

/** 版 3 の DB を作る。fill で行を足し、sync があれば同期の状態を書く */
function seedCurrent(
  dbPath: string,
  fill: (db: DatabaseT.Database) => void = () => {},
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

/** 法令 1 件（版 1 つ）と条 2 件 */
function oneLawTwoArticles(db: DatabaseT.Database): void {
  db.prepare(
    `INSERT INTO laws (law_revision_id, law_id, law_type, law_num, law_title,
      promulgation_date, current_revision_status, repeal_status, updated, fetched_at, content_hash)
     VALUES ('L1_A', 'L1', 'Act', 'n', 't', '2020-01-01', 'CurrentEnforced', 'None', 'u', 'f', 'h')`
  ).run();
  const ins = db.prepare(
    `INSERT INTO articles (law_revision_id, article_num, ord, body, body_raw)
     VALUES ('L1_A', ?, ?, '本文', '本文')`
  );
  ins.run('1', 1);
  ins.run('2', 2);
}

/** 大きさと最終更新（実行した環境の時刻）を決めてファイルを作る */
function makeFile(path: string, bytes: number, local = new Date(2026, 9, 4, 12, 0, 0)): void {
  writeFileSync(path, '');
  truncateSync(path, bytes);
  utimesSync(path, local, local);
}

async function status(): Promise<number> {
  return (await runCliWith(['--status'])).exitCode;
}

describe('SPEC-EGOV-CLI-STATUS-013 3 行目に DB の場所の設定を出す', () => {
  it('SPEC-EGOV-CLI-STATUS-013 環境変数なしでは 1〜3 行目が [status] …・  DB: <パス>・  DB の場所の設定: 既定', async () => {
    mkdirSync(cacheDir, { recursive: true });
    seedCurrent(join(cacheDir, 'laws.db'));
    expect(await status()).toBe(0);
    expect(lines(out.stdout).slice(0, 3)).toEqual([
      LINE1,
      `  DB: ${join(cacheDir, 'laws.db')}`,
      SETTING_DEFAULT,
    ]);
  });

  it('SPEC-EGOV-CLI-STATUS-013 HOUKI_EGOV_DB_PATH・XDG_CACHE_HOME では環境変数の注意を付ける', async () => {
    process.env.HOUKI_EGOV_DB_PATH = join(env.root, 'x', 'laws.db');
    expect(await status()).toBe(0);
    expect(lines(out.stdout)[2]).toBe(SETTING_HOUKI);

    out.stdout.length = 0;
    delete process.env.HOUKI_EGOV_DB_PATH;
    process.env.XDG_CACHE_HOME = join(env.root, 'xdg');
    expect(await status()).toBe(0);
    expect(lines(out.stdout)[1]).toBe(
      `  DB: ${join(env.root, 'xdg', 'houki-egov-mcp', 'laws.db')}`
    );
    expect(lines(out.stdout)[2]).toBe(SETTING_XDG);
  });

  it('SPEC-EGOV-CLI-STATUS-013 DB の状態（無い・開けない・版が違う）によらず 3 行目を出す', async () => {
    const dir = join(env.root, 'd');
    mkdirSync(dir);
    process.env.HOUKI_EGOV_DB_PATH = dir;
    expect(await status()).toBe(1);
    expect(lines(out.stdout)[2]).toBe(SETTING_HOUKI);

    out.stdout.length = 0;
    const old = join(env.root, 'old.db');
    seedVersionedDb(old, '2');
    process.env.HOUKI_EGOV_DB_PATH = old;
    expect(await status()).toBe(1);
    expect(lines(out.stdout)[2]).toBe(SETTING_HOUKI);
  });

  it('SPEC-EGOV-DB-SCHEMA-028 相対パスの HOUKI_EGOV_DB_PATH では 2 行目は値のまま、3 行目は HOUKI_EGOV_DB_PATH', async () => {
    process.env.HOUKI_EGOV_DB_PATH = 'dev/laws.db';
    vi.spyOn(process, 'cwd').mockReturnValue(join(env.root, 'work'));
    expect(await status()).toBe(0);
    expect(lines(out.stdout).slice(1, 3)).toEqual(['  DB: dev/laws.db', SETTING_HOUKI]);
  });
});

describe('SPEC-EGOV-CLI-STATUS-014 同じフォルダーの別の laws*.db の [WARN]', () => {
  it('SPEC-EGOV-CLI-STATUS-014 例: laws.v3.db (2.0 KB, 2026-10-04 12:00) を挙げた [WARN] を 3 行目の次に出す', async () => {
    mkdirSync(join(cacheDir, 'files'), { recursive: true });
    seedCurrent(join(cacheDir, 'laws.db'), oneLawTwoArticles, {
      lastSyncDate: '2026-05-08',
      lastFullDlAt: '2026-05-01T03:00:00.000Z',
    });
    makeFile(join(cacheDir, 'laws.v3.db'), 2048);
    expect(await status()).toBe(0);
    const stdout = lines(out.stdout);
    expect(stdout.slice(2, 5)).toEqual([
      SETTING_DEFAULT,
      `${WARN_HEAD}laws.v3.db (2.0 KB, 2026-10-04 12:00)${WARN_TAIL}`,
      '  laws:     1 (版: 1)',
    ]);
    expect(lines(out.stderr)).toEqual([]);
  });

  it('SPEC-EGOV-CLI-STATUS-014 名前の順に並べ、フォルダー・-wal・-shm・laws で始まらないもの・.db で終わらないものは数えず、退避したファイルは数える', async () => {
    mkdirSync(join(cacheDir, 'files'), { recursive: true });
    mkdirSync(join(cacheDir, 'laws.dir.db'));
    makeFile(join(cacheDir, 'laws.v3.db'), 2048);
    makeFile(join(cacheDir, 'laws.db'), 100);
    makeFile(join(cacheDir, 'laws.v2.bak.db'), 1.5 * 1024 * 1024);
    makeFile(join(cacheDir, 'laws.db-wal'), 10);
    makeFile(join(cacheDir, 'laws.db-shm'), 10);
    makeFile(join(cacheDir, 'other.db'), 10);
    makeFile(join(cacheDir, 'laws'), 10);
    process.env.HOUKI_EGOV_DB_PATH = join(cacheDir, 'laws.none.db');
    expect(await status()).toBe(0);
    expect(lines(out.stdout)[3]).toBe(
      `${WARN_HEAD}laws.db (100 B, 2026-10-04 12:00), laws.v2.bak.db (1.5 MB, 2026-10-04 12:00), laws.v3.db (2.0 KB, 2026-10-04 12:00)${WARN_TAIL}`
    );
  });

  it('SPEC-EGOV-CLI-STATUS-014 1 GiB 以上は小数 2 桁の GB', async () => {
    mkdirSync(cacheDir, { recursive: true });
    makeFile(join(cacheDir, 'laws.v3.db'), 1.5 * 1024 * 1024 * 1024);
    expect(await status()).toBe(0);
    expect(lines(out.stdout)[3]).toBe(
      `${WARN_HEAD}laws.v3.db (1.50 GB, 2026-10-04 12:00)${WARN_TAIL}`
    );
  });

  it('SPEC-EGOV-CLI-STATUS-014 例: HOUKI_EGOV_DB_PATH が無い laws.v3.db を指し、同じフォルダーに laws.db があるときは (DB がまだありません — …) の前に [WARN] を出して exit 0', async () => {
    mkdirSync(cacheDir, { recursive: true });
    seedCurrent(join(cacheDir, 'laws.db'));
    makeFile(join(cacheDir, 'laws.db'), 4096);
    const target = join(cacheDir, 'laws.v3.db');
    process.env.HOUKI_EGOV_DB_PATH = target;
    expect(await status()).toBe(0);
    expect(lines(out.stdout)).toEqual([
      LINE1,
      `  DB: ${target}`,
      SETTING_HOUKI,
      `${WARN_HEAD}laws.db (4.0 KB, 2026-10-04 12:00)${WARN_TAIL}`,
      `  (DB がまだありません — HOUKI_EGOV_DB_PATH="$HOME/.cache/houki-egov-mcp/laws.v3.db" ${NPX} --bulk-download-everything で作ります)`,
    ]);
    expect(lines(out.stderr)).toEqual([]);
    expect(existsSync(target)).toBe(false);
  });

  it('SPEC-EGOV-CLI-STATUS-014 laws.db だけのフォルダーと、フォルダーが無いときは出さない', async () => {
    mkdirSync(cacheDir, { recursive: true });
    seedCurrent(join(cacheDir, 'laws.db'));
    expect(await status()).toBe(0);
    expect(lines(out.stdout).some((l) => l.startsWith('[WARN]'))).toBe(false);

    out.stdout.length = 0;
    process.env.HOUKI_EGOV_DB_PATH = join(env.root, 'none', 'laws.db');
    expect(await status()).toBe(0);
    expect(lines(out.stdout).some((l) => l.startsWith('[WARN]'))).toBe(false);
    expect(lines(out.stderr)).toEqual([]);
  });

  it('SPEC-EGOV-CLI-STATUS-014 開けないとき・版が違うとき・同期の記録を読めないときも 3 行目の次に出し、終了コードは変えない', async () => {
    const f = join(env.root, 'f');
    mkdirSync(join(f, 'laws.db'), { recursive: true });
    makeFile(join(f, 'laws.old.db'), 10);
    process.env.HOUKI_EGOV_DB_PATH = join(f, 'laws.db');
    expect(await status()).toBe(1);
    expect(lines(out.stdout)).toEqual([
      LINE1,
      `  DB: ${join(f, 'laws.db')}`,
      SETTING_HOUKI,
      `${WARN_HEAD}laws.old.db (10 B, 2026-10-04 12:00)${WARN_TAIL}`,
    ]);
    expect(lines(out.stderr)[0]).toMatch(/^\[ERROR\] DB を開けません: /);

    out.stdout.length = 0;
    out.stderr.length = 0;
    const g = join(env.root, 'g');
    mkdirSync(g);
    seedVersionedDb(join(g, 'laws.db'), '2');
    makeFile(join(g, 'laws.bak.db'), 10);
    process.env.HOUKI_EGOV_DB_PATH = join(g, 'laws.db');
    expect(await status()).toBe(1);
    expect(lines(out.stdout)[3]).toBe(
      `${WARN_HEAD}laws.bak.db (10 B, 2026-10-04 12:00)${WARN_TAIL}`
    );
    expect(lines(out.stdout)).toHaveLength(4);

    out.stdout.length = 0;
    out.stderr.length = 0;
    const h = join(env.root, 'h');
    mkdirSync(h);
    seedCurrent(join(h, 'laws.db'), () => {}, {
      lastSyncDate: '2026/05/08',
      lastFullDlAt: '2026-05-01T03:00:00.000Z',
    });
    makeFile(join(h, 'laws.bak.db'), 10);
    process.env.HOUKI_EGOV_DB_PATH = join(h, 'laws.db');
    expect(await status()).toBe(1);
    expect(lines(out.stdout).slice(3, 5)).toEqual([
      `${WARN_HEAD}laws.bak.db (10 B, 2026-10-04 12:00)${WARN_TAIL}`,
      '  laws:     0 (版: 0)',
    ]);
  });
});

describe('cli_status の MODIFIED（差分 20261004-db-location）', () => {
  it('SPEC-EGOV-CLI-STATUS-004 環境変数なしの outdated の警告のコマンドは npx の形の --sync', async () => {
    mkdirSync(cacheDir, { recursive: true });
    seedCurrent(join(cacheDir, 'laws.db'), () => {}, {
      lastSyncDate: '2026-04-01',
      lastFullDlAt: '2026-04-01T03:00:00.000Z',
    });
    expect(await status()).toBe(0);
    expect(lines(out.stdout)).toContain(
      `  ⚠ bulk DB が 38 日前のデータです。最新化するには \`${NPX} --sync\` (最終同期から 90 日を超えていれば \`--bulk-download-everything\`) を実行してください`
    );
  });

  it('SPEC-EGOV-CLI-STATUS-004 HOUKI_EGOV_DB_PATH で実行したときは警告のコマンドに同じ変数を付ける', async () => {
    process.env.HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS = '60';
    const dbPath = join(env.root, 'laws.db');
    seedCurrent(dbPath, () => {}, {
      lastSyncDate: '2026-04-01',
      lastFullDlAt: '2026-04-01T03:00:00.000Z',
    });
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    expect(await status()).toBe(0);
    expect(lines(out.stdout)).toContain(
      `  ⚠ bulk DB が 38 日前のデータです。最新化するには \`HOUKI_EGOV_DB_PATH='${dbPath}' ${NPX} --sync\` (最終同期から 60 日を超えていれば \`--bulk-download-everything\`) を実行してください`
    );
  });

  it('SPEC-EGOV-CLI-STATUS-005 例: 版・DB の場所・DB の場所の設定・件数と同期の欄を出して exit 0、標準エラー出力は空', async () => {
    mkdirSync(join(env.root, 'x'));
    const dbPath = join(env.root, 'x', 'laws.db');
    seedCurrent(dbPath, oneLawTwoArticles, {
      lastSyncDate: '2026-05-08',
      lastFullDlAt: '2026-05-01T03:00:00.000Z',
    });
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    expect(await status()).toBe(0);
    expect(lines(out.stdout)).toEqual([
      LINE1,
      `  DB: ${dbPath}`,
      SETTING_HOUKI,
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

  it('SPEC-EGOV-CLI-STATUS-005 同期の状態が無く空の DB は 3 行目の後に laws・articles と未取り込みの 1 行（フラグだけの文は変えない）', async () => {
    mkdirSync(cacheDir, { recursive: true });
    seedCurrent(join(cacheDir, 'laws.db'));
    expect(await status()).toBe(0);
    expect(lines(out.stdout).slice(2)).toEqual([
      SETTING_DEFAULT,
      '  laws:     0 (版: 0)',
      '  articles: 0',
      '  sync:     (まだ bulk DL されていません — --bulk-download-everything を実行)',
    ]);
  });

  it('SPEC-EGOV-CLI-STATUS-006 開けない DB では 1〜3 行目の後に [ERROR] DB を開けません で exit 1', async () => {
    const dir = join(env.root, 'd');
    mkdirSync(dir);
    process.env.HOUKI_EGOV_DB_PATH = dir;
    expect(await status()).toBe(1);
    expect(lines(out.stdout)).toEqual([LINE1, `  DB: ${dir}`, SETTING_HOUKI]);
    expect(lines(out.stderr)).toHaveLength(1);
    expect(lines(out.stderr)[0]).toMatch(/^\[ERROR\] DB を開けません: /);
  });

  it('SPEC-EGOV-CLI-STATUS-009 同期の記録を読めない DB では 1〜6 行目の後に、npx の形のコマンドの [ERROR] で exit 1', async () => {
    mkdirSync(cacheDir, { recursive: true });
    seedCurrent(join(cacheDir, 'laws.db'), oneLawTwoArticles, {
      lastSyncDate: '2026/05/08',
      lastFullDlAt: '2026-05-01T03:00:00.000Z',
    });
    expect(await status()).toBe(1);
    expect(lines(out.stdout)).toEqual([
      LINE1,
      `  DB: ${join(cacheDir, 'laws.db')}`,
      SETTING_DEFAULT,
      '  laws:     1 (版: 1)',
      '  articles: 2',
    ]);
    expect(lines(out.stderr)).toEqual([
      `[ERROR] 同期の記録を読めません: 2026/05/08（${NPX} --bulk-download-everything で作り直してください）`,
    ]);
  });

  it('SPEC-EGOV-CLI-STATUS-010 例: <空のフォルダー>/a/laws.db では 4 行を出して exit 0、フォルダーを作らない', async () => {
    mkdirSync(join(env.root, 'empty'));
    const dbPath = join(env.root, 'empty', 'a', 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    expect(await status()).toBe(0);
    expect(lines(out.stdout)).toEqual([
      LINE1,
      `  DB: ${dbPath}`,
      SETTING_HOUKI,
      `  (DB がまだありません — HOUKI_EGOV_DB_PATH='${dbPath}' ${NPX} --bulk-download-everything で作ります)`,
    ]);
    expect(lines(out.stderr)).toEqual([]);
    expect(existsSync(join(env.root, 'empty', 'a'))).toBe(false);
  });

  it('SPEC-EGOV-CLI-STATUS-010 環境変数なしで版の記録が無い DB では、既定の場所の案内のコマンドで exit 0', async () => {
    mkdirSync(cacheDir, { recursive: true });
    new Database(join(cacheDir, 'laws.db')).close();
    expect(await status()).toBe(0);
    expect(lines(out.stdout)).toEqual([
      LINE1,
      `  DB: ${join(cacheDir, 'laws.db')}`,
      SETTING_DEFAULT,
      `  (DB がまだありません — ${NPX} --bulk-download-everything で作ります)`,
    ]);
  });

  it('SPEC-EGOV-CLI-STATUS-011 例: 環境変数なしで版 2 の DB では 1〜3 行目の後に古い版のエラーで exit 1、DB は変わらない', async () => {
    mkdirSync(cacheDir, { recursive: true });
    const dbPath = join(cacheDir, 'laws.db');
    seedVersionedDb(dbPath, '2');
    expect(await status()).toBe(1);
    expect(lines(out.stdout)).toEqual([LINE1, `  DB: ${dbPath}`, SETTING_DEFAULT]);
    expect(lines(out.stderr)).toEqual([
      `[ERROR] DB の版 (2) が古いため使えません。${NPX} --bulk-download-everything で作り直してください（取り込んだ中身は消え、全件の zip 約 290 MB を取り直します）`,
    ]);
  });

  it('SPEC-EGOV-CLI-STATUS-012 例: 環境変数なしでは [WARN] のコマンドが npx の形', async () => {
    vi.setSystemTime(new Date('2026-10-07T03:00:00.000Z'));
    await seedDb(join(cacheDir, 'laws.db'), {
      fill: (db) => {
        for (const rev of REVS_20261005) insertRevision(db, rev, 'UnEnforced', '2026-10-05');
      },
      lastSyncDate: '2026-10-06',
    });
    expect(await status()).toBe(0);
    expect(lines(out.stdout).at(-1)).toBe(
      `[WARN] 施行日が last_sync_date (2026-10-06) より前なのに未施行 (UnEnforced) のままの版が 5 件あります。${NPX} --bulk-download-everything を 1 回実行すると直ります（全件の zip 約 290 MB を取得します。条の本文は入れ直しません）`
    );
  });
});

describe('cli_sync・cli_bulk_download の MODIFIED（差分 20261004-db-location）', () => {
  it('SPEC-EGOV-CLI-SYNC-019 例: 環境変数なしで版 2 の DB に --sync を実行すると、2 行の後に npx の形のコマンドの古い版のエラーで exit 1', async () => {
    mkdirSync(cacheDir, { recursive: true });
    const dbPath = join(cacheDir, 'laws.db');
    seedVersionedDb(dbPath, '2');
    const egov = stubEgov({ head: 200, days: {} });
    expect((await runCliWith(['--sync'])).exitCode).toBe(1);
    expect(lines(out.stderr)).toEqual([
      '[sync] 差分同期',
      `  DB: ${dbPath}`,
      `[ERROR] DB の版 (2) が古いため使えません。${NPX} --bulk-download-everything で作り直してください（取り込んだ中身は消え、全件の zip 約 290 MB を取り直します）`,
    ]);
    expect(egov.fn).not.toHaveBeenCalled();
  });

  it('SPEC-EGOV-CLI-SYNC-019 フラグだけを書いた文（同期の状態が無いとき）は変えない', async () => {
    mkdirSync(cacheDir, { recursive: true });
    seedCurrent(join(cacheDir, 'laws.db'));
    stubEgov({ head: 200, days: {} });
    expect((await runCliWith(['--sync'])).exitCode).toBe(1);
    expect(lines(out.stderr).at(-1)).toBe(
      '[sync] まだ全件取り込みが行われていません。先に --bulk-download-everything を実行してください'
    );
  });

  async function syncOverdue(dbPath: string): Promise<string[]> {
    vi.setSystemTime(new Date('2026-10-07T03:00:00.000Z'));
    await seedDb(dbPath, {
      fill: (db) => {
        for (const rev of REVS_20261005) insertRevision(db, rev, 'UnEnforced', '2026-10-05');
      },
      lastSyncDate: '2026-10-06',
    });
    const http500 = { status: 500, statusText: 'Internal Server Error' };
    stubEgov({ days: { '20261006': http500, '20261007': http500 } });
    expect((await runCliWith(['--sync'])).exitCode).toBe(0);
    return lines(out.stderr);
  }

  it('SPEC-EGOV-CLI-SYNC-021 例: 環境変数なしでは [WARN] のコマンドが npx の形', async () => {
    const err = await syncOverdue(join(cacheDir, 'laws.db'));
    expect(err.at(-1)).toBe(
      `[WARN] 施行日が last_sync_date (2026-10-07) より前なのに未施行 (UnEnforced) のままの版が 5 件あります。${NPX} --bulk-download-everything を 1 回実行すると直ります（全件の zip 約 290 MB を取得します。条の本文は入れ直しません）`
    );
  });

  it('SPEC-EGOV-CLI-SYNC-021 例: HOUKI_EGOV_DB_PATH=~/.cache/houki-egov-mcp/laws.dev.db では "$HOME/…" を付ける', async () => {
    const dbPath = join(cacheDir, 'laws.dev.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    const err = await syncOverdue(dbPath);
    expect(err.at(-1)).toBe(
      `[WARN] 施行日が last_sync_date (2026-10-07) より前なのに未施行 (UnEnforced) のままの版が 5 件あります。HOUKI_EGOV_DB_PATH="$HOME/.cache/houki-egov-mcp/laws.dev.db" ${NPX} --bulk-download-everything を 1 回実行すると直ります（全件の zip 約 290 MB を取得します。条の本文は入れ直しません）`
    );
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-030 例: 環境変数なしで DB ファイルの無い場所では npx の形のコマンドで exit 1、ファイルもフォルダーもできない', async () => {
    const egov = stubEgov({ head: 200, days: {} });
    expect((await runCliWith(['--bulk-download-by-date', '20260917'])).exitCode).toBe(1);
    expect(lines(out.stderr).at(-1)).toBe(
      `[ERROR] DB がまだありません。先に ${NPX} --bulk-download-everything を実行してください`
    );
    expect(existsSync(cacheDir)).toBe(false);
    expect(egov.fn).not.toHaveBeenCalled();
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-030 HOUKI_EGOV_DB_PATH で実行したときはコマンドに同じ変数を付ける', async () => {
    const dbPath = join(env.root, 'none', 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    stubEgov({ head: 200, days: {} });
    expect((await runCliWith(['--bulk-download-by-date', '20260917'])).exitCode).toBe(1);
    expect(lines(out.stderr).at(-1)).toBe(
      `[ERROR] DB がまだありません。先に HOUKI_EGOV_DB_PATH='${dbPath}' ${NPX} --bulk-download-everything を実行してください`
    );
  });
});
