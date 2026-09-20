/**
 * Law Search — ローカル SQLite FTS5 による法令全文検索 (Phase 2-7, v0.5.0)
 *
 * houki-nta-mcp `db-search.ts` の clause → article 読み替え移植。
 *
 * 検索経路 (docs/PHASE2-7-PLAN.md §3):
 *
 * ```
 * keyword → normalizeSearchQuery → resolveAbbreviation (OR 展開)
 *         → articles_fts MATCH (条本文)  ─┐
 *         → laws_fts MATCH (法令名・略称) ─┴→ laws と JOIN (CurrentEnforced に絞る)
 *         → relevance scoring → limit
 * ```
 *
 * 設計判断:
 *  - **Normalize-everywhere**: ingester が `normalizeJpText` で投入した列に対し、
 *    ここでは `normalizeSearchQuery` (幅 + 小文字化 + 空白圧縮) を通した query を投げる
 *  - **revision 重複対策** (PHASE2-DESIGN.md §6.1): laws と JOIN して
 *    `current_revision_status = 'CurrentEnforced' OR remain_in_force = 1` に絞り、
 *    同一法令の PreviousEnforced / UnEnforced revision が重複ヒットしないようにする
 *  - **law_meta 経路**: 本文が articles に入らない法令 (別表のみ、太政官布告 等) や
 *    「法令名そのもの」で探しているケースを laws_fts で捕捉し `match_type: 'law_meta'` として
 *    マージする。同じ revision が article 経路で既にヒットしていれば law_meta 側は捨てる
 *  - **2 文字語** (#23): trigram 索引は 3 文字以上の語しか載せないため、「相殺」「時効」のような
 *    2 文字語だけのクエリは MATCH に乗らない。法令名で絞れているときはその範囲を、絞れていない
 *    ときは articles 全体を LIKE で走査し、どの経路を通ったかを `short_tokens` で申告する
 *  - re-rank のため FTS からは `min(limit * 3, 150)` 件取り、スコア順に並べ替えてから limit 件返す
 *  - `domain` フィルタは `laws.category` が Phase 2-13 まで全 null のため **本モジュールでは受け付けない**
 *    (handler 側で「未実効」の note を返す)
 */

import { normalizeSearchQuery, resolveAbbreviation } from '@shuji-bonji/houki-abbreviations';
import type DatabaseT from 'better-sqlite3';
import { SCAN_BODY_SECONDS } from '../constants.js';
import type { NextAction } from '../errors.js';
import { fromEgovArticleNum } from '../utils/article-num.js';
import {
  computeLawRelevance,
  extractArticleNumFromQuery,
  sortByScoreDesc,
} from './relevance-scoring.js';

/** re-rank 用に FTS から多めに取る倍率と上限 (nta と同じ定数) */
const RERANK_FETCH_MULTIPLIER = 3;
const RERANK_MAX_FETCH = 150;

/** snippet() のトークン数 */
const SNIPPET_TOKENS = 16;

/**
 * LIKE 経路の snippet。FTS の `snippet()` は MATCH にしか使えないため、
 * 一致位置の手前 20 文字から 80 文字を `articles.body` (正規化済み本文) から切り出す。
 * `instr` が 0 (見つからない) のときは本文の先頭から切り出す。
 */
const LIKE_SNIPPET_SQL = `substr(a.body, max(1, instr(a.body, ?) - 20), 80)`;

/** LIKE 経路の固定 rank。base score は 1 / (1 + 10 / 5) = 0.33 になる */
const LIKE_ARTICLE_RANK = -5.0;

/** LIKE パターンに使うメタ文字 (`%` `_` `\\`) をエスケープする */
function toLikePattern(token: string): string {
  return `%${token.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
}

/** 1 件のヒット (article / law_meta 共通) */
export interface LawSearchHit {
  /** `article` = 条本文ヒット、`law_meta` = 法令名・略称・番号ヒット */
  match_type: 'article' | 'law_meta';
  law_id: string;
  law_revision_id: string;
  law_title: string;
  law_num: string;
  law_type: string;
  /** 条番号 (表示形式。`30` / `30の2` / `Suppl1_1` / `Appendix1`)。law_meta では null */
  article_num: string | null;
  /** 条見出し。law_meta では null */
  caption: string | null;
  /** 章節パス (例: `第一章 総則`)。law_meta では null */
  chapter_path: string | null;
  /** FTS5 snippet (`<b>` でハイライト)。law_meta では法令名 */
  snippet: string;
  /** FTS5 rank (BM25、負値) */
  rank: number;
  /** relevance score (0〜1) */
  score: number;
  /** score の内訳 */
  score_reasons: string[];
  /** e-Gov 法令検索 URL */
  url: string;
}

/** `searchLawsInDb` のオプション */
export interface LawSearchOptions {
  /** 返却件数 (1〜) */
  limit?: number;
  /** e-Gov LawType コードで絞り込み (Act / CabinetOrder / ...) */
  lawType?: string;
  /** 略称の OR 展開を無効化 (テスト用) */
  enableAbbreviationExpansion?: boolean;
  /**
   * 2 文字語だけのクエリで、法令を絞らずに本文を LIKE で走査するか (#23)。
   * 既定 false。true にすると全法令の条本文を端から照合するため、実データ
   * (条 143 万件・本文 588 MB) で 5〜20 秒かかる。
   */
  scanBody?: boolean;
}

/**
 * 2 文字語 (trigram 索引に載らない語) を本文からどう引いたかの内訳 (#23)。
 *
 * `body_search` の 3 つの値は、実際に走った経路の名前:
 *  - `fts_then_filter`   — 3 文字以上の語で articles_fts を引き、その本文に 2 文字語が
 *                          含まれるかで絞った (`searchArticleFts` + JS フィルタ)
 *  - `like_in_law_scope` — 法令名で絞った範囲の本文を LIKE で引いた (`searchArticleLikeInScope`)
 *  - `like_all_articles` — 法令を絞らず articles の本文を LIKE で走査した
 *                          (`searchArticleLikeGlobal`。`scan_body: true` のときだけ)
 *  - `not_searched`      — 本文を引いていない。返したヒットは法令名・略称・番号の照合によるもの
 */
export interface ShortTokenSearch {
  /** クエリ中の 2 文字トークン */
  tokens: string[];
  /** articles_fts の trigram が索引する最小文字数 */
  fts_min_token_length: number;
  /** 本文をどの経路で引いたか */
  body_search: 'fts_then_filter' | 'like_in_law_scope' | 'like_all_articles' | 'not_searched';
  /** LIKE 走査が上限件数に達して打ち切られたか */
  truncated: boolean;
  /** 返したヒットの内訳 (article = 条本文由来、law_meta = 法令名・略称・番号由来) */
  hits_by_match_type: { article: number; law_meta: number };
  /** 何をして結果を出したかの説明 */
  note: string;
  /** 本文を引いていないとき (`not_searched`) に、次に呼べる形を示す */
  next_actions?: NextAction[];
}

/** `searchLawsInDb` の戻り値 */
export interface LawSearchResult {
  hits: LawSearchHit[];
  /** 略称展開が行われた場合の元と先 */
  expanded?: { from: string; to: string };
  /** FTS5 に投げた MATCH 式 (デバッグ用) */
  fts_query: string;
  /**
   * クエリ中の法令名・略称トークンを「検索対象の法令」として解釈した結果。
   * 例: `民法 不法行為` → `[{ token: '民法', law_title: '民法', law_id: '129AC…' }]`
   * (本文検索は残りの `不法行為` で行い、民法の条に絞る)
   */
  law_scope?: LawScope[];
  /** クエリに 2 文字トークンが含まれていたときだけ付く (#23) */
  short_tokens?: ShortTokenSearch;
}

/** 法令スコープ 1 件 */
export interface LawScope {
  /** 元のトークン */
  token: string;
  law_title: string;
  /** 辞書に law_id があればそれ、なければ null (law_title で絞る) */
  law_id: string | null;
}

/** 附則の条か (`Suppl{idx}_{Num}`) */
export function isSupplementaryArticle(articleNum: string): boolean {
  return articleNum.startsWith('Suppl');
}

/**
 * articles.article_num (xml-parser の識別子) を表示用に整形する。
 *
 * - 本則: `30` → `30`、`30_2` → `30の2`
 * - 附則: `Suppl3_1` → `附則(3) 1`、`Suppl137_51_2` → `附則(137) 51の2`
 *   ※ 括弧内は法令 XML 内での附則の通し番号 (改正法ごとに附則が積み重なる)
 * - 別表: `Appendix2` → `別表(2)`
 */
export function formatArticleNumForDisplay(articleNum: string): string {
  const suppl = articleNum.match(/^Suppl(\d+)_(.+)$/);
  if (suppl) return `附則(${suppl[1]}) ${fromEgovArticleNum(suppl[2])}`;
  const appendix = articleNum.match(/^Appendix(\d+)$/);
  if (appendix) return `別表(${appendix[1]})`;
  return fromEgovArticleNum(articleNum);
}

/** e-Gov 法令検索 URL */
function egovUrl(lawId: string): string {
  return `https://laws.e-gov.go.jp/law/${lawId}`;
}

/** trigram tokenizer が索引する最小文字数。これ未満のトークンは MATCH に乗らない */
export const FTS_MIN_TOKEN_LENGTH = 3;

/** クエリ中の「第N条」「第N条のM」(条番号指定)。MATCH には乗せず boost にだけ使う */
const ARTICLE_NUM_IN_QUERY = /第\s*\d+(?:の\d+)*\s*条(?:の\d+)?/g;

/**
 * 1 つのキーワードを FTS5 フレーズ式に整形する。
 *
 * - `normalizeSearchQuery` で幅・大小文字・空白を正規化 (DB 投入時と整合)
 * - 「第30条」のような条番号指定は取り除く (本文には「第三十条」とは書かれていないため。
 *   条番号は `relevance-scoring.ts` の boost で扱う)
 * - 改行・FTS5 メタ文字 (`"*:()`) をスペース化
 * - trigram に乗らない 3 文字未満のトークンは落とす (残らなければ空文字)
 * - 空白区切りの各トークンを `"tok"` で包み AND 結合
 */
export function sanitizeFtsQuery(raw: string): string {
  if (!raw) return '';
  const normalized = normalizeSearchQuery(raw).replace(ARTICLE_NUM_IN_QUERY, ' ');
  const cleaned = normalized
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/["*:()]/g, ' ')
    .trim();
  const tokens = cleaned.split(/\s+/).filter((t) => t.length >= FTS_MIN_TOKEN_LENGTH);
  if (tokens.length === 0) return '';
  return tokens.map((t) => `"${t}"`).join(' AND ');
}

/** LIKE / 本文 includes で補完する短トークンの最小文字数 (1 文字はノイズが多すぎるため対象外) */
export const SHORT_TOKEN_MIN_LENGTH = 2;

/**
 * クエリ中の 2 文字トークン (trigram で引けないが意味のある語。「民法」「保存」等) を返す。
 * 1 文字トークンと条番号指定は捨てる。
 */
export function extractShortTokens(raw: string): string[] {
  const normalized = normalizeSearchQuery(raw ?? '').replace(ARTICLE_NUM_IN_QUERY, ' ');
  return normalized
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/["*:()]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= SHORT_TOKEN_MIN_LENGTH && t.length < FTS_MIN_TOKEN_LENGTH);
}

/**
 * 略称展開を行ったうえで FTS5 の MATCH 式を組み立てる。
 *
 * `resolveAbbreviation(keyword, { normalize: true })` が `source_mcp_hint: 'houki-egov'`
 * のエントリを返した場合、`(main) OR (formal)` に展開する。
 * 例: `消法` → `("消法") OR ("消費税法")`、`インボイス` → `("インボイス") OR ("消費税法")`
 */
export function buildFtsQueryWithAbbreviation(
  keyword: string,
  options: { enableExpansion?: boolean } = {}
): { query: string; expandedFrom?: string; expandedTo?: string } {
  const enable = options.enableExpansion !== false;
  const trimmed = keyword?.trim() ?? '';
  const main = sanitizeFtsQuery(trimmed);
  if (!enable) return { query: main };

  const abbr = resolveAbbreviation(trimmed, { normalize: true });
  if (!abbr) return { query: main };
  if (abbr.source_mcp_hint !== 'houki-egov') return { query: main };
  if (abbr.formal === trimmed) return { query: main };

  const formalPhrase = sanitizeFtsQuery(abbr.formal);
  if (!formalPhrase) return { query: main };

  // 「消法」のように略称自体が trigram に乗らない場合は formal だけで検索する
  const query = main ? `(${main}) OR (${formalPhrase})` : formalPhrase;
  return {
    query,
    expandedFrom: trimmed,
    expandedTo: abbr.formal,
  };
}

/** DB 内に検索可能な条が 1 件以上あるか (0 件なら bulk DL 未実行と判定) */
export function hasAnyArticle(db: DatabaseT.Database): boolean {
  const row = db.prepare('SELECT 1 AS one FROM articles LIMIT 1').get() as
    | { one: number }
    | undefined;
  return row !== undefined;
}

/** DB 内に法令が 1 件以上あるか */
export function hasAnyLaw(db: DatabaseT.Database): boolean {
  const row = db.prepare('SELECT 1 AS one FROM laws LIMIT 1').get() as { one: number } | undefined;
  return row !== undefined;
}

/** laws JOIN 時の共通 WHERE (revision 重複対策 + law_type 絞り込み + 法令スコープ) */
function statusWhere(
  lawType: string | undefined,
  params: Array<string | number>,
  scope: LawScope[] = []
): string {
  let where = ` AND (l.current_revision_status = 'CurrentEnforced' OR l.remain_in_force = 1)`;
  if (lawType) {
    where += ` AND l.law_type = ?`;
    params.push(lawType);
  }
  if (scope.length > 0) {
    const ids = scope.filter((sc) => sc.law_id).map((sc) => sc.law_id as string);
    const titles = scope.filter((sc) => !sc.law_id).map((sc) => sc.law_title);
    const parts: string[] = [];
    if (ids.length > 0) {
      parts.push(`l.law_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
    if (titles.length > 0) {
      parts.push(`l.law_title IN (${titles.map(() => '?').join(',')})`);
      params.push(...titles);
    }
    where += ` AND (${parts.join(' OR ')})`;
  }
  return where;
}

/** クエリを空白でトークンに分ける (条番号指定・メタ文字は除去、1 文字は捨てる) */
function tokenizeQuery(raw: string): string[] {
  return normalizeSearchQuery(raw ?? '')
    .replace(ARTICLE_NUM_IN_QUERY, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/["*:()]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= SHORT_TOKEN_MIN_LENGTH);
}

/**
 * トークンのうち「法令名そのもの」を指すものを法令スコープに解釈する。
 *
 * - 辞書 (`resolveAbbreviation`) の `formal` または `abbr` と一致 → その法令 (law_id)
 *   ※ aliases (「インボイス」「適格請求書」等の通称) は法令名ではないので対象外 (OR 展開に回す)
 * - DB の `laws.law_title` と完全一致 → その法令 (law_title)
 *
 * 2 トークン以上あるときだけ適用する (1 トークンのクエリは従来どおり law_meta / OR 展開)。
 *
 * @returns scope と、本文検索に残すトークン
 */
export function splitLawScope(
  db: DatabaseT.Database,
  tokens: string[],
  options: { allowAllScope?: boolean } = {}
): { scope: LawScope[]; rest: string[] } {
  // 条番号指定 (「民法 第709条」) があるときは 1 トークンでもスコープにする (allowAllScope)
  if (tokens.length < 2 && !options.allowAllScope) return { scope: [], rest: tokens };
  const scope: LawScope[] = [];
  const rest: string[] = [];
  const titleExists = db.prepare('SELECT law_title FROM laws WHERE law_title = ? LIMIT 1');
  for (const t of tokens) {
    const e = resolveAbbreviation(t, { normalize: true });
    if (e && e.source_mcp_hint === 'houki-egov' && (e.formal === t || e.abbr === t)) {
      scope.push({ token: t, law_title: e.formal, law_id: e.law_id ?? null });
      continue;
    }
    const row = titleExists.get(t) as { law_title: string } | undefined;
    if (row) {
      scope.push({ token: t, law_title: row.law_title, law_id: null });
      continue;
    }
    rest.push(t);
  }
  // 全トークンが法令名なら (「民法 商法」) スコープ扱いにせず従来経路へ
  if (rest.length === 0 && !options.allowAllScope) return { scope: [], rest: tokens };
  return { scope, rest };
}

/**
 * 「民法 第709条」のように法令名 + 条番号 だけのクエリは、その条を直接引く。
 * rank は固定 (-30) で base を高くし、`article_num_match` で最上位に来るようにする。
 */
export function lookupArticleInScope(
  db: DatabaseT.Database,
  articleNum: string,
  options: { lawType?: string; scope: LawScope[] }
): ArticleRow[] {
  if (options.scope.length === 0) return [];
  const params: Array<string | number> = [articleNum];
  const where = statusWhere(options.lawType, params, options.scope);
  const sql = `
    SELECT
      a.law_revision_id, a.article_num, a.caption, a.chapter_path,
      l.law_id, l.law_title, l.law_num, l.law_type, l.abbrev,
      substr(a.body_raw, 1, 120) AS snippet,
      -30.0 AS rank,
      a.body AS body
    FROM articles a
    JOIN laws l ON l.law_revision_id = a.law_revision_id
    WHERE a.article_num = ?${where}
    ORDER BY a.ord
    LIMIT 10
  `;
  return db.prepare(sql).all(...params) as ArticleRow[];
}

/** articles_fts の生ヒット行 */
interface ArticleRow {
  law_revision_id: string;
  article_num: string;
  caption: string | null;
  chapter_path: string | null;
  law_id: string;
  law_title: string;
  law_num: string;
  law_type: string;
  abbrev: string | null;
  snippet: string;
  rank: number;
  /** normalize 済み本文 (短トークンの絞り込み用。応答には含めない) */
  body: string;
}

/** laws_fts の生ヒット行 */
interface LawMetaRow {
  law_revision_id: string;
  law_id: string;
  law_title: string;
  law_num: string;
  law_type: string;
  abbrev: string | null;
  rank: number;
}

/**
 * 条本文 (articles_fts) を検索する。スコアリング前の生ヒットを FTS5 順で返す。
 */
export function searchArticleFts(
  db: DatabaseT.Database,
  ftsQuery: string,
  options: { fetchLimit: number; lawType?: string; scope?: LawScope[] }
): ArticleRow[] {
  if (!ftsQuery) return [];
  const params: Array<string | number> = [ftsQuery];
  const where = statusWhere(options.lawType, params, options.scope);
  params.push(options.fetchLimit);
  const sql = `
    SELECT
      a.law_revision_id, a.article_num, a.caption, a.chapter_path,
      l.law_id, l.law_title, l.law_num, l.law_type, l.abbrev,
      snippet(articles_fts, 0, '<b>', '</b>', ' … ', ${SNIPPET_TOKENS}) AS snippet,
      articles_fts.rank AS rank,
      a.body AS body
    FROM articles_fts
    JOIN articles a ON a.id = articles_fts.rowid
    JOIN laws l ON l.law_revision_id = a.law_revision_id
    WHERE articles_fts MATCH ?${where}
    ORDER BY articles_fts.rank
    LIMIT ?
  `;
  return db.prepare(sql).all(...params) as ArticleRow[];
}

/**
 * 法令スコープ内で、2 文字語だけのクエリ (「民法 契約」の「契約」) を本文 LIKE で引く。
 * スコープで対象法令が絞られているため全件 LIKE でも現実的な件数で済む。
 * rank は固定 (-5) で base score を控えめにする。
 */
export function searchArticleLikeInScope(
  db: DatabaseT.Database,
  tokens: string[],
  options: { fetchLimit: number; lawType?: string; scope: LawScope[] }
): ArticleRow[] {
  if (tokens.length === 0 || options.scope.length === 0) return [];
  // 先頭の ? は SELECT 側の snippet 用 (SQL に現れる順に bind する)
  const params: Array<string | number> = [tokens[0]];
  const clauses = tokens.map((t) => {
    params.push(toLikePattern(t));
    return `a.body LIKE ? ESCAPE '\\'`;
  });
  const where = statusWhere(options.lawType, params, options.scope);
  params.push(options.fetchLimit);
  const sql = `
    SELECT
      a.law_revision_id, a.article_num, a.caption, a.chapter_path,
      l.law_id, l.law_title, l.law_num, l.law_type, l.abbrev,
      ${LIKE_SNIPPET_SQL} AS snippet,
      ${LIKE_ARTICLE_RANK} AS rank,
      a.body AS body
    FROM articles a
    JOIN laws l ON l.law_revision_id = a.law_revision_id
    WHERE ${clauses.join(' AND ')}${where}
    ORDER BY a.ord
    LIMIT ?
  `;
  return db.prepare(sql).all(...params) as ArticleRow[];
}

/**
 * 法令を絞らずに `articles` の本文を LIKE で走査する (#23)。
 *
 * 「相殺」「時効」のように 2 文字語だけのクエリは articles_fts の MATCH に乗らないため、
 * ここだけは索引を使わずに走査する。`ORDER BY` を付けないのは、SQLite が `LIMIT` に
 * 達した時点で走査を止められるようにするため (並べ替えると必ず全表を読む)。
 * そのぶん並び順は関連度順ではなく、呼び出し側が `short_tokens.note` でそれを申告する。
 */
export function searchArticleLikeGlobal(
  db: DatabaseT.Database,
  tokens: string[],
  options: { fetchLimit: number; lawType?: string }
): ArticleRow[] {
  if (tokens.length === 0) return [];
  const params: Array<string | number> = [tokens[0]];
  const clauses = tokens.map((t) => {
    params.push(toLikePattern(t));
    return `a.body LIKE ? ESCAPE '\\'`;
  });
  const where = statusWhere(options.lawType, params);
  params.push(options.fetchLimit);
  const sql = `
    SELECT
      a.law_revision_id, a.article_num, a.caption, a.chapter_path,
      l.law_id, l.law_title, l.law_num, l.law_type, l.abbrev,
      ${LIKE_SNIPPET_SQL} AS snippet,
      ${LIKE_ARTICLE_RANK} AS rank,
      a.body AS body
    FROM articles a
    JOIN laws l ON l.law_revision_id = a.law_revision_id
    WHERE ${clauses.join(' AND ')}${where}
    LIMIT ?
  `;
  return db.prepare(sql).all(...params) as ArticleRow[];
}

/**
 * 法令名・略称・番号 (laws_fts) を検索する。スコアリング前の生ヒットを FTS5 順で返す。
 */
export function searchLawMetaFts(
  db: DatabaseT.Database,
  ftsQuery: string,
  options: { fetchLimit: number; lawType?: string; scope?: LawScope[] }
): LawMetaRow[] {
  if (!ftsQuery) return [];
  const params: Array<string | number> = [ftsQuery];
  const where = statusWhere(options.lawType, params, options.scope);
  params.push(options.fetchLimit);
  const sql = `
    SELECT
      l.law_revision_id, l.law_id, l.law_title, l.law_num, l.law_type, l.abbrev,
      laws_fts.rank AS rank
    FROM laws_fts
    JOIN laws l ON l.law_revision_id = laws_fts.law_revision_id
    WHERE laws_fts MATCH ?${where}
    ORDER BY laws_fts.rank
    LIMIT ?
  `;
  return db.prepare(sql).all(...params) as LawMetaRow[];
}

/**
 * 3 文字未満の語 (「民法」「商法」等) は trigram で引けないため、laws の
 * `law_title` / `abbrev` を LIKE で引く補助経路。rank は固定 (-1) で base score を低めにし、
 * `title_exact_match` / `abbrev_match` の boost で完全一致を上位に寄せる。
 */
export function searchLawMetaLike(
  db: DatabaseT.Database,
  tokens: string[],
  options: { fetchLimit: number; lawType?: string }
): LawMetaRow[] {
  if (tokens.length === 0) return [];
  const params: Array<string | number> = [];
  const clauses = tokens.map((t) => {
    const like = toLikePattern(t);
    params.push(like, like);
    return `(l.law_title LIKE ? ESCAPE '\\' OR l.abbrev LIKE ? ESCAPE '\\')`;
  });
  const where = statusWhere(options.lawType, params);
  params.push(options.fetchLimit);
  const sql = `
    SELECT
      l.law_revision_id, l.law_id, l.law_title, l.law_num, l.law_type, l.abbrev,
      -1.0 AS rank
    FROM laws l
    WHERE ${clauses.join(' AND ')}${where}
    ORDER BY length(l.law_title)
    LIMIT ?
  `;
  return db.prepare(sql).all(...params) as LawMetaRow[];
}

/** ArticleRow → LawSearchHit (scoring 込み) */
function toArticleHit(r: ArticleRow, query: string, dictAbbrevs: string[]): LawSearchHit {
  const { score, score_reasons } = computeLawRelevance({
    rank: r.rank,
    query,
    lawTitle: r.law_title,
    abbrevs: [r.abbrev, ...dictAbbrevs],
    articleNum: r.article_num,
    caption: r.caption,
    isSupplementary: isSupplementaryArticle(r.article_num),
  });
  return {
    match_type: 'article',
    law_id: r.law_id,
    law_revision_id: r.law_revision_id,
    law_title: r.law_title,
    law_num: r.law_num,
    law_type: r.law_type,
    article_num: formatArticleNumForDisplay(r.article_num),
    caption: r.caption,
    chapter_path: r.chapter_path || null,
    snippet: r.snippet,
    rank: r.rank,
    score,
    score_reasons,
    url: egovUrl(r.law_id),
  };
}

/**
 * 2 文字語をどう引いたかを `short_tokens` にまとめる (#23)。
 *
 * 応答を読んだ側が「本文を引いたのか、法令名だけを引いたのか」を数で判断できるよう、
 * 経路の名前・打ち切りの有無・match_type ごとの件数を添える。
 */
function describeShortTokenSearch(input: {
  tokens: string[];
  bodySearch: ShortTokenSearch['body_search'];
  truncated: boolean;
  fetchLimit: number;
  hits: LawSearchHit[];
}): ShortTokenSearch {
  const list = input.tokens.map((t) => `「${t}」`).join('・');
  const head = `${list} は ${FTS_MIN_TOKEN_LENGTH} 文字未満です。条本文の索引 articles_fts は trigram のため ${FTS_MIN_TOKEN_LENGTH} 文字以上の語しか載せません。`;
  let note: string;
  let nextActions: NextAction[] | undefined;
  switch (input.bodySearch) {
    case 'fts_then_filter':
      note = `${head}${FTS_MIN_TOKEN_LENGTH} 文字以上の語で索引を引いたうえで、その条の本文に ${list} が含まれるかで絞り込みました。`;
      break;
    case 'like_in_law_scope':
      note = `${head}クエリ中の法令名で対象を絞り、その範囲の条の本文を LIKE で引きました。`;
      break;
    case 'like_all_articles':
      note = `${head}scan_body: true のため、索引を使わずに全法令の条の本文を走査しました。並び順は関連度順ではありません。`;
      break;
    default:
      note = `${head}条の本文は引いていません。返したヒットは法令名・略称・番号の照合によるものです。法令名を添えると、索引でその法令の条本文を引けます。法令名が分からないときは scan_body: true を付けると全法令の条本文を端から照合します (索引を使わないため ${SCAN_BODY_SECONDS}かかります)。`;
      nextActions = [
        {
          action: 'search_fulltext',
          reason: '法令名を添えると、その法令の条本文を引けます (索引が使えるので速い)',
          example: { keyword: `民法 ${input.tokens[0]}` },
        },
        {
          action: 'search_fulltext',
          reason: `法令名が分からないときは全法令の条本文を走査できます (${SCAN_BODY_SECONDS}かかります)`,
          example: { keyword: input.tokens.join(' '), scan_body: true },
        },
      ];
      break;
  }
  if (input.truncated) {
    note += `走査は ${input.fetchLimit} 件で打ち切っており、該当する条をすべて数えたものではありません。`;
  }
  const article = input.hits.filter((h) => h.match_type === 'article').length;
  const result: ShortTokenSearch = {
    tokens: input.tokens,
    fts_min_token_length: FTS_MIN_TOKEN_LENGTH,
    body_search: input.bodySearch,
    truncated: input.truncated,
    hits_by_match_type: { article, law_meta: input.hits.length - article },
    note,
  };
  if (nextActions) result.next_actions = nextActions;
  return result;
}

/**
 * 全文検索の本体。article 経路と law_meta 経路をマージし、スコア順に limit 件返す。
 *
 * @param db initSchema 済み DB
 * @param keyword ユーザー入力 (略称展開前)
 */
export function searchLawsInDb(
  db: DatabaseT.Database,
  keyword: string,
  options: LawSearchOptions = {}
): LawSearchResult {
  const limit = Math.max(options.limit ?? 10, 1);

  // 「民法 不法行為」のように法令名 + 語 のクエリは、法令名をスコープ (絞り込み) に回す。
  // 条番号指定 (「民法 第709条」) があるときは法令名だけでもスコープにし、その条を直接引く
  const queryArticleNum = extractArticleNumFromQuery(keyword);
  const { scope, rest } = splitLawScope(db, tokenizeQuery(keyword), {
    allowAllScope: queryArticleNum !== null,
  });
  const searchText = scope.length > 0 ? rest.join(' ') : keyword;

  if (queryArticleNum && scope.length > 0 && rest.length === 0) {
    const rows = lookupArticleInScope(db, queryArticleNum, { lawType: options.lawType, scope });
    const hits = rows.map((r) => toArticleHit(r, keyword, []));
    return { hits: sortByScoreDesc(hits).slice(0, limit), fts_query: '', law_scope: scope };
  }

  const built = buildFtsQueryWithAbbreviation(searchText, {
    enableExpansion: options.enableAbbreviationExpansion,
  });
  const shortTokens = extractShortTokens(searchText);
  // 短トークンで後段絞り込みするときは多めに取る
  const fetchLimit =
    shortTokens.length > 0
      ? RERANK_MAX_FETCH
      : Math.min(limit * RERANK_FETCH_MULTIPLIER, RERANK_MAX_FETCH);
  if (!built.query && shortTokens.length === 0) return { hits: [], fts_query: '' };

  // 略称辞書側の abbr / aliases を boost 判定に使う (formal が一致する法令のみ)
  const dictEntry = resolveAbbreviation(searchText.trim(), { normalize: true });
  const dictAbbrevsFor = (lawTitle: string): string[] => {
    if (!dictEntry || dictEntry.formal !== lawTitle) return [];
    return [dictEntry.abbr, ...(dictEntry.aliases ?? [])];
  };

  // 2 文字トークンは trigram で引けないため、本文を引く経路が 3 つに分かれる (#23)
  let bodySearch: ShortTokenSearch['body_search'] = 'fts_then_filter';
  let articleRows: ArticleRow[];
  if (built.query) {
    // 3 文字以上の語で索引を引き、2 文字語は本文に含まれるかで絞る (AND 意味論)
    articleRows = searchArticleFts(db, built.query, {
      fetchLimit,
      lawType: options.lawType,
      scope,
    }).filter((r) => shortTokens.every((t) => r.body.includes(t)));
  } else if (scope.length > 0) {
    bodySearch = 'like_in_law_scope';
    articleRows = searchArticleLikeInScope(db, shortTokens, {
      fetchLimit,
      lawType: options.lawType,
      scope,
    });
  } else if (options.scanBody) {
    bodySearch = 'like_all_articles';
    articleRows = searchArticleLikeGlobal(db, shortTokens, {
      fetchLimit,
      lawType: options.lawType,
    });
  } else {
    // 既定では走査しない。法令名・略称の照合 (law_meta 経路) だけを返し、note で申告する
    bodySearch = 'not_searched';
    articleRows = [];
  }
  const seenRevisions = new Set<string>();
  const hits: LawSearchHit[] = articleRows.map((r) => {
    seenRevisions.add(r.law_revision_id);
    return toArticleHit(r, searchText, dictAbbrevsFor(r.law_title));
  });

  const metaRows = searchLawMetaFts(db, built.query, {
    fetchLimit,
    lawType: options.lawType,
    scope,
  });
  if (shortTokens.length > 0 && !built.query && scope.length === 0) {
    // 「民法」のようにクエリ全体が短い語のときは法令名 LIKE で補完する
    metaRows.push(...searchLawMetaLike(db, shortTokens, { fetchLimit, lawType: options.lawType }));
  }
  for (const r of metaRows) {
    if (seenRevisions.has(r.law_revision_id)) continue; // article 経路で捕捉済み
    seenRevisions.add(r.law_revision_id);
    const { score, score_reasons } = computeLawRelevance({
      rank: r.rank,
      query: searchText,
      lawTitle: r.law_title,
      abbrevs: [r.abbrev, ...dictAbbrevsFor(r.law_title)],
    });
    hits.push({
      match_type: 'law_meta',
      law_id: r.law_id,
      law_revision_id: r.law_revision_id,
      law_title: r.law_title,
      law_num: r.law_num,
      law_type: r.law_type,
      article_num: null,
      caption: null,
      chapter_path: null,
      snippet: r.law_title,
      rank: r.rank,
      score,
      score_reasons: [...score_reasons, 'law_meta (法令名・略称・番号でヒット)'],
      url: egovUrl(r.law_id),
    });
  }

  const sorted = sortByScoreDesc(hits).slice(0, limit);
  const result: LawSearchResult = { hits: sorted, fts_query: built.query };
  if (shortTokens.length > 0) {
    result.short_tokens = describeShortTokenSearch({
      tokens: shortTokens,
      bodySearch,
      // FTS 経路は索引側で件数が決まるので打ち切り扱いにしない
      truncated: bodySearch !== 'fts_then_filter' && articleRows.length >= fetchLimit,
      fetchLimit,
      hits: sorted,
    });
  }
  if (scope.length > 0) result.law_scope = scope;
  if (built.expandedFrom && built.expandedTo) {
    result.expanded = { from: built.expandedFrom, to: built.expandedTo };
  }
  return result;
}
