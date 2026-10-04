/**
 * DB ファイルパス管理 + Database open/close ヘルパ
 *
 * デフォルトのキャッシュ DB パス: `${XDG_CACHE_HOME:-~/.cache}/houki-egov-mcp/laws.db`
 *
 * 環境変数 (config.ts BULK_CONFIG / RUNTIME_FLAGS):
 *  - `XDG_CACHE_HOME` (XDG Base Directory) があればそこを使う
 *  - `HOUKI_EGOV_DB_PATH` で完全に上書き可能（テスト・運用カスタム用）
 *
 * DB を開く入口は 2 つ（SPEC-EGOV-DB-SCHEMA-025）:
 *  - `openDbForFullIngest()`: `--bulk-download-everything` 専用。フォルダーとファイルを作り、
 *    版の記録が無ければテーブルを作り、古い版なら作り直す
 *  - `openUsableDb()`: ほかの入口（`--sync`・`--bulk-download-by-date`・`--status`・`search_fulltext`）。
 *    ファイル・フォルダー・テーブル・版の記録を作らず、版が今の版のときだけ DB を返す
 */

import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type DatabaseT from 'better-sqlite3';
import Database from 'better-sqlite3';

import { type DbLocation, guideCommand, resolveDbLocation } from './location.js';
import { initSchema, readSchemaVersion, recreateSchema, SCHEMA_VERSION } from './schema.js';

/**
 * デフォルトキャッシュ DB のパスを返す（OS / 環境変数を考慮）。
 *
 * 優先順位:
 *  1. `HOUKI_EGOV_DB_PATH` (BULK_CONFIG.dbPath)
 *  2. `XDG_CACHE_HOME/houki-egov-mcp/laws.db`
 *  3. `~/.cache/houki-egov-mcp/laws.db`
 *
 * `HOUKI_EGOV_DB_PATH` の値はそのまま返す（CLI の `  DB: ` の行と同じ）。
 * 設定の名前と絶対パスは `resolveDbLocation()`（SPEC-EGOV-DB-SCHEMA-028）
 */
export function defaultDbPath(): string {
  return resolveDbLocation().path;
}

/** DB の状態（SPEC-EGOV-DB-SCHEMA-025 の表の行） */
export type DbState =
  /** ファイルが無い（置き場所のフォルダーも無いときを含む） */
  | { kind: 'missing' }
  /** ファイルはあるが版の記録が無い（0 バイトのファイルなど） */
  | { kind: 'no-version' }
  /** 版が今の版（SCHEMA_VERSION） */
  | { kind: 'current' }
  /** 版が今の版より古い */
  | { kind: 'old'; version: number }
  /** 版が今の版より新しい */
  | { kind: 'new'; version: number }
  /** 版を整数として読めない（空文字を含む） */
  | { kind: 'unreadable'; value: string }
  /** 開けない（SQLite でないファイル、フォルダー、パスの途中が普通のファイル、権限が無い） */
  | { kind: 'error'; message: string };

/** 開いた DB から版を読んで状態にする */
function stateOf(db: DatabaseT.Database): DbState {
  const r = readSchemaVersion(db);
  if (r.kind === 'none') return { kind: 'no-version' };
  if (r.kind === 'unreadable') return { kind: 'unreadable', value: r.value };
  if (r.version === SCHEMA_VERSION) return { kind: 'current' };
  return r.version < SCHEMA_VERSION
    ? { kind: 'old', version: r.version }
    : { kind: 'new', version: r.version };
}

/**
 * ファイルを作らずに開く。ファイルが無ければ null。開けなければ `error` の状態を返す。
 * フォルダーを指したときは書き込みのモードで開いて SQLite のエラーの文を取る（フォルダーには何も作れない）
 */
function openWithoutCreating(
  path: string,
  readonly: boolean
): { db: DatabaseT.Database } | { state: DbState } {
  let isDirectory = false;
  try {
    isDirectory = statSync(path).isDirectory();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { state: { kind: 'missing' } };
    // パスの途中が普通のファイル（ENOTDIR）・権限が無い（EACCES）など。SQLite のエラーの文にそろえる
  }
  let db: DatabaseT.Database;
  try {
    db = new Database(path, { readonly: readonly && !isDirectory, fileMustExist: true });
  } catch (err) {
    return { state: { kind: 'error', message: (err as Error).message } };
  }
  return { db };
}

/** DB の状態を確かめる。DB のファイル・フォルダー・テーブル・版の記録を作らず、書き換えない */
export function inspectDb(dbPath?: string): DbState {
  const path = dbPath ?? defaultDbPath();
  const opened = openWithoutCreating(path, true);
  if ('state' in opened) return opened.state;
  try {
    return stateOf(opened.db);
  } catch (err) {
    return { kind: 'error', message: (err as Error).message };
  } finally {
    closeDb(opened.db);
  }
}

/**
 * 今の版の DB だけを開く。DB のファイル・フォルダー・テーブル・版の記録を作らない。
 * 状態が `current` のときだけ `db` を返し、それ以外は `db: null`（呼び出し側が状態ごとに扱う）。
 *
 * @param opts.readonly true なら読むだけで開く（`--status`・`search_fulltext`）
 */
export function openUsableDb(
  dbPath?: string,
  opts: { readonly?: boolean } = {}
): { state: DbState; db: DatabaseT.Database | null } {
  const path = dbPath ?? defaultDbPath();
  const readonly = opts.readonly === true;
  const opened = openWithoutCreating(path, readonly);
  if ('state' in opened) return { state: opened.state, db: null };
  const { db } = opened;
  let state: DbState;
  try {
    state = stateOf(db);
  } catch (err) {
    closeDb(db);
    return { state: { kind: 'error', message: (err as Error).message }, db: null };
  }
  if (state.kind !== 'current') {
    closeDb(db);
    return { state, db: null };
  }
  if (!readonly) db.pragma('foreign_keys = ON');
  return { state, db };
}

/** 新しい版・読めない版の DB を `--bulk-download-everything` が開こうとしたとき */
export class DbStateError extends Error {
  constructor(
    public readonly state: DbState,
    message: string
  ) {
    super(message);
    this.name = 'DbStateError';
  }
}

/**
 * `--bulk-download-everything` 用に DB を開く（取得に成功した後で呼ぶ）。
 *
 * - フォルダーとファイルが無ければ作る（SPEC-EGOV-DB-SCHEMA-015）
 * - 版の記録が無ければテーブルを作り、今の版を記録する（001）
 * - 古い版なら全テーブルを消して今の版で作り直す（016）
 * - 新しい版・読めない版なら書き換えずに `DbStateError` を投げる（025）
 *
 * @param dbPath ファイルパス。`:memory:` を渡すと in-memory DB（テスト用）。未指定なら `defaultDbPath()`
 */
export function openDbForFullIngest(dbPath?: string): DatabaseT.Database {
  const path = dbPath ?? defaultDbPath();
  if (path !== ':memory:') {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
  const db = new Database(path);
  try {
    const state = stateOf(db);
    if (state.kind === 'old') {
      recreateSchema(db);
    } else if (state.kind === 'new' || state.kind === 'unreadable') {
      throw new DbStateError(state, dbStateErrorMessage(state, path) ?? '');
    } else {
      initSchema(db);
    }
    db.pragma('foreign_keys = ON');
    return db;
  } catch (err) {
    closeDb(db);
    throw err;
  }
}

/**
 * 版が今の版でない DB の CLI のエラーの文（SPEC-EGOV-DB-SCHEMA-025 の表）。
 * 古い版・新しい版・読めない版以外の状態では null。
 * コマンドは案内のコマンドの形（SPEC-EGOV-DB-SCHEMA-029）、`dbPath` は `  DB: ` の行と同じ値
 */
export function dbStateErrorMessage(
  state: DbState,
  dbPath: string,
  location: DbLocation = resolveDbLocation()
): string | null {
  const command = guideCommand('--bulk-download-everything', location);
  switch (state.kind) {
    case 'old':
      return `[ERROR] DB の版 (${state.version}) が古いため使えません。${command} で作り直してください（取り込んだ中身は消え、全件の zip 約 290 MB を取り直します）`;
    case 'new':
      return `[ERROR] DB の版 (${state.version}) がこの houki-egov-mcp の版 (${SCHEMA_VERSION}) より新しいため、DB を変更しません。houki-egov-mcp を新しい版に更新するか、HOUKI_EGOV_DB_PATH で別のファイルを指定してください`;
    case 'unreadable':
      return `[ERROR] DB の版を読めないため (schema_version: ${state.value})、DB を変更しません。DB ファイル (${dbPath}) を消してから ${command} を実行してください`;
    default:
      return null;
  }
}

/** 安全に close する（既に閉じていても無害） */
export function closeDb(db: DatabaseT.Database): void {
  if (db.open) {
    db.close();
  }
}

export {
  type DbLocation,
  type DbLocationSetting,
  dbLocationForPath,
  displayDbPath,
  guideCommand,
  resolveDbLocation,
  shellPath,
} from './location.js';
export {
  getSchemaVersion,
  initSchema,
  readSchemaVersion,
  recreateSchema,
  SCHEMA_VERSION,
} from './schema.js';
