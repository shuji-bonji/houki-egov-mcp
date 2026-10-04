/**
 * MCP Tool Handlers — houki-egov-mcp
 *
 * e-Gov 法令API v2 と接続する本実装。
 * search_fulltext は Phase 2-7 (v0.5.0) からローカル SQLite FTS5 (bulk DL 済み DB) を引く。
 * bulk DL 未実行のときは search_law (タイトル検索) にフォールバックする。
 */

import { resolveAbbreviation } from '@shuji-bonji/houki-abbreviations';
import { LIMITS } from '../constants.js';
import {
  closeDb,
  type DbLocation,
  type DbState,
  dbLocationForPath,
  displayDbPath,
  guideCommand,
  openUsableDb,
  resolveDbLocation,
  SCHEMA_VERSION,
} from '../db/index.js';
import { type LawServiceError, makeError, NEXT_ACTIONS } from '../errors.js';
import { findLawHierarchy, listLawHierarchyNames } from '../knowledge/law-hierarchy.js';
import {
  type FreshnessInfo,
  responseFreshness,
  SyncDateError,
  type SyncFreshness,
  summarizeFreshness,
  syncCommandHint,
} from '../services/freshness.js';
import { getAttachment, getLawFile, listAttachments } from '../services/law-files.js';
import {
  hasAnyArticle,
  type LawScope,
  type LawSearchHit,
  type ShortTokenSearch,
  searchLawsInDb,
} from '../services/law-search.js';
import {
  checkAbbreviationScope,
  getArticleReferences,
  getLawArticle,
  getLawRange,
  getLawRevisionsByName,
  getLawToc,
  getRelatedLaws,
  type SupplMode,
  searchLawByKeyword,
  verifyCitations,
} from '../services/law-service.js';
import type {
  ExplainLawTypeArgs,
  GetArticleReferencesArgs,
  GetAttachmentArgs,
  GetLawArgs,
  GetLawFileArgs,
  GetLawRangeArgs,
  GetLawRevisionsArgs,
  GetRelatedLawsArgs,
  GetTocArgs,
  ListAttachmentsArgs,
  ResolveAbbreviationArgs,
  SearchFulltextArgs,
  SearchLawArgs,
  VerifyCitationsArgs,
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import {
  explainLawTypeTool,
  getArticleReferencesTool,
  getAttachmentTool,
  getLawFileTool,
  getLawRangeTool,
  getLawRevisionsTool,
  getLawTool,
  getRelatedLawsTool,
  getTocTool,
  listAttachmentsTool,
  resolveAbbreviationTool,
  searchFulltextTool,
  searchLawTool,
  verifyCitationsTool,
} from './definitions.js';
import { bindTool, type ToolHandler } from './tool-args.js';

/**
 * search_law — 法令検索
 */
export async function handleSearchLaw(args: SearchLawArgs) {
  return searchLawByKeyword({
    keyword: args.keyword,
    law_type: args.law_type,
    limit: args.limit,
  });
}

/**
 * get_law — 条文取得
 *
 * - article 未指定 + format!="json" → TOC を返す
 * - article 指定 → 該当条文を Markdown で返す
 * - paragraph / item で粒度を指定可能
 */
export async function handleGetLaw(args: GetLawArgs) {
  return getLawArticle({
    law_name: args.law_name,
    article: args.article,
    paragraph: args.paragraph,
    item: args.item,
    // 省いたときは markdown（article も省けば目次）。候補の呼び直しの例に渡さなかった引数を足さないため、
    // ここでは既定値を入れない（SPEC-EGOV-COMMON-ERRORS-032）
    format: args.format as 'markdown' | 'json' | 'toc' | undefined,
    suppl_index: args.suppl_index,
    at: args.at,
  });
}

/**
 * get_toc — 目次取得
 *
 * depth を指定すると上位 N 階層までで打ち切る。
 * 民法・会社法のような大規模法令で TOC が肥大化する場合のサイズ対策。
 *
 * 本則と附則は別に返す（#24）。suppl で附則をどこまで返すかを選ぶ。
 */
export async function handleGetToc(args: GetTocArgs) {
  return getLawToc({
    law_name: args.law_name,
    at: args.at,
    depth: args.depth,
    suppl: args.suppl as SupplMode | undefined,
    with_amend_titles: args.with_amend_titles,
  });
}

/**
 * get_law_range — 編・章・節（または附則 1 本）を範囲にした条文の取得（egov#22）
 *
 * 範囲の指定は「編・章・節の番号」「path」「suppl_index」の 3 通りで、同時には 1 つだけ。
 * 文字数の上限を超える範囲は条の単位で打ち切り、続きの条番号を返す。
 */
export async function handleGetLawRange(args: GetLawRangeArgs) {
  return getLawRange({
    law_name: args.law_name,
    part: args.part,
    chapter: args.chapter,
    section: args.section,
    subsection: args.subsection,
    division: args.division,
    path: args.path,
    suppl_index: args.suppl_index,
    from_article: args.from_article,
    max_chars: args.max_chars,
    at: args.at,
  });
}

/** search_fulltext の bulk DB 応答 */
export interface SearchFulltextBulkResponse {
  keyword: string;
  /** 2 文字語 (trigram 索引に載らない語) を本文からどう引いたか (#23)。含まれないときは付かない */
  short_tokens?: ShortTokenSearch;
  /** 略称辞書で OR 展開した場合の元と先 */
  expanded_keywords?: { from: string; to: string };
  /** クエリ中の法令名を検索対象の法令として解釈した結果 (「民法 不法行為」の「民法」) */
  law_scope?: LawScope[];
  source: 'bulk';
  count: number;
  hits: LawSearchHit[];
  /** bulk DB の鮮度 (sync_state 由来) と引いた DB のパス。outdated なら warning 付き（SPEC-EGOV-SEARCH-FULLTEXT-023・043） */
  freshness: FreshnessInfo;
  filters: {
    law_type: string | null;
    /** 分野での絞り込みはしない。domain の引数は 0.18.0 で外した（SPEC-EGOV-SEARCH-FULLTEXT-022）。キーは残す */
    domain: { requested: null; applied: false; note: string };
  };
}

/** search_fulltext の API フォールバック応答 (v0.3.x までと同じ `note` / `fallback` を保持) */
export interface SearchFulltextFallbackResponse {
  keyword: string;
  source: 'api-fallback';
  note: string;
  next_actions: Array<{ action: string; reason: string; example?: Record<string, unknown> }>;
  /** DB を引いていないので 5 つとも null（SPEC-EGOV-SEARCH-FULLTEXT-043） */
  freshness: FreshnessInfo;
  fallback: unknown;
}

const DOMAIN_NOT_APPLIED_NOTE =
  '分野での絞り込みはしていません（domain の引数は 0.18.0 で外しました）';

/**
 * search_fulltext — 全文検索 (Phase 2-7 本実装)
 *
 * 1. bulk DB を読むだけで開く (`deps.dbPath` 省略時は `defaultDbPath()`)。DB が無い・版が今の版でない
 *    ときは DB を作らず書き換えずに search_law フォールバック（版ごとの note。039・040）
 * 2. `hasAnyArticle` が false (bulk DL 未実行) → search_law フォールバック + 誘導 note
 * 3. `searchLawsInDb` (articles_fts + laws_fts → JOIN laws → scoring → limit)
 * 4. freshness を付与 (outdated でも DB 結果を返す。API に倒さない)
 *
 * `deps.dbPath` はテスト用の注入口。`HOUKI_EGOV_DB_PATH` にそのパスを指定したときと同じに扱う。
 */
export async function handleSearchFulltext(
  args: SearchFulltextArgs,
  deps: { dbPath?: string } = {}
): Promise<SearchFulltextBulkResponse | SearchFulltextFallbackResponse | LawServiceError> {
  const keyword = (args.keyword ?? '').trim();
  // limit は inputSchema の検査（1〜30 の整数）を通った値なので丸めない（SPEC-EGOV-SEARCH-FULLTEXT-033）
  const limit = args.limit ?? LIMITS.fulltextDefault;

  // keyword 全体が houki-egov 以外の管轄の略称（通達など）なら、DB も e-Gov も引かずに OUT_OF_SCOPE
  // （SPEC-EGOV-SEARCH-FULLTEXT-037）。別の語と組み合わせたときは本文を探す
  const scopeError = checkAbbreviationScope(keyword);
  if (scopeError) return scopeError;

  // DB のファイル・フォルダー・テーブル・版の記録を作らず、読むだけで開く（SPEC-EGOV-SEARCH-FULLTEXT-039）。
  // 版が今の版でない DB は引かず、作り直さない（SPEC-EGOV-SEARCH-FULLTEXT-040）
  const location = deps.dbPath !== undefined ? dbLocationForPath(deps.dbPath) : resolveDbLocation();
  const dbPath = location.path;
  const { state, db } = openUsableDb(dbPath, { readonly: true });
  if (!db) {
    if (state.kind === 'error') {
      // DB を開けない (権限・ディスク等) 場合も API フォールバックで応答する
      logger.warn('search_fulltext', `bulk DB open failed: ${state.message}`);
    }
    return searchFulltextFallback(args, keyword, limit, fallbackReason(state, location));
  }

  try {
    if (!hasAnyArticle(db)) {
      return searchFulltextFallback(
        args,
        keyword,
        limit,
        fallbackReason({ kind: 'no-version' }, location)
      );
    }

    const result = searchLawsInDb(db, keyword, {
      limit,
      lawType: args.law_type,
      scanBody: args.scan_body === true,
    });
    let sync: SyncFreshness | null;
    try {
      sync = summarizeFreshness(db, syncCommandHint(location));
    } catch (err) {
      if (err instanceof SyncDateError) return syncDateError(err, location);
      throw err;
    }
    const freshness = responseFreshness(sync, displayDbPath(location.absolutePath));

    const response: SearchFulltextBulkResponse = {
      keyword,
      source: 'bulk',
      count: result.hits.length,
      hits: result.hits,
      freshness,
      filters: {
        law_type: args.law_type ?? null,
        domain: { requested: null, applied: false, note: DOMAIN_NOT_APPLIED_NOTE },
      },
    };
    if (result.short_tokens) response.short_tokens = result.short_tokens;
    if (result.expanded) response.expanded_keywords = result.expanded;
    if (result.law_scope) response.law_scope = result.law_scope;
    return response;
  } finally {
    closeDb(db);
  }
}

/**
 * 同期の記録の日付を解釈できないとき（SPEC-EGOV-COMMON-ERRORS-031・SPEC-EGOV-SEARCH-FULLTEXT-035）。
 * 時間をおいても DB の値は変わらないので retryable: false。CLI を案内する action の名前が無いので next_actions は付けない。
 * hint のコマンドは案内のコマンドの形（SPEC-EGOV-DB-SCHEMA-029）
 */
function syncDateError(err: SyncDateError, location: DbLocation): LawServiceError {
  return makeError('INTERNAL_ERROR', `同期の記録の日付を読めません: ${err.value}`, {
    hint: `\`${guideCommand('--bulk-download-everything', location)}\` で全件を取り込み直し、同期の記録を作り直してください`,
    retryable: false,
    detail: { cause: err.message },
  });
}

/** search_law に切り替える理由（note の先頭と続き、next_actions に bulk_download_everything を入れるか） */
interface FallbackReason {
  why: string;
  /** note の「、search_law (…) にフォールバックしています。」の後に続ける文 */
  remedy: string;
  /**
   * next_actions で案内する `--bulk-download-everything` のコマンド（SPEC-EGOV-DB-SCHEMA-029）。
   * 案内しないとき（新しい版・読めない版・開けない）は null
   */
  bulkCommand: string | null;
}

/**
 * DB の状態ごとの切り替えの理由（SPEC-EGOV-SEARCH-FULLTEXT-044 の表。002・027・039・040）。
 * `<パス>` は開こうとした DB のパスの応答の形（042）、`<コマンド>` は案内のコマンド（SPEC-EGOV-DB-SCHEMA-029）
 */
function fallbackReason(state: DbState, location: DbLocation): FallbackReason {
  const path = displayDbPath(location.absolutePath);
  const command = guideCommand('--bulk-download-everything', location);
  const build = `条文本文の全文検索を有効にするには \`${command}\` でローカル DB を構築してください`;
  switch (state.kind) {
    case 'missing':
      if (location.setting === 'HOUKI_EGOV_DB_PATH') {
        return {
          why: `HOUKI_EGOV_DB_PATH が指すファイル (${path}) が無いため`,
          remedy: `条文本文の全文検索を有効にするには、HOUKI_EGOV_DB_PATH を作ってある DB のファイルに直すか、\`${command}\` でこのパスにローカル DB を構築してください`,
          bulkCommand: command,
        };
      }
      return { why: `ローカル DB (${path}) が無いため`, remedy: build, bulkCommand: command };
    case 'old':
      return {
        why: `ローカル DB (${path}) の版 (${state.version}) がこの houki-egov-mcp (${SCHEMA_VERSION}) より古いため`,
        remedy: `条文本文の全文検索を有効にするには \`${command}\` でローカル DB を作り直してください（取り込んだ中身は消え、全件の zip 約 290 MB を取り直します）`,
        bulkCommand: command,
      };
    case 'new':
      return {
        why: `ローカル DB (${path}) の版 (${state.version}) がこの houki-egov-mcp (${SCHEMA_VERSION}) より新しいため`,
        remedy:
          '条文本文の全文検索を有効にするには houki-egov-mcp を新しい版に更新してください（DB は変更していません）',
        bulkCommand: null,
      };
    case 'unreadable':
      return {
        why: `ローカル DB (${path}) の版を読めないため (schema_version: ${state.value})`,
        remedy: `条文本文の全文検索を有効にするには DB ファイル (${path}) を消してから \`${command}\` を実行してください（DB は変更していません）`,
        bulkCommand: null,
      };
    case 'error':
      // --bulk-download-everything もこの DB では取得の前に止まるので案内しない（SPEC-EGOV-CLI-BULK-DOWNLOAD-029）
      return {
        why: `ローカル DB (${path}) を開けなかったため`,
        remedy:
          '条文本文の全文検索を有効にするには、このパスがフォルダーを指していないか、途中に普通のファイルが無いか、読む権限があるかを確かめてください（HOUKI_EGOV_DB_PATH を設定しているときはその値を直します）',
        bulkCommand: null,
      };
    default:
      // 版の記録が無い、または版が同じで条が 1 件も無い
      return {
        why: `ローカル DB (${path}) にまだ法令が取り込まれていないため`,
        remedy: build,
        bulkCommand: command,
      };
  }
}

/** bulk DB が使えないときの search_law フォールバック */
async function searchFulltextFallback(
  args: SearchFulltextArgs,
  keyword: string,
  limit: number,
  reason: FallbackReason
): Promise<SearchFulltextFallbackResponse> {
  const fallback = await searchLawByKeyword({
    keyword,
    law_type: args.law_type,
    limit,
  });
  const next_actions: SearchFulltextFallbackResponse['next_actions'] = [];
  if (reason.bulkCommand) {
    next_actions.push({
      action: 'bulk_download_everything',
      reason: 'CLI でローカル bulk DB を構築すると search_fulltext が SQLite FTS5 で動作します',
      example: { command: reason.bulkCommand },
    });
  }
  next_actions.push(NEXT_ACTIONS.searchLaw(keyword));
  return {
    keyword,
    source: 'api-fallback',
    note: `${reason.why}、search_law (法令名のタイトル一致) にフォールバックしています。${reason.remedy}`,
    next_actions,
    freshness: responseFreshness(null, null),
    fallback,
  };
}

/**
 * get_law_revisions — 法令の改正履歴取得
 */
export async function handleGetLawRevisions(args: GetLawRevisionsArgs) {
  return getLawRevisionsByName(args);
}

/**
 * resolve_abbreviation — 略称解決（@shuji-bonji/houki-abbreviations 経由）
 *
 * 全角英数字・ダッシュ類・全角空白は揃えてから辞書と照合する（SPEC-EGOV-RESOLVE-ABBREVIATION-011）。
 * 辞書のエントリはどの管轄でも返し、`in_scope` と `hint` で管轄を示す（012・013。houki-nta-mcp と同じ形）。
 */
export async function handleResolveAbbreviation(args: ResolveAbbreviationArgs) {
  const result = resolveAbbreviation(args.abbr, { normalize: true });
  if (!result) {
    // 辞書に無い略称は致命的ではないため、エラー応答ではなく
    // 既存の {abbr, resolved: null, note} 形を維持して後方互換を保つ。
    // ただし next_actions を付け、LLM が次に search_law を試せるようにする。
    return {
      abbr: args.abbr,
      resolved: null,
      note: '辞書に該当なし。フル法令名でお試しください',
      next_actions: [NEXT_ACTIONS.searchLaw(args.abbr)],
    };
  }
  if (result.source_mcp_hint === 'houki-egov') {
    return { abbr: args.abbr, resolved: result, in_scope: true };
  }
  return {
    abbr: args.abbr,
    resolved: result,
    in_scope: false,
    hint: `このエントリは ${result.source_mcp_hint} の管轄です。${result.source_mcp_hint}-mcp で取得してください。`,
  };
}

/**
 * explain_law_type — 法令種別の解説
 *
 * 法務専門家でない利用者が「政令と省令の違い」「通達は守らなくていいのか」を
 * 確認するための知識ツール。
 */
/**
 * explain_law_type の see_also。npm のパッケージに docs/ は入らないので、MCP クライアントから
 * 開ける GitHub の URL にする（SPEC-EGOV-EXPLAIN-LAW-TYPE-020）
 */
const LAW_HIERARCHY_DOC_URL =
  'https://github.com/shuji-bonji/houki-egov-mcp/blob/main/docs/LAW-HIERARCHY.md';

export async function handleExplainLawType(args: ExplainLawTypeArgs) {
  const entry = findLawHierarchy(args.name);
  if (!entry) {
    // 既存形を維持（テストとの後方互換）。next_actions のみ補足。
    return {
      name: args.name,
      found: false,
      hint: `知らない法令種別です。試せる名前: ${listLawHierarchyNames().join(', ')}`,
      see_also: LAW_HIERARCHY_DOC_URL,
      next_actions: [
        {
          action: 'list_known_law_types',
          reason: '知られている法令種別は次のとおり',
          example: { names: listLawHierarchyNames() },
        },
      ],
    };
  }
  return {
    name: args.name,
    found: true,
    info: entry,
    related_tools: ['search_law', 'get_law', 'get_toc'],
    see_also: LAW_HIERARCHY_DOC_URL,
  };
}

/**
 * get_related_laws — 法令名の規則で施行令・施行規則（または親の法律）を引く（egov#20）
 */
export async function handleGetRelatedLaws(args: GetRelatedLawsArgs) {
  return getRelatedLaws({ law_name: args.law_name });
}

/**
 * get_article_references — 条文本文からの参照抽出（egov#20）
 */
export async function handleGetArticleReferences(args: GetArticleReferencesArgs) {
  return getArticleReferences({
    law_name: args.law_name,
    article: args.article,
    paragraph: args.paragraph,
    at: args.at,
  });
}

/**
 * verify_citations — 引用リストの実在確認（egov#18）
 *
 * 件ごとに found / not_found / ambiguous を返し、リストに存在しない引用が混ざっていても
 * ツール全体は isError にしない。e-Gov に問い合わせられなかったときだけ全体のエラーを返す。
 */
export async function handleVerifyCitations(args: VerifyCitationsArgs) {
  return verifyCitations({
    citations: [...args.citations],
    at: args.at,
  });
}

/**
 * list_attachments — 添付ファイルの一覧（egov#19）
 */
export async function handleListAttachments(args: ListAttachmentsArgs) {
  return listAttachments({ law_name: args.law_name, at: args.at });
}

/**
 * get_attachment — 添付ファイル 1 件または zip（egov#19）
 */
export async function handleGetAttachment(args: GetAttachmentArgs) {
  return getAttachment({ law_name: args.law_name, src: args.src, at: args.at, save: args.save });
}

/**
 * get_law_file — 法令本文ファイル（egov#19）
 */
export async function handleGetLawFile(args: GetLawFileArgs) {
  return getLawFile({
    law_name: args.law_name,
    file_type: args.file_type,
    at: args.at,
    save: args.save,
  });
}

/**
 * tools/call の受け口の表。
 *
 * 引数は unknown で受け、`bindTool()` が inputSchema で検証してから型付きで各 handler に渡す
 * （v0.6.0。v0.5.x は `(args: any) => …` の表で、検証は server.ts が行っていた）。
 */
export const toolHandlers: Record<string, ToolHandler> = {
  search_law: bindTool(searchLawTool, handleSearchLaw),
  get_law: bindTool(getLawTool, handleGetLaw),
  get_toc: bindTool(getTocTool, handleGetToc),
  get_law_range: bindTool(getLawRangeTool, handleGetLawRange),
  get_law_revisions: bindTool(getLawRevisionsTool, handleGetLawRevisions),
  search_fulltext: bindTool(searchFulltextTool, (args) => handleSearchFulltext(args)),
  resolve_abbreviation: bindTool(resolveAbbreviationTool, handleResolveAbbreviation),
  explain_law_type: bindTool(explainLawTypeTool, handleExplainLawType),
  get_related_laws: bindTool(getRelatedLawsTool, handleGetRelatedLaws),
  get_article_references: bindTool(getArticleReferencesTool, handleGetArticleReferences),
  verify_citations: bindTool(verifyCitationsTool, handleVerifyCitations),
  list_attachments: bindTool(listAttachmentsTool, handleListAttachments),
  get_attachment: bindTool(getAttachmentTool, handleGetAttachment),
  get_law_file: bindTool(getLawFileTool, handleGetLawFile),
};
