/**
 * 法令 JSON ツリー（Law / LawBody / Article / Paragraph / Item / ...）の走査ユーティリティ。
 *
 * e-Gov 法令API v2 の `law_full_text` は以下の形式：
 *
 *   { tag: 'Law', attr: {...}, children: [
 *     { tag: 'LawNum', children: [string] },
 *     { tag: 'LawBody', children: [
 *       { tag: 'LawTitle', children: [string] },
 *       { tag: 'MainProvision', children: [
 *         { tag: 'Chapter', attr: { Num: '1' }, children: [
 *           { tag: 'ChapterTitle', children: [string] },
 *           { tag: 'Article', attr: { Num: '30' }, children: [...] }
 *         ]}
 *       ]}
 *     ]}
 *   ]}
 *
 * Article の Num 表記:
 *   - "30" → 第三十条
 *   - "30_2" → 第三十条の二
 */

import type { LawNode } from './egov-client.js';

// 内部利用と law-service 等への re-export
export type { LawNode };

/**
 * 任意のノード以下の文字列を全て連結して返す。
 */
export function extractText(node: LawNode | string | null | undefined): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (!node.children) return '';
  return node.children.map(extractText).join('');
}

/**
 * 指定タグの子ノードを返す（最初の1件）。
 */
export function findChildByTag(parent: LawNode, tag: string): LawNode | null {
  for (const c of parent.children ?? []) {
    if (typeof c === 'object' && c.tag === tag) return c;
  }
  return null;
}

/**
 * 指定タグの子ノードを全て返す。
 */
export function findChildrenByTag(parent: LawNode, tag: string): LawNode[] {
  const result: LawNode[] = [];
  for (const c of parent.children ?? []) {
    if (typeof c === 'object' && c.tag === tag) result.push(c);
  }
  return result;
}

/**
 * Law ツリー全体から条番号で Article を探す。
 */
export function findArticle(root: LawNode, articleNum: string): LawNode | null {
  if (root.tag === 'Article' && root.attr?.Num === articleNum) return root;
  for (const c of root.children ?? []) {
    if (typeof c === 'object') {
      const r = findArticle(c, articleNum);
      if (r) return r;
    }
  }
  return null;
}

/**
 * Article の中から指定の項を取得。
 */
export function findParagraph(article: LawNode, paragraphNum: number): LawNode | null {
  for (const c of article.children ?? []) {
    if (typeof c === 'object' && c.tag === 'Paragraph' && c.attr?.Num === String(paragraphNum)) {
      return c;
    }
  }
  return null;
}

/**
 * 項番号の指定が無いまま号を探すときの項を返す（v0.6.0）。
 *
 * 項が 1 つだけの条は、「消費税法施行令第14条の3第1号」のように第1項を書かずに号を示す。
 * そのため、項が 1 つだけならその項を返し、複数あればどの項か決まらないので null を返す。
 */
export function findParagraphForItem(article: LawNode): LawNode | null {
  const paragraphs = findChildrenByTag(article, 'Paragraph');
  return paragraphs.length === 1 ? paragraphs[0] : null;
}

/**
 * Paragraph の中から指定の号を取得。
 *
 * @param itemNum e-Gov API 形式の号番号（`toEgovItemNum()` の戻り値）。例: "8", "8_2"
 */
export function findItem(paragraph: LawNode, itemNum: string): LawNode | null {
  for (const c of paragraph.children ?? []) {
    if (typeof c === 'object' && c.tag === 'Item' && c.attr?.Num === itemNum) {
      return c;
    }
  }
  return null;
}

/**
 * Article のキャプション（条見出し、例: "（仕入れに係る消費税額の控除）"）を返す。
 */
export function getArticleCaption(article: LawNode): string {
  const caption = findChildByTag(article, 'ArticleCaption');
  return caption ? extractText(caption) : '';
}

/**
 * Article の表示用タイトル（"第三十条"）を返す。
 */
export function getArticleTitle(article: LawNode): string {
  const title = findChildByTag(article, 'ArticleTitle');
  return title ? extractText(title) : '';
}

/** TOC ノード — 編・章・節・款・目・条の階層 */
export interface TocNode {
  /** タグ名（Part, Chapter, Section, Subsection, Division, Article） */
  tag: string;
  /** 番号（attr.Num） */
  num?: string;
  /** タイトル（PartTitle/ChapterTitle 等から抽出） */
  title: string;
  /** Article の場合、ArticleCaption（カッコ付き見出し） */
  caption?: string;
  /**
   * 本則の構造階層（編・章・節・款・目）に付く範囲のパス。例: `Part3/Chapter2`。
   * `get_law_range` の `path` にそのまま渡せる（#22、v0.14.0）。
   * 条（Article）と附則の中のノードには付かない。
   */
  path?: string;
  /** 子ノード */
  children: TocNode[];
}

/**
 * 範囲の指定に使える構造階層のタグ（上位から下位の順）。
 * `get_law_range` の引数名（`part` / `chapter` / …）とパスの綴り（`Part3/Chapter2`）の元。
 */
export const RANGE_TAGS = ['Part', 'Chapter', 'Section', 'Subsection', 'Division'] as const;

/** 範囲の指定に使える構造階層のタグ */
export type RangeTag = (typeof RANGE_TAGS)[number];

const STRUCTURAL_TAGS: readonly string[] = RANGE_TAGS;

/**
 * Law ツリーから本則の TOC（編・章・節・条の構造）を抽出。
 * 本文（Paragraph 等）は含めない。
 *
 * 附則（SupplProvision）の条は含めない。附則は改正法ごとに積み上がるため、
 * 本則と同じ並びに混ぜると現行の規定がどれか分からなくなる（#24、v0.13.0）。
 * 附則は `extractSupplProvisions()` で別に取る。
 */
export function extractToc(root: LawNode): TocNode[] {
  const result: TocNode[] = [];
  walkToc(root, result, '');
  return result;
}

/**
 * @param parentPath 親の構造ノードまでのパス（`Part3` 等）。`null` を渡すとパスを付けない
 *   （附則の中の構造ノードは範囲の指定に使わないため）
 */
function walkToc(node: LawNode, parent: TocNode[], parentPath: string | null): void {
  if (node.tag === 'SupplProvision') {
    // 附則は extractSupplProvisions() が改正法ごとに別に返す（#24）
    return;
  }
  if (STRUCTURAL_TAGS.includes(node.tag)) {
    const titleTag = `${node.tag}Title`;
    const titleNode = findChildByTag(node, titleTag);
    const path =
      parentPath === null
        ? undefined
        : `${parentPath ? `${parentPath}/` : ''}${node.tag}${node.attr?.Num ?? ''}`;
    const newNode: TocNode = {
      tag: node.tag,
      num: node.attr?.Num,
      title: titleNode ? extractText(titleNode) : '',
      ...(path ? { path } : {}),
      children: [],
    };
    parent.push(newNode);
    for (const c of node.children ?? []) {
      if (typeof c === 'object') walkToc(c, newNode.children, path ?? null);
    }
  } else if (node.tag === 'Article') {
    parent.push({
      tag: 'Article',
      num: node.attr?.Num,
      title: getArticleTitle(node),
      caption: getArticleCaption(node),
      children: [],
    });
  } else {
    for (const c of node.children ?? []) {
      if (typeof c === 'object') walkToc(c, parent, parentPath);
    }
  }
}

/**
 * TOC を指定階層までで打ち切る（大規模法令のレスポンスサイズ対策）。
 *
 * - depth=1: 最上位（編 or 章）のみ
 * - depth=2: 章/節まで（編 → 章 を含む）
 * - depth=N: 階層 N まで（その下の Article やサブ階層は省く）
 *
 * Article は構造階層と独立してリーフ扱いされるため、現在の階層数の判定は
 * STRUCTURAL_TAGS 出現回数のみで行う（Article の有無は depth に影響しない）。
 *
 * 切り捨てた階層は children: [] になる。元の TOC は変更しない（純粋関数）。
 */
export function limitTocDepth(toc: TocNode[], depth: number): TocNode[] {
  if (!Number.isFinite(depth) || depth < 1) {
    // depth=0 以下は意味なし → 入力をそのまま返す
    return toc;
  }
  const visit = (nodes: TocNode[], remaining: number): TocNode[] => {
    return nodes.map((n) => {
      // Article はそのまま残す（構造階層を消費しない）
      const isStructural = STRUCTURAL_TAGS.includes(n.tag);
      const next = isStructural ? remaining - 1 : remaining;
      if (next <= 0) {
        // 構造階層をこれ以上下に降りない → children を切り捨てる
        return { ...n, children: [] };
      }
      return { ...n, children: visit(n.children, next) };
    });
  };
  return visit(toc, depth);
}

/**
 * TOC ツリー全体のノード数を数える（サイズ感の判定用）。
 */
export function countTocNodes(toc: TocNode[]): number {
  let n = 0;
  const walk = (nodes: TocNode[]) => {
    for (const node of nodes) {
      n++;
      walk(node.children);
    }
  };
  walk(toc);
  return n;
}

/** 附則 1 本の目次（#24、v0.13.0） */
export interface SupplProvisionToc {
  /**
   * LawBody の中での並び順（1 始まり）。ローカル DB の条番号
   * `Suppl{index}_{条番号}`（`search_fulltext` が `附則(3) 1` と表示する番号）と同じ。
   */
  index: number;
  /** 見出しの文字列（`SupplProvisionLabel`。全角空白を詰めた「附則」） */
  label: string;
  /** どの改正法の附則か（`SupplProvision@AmendLawNum`）。制定時の附則には無い */
  amend_law_num?: string;
  /** 改正法の題名。改正履歴と照合できたときだけ付く（`with_amend_titles`） */
  amend_law_title?: string;
  /** 抄（`SupplProvision@Extract="true"`）。改正法の附則のうち一部だけを載せた形 */
  extract: boolean;
  /** この附則が持つ条の数 */
  article_count: number;
  /** 条を持たず項だけで書かれた附則か（「1 この法律は…から施行する」の形） */
  paragraph_only: boolean;
  /** 附則の中の目次。見出しだけを返すときは空配列 */
  children: TocNode[];
}

/**
 * Law ツリーから附則（SupplProvision）を出現順に取り出す。
 *
 * 附則は LawBody の直下に改正法ごとに 1 つずつ並ぶ（所得税法は 352 本）。
 * 中身は条（Article）か、条を立てずに項（Paragraph）だけを置く形のどちらかで、
 * どの改正法の附則かは属性 `AmendLawNum` に入っている。
 */
export function extractSupplProvisions(root: LawNode): SupplProvisionToc[] {
  const nodes: LawNode[] = [];
  collectSupplProvisions(root, nodes);
  return nodes.map((sp, i) => {
    const children: TocNode[] = [];
    for (const c of sp.children ?? []) {
      if (typeof c === 'object' && c.tag !== 'SupplProvisionLabel') walkToc(c, children, null);
    }
    const labelNode = findChildByTag(sp, 'SupplProvisionLabel');
    const articleCount = countTocArticles(children);
    return {
      index: i + 1,
      label: (labelNode ? extractText(labelNode) : '').replace(/[\s\u3000]/g, '') || '附則',
      ...(sp.attr?.AmendLawNum ? { amend_law_num: sp.attr.AmendLawNum } : {}),
      extract: sp.attr?.Extract === 'true',
      article_count: articleCount,
      paragraph_only: articleCount === 0 && findChildByTag(sp, 'Paragraph') !== null,
      children,
    };
  });
}

function collectSupplProvisions(node: LawNode, out: LawNode[]): void {
  for (const c of node.children ?? []) {
    if (typeof c !== 'object') continue;
    if (c.tag === 'SupplProvision') {
      // 附則の入れ子は無いので中には降りない
      out.push(c);
      continue;
    }
    collectSupplProvisions(c, out);
  }
}

/**
 * TOC ツリーの中の条（Article）の数を数える。
 */
export function countTocArticles(toc: TocNode[]): number {
  let n = 0;
  const walk = (nodes: TocNode[]) => {
    for (const node of nodes) {
      if (node.tag === 'Article') n++;
      walk(node.children);
    }
  };
  walk(toc);
  return n;
}

/**
 * Law ツリーから法令タイトルを抽出（LawBody/LawTitle）。
 */
export function getLawTitle(root: LawNode): string {
  const lawBody = findChildByTag(root, 'LawBody');
  if (!lawBody) return '';
  const titleNode = findChildByTag(lawBody, 'LawTitle');
  return titleNode ? extractText(titleNode) : '';
}

// ========================================
// #22: 章・節単位の範囲取得（v0.14.0）
// ========================================

/** 範囲のパスの 1 区切り。`Chapter2` の内訳と表示用の見出し */
export interface RangeSegment {
  tag: RangeTag;
  /** `attr.Num`。枝番号の章（第四章の二）は `4_2` */
  num: string;
  /** `ChapterTitle` 等から取った見出し（例: `第二章　契約`） */
  title: string;
}

/** 範囲の探索の結果 1 件 */
export interface RangeMatch {
  /** 範囲の根になる構造ノード */
  node: LawNode;
  /** 法令の根からこのノードまでの構造階層 */
  segments: RangeSegment[];
  /** `Part3/Chapter2` の形にしたパス */
  path: string;
}

/** 構造階層の列を `Part3/Chapter2` の形にする */
export function formatRangePath(segments: ReadonlyArray<{ tag: string; num: string }>): string {
  return segments.map((s) => `${s.tag}${s.num}`).join('/');
}

/**
 * `Part3/Chapter2` を読んで、タグと番号の列にする。
 *
 * タグの綴りは大文字小文字を問わない（`part3/chapter2` も読む）。枝番号は `Chapter4_2`。
 * 読めない区切りが 1 つでもあれば null を返す。
 */
export function parseRangePath(path: string): Array<{ tag: RangeTag; num: string }> | null {
  const parts = path
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const out: Array<{ tag: RangeTag; num: string }> = [];
  for (const part of parts) {
    const m = /^([A-Za-z]+)(\d+(?:_\d+)*)$/.exec(part);
    if (!m) return null;
    const tag = RANGE_TAGS.find((t) => t.toLowerCase() === m[1].toLowerCase());
    if (!tag) return null;
    out.push({ tag, num: m[2] });
  }
  return out;
}

/** 本則の構造ノードを、根からの階層付きで全て列挙する（出現順） */
function collectStructuralNodes(node: LawNode, segments: RangeSegment[], out: RangeMatch[]): void {
  for (const child of node.children ?? []) {
    if (typeof child !== 'object') continue;
    // 附則は構造階層に入れない（範囲の指定は suppl_index で行う）
    if (child.tag === 'SupplProvision') continue;
    if (RANGE_TAGS.includes(child.tag as RangeTag)) {
      const titleNode = findChildByTag(child, `${child.tag}Title`);
      const next: RangeSegment[] = [
        ...segments,
        {
          tag: child.tag as RangeTag,
          num: child.attr?.Num ?? '',
          title: titleNode ? extractText(titleNode) : '',
        },
      ];
      out.push({ node: child, segments: next, path: formatRangePath(next) });
      collectStructuralNodes(child, next, out);
    } else {
      collectStructuralNodes(child, segments, out);
    }
  }
}

/**
 * 編・章・節・款・目の番号で本則の範囲を探す。
 *
 * 指定したタグのうち最も下のものを範囲の根として返す。上位のタグは省略でき、省略した分は
 * 絞り込みに使わない。`Chapter@Num` は編ごとに振り直されるため（民法には `Chapter1` が 5 つ、
 * `Section1` が 19 ある）、上位を省いた指定は複数の範囲に当たることがある。
 * 呼び出し側は戻り値の件数を見て、2 件以上なら利用者に上位の指定を求める。
 *
 * @param selector タグごとの番号（e-Gov API 形式。`4_2` のような枝番号も可）
 */
export function findRanges(
  root: LawNode,
  selector: Partial<Record<RangeTag, string>>
): RangeMatch[] {
  const specified = RANGE_TAGS.filter((t) => selector[t] !== undefined);
  if (specified.length === 0) return [];
  const deepest = specified[specified.length - 1];
  const all: RangeMatch[] = [];
  collectStructuralNodes(root, [], all);
  return all.filter((m) => {
    if (m.segments[m.segments.length - 1].tag !== deepest) return false;
    return specified.every((tag) =>
      m.segments.some((s) => s.tag === tag && s.num === selector[tag])
    );
  });
}

/**
 * `Part3/Chapter2` のパスに完全に一致する範囲を探す（`get_toc` が返す `path` の受け口）。
 */
export function findRangeByPath(root: LawNode, path: string): RangeMatch | null {
  const parsed = parseRangePath(path);
  if (!parsed) return null;
  const wanted = formatRangePath(parsed);
  const all: RangeMatch[] = [];
  collectStructuralNodes(root, [], all);
  return all.find((m) => m.path === wanted) ?? null;
}

/**
 * 範囲の中の条（Article）を出現順に集める。
 *
 * 途中に附則（SupplProvision）があれば入らない。ただし附則そのものを渡したときは、
 * その附則の中の条を集める（`suppl_index` で附則 1 本を範囲にする場合）。
 */
export function collectArticlesInRange(node: LawNode): LawNode[] {
  const out: LawNode[] = [];
  const walk = (n: LawNode): void => {
    for (const c of n.children ?? []) {
      if (typeof c !== 'object') continue;
      if (c.tag === 'Article') {
        out.push(c);
        continue;
      }
      if (c.tag === 'SupplProvision') continue;
      walk(c);
    }
  };
  walk(node);
  return out;
}

/**
 * 附則を並び順（1 始まり）で 1 本取り出す。番号は `extractSupplProvisions()` の `index` と同じ。
 */
export function findSupplProvisionByIndex(root: LawNode, index: number): LawNode | null {
  const nodes: LawNode[] = [];
  collectSupplProvisions(root, nodes);
  return nodes[index - 1] ?? null;
}
