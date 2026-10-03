/**
 * 差分 20260928-untested-behaviors の受入テスト（db_schema）。
 *
 * 期待値は specs/changes/20260928-untested-behaviors/specs/db_schema/spec.md から取る。
 * DB は OS の一時ディレクトリに作り、テスト後に消す。
 * 置き場所は環境変数を import 時に読むので、環境変数を設定してから vi.resetModules() で読み直す。
 * 0.19.0 から DB を作る・作り直すのは --bulk-download-everything（openDbForFullIngest）だけなので、
 * 作る場面はその関数で確かめる（CLI を通した確認は spec-tests/20261003-db-cli/db_schema.test.ts）。
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type DatabaseT from 'better-sqlite3';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DbModule = typeof import('../../db/index.js');

const ENV_KEYS = ['HOUKI_EGOV_DB_PATH', 'XDG_CACHE_HOME', 'HOME'] as const;

let tmp: string;
let savedEnv: Record<string, string | undefined>;
const opened: DatabaseT.Database[] = [];

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

async function loadDb(): Promise<DbModule> {
  vi.resetModules();
  return import('../../db/index.js');
}

function track(db: DatabaseT.Database): DatabaseT.Database {
  opened.push(db);
  return db;
}

function insertLaw(db: DatabaseT.Database, id = 'L1_20200101_', title = '消費税法'): void {
  db.prepare(
    `INSERT INTO laws (law_revision_id, law_id, law_type, law_num, law_title,
      promulgation_date, current_revision_status, repeal_status, updated, fetched_at, content_hash)
     VALUES (?, 'L1', 'Act', '昭和六十三年法律第百八号', ?, '1988-12-30',
      'CurrentEnforced', 'None', '2020-01-01', '2020-01-01', 'h')`
  ).run(id, title);
}

function insertArticle(
  db: DatabaseT.Database,
  id: number,
  body: string,
  caption: string | null = null,
  lawRevisionId = 'L1_20200101_'
): void {
  db.prepare(
    `INSERT INTO articles (id, law_revision_id, article_num, caption, ord, body, body_raw)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, lawRevisionId, String(id), caption, id, body, body);
}

function count(db: DatabaseT.Database, sql: string): number {
  return (db.prepare(sql).get() as { c: number }).c;
}

function columns(db: DatabaseT.Database, table: string) {
  return db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; pk: number }>;
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  tmp = mkdtempSync(join(tmpdir(), 'egov-db-schema-'));
});

afterEach(() => {
  for (const db of opened.splice(0)) {
    if (db.open) db.close();
  }
  for (const k of ENV_KEYS) setEnv(k, savedEnv[k]);
  vi.resetModules();
  rmSync(tmp, { recursive: true, force: true });
});

describe('DB の置き場所', () => {
  it('SPEC-EGOV-DB-SCHEMA-012 HOUKI_EGOV_DB_PATH があれば XDG_CACHE_HOME より優先してそのパスに置く', async () => {
    const dbPath = join(tmp, 'a', 'b', 'x.db');
    setEnv('HOUKI_EGOV_DB_PATH', dbPath);
    setEnv('XDG_CACHE_HOME', join(tmp, 'xdg'));
    const { openDbForFullIngest: openDb } = await loadDb();
    track(openDb());
    expect(existsSync(dbPath)).toBe(true);
    expect(existsSync(join(tmp, 'xdg', 'houki-egov-mcp', 'laws.db'))).toBe(false);
  });

  it('SPEC-EGOV-DB-SCHEMA-013 HOUKI_EGOV_DB_PATH が空文字なら $XDG_CACHE_HOME/houki-egov-mcp/laws.db に置く', async () => {
    setEnv('HOUKI_EGOV_DB_PATH', '');
    setEnv('XDG_CACHE_HOME', join(tmp, 'xdg'));
    const { openDbForFullIngest: openDb } = await loadDb();
    track(openDb());
    expect(existsSync(join(tmp, 'xdg', 'houki-egov-mcp', 'laws.db'))).toBe(true);
  });

  it('SPEC-EGOV-DB-SCHEMA-013 HOUKI_EGOV_DB_PATH が無くても $XDG_CACHE_HOME/houki-egov-mcp/laws.db に置く', async () => {
    setEnv('HOUKI_EGOV_DB_PATH', undefined);
    setEnv('XDG_CACHE_HOME', join(tmp, 'xdg2'));
    const { openDbForFullIngest: openDb } = await loadDb();
    track(openDb());
    expect(existsSync(join(tmp, 'xdg2', 'houki-egov-mcp', 'laws.db'))).toBe(true);
  });

  it('SPEC-EGOV-DB-SCHEMA-014 SPEC-EGOV-DB-SCHEMA-015 どちらも空文字なら ~/.cache/houki-egov-mcp/laws.db に置き、.cache も作る', async () => {
    setEnv('HOME', tmp);
    setEnv('HOUKI_EGOV_DB_PATH', '');
    setEnv('XDG_CACHE_HOME', '');
    expect(existsSync(join(tmp, '.cache'))).toBe(false);
    const { openDbForFullIngest: openDb } = await loadDb();
    track(openDb());
    expect(existsSync(join(tmp, '.cache', 'houki-egov-mcp', 'laws.db'))).toBe(true);
  });

  it('SPEC-EGOV-DB-SCHEMA-014 2 つの環境変数を消したときも ~/.cache/houki-egov-mcp/laws.db に置く', async () => {
    setEnv('HOME', tmp);
    setEnv('HOUKI_EGOV_DB_PATH', undefined);
    setEnv('XDG_CACHE_HOME', undefined);
    const { openDbForFullIngest: openDb } = await loadDb();
    track(openDb());
    expect(existsSync(join(tmp, '.cache', 'houki-egov-mcp', 'laws.db'))).toBe(true);
  });

  it('SPEC-EGOV-DB-SCHEMA-015 置き場所のディレクトリが無ければ途中も含めて作る', async () => {
    const dbPath = join(tmp, 'a', 'b', 'x.db');
    expect(existsSync(join(tmp, 'a'))).toBe(false);
    setEnv('HOUKI_EGOV_DB_PATH', dbPath);
    const { openDbForFullIngest: openDb } = await loadDb();
    track(openDb());
    expect(existsSync(join(tmp, 'a', 'b'))).toBe(true);
    expect(existsSync(dbPath)).toBe(true);
  });
});

describe('スキーマの版 1 からの作り直し', () => {
  async function openV1Recreated(): Promise<DatabaseT.Database> {
    const dbPath = join(tmp, 'v1.db');
    const { openDbForFullIngest: openDb } = await loadDb();
    const first = openDb(dbPath);
    insertLaw(first);
    insertArticle(first, 1, '第一条の本文');
    insertArticle(first, 2, '第二条の本文');
    first
      .prepare(
        `INSERT INTO sync_state (id, last_sync_date, last_full_dl_at, total_laws)
         VALUES (1, '2020-01-01', '2020-01-01', 1)`
      )
      .run();
    first
      .prepare('INSERT INTO laws_fts (law_revision_id, law_title) VALUES (?, ?)')
      .run('L1_20200101_', '消費税法');
    first.prepare("UPDATE schema_meta SET value = '1' WHERE key = 'schema_version'").run();
    first.close();
    return track(openDb(dbPath));
  }

  it('SPEC-EGOV-DB-SCHEMA-016 版 1 の DB を作り直しの入口で開くと中身を消して版 3 の空の DB にする', async () => {
    const db = await openV1Recreated();
    expect(count(db, 'SELECT count(*) AS c FROM laws')).toBe(0);
    expect(count(db, 'SELECT count(*) AS c FROM articles')).toBe(0);
    expect(count(db, 'SELECT count(*) AS c FROM sync_state')).toBe(0);
    expect(count(db, 'SELECT count(*) AS c FROM laws_fts')).toBe(0);
    expect(count(db, 'SELECT count(*) AS c FROM revisions_meta')).toBe(0);
    expect(
      count(db, "SELECT count(*) AS c FROM articles_fts WHERE articles_fts MATCH '本文'")
    ).toBe(0);
    expect(db.prepare('SELECT key, value FROM schema_meta').all()).toEqual([
      { key: 'schema_version', value: '3' },
    ]);
  });

  it('SPEC-EGOV-DB-SCHEMA-017 作り直した後も 7 つのテーブルがあり articles_fts で引ける', async () => {
    const db = await openV1Recreated();
    const names = new Set(
      (
        db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')").all() as Array<{
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
    insertLaw(db);
    insertArticle(db, 10, '再作成後の本文QWERTY');
    expect(
      count(db, "SELECT count(*) AS c FROM articles_fts WHERE articles_fts MATCH 'QWERTY'")
    ).toBe(1);
  });
});

describe('テーブルの列と FTS', () => {
  let db: DatabaseT.Database;

  beforeEach(async () => {
    const { openDbForFullIngest: openDb } = await loadDb();
    db = track(openDb(join(tmp, 'cols.db')));
  });

  it('SPEC-EGOV-DB-SCHEMA-018 laws_fts の列と、law_revision_id は索引に載せない', () => {
    expect(columns(db, 'laws_fts').map((c) => c.name)).toEqual([
      'law_revision_id',
      'law_title',
      'law_title_kana',
      'abbrev',
      'law_num',
      'category',
    ]);
    db.prepare('INSERT INTO laws_fts (law_revision_id, law_title) VALUES (?, ?)').run(
      'L1_20200101_',
      '消費税法'
    );
    const hits = db
      .prepare("SELECT law_revision_id FROM laws_fts WHERE laws_fts MATCH '消費税'")
      .all();
    expect(hits).toEqual([{ law_revision_id: 'L1_20200101_' }]);
    expect(count(db, `SELECT count(*) AS c FROM laws_fts WHERE laws_fts MATCH '"L1_2020"'`)).toBe(
      0
    );
  });

  it('SPEC-EGOV-DB-SCHEMA-019 revisions_meta の列と主キー', () => {
    const cols = columns(db, 'revisions_meta');
    expect(cols.map((c) => c.name)).toEqual([
      'law_revision_id',
      'law_id',
      'mission',
      'updated',
      'raw_revision_info_json',
    ]);
    expect(cols.find((c) => c.name === 'law_revision_id')?.pk).toBe(1);
    expect(cols.filter((c) => c.pk > 0).map((c) => c.name)).toEqual(['law_revision_id']);
  });

  it('SPEC-EGOV-DB-SCHEMA-020 sync_state の列', () => {
    expect(columns(db, 'sync_state').map((c) => c.name)).toEqual([
      'id',
      'last_sync_date',
      'last_full_dl_at',
      'total_laws',
      'bulk_source',
    ]);
  });

  it('SPEC-EGOV-DB-SCHEMA-021 articles を書き換えると articles_fts も新しい本文と見出しに入れ替わる', () => {
    insertLaw(db);
    insertArticle(db, 1, '旧本文ABCDEF', '（目的）');
    db.prepare('UPDATE articles SET body = ?, caption = ? WHERE id = 1').run(
      '新本文GHIJKL',
      '（趣旨）'
    );
    const m = (q: string) =>
      db.prepare('SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?').all(q) as Array<{
        rowid: number;
      }>;
    expect(m('ABCDEF')).toHaveLength(0);
    expect(m('GHIJKL')).toEqual([{ rowid: 1 }]);
    expect(m('目的）')).toHaveLength(0);
    expect(m('趣旨）')).toHaveLength(1);
  });

  it('SPEC-EGOV-DB-SCHEMA-022 DB は WAL で開く', () => {
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
  });
});

describe('書き込み中の読み取り', () => {
  it('SPEC-EGOV-DB-SCHEMA-023 書き込みトランザクション中も別の接続から確定した行だけ読める', async () => {
    const dbPath = join(tmp, 'wal.db');
    const { openDbForFullIngest: openDb } = await loadDb();
    const a = track(openDb(dbPath));
    insertLaw(a);
    insertArticle(a, 1, '一');
    insertArticle(a, 2, '二');
    a.exec('BEGIN IMMEDIATE');
    insertArticle(a, 3, '三');
    const b = track(new Database(dbPath));
    expect(count(b, 'SELECT count(*) AS c FROM articles')).toBe(2);
    a.exec('COMMIT');
    expect(count(b, 'SELECT count(*) AS c FROM articles')).toBe(3);
  });
});
