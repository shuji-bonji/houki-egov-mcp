/**
 * Shared Types — egov-mcp 固有
 *
 * AbbreviationEntry は @shuji-bonji/houki-abbreviations から re-export している。
 * Single Source of Truth はそちら。
 */

import type {
  explainLawTypeTool,
  getLawRevisionsTool,
  getLawTool,
  getTocTool,
  resolveAbbreviationTool,
  searchFulltextTool,
  searchLawTool,
} from '../tools/definitions.js';
import type { ArgsOf } from '../tools/tool-args.js';

// houki-abbreviations から re-export（後方互換のため）
export type { AbbreviationEntry } from '@shuji-bonji/houki-abbreviations';

/**
 * ツールの引数の型（v0.6.0 から inputSchema から導く。手書きの interface はやめた）。
 * inputSchema は src/tools/definitions.ts。導き方は src/tools/tool-args.ts の `ArgsOf`。
 */

/** 法令検索引数 */
export type SearchLawArgs = ArgsOf<typeof searchLawTool.inputSchema>;

/** 条文取得引数。item は数値（8）か文字列（"8"・"8の2"・"第8号の2"） */
export type GetLawArgs = ArgsOf<typeof getLawTool.inputSchema>;

/** 目次取得引数 */
export type GetTocArgs = ArgsOf<typeof getTocTool.inputSchema>;

/** 全文検索引数（bulk cache モード時のみ有効） */
export type SearchFulltextArgs = ArgsOf<typeof searchFulltextTool.inputSchema>;

/** 改正履歴取得引数 */
export type GetLawRevisionsArgs = ArgsOf<typeof getLawRevisionsTool.inputSchema>;

/** 略称解決引数 */
export type ResolveAbbreviationArgs = ArgsOf<typeof resolveAbbreviationTool.inputSchema>;

/** 法令種別の解説引数 */
export type ExplainLawTypeArgs = ArgsOf<typeof explainLawTypeTool.inputSchema>;
