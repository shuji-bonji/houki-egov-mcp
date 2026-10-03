/**
 * 法令操作の高レベル API。
 *
 * - 略称解決 → law_id 解決 → 本文取得 → 整形
 * - LRU cache で /law_data の応答を保持（時点指定 at もキーに含む）
 * - HTTP / parse / 該当なし のエラーを統一形で返す
 */

import { listBySourceMcpHint, resolveAbbreviation } from '@shuji-bonji/houki-abbreviations';
import { CACHE_CONFIG, EGOV_API, HTTP_CONFIG } from '../config.js';
import { RANGE_LIMITS } from '../constants.js';
import {
  isLawServiceError as _isLawServiceError,
  internalError,
  type LawErrorCode,
  type LawServiceError,
  makeError,
  NEXT_ACTIONS,
  type NextAction,
} from '../errors.js';
import {
  formatArticleBody,
  formatArticleMarkdown,
  formatRangeArticleSection,
  formatRangeMarkdown,
  formatSupplProvisionLabel,
  formatTocMarkdown,
} from '../formatters/markdown.js';
import {
  formatArticleLabel,
  formatItemLabel,
  fromEgovArticleNum,
  toEgovArticleNum,
  toEgovItemNum,
  toEgovStructureNum,
} from '../utils/article-num.js';
import { LRUCache } from '../utils/cache.js';
import { createLimit } from '../utils/concurrency.js';
import { lawNumMatchKey } from '../utils/law-num.js';
import { logger } from '../utils/logger.js';
import {
  EgovHttpError,
  type EgovLawDataResponse,
  EgovNetworkError,
  getLawData,
  getLawRevisions,
  type LawListItem,
  type RevisionInfo,
  searchLaws,
} from './egov-client.js';
import {
  type LawRelation,
  parentActTitle,
  RELATED_LAWS_NOTE,
  relationCandidates,
} from './law-relations.js';
import {
  collectArticlesInRange,
  countTocNodes,
  extractSupplProvisions,
  extractText,
  extractToc,
  findArticle,
  findChildrenByTag,
  findItem,
  findMainArticle,
  findMainProvision,
  findParagraph,
  findParagraphForItem,
  findRangeByPath,
  findRanges,
  findSupplProvisionByIndex,
  findSupplProvisionsWithArticle,
  getArticleCaption,
  type LawNode,
  limitTocDepth,
  parseRangePath,
  RANGE_TAGS,
  type RangeMatch,
  type RangeTag,
  type SupplProvisionToc,
  type TocNode,
} from './law-tree.js';
import {
  type Delegation,
  type ExtractedReference,
  extractReferences,
  findLawNumMentions,
  type KnownLaw,
} from './reference-extractor.js';

/**
 * EgovHttpError などの例外を、LLM 可読な LawServiceError に変換する。
 * code / hint / next_actions / retryable を含む統一形にすることで、
 * 呼び出し側 LLM が「次に何をすべきか」を判断しやすくする。
 *
 * v0.3.0 で family 共通の `SOURCE_*` 語彙に切替。
 * `EGOV_*` 系は LawErrorCode に残置しているが、本関数からはもう発行しない。
 */
export function egovHttpErrorToLawError(err: unknown): LawServiceError {
  if (err instanceof EgovHttpError) {
    if (err.status === 429) {
      return makeError('SOURCE_RATE_LIMITED', 'e-Gov API がレート制限を返しました（429）', {
        hint: '短時間に多数のリクエストを送るとレート制限が発動します',
        retryable: true,
        next_actions: [NEXT_ACTIONS.retryLater()],
        detail: { status: err.status, url: err.url },
      });
    }
    if (err.status === 0) {
      return makeError('SOURCE_TIMEOUT', 'e-Gov API がタイムアウトしました', {
        hint: 'ネットワーク状態を確認するか、時間をおいて再試行してください',
        retryable: true,
        next_actions: [NEXT_ACTIONS.retryLater(), NEXT_ACTIONS.visitEgovSite()],
        detail: { url: err.url },
      });
    }
    if (err.status >= 500) {
      return makeError(
        'SOURCE_API_ERROR',
        `e-Gov API がサーバーエラーを返しました（${err.status}）`,
        {
          hint: 'e-Gov 側の一時的障害の可能性があります',
          retryable: true,
          next_actions: [NEXT_ACTIONS.retryLater(), NEXT_ACTIONS.visitEgovSite()],
          detail: { status: err.status, url: err.url },
        }
      );
    }
    return makeError('SOURCE_API_ERROR', `e-Gov API error: ${err.message}`, {
      retryable: false,
      detail: { status: err.status, url: err.url },
    });
  }
  // e-Gov との通信と関係の無い処理中の例外は SOURCE_* にしない（SPEC-EGOV-COMMON-ERRORS-027）。
  // EgovNetworkError（egov-client が取り直しても失敗したネットワークの例外）か、接続の失敗の code を
  // 持つ例外だけを通信の失敗として扱う
  const unavailable = unavailableCodeOf(err);
  if (unavailable) {
    const cause = err instanceof Error ? err.message : String(err);
    return makeError(
      'SOURCE_UNAVAILABLE',
      `e-Gov API に接続できません: ${cause} (${unavailable})`,
      {
        hint: 'ネットワーク接続または DNS 解決に問題がある可能性があります',
        retryable: true,
        next_actions: [NEXT_ACTIONS.retryLater(), NEXT_ACTIONS.visitEgovSite()],
        detail: { cause: unavailable },
      }
    );
  }
  if (err instanceof EgovNetworkError) {
    return makeError('SOURCE_API_ERROR', `e-Gov API 呼び出しに失敗しました: ${err.message}`, {
      retryable: true,
      next_actions: [NEXT_ACTIONS.retryLater()],
      detail: { cause: err.message },
    });
  }
  return internalError(err);
}

/**
 * 接続できないことを表す code（SPEC-EGOV-COMMON-ERRORS-028 の表）。
 * 例外の `cause.code`（Node の fetch が入れる）を先に見て、無ければ例外の文に含まれる code を探す。
 */
const UNAVAILABLE_CODES = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'];

function unavailableCodeOf(err: unknown): string | null {
  const code =
    err instanceof EgovNetworkError
      ? err.code
      : ((err as { cause?: { code?: unknown } } | null)?.cause?.code as string | undefined);
  if (typeof code === 'string' && UNAVAILABLE_CODES.includes(code)) return code;
  const message = err instanceof Error ? err.message : String(err);
  const inMessage = UNAVAILABLE_CODES.find((c) => message.includes(c));
  if (inMessage) return inMessage;
  // getaddrinfo の失敗は名前解決の失敗（v0.15.4 までも例外の文で SOURCE_UNAVAILABLE にしていた）
  if (message.includes('getaddrinfo')) return 'ENOTFOUND';
  return null;
}

/**
 * houki-egov-mcp の管轄外リソース (通達・PDF・判例 等) が略称解決で判明した場合、
 * `OUT_OF_SCOPE` エラーを返す。Skill 層は `next_actions[0].example.mcp` を見て
 * 適切な MCP に透過的にルーティングする。
 *
 * `houki-egov` 管轄、または辞書に未登録の場合は `null` を返し、通常フローに進める。
 * 辞書は全角英数字・ダッシュ類・全角空白を揃えてから引く（v0.16.0、SPEC-EGOV-GET-LAW-039 など）。
 */
export function checkAbbreviationScope(name: string): LawServiceError | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const abbr = resolveAbbreviation(trimmed, { normalize: true });
  if (!abbr) return null;
  if (abbr.source_mcp_hint === 'houki-egov') return null;
  return makeError(
    'OUT_OF_SCOPE',
    `「${abbr.formal}」は ${abbr.source_mcp_hint} の管轄です（houki-egov-mcp は法律・政令・省令の本文のみを扱います）`,
    {
      hint: `${abbr.source_mcp_hint}-mcp の対応 tool に切り替えてください`,
      next_actions: [NEXT_ACTIONS.delegateTo(abbr.source_mcp_hint)],
      detail: { cause: `source_mcp_hint=${abbr.source_mcp_hint}` },
    }
  );
}

/** 法令本文（パース済み）のキャッシュ。キーは `${law_id}:${at ?? 'current'}` */
const lawDataCache = new LRUCache<string, EgovLawDataResponse>(
  CACHE_CONFIG.parsed.maxSize,
  CACHE_CONFIG.parsed.name
);

/** search_law の検索結果のキャッシュ。キーは検索パラメータの正規化文字列 */
const searchCache = new LRUCache<string, { laws: LawListItem[]; total_count: number }>(
  CACHE_CONFIG.searchResults.maxSize,
  CACHE_CONFIG.searchResults.name
);

/** 共通エラー型 (re-export) — 詳細は src/errors.ts */
export type { LawServiceError } from '../errors.js';

export type LawServiceResult<T> = T | LawServiceError;

export function isError<T>(r: LawServiceResult<T>): r is LawServiceError {
  return _isLawServiceError(r);
}

/** 法令を 1 つに決めた結果 */
export interface ResolvedLaw {
  law_id: string;
  title: string;
  law_num?: string;
  /** 法令の種別（e-Gov の law_type。略称辞書の law_type）。分からなければ無い */
  law_type?: string;
}

/** 法令名の検索で完全一致が無く、部分一致だけがあった（SPEC-EGOV-COMMON-ERRORS-032 の 4） */
export interface PartialMatch {
  kind: 'partial';
  /** 照合した名前（辞書の正式名称、または前後の空白を除いた law_name） */
  searched: string;
  /** e-Gov の検索結果の総数 */
  total_count: number;
  /** 検索結果の先頭（最大 5 件。e-Gov の検索結果の順） */
  candidates: ExactLawHit[];
}

/** 部分一致の候補として示す件数（SPEC-EGOV-COMMON-ERRORS-032） */
const MAX_PARTIAL_CANDIDATES = 5;

/**
 * e-Gov の `/laws` を 1 回で取る件数。2026-10-03 JST に `limit=1000` を受け付け、`保険法` の 114 件を
 * 1 回で返すことを確かめた。`total_count` がこれを超えるときは `offset` で取り直す
 */
const SEARCH_PAGE_SIZE = 1000;
/** 取り直しの上限（1000 件 × 20 回）。e-Gov の法令は約 9,500 件なので、これを超えることは無い */
const MAX_SEARCH_PAGES = 20;

/**
 * e-Gov の `/laws` を、検索結果の全件（`total_count`）まで引いて `match` に合う 1 件を探す
 * （SPEC-EGOV-COMMON-ERRORS-032 の 3、SPEC-EGOV-GET-ARTICLE-REFERENCES-045）。
 * 合う 1 件が見つかればそこで止める。先頭の数件で打ち切らない。通信の失敗はそのまま投げる。
 */
async function searchAllLaws(
  params: { law_title?: string; law_num?: string; asof?: string },
  match: (l: LawListItem) => boolean
): Promise<{ hit: LawListItem | null; total_count: number; head: LawListItem[] }> {
  let offset = 0;
  let total = 0;
  const head: LawListItem[] = [];
  for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
    const res = await searchLaws({
      ...params,
      limit: SEARCH_PAGE_SIZE,
      offset: offset || undefined,
    });
    const laws = res.laws ?? [];
    if (page === 0) {
      total = typeof res.total_count === 'number' ? res.total_count : laws.length;
      head.push(...laws.slice(0, MAX_PARTIAL_CANDIDATES));
    }
    const hit = laws.find(match);
    if (hit) return { hit, total_count: total, head };
    offset += laws.length;
    if (laws.length === 0 || offset >= total) break;
  }
  return { hit: null, total_count: total, head };
}

/**
 * 略称または法令名から法令を 1 つに決める（SPEC-EGOV-COMMON-ERRORS-032）。
 *
 * 1. 略称辞書に houki-egov の law_id があればそれ（e-Gov の検索は引かない）
 * 2. 無ければ照合する名前（辞書の正式名称、無ければ前後の空白を除いた law_name）で e-Gov の法令名検索を引く。
 *    `at` があれば `asof` を付け、その時点の題名で照合する
 * 3. 検索結果の全件の中に題名の完全一致があればその法令
 * 4. 完全一致が無く部分一致があれば `PartialMatch`（検索結果の先頭の法令は使わない）
 * 5. 0 件なら null
 *
 * 検索が通信の失敗で終わったときは例外をそのまま投げる（呼び出し側が SOURCE_* にする。SPEC-EGOV-COMMON-ERRORS-029）。
 */
async function findLawForName(
  lawName: string,
  at?: string
): Promise<ResolvedLaw | PartialMatch | null> {
  const trimmed = lawName.trim();
  if (!trimmed) return null;

  const abbr = resolveAbbreviation(trimmed, { normalize: true });
  if (abbr?.law_id) {
    return {
      law_id: abbr.law_id,
      title: abbr.formal,
      law_num: abbr.law_num,
      ...(abbr.law_type ? { law_type: abbr.law_type } : {}),
    };
  }

  const searched = abbr?.formal ?? trimmed;
  const { hit, total_count, head } = await searchAllLaws(
    { law_title: searched, asof: at },
    (l) => l.revision_info.law_title === searched
  );
  if (hit) {
    return {
      law_id: hit.law_info.law_id,
      title: hit.revision_info.law_title,
      law_num: hit.law_info.law_num,
      law_type: hit.law_info.law_type,
    };
  }
  if (head.length === 0) return null;
  return { kind: 'partial', searched, total_count, candidates: head.map(toExactHit) };
}

function isPartialMatch(v: unknown): v is PartialMatch {
  return typeof v === 'object' && v !== null && (v as { kind?: unknown }).kind === 'partial';
}

/** 法令名の検索が 0 件のときの LAW_NOT_FOUND（各ツールの spec.md の文。今までどおり） */
function lawNotFound(lawName: string): LawServiceError {
  return makeError('LAW_NOT_FOUND', `法令が見つかりません: ${lawName}`, {
    hint: '略称辞書 / e-Gov 法令検索で該当なし。表記を確認してください',
    next_actions: [NEXT_ACTIONS.resolveAbbreviation(lawName), NEXT_ACTIONS.searchLaw(lawName)],
  });
}

/** 渡した引数から、値の無いもの（undefined）を除いた写し。next_actions の example に使う */
function passedArgs(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
}

/**
 * 完全一致が無く部分一致だけがあったときの LAW_NOT_FOUND（SPEC-EGOV-COMMON-ERRORS-032 の 4）。
 * 候補ごとに、呼んだツールを law_name だけ替えて呼び直す例を入れる
 */
function partialMatchError(
  tool: string,
  partial: PartialMatch,
  args: Record<string, unknown>
): LawServiceError {
  const label = (c: ExactLawHit) => `${c.title}（${c.law_num}）`;
  const n = Math.min(MAX_PARTIAL_CANDIDATES, partial.total_count, partial.candidates.length);
  const shown = partial.candidates.slice(0, n);
  const passed = passedArgs(args);
  return makeError(
    'LAW_NOT_FOUND',
    `完全一致する法令名がありません: ${partial.searched}（部分一致 ${partial.total_count} 件）`,
    {
      hint: `部分一致した法令（先頭 ${n} 件）: ${shown.map(label).join('、')}。求めた法令なら、その題名を law_name に渡して呼び直してください`,
      retryable: false,
      next_actions: [
        ...shown.map((c) => ({
          action: tool,
          reason: `${label(c)}を指すなら、この名前で呼び直せます`,
          example: { ...passed, law_name: c.title },
        })),
        NEXT_ACTIONS.searchLaw(String(args.law_name ?? partial.searched)),
      ],
    }
  );
}

/**
 * ツールの処理で、law_name の法令を 1 つに決める（SPEC-EGOV-COMMON-ERRORS-029・032）。
 *
 * - 決まれば ResolvedLaw
 * - 0 件なら今までどおりの LAW_NOT_FOUND、部分一致だけなら候補付きの LAW_NOT_FOUND
 * - 検索が通信の失敗で終わったら SOURCE_*。`at` を付けた検索に e-Gov が 400044 を返したら INVALID_ARGUMENT（033）
 *
 * `args` は渡された引数（候補の呼び直しの例に使う）。`at` を受け取らないツールは `args.at` が無いので
 * 検索に asof を付けない。
 */
export async function resolveLawForTool(
  tool: string,
  args: Record<string, unknown> & { law_name: string; at?: string }
): Promise<ResolvedLaw | LawServiceError> {
  let found: ResolvedLaw | PartialMatch | null;
  try {
    found = await findLawForName(args.law_name, args.at);
  } catch (err) {
    logger.warn('law-service', `resolveLawForTool failed: ${(err as Error).message}`);
    return asofRejected(err, tool, args.at) ?? egovHttpErrorToLawError(err);
  }
  if (found === null) return lawNotFound(args.law_name);
  if (isPartialMatch(found)) return partialMatchError(tool, found, args);
  return found;
}

/**
 * e-Gov が時点 `asof` を受け付けないと答えた（400・`400044`）ときの INVALID_ARGUMENT（SPEC-EGOV-COMMON-ERRORS-033）。
 * 範囲の下限の日付はこのサーバーに書かず、e-Gov の message をそのまま hint に入れる。当たらなければ null
 */
function asofRejected(err: unknown, tool: string, at: string | undefined): LawServiceError | null {
  if (!at || !(err instanceof EgovHttpError) || err.status !== 400) return null;
  if (err.egovErrorCode() !== '400044') return null;
  const message = err.egovErrorMessage() ?? '';
  return makeError('INVALID_ARGUMENT', `at の時点を e-Gov が受け付けません: ${at}`, {
    tool,
    hint: `e-Gov の応答:「${message}」。at を省くと現時点の法令を引けます`,
    retryable: false,
    detail: {
      status: 400,
      url: err.url,
      cause: '400044',
      issues: [{ path: 'at', message: 'e-Gov が受け付ける時点の範囲の外です' }],
    },
  });
}

/**
 * e-Gov が「その法令が無い」と答えたときの応答本文の code（SPEC-EGOV-COMMON-ERRORS-033 の表）。
 * 法令本文（`/law_data`）とファイル（`/law_file`）は `404004`、改正履歴（`/law_revisions`）は `404001`。
 * ほかの code の 404 は SOURCE_API_ERROR のまま
 */
type LawAbsentCode = '404004' | '404001';

/**
 * law_id を決めた後の取得（法令本文・ファイル・改正履歴）の失敗を code にする（SPEC-EGOV-COMMON-ERRORS-033）。
 *
 * - 404 で本文の code が `404004`（改正履歴は `404001`）→ LAW_NOT_FOUND
 * - 400 で本文の code が `400044`（at を渡したとき）→ INVALID_ARGUMENT
 * - それ以外は今までどおり（SPEC-EGOV-COMMON-ERRORS-027 の表）
 *
 * `name` は略称辞書・検索で決めた題名（verify_citations の law_id だけの件では law_id）、
 * `law_name` は渡された law_name（next_actions の例に使う。無ければ law_id）。
 */
export function lawFetchErrorToLawError(
  err: unknown,
  ctx: {
    tool: string;
    law_id: string;
    name: string;
    law_name?: string;
    at?: string;
    /** 「その法令が無い」を表す e-Gov の code。省くと 404004（/law_data・/law_file） */
    absent_code?: LawAbsentCode;
  }
): LawServiceError {
  const rejected = asofRejected(err, ctx.tool, ctx.at);
  if (rejected) return rejected;
  const absent = lawAbsent(err, ctx);
  if (absent) return absent.error;
  return egovHttpErrorToLawError(err);
}

/** 404・404004（改正履歴は 404001）なら LAW_NOT_FOUND の本文（error・hint・next_actions・detail）を作る。当たらなければ null */
function lawAbsent(
  err: unknown,
  ctx: { law_id: string; name: string; law_name?: string; at?: string; absent_code?: LawAbsentCode }
): { error: LawServiceError; reason: string } | null {
  if (!(err instanceof EgovHttpError) || err.status !== 404) return null;
  const code = err.egovErrorCode();
  if (code !== (ctx.absent_code ?? '404004')) return null;
  const reason = ctx.at
    ? `${ctx.name} は ${ctx.at} の時点の e-Gov に収録されていません`
    : `e-Gov に law_id ${ctx.law_id} の法令がありません`;
  return {
    reason,
    error: makeError('LAW_NOT_FOUND', reason, {
      hint: ctx.at
        ? 'その時点にこの法令がまだ無いか、law_id が古い可能性があります。改正履歴で施行日を確かめるか、at を省いて呼び直してください'
        : '略称辞書の law_id が古い（廃止・統合された）か、law_id の書き間違いの可能性があります',
      retryable: false,
      next_actions: lawAbsentNextActions(ctx),
      detail: { status: 404, url: err.url, cause: code },
    }),
  };
}

/** 033 の LAW_NOT_FOUND の next_actions。at を渡し法令名が分かるときは get_law_revisions を先に置く */
function lawAbsentNextActions(ctx: {
  law_id: string;
  law_name?: string;
  at?: string;
}): NextAction[] {
  const out: NextAction[] = [];
  if (ctx.at && ctx.law_name) {
    out.push({
      action: 'get_law_revisions',
      reason: '改正履歴で施行日を確かめ、その法令が e-Gov にある時点を選べます',
      example: { law_name: ctx.law_name },
    });
  }
  out.push(NEXT_ACTIONS.searchLaw(ctx.law_name || ctx.law_id));
  return out;
}

/**
 * 法令本文を取得（キャッシュ経由）
 */
export async function fetchLawData(lawId: string, at?: string): Promise<EgovLawDataResponse> {
  const cacheKey = `${lawId}:${at ?? 'current'}`;
  const cached = lawDataCache.get(cacheKey);
  if (cached) return cached;
  const fresh = await getLawData(lawId, { at });
  lawDataCache.set(cacheKey, fresh);
  return fresh;
}

/** search_law の成功の応答（SPEC-EGOV-SEARCH-LAW-006） */
export interface SearchLawResponse {
  query: { keyword: string; law_type?: string; resolved?: string };
  /** e-Gov で一致した法令の総数（limit で切る前の件数） */
  total_count: number;
  results: Array<{
    law_id: string;
    title: string;
    law_num: string;
    law_type: string;
    promulgation_date?: string;
    url: string;
  }>;
  /** 一致が 0 件のときの案内。1 件以上のときは null（SPEC-EGOV-SEARCH-LAW-017） */
  hint: string | null;
  /** 一致が 0 件のときの次の手。1 件以上のときは []（SPEC-EGOV-SEARCH-LAW-017） */
  next_actions: NextAction[];
}

/**
 * search_law ツールの本実装
 */
export async function searchLawByKeyword(opts: {
  keyword: string;
  law_type?: string;
  limit?: number;
}): Promise<LawServiceResult<SearchLawResponse>> {
  const trimmed = opts.keyword.trim();
  if (!trimmed) {
    return makeError('INVALID_ARGUMENT', 'keyword が空です', {
      hint: '検索したい法令名・略称・キーワード（例: "消費税", "労基"）を指定してください',
    });
  }

  // houki-egov の管轄でない略称（通達など）は e-Gov を引かずに OUT_OF_SCOPE（SPEC-EGOV-SEARCH-LAW-015）
  const scopeError = checkAbbreviationScope(trimmed);
  if (scopeError) return scopeError;

  // 略称が当たれば formal を使って検索。全角英数字・ダッシュ類・全角空白は揃えてから照合する
  // （SPEC-EGOV-SEARCH-LAW-014）。当たらなければ渡した値のまま e-Gov に渡す
  const abbr = resolveAbbreviation(trimmed, { normalize: true });
  const searchTitle = abbr?.formal ?? trimmed;

  const cacheKey = `${searchTitle}|${opts.law_type ?? ''}|${opts.limit ?? 10}`;
  let cached = searchCache.get(cacheKey);

  if (!cached) {
    try {
      const res = await searchLaws({
        law_title: searchTitle,
        law_type: opts.law_type,
        limit: opts.limit ?? 10,
      });
      const laws = res.laws ?? [];
      // total_count は e-Gov で一致した総数（SPEC-EGOV-SEARCH-LAW-006）。応答に無ければ返った件数
      cached = {
        laws,
        total_count: typeof res.total_count === 'number' ? res.total_count : laws.length,
      };
      searchCache.set(cacheKey, cached);
    } catch (err) {
      return egovHttpErrorToLawError(err);
    }
  }
  const { laws, total_count } = cached;

  const empty = laws.length === 0;
  return {
    query: {
      keyword: opts.keyword,
      law_type: opts.law_type,
      resolved: abbr ? abbr.formal : undefined,
    },
    total_count,
    results: laws.map((l) => ({
      law_id: l.law_info.law_id,
      title: l.revision_info.law_title,
      law_num: l.law_info.law_num,
      law_type: l.law_info.law_type,
      promulgation_date: l.law_info.promulgation_date,
      url: EGOV_API.publicLawUrl(l.law_info.law_id),
    })),
    // 0 件のときだけ、題名だけを探したことと次の手を返す。1 件以上は null と []（SPEC-EGOV-SEARCH-LAW-017、T4）
    hint: empty
      ? `「${searchTitle}」を題名に含む法令は e-Gov にありません。search_law は法令の題名だけを探します。条文の本文にある語なら search_fulltext、略称なら resolve_abbreviation を試してください`
      : null,
    next_actions: empty ? searchLawZeroHitActions(opts, trimmed) : [],
  };
}

/** search_law の一致が 0 件のときの next_actions（SPEC-EGOV-SEARCH-LAW-017） */
function searchLawZeroHitActions(
  opts: { keyword: string; law_type?: string; limit?: number },
  trimmed: string
): NextAction[] {
  const out: NextAction[] = [];
  if (opts.law_type !== undefined) {
    out.push({
      action: 'search_law',
      reason: '法令種別を外して探せます',
      example: {
        keyword: opts.keyword,
        ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
      },
    });
  }
  out.push(
    {
      action: 'search_fulltext',
      reason: '条文の本文から語を探せます（ローカル DB がある場合）',
      example: { keyword: trimmed },
    },
    {
      action: 'resolve_abbreviation',
      reason: '略称・通称かどうかを確かめられます',
      example: { abbr: trimmed },
    }
  );
  return out;
}

/**
 * get_law ツールの本実装
 *
 * 条は本則の中だけで探す。附則の条は `suppl_index` で附則を指して取る（SPEC-EGOV-GET-LAW-008・042・043）。
 */
export async function getLawArticle(opts: {
  law_name: string;
  article?: string;
  paragraph?: number;
  /** 号番号。数値（8）か文字列（"8"・"8の2"・"第8号の2"）。v0.6.0 から文字列も受け付ける */
  item?: number | string;
  /** 省くと markdown（article を省くと目次） */
  format?: 'markdown' | 'json' | 'toc';
  /** 附則の番号（get_toc の suppl_provisions[].index と同じ）。渡すと article をその附則の中で探す */
  suppl_index?: number;
  at?: string;
}): Promise<
  LawServiceResult<
    | { format: 'markdown'; markdown: string; meta: ArticleMeta }
    | { format: 'json'; data: ArticleJson; meta: ArticleMeta }
    | { format: 'toc'; markdown: string; meta: ArticleMeta }
  >
> {
  const scopeError = checkAbbreviationScope(opts.law_name);
  if (scopeError) return scopeError;

  // 附則 1 本をまとめて取るのは get_law_range（SPEC-EGOV-GET-LAW-043）。format: toc は suppl_index を使わない
  if (opts.suppl_index !== undefined && !opts.article && opts.format !== 'toc') {
    return makeError('INVALID_ARGUMENT', 'suppl_index を渡すときは article も渡してください', {
      hint: '附則 1 本の条をまとめて取るときは get_law_range の suppl_index を使ってください',
      next_actions: [
        {
          action: 'get_law_range',
          reason: '附則 1 本の本文をまとめて取れます',
          example: { law_name: opts.law_name, suppl_index: opts.suppl_index },
        },
      ],
    });
  }

  // 法令名の検索が通信の失敗で終わったときは SOURCE_*、完全一致が無ければ候補付きの LAW_NOT_FOUND
  // （SPEC-EGOV-COMMON-ERRORS-029・032、SPEC-EGOV-GET-LAW-041）
  const resolved = await resolveLawForTool('get_law', opts);
  if (_isLawServiceError(resolved)) return resolved;

  let lawData: EgovLawDataResponse;
  try {
    lawData = await fetchLawData(resolved.law_id, opts.at);
  } catch (err) {
    return lawFetchErrorToLawError(err, {
      tool: 'get_law',
      law_id: resolved.law_id,
      name: resolved.title,
      law_name: opts.law_name,
      at: opts.at,
    });
  }

  const retrievedAt = new Date().toISOString();

  // toc モード: 目次のみ
  if (opts.format === 'toc' || (!opts.article && opts.format !== 'json')) {
    const toc = extractToc(lawData.law_full_text);
    // 附則は見出しだけ（#24）。中の条まで要るときは get_toc の suppl: "full" を使う
    const supplProvisions = extractSupplProvisions(lawData.law_full_text).map((sp) => ({
      ...sp,
      children: [],
    }));
    const markdown = formatTocMarkdown({
      lawTitle: resolved.title,
      lawId: resolved.law_id,
      toc,
      supplProvisions,
      retrievedAt,
      at: opts.at,
    });
    return {
      format: 'toc',
      markdown,
      meta: {
        law_id: resolved.law_id,
        title: resolved.title,
        law_num: resolved.law_num,
        retrieved_at: retrievedAt,
        url: EGOV_API.publicLawUrl(resolved.law_id),
        // 目次の meta にも時点を置く。渡さないときは null（SPEC-EGOV-GET-LAW-020）
        at: opts.at ?? null,
      },
    };
  }

  // article 指定なし & json モード: メタ情報のみ
  if (!opts.article) {
    return makeError('INVALID_ARGUMENT', 'article（条番号）を指定してください', {
      hint: '目次が必要な場合は format: "toc" を、または get_toc ツールを使ってください',
      next_actions: [NEXT_ACTIONS.getToc(opts.law_name)],
    });
  }

  // article 指定あり: 該当条文を取得
  let articleNum: string;
  try {
    articleNum = toEgovArticleNum(opts.article);
  } catch (err) {
    return makeError('INVALID_ARTICLE_NUM', (err as Error).message, {
      hint: '条番号は "30"、"30の2"、"第三十条"、"第三十条の二" のいずれかの形式で指定してください（位ごとに並べる "三〇" は不可）',
    });
  }

  let article: LawNode | null;
  let suppl: SupplProvisionToc | null = null;
  if (opts.suppl_index !== undefined) {
    // 附則を指したとき: その附則の中だけで条を探す（SPEC-EGOV-GET-LAW-043）
    const located = locateSupplArticle(lawData.law_full_text, opts.suppl_index, articleNum, {
      law_name: opts.law_name,
    });
    if (isError(located)) return located;
    ({ article, suppl } = located);
  } else {
    // 本則の中だけで探す。附則にだけある条番号は附則の番号を案内する（SPEC-EGOV-GET-LAW-008・042）
    article = findArticleInMain(lawData.law_full_text, articleNum);
    if (!article) {
      const inSuppl = findSupplProvisionsWithArticle(lawData.law_full_text, articleNum);
      if (inSuppl.length > 0) {
        return makeError(
          'ARTICLE_NOT_FOUND',
          `条文が見つかりません: ${formatArticleLabel(articleNum)} in ${resolved.title}`,
          {
            hint: `${supplNotInMainLead(articleNum, inSuppl)}。附則の条は suppl_index で附則を指して取ります`,
            next_actions: inSuppl.slice(0, MAX_SUPPL_SUGGESTIONS).map((sp) => ({
              action: 'get_law',
              reason: `${supplName(sp)} の${formatArticleLabel(articleNum)}を取れます`,
              example: { ...passedArgs(opts), suppl_index: sp.index },
            })),
          }
        );
      }
      return makeError(
        'ARTICLE_NOT_FOUND',
        `条文が見つかりません: ${formatArticleLabel(articleNum)} in ${resolved.title}`,
        {
          hint: '法令名・条番号を確認してください。format: "toc" で目次を確認できます',
          next_actions: [NEXT_ACTIONS.getToc(opts.law_name)],
        }
      );
    }
  }
  const articleLabel = `${suppl ? `附則(${suppl.index}) ` : ''}${formatArticleLabel(articleNum)}`;

  let paragraph: LawNode | null = null;
  let item: LawNode | null = null;
  if (opts.paragraph !== undefined) {
    paragraph = findParagraph(article, opts.paragraph);
    if (!paragraph) {
      return makeError(
        'ARTICLE_NOT_FOUND',
        `項が見つかりません: ${articleLabel}第${opts.paragraph}項`,
        {
          hint: '項番号は 1 始まりで指定してください。条文全体が必要なら paragraph を省略してください',
        }
      );
    }
  } else if (opts.item !== undefined) {
    // v0.6.0: item だけが指定されたとき。項が 1 つだけの条は「第14条の3第1号」のように第1項を書かないので、
    // その項の号として探す。項が複数ある条は、どの項の号か決まらないので INVALID_ARGUMENT。
    // v0.5.4 までは paragraph が無いと item を黙って無視し、条全体を返していた
    paragraph = findParagraphForItem(article);
    if (!paragraph) {
      const count = findChildrenByTag(article, 'Paragraph').length;
      return makeError(
        'INVALID_ARGUMENT',
        `${articleLabel}は項が ${count} 個あるため、item（号番号）を指定するときは paragraph（項番号）も指定してください`,
        { hint: '項が 1 つだけの条では paragraph を省略できます' }
      );
    }
  }
  if (opts.item !== undefined && paragraph) {
    let itemNum: string;
    try {
      itemNum = toEgovItemNum(opts.item);
    } catch (err) {
      return makeError('INVALID_ARTICLE_NUM', (err as Error).message, {
        hint: '号番号は 8、"8の2"、"第8号の2"、"八の二" のいずれかの形式で指定してください',
      });
    }
    item = findItem(paragraph, itemNum);
    if (!item) {
      return makeError(
        'ARTICLE_NOT_FOUND',
        `号が見つかりません: ${articleLabel}第${paragraph.attr?.Num ?? ''}項${formatItemLabel(itemNum)}`,
        {
          hint: '号番号は 1 始まりで指定してください。項全体が必要なら item を省略してください',
        }
      );
    }
  }

  const meta: ArticleMeta = {
    law_id: resolved.law_id,
    title: resolved.title,
    law_num: resolved.law_num,
    retrieved_at: retrievedAt,
    url: EGOV_API.publicLawUrl(resolved.law_id),
    // undefined は JSON に出ないので、渡さないときは null を置く（SPEC-EGOV-GET-LAW-020）
    at: opts.at ?? null,
  };

  if (opts.format === 'json') {
    return {
      format: 'json',
      data: {
        article_num: articleNum,
        // 渡さないときは null。item だけで項を補ったときは補った項番号 1（SPEC-EGOV-GET-LAW-024・040）
        paragraph_num: opts.paragraph ?? (opts.item !== undefined ? 1 : null),
        item_num: opts.item ?? null,
        // 附則の条なら附則の番号、本則の条なら null。キーは常に置く（SPEC-EGOV-GET-LAW-043）
        suppl_index: suppl ? suppl.index : null,
        node: item ?? paragraph ?? article,
      },
      meta,
    };
  }

  const markdown = formatArticleMarkdown({
    lawTitle: resolved.title,
    lawId: resolved.law_id,
    article,
    paragraph: paragraph ?? undefined,
    item: item ?? undefined,
    retrievedAt,
    at: opts.at,
    ...(suppl ? { suppl: { index: suppl.index, label: formatSupplProvisionLabel(suppl) } } : {}),
  });
  return { format: 'markdown', markdown, meta };
}

/**
 * 本則の中だけで条を探す（SPEC-EGOV-GET-LAW-008・042、SPEC-EGOV-VERIFY-CITATIONS-046、
 * SPEC-EGOV-GET-ARTICLE-REFERENCES-046）。本則の要素が見つからない本文では、附則の外を探す
 */
function findArticleInMain(root: LawNode, articleNum: string): LawNode | null {
  const main = findMainProvision(root);
  return main ? findArticle(main, articleNum) : findMainArticle(root, articleNum);
}

/** 本則に無い条番号で案内する附則の件数の上限（SPEC-EGOV-GET-LAW-042 ほか） */
const MAX_SUPPL_SUGGESTIONS = 5;

/** 附則の呼び名（`附則(27) 平成八年六月一四日法律第八二号`。制定時の附則は `附則(1) 制定時`） */
function supplName(sp: SupplProvisionToc): string {
  return `附則(${sp.index}) ${sp.amend_law_num ?? '制定時'}`;
}

/** 本則に無く附則にある条番号の案内の前半（SPEC-EGOV-GET-LAW-042・SPEC-EGOV-GET-ARTICLE-REFERENCES-046） */
function supplNotInMainLead(articleNum: string, inSuppl: SupplProvisionToc[]): string {
  return `本則に${formatArticleLabel(articleNum)}はありません。附則に同じ番号の条があります: ${inSuppl
    .map(supplName)
    .join('、')}`;
}

/**
 * 附則の番号と条番号から、その附則の中の条を探す（SPEC-EGOV-GET-LAW-043）。
 * 附則が無ければ RANGE_NOT_FOUND、条が無ければ ARTICLE_NOT_FOUND（項だけの附則なら get_law_range を案内）
 */
function locateSupplArticle(
  root: LawNode,
  index: number,
  articleNum: string,
  ctx: { law_name: string }
): LawServiceResult<{ article: LawNode; suppl: SupplProvisionToc }> {
  const node = findSupplProvisionByIndex(root, index);
  const all = extractSupplProvisions(root);
  if (!node) {
    return makeError('RANGE_NOT_FOUND', `附則(${index}) が見つかりません`, {
      hint:
        all.length > 0
          ? `この法令の附則は ${all.length} 本です（suppl_index は 1〜${all.length}）`
          : 'この法令に附則はありません',
      next_actions: [NEXT_ACTIONS.getToc(ctx.law_name)],
    });
  }
  const summary = all[index - 1];
  const article = findArticle(node, articleNum);
  if (!article) {
    const paragraphOnly = summary.paragraph_only;
    return makeError(
      'ARTICLE_NOT_FOUND',
      `条文が見つかりません: 附則(${index}) ${formatArticleLabel(articleNum)}`,
      {
        hint: paragraphOnly
          ? 'この附則は条を立てず項だけで書かれています。附則の本文は get_law_range の suppl_index で取れます'
          : `附則(${index}) に${formatArticleLabel(articleNum)}はありません（この附則の条は ${summary.article_count} 件）。get_toc の suppl: "full" で附則の中の条を確かめられます`,
        next_actions: paragraphOnly
          ? [
              {
                action: 'get_law_range',
                reason: '項だけで書かれた附則の本文をまとめて取れます',
                example: { law_name: ctx.law_name, suppl_index: index },
              },
            ]
          : [
              {
                action: 'get_toc',
                reason: '附則の中の条を目次で確かめられます',
                example: { law_name: ctx.law_name, suppl: 'full' },
              },
            ],
      }
    );
  }
  return { article, suppl: summary };
}

/** 附則をどこまで返すか（#24、v0.13.0） */
export type SupplMode = 'list' | 'full' | 'none';

/** 附則について何を返したかの内訳（#24、v0.13.0） */
export interface SupplTocSummary {
  /** 実際に適用した mode */
  mode: SupplMode;
  /** この法令が持つ附則の本数（mode に関わらず数える） */
  count: number;
  /** 附則の中の条の総数（mode に関わらず数える） */
  article_count: number;
  /** 改正法の題名を付けた結果（with_amend_titles を指定したときだけ） */
  amend_law_titles?: {
    /** 題名を付けられた附則の数 */
    matched: number;
    /** 改正履歴に該当が無く題名を付けられなかった附則の数 */
    unmatched: number;
    /** 照合に使った改正履歴の件数 */
    revisions: number;
    source: 'law_revisions';
  };
  /** 何をして何を返したかの説明。附則を持つ法令にだけ付く */
  note?: string;
}

/**
 * get_toc ツールの本実装
 *
 * - 本則（`toc`）と附則（`suppl_provisions`）を分けて返す（#24）。附則は改正法ごとに
 *   1 本ずつで、所得税法は 352 本・条 983 件あるため、既定では見出しだけを返す
 * - depth を指定すると上位 N 階層までで打ち切る（民法・会社法のような
 *   大規模法令でレスポンスサイズを抑える用途）
 * - depth=undefined で全階層
 */
export async function getLawToc(opts: {
  law_name: string;
  at?: string;
  depth?: number;
  /** 附則をどこまで返すか。既定は 'list'（見出しと条数だけ） */
  suppl?: SupplMode;
  /** 附則に改正法の題名を付ける（改正履歴を 1 回引く） */
  with_amend_titles?: boolean;
}): Promise<
  LawServiceResult<{
    markdown: string;
    /** 本則の目次。附則は含まない */
    toc: TocNode[];
    /** 附則の目次。改正法ごとに 1 件。mode: 'none' では空配列 */
    suppl_provisions: SupplProvisionToc[];
    suppl: SupplTocSummary;
    meta: ArticleMeta;
    /** 本則の TOC ノード総数。トリミング前/後どちらの値かは truncated を見て判断 */
    node_count: number;
    /** depth 指定で枝を刈ったかどうか */
    truncated: boolean;
  }>
> {
  const scopeError = checkAbbreviationScope(opts.law_name);
  if (scopeError) return scopeError;

  // 法令名の検索が通信の失敗で終わったときは SOURCE_*、完全一致が無ければ候補付きの LAW_NOT_FOUND
  // （SPEC-EGOV-COMMON-ERRORS-029・032）
  const resolved = await resolveLawForTool('get_toc', opts);
  if (_isLawServiceError(resolved)) return resolved;
  let lawData: EgovLawDataResponse;
  try {
    lawData = await fetchLawData(resolved.law_id, opts.at);
  } catch (err) {
    // 404・404004 は LAW_NOT_FOUND、時点の 400・400044 は INVALID_ARGUMENT（SPEC-EGOV-GET-TOC-029）
    return lawFetchErrorToLawError(err, {
      tool: 'get_toc',
      law_id: resolved.law_id,
      name: resolved.title,
      law_name: opts.law_name,
      at: opts.at,
    });
  }
  const retrievedAt = new Date().toISOString();
  const fullToc = extractToc(lawData.law_full_text);
  const fullCount = countTocNodes(fullToc);
  const toc = opts.depth && opts.depth > 0 ? limitTocDepth(fullToc, opts.depth) : fullToc;
  // 枝を刈ったときだけ true（SPEC-EGOV-GET-TOC-010）。depth が構造階層の深さ以上なら何も刈らないので false
  const truncated = countTocNodes(toc) !== fullCount;

  const allSuppl = extractSupplProvisions(lawData.law_full_text);
  const mode: SupplMode = opts.suppl ?? 'list';
  const suppl: SupplTocSummary = {
    mode,
    count: allSuppl.length,
    article_count: allSuppl.reduce((a, sp) => a + sp.article_count, 0),
  };
  let supplProvisions = selectSupplProvisions(allSuppl, mode, opts.depth);
  if (allSuppl.length > 0) {
    suppl.note = SUPPL_NOTES[mode](suppl);
  }
  if (opts.with_amend_titles && supplProvisions.length > 0) {
    const titled = await attachAmendLawTitles(resolved.law_id, supplProvisions);
    supplProvisions = titled.provisions;
    if (titled.amend_law_titles) suppl.amend_law_titles = titled.amend_law_titles;
    if (titled.note) suppl.note = suppl.note ? `${suppl.note}。${titled.note}` : titled.note;
  }

  const markdown = formatTocMarkdown({
    lawTitle: resolved.title,
    lawId: resolved.law_id,
    toc,
    supplProvisions,
    retrievedAt,
    at: opts.at,
  });
  return {
    markdown,
    toc,
    suppl_provisions: supplProvisions,
    suppl,
    meta: {
      law_id: resolved.law_id,
      title: resolved.title,
      law_num: resolved.law_num,
      retrieved_at: retrievedAt,
      url: EGOV_API.publicLawUrl(resolved.law_id),
      at: opts.at ?? null,
    },
    node_count: truncated ? countTocNodes(toc) : fullCount,
    truncated,
  };
}

/** mode に応じて附則の中身を落とす。'full' のときだけ depth を附則の中にも適用する */
function selectSupplProvisions(
  all: SupplProvisionToc[],
  mode: SupplMode,
  depth?: number
): SupplProvisionToc[] {
  if (mode === 'none') return [];
  if (mode === 'list') return all.map((sp) => ({ ...sp, children: [] }));
  if (depth && depth > 0) {
    return all.map((sp) => ({ ...sp, children: limitTocDepth(sp.children, depth) }));
  }
  return all;
}

/** 附則について何をして何を返したかの 1 行 */
const SUPPL_NOTES: Record<SupplMode, (s: SupplTocSummary) => string> = {
  list: (s) =>
    `附則 ${s.count} 本の見出しと条数だけを返しました（条は合計 ${s.article_count} 件）。中の条まで要るときは suppl: "full" を指定してください`,
  full: (s) => `附則 ${s.count} 本の中の条（合計 ${s.article_count} 件）まで返しました`,
  none: (s) => `附則 ${s.count} 本（条 ${s.article_count} 件）は返していません（suppl: "none"）`,
};

/**
 * 附則に改正法の題名を付ける。
 *
 * 附則の属性にあるのは法令番号（`令和七年六月二〇日法律第七四号`）だけなので、
 * 改正履歴（`law_revisions`）を 1 回引き、`amendment_law_num`
 * （`令和七年法律第七十四号`）と照合して題名を取る。公布の月日と漢数字の書き方が
 * 違うため、`lawNumMatchKey()` で「元号 + 年 + 種別 + 号数」に正規化してから比べる。
 *
 * e-Gov の改正履歴は近年の改正が中心で、附則の本数のほうが多い（2026-09-20 実測:
 * 消費税法は附則 167 本に対し改正履歴 65 件で、題名が付くのは 28 本）。
 * 付かなかった件数は `unmatched` で返す。
 */
async function attachAmendLawTitles(
  lawId: string,
  provisions: SupplProvisionToc[]
): Promise<{
  provisions: SupplProvisionToc[];
  amend_law_titles?: SupplTocSummary['amend_law_titles'];
  note?: string;
}> {
  let res: Awaited<ReturnType<typeof getLawRevisions>>;
  try {
    res = await getLawRevisions(lawId);
  } catch (err) {
    // 目次そのものは取れているので、題名だけ諦めて理由を note で返す
    return {
      provisions,
      note: `改正法の題名は付けられませんでした（改正履歴の取得に失敗: ${(err as Error).message}）`,
    };
  }
  const revisions = res.revisions ?? [];
  const titleByKey = new Map<string, string>();
  for (const r of revisions) {
    const key = lawNumMatchKey(r.amendment_law_num);
    if (!key || !r.amendment_law_title) continue;
    if (!titleByKey.has(key)) titleByKey.set(key, r.amendment_law_title);
  }
  let matched = 0;
  let unmatched = 0;
  const withTitles = provisions.map((sp) => {
    // 制定時の附則には改正法が無いので照合しない
    if (!sp.amend_law_num) return sp;
    const key = lawNumMatchKey(sp.amend_law_num);
    const title = key ? titleByKey.get(key) : undefined;
    if (title) {
      matched++;
      return { ...sp, amend_law_title: title };
    }
    unmatched++;
    return sp;
  });
  const note =
    unmatched > 0
      ? `改正法の題名は ${matched} 本に付きました。残り ${unmatched} 本は e-Gov の改正履歴（${revisions.length} 件）に該当が無く、題名は付いていません`
      : undefined;
  return {
    provisions: withTitles,
    amend_law_titles: { matched, unmatched, revisions: revisions.length, source: 'law_revisions' },
    note,
  };
}

/** ツールが返すメタ情報 */
export interface ArticleMeta {
  law_id: string;
  title: string;
  law_num?: string;
  retrieved_at: string;
  url: string;
  /** 渡した時点。渡さないとき（at を受け取らないツールを含む）は null で、キーは消さない（T4） */
  at: string | null;
}

/** JSON 出力時の構造化データ */
export interface ArticleJson {
  article_num: string;
  /** 渡した項番号。渡さないときは null、item だけで項を補ったときは 1 */
  paragraph_num: number | null;
  /** 指定された号番号（引数の値のまま。v0.6.0 から "8の2" のような文字列もありうる）。渡さないときは null */
  item_num: number | string | null;
  /** 附則の条なら附則の番号、本則の条なら null（SPEC-EGOV-GET-LAW-043） */
  suppl_index: number | null;
  node: LawNode;
}

/**
 * get_law_revisions ツールの本実装
 *
 * 法令の改正履歴を取得する。
 * - 略称→正式名解決→law_id 解決を経由
 * - latest=N で最新N件のみ返却（デフォルトは全件）
 */
export async function getLawRevisionsByName(opts: { law_name: string; latest?: number }): Promise<
  LawServiceResult<{
    meta: ArticleMeta;
    total: number;
    revisions: RevisionEntry[];
  }>
> {
  const scopeError = checkAbbreviationScope(opts.law_name);
  if (scopeError) return scopeError;

  // 法令名の検索が通信の失敗で終わったときは SOURCE_*、完全一致が無ければ候補付きの LAW_NOT_FOUND
  // （SPEC-EGOV-COMMON-ERRORS-029・032）
  const resolved = await resolveLawForTool('get_law_revisions', opts);
  if (_isLawServiceError(resolved)) return resolved;
  let res: Awaited<ReturnType<typeof getLawRevisions>>;
  try {
    res = await getLawRevisions(resolved.law_id);
  } catch (err) {
    // 404・404001 は LAW_NOT_FOUND（SPEC-EGOV-GET-LAW-REVISIONS-008）。at を受け取らないので時点の文は使わない
    return lawFetchErrorToLawError(err, {
      tool: 'get_law_revisions',
      law_id: resolved.law_id,
      name: resolved.title,
      law_name: opts.law_name,
      absent_code: '404001',
    });
  }
  const all = sortRevisionsByEnforcementDate((res.revisions ?? []).map(toRevisionEntry));
  // 「最新」は施行日の新しい順の先頭（SPEC-EGOV-GET-LAW-REVISIONS-009・016）
  const trimmed = opts.latest && opts.latest > 0 ? all.slice(0, opts.latest) : all;
  const retrievedAt = new Date().toISOString();
  return {
    meta: {
      law_id: resolved.law_id,
      title: resolved.title,
      law_num: resolved.law_num,
      retrieved_at: retrievedAt,
      url: EGOV_API.publicLawUrl(resolved.law_id),
      // at を受け取らないツールも meta のキーを揃える（SPEC-EGOV-GET-LAW-REVISIONS-002）
      at: null,
    },
    total: all.length,
    revisions: trimmed,
  };
}

/** get_law_revisions の revisions[] の要素。8 つのキーを常に持ち、値の無いキーは null（SPEC-EGOV-GET-LAW-REVISIONS-002） */
export interface RevisionEntry {
  law_revision_id: string | null;
  amendment_promulgate_date: string | null;
  amendment_enforcement_date: string | null;
  amendment_enforcement_comment: string | null;
  amendment_law_num: string | null;
  amendment_law_title: string | null;
  amendment_law_id: string | null;
  /** e-Gov の値のまま（CurrentEnforced / PreviousEnforced / UnEnforced。SPEC-EGOV-GET-LAW-REVISIONS-017） */
  current_revision_status: string | null;
}

/** e-Gov の改正の要素から 8 つのキーだけを取り出し、無いキーは null にする。ほかのフィールドは入れない */
function toRevisionEntry(r: RevisionInfo): RevisionEntry {
  return {
    law_revision_id: r.law_revision_id ?? null,
    amendment_promulgate_date: r.amendment_promulgate_date ?? null,
    amendment_enforcement_date: r.amendment_enforcement_date ?? null,
    amendment_enforcement_comment: r.amendment_enforcement_comment ?? null,
    amendment_law_num: r.amendment_law_num ?? null,
    amendment_law_title: r.amendment_law_title ?? null,
    amendment_law_id: r.amendment_law_id ?? null,
    current_revision_status: r.current_revision_status ?? null,
  };
}

/**
 * 施行日の新しい順に並べる（SPEC-EGOV-GET-LAW-REVISIONS-016）。e-Gov が返す順には頼らない。
 * 施行日が決まっていない（null の）改正は先頭に置く。施行日が同じ改正どうし、null どうしは
 * e-Gov が返した順のまま（Array.prototype.sort は安定ソート）。施行日は YYYY-MM-DD なので文字列で比べる
 */
function sortRevisionsByEnforcementDate(revisions: RevisionEntry[]): RevisionEntry[] {
  return [...revisions].sort((a, b) => {
    const da = a.amendment_enforcement_date;
    const db = b.amendment_enforcement_date;
    if (da === db) return 0;
    if (da === null) return -1;
    if (db === null) return 1;
    return da < db ? 1 : -1;
  });
}

/** テスト用にキャッシュをクリアする */
export function _resetCachesForTest(): void {
  lawDataCache.clear();
  searchCache.clear();
  exactLookupCache.clear();
}

// ========================================
// egov#20: 施行令・施行規則の関連付けと条文内の参照抽出（v0.10.0）
// ========================================

/** 法令番号・法令名の完全一致で引いた結果のキャッシュ。キーは `num:<法令番号>` / `title:<法令名>` */
const exactLookupCache = new LRUCache<string, ExactLawHit | null>(
  CACHE_CONFIG.searchResults.maxSize,
  'ExactLookupCache'
);

/** e-Gov `/laws` で完全一致した 1 件 */
export interface ExactLawHit {
  law_id: string;
  title: string;
  law_num: string;
  law_type: string;
}

function toExactHit(l: LawListItem): ExactLawHit {
  return {
    law_id: l.law_info.law_id,
    title: l.revision_info.law_title,
    law_num: l.law_info.law_num,
    law_type: l.law_info.law_type,
  };
}

/**
 * 法令名が e-Gov に実在するかを確かめる。`/laws?law_title=` は部分一致なので、検索結果の全件の中から
 * `revision_info.law_title` が完全一致する 1 件だけを返す。無ければ null（先頭の法令は使わない。
 * SPEC-EGOV-GET-ARTICLE-REFERENCES-045）。`at` があれば `asof` を付ける。
 * 通信エラーは呼び出し側で扱うため、そのまま投げる。
 */
async function findLawByExactTitle(title: string, at?: string): Promise<ExactLawHit | null> {
  const key = `title:${title}:${at ?? ''}`;
  const cached = exactLookupCache.get(key);
  if (cached !== undefined) return cached;
  const { hit } = await searchAllLaws(
    { law_title: title, asof: at },
    (l) => l.revision_info.law_title === title
  );
  const out = hit ? toExactHit(hit) : null;
  exactLookupCache.set(key, out);
  return out;
}

/**
 * 法令番号（漢数字表記。例: "昭和四十九年法律第百十六号"）で法令を引く。検索結果の全件の中から
 * `law_info.law_num` が完全一致する 1 件だけを返し、無ければ null（SPEC-EGOV-GET-ARTICLE-REFERENCES-045）
 */
async function findLawByNum(lawNum: string, at?: string): Promise<ExactLawHit | null> {
  const key = `num:${lawNum}:${at ?? ''}`;
  const cached = exactLookupCache.get(key);
  if (cached !== undefined) return cached;
  const { hit } = await searchAllLaws(
    { law_num: lawNum, asof: at },
    (l) => l.law_info.law_num === lawNum
  );
  const out = hit ? toExactHit(hit) : null;
  exactLookupCache.set(key, out);
  return out;
}

/** `get_related_laws` の応答 */
export interface RelatedLawsResponse {
  law: { law_id: string; title: string; law_num?: string };
  related: Array<ExactLawHit & { relation: LawRelation; abbr?: string; url: string }>;
  /** 名前を作って e-Gov に問い合わせたが、完全一致する法令が無かった候補 */
  not_found: Array<{ relation: LawRelation; title: string }>;
  method: 'law_name_rule';
  note: string;
  next_actions: NextAction[];
  /** at を受け取らないので at は常に null（SPEC-EGOV-GET-RELATED-LAWS-010） */
  meta: { retrieved_at: string; at: null };
}

/**
 * get_related_laws ツールの本実装
 *
 * 1. law_name を law_id に解決（略称辞書 → e-Gov 検索。既存の resolveLawId）
 * 2. 法令名の規則で候補を作る（law-relations.ts）
 * 3. 候補ごとに e-Gov で実在を確かめ、完全一致した 1 件だけを related に入れる
 */
export async function getRelatedLaws(opts: {
  law_name: string;
}): Promise<LawServiceResult<RelatedLawsResponse>> {
  const scopeError = checkAbbreviationScope(opts.law_name);
  if (scopeError) return scopeError;

  // 法令名の検索が通信の失敗で終わったときは SOURCE_*、完全一致が無ければ候補付きの LAW_NOT_FOUND
  // （SPEC-EGOV-COMMON-ERRORS-029・032）
  const resolved = await resolveLawForTool('get_related_laws', opts);
  if (_isLawServiceError(resolved)) return resolved;

  const related: RelatedLawsResponse['related'] = [];
  const notFound: RelatedLawsResponse['not_found'] = [];
  // 法律でも施行令・施行規則でもない法令（省令・政令・規則・憲法など）からは、名前に「施行令」「施行規則」を
  // 付けた候補を作らない（SPEC-EGOV-GET-RELATED-LAWS-004・020）。種別が分からないとき（略称辞書の日本国憲法は
  // law_type を持たない）も、法律と推定しない
  const notAct = parentActTitle(resolved.title) === null && resolved.law_type !== 'Act';
  if (notAct) {
    return {
      law: {
        law_id: resolved.law_id,
        title: resolved.title,
        ...(resolved.law_num ? { law_num: resolved.law_num } : {}),
      },
      related,
      not_found: notFound,
      method: 'law_name_rule',
      note: `${RELATED_LAWS_NOTE}。${resolved.title} は法律でも施行令・施行規則でもないため、名前の規則で関連法令を作っていません`,
      next_actions: [],
      meta: { retrieved_at: new Date().toISOString(), at: null },
    };
  }
  try {
    for (const cand of relationCandidates(resolved.title)) {
      const hit = await findLawByExactTitle(cand.title);
      if (!hit) {
        notFound.push({ relation: cand.relation, title: cand.title });
        continue;
      }
      const abbr = resolveAbbreviation(hit.title)?.abbr;
      related.push({
        relation: cand.relation,
        ...hit,
        ...(abbr ? { abbr } : {}),
        url: EGOV_API.publicLawUrl(hit.law_id),
      });
    }
  } catch (err) {
    return egovHttpErrorToLawError(err);
  }

  const next_actions: NextAction[] = related.map((r) => ({
    action: 'get_toc',
    reason:
      r.relation === 'parent_act'
        ? '親の法律の目次を見て、委任している条を探せます'
        : `${r.relation === 'enforcement_order' ? '施行令' : '施行規則'}の目次を見て、委任先の条を探せます`,
    example: { law_name: r.title },
  }));

  return {
    law: {
      law_id: resolved.law_id,
      title: resolved.title,
      ...(resolved.law_num ? { law_num: resolved.law_num } : {}),
    },
    related,
    not_found: notFound,
    method: 'law_name_rule',
    note: RELATED_LAWS_NOTE,
    next_actions,
    meta: { retrieved_at: new Date().toISOString(), at: null },
  };
}

/** `get_article_references` の応答 */
export interface ArticleReferencesResponse {
  /** paragraph は指定しないとき null（SPEC-EGOV-GET-ARTICLE-REFERENCES-022） */
  meta: ArticleMeta & { article: string; paragraph: number | null };
  references: ExtractedReference[];
  delegations: Array<
    Delegation & {
      /** 委任先の法令。無い・確かでないときは null で、キーは消さない（SPEC-EGOV-GET-ARTICLE-REFERENCES-031・049） */
      target_law: {
        relation: LawRelation;
        law_id: string;
        title: string;
        url: string;
        /** 委任先がこの法令自身（施行令の本文の「政令で定める」）のとき true */
        self?: true;
      } | null;
    }
  >;
  coverage: { method: 'regex'; note: string };
  next_actions: NextAction[];
}

const ARTICLE_REFERENCES_NOTE =
  '本文の文字列から正規表現で取れた参照だけを返しています。取れなかった参照があっても検出できません。「前項」「同法」「同条」などは解決していません（resolved: false）。法令名の候補が e-Gov に無かった参照も resolved: false のままです。委任先の条は特定していません（target_law は法令単位）。網羅性は保証しません';

/** 1 回の呼び出しで e-Gov に問い合わせる未解決の法令名候補の上限 */
const MAX_CANDIDATE_LOOKUPS = 20;

/**
 * get_article_references ツールの本実装
 *
 * 1. 条（と項）を取得（get_law と同じ解決と取得。条は本則の中だけで探す）
 * 2. 本文の「（法令番号）」を法令番号で解決（e-Gov `/laws?law_num=`。全件から完全一致）
 * 3. reference-extractor で参照と委任を取り出す
 * 4. 名前だけの参照は候補名の完全一致で解決を試みる
 * 5. 委任には施行令・施行規則を付ける。省令・府令は命令の名前が合うときだけ（SPEC-EGOV-GET-ARTICLE-REFERENCES-049）
 */
export async function getArticleReferences(opts: {
  law_name: string;
  article: string;
  paragraph?: number;
  at?: string;
}): Promise<LawServiceResult<ArticleReferencesResponse>> {
  const tool = 'get_article_references';
  const scopeError = checkAbbreviationScope(opts.law_name);
  if (scopeError) return scopeError;

  // 法令名の検索が通信の失敗で終わったときは SOURCE_*、完全一致が無ければ候補付きの LAW_NOT_FOUND
  // （SPEC-EGOV-COMMON-ERRORS-029・032、SPEC-EGOV-GET-ARTICLE-REFERENCES-044）
  const resolved = await resolveLawForTool(tool, opts);
  if (_isLawServiceError(resolved)) return resolved;

  let articleNum: string;
  try {
    articleNum = toEgovArticleNum(opts.article);
  } catch (err) {
    return makeError('INVALID_ARTICLE_NUM', (err as Error).message, {
      hint: '条番号は "30"、"30の2"、"第三十条"、"第三十条の二" のいずれかの形式で指定してください',
    });
  }

  let lawData: EgovLawDataResponse;
  try {
    lawData = await fetchLawData(resolved.law_id, opts.at);
  } catch (err) {
    // 404・404004 は LAW_NOT_FOUND、時点の 400・400044 は INVALID_ARGUMENT（SPEC-EGOV-GET-ARTICLE-REFERENCES-051）
    return lawFetchErrorToLawError(err, {
      tool,
      law_id: resolved.law_id,
      name: resolved.title,
      law_name: opts.law_name,
      at: opts.at,
    });
  }

  // 対象の条は本則の中だけで探す（SPEC-EGOV-GET-ARTICLE-REFERENCES-046）
  const article = findArticleInMain(lawData.law_full_text, articleNum);
  if (!article) {
    const inSuppl = findSupplProvisionsWithArticle(lawData.law_full_text, articleNum);
    if (inSuppl.length > 0) {
      return makeError(
        'ARTICLE_NOT_FOUND',
        `条文が見つかりません: ${formatArticleLabel(articleNum)} in ${resolved.title}`,
        {
          hint: `${supplNotInMainLead(articleNum, inSuppl)}。このツールは本則の条だけを対象にします。附則の条の本文は get_law の suppl_index で読めます`,
          next_actions: inSuppl.slice(0, MAX_SUPPL_SUGGESTIONS).map((sp) => ({
            action: 'get_law',
            reason: `${supplName(sp)} の${formatArticleLabel(articleNum)}の本文を読めます`,
            example: { law_name: opts.law_name, article: opts.article, suppl_index: sp.index },
          })),
        }
      );
    }
    return makeError(
      'ARTICLE_NOT_FOUND',
      `条文が見つかりません: ${formatArticleLabel(articleNum)} in ${resolved.title}`,
      {
        hint: '法令名・条番号を確認してください。get_toc で目次を確認できます',
        next_actions: [NEXT_ACTIONS.getToc(opts.law_name)],
      }
    );
  }
  let scope: LawNode = article;
  if (opts.paragraph !== undefined) {
    const paragraph = findParagraph(article, opts.paragraph);
    if (!paragraph) {
      return makeError(
        'ARTICLE_NOT_FOUND',
        `項が見つかりません: ${formatArticleLabel(articleNum)}第${opts.paragraph}項`,
        {
          hint: '項番号は 1 始まりで指定してください。条全体が必要なら paragraph を省略してください',
        }
      );
    }
    scope = paragraph;
  }

  // 見出し（ArticleCaption / ArticleTitle）は参照の対象外。本文の Sentence だけを、項ごとにつなぐ
  const segments = collectSentenceSegments(scope, opts.paragraph);
  const text = segments.map((seg) => seg.text).join('\n');

  try {
    // 2. 「（法令番号）」を法令番号で解決（全件から完全一致。SPEC-EGOV-GET-ARTICLE-REFERENCES-045）
    const resolvedByNum: KnownLaw[] = [];
    for (const mention of findLawNumMentions(text)) {
      const hit = await findLawByNum(mention.law_num, opts.at);
      if (hit) resolvedByNum.push({ title: hit.title, law_id: hit.law_id, law_num: hit.law_num });
    }

    // 3. 抽出（項ごとに行い、「第三号」のように条も項も無い参照にはその項の番号を付ける）
    const parentTitle = parentActTitle(resolved.title);
    const parentAct = parentTitle ? await findLawByExactTitle(parentTitle, opts.at) : null;
    // 施行規則の本文の「令」は、兄弟の施行令が実在するときだけ解決する（SPEC-EGOV-GET-ARTICLE-REFERENCES-048）
    const isRule = parentTitle !== null && resolved.title.endsWith('施行規則');
    const siblingOrder = isRule ? await findLawByExactTitle(`${parentTitle}施行令`, opts.at) : null;
    const ctx = {
      resolvedByNum,
      knownLaws: dictionaryKnownLaws(),
      ...(parentAct
        ? {
            parentAct: {
              title: parentAct.title,
              law_id: parentAct.law_id,
              law_num: parentAct.law_num,
            },
          }
        : {}),
      ...(siblingOrder
        ? {
            siblingOrder: {
              title: siblingOrder.title,
              law_id: siblingOrder.law_id,
              law_num: siblingOrder.law_num,
            },
          }
        : {}),
    };
    const extracted: { references: ExtractedReference[]; delegations: Delegation[] } = {
      references: [],
      delegations: [],
    };
    for (const seg of segments) {
      const part = extractReferences(seg.text, ctx);
      for (const ref of part.references) {
        if (
          ref.kind === 'internal' &&
          ref.article === undefined &&
          ref.paragraph === undefined &&
          seg.paragraph !== undefined
        ) {
          ref.paragraph = seg.paragraph;
        }
        extracted.references.push(ref);
      }
      for (const d of part.delegations) {
        const cur = extracted.delegations.find((x) => x.raw === d.raw);
        if (cur) cur.count += d.count;
        else extracted.delegations.push({ ...d });
      }
    }

    // 4. 名前だけの参照を、候補名の完全一致で解決する（上限あり。全件から探す。045）
    const candidates = new Map<string, ExactLawHit | null>();
    for (const ref of extracted.references) {
      if (ref.kind !== 'external' || ref.resolved) continue;
      if (!candidates.has(ref.law_name)) {
        if (candidates.size >= MAX_CANDIDATE_LOOKUPS) continue;
        candidates.set(ref.law_name, await findLawByExactTitle(ref.law_name, opts.at));
      }
      const hit = candidates.get(ref.law_name);
      if (hit) {
        ref.law_name = hit.title;
        ref.law_num = hit.law_num;
        ref.law_id = hit.law_id;
        ref.resolved = true;
      }
    }

    // 5. 委任先（法令単位）。確かなときだけ付け、それ以外は null（012・031・049）
    const targets = new Map<LawRelation, ExactLawHit | null>();
    const delegations: ArticleReferencesResponse['delegations'] = [];
    for (const d of extracted.delegations) {
      const relation: LawRelation = d.target;
      if (!targets.has(relation)) {
        const base = parentTitle ?? resolved.title;
        const title = relation === 'enforcement_order' ? `${base}施行令` : `${base}施行規則`;
        targets.set(relation, await findLawByExactTitle(title, opts.at));
      }
      const hit = targets.get(relation) ?? null;
      const self = hit !== null && hit.law_id === resolved.law_id;
      // 省令・府令の委任は、施行規則の法令番号の命令の名前が委任の文言と合うときだけ（自身を指すときは今までどおり）
      const sure =
        hit !== null &&
        (relation === 'enforcement_order' || self || ordinanceMatches(hit.law_num, d.raw));
      delegations.push({
        ...d,
        target_law:
          hit && sure
            ? {
                relation,
                law_id: hit.law_id,
                title: hit.title,
                url: EGOV_API.publicLawUrl(hit.law_id),
                // 施行令の本文に出る「政令で定める」は、その施行令自身を指す
                ...(self ? { self: true as const } : {}),
              }
            : null,
      });
    }

    const retrievedAt = new Date().toISOString();
    return {
      meta: {
        law_id: resolved.law_id,
        title: resolved.title,
        law_num: resolved.law_num,
        retrieved_at: retrievedAt,
        url: EGOV_API.publicLawUrl(resolved.law_id),
        at: opts.at ?? null,
        article: fromEgovArticleNum(articleNum),
        paragraph: opts.paragraph ?? null,
      },
      references: extracted.references,
      delegations,
      coverage: { method: 'regex', note: ARTICLE_REFERENCES_NOTE },
      next_actions: buildReferenceNextActions(
        resolved.title,
        articleNum,
        extracted.references,
        delegations
      ),
    };
  } catch (err) {
    // 参照から他の法令を引く検索の 400・400044 も INVALID_ARGUMENT（051）
    return asofRejected(err, tool, opts.at) ?? egovHttpErrorToLawError(err);
  }
}

/**
 * 施行規則を定めた命令の名前（法令番号の「年」と「第」の間。例: `大蔵省令`）と、委任の文言の命令の名前が
 * 同じ省に当たるかを、省の改称の表で確かめる（SPEC-EGOV-GET-ARTICLE-REFERENCES-049）。
 * 連名（`内閣府・総務省令`）は名前が同じときだけ当たる。`主務省令` はどれにも当たらない。
 */
const ORDINANCE_RENAMES: Record<string, string> = {
  大蔵省令: '財務省令',
  厚生省令: '厚生労働省令',
  労働省令: '厚生労働省令',
  通商産業省令: '経済産業省令',
  運輸省令: '国土交通省令',
  建設省令: '国土交通省令',
  郵政省令: '総務省令',
  自治省令: '総務省令',
  文部省令: '文部科学省令',
  農林省令: '農林水産省令',
  総理府令: '内閣府令',
};

function ordinanceMatches(ruleLawNum: string, delegationRaw: string): boolean {
  const delegated = delegationRaw.replace(/で定める$/, '');
  if (delegated === '主務省令') return false;
  const m = /年(.+?)第[〇一二三四五六七八九十百千]+号$/.exec(ruleLawNum);
  if (!m) return false;
  const issuer = m[1];
  return issuer === delegated || ORDINANCE_RENAMES[issuer] === delegated;
}

/** 本文の Sentence を項ごとにまとめたもの。paragraph は項番号（条の直下の文など、項に属さないものは undefined） */
interface SentenceSegment {
  paragraph?: number;
  text: string;
}

/** ノード以下の Sentence の文字列を集める（見出し・条名・項番号・号名は含めない） */
function collectSentenceText(node: LawNode): string {
  const parts: string[] = [];
  const walk = (n: LawNode | string): void => {
    if (typeof n === 'string') return;
    if (n.tag === 'Sentence') {
      parts.push(extractText(n));
      return;
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return parts.join('\n');
}

/**
 * 条（または項）の本文を、項ごとの segment にする。
 * 条を渡したときは Paragraph 子要素ごとに 1 つ、項を渡したときは 1 つ。
 */
function collectSentenceSegments(scope: LawNode, paragraphNum?: number): SentenceSegment[] {
  if (scope.tag === 'Paragraph') {
    const num = paragraphNum ?? Number(scope.attr?.Num);
    return [
      { ...(Number.isInteger(num) ? { paragraph: num } : {}), text: collectSentenceText(scope) },
    ];
  }
  const out: SentenceSegment[] = [];
  for (const c of scope.children ?? []) {
    if (typeof c === 'string') continue;
    if (c.tag === 'Paragraph') {
      const num = Number(c.attr?.Num);
      const text = collectSentenceText(c);
      if (text) out.push({ ...(Number.isInteger(num) ? { paragraph: num } : {}), text });
    } else if (c.tag !== 'ArticleCaption' && c.tag !== 'ArticleTitle') {
      const text = collectSentenceText(c);
      if (text) out.push({ text });
    }
  }
  return out;
}

/** 略称辞書のうち houki-egov 管轄で law_id を持つエントリを、名前照合用の一覧にする（起動中は変わらない） */
let dictionaryKnownLawsCache: KnownLaw[] | null = null;
function dictionaryKnownLaws(): KnownLaw[] {
  if (dictionaryKnownLawsCache) return dictionaryKnownLawsCache;
  const out: KnownLaw[] = [];
  const seen = new Set<string>();
  for (const e of listBySourceMcpHint('houki-egov')) {
    if (!e.law_id || seen.has(e.formal)) continue;
    seen.add(e.formal);
    out.push({ title: e.formal, law_id: e.law_id, ...(e.law_num ? { law_num: e.law_num } : {}) });
  }
  dictionaryKnownLawsCache = out;
  return out;
}

/** 解決できた参照と委任から、次に呼べる get_law / search_fulltext を組み立てる（重複は除く） */
function buildReferenceNextActions(
  selfTitle: string,
  articleNum: string,
  references: ExtractedReference[],
  delegations: ArticleReferencesResponse['delegations']
): NextAction[] {
  const out: NextAction[] = [];
  const seen = new Set<string>();
  const push = (a: NextAction): void => {
    const key = JSON.stringify(a.example ?? a);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(a);
  };
  for (const ref of references) {
    // relative と、どの附則か決まらない「附則第N条」（SPEC-EGOV-GET-ARTICLE-REFERENCES-047）からは作らない
    if (ref.kind === 'relative' || ref.kind === 'suppl') continue;
    if (ref.kind === 'external' && !ref.resolved) continue;
    const lawName = ref.kind === 'external' ? ref.law_name : selfTitle;
    const article = ref.article ?? fromEgovArticleNum(articleNum);
    push({
      action: 'get_law',
      reason: ref.kind === 'external' ? '引用先の条を読めます' : '同一法令内の参照先を読めます',
      example: {
        law_name: lawName,
        article,
        ...(ref.paragraph !== undefined ? { paragraph: ref.paragraph } : {}),
        ...(ref.item !== undefined ? { item: ref.item } : {}),
      },
    });
  }
  // 下位法令の本文は親を「法」（施行令）や「令」（施行規則から見た施行令）と書く
  const selfLabel = selfTitle.endsWith('施行令')
    ? '令'
    : selfTitle.endsWith('施行規則')
      ? '規則'
      : '法';
  for (const d of delegations) {
    if (!d.target_law || d.target_law.self) continue;
    // 施行規則の条からは、施行令への委任の search_fulltext を作らない。施行令は施行規則の条を「規則第N条」と
    // 書かないため、当たる見込みが低い（SPEC-EGOV-GET-ARTICLE-REFERENCES-050）
    if (selfLabel === '規則' && d.target === 'enforcement_order') continue;
    push({
      action: 'search_fulltext',
      reason: `${d.target_law.title}の中で${formatArticleLabel(articleNum)}を受けている条を探せます（ローカル DB がある場合。無ければ get_toc で目次から探してください）`,
      example: {
        keyword: `${d.target_law.title} ${selfLabel}${toKanjiArticleLabel(articleNum)}`,
      },
    });
  }
  return out;
}

/** e-Gov 形式の条番号を本文中の表記（「第五十七条の二」）にする。search_fulltext のキーワード用 */
function toKanjiArticleLabel(num: string): string {
  const [head, ...branches] = num.split('_');
  return `第${numberToKanji(Number(head))}条${branches.map((b) => `の${numberToKanji(Number(b))}`).join('')}`;
}

/** 1〜9999 を位取りの漢数字にする（"57" → "五十七"） */
function numberToKanji(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 9999) return String(n);
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const units: Array<[number, string]> = [
    [1000, '千'],
    [100, '百'],
    [10, '十'],
  ];
  let rest = n;
  let out = '';
  for (const [unit, label] of units) {
    const d = Math.floor(rest / unit);
    if (d > 0) out += `${d === 1 ? '' : digits[d]}${label}`;
    rest %= unit;
  }
  if (rest > 0) out += digits[rest];
  return out;
}

// ========================================
// egov#18: 引用の実在確認（v0.11.0）
// ========================================

/** `verify_citations` に渡す引用 1 件 */
export interface CitationInput {
  /** 法令名または略称。law_id と両方省略はできない */
  law_name?: string;
  /** e-Gov の law_id。law_name より優先する */
  law_id?: string;
  /** 条番号。"30" / "30の2" / "第三十条の二" */
  article: string;
  /** 項番号 */
  paragraph?: number;
  /** 号番号 */
  item?: number | string;
  /** 附則の番号（get_toc の suppl_provisions[].index と同じ）。省くと本則の条を確かめる（SPEC-EGOV-VERIFY-CITATIONS-046・047） */
  suppl_index?: number;
  /** 引用元の表示文字列。判定には使わず、そのまま返す */
  label?: string;
}

/** 実在が確かめられた法令 */
export interface VerifiedLaw {
  law_id: string;
  title: string;
  law_num?: string;
  law_type?: string;
  url: string;
}

/** 引用 1 件の判定 */
export interface CitationVerdict {
  /** 入力の citations 配列での位置（0 始まり） */
  index: number;
  /** 入力をそのまま返す */
  input: CitationInput;
  /**
   * - `found`: 指定された粒度（条、項、号）まで法令に実在した
   * - `not_found`: 法令名・条・項・号のいずれかが無かった
   * - `ambiguous`: どの法令・どの項を指すか決まらなかった
   */
  status: 'found' | 'not_found' | 'ambiguous';
  /** 法令が 1 つに決まったときの法令。候補が複数の ambiguous では入らない */
  law?: VerifiedLaw;
  /** 法令をどう引いたか */
  resolved_by?: 'law_id' | 'abbreviation' | 'exact_title';
  /** 条が実在したときの条番号（e-Gov 形式）・表示ラベル・条見出し・附則の番号（本則の条は null） */
  article?: { num: string; label: string; caption?: string; suppl_index: number | null };
  /** 項が実在したときの項番号 */
  paragraph?: number;
  /** 号が実在したときの号番号（e-Gov 形式） */
  item?: string;
  /** family のエラー語彙で言えるときだけ付く。候補が複数の ambiguous には付かない */
  code?: LawErrorCode;
  /** found 以外のときの理由（1 文） */
  reason?: string;
  /** 法令名が完全一致しなかったときの部分一致の候補 */
  candidates?: VerifiedLaw[];
  /** found 以外のときだけ付く */
  next_actions?: NextAction[];
}

/** `verify_citations` の応答 */
export interface VerifyCitationsResponse {
  summary: {
    total: number;
    found: number;
    not_found: number;
    ambiguous: number;
    /** 全件が found なら true */
    all_found: boolean;
  };
  results: CitationVerdict[];
  method: 'per_citation_lookup';
  note: string;
  /** at は渡さないとき null（SPEC-EGOV-VERIFY-CITATIONS-021） */
  meta: { retrieved_at: string; at: string | null };
}

/** ambiguous のときに返す候補の上限 */
const MAX_CITATION_CANDIDATES = 5;

const VERIFY_CITATIONS_NOTE =
  '各件について「その条（指定があれば項・号）が e-Gov の法令にあるか」だけを確かめています。引用した条文が主張を支えるかどうかは判定していません。法令名が e-Gov の法令名と完全一致しなかった件は、部分一致の候補があれば ambiguous にし、候補を candidates に入れます（最大 5 件、code は付きません）。e-Gov に問い合わせられなかったときは件ごとの判定を返さず、ツール全体のエラー（SOURCE_*）を返します';

/** 法令の解決結果 */
type LawResolution =
  | { kind: 'ok'; law: VerifiedLaw; resolved_by: 'law_id' | 'abbreviation' | 'exact_title' }
  | { kind: 'not_found'; code: LawErrorCode; reason: string; next_actions: NextAction[] }
  | { kind: 'ambiguous'; reason: string; candidates: VerifiedLaw[]; next_actions: NextAction[] };

function toVerifiedLaw(hit: {
  law_id: string;
  title: string;
  law_num?: string;
  law_type?: string;
}): VerifiedLaw {
  return {
    law_id: hit.law_id,
    title: hit.title,
    ...(hit.law_num ? { law_num: hit.law_num } : {}),
    ...(hit.law_type ? { law_type: hit.law_type } : {}),
    url: EGOV_API.publicLawUrl(hit.law_id),
  };
}

/**
 * verify_citations の 1 件の処理で、ツール全体のエラーにする失敗。e-Gov との通信の失敗と、
 * e-Gov が時点を受け付けないと答えたとき（400・400044。at は全件に共通。SPEC-EGOV-VERIFY-CITATIONS-048）
 */
class VerifyAbort extends Error {
  constructor(public readonly error: LawServiceError) {
    super(error.error);
    this.name = 'VerifyAbort';
  }
}

/**
 * 法令本文の取得の失敗を、件ごとの LAW_NOT_FOUND にするか、ツール全体のエラーにするかを決める。
 * 404・404004 だけが件ごとの LAW_NOT_FOUND（SPEC-EGOV-VERIFY-CITATIONS-015）。400044 はツール全体の
 * INVALID_ARGUMENT、そのほかの 400 と通信の失敗はツール全体の SOURCE_*（048）
 */
function verifyFetchFailure(
  err: unknown,
  ctx: { law_id: string; name: string; law_name?: string; at?: string }
): { reason: string; next_actions: NextAction[] } {
  const rejected = asofRejected(err, 'verify_citations', ctx.at);
  if (rejected) throw new VerifyAbort(rejected);
  const absent = lawAbsent(err, ctx);
  if (absent) return { reason: absent.reason, next_actions: absent.error.next_actions ?? [] };
  throw err;
}

/**
 * verify_citations ツールの本実装（egov#18）
 *
 * 1. 引数の形だけを先に確かめる（citations が空、law_name と law_id のどちらも無い件）
 * 2. 引用ごとに法令 → 条 → 項 → 号 の順で実在を確かめる
 * 3. 件ごとの判定を results に入れ、ツール全体は isError にしない
 *
 * e-Gov に問い合わせられなかったとき（タイムアウト・接続不能・5xx）だけ、件ごとの判定ではなく
 * ツール全体のエラーを返す。「聞けなかった」を「存在しない」と書かないため。
 */
export async function verifyCitations(opts: {
  citations: CitationInput[];
  at?: string;
}): Promise<LawServiceResult<VerifyCitationsResponse>> {
  const citations = opts.citations ?? [];
  if (citations.length === 0) {
    return makeError('INVALID_ARGUMENT', 'citations が空です', {
      hint: '確かめたい引用を 1 件以上入れてください（law_name か law_id と、article）',
    });
  }

  const missing = citations
    .map((c, i) => (!c.law_name?.trim() && !c.law_id?.trim() ? i : -1))
    .filter((i) => i >= 0);
  if (missing.length > 0) {
    return makeError(
      'INVALID_ARGUMENT',
      `law_name と law_id のどちらも無い引用があります: ${missing.map((i) => `citations[${i}]`).join(', ')}`,
      {
        hint: '引用ごとに law_name（略称も可）か law_id のどちらかを入れてください',
        detail: {
          issues: missing.map((i) => ({
            path: `citations.${i}`,
            message: 'law_name か law_id のどちらかが要ります',
          })),
        },
      }
    );
  }

  const limit = createLimit(HTTP_CONFIG.concurrency);
  /** 同じ法令を同時に二度引かないための、この呼び出しの中だけの表 */
  const inFlight = new Map<string, Promise<LawResolution>>();
  let transportError: LawServiceError | null = null;

  const settled = await Promise.all(
    citations.map((citation, index) =>
      limit(async (): Promise<CitationVerdict | null> => {
        try {
          return await verifyOneCitation(citation, index, opts.at, inFlight);
        } catch (err) {
          transportError ??=
            err instanceof VerifyAbort
              ? err.error
              : (asofRejected(err, 'verify_citations', opts.at) ?? egovHttpErrorToLawError(err));
          return null;
        }
      })
    )
  );
  if (transportError) return transportError;

  const results = settled.filter((v): v is CitationVerdict => v !== null);
  const counts = { found: 0, not_found: 0, ambiguous: 0 };
  for (const v of results) counts[v.status]++;

  return {
    summary: {
      total: results.length,
      ...counts,
      all_found: counts.found === results.length,
    },
    results,
    method: 'per_citation_lookup',
    note: VERIFY_CITATIONS_NOTE,
    meta: {
      retrieved_at: new Date().toISOString(),
      at: opts.at ?? null,
    },
  };
}

/** 引用 1 件を確かめる。ツール全体のエラーにする失敗（通信の失敗、時点の 400）は呼び出し側に投げる */
async function verifyOneCitation(
  citation: CitationInput,
  index: number,
  at: string | undefined,
  inFlight: Map<string, Promise<LawResolution>>
): Promise<CitationVerdict> {
  const base = { index, input: citation };

  const lawId = citation.law_id?.trim();
  const lawName = (citation.law_name ?? '').trim();
  const key = lawId ? `id:${lawId}` : `name:${lawName}`;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = resolveLawForVerify({ law_id: lawId, law_name: lawName }, at);
    inFlight.set(key, pending);
  }
  const resolution = await pending;

  if (resolution.kind === 'not_found') {
    // law_id で引いた判定は同じ law_id の件で使い回すので、search_law の keyword は
    // 件ごとの law_name（無ければ law_id）で決め直す（#70）
    const nextActions =
      lawId && resolution.code === 'LAW_NOT_FOUND'
        ? lawAbsentNextActions({ law_id: lawId, law_name: lawName || undefined, at })
        : resolution.next_actions;
    return {
      ...base,
      status: 'not_found',
      code: resolution.code,
      reason: resolution.reason,
      next_actions: nextActions,
    };
  }
  if (resolution.kind === 'ambiguous') {
    return {
      ...base,
      status: 'ambiguous',
      reason: resolution.reason,
      candidates: resolution.candidates,
      next_actions: resolution.next_actions,
    };
  }

  const law = resolution.law;
  const found: CitationVerdict = {
    ...base,
    status: 'found',
    law,
    resolved_by: resolution.resolved_by,
  };
  const nameForActions = lawName || law.title;

  // 条番号の書き方
  let articleNum: string;
  try {
    articleNum = toEgovArticleNum(citation.article);
  } catch (err) {
    return {
      ...found,
      status: 'not_found',
      code: 'INVALID_ARTICLE_NUM',
      reason: (err as Error).message,
      next_actions: [NEXT_ACTIONS.getToc(nameForActions)],
    };
  }

  // 本文を取る（404・404004 は件ごとの LAW_NOT_FOUND。SPEC-EGOV-VERIFY-CITATIONS-015）
  let lawData: EgovLawDataResponse;
  try {
    lawData = await fetchLawData(law.law_id, at);
  } catch (err) {
    const failure = verifyFetchFailure(err, {
      law_id: law.law_id,
      name: resolution.resolved_by === 'law_id' ? law.law_id : law.title,
      law_name: lawName || undefined,
      at,
    });
    return {
      ...base,
      status: 'not_found',
      code: 'LAW_NOT_FOUND',
      reason: failure.reason,
      next_actions: failure.next_actions,
    };
  }

  // 条。suppl_index があればその附則の中、無ければ本則の中だけで探す（SPEC-EGOV-VERIFY-CITATIONS-046・047）
  let article: LawNode | null;
  const supplIndex = citation.suppl_index;
  if (supplIndex !== undefined) {
    const node = findSupplProvisionByIndex(lawData.law_full_text, supplIndex);
    if (!node) {
      const count = extractSupplProvisions(lawData.law_full_text).length;
      return {
        ...found,
        status: 'not_found',
        code: 'ARTICLE_NOT_FOUND',
        reason: `${law.title}に附則(${supplIndex})はありません（附則は ${count} 本）`,
        next_actions: [NEXT_ACTIONS.getToc(nameForActions)],
      };
    }
    article = findArticle(node, articleNum);
    if (!article) {
      return {
        ...found,
        status: 'not_found',
        code: 'ARTICLE_NOT_FOUND',
        reason: `${law.title}の附則(${supplIndex})に${formatArticleLabel(articleNum)}はありません`,
        next_actions: [NEXT_ACTIONS.getToc(nameForActions)],
      };
    }
  } else {
    article = findArticleInMain(lawData.law_full_text, articleNum);
    if (!article) {
      const inSuppl = findSupplProvisionsWithArticle(lawData.law_full_text, articleNum);
      return {
        ...found,
        status: 'not_found',
        code: 'ARTICLE_NOT_FOUND',
        reason:
          inSuppl.length > 0
            ? `${law.title}の${supplNotInMainLead(articleNum, inSuppl)}`
            : `${law.title}に${formatArticleLabel(articleNum)}はありません`,
        next_actions: [
          ...inSuppl.slice(0, MAX_SUPPL_SUGGESTIONS).map((sp) => ({
            action: 'get_law',
            reason: `${supplName(sp)} の${formatArticleLabel(articleNum)}を確かめられます`,
            example: { law_name: nameForActions, article: citation.article, suppl_index: sp.index },
          })),
          NEXT_ACTIONS.getToc(nameForActions),
        ],
      };
    }
  }
  const caption = getArticleCaption(article);
  const label = `${supplIndex !== undefined ? `附則(${supplIndex}) ` : ''}${formatArticleLabel(articleNum)}`;
  found.article = {
    num: articleNum,
    label,
    ...(caption ? { caption } : {}),
    suppl_index: supplIndex ?? null,
  };
  const articleLabel = `${law.title}${label}`;

  // 項
  let paragraph: LawNode | null = null;
  if (citation.paragraph !== undefined) {
    paragraph = findParagraph(article, citation.paragraph);
    if (!paragraph) {
      const count = findChildrenByTag(article, 'Paragraph').length;
      return {
        ...found,
        status: 'not_found',
        code: 'ARTICLE_NOT_FOUND',
        reason: `${articleLabel}に第${citation.paragraph}項はありません（項は ${count} 個）`,
        next_actions: [NEXT_ACTIONS.getToc(nameForActions)],
      };
    }
    found.paragraph = citation.paragraph;
  } else if (citation.item !== undefined) {
    // 項が 1 つだけの条は「第14条の3第1号」のように第1項を書かない。項が複数ある条で
    // 号だけを書いた引用は、どの項の号か決まらないので ambiguous にする
    paragraph = findParagraphForItem(article);
    if (!paragraph) {
      const count = findChildrenByTag(article, 'Paragraph').length;
      return {
        ...found,
        status: 'ambiguous',
        code: 'INVALID_ARGUMENT',
        reason: `${articleLabel}は項が ${count} 個あるため、号だけではどの項の号か決まりません`,
        next_actions: [
          {
            action: 'add_paragraph',
            reason: '同じ引用に paragraph（項番号）を足すと判定できます',
            example: { law_name: nameForActions, article: citation.article, paragraph: 1 },
          },
        ],
      };
    }
    found.paragraph = Number(paragraph.attr?.Num ?? '1');
  }

  // 号
  if (citation.item !== undefined && paragraph) {
    let itemNum: string;
    try {
      itemNum = toEgovItemNum(citation.item);
    } catch (err) {
      return {
        ...found,
        status: 'not_found',
        code: 'INVALID_ARTICLE_NUM',
        reason: (err as Error).message,
        next_actions: [NEXT_ACTIONS.getToc(nameForActions)],
      };
    }
    if (!findItem(paragraph, itemNum)) {
      const count = findChildrenByTag(paragraph, 'Item').length;
      return {
        ...found,
        status: 'not_found',
        code: 'ARTICLE_NOT_FOUND',
        reason: `${articleLabel}第${found.paragraph}項に${formatItemLabel(itemNum)}はありません（号は ${count} 個）`,
        next_actions: [NEXT_ACTIONS.getToc(nameForActions)],
      };
    }
    found.item = itemNum;
  }

  return found;
}

/**
 * 引用 1 件の法令を決める。
 *
 * 1. law_id があれば e-Gov から本文を取り、正式名称・法令番号を添える
 * 2. 略称辞書が houki-egov 以外の管轄と判定したら OUT_OF_SCOPE
 * 3. 略称辞書に law_id があればそれを使う
 * 4. 無ければ e-Gov の部分一致検索を全件まで引き（at があれば asof を付ける）、法令名が完全一致した 1 件だけを採る。
 *    完全一致が無く候補があれば ambiguous、候補も無ければ LAW_NOT_FOUND（SPEC-EGOV-VERIFY-CITATIONS-045）
 */
async function resolveLawForVerify(
  ref: { law_id?: string; law_name: string },
  at?: string
): Promise<LawResolution> {
  if (ref.law_id) {
    try {
      const data = await fetchLawData(ref.law_id, at);
      return {
        kind: 'ok',
        resolved_by: 'law_id',
        law: toVerifiedLaw({
          law_id: data.law_info?.law_id ?? ref.law_id,
          title: data.revision_info?.law_title ?? ref.law_id,
          law_num: data.law_info?.law_num,
          law_type: data.law_info?.law_type,
        }),
      };
    } catch (err) {
      const failure = verifyFetchFailure(err, {
        law_id: ref.law_id,
        name: ref.law_id,
        law_name: ref.law_name || undefined,
        at,
      });
      return {
        kind: 'not_found',
        code: 'LAW_NOT_FOUND',
        reason: failure.reason,
        next_actions: failure.next_actions,
      };
    }
  }

  const name = ref.law_name;
  const scopeError = checkAbbreviationScope(name);
  if (scopeError) {
    return {
      kind: 'not_found',
      code: scopeError.code,
      reason: scopeError.error,
      next_actions: scopeError.next_actions ?? [],
    };
  }

  const found = await findLawForName(name, at);
  if (found === null) {
    const title = resolveAbbreviation(name, { normalize: true })?.formal ?? name.trim();
    return {
      kind: 'not_found',
      code: 'LAW_NOT_FOUND',
      reason: `e-Gov に「${title}」という法令名はありません`,
      next_actions: [NEXT_ACTIONS.resolveAbbreviation(name), NEXT_ACTIONS.searchLaw(name)],
    };
  }
  if (isPartialMatch(found)) {
    return {
      kind: 'ambiguous',
      reason: `「${found.searched}」に完全一致する法令名が e-Gov に無く、部分一致が ${found.total_count} 件ありました`,
      candidates: found.candidates.slice(0, MAX_CITATION_CANDIDATES).map(toVerifiedLaw),
      next_actions: [NEXT_ACTIONS.searchLaw(name)],
    };
  }
  const abbr = resolveAbbreviation(name, { normalize: true });
  return {
    kind: 'ok',
    resolved_by: abbr?.law_id ? 'abbreviation' : 'exact_title',
    law: toVerifiedLaw(found),
  };
}

// ========================================
// #22: 章・節単位の範囲取得（v0.14.0）
// ========================================

/** 返した範囲の内訳（#22、v0.14.0） */
export interface LawRangeInfo {
  /** 本則の範囲のパス（`Part3/Chapter2`）。附則のときは付かない */
  path?: string;
  /** 附則を指定したときの並び順（`get_toc` の `suppl_provisions[].index` と同じ） */
  suppl_index?: number;
  /** 範囲の見出しの連なり（上位から）。附則は 1 件 */
  titles: string[];
  /** 範囲の種類。本則は `Part` / `Chapter` / `Section` / `Subsection` / `Division`、附則は `SupplProvision` */
  tag: RangeTag | 'SupplProvision';
  /** 範囲が持つ条の数 */
  article_count: number;
  /** 実際に本文を返した条の数 */
  returned_count: number;
  /** `from_article` より前にあるため返していない条の数 */
  skipped_count: number;
  /** 返した最初の条（例: `第521条`） */
  first_article?: string;
  /** 返した最後の条 */
  last_article?: string;
  /** 文字数の上限で打ち切ったかどうか */
  truncated: boolean;
  /** 返した条本文の文字数（見出しを含む。出典とヘッダは含まない） */
  body_chars: number;
  /** 適用した文字数の上限 */
  max_chars: number;
  /** 打ち切ったときの続きの条番号。`from_article` にそのまま渡せる */
  next_from_article?: string;
  /** 何をどこまで返したかの 1 行 */
  note: string;
  /** 続きの取り方（打ち切ったときだけ） */
  next_actions?: NextAction[];
}

/** 返した条の一覧（本文は markdown 側） */
export interface LawRangeArticle {
  /** e-Gov API 形式の条番号（`521`、枝番号は `548_4`） */
  num: string;
  /** 表示用の条番号（`第521条`、`第548条の4`） */
  label: string;
  /** 条見出し（`（契約の締結及び内容の自由）`） */
  caption?: string;
}

/** `get_law_range` の引数のうち、本則の階層を指す分 */
const RANGE_ARG_NAMES = {
  Part: 'part',
  Chapter: 'chapter',
  Section: 'section',
  Subsection: 'subsection',
  Division: 'division',
} as const satisfies Record<RangeTag, string>;

/**
 * get_law_range ツールの本実装（#22）。
 *
 * 編・章・節・款・目のいずれか、または附則 1 本を範囲にして、その中の条を本文ごと返す。
 * 大きな範囲は `max_chars` で条の単位で打ち切り、続きの条番号を `next_from_article` に入れる
 * （`get_law` の 1 条ずつの取得と、`get_toc` の目次だけの取得の間を埋める）。
 *
 * 範囲の指定は 3 通りで、同時には 1 つだけ指定する。
 *
 * - `part` / `chapter` / `section` / `subsection` / `division`（上位は省略できる）
 * - `path`（`get_toc` が返す `toc[].path`。例 `Part3/Chapter2`）
 * - `suppl_index`（`get_toc` が返す `suppl_provisions[].index`）
 */
export async function getLawRange(opts: {
  law_name: string;
  part?: string | number;
  chapter?: string | number;
  section?: string | number;
  subsection?: string | number;
  division?: string | number;
  path?: string;
  suppl_index?: number;
  from_article?: string;
  max_chars?: number;
  at?: string;
}): Promise<
  LawServiceResult<{
    markdown: string;
    range: LawRangeInfo;
    articles: LawRangeArticle[];
    meta: ArticleMeta;
  }>
> {
  const scopeError = checkAbbreviationScope(opts.law_name);
  if (scopeError) return scopeError;

  // 1. 範囲の指定を読む（3 通りのうち 1 つだけ）
  const selector: Partial<Record<RangeTag, string>> = {};
  for (const tag of RANGE_TAGS) {
    const raw = opts[RANGE_ARG_NAMES[tag]];
    if (raw === undefined) continue;
    try {
      selector[tag] = toEgovStructureNum(raw);
    } catch (err) {
      return makeError('INVALID_ARGUMENT', (err as Error).message, {
        hint: `${RANGE_ARG_NAMES[tag]} は "3"・"三"・"第三章"・"2の2" のいずれかの形式で指定してください`,
      });
    }
  }
  const ways = [
    Object.keys(selector).length > 0 ? '編・章・節の番号' : null,
    opts.path !== undefined ? 'path' : null,
    opts.suppl_index !== undefined ? 'suppl_index' : null,
  ].filter((w): w is string => w !== null);
  if (ways.length === 0) {
    return makeError('INVALID_ARGUMENT', '範囲を指定してください', {
      hint: 'part / chapter / section / subsection / division のいずれか、path（get_toc の toc[].path）、suppl_index（附則の番号）のうち 1 つを指定してください',
      next_actions: [NEXT_ACTIONS.getToc(opts.law_name)],
    });
  }
  if (ways.length > 1) {
    return makeError(
      'INVALID_ARGUMENT',
      `範囲の指定は 1 通りにしてください（${ways.join(' と ')} が同時に指定されています）`,
      {
        hint: '編・章・節の番号、path、suppl_index は互いに排他です',
      }
    );
  }
  if (opts.path !== undefined && parseRangePath(opts.path) === null) {
    return makeError('INVALID_ARGUMENT', `path の形式が不正です: ${opts.path}`, {
      hint: 'path は `Part3/Chapter2` のように、タグ名と番号を "/" でつなげて書きます（get_toc が返す toc[].path をそのまま渡せます）',
      next_actions: [NEXT_ACTIONS.getToc(opts.law_name)],
    });
  }

  // 2. 法令を引く
  // 法令名の検索が通信の失敗で終わったときは SOURCE_*、完全一致が無ければ候補付きの LAW_NOT_FOUND
  // （SPEC-EGOV-COMMON-ERRORS-029・032、SPEC-EGOV-GET-LAW-RANGE-034）
  const resolved = await resolveLawForTool('get_law_range', opts);
  if (_isLawServiceError(resolved)) return resolved;
  let lawData: EgovLawDataResponse;
  try {
    lawData = await fetchLawData(resolved.law_id, opts.at);
  } catch (err) {
    return lawFetchErrorToLawError(err, {
      tool: 'get_law_range',
      law_id: resolved.law_id,
      name: resolved.title,
      law_name: opts.law_name,
      at: opts.at,
    });
  }
  const retrievedAt = new Date().toISOString();
  const root = lawData.law_full_text;

  // 3. 範囲のノードを決める
  const located = locateRange(root, opts, selector);
  if (isError(located)) return located;
  const { node: rangeNode, info: rangeIdent } = located;

  // 4. 範囲の中の条を集め、from_article より前を落とす
  const allArticles = collectArticlesInRange(rangeNode);
  let picked = allArticles;
  let skipped = 0;
  if (opts.from_article !== undefined) {
    let fromNum: string;
    try {
      fromNum = toEgovArticleNum(opts.from_article);
    } catch (err) {
      return makeError('INVALID_ARTICLE_NUM', (err as Error).message, {
        hint: 'from_article は "561"、"548の4"、"第五百六十一条" のいずれかの形式で指定してください',
      });
    }
    const at = allArticles.findIndex((a) => a.attr?.Num === fromNum);
    if (at < 0) {
      const first = allArticles[0]?.attr?.Num;
      return makeError(
        'ARTICLE_NOT_FOUND',
        `${formatArticleLabel(fromNum)}はこの範囲にありません（${rangeIdent.titles.join(' ')}、条 ${allArticles.length} 件）`,
        {
          hint: first
            ? `この範囲は ${formatArticleLabel(first)} から始まります。from_article には前回の応答の next_from_article を渡してください`
            : 'この範囲は条を持ちません',
        }
      );
    }
    picked = allArticles.slice(at);
    skipped = at;
  }

  // 5. 条ごとに整形し、文字数の上限で打ち切る（条の途中では切らない）
  const maxChars = Math.min(
    Math.max(opts.max_chars ?? RANGE_LIMITS.defaultMaxChars, RANGE_LIMITS.minMaxChars),
    RANGE_LIMITS.maxMaxChars
  );
  const sections: string[] = [];
  const returned: LawNode[] = [];
  let bodyChars = 0;
  let truncated = false;
  let nextFrom: string | undefined;
  for (const article of picked) {
    const section = formatRangeArticleSection(article);
    // 1 条目だけは上限を超えても返す（空の応答を返さないため）
    if (sections.length > 0 && bodyChars + section.length + 2 > maxChars) {
      truncated = true;
      nextFrom = article.attr?.Num;
      break;
    }
    sections.push(section);
    returned.push(article);
    bodyChars += section.length + (sections.length > 1 ? 2 : 0);
  }
  // 条を持たない範囲（項だけで書かれた附則）は範囲の本文をそのまま出す
  const paragraphOnly = allArticles.length === 0;
  if (paragraphOnly) {
    const body = formatArticleBody(rangeNode);
    if (body) {
      sections.push(body);
      bodyChars = body.length;
    }
  }

  const range: LawRangeInfo = {
    ...rangeIdent,
    article_count: allArticles.length,
    returned_count: returned.length,
    skipped_count: skipped,
    truncated,
    body_chars: bodyChars,
    max_chars: maxChars,
    note: '',
  };
  if (returned.length > 0) {
    range.first_article = formatArticleLabel(returned[0].attr?.Num ?? '');
    range.last_article = formatArticleLabel(returned[returned.length - 1].attr?.Num ?? '');
  }
  if (nextFrom) {
    range.next_from_article = nextFrom;
    range.next_actions = [
      {
        action: 'get_law_range',
        reason: '同じ範囲の続きの条から取れます',
        example: {
          law_name: opts.law_name,
          ...(range.path ? { path: range.path } : {}),
          ...(range.suppl_index ? { suppl_index: range.suppl_index } : {}),
          from_article: nextFrom,
          // 例のとおりに呼び直しても上限と時点が変わらないように、渡された値だけをそのまま写す
          // （SPEC-EGOV-GET-LAW-RANGE-008）
          ...(opts.max_chars !== undefined ? { max_chars: opts.max_chars } : {}),
          ...(opts.at !== undefined ? { at: opts.at } : {}),
        },
      },
    ];
  }
  range.note = rangeNote(range, paragraphOnly);

  const markdown = formatRangeMarkdown({
    lawTitle: resolved.title,
    lawId: resolved.law_id,
    titles: range.titles,
    sections,
    rangeNote: range.note,
    retrievedAt,
    at: opts.at,
  });
  return {
    markdown,
    range,
    articles: returned.map((a) => {
      const num = a.attr?.Num ?? '';
      const caption = getArticleCaption(a);
      return { num, label: formatArticleLabel(num), ...(caption ? { caption } : {}) };
    }),
    meta: {
      law_id: resolved.law_id,
      title: resolved.title,
      law_num: resolved.law_num,
      retrieved_at: retrievedAt,
      url: EGOV_API.publicLawUrl(resolved.law_id),
      at: opts.at ?? null,
    },
  };
}

/** 範囲の見出し・パス・種類（`LawRangeInfo` のうち、条を数える前に決まる分） */
type RangeIdent = Pick<LawRangeInfo, 'path' | 'suppl_index' | 'titles' | 'tag'>;

/**
 * 3 通りの指定から範囲のノードを決める。
 *
 * 上位を省いた指定（民法の `chapter: "2"` は 5 つの編にある）は複数に当たるので、
 * そのときは候補のパスを next_actions に入れた INVALID_ARGUMENT を返す。
 */
function locateRange(
  root: LawNode,
  opts: { law_name: string; path?: string; suppl_index?: number },
  selector: Partial<Record<RangeTag, string>>
): LawServiceResult<{ node: LawNode; info: RangeIdent }> {
  if (opts.suppl_index !== undefined) {
    const index = opts.suppl_index;
    const node = findSupplProvisionByIndex(root, index);
    if (!node) {
      const all = extractSupplProvisions(root);
      return makeError('RANGE_NOT_FOUND', `附則(${index}) が見つかりません`, {
        hint:
          all.length > 0
            ? `この法令の附則は ${all.length} 本です（suppl_index は 1〜${all.length}）`
            : 'この法令に附則はありません',
        next_actions: [NEXT_ACTIONS.getToc(opts.law_name)],
      });
    }
    const summary = extractSupplProvisions(root)[index - 1];
    return {
      node,
      info: {
        suppl_index: index,
        titles: [formatSupplProvisionLabel(summary)],
        tag: 'SupplProvision',
      },
    };
  }

  const matches: RangeMatch[] =
    opts.path !== undefined
      ? [findRangeByPath(root, opts.path)].filter((m): m is RangeMatch => m !== null)
      : findRanges(root, selector);

  if (matches.length === 0) {
    const asked =
      opts.path !== undefined
        ? `path: ${opts.path}`
        : RANGE_TAGS.filter((t) => selector[t] !== undefined)
            .map((t) => `${RANGE_ARG_NAMES[t]}: ${selector[t]}`)
            .join(', ');
    return makeError('RANGE_NOT_FOUND', `指定された範囲が見つかりません（${asked}）`, {
      hint: 'get_toc で編・章・節の番号（toc[].num）とパス（toc[].path）を確認してください。章のみの法令に編を指定した場合も該当なしになります',
      next_actions: [NEXT_ACTIONS.getToc(opts.law_name)],
    });
  }
  if (matches.length > 1) {
    return makeError(
      'INVALID_ARGUMENT',
      `指定された範囲が ${matches.length} か所あります。上位の階層も指定してください`,
      {
        hint: `該当するパス: ${matches.map((m) => m.path).join(', ')}（Chapter@Num は編ごとに振り直されます）`,
        next_actions: matches.slice(0, 5).map((m) => ({
          action: 'get_law_range',
          reason: m.segments.map((s) => s.title).join(' '),
          example: { law_name: opts.law_name, path: m.path },
        })),
      }
    );
  }
  const m = matches[0];
  return {
    node: m.node,
    info: {
      path: m.path,
      titles: m.segments.map((s) => s.title).filter(Boolean),
      tag: m.segments[m.segments.length - 1].tag,
    },
  };
}

/** 何をどこまで返したかの 1 行 */
function rangeNote(range: LawRangeInfo, paragraphOnly: boolean): string {
  if (paragraphOnly) {
    return `この範囲は条を持たず項だけで書かれているため、範囲の本文をそのまま返しました（${range.body_chars.toLocaleString('en-US')} 文字）`;
  }
  const parts: string[] = [];
  const span =
    range.first_article && range.last_article
      ? range.first_article === range.last_article
        ? range.first_article
        : `${range.first_article}〜${range.last_article}`
      : '';
  parts.push(
    `範囲の条 ${range.article_count} 件のうち ${range.returned_count} 件を返しました${span ? `（${span}）` : ''}`
  );
  if (range.skipped_count > 0) {
    parts.push(`先頭の ${range.skipped_count} 件は from_article より前のため返していません`);
  }
  parts.push(
    `本文 ${range.body_chars.toLocaleString('en-US')} 文字（上限 ${range.max_chars.toLocaleString('en-US')} 文字）`
  );
  if (range.next_from_article) {
    parts.push(
      `上限で打ち切りました。続きは from_article: "${range.next_from_article}" を付けて同じ範囲を呼び直してください`
    );
  }
  return `${parts.join('。')}。`;
}
