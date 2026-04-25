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
 * Paragraph の中から指定の号を取得。
 */
export function findItem(paragraph: LawNode, itemNum: number): LawNode | null {
  for (const c of paragraph.children ?? []) {
    if (typeof c === 'object' && c.tag === 'Item' && c.attr?.Num === String(itemNum)) {
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
  /** 子ノード */
  children: TocNode[];
}

const STRUCTURAL_TAGS = ['Part', 'Chapter', 'Section', 'Subsection', 'Division'];

/**
 * Law ツリーから TOC（編・章・節・条の構造）を抽出。
 * 本文（Paragraph 等）は含めない。
 */
export function extractToc(root: LawNode): TocNode[] {
  const result: TocNode[] = [];
  walkToc(root, result);
  return result;
}

function walkToc(node: LawNode, parent: TocNode[]): void {
  if (STRUCTURAL_TAGS.includes(node.tag)) {
    const titleTag = `${node.tag}Title`;
    const titleNode = findChildByTag(node, titleTag);
    const newNode: TocNode = {
      tag: node.tag,
      num: node.attr?.Num,
      title: titleNode ? extractText(titleNode) : '',
      children: [],
    };
    parent.push(newNode);
    for (const c of node.children ?? []) {
      if (typeof c === 'object') walkToc(c, newNode.children);
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
      if (typeof c === 'object') walkToc(c, parent);
    }
  }
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
