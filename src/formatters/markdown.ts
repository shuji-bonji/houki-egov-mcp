/**
 * 法令を Markdown に整形する。
 *
 * 出力規約:
 * - 見出しは `# 法令名 第X条第Y項第Z号`（指定された粒度に応じて）。枝番号の条は `第70条の6`
 * - 号は `ItemTitle` の漢数字を行頭に置き（`八 資産の譲渡等　事業として…`）、
 *   Column の間は全角空白、号の下のイ・ロ・ハ（Subitem1〜10）は Markdown の箇条書きにする
 * - 表（TableStruct）は Markdown の表にし、前後に空行を入れる
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
    body = joinLines(formatProvisionLines(item));
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

/** 項の子のうち、本文として出さないもの（項番号・項見出し） */
const PARAGRAPH_SKIP_TAGS = new Set(['ParagraphNum', 'ParagraphCaption']);

/**
 * Paragraph を整形。子を文書の順に出す。
 * - 1項のみ → "（項本文）"
 * - 号は 1 号 1 行（`formatProvisionLines()`）で、その下のイ・ロ・ハは箇条書き
 * - 項の直下の表（所得税法 89 条 1 項の税率表など）は Markdown の表
 * - それ以外の子（`List` など）は文字列を連結して 1 行
 */
function formatParagraph(paragraph: LawNode): string {
  const paragraphNum = paragraph.attr?.Num ?? '';

  const lines: string[] = [];
  // 項番号は 1 のみのとき表示しない（条文単独の場合）
  if (paragraphNum && paragraphNum !== '1') {
    lines.push(`**第${paragraphNum}項**`);
  }

  for (const child of paragraph.children ?? []) {
    if (typeof child !== 'object' || PARAGRAPH_SKIP_TAGS.has(child.tag)) continue;
    if (child.tag === 'ParagraphSentence') {
      const text = formatSentenceText(child);
      if (text) lines.push(text);
    } else if (child.tag === 'Item') {
      lines.push(...formatProvisionLines(child));
    } else if (child.tag === 'TableStruct') {
      lines.push(...formatTableStructLines(child));
    } else {
      const text = extractText(child).trim();
      if (text) lines.push(text);
    }
  }
  return joinLines(lines);
}

/** 行を改行でつなぎ、表の前後に入れた空行が 2 行以上続かないようにし、先頭と末尾の空行を落とす */
function joinLines(lines: string[]): string {
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
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
 * - `TableStruct`: Markdown の表（`formatTableStructLines()`）。箇条書きの中では字下げする
 * - それ以外の子（`List` など）: 文字列を連結して 1 行にする
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
    } else if (child.tag === 'TableStruct') {
      lines.push(...formatTableStructLines(child).map((l) => (l ? continuation + l : l)));
    } else {
      const text = extractText(child).trim();
      if (text) lines.push(continuation + text);
    }
  }
  return lines;
}

/**
 * 表（TableStruct）を Markdown の表の行の配列にする。前後に空行を入れる。
 *
 * - `TableStructTitle` は表の前の行に出す
 * - `TableHeaderRow` があれば 1 行目を Markdown の見出し行にする。無ければ見出し行は空欄にする
 *   （法令の表の多くは見出し行を持たず、1 行目もデータなので、1 行目を見出しに流用しない）
 * - `rowspan` / `colspan` で結合されたセルは、結合先を空欄にして列をそろえる
 * - セルの中の `|` は `\|` にする
 * - `Remarks`（備考）は表の後の行に出す
 */
export function formatTableStructLines(tableStruct: LawNode): string[] {
  const lines: string[] = [''];
  const title = findChildByTag(tableStruct, 'TableStructTitle');
  if (title) {
    const text = extractText(title).trim();
    if (text) lines.push(text, '');
  }
  for (const child of tableStruct.children ?? []) {
    if (typeof child !== 'object') continue;
    if (child.tag === 'Table') {
      lines.push(...formatTableLines(child), '');
    } else if (child.tag === 'Remarks') {
      lines.push(...formatRemarksLines(child), '');
    }
  }
  return lines;
}

/** Table を Markdown の表にする（空行は含めない） */
function formatTableLines(table: LawNode): string[] {
  const rows = (table.children ?? []).filter(
    (c): c is LawNode =>
      typeof c === 'object' && (c.tag === 'TableHeaderRow' || c.tag === 'TableRow')
  );
  if (rows.length === 0) return [];

  // rowspan / colspan を展開した格子。結合先は空欄
  const grid: string[][] = [];
  const occupied: boolean[][] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    grid[r] ??= [];
    occupied[r] ??= [];
    let c = 0;
    for (const cell of row.children ?? []) {
      if (typeof cell !== 'object') continue;
      while (occupied[r][c]) c++;
      const rowspan = Math.max(1, Number(cell.attr?.rowspan) || 1);
      const colspan = Math.max(1, Number(cell.attr?.colspan) || 1);
      for (let dr = 0; dr < rowspan && r + dr < rows.length; dr++) {
        grid[r + dr] ??= [];
        occupied[r + dr] ??= [];
        for (let dc = 0; dc < colspan; dc++) {
          occupied[r + dr][c + dc] = true;
          grid[r + dr][c + dc] = dr === 0 && dc === 0 ? formatCellText(cell) : '';
        }
      }
      c += colspan;
    }
  }

  const width = Math.max(...grid.map((g) => g.length));
  const toRow = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
  const hasHeader = rows[0].tag === 'TableHeaderRow';
  const header = hasHeader ? grid[0] : [];
  const body = hasHeader ? grid.slice(1) : grid;
  return [
    toRow(header),
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...body.map(toRow),
  ];
}

/** セル（TableColumn / TableHeaderColumn）の文字列。子（Sentence など）は半角空白でつなぐ */
function formatCellText(cell: LawNode): string {
  const parts = (cell.children ?? []).map((c) => extractText(c).trim()).filter(Boolean);
  return parts.join(' ').replace(/\|/g, '\\|');
}

/** Remarks（備考）を行の配列にする。1 行目は RemarksLabel + 本文、号があれば続ける */
function formatRemarksLines(remarks: LawNode): string[] {
  const label = findChildByTag(remarks, 'RemarksLabel');
  const head: string[] = [];
  if (label) head.push(extractText(label).trim());
  const lines: string[] = [];
  for (const child of remarks.children ?? []) {
    if (typeof child !== 'object' || child === label) continue;
    if (child.tag === 'Item') {
      lines.push(...formatProvisionLines(child));
    } else {
      const text = extractText(child).trim();
      if (text) head.push(text);
    }
  }
  const first = head.filter(Boolean).join(' ');
  return first ? [first, ...lines] : lines;
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
