/**
 * 法令操作の高レベル API。
 *
 * - 略称解決 → law_id 解決 → 本文取得 → 整形
 * - LRU cache で /law_data の応答を保持（時点指定 at もキーに含む）
 * - HTTP / parse / 該当なし のエラーを統一形で返す
 */

import { listBySourceMcpHint, resolveAbbreviation } from '@shuji-bonji/houki-abbreviations';
import { CACHE_CONFIG, EGOV_API, HTTP_CONFIG } from '../config.js';
import { LIMITS } from '../constants.js';
import {
  isLawServiceError as _isLawServiceError,
  type LawErrorCode,
  type LawServiceError,
  makeError,
  NEXT_ACTIONS,
  type NextAction,
} from '../errors.js';
import { formatArticleMarkdown, formatTocMarkdown } from '../formatters/markdown.js';
import {
  formatArticleLabel,
  formatItemLabel,
  fromEgovArticleNum,
  toEgovArticleNum,
  toEgovItemNum,
} from '../utils/article-num.js';
import { LRUCache } from '../utils/cache.js';
import { createLimit } from '../utils/concurrency.js';
import { lawNumMatchKey } from '../utils/law-num.js';
import { logger } from '../utils/logger.js';
import {
  EgovHttpError,
  type EgovLawDataResponse,
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
  countTocNodes,
  extractSupplProvisions,
  extractText,
  extractToc,
  findArticle,
  findChildrenByTag,
  findItem,
  findParagraph,
  findParagraphForItem,
  getArticleCaption,
  type LawNode,
  limitTocDepth,
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
function egovHttpErrorToLawError(err: unknown): LawServiceError {
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
  // ネットワーク到達不能 (DNS 失敗・接続拒否) は SOURCE_UNAVAILABLE
  const cause = err instanceof Error ? err.message : String(err);
  if (
    cause.includes('ECONNREFUSED') ||
    cause.includes('ENOTFOUND') ||
    cause.includes('EAI_AGAIN') ||
    cause.includes('getaddrinfo')
  ) {
    return makeError('SOURCE_UNAVAILABLE', `e-Gov API に接続できません: ${cause}`, {
      hint: 'ネットワーク接続または DNS 解決に問題がある可能性があります',
      retryable: true,
      next_actions: [NEXT_ACTIONS.retryLater(), NEXT_ACTIONS.visitEgovSite()],
      detail: { cause },
    });
  }
  return makeError('SOURCE_API_ERROR', `e-Gov API 呼び出しに失敗しました: ${cause}`, {
    retryable: true,
    next_actions: [NEXT_ACTIONS.retryLater()],
    detail: { cause },
  });
}

/**
 * houki-egov-mcp の管轄外リソース (通達・PDF・判例 等) が略称解決で判明した場合、
 * `OUT_OF_SCOPE` エラーを返す。Skill 層は `next_actions[0].example.mcp` を見て
 * 適切な MCP に透過的にルーティングする。
 *
 * `houki-egov` 管轄、または辞書に未登録の場合は `null` を返し、通常フローに進める。
 */
function checkAbbreviationScope(name: string): LawServiceError | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const abbr = resolveAbbreviation(trimmed);
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

/** 検索結果のキャッシュ。キーは検索パラメータの正規化文字列 */
const searchCache = new LRUCache<string, LawListItem[]>(
  CACHE_CONFIG.searchResults.maxSize,
  CACHE_CONFIG.searchResults.name
);

/** 共通エラー型 (re-export) — 詳細は src/errors.ts */
export type { LawServiceError } from '../errors.js';

export type LawServiceResult<T> = T | LawServiceError;

export function isError<T>(r: LawServiceResult<T>): r is LawServiceError {
  return _isLawServiceError(r);
}

/**
 * 略称または法令名から law_id を解決する。
 *
 * 1. 略称辞書で law_id が直接取れる場合はそれを返す
 * 2. 取れない場合、formal で検索 API を叩く
 * 3. 完全一致を最優先、なければ先頭結果
 */
export async function resolveLawId(
  lawName: string
): Promise<{ law_id: string; title: string; law_num?: string } | null> {
  const trimmed = lawName.trim();
  if (!trimmed) return null;

  const abbr = resolveAbbreviation(trimmed);
  if (abbr?.law_id) {
    return { law_id: abbr.law_id, title: abbr.formal, law_num: abbr.law_num };
  }

  const searchTitle = abbr?.formal ?? trimmed;
  try {
    const res = await searchLaws({ law_title: searchTitle, limit: 5 });
    if (res.laws.length === 0) return null;
    // 完全一致を優先
    const exact = res.laws.find((l) => l.revision_info.law_title === searchTitle);
    const top = exact ?? res.laws[0];
    return {
      law_id: top.law_info.law_id,
      title: top.revision_info.law_title,
      law_num: top.law_info.law_num,
    };
  } catch (err) {
    logger.warn('law-service', `resolveLawId failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * 法令本文を取得（キャッシュ経由）
 */
async function fetchLawData(lawId: string, at?: string): Promise<EgovLawDataResponse> {
  const cacheKey = `${lawId}:${at ?? 'current'}`;
  const cached = lawDataCache.get(cacheKey);
  if (cached) return cached;
  const fresh = await getLawData(lawId, { at });
  lawDataCache.set(cacheKey, fresh);
  return fresh;
}

/**
 * search_law ツールの本実装
 */
export async function searchLawByKeyword(opts: {
  keyword: string;
  law_type?: string;
  limit?: number;
}): Promise<
  LawServiceResult<{
    query: { keyword: string; law_type?: string; resolved?: string };
    total_count: number;
    results: Array<{
      law_id: string;
      title: string;
      law_num: string;
      law_type: string;
      promulgation_date?: string;
      url: string;
    }>;
  }>
> {
  const trimmed = opts.keyword.trim();
  if (!trimmed) {
    return makeError('INVALID_ARGUMENT', 'keyword が空です', {
      hint: '検索したい法令名・略称・キーワード（例: "消費税", "労基"）を指定してください',
    });
  }

  // 略称が当たれば formal を使って検索
  const abbr = resolveAbbreviation(trimmed);
  const searchTitle = abbr?.formal ?? trimmed;

  const cacheKey = `${searchTitle}|${opts.law_type ?? ''}|${opts.limit ?? 10}`;
  let laws = searchCache.get(cacheKey);

  if (!laws) {
    try {
      const res = await searchLaws({
        law_title: searchTitle,
        law_type: opts.law_type,
        limit: opts.limit ?? 10,
      });
      laws = res.laws;
      searchCache.set(cacheKey, laws);
    } catch (err) {
      return egovHttpErrorToLawError(err);
    }
  }

  return {
    query: {
      keyword: opts.keyword,
      law_type: opts.law_type,
      resolved: abbr ? abbr.formal : undefined,
    },
    total_count: laws.length,
    results: laws.map((l) => ({
      law_id: l.law_info.law_id,
      title: l.revision_info.law_title,
      law_num: l.law_info.law_num,
      law_type: l.law_info.law_type,
      promulgation_date: l.law_info.promulgation_date,
      url: EGOV_API.publicLawUrl(l.law_info.law_id),
    })),
  };
}

/**
 * get_law ツールの本実装
 */
export async function getLawArticle(opts: {
  law_name: string;
  article?: string;
  paragraph?: number;
  /** 号番号。数値（8）か文字列（"8"・"8の2"・"第8号の2"）。v0.6.0 から文字列も受け付ける */
  item?: number | string;
  format?: 'markdown' | 'json' | 'toc';
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

  const resolved = await resolveLawId(opts.law_name);
  if (!resolved) {
    return makeError('LAW_NOT_FOUND', `法令が見つかりません: ${opts.law_name}`, {
      hint: '略称辞書 / e-Gov 法令検索で該当なし。表記を確認してください',
      next_actions: [
        NEXT_ACTIONS.resolveAbbreviation(opts.law_name),
        NEXT_ACTIONS.searchLaw(opts.law_name),
      ],
    });
  }

  let lawData: EgovLawDataResponse;
  try {
    lawData = await fetchLawData(resolved.law_id, opts.at);
  } catch (err) {
    return egovHttpErrorToLawError(err);
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

  const article = findArticle(lawData.law_full_text, articleNum);
  if (!article) {
    return makeError(
      'ARTICLE_NOT_FOUND',
      `条文が見つかりません: ${formatArticleLabel(articleNum)} in ${resolved.title}`,
      {
        hint: '法令名・条番号を確認してください。format: "toc" で目次を確認できます',
        next_actions: [NEXT_ACTIONS.getToc(opts.law_name)],
      }
    );
  }

  let paragraph: LawNode | null = null;
  let item: LawNode | null = null;
  if (opts.paragraph !== undefined) {
    paragraph = findParagraph(article, opts.paragraph);
    if (!paragraph) {
      return makeError(
        'ARTICLE_NOT_FOUND',
        `項が見つかりません: ${formatArticleLabel(articleNum)}第${opts.paragraph}項`,
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
        `${formatArticleLabel(articleNum)}は項が ${count} 個あるため、item（号番号）を指定するときは paragraph（項番号）も指定してください`,
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
        `号が見つかりません: ${formatArticleLabel(articleNum)}第${paragraph.attr?.Num ?? ''}項${formatItemLabel(itemNum)}`,
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
    at: opts.at,
  };

  if (opts.format === 'json') {
    return {
      format: 'json',
      data: {
        article_num: articleNum,
        paragraph_num: opts.paragraph,
        item_num: opts.item,
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
  });
  return { format: 'markdown', markdown, meta };
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

  const resolved = await resolveLawId(opts.law_name);
  if (!resolved) {
    return makeError('LAW_NOT_FOUND', `法令が見つかりません: ${opts.law_name}`, {
      hint: '略称辞書 / e-Gov 法令検索で該当なし。表記を確認してください',
      next_actions: [
        NEXT_ACTIONS.resolveAbbreviation(opts.law_name),
        NEXT_ACTIONS.searchLaw(opts.law_name),
      ],
    });
  }
  let lawData: EgovLawDataResponse;
  try {
    lawData = await fetchLawData(resolved.law_id, opts.at);
  } catch (err) {
    return egovHttpErrorToLawError(err);
  }
  const retrievedAt = new Date().toISOString();
  const fullToc = extractToc(lawData.law_full_text);
  const fullCount = countTocNodes(fullToc);
  const toc = opts.depth && opts.depth > 0 ? limitTocDepth(fullToc, opts.depth) : fullToc;
  const truncated = toc !== fullToc;

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
      at: opts.at,
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
  at?: string;
}

/** JSON 出力時の構造化データ */
export interface ArticleJson {
  article_num: string;
  paragraph_num?: number;
  /** 指定された号番号（引数の値のまま。v0.6.0 から "8の2" のような文字列もありうる） */
  item_num?: number | string;
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
    revisions: Array<{
      law_revision_id: string;
      amendment_promulgate_date?: string;
      amendment_enforcement_date?: string;
      amendment_enforcement_comment?: string | null;
      amendment_law_num?: string | null;
      amendment_law_title?: string | null;
      amendment_law_id?: string | null;
      current_revision_status?: string;
    }>;
  }>
> {
  const scopeError = checkAbbreviationScope(opts.law_name);
  if (scopeError) return scopeError;

  const resolved = await resolveLawId(opts.law_name);
  if (!resolved) {
    return makeError('LAW_NOT_FOUND', `法令が見つかりません: ${opts.law_name}`, {
      hint: '略称辞書 / e-Gov 法令検索で該当なし。表記を確認してください',
      next_actions: [
        NEXT_ACTIONS.resolveAbbreviation(opts.law_name),
        NEXT_ACTIONS.searchLaw(opts.law_name),
      ],
    });
  }
  let res: Awaited<ReturnType<typeof getLawRevisions>>;
  try {
    res = await getLawRevisions(resolved.law_id);
  } catch (err) {
    return egovHttpErrorToLawError(err);
  }
  const all = res.revisions ?? [];
  const trimmed = opts.latest && opts.latest > 0 ? all.slice(0, opts.latest) : all;
  const retrievedAt = new Date().toISOString();
  return {
    meta: {
      law_id: resolved.law_id,
      title: resolved.title,
      law_num: resolved.law_num,
      retrieved_at: retrievedAt,
      url: EGOV_API.publicLawUrl(resolved.law_id),
    },
    total: all.length,
    revisions: trimmed.map((r: RevisionInfo) => ({
      law_revision_id: r.law_revision_id,
      amendment_promulgate_date: r.amendment_promulgate_date,
      amendment_enforcement_date: r.amendment_enforcement_date,
      amendment_enforcement_comment: r.amendment_enforcement_comment,
      amendment_law_num: r.amendment_law_num,
      amendment_law_title: r.amendment_law_title,
      amendment_law_id: r.amendment_law_id,
      current_revision_status: r.current_revision_status,
    })),
  };
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
 * 法令名が e-Gov に実在するかを確かめる。`/laws?law_title=` は部分一致なので、
 * `revision_info.law_title` が完全一致する 1 件だけを返す。無ければ null。
 * 通信エラーは呼び出し側で扱うため、そのまま投げる。
 */
async function findLawByExactTitle(title: string): Promise<ExactLawHit | null> {
  const key = `title:${title}`;
  const cached = exactLookupCache.get(key);
  if (cached !== undefined) return cached;
  const res = await searchLaws({ law_title: title, limit: 50 });
  const hit = res.laws.find((l) => l.revision_info.law_title === title);
  const out = hit ? toExactHit(hit) : null;
  exactLookupCache.set(key, out);
  return out;
}

/** 法令番号（漢数字表記。例: "昭和四十九年法律第百十六号"）で法令を引く。無ければ null */
async function findLawByNum(lawNum: string): Promise<ExactLawHit | null> {
  const key = `num:${lawNum}`;
  const cached = exactLookupCache.get(key);
  if (cached !== undefined) return cached;
  const res = await searchLaws({ law_num: lawNum, limit: 5 });
  const hit = res.laws.find((l) => l.law_info.law_num === lawNum) ?? res.laws[0];
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
  meta: { retrieved_at: string };
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

  const resolved = await resolveLawId(opts.law_name);
  if (!resolved) {
    return makeError('LAW_NOT_FOUND', `法令が見つかりません: ${opts.law_name}`, {
      hint: '略称辞書 / e-Gov 法令検索で該当なし。表記を確認してください',
      next_actions: [
        NEXT_ACTIONS.resolveAbbreviation(opts.law_name),
        NEXT_ACTIONS.searchLaw(opts.law_name),
      ],
    });
  }

  const related: RelatedLawsResponse['related'] = [];
  const notFound: RelatedLawsResponse['not_found'] = [];
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
    meta: { retrieved_at: new Date().toISOString() },
  };
}

/** `get_article_references` の応答 */
export interface ArticleReferencesResponse {
  meta: ArticleMeta & { article: string; paragraph?: number };
  references: ExtractedReference[];
  delegations: Array<
    Delegation & {
      target_law?: {
        relation: LawRelation;
        law_id: string;
        title: string;
        url: string;
        /** 委任先がこの法令自身（施行令の本文の「政令で定める」）のとき true */
        self?: true;
      };
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
 * 1. 条（と項）を取得（get_law と同じ解決と取得）
 * 2. 本文の「（法令番号）」を法令番号で解決（e-Gov `/laws?law_num=`）
 * 3. reference-extractor で参照と委任を取り出す
 * 4. 名前だけの参照は候補名の完全一致で解決を試みる
 * 5. 委任には get_related_laws と同じ規則で施行令・施行規則を付ける
 */
export async function getArticleReferences(opts: {
  law_name: string;
  article: string;
  paragraph?: number;
  at?: string;
}): Promise<LawServiceResult<ArticleReferencesResponse>> {
  const scopeError = checkAbbreviationScope(opts.law_name);
  if (scopeError) return scopeError;

  const resolved = await resolveLawId(opts.law_name);
  if (!resolved) {
    return makeError('LAW_NOT_FOUND', `法令が見つかりません: ${opts.law_name}`, {
      hint: '略称辞書 / e-Gov 法令検索で該当なし。表記を確認してください',
      next_actions: [
        NEXT_ACTIONS.resolveAbbreviation(opts.law_name),
        NEXT_ACTIONS.searchLaw(opts.law_name),
      ],
    });
  }

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
    return egovHttpErrorToLawError(err);
  }

  const article = findArticle(lawData.law_full_text, articleNum);
  if (!article) {
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
    // 2. 「（法令番号）」を法令番号で解決
    const resolvedByNum: KnownLaw[] = [];
    for (const mention of findLawNumMentions(text)) {
      const hit = await findLawByNum(mention.law_num);
      if (hit) resolvedByNum.push({ title: hit.title, law_id: hit.law_id, law_num: hit.law_num });
    }

    // 3. 抽出（項ごとに行い、「第三号」のように条も項も無い参照にはその項の番号を付ける）
    const parentTitle = parentActTitle(resolved.title);
    const parentAct = parentTitle ? await findLawByExactTitle(parentTitle) : null;
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

    // 4. 名前だけの参照を、候補名の完全一致で解決する（上限あり）
    const candidates = new Map<string, ExactLawHit | null>();
    for (const ref of extracted.references) {
      if (ref.kind !== 'external' || ref.resolved) continue;
      if (!candidates.has(ref.law_name)) {
        if (candidates.size >= MAX_CANDIDATE_LOOKUPS) continue;
        candidates.set(ref.law_name, await findLawByExactTitle(ref.law_name));
      }
      const hit = candidates.get(ref.law_name);
      if (hit) {
        ref.law_name = hit.title;
        ref.law_num = hit.law_num;
        ref.law_id = hit.law_id;
        ref.resolved = true;
      }
    }

    // 5. 委任先（法令単位）
    const targets = new Map<LawRelation, ExactLawHit | null>();
    const delegations: ArticleReferencesResponse['delegations'] = [];
    for (const d of extracted.delegations) {
      const relation: LawRelation = d.target;
      if (!targets.has(relation)) {
        const base = parentTitle ?? resolved.title;
        const title = relation === 'enforcement_order' ? `${base}施行令` : `${base}施行規則`;
        targets.set(relation, await findLawByExactTitle(title));
      }
      const hit = targets.get(relation);
      delegations.push({
        ...d,
        ...(hit
          ? {
              target_law: {
                relation,
                law_id: hit.law_id,
                title: hit.title,
                url: EGOV_API.publicLawUrl(hit.law_id),
                // 施行令の本文に出る「政令で定める」は、その施行令自身を指す
                ...(hit.law_id === resolved.law_id ? { self: true } : {}),
              },
            }
          : {}),
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
        at: opts.at,
        article: fromEgovArticleNum(articleNum),
        ...(opts.paragraph !== undefined ? { paragraph: opts.paragraph } : {}),
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
    return egovHttpErrorToLawError(err);
  }
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
    if (ref.kind === 'relative') continue;
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
  /** 条が実在したときの条番号（e-Gov 形式）・表示ラベル・条見出し */
  article?: { num: string; label: string; caption?: string };
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
  meta: { retrieved_at: string; at?: string };
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

/** e-Gov が law_id を知らない（400 / 404）ときだけ true。それ以外の通信エラーは呼び出し側に投げる */
function isLawIdRejected(err: unknown): boolean {
  return err instanceof EgovHttpError && (err.status === 400 || err.status === 404);
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
          transportError ??= egovHttpErrorToLawError(err);
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
      ...(opts.at ? { at: opts.at } : {}),
    },
  };
}

/** 引用 1 件を確かめる。通信エラー（400 / 404 以外）は呼び出し側に投げる */
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
    return {
      ...base,
      status: 'not_found',
      code: resolution.code,
      reason: resolution.reason,
      next_actions: resolution.next_actions,
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

  // 本文を取る
  let lawData: EgovLawDataResponse;
  try {
    lawData = await fetchLawData(law.law_id, at);
  } catch (err) {
    if (!isLawIdRejected(err)) throw err;
    return {
      ...base,
      status: 'not_found',
      code: 'LAW_NOT_FOUND',
      reason: `e-Gov に law_id ${law.law_id} の法令がありません`,
      next_actions: [NEXT_ACTIONS.searchLaw(nameForActions)],
    };
  }

  const article = findArticle(lawData.law_full_text, articleNum);
  if (!article) {
    return {
      ...found,
      status: 'not_found',
      code: 'ARTICLE_NOT_FOUND',
      reason: `${law.title}に${formatArticleLabel(articleNum)}はありません`,
      next_actions: [NEXT_ACTIONS.getToc(nameForActions)],
    };
  }
  const caption = getArticleCaption(article);
  found.article = {
    num: articleNum,
    label: formatArticleLabel(articleNum),
    ...(caption ? { caption } : {}),
  };
  const articleLabel = `${law.title}${formatArticleLabel(articleNum)}`;

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
 * 4. 無ければ e-Gov の部分一致検索を引き、法令名が完全一致した 1 件だけを採る。
 *    完全一致が無く候補があれば ambiguous、候補も無ければ LAW_NOT_FOUND
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
      if (!isLawIdRejected(err)) throw err;
      return {
        kind: 'not_found',
        code: 'LAW_NOT_FOUND',
        reason: `e-Gov に law_id ${ref.law_id} の法令がありません`,
        next_actions: [NEXT_ACTIONS.searchLaw(ref.law_name || ref.law_id)],
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

  const abbr = resolveAbbreviation(name);
  if (abbr?.law_id) {
    return {
      kind: 'ok',
      resolved_by: 'abbreviation',
      law: toVerifiedLaw({
        law_id: abbr.law_id,
        title: abbr.formal,
        law_num: abbr.law_num,
        law_type: abbr.law_type,
      }),
    };
  }

  const title = abbr?.formal ?? name;
  const res = await searchLaws({ law_title: title, limit: LIMITS.searchMax });
  const exact = res.laws.find((l) => l.revision_info.law_title === title);
  if (exact) {
    return { kind: 'ok', resolved_by: 'exact_title', law: toVerifiedLaw(toExactHit(exact)) };
  }
  if (res.laws.length === 0) {
    return {
      kind: 'not_found',
      code: 'LAW_NOT_FOUND',
      reason: `e-Gov に「${title}」という法令名はありません`,
      next_actions: [NEXT_ACTIONS.resolveAbbreviation(name), NEXT_ACTIONS.searchLaw(name)],
    };
  }
  return {
    kind: 'ambiguous',
    reason: `「${title}」に完全一致する法令名が e-Gov に無く、部分一致が ${res.laws.length} 件ありました`,
    candidates: res.laws.slice(0, MAX_CITATION_CANDIDATES).map((l) => toVerifiedLaw(toExactHit(l))),
    next_actions: [NEXT_ACTIONS.searchLaw(name)],
  };
}
