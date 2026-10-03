/**
 * Application Configuration
 * Centralized configuration management
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { name: string; version: string };

/** 数値の環境変数の名前と既定値（SPEC-EGOV-CLI-ENTRY-010・011）。確かめる順もこの順 */
export const NUMERIC_ENV_DEFAULTS = [
  { name: 'HOUKI_EGOV_BULK_RETRY', defaultValue: 3 },
  { name: 'HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS', defaultValue: 90 },
  { name: 'HOUKI_EGOV_CONCURRENCY', defaultValue: 4 },
] as const;

export type NumericEnvName = (typeof NUMERIC_ENV_DEFAULTS)[number]['name'];

/** 1 以上の整数でない値の環境変数（変数名・値・既定値） */
export interface InvalidNumericEnv {
  name: NumericEnvName;
  value: string;
  defaultValue: number;
}

/** 1 以上の整数を 10 進の数字だけで書いたもの（前後の空白・符号・小数点は不正） */
const POSITIVE_INT = /^[1-9][0-9]*$/;

/**
 * 数値の環境変数を読む。
 *
 * - 無い・空文字: 既定値
 * - 1 以上の整数（`^[1-9][0-9]*$`）: その値
 * - それ以外（`0`・負の数・小数・`abc`・前後の空白を含むもの）: 既定値。不正な値は
 *   `findInvalidNumericEnv()` で取り出し、CLI は終了コード 2、MCP サーバーは警告を出して既定値を使う
 *
 * モジュールの読み込み時（`HTTP_CONFIG` などを作るとき）に呼ぶので、不正な値でも例外を投げない
 * （`egov-client.ts` が読み込み時に `createLimit(HTTP_CONFIG.concurrency)` を呼ぶため）
 */
export function readNumericEnv(name: NumericEnvName, env: NodeJS.ProcessEnv = process.env): number {
  const def = NUMERIC_ENV_DEFAULTS.find((d) => d.name === name)?.defaultValue as number;
  const raw = env[name];
  if (raw === undefined || raw === '') return def;
  return POSITIVE_INT.test(raw) ? Number.parseInt(raw, 10) : def;
}

/** 1 以上の整数でない数値の環境変数を、NUMERIC_ENV_DEFAULTS の順に返す（無い・空文字は含めない） */
export function findInvalidNumericEnv(env: NodeJS.ProcessEnv = process.env): InvalidNumericEnv[] {
  const out: InvalidNumericEnv[] = [];
  for (const { name, defaultValue } of NUMERIC_ENV_DEFAULTS) {
    const raw = env[name];
    if (raw === undefined || raw === '') continue;
    if (!POSITIVE_INT.test(raw)) out.push({ name, value: raw, defaultValue });
  }
  return out;
}

/**
 * Package information (dynamically loaded from package.json)
 */
export const PACKAGE_INFO = {
  name: packageJson.name,
  version: packageJson.version,
} as const;

/**
 * e-Gov Law API v2 endpoints
 * Spec: https://laws.e-gov.go.jp/api/2/swagger-ui
 *
 * NOTE: Query parameters use snake_case (law_title, law_type, ...) — verified 2026-04-23
 */
export const EGOV_API = {
  baseUrl: 'https://laws.e-gov.go.jp/api/2',
  /** Search laws by keyword/title/number */
  laws: 'https://laws.e-gov.go.jp/api/2/laws',
  /** Fetch law body (JSON tree) */
  lawData: (lawId: string) => `https://laws.e-gov.go.jp/api/2/law_data/${lawId}`,
  /** Fetch law revisions list */
  lawRevisions: (lawId: string) => `https://laws.e-gov.go.jp/api/2/law_revisions/${lawId}`,
  /**
   * 添付ファイル取得（#19、v0.15.0）。`src` を省くと、その履歴の添付ファイルをまとめた zip を返す。
   * 認証は要らず、URL をそのまま開くと本文に付いた jpg / pdf が取れる
   */
  attachment: (lawRevisionId: string, src?: string) => {
    const url = new URL(`https://laws.e-gov.go.jp/api/2/attachment/${lawRevisionId}`);
    if (src) url.searchParams.set('src', src);
    return url.toString();
  },
  /** 法令本文ファイル取得（#19、v0.15.0）。xml / json / html / rtf / docx のいずれか。asof は時点 */
  lawFile: (fileType: string, lawIdOrRevisionId: string, asof?: string) => {
    const url = new URL(`https://laws.e-gov.go.jp/api/2/law_file/${fileType}/${lawIdOrRevisionId}`);
    if (asof) url.searchParams.set('asof', asof);
    return url.toString();
  },
  /** Public-facing URL（出典として返却） */
  publicLawUrl: (lawId: string) => `https://laws.e-gov.go.jp/law/${lawId}`,
} as const;

/**
 * e-Gov XML bulk download エンドポイント
 *
 * - file_section=1 : 全件 zip (all_xml.zip, 約 285 MB)
 * - file_section=2 : カテゴリ別 zip (category_cd=1〜42)
 * - file_section=3 : 日次差分 zip (update_date=YYYYMMDD, 過去 3 ヶ月)
 *
 * 仕様詳細: docs/PHASE2-SPIKE.md §1〜§3
 */
export const EGOV_BULK = {
  indexUrl: 'https://laws.e-gov.go.jp/bulkdownload/',
  /** 全件 zip (file_section=1) */
  fullDownloadUrl: 'https://laws.e-gov.go.jp/bulkdownload?file_section=1&only_xml_flag=true',
  /** カテゴリ別 zip (file_section=2) URL builder */
  categoryDownloadUrl: (categoryCd: number): string =>
    `https://laws.e-gov.go.jp/bulkdownload?file_section=2&category_cd=${categoryCd}&only_xml_flag=true`,
  /** 日次差分 zip (file_section=3) URL builder。YYYYMMDD 形式の日付を受ける */
  incrementalDownloadUrl: (yyyymmdd: string): string =>
    `https://laws.e-gov.go.jp/bulkdownload?file_section=3&update_date=${yyyymmdd}&only_xml_flag=true`,
} as const;

/**
 * HTTP request configuration
 */
export const HTTP_CONFIG = {
  userAgent: `${PACKAGE_INFO.name}/${PACKAGE_INFO.version}`,
  timeout: 30000,
  maxRetries: 3,
  /**
   * e-Gov API への同時リクエスト数の上限。
   * レート制限 (429) 対策。環境変数 HOUKI_EGOV_CONCURRENCY（1 以上の整数）で上書き可能。
   * 既定値 4 は実測ベース（保守的）。不正な値は既定値を使う（readNumericEnv）
   */
  concurrency: readNumericEnv('HOUKI_EGOV_CONCURRENCY'),
} as const;

/**
 * Cache configuration
 */
export const CACHE_CONFIG = {
  xml: { maxSize: 20, name: 'XMLCache' },
  parsed: { maxSize: 50, name: 'ParseCache' },
  searchResults: { maxSize: 30, name: 'SearchCache' },
} as const;

/**
 * `get_attachment` / `get_law_file` が `save: true` のときにファイルを書く場所（#19、v0.15.0）
 *
 * - HOUKI_EGOV_FILES_DIR: 保存先ディレクトリの上書き
 * - 既定は `${XDG_CACHE_HOME:-~/.cache}/houki-egov-mcp/files/`（bulk DB と同じ親）
 *
 * 保存先はサーバー側で決め、ツールの引数では受け取らない（LLM が渡したパスに書かないため）。
 */
export const FILES_CONFIG = {
  /** 保存先を上書きする環境変数の名前。値は file-store.ts が呼ぶたびに読む */
  dirEnv: 'HOUKI_EGOV_FILES_DIR',
  /** 1 ファイルの上限（バイト）。e-Gov の添付は数十 KB〜数 MB、法令ファイルは民法の xml で 1.6 MB */
  maxBytes: 50 * 1024 * 1024,
} as const;

/**
 * Runtime flags from environment
 */
export const RUNTIME_FLAGS = {
  /** Comma-separated list of extension packages to load */
  extensions: (process.env.HOUKI_HUB_EXTENSIONS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /** Enable debug logs */
  debug: process.env.DEBUG === '1' || process.env.DEBUG === 'true',
} as const;

/**
 * Phase 2 bulk-cache configuration (PHASE2-DESIGN.md §4.1)
 *
 * - HOUKI_EGOV_DB_PATH: full override of cache DB path (priority over XDG)
 * - XDG_CACHE_HOME: default base directory for cache
 * - HOUKI_EGOV_BULK_RETRY: max retries for full-zip download (default 3)
 * - HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS: max days to look back for incremental
 *   diff zips before falling back to full download (default 90 — 公式仕様の上限)
 *
 * 数値の 2 つ（と HTTP_CONFIG.concurrency）は 1 以上の整数だけを受け付け、不正な値は既定値を使う。
 * CLI の取り込み・同期・状態の表示は不正な値で終了コード 2、MCP サーバーは警告を出して起動を続ける
 * （SPEC-EGOV-CLI-ENTRY-010・011。検査は cli/index.ts）
 */
export const BULK_CONFIG = {
  /** override of cache DB path */
  dbPath: process.env.HOUKI_EGOV_DB_PATH,
  /** max retries on full-zip download failure */
  bulkRetry: readNumericEnv('HOUKI_EGOV_BULK_RETRY'),
  /** look-back days for incremental diff before full-DL fallback */
  incrementalLimitDays: readNumericEnv('HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS'),
} as const;
