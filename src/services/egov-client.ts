/**
 * e-Gov 法令API v2 HTTP クライアント
 *
 * Spec: https://laws.e-gov.go.jp/api/2/swagger-ui
 * 注意: クエリパラメータは snake_case（law_title, law_type, ...）
 */

import { EGOV_API, HTTP_CONFIG } from '../config.js';
import { createLimit } from '../utils/concurrency.js';
import { logger } from '../utils/logger.js';

/**
 * e-Gov API への同時リクエスト数を制限する。
 * 429 を出さないための予防的制御。retry/backoff と二重に守る構成。
 */
const limit = createLimit(HTTP_CONFIG.concurrency);

/** e-Gov の law_full_text などで使われる XML→JSON ツリー型 */
export interface LawNode {
  tag: string;
  attr?: Record<string, string>;
  children?: Array<LawNode | string>;
}

/** /laws レスポンスの法令アイテム */
export interface LawListItem {
  law_info: {
    law_id: string;
    law_type: string;
    law_num: string;
    law_num_era?: string;
    law_num_year?: number;
    promulgation_date?: string;
  };
  revision_info: {
    law_revision_id?: string;
    law_title: string;
    law_title_kana?: string;
    abbrev?: string | null;
    category?: string;
    updated?: string;
    current_revision_status?: string;
    repeal_status?: string;
  };
  current_revision_info?: {
    law_revision_id?: string;
    law_title: string;
  };
}

/** /laws レスポンス全体 */
export interface EgovLawSearchResponse {
  total_count: number;
  count: number;
  next_offset?: number;
  laws: LawListItem[];
}

/** /law_data/{lawId} レスポンス */
export interface EgovLawDataResponse {
  law_info: LawListItem['law_info'];
  revision_info: LawListItem['revision_info'];
  law_full_text: LawNode;
  attached_files_info?: AttachedFilesInfo;
}

/** /law_data の attached_files_info.attached_files[] の 1 件（#19） */
export interface AttachedFile {
  law_revision_id: string;
  /** 法令 XML の Fig 要素の src 属性。例 "./pict/H11HO127-001.jpg" */
  src: string;
  /** 正誤等による更新日時 */
  updated?: string;
}

/** /law_data の attached_files_info（#19）。image_data は include_attached_file_content=true のときだけ入る */
export interface AttachedFilesInfo {
  image_data?: string;
  attached_files?: AttachedFile[];
}

/** /attachment と /law_file が返すバイナリ（#19） */
export interface EgovBinaryResponse {
  url: string;
  bytes: Uint8Array;
  /** 応答の Content-Type。e-Gov は jpg を image/jpeg、pdf と法令ファイルを application/octet-stream で返す */
  contentType: string | null;
  /** 応答の Content-Disposition の filename。法令ファイルは "<law_revision_id>.docx" の形で入る */
  fileName: string | null;
}

/** /law_revisions/{lawId} の単一改正履歴エントリ */
export interface RevisionInfo {
  law_revision_id: string;
  law_type: string;
  law_title: string;
  law_title_kana?: string;
  abbrev?: string | null;
  category?: string;
  updated?: string;
  /** 改正法の公布日 */
  amendment_promulgate_date?: string;
  /** 改正法の施行日 */
  amendment_enforcement_date?: string;
  amendment_enforcement_comment?: string | null;
  amendment_scheduled_enforcement_date?: string | null;
  /** 改正法令の law_id */
  amendment_law_id?: string | null;
  /** 改正法令の正式名称 */
  amendment_law_title?: string | null;
  amendment_law_title_kana?: string | null;
  /** 改正法令番号 */
  amendment_law_num?: string | null;
  amendment_type?: string;
  repeal_status?: string;
  repeal_date?: string | null;
  remain_in_force?: boolean;
  mission?: string;
  /** 現在のリビジョン状態 */
  current_revision_status?: string;
}

/** /law_revisions/{lawId} レスポンス */
export interface EgovLawRevisionsResponse {
  law_info: LawListItem['law_info'];
  revisions: RevisionInfo[];
}

export interface SearchLawsParams {
  law_title?: string;
  law_type?: string;
  law_num?: string;
  /** 1〜500 */
  limit?: number;
  /** 0始まり */
  offset?: number;
}

export interface GetLawDataParams {
  /** 時点指定 YYYY-MM-DD（e-Gov v2 の asof） */
  at?: string;
}

/** HTTP ステータスエラー */
export class EgovHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    message: string,
    /** 4xx の応答本文（e-Gov は JSON の {code, message} を返す）。retry した 5xx と JSON 経路では入らない */
    public readonly body?: string
  ) {
    super(message);
    this.name = 'EgovHttpError';
  }

  /** e-Gov のエラー応答の code（例 "404003" = 添付ファイルが無い、"400039" = law_revision_id が誤り）。読めなければ null */
  egovErrorCode(): string | null {
    if (!this.body) return null;
    try {
      const parsed = JSON.parse(this.body) as { code?: unknown };
      return typeof parsed.code === 'string' ? parsed.code : null;
    } catch {
      return null;
    }
  }
}

/**
 * /laws を叩く（法令一覧・検索）
 */
export async function searchLaws(params: SearchLawsParams): Promise<EgovLawSearchResponse> {
  const url = new URL(EGOV_API.laws);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }
  return limit(() => fetchJsonWithRetry<EgovLawSearchResponse>(url.toString()));
}

/**
 * /law_data/{lawId} を叩く（法令本文取得）
 */
export async function getLawData(
  lawId: string,
  params: GetLawDataParams = {}
): Promise<EgovLawDataResponse> {
  const url = new URL(EGOV_API.lawData(lawId));
  if (params.at) url.searchParams.set('asof', params.at);
  return limit(() => fetchJsonWithRetry<EgovLawDataResponse>(url.toString()));
}

/**
 * /law_revisions/{lawId} を叩く（改正履歴一覧）
 */
export async function getLawRevisions(lawId: string): Promise<EgovLawRevisionsResponse> {
  const url = new URL(EGOV_API.lawRevisions(lawId));
  return limit(() => fetchJsonWithRetry<EgovLawRevisionsResponse>(url.toString()));
}

/**
 * /attachment/{law_revision_id}?src= を叩く（添付ファイル 1 件。src 省略で zip）
 */
export async function getAttachment(
  lawRevisionId: string,
  src?: string
): Promise<EgovBinaryResponse> {
  const url = EGOV_API.attachment(lawRevisionId, src);
  return limit(() => fetchBinaryWithRetry(url));
}

/**
 * /law_file/{file_type}/{law_id_or_revision_id}?asof= を叩く（法令本文ファイル）
 */
export async function getLawFile(
  fileType: string,
  lawIdOrRevisionId: string,
  asof?: string
): Promise<EgovBinaryResponse> {
  const url = EGOV_API.lawFile(fileType, lawIdOrRevisionId, asof);
  return limit(() => fetchBinaryWithRetry(url));
}

/**
 * リトライ付き fetch（バイナリ）。retry の条件は fetchJsonWithRetry と同じ。
 *
 * e-Gov は「添付ファイルが無い」を 400 または 404 の JSON（code 404003）で返すので、
 * 4xx の本文は EgovHttpError.body に残し、呼び出し側が code を読めるようにする。
 */
async function fetchBinaryWithRetry(url: string, attempt = 0): Promise<EgovBinaryResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HTTP_CONFIG.timeout);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': HTTP_CONFIG.userAgent },
      signal: controller.signal,
    });

    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      return {
        url,
        bytes,
        contentType: res.headers.get('content-type'),
        fileName: parseContentDispositionFileName(res.headers.get('content-disposition')),
      };
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < HTTP_CONFIG.maxRetries) {
      const delay = 500 * 2 ** attempt;
      logger.warn('egov-client', `${res.status} ${url} — retry in ${delay}ms`);
      await sleep(delay);
      return fetchBinaryWithRetry(url, attempt + 1);
    }

    let body: string | undefined;
    try {
      body = await res.text();
    } catch {
      body = undefined;
    }
    throw new EgovHttpError(res.status, url, `e-Gov API returned ${res.status}`, body);
  } catch (err) {
    if (err instanceof EgovHttpError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new EgovHttpError(0, url, `e-Gov API request timeout: ${url}`);
    }
    if (attempt < HTTP_CONFIG.maxRetries) {
      const delay = 500 * 2 ** attempt;
      logger.warn('egov-client', `network error: ${(err as Error).message} — retry in ${delay}ms`);
      await sleep(delay);
      return fetchBinaryWithRetry(url, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Content-Disposition の filename="…" を取り出す。無ければ null */
export function parseContentDispositionFileName(header: string | null): string | null {
  if (!header) return null;
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * リトライ付き fetch + JSON parse
 *
 * - 429 / 5xx は指数バックオフで再試行（最大 maxRetries 回）
 * - 4xx（429除く）は即エラー
 * - timeout で AbortController を発火
 */
async function fetchJsonWithRetry<T>(url: string, attempt = 0): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HTTP_CONFIG.timeout);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': HTTP_CONFIG.userAgent,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (res.ok) {
      return (await res.json()) as T;
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < HTTP_CONFIG.maxRetries) {
      const delay = 500 * 2 ** attempt;
      logger.warn('egov-client', `${res.status} ${url} — retry in ${delay}ms`);
      await sleep(delay);
      return fetchJsonWithRetry<T>(url, attempt + 1);
    }

    throw new EgovHttpError(res.status, url, `e-Gov API returned ${res.status}`);
  } catch (err) {
    if (err instanceof EgovHttpError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new EgovHttpError(0, url, `e-Gov API request timeout: ${url}`);
    }
    if (attempt < HTTP_CONFIG.maxRetries) {
      const delay = 500 * 2 ** attempt;
      logger.warn('egov-client', `network error: ${(err as Error).message} — retry in ${delay}ms`);
      await sleep(delay);
      return fetchJsonWithRetry<T>(url, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
