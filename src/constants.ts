/**
 * Shared Constants — egov-mcp 固有
 *
 * 略称辞書系の定数（LAW_TYPE_CODES / DOMAINS）は @shuji-bonji/houki-abbreviations
 * から re-export している。Single Source of Truth はそちら。
 */

export type { Domain, LawTypeCode } from '@shuji-bonji/houki-abbreviations';
// houki-abbreviations から共有定数を re-export
export { DOMAINS, LAW_TYPE_CODES } from '@shuji-bonji/houki-abbreviations';

/** 元号コード（e-Gov law_id の先頭1文字） */
export const ERA_CODES = {
  1: 'Meiji',
  2: 'Taisho',
  3: 'Showa',
  4: 'Heisei',
  5: 'Reiwa',
} as const;

/** 検索結果・取得件数の上限 */
export const LIMITS = {
  searchDefault: 10,
  searchMax: 50,
  fulltextDefault: 10,
  fulltextMax: 30,
  /** verify_citations が 1 回で受け付ける引用の件数（inputSchema の maxItems） */
  citationsMax: 50,
} as const;

/**
 * `search_fulltext` の `scan_body: true` の所要時間。inputSchema の説明と
 * `short_tokens.note` で同じ数字を使うための定数。
 *
 * 2026-09-20 に実データ（条 1,434,710 件・本文 587,926,852 バイト）で測った値は、
 * 打ち切りが効く語で 5.4 秒、該当が少なく全表を走り切る語で 22 秒。
 */
export const SCAN_BODY_SECONDS = '5〜20 秒';

/** 出力フォーマットの列挙 */
export const OUTPUT_FORMATS = ['markdown', 'json', 'toc'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
