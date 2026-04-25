/**
 * MCP Tool Handlers
 *
 * NOTE: Phase 0 スケルトンのため、実装はスタブ。
 * Phase 1 で e-Gov API v2 クライアントと接続する。
 */

import { resolveAbbreviation } from '../abbreviations/index.js';
import { findLawHierarchy, listLawHierarchyNames } from '../knowledge/law-hierarchy.js';
import {
  findBusinessLawRestriction,
  listBusinessLawProfessions,
} from '../knowledge/business-law-restrictions.js';
import type { SearchLawArgs, GetLawArgs, GetTocArgs, SearchFulltextArgs } from '../types/index.js';

const NOT_IMPLEMENTED = {
  status: 'not_implemented',
  phase: 'Phase 0 (skeleton)',
  note: 'この tool は Phase 1 で実装予定。現在は略称辞書のみ動作する。',
};

/**
 * search_law — 法令検索（スタブ）
 */
export async function handleSearchLaw(args: SearchLawArgs) {
  return {
    tool: 'search_law',
    args,
    ...NOT_IMPLEMENTED,
  };
}

/**
 * get_law — 条文取得（スタブ）
 *
 * 動作するのは略称解決のみ。実 API 呼び出しは Phase 1。
 */
export async function handleGetLaw(args: GetLawArgs) {
  const resolved = resolveAbbreviation(args.law_name);
  return {
    tool: 'get_law',
    args,
    resolved_abbreviation: resolved,
    ...NOT_IMPLEMENTED,
  };
}

/**
 * get_toc — 目次取得（スタブ）
 */
export async function handleGetToc(args: GetTocArgs) {
  const resolved = resolveAbbreviation(args.law_name);
  return {
    tool: 'get_toc',
    args,
    resolved_abbreviation: resolved,
    ...NOT_IMPLEMENTED,
  };
}

/**
 * search_fulltext — 全文検索（スタブ）
 */
export async function handleSearchFulltext(args: SearchFulltextArgs) {
  return {
    tool: 'search_fulltext',
    args,
    ...NOT_IMPLEMENTED,
  };
}

/**
 * resolve_abbreviation — 略称解決（Phase 0 で動作）
 */
export async function handleResolveAbbreviation(args: { abbr: string }) {
  const result = resolveAbbreviation(args.abbr);
  if (!result) {
    return {
      abbr: args.abbr,
      resolved: null,
      note: '辞書に該当なし。フル法令名でお試しください',
    };
  }
  return {
    abbr: args.abbr,
    resolved: result,
  };
}

/**
 * explain_law_type — 法令種別の解説（Phase 0 で動作）
 *
 * 法務専門家でない利用者が「政令と省令の違い」「通達は守らなくていいのか」を
 * 確認するための知識ツール。
 */
export async function handleExplainLawType(args: { name: string }) {
  const entry = findLawHierarchy(args.name);
  if (!entry) {
    return {
      name: args.name,
      found: false,
      hint: `知らない法令種別です。試せる名前: ${listLawHierarchyNames().join(', ')}`,
      see_also: 'docs/LAW-HIERARCHY.md',
    };
  }
  return {
    name: args.name,
    found: true,
    info: entry,
    related_tools: ['search_law', 'get_law', 'get_toc'],
    see_also: 'docs/LAW-HIERARCHY.md',
  };
}

/**
 * explain_business_law_restriction — 士業独占規定の解説（Phase 0 で動作）
 *
 * 利用者が「houki-hub-mcp + LLM の活用が業法に抵触しないか」を判断するための知識ツール。
 */
export async function handleExplainBusinessLawRestriction(args: { name: string }) {
  const entry = findBusinessLawRestriction(args.name);
  if (!entry) {
    return {
      name: args.name,
      found: false,
      hint: `知らない士業／業法です。試せる名前: ${listBusinessLawProfessions().join(', ')}`,
      see_also: 'DISCLAIMER.md',
    };
  }
  return {
    name: args.name,
    found: true,
    info: entry,
    related_tools: ['explain_law_type', 'get_law'],
    see_also: 'DISCLAIMER.md',
    disclaimer:
      '本データは法令の概要を示すものであり、個別事案の判断は有資格者に相談してください。境界事例は判例・通達でも解釈が分かれることがあります。',
  };
}

/**
 * Tool handlers map
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const toolHandlers: Record<string, (args: any) => Promise<unknown>> = {
  search_law: handleSearchLaw,
  get_law: handleGetLaw,
  get_toc: handleGetToc,
  search_fulltext: handleSearchFulltext,
  resolve_abbreviation: handleResolveAbbreviation,
  explain_law_type: handleExplainLawType,
  explain_business_law_restriction: handleExplainBusinessLawRestriction,
};
