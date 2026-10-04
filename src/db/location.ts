/**
 * ローカル DB の場所の設定と、利用者に見せるパス・案内のコマンドの書き方
 *
 * - DB の場所の設定の名前と DB の絶対パス（SPEC-EGOV-DB-SCHEMA-028）
 * - MCP の応答に出すパス。ホームディレクトリの部分を `~` にする（SPEC-EGOV-SEARCH-FULLTEXT-042）
 * - 案内のコマンド `npx -y @shuji-bonji/houki-egov-mcp@latest <フラグ>`。環境変数で DB の場所を決めたときは、
 *   同じ変数をシェルでそのまま動く形で前に付ける（SPEC-EGOV-DB-SCHEMA-029）
 *
 * MCP サーバーと CLI の両方がここを使う。
 */

import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { BULK_CONFIG, PACKAGE_INFO } from '../config.js';

/** DB の場所を決めた設定の名前（SPEC-EGOV-DB-SCHEMA-028） */
export type DbLocationSetting = 'HOUKI_EGOV_DB_PATH' | 'XDG_CACHE_HOME' | '既定';

/** DB の場所と、それを決めた設定 */
export interface DbLocation {
  /** CLI の `  DB: ` の行に出す値。`HOUKI_EGOV_DB_PATH` のときはその値のまま */
  path: string;
  /** DB の絶対パス（相対パスは処理を始めたときの作業フォルダーから決める） */
  absolutePath: string;
  /** DB の場所を決めた設定 */
  setting: DbLocationSetting;
  /** 案内のコマンドの前に付ける変数と、その値を絶対パスにしたもの。`既定` では null */
  envPrefix: { name: 'HOUKI_EGOV_DB_PATH' | 'XDG_CACHE_HOME'; absoluteValue: string } | null;
}

/**
 * DB の場所と、それを決めた設定を返す（SPEC-EGOV-DB-SCHEMA-012〜014・028）。
 *
 * 優先順位: `HOUKI_EGOV_DB_PATH`（空文字は無いもの）→ `XDG_CACHE_HOME/houki-egov-mcp/laws.db`（空文字は無いもの）
 * → `~/.cache/houki-egov-mcp/laws.db`
 */
export function resolveDbLocation(): DbLocation {
  const override = BULK_CONFIG.dbPath;
  if (override) return dbLocationForPath(override);
  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg && xdg.length > 0) {
    const path = resolve(xdg, 'houki-egov-mcp', 'laws.db');
    return {
      path,
      absolutePath: path,
      setting: 'XDG_CACHE_HOME',
      envPrefix: { name: 'XDG_CACHE_HOME', absoluteValue: resolve(xdg) },
    };
  }
  const path = resolve(homedir(), '.cache', 'houki-egov-mcp', 'laws.db');
  return { path, absolutePath: path, setting: '既定', envPrefix: null };
}

/** `HOUKI_EGOV_DB_PATH` に `dbPath` を指定したときの DB の場所 */
export function dbLocationForPath(dbPath: string): DbLocation {
  const absolutePath = resolve(dbPath);
  return {
    path: dbPath,
    absolutePath,
    setting: 'HOUKI_EGOV_DB_PATH',
    envPrefix: { name: 'HOUKI_EGOV_DB_PATH', absoluteValue: absolutePath },
  };
}

/**
 * ホームディレクトリの下なら、ホームディレクトリより後ろの部分（先頭の `/` を含む）を返す。下でなければ null。
 * 区切りの位置で、文字列のまま比べる。ホームディレクトリが空文字か `/` なら置き換えない（SPEC-EGOV-SEARCH-FULLTEXT-042 の 2〜5）
 */
function restUnderHome(absPath: string, home: string): string | null {
  if (home === '' || home === '/') return null;
  if (absPath === home) return '';
  if (absPath.startsWith(`${home}/`)) return absPath.slice(home.length);
  return null;
}

/** 応答に出す DB のパス。ホームディレクトリの部分を `~` に置き換える（SPEC-EGOV-SEARCH-FULLTEXT-042） */
export function displayDbPath(absPath: string, home: string = homedir()): string {
  const rest = restUnderHome(absPath, home);
  return rest === null ? absPath : `~${rest}`;
}

/** `'` で囲む部分の `'` を `'\''` にする */
function singleQuoted(s: string): string {
  return `'${s.replaceAll("'", `'\\''`)}'`;
}

/**
 * 案内のコマンドの前に付ける値の、シェルに書く形（SPEC-EGOV-DB-SCHEMA-029）。
 * ホームディレクトリの下は `"$HOME/<残り>"`（残りに `"` `$` `` ` `` `\` `!` を含めば `"$HOME"'/<残り>'`）、外は `'<絶対パス>'`
 */
export function shellPath(absPath: string, home: string = homedir()): string {
  const rest = restUnderHome(absPath, home);
  if (rest === null) return singleQuoted(absPath);
  const tail = rest.slice(1);
  if (/["$`\\!]/.test(tail)) return `"$HOME"${singleQuoted(`/${tail}`)}`;
  return `"$HOME/${tail}"`;
}

/**
 * 利用者に実行を勧めるコマンド（SPEC-EGOV-DB-SCHEMA-029）。
 * `[<変数>=<シェルに書くパス> ]npx -y @shuji-bonji/houki-egov-mcp@latest <フラグ>`
 */
export function guideCommand(flag: string, location: DbLocation = resolveDbLocation()): string {
  const command = `npx -y ${PACKAGE_INFO.name}@latest ${flag}`;
  const prefix = location.envPrefix;
  if (!prefix) return command;
  return `${prefix.name}=${shellPath(prefix.absoluteValue)} ${command}`;
}
