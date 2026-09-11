/**
 * 法令を Markdown に整形する。
 *
 * 出力規約:
 * - 見出しは `# 法令名 第X条第Y項第Z号`（指定された粒度に応じて）。枝番号の条は `第70条の6`
 * - 号は `ItemTitle` の漢数字を行頭に置き（`八 資産の譲渡等　事業として…`）、
 *   Column の間は全角空白、号の下のイ・ロ・ハ（Subitem1〜10）は Markdown の箇条書きにする
 * - 末尾に必ず出典 URL と取得日時を付ける
 * - 本MCPは事実情報の提示に徹し、判断・解釈は加えない
 */

import { EGOV_API } from '../config.js';
import type { LawNode } from '../services/egov-client.js';
import {
  extractText,
  findChildByTag,
  findChildrenByTag,
  getArticleCaption,
  type TocNode,
} from '../services/law-tree.js';
import { formatArticleLabel, fromEgovArticleNum } from '../utils/article-num.js';

export interface FormatArticleOptions {
  lawTitle: string;
  lawId: string;
  article: LawNode;
  /** 項を指定して取得する場合 */
  paragraph?: LawNode;
  /** 号を指定して取得する場合 */
  item?: LawNode;
  retrievedAt: string;
  at?: string;
}

/**
 * 条文を Markdown に整形する。
 * paragraph / item 指定があればその範囲だけ出力。
 */
export function formatArticleMarkdown(opts: FormatArticleOptions): string {
  const { lawTitle, lawId, article, paragraph, item, retrievedAt, at } = opts;
  const articleNum = article.attr?.Num ?? '';
  const articleLabel = formatArticleLabel(articleNum);
  const caption = getArticleCaption(article);

  // 見出し
  let header: string;
  if (item && paragraph) {
    header = `# ${lawTitle} ${articleLabel}第${paragraph.attr?.Num}項第${item.attr?.Num}号`;
  } else if (paragraph) {
    header = `# ${lawTitle} ${articleLabel}第${paragraph.attr?.Num}項`;
  } else {
    header = `# ${lawTitle} ${articleLabel}`;
  }

  // 本文
  let body: string;
  if (item) {
    body = formatProvisionLines(item).join('\n');
  } else if (paragraph) {
    body = formatParagraph(paragraph);
  } else {
    body = formatArticleBody(article);
  }

  const url = EGOV_API.publicLawUrl(lawId);
  const lines = [header];
  if (caption) lines.push(caption);
  lines.push('', body, '', '---', '出典：e-Gov法令検索（デジタル庁）', `URL: ${url}`);
  if (at) lines.push(`時点: ${at}`);
  lines.push(`取得日時: ${retrievedAt}`);
  return lines.join('\n');
}

/**
 * Article 全体を Markdown に整形（全項・全号を含む）。
 */
function formatArticleBody(article: LawNode): string {
  const paragraphs = findChildrenByTag(article, 'Paragraph');
  return paragraphs.map(formatParagraph).join('\n\n');
}

/**
 * Paragraph を整形。
 * - 1項のみ → "（項本文）"
 * - 号は 1 号 1 行（`formatProvisionLines()`）で、その下のイ・ロ・ハは箇条書き
 */
function formatParagraph(paragraph: LawNode): string {
  const paragraphNum = paragraph.attr?.Num ?? '';
  const sentenceNode = findChildByTag(paragraph, 'ParagraphSentence');
  const paragraphText = sentenceNode ? formatSentenceText(sentenceNode) : '';
  const items = findChildrenByTag(paragraph, 'Item');

  const lines: string[] = [];
  // 項番号は 1 のみのとき表示しない（条文単独の場合）
  if (paragraphNum && paragraphNum !== '1') {
    lines.push(`**第${paragraphNum}項**`);
  }
  if (paragraphText) lines.push(paragraphText);

  for (const item of items) {
    lines.push(...formatProvisionLines(item));
  }
  return lines.join('\n');
}

/** Column（号の見出し語と定義文など）の区切り。e-Gov 法令検索の画面表示と同じ全角空白 */
const COLUMN_SEPARATOR = '\u3000';

/** Subitem1〜Subitem10 */
const SUBITEM_TAG = /^Subitem\d+$/;

/**
 * 本文ノード（ParagraphSentence / ItemSentence / Subitem1Sentence …）を 1 行の文字列にする。
 * Column が並ぶときは全角空白で区切る。Sentence だけのとき（本文とただし書など）は区切らない。
 */
function formatSentenceText(node: LawNode): string {
  const columns = findChildrenByTag(node, 'Column');
  if (columns.length > 0) {
    return columns
      .map((c) => extractText(c).trim())
      .filter(Boolean)
      .join(COLUMN_SEPARATOR);
  }
  return extractText(node).trim();
}

/**
 * 号（Item）または Subitem1〜10 を行の配列にする。
 *
 * - 1 行目: 見出し（`ItemTitle` / `Subitem1Title` …）+ 半角空白 + 本文
 *   - `ItemTitle` が無い号は `Num` を表示用にして使う（"8_2" → "8の2"）
 * - `Subitem1`〜: 改行して Markdown の箇条書きにする（深さ 1 は `- `、深さ 2 は `  - `）
 * - それ以外の子（`TableStruct` / `List` など）: 文字列を連結して 1 行にする
 *   （中身は v0.5.3 までと同じ。改行して前後の本文とつながらないようにする）
 *
 * @param depth 0 = 号、1 = Subitem1、2 = Subitem2 …
 */
export function formatProvisionLines(node: LawNode, depth = 0): string[] {
  const titleNode = findChildByTag(node, `${node.tag}Title`);
  const sentenceNode = findChildByTag(node, `${node.tag}Sentence`);
  let title = titleNode ? extractText(titleNode).trim() : '';
  const num = node.attr?.Num;
  if (!title && node.tag === 'Item' && num) {
    title = fromEgovArticleNum(num);
  }
  const sentence = sentenceNode ? formatSentenceText(sentenceNode) : '';
  const bullet = depth === 0 ? '' : `${'  '.repeat(depth - 1)}- `;
  const lines = [bullet + [title, sentence].filter(Boolean).join(' ')];

  // 箇条書きの項目の続きとして読まれる字下げ（深さ 0 では字下げしない）
  const continuation = '  '.repeat(depth);
  for (const child of node.children ?? []) {
    if (typeof child !== 'object' || child === titleNode || child === sentenceNode) continue;
    if (SUBITEM_TAG.test(child.tag)) {
      lines.push(...formatProvisionLines(child, depth + 1));
    } else {
      const text = extractText(child).trim();
      if (text) lines.push(continuation + text);
    }
  }
  return lines;
}

/**
 * TOC を Markdown に整形。
 */
export function formatTocMarkdown(opts: {
  lawTitle: string;
  lawId: string;
  toc: TocNode[];
  retrievedAt: string;
  at?: string;
}): string {
  const { lawTitle, lawId, toc, retrievedAt, at } = opts;
  const lines = [`# ${lawTitle} — 目次`, ''];
  for (const node of toc) {
    appendTocLines(lines, node, 0);
  }
  lines.push('', '---', '出典：e-Gov法令検索（デジタル庁）');
  lines.push(`URL: ${EGOV_API.publicLawUrl(lawId)}`);
  if (at) lines.push(`時点: ${at}`);
  lines.push(`取得日時: ${retrievedAt}`);
  return lines.join('\n');
}

function appendTocLines(lines: string[], node: TocNode, depth: number): void {
  const indent = '  '.repeat(depth);
  if (node.tag === 'Article') {
    const label = node.num ? formatArticleLabel(node.num) : node.title;
    const captionPart = node.caption ? ` ${node.caption}` : '';
    lines.push(`${indent}- ${label}${captionPart}`);
  } else {
    lines.push(`${indent}- ${node.title}`);
    for (const c of node.children) {
      appendTocLines(lines, c, depth + 1);
    }
  }
}
