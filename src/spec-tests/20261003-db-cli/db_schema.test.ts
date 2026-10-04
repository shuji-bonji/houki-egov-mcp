/**
 * 差分 20261003-db-cli の受入テスト: db_schema
 *
 * 期待値の正本は specs/changes/20261003-db-cli/specs/db_schema/spec.md。
 * DB を作る入口は --bulk-download-everything だけなので、作る・作り直す場面は CLI を動かして確かめる。
 * e-Gov への通信は差し替え、DB は一時ディレクトリの下だけに作る。
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  withDb,
  ZIP_YOKIN,
} from '../../test-helpers/cli-db-harness.js';

let env: TestEnv;
let out: Output;

beforeEach(() => {
  env = setupEnv('td-db-cli-schema-');
  out = captureOutput();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  env.restore();
});

async function bulkEverything(): Promise<number> {
  return (await runCliWith(['--bulk-download-everything'])).exitCode;
}

function columns(dbPath: string, table: string) {
  return withDb(
    dbPath,
    (db) =>
      db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
        name: string;
        notnull: number;
        pk: number;
      }>
  );
}

describe('DB を作る（--bulk-download-everything）', () => {
  it('SPEC-EGOV-DB-SCHEMA-001 新しい DB を作ると schema_meta に schema_version = 3 の 1 行を記録する', async () => {
    const dbPath = join(env.root, 'db', 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    stubEgov({ full: ZIP_YOKIN });
    expect(await bulkEverything()).toBe(0);
    withDb(dbPath, (db) => {
      expect(db.prepare('SELECT key, value FROM schema_meta').all()).toEqual([
        { key: 'schema_version', value: '3' },
      ]);
    });
  });

  it('SPEC-EGOV-DB-SCHEMA-011 版 3 の DB を CLI と search_fulltext で何度開いても、テーブルは残り版は 3 のまま', async () => {
    const dbPath = join(env.root, 'db', 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    stubEgov({ full: ZIP_YOKIN, head: 200, days: {} });
    expect(await bulkEverything()).toBe(0);
    expect(await bulkEverything()).toBe(0);
    expect((await runCliWith(['--status'])).exitCode).toBe(0);
    expect((await runCliWith(['--status'])).exitCode).toBe(0);
    vi.resetModules();
    const { handleSearchFulltext } = await import('../../tools/handlers.js');
    for (let i = 0; i < 2; i++) {
      const r = (await handleSearchFulltext({ keyword: '預金者等の保護' }, { dbPath })) as {
        source: string;
      };
      expect(r.source).toBe('bulk');
    }
    const s = snapshot(dbPath);
    expect(s.schemaVersion).toBe('3');
    expect(s.laws).toBe(1);
    expect(s.articles).toBe(2);
  });
});

describe('DB の置き場所', () => {
  it('SPEC-EGOV-DB-SCHEMA-012 HOUKI_EGOV_DB_PATH があれば XDG_CACHE_HOME より優先して、その場所に DB を作る', async () => {
    const dbPath = join(env.root, 'a', 'b', 'x.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    process.env.XDG_CACHE_HOME = join(env.root, 'xdg');
    stubEgov({ full: ZIP_YOKIN });
    expect(await bulkEverything()).toBe(0);
    expect(existsSync(dbPath)).toBe(true);
    expect(existsSync(join(env.root, 'xdg', 'houki-egov-mcp', 'laws.db'))).toBe(false);
  });

  it('SPEC-EGOV-DB-SCHEMA-013 HOUKI_EGOV_DB_PATH が空文字なら $XDG_CACHE_HOME/houki-egov-mcp/laws.db に作る', async () => {
    process.env.HOUKI_EGOV_DB_PATH = '';
    process.env.XDG_CACHE_HOME = join(env.root, 'xdg');
    stubEgov({ full: ZIP_YOKIN });
    expect(await bulkEverything()).toBe(0);
    expect(existsSync(join(env.root, 'xdg', 'houki-egov-mcp', 'laws.db'))).toBe(true);
  });

  it('SPEC-EGOV-DB-SCHEMA-014 2 つとも空文字なら ~/.cache/houki-egov-mcp/laws.db に作り、--status の DB: の行もその場所', async () => {
    process.env.HOME = env.root;
    process.env.HOUKI_EGOV_DB_PATH = '';
    process.env.XDG_CACHE_HOME = '';
    stubEgov({ full: ZIP_YOKIN });
    expect(await bulkEverything()).toBe(0);
    const expected = join(env.root, '.cache', 'houki-egov-mcp', 'laws.db');
    expect(existsSync(expected)).toBe(true);
    out.stdout.length = 0;
    expect((await runCliWith(['--status'])).exitCode).toBe(0);
    expect(lines(out.stdout)).toContain(`  DB: ${expected}`);
  });

  it('SPEC-EGOV-DB-SCHEMA-014 2 つの環境変数を消したときも ~/.cache/houki-egov-mcp/laws.db に作る', async () => {
    process.env.HOME = env.root;
    stubEgov({ full: ZIP_YOKIN });
    expect(await bulkEverything()).toBe(0);
    expect(existsSync(join(env.root, '.cache', 'houki-egov-mcp', 'laws.db'))).toBe(true);
  });

  it('SPEC-EGOV-DB-SCHEMA-015 --bulk-download-everything は無いフォルダーを途中も含めて作る', async () => {
    const dbPath = join(env.root, 'a', 'b', 'x.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    expect(existsSync(join(env.root, 'a'))).toBe(false);
    stubEgov({ full: ZIP_YOKIN });
    expect(await bulkEverything()).toBe(0);
    expect(existsSync(join(env.root, 'a', 'b'))).toBe(true);
    expect(existsSync(dbPath)).toBe(true);
  });

  it('SPEC-EGOV-DB-SCHEMA-015 --status・--sync・search_fulltext はフォルダーも DB も作らない', async () => {
    const dbPath = join(env.root, 'a', 'b', 'x.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    stubEgov({ head: 200, days: {} });
    expect((await runCliWith(['--status'])).exitCode).toBe(0);
    expect(existsSync(join(env.root, 'a'))).toBe(false);
    expect((await runCliWith(['--sync'])).exitCode).toBe(1);
    expect(existsSync(join(env.root, 'a'))).toBe(false);
    vi.resetModules();
    const { handleSearchFulltext } = await import('../../tools/handlers.js');
    await handleSearchFulltext({ keyword: '' });
    expect(existsSync(join(env.root, 'a'))).toBe(false);
  });
});

describe('版 1・2 の DB の作り直し', () => {
  it('SPEC-EGOV-DB-SCHEMA-016 版 2 の DB は取得に成功した後で作り直し、zip の中身だけになる', async () => {
    const dbPath = join(env.root, 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    seedVersionedDb(dbPath, '2');
    stubEgov({ full: ZIP_YOKIN });
    expect(await bulkEverything()).toBe(0);
    withDb(dbPath, (db) => {
      expect(db.prepare('SELECT key, value FROM schema_meta').all()).toEqual([
        { key: 'schema_version', value: '3' },
      ]);
      expect(db.prepare('SELECT law_id FROM laws').all()).toEqual([{ law_id: '346AC0000000034' }]);
    });
    const s = snapshot(dbPath);
    expect(s.articles).toBe(2);
    expect(columns(dbPath, 'sync_state').map((c) => c.name)).toEqual([
      'id',
      'last_sync_date',
      'last_full_dl_at',
      'total_laws',
      'bulk_source',
    ]);
  });

  it('SPEC-EGOV-DB-SCHEMA-016 版 1 の DB も作り直す', async () => {
    const dbPath = join(env.root, 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    seedVersionedDb(dbPath, '1');
    stubEgov({ full: ZIP_YOKIN });
    expect(await bulkEverything()).toBe(0);
    const s = snapshot(dbPath);
    expect(s.schemaVersion).toBe('3');
    expect(s.laws).toBe(1);
  });

  it('SPEC-EGOV-DB-SCHEMA-016 取得に HTTP 503 が返って exit 1 のときは、版 2 のまま中身も残す', async () => {
    const dbPath = join(env.root, 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    process.env.HOUKI_EGOV_BULK_RETRY = '1';
    seedVersionedDb(dbPath, '2');
    stubEgov({ full: { status: 503, statusText: 'Service Unavailable' } });
    expect(await bulkEverything()).toBe(1);
    const s = snapshot(dbPath);
    expect(s.schemaVersion).toBe('2');
    expect(s.laws).toBe(1);
    expect(s.articles).toBe(2);
    expect(s.syncState).toHaveLength(1);
  });

  it('SPEC-EGOV-DB-SCHEMA-017 作り直した DB は 7 つのテーブルを持ち、articles に入れた条を articles_fts で引ける', async () => {
    const dbPath = join(env.root, 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    seedVersionedDb(dbPath, '2');
    stubEgov({ full: ZIP_YOKIN });
    expect(await bulkEverything()).toBe(0);
    const db = new Database(dbPath);
    try {
      const names = new Set(
        (
          db
            .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')")
            .all() as Array<{
            name: string;
          }>
        ).map((r) => r.name)
      );
      for (const t of [
        'schema_meta',
        'laws',
        'articles',
        'revisions_meta',
        'sync_state',
        'laws_fts',
        'articles_fts',
      ]) {
        expect(names.has(t), t).toBe(true);
      }
      db.prepare(
        `INSERT INTO articles (law_revision_id, article_num, ord, body, body_raw)
         VALUES ('346AC0000000034_19710401_000000000000000', '99', 99, ?, ?)`
      ).run('再作成後の本文QWERTY', '再作成後の本文QWERTY');
      expect(
        (
          db
            .prepare("SELECT count(*) AS c FROM articles_fts WHERE articles_fts MATCH 'QWERTY'")
            .get() as { c: number }
        ).c
      ).toBe(1);
    } finally {
      db.close();
    }
  });
});

describe('テーブルの列', () => {
  async function freshDb(): Promise<string> {
    const dbPath = join(env.root, 'db', 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    stubEgov({ full: ZIP_YOKIN });
    expect(await bulkEverything()).toBe(0);
    return dbPath;
  }

  it('SPEC-EGOV-DB-SCHEMA-020 sync_state の列は 5 つで、schema_version の列は無い', async () => {
    const dbPath = await freshDb();
    expect(columns(dbPath, 'sync_state').map((c) => c.name)).toEqual([
      'id',
      'last_sync_date',
      'last_full_dl_at',
      'total_laws',
      'bulk_source',
    ]);
  });

  it('SPEC-EGOV-DB-SCHEMA-026 laws.law_revision_id は notnull 1・pk 1 で、NULL の INSERT はエラー', async () => {
    const dbPath = await freshDb();
    const col = columns(dbPath, 'laws').find((c) => c.name === 'law_revision_id');
    expect(col?.notnull).toBe(1);
    expect(col?.pk).toBe(1);
    const db = new Database(dbPath);
    try {
      expect(() =>
        db
          .prepare(
            `INSERT INTO laws (law_revision_id, law_id, law_type, law_num, law_title,
              current_revision_status, repeal_status, updated, fetched_at, content_hash)
             VALUES (NULL, 'X', 'Act', 'n', 't', 'CurrentEnforced', 'None', 'u', 'f', 'h')`
          )
          .run()
      ).toThrow('NOT NULL constraint failed: laws.law_revision_id');
    } finally {
      db.close();
    }
  });

  it('SPEC-EGOV-DB-SCHEMA-027 laws.promulgation_date は notnull 0', async () => {
    const dbPath = await freshDb();
    expect(columns(dbPath, 'laws').find((c) => c.name === 'promulgation_date')?.notnull).toBe(0);
  });
});

describe('DB の状態と入口ごとの扱い', () => {
  const NEW_VERSION_ERROR =
    '[ERROR] DB の版 (4) がこの houki-egov-mcp の版 (3) より新しいため、DB を変更しません。houki-egov-mcp を新しい版に更新するか、HOUKI_EGOV_DB_PATH で別のファイルを指定してください';

  it('SPEC-EGOV-DB-SCHEMA-025 版 4 の DB では --bulk-download-everything が取得せずに exit 1 で、版も行も変わらない', async () => {
    const dbPath = join(env.root, 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    seedVersionedDb(dbPath, '4');
    const egov = stubEgov({ full: ZIP_YOKIN });
    expect(await bulkEverything()).toBe(1);
    expect(egov.fn).not.toHaveBeenCalled();
    expect(lines(out.stderr)).toContain(NEW_VERSION_ERROR);
    const s = snapshot(dbPath);
    expect(s.schemaVersion).toBe('4');
    expect(s.laws).toBe(1);
  });

  it('SPEC-EGOV-DB-SCHEMA-025 版 4 の DB では --sync・--bulk-download-by-date・--status も新しい版のエラーで exit 1、DB は変わらない', async () => {
    const dbPath = join(env.root, 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    seedVersionedDb(dbPath, '4');
    const egov = stubEgov({ head: 200, days: {} });
    for (const args of [['--sync'], ['--bulk-download-by-date', '20260917'], ['--status']]) {
      out.stderr.length = 0;
      expect((await runCliWith(args)).exitCode, args.join(' ')).toBe(1);
      expect(lines(out.stderr), args.join(' ')).toContain(NEW_VERSION_ERROR);
    }
    expect(egov.fn).not.toHaveBeenCalled();
    const s = snapshot(dbPath);
    expect(s.schemaVersion).toBe('4');
    expect(s.laws).toBe(1);
    expect(s.articles).toBe(2);
  });

  it('SPEC-EGOV-DB-SCHEMA-025 版 2 の DB では --sync・--bulk-download-by-date・--status が古い版のエラーで exit 1、DB は変わらない', async () => {
    const dbPath = join(env.root, 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    seedVersionedDb(dbPath, '2');
    const egov = stubEgov({ head: 200, days: {} });
    const OLD = `[ERROR] DB の版 (2) が古いため使えません。HOUKI_EGOV_DB_PATH='${dbPath}' npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything で作り直してください（取り込んだ中身は消え、全件の zip 約 290 MB を取り直します）`;
    for (const args of [['--sync'], ['--bulk-download-by-date', '20260917'], ['--status']]) {
      out.stderr.length = 0;
      expect((await runCliWith(args)).exitCode, args.join(' ')).toBe(1);
      expect(lines(out.stderr), args.join(' ')).toContain(OLD);
    }
    expect(egov.fn).not.toHaveBeenCalled();
    const s = snapshot(dbPath);
    expect(s.schemaVersion).toBe('2');
    expect(s.laws).toBe(1);
  });

  it('SPEC-EGOV-DB-SCHEMA-025 版を読めない DB（abc）で --status は 2 行の後に読めない版のエラーで exit 1', async () => {
    const dbPath = join(env.root, 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    seedVersionedDb(dbPath, 'abc');
    expect((await runCliWith(['--status'])).exitCode).toBe(1);
    expect(lines(out.stdout)).toHaveLength(2);
    expect(lines(out.stdout)[1]).toBe(`  DB: ${dbPath}`);
    expect(lines(out.stderr)).toEqual([
      `[ERROR] DB の版を読めないため (schema_version: abc)、DB を変更しません。DB ファイル (${dbPath}) を消してから HOUKI_EGOV_DB_PATH='${dbPath}' npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything を実行してください`,
    ]);
    expect(snapshot(dbPath).schemaVersion).toBe('abc');
  });

  it('SPEC-EGOV-DB-SCHEMA-025 版が空文字の DB も読めない版として、--bulk-download-everything は取得せずに exit 1', async () => {
    const dbPath = join(env.root, 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    seedVersionedDb(dbPath, '');
    const egov = stubEgov({ full: ZIP_YOKIN });
    expect(await bulkEverything()).toBe(1);
    expect(egov.fn).not.toHaveBeenCalled();
    expect(lines(out.stderr)).toContainEqual(
      expect.stringContaining(
        '[ERROR] DB の版を読めないため (schema_version: )、DB を変更しません。'
      )
    );
    expect(snapshot(dbPath).schemaVersion).toBe('');
  });

  it('SPEC-EGOV-DB-SCHEMA-025 版を読めない DB では search_fulltext も DB を使わず、版の値も変えない', async () => {
    const dbPath = join(env.root, 'laws.db');
    seedVersionedDb(dbPath, 'abc');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ total_count: 0, laws: [] }), { status: 200 }))
    );
    vi.resetModules();
    const { handleSearchFulltext } = await import('../../tools/handlers.js');
    const r = (await handleSearchFulltext({ keyword: '古い法' }, { dbPath })) as {
      source: string;
    };
    expect(r.source).toBe('api-fallback');
    expect(snapshot(dbPath).schemaVersion).toBe('abc');
  });

  it('SPEC-EGOV-DB-SCHEMA-025 ファイルの無い場所では --status も search_fulltext もファイルを作らない', async () => {
    const dbPath = join(env.root, 'none', 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    expect((await runCliWith(['--status'])).exitCode).toBe(0);
    vi.resetModules();
    const { handleSearchFulltext } = await import('../../tools/handlers.js');
    await handleSearchFulltext({ keyword: '' }, { dbPath });
    expect(existsSync(dbPath)).toBe(false);
  });

  it('SPEC-EGOV-DB-SCHEMA-025 版の記録が無い 0 バイトのファイルは、--sync が書き込まずにファイルが無いときと同じ文で exit 1', async () => {
    const dbPath = join(env.root, 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    writeFileSync(dbPath, '');
    const egov = stubEgov({ head: 200, days: {} });
    expect((await runCliWith(['--sync'])).exitCode).toBe(1);
    expect(lines(out.stderr)).toContain(
      '[sync] まだ全件取り込みが行われていません。先に --bulk-download-everything を実行してください'
    );
    expect(egov.fn).not.toHaveBeenCalled();
    const tables = withDb(dbPath, (db) => db.prepare('SELECT name FROM sqlite_master').all());
    expect(tables).toEqual([]);
  });

  it('SPEC-EGOV-DB-SCHEMA-025 版の記録が無い 0 バイトのファイルに --bulk-download-everything はテーブルを作って版 3 を記録する', async () => {
    const dbPath = join(env.root, 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    writeFileSync(dbPath, '');
    stubEgov({ full: ZIP_YOKIN });
    expect(await bulkEverything()).toBe(0);
    const s = snapshot(dbPath);
    expect(s.schemaVersion).toBe('3');
    expect(s.laws).toBe(1);
  });

  it('SPEC-EGOV-DB-SCHEMA-025 開けない DB（SQLite でないファイル）では --bulk-download-everything は取得せずに DB を開けませんの文で exit 1', async () => {
    const dbPath = join(env.root, 'not-a-db.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    writeFileSync(dbPath, 'this is not a sqlite database file, just plain text.\n'.repeat(20));
    const egov = stubEgov({ full: ZIP_YOKIN });
    expect(await bulkEverything()).toBe(1);
    expect(egov.fn).not.toHaveBeenCalled();
    expect(lines(out.stderr)).toContain('[ERROR] DB を開けません: file is not a database');
  });

  it('SPEC-EGOV-DB-SCHEMA-025 開けない DB（パスの途中が普通のファイル）では --sync と --bulk-download-by-date が DB を開けませんの文で exit 1', async () => {
    const afile = join(env.root, 'afile');
    writeFileSync(afile, 'not a directory');
    process.env.HOUKI_EGOV_DB_PATH = join(afile, 'x.db');
    const egov = stubEgov({ head: 200, days: {} });
    for (const args of [['--sync'], ['--bulk-download-by-date', '20260917']]) {
      out.stderr.length = 0;
      expect((await runCliWith(args)).exitCode, args.join(' ')).toBe(1);
      expect(
        lines(out.stderr).some((l) => l.startsWith('[ERROR] DB を開けません: ')),
        args.join(' ')
      ).toBe(true);
    }
    expect(egov.fn).not.toHaveBeenCalled();
  });

  it('SPEC-EGOV-DB-SCHEMA-025 フォルダーを DB に指定すると --bulk-download-everything は取得せずに exit 1', async () => {
    const dbPath = join(env.root, 'a-directory');
    mkdirSync(dbPath);
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    const egov = stubEgov({ full: ZIP_YOKIN });
    expect(await bulkEverything()).toBe(1);
    expect(egov.fn).not.toHaveBeenCalled();
    expect(lines(out.stderr).some((l) => l.startsWith('[ERROR] DB を開けません: '))).toBe(true);
  });
});
