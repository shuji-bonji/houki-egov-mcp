/**
 * 法令名の規則による関連付け（egov#20、v0.9.0）。
 *
 * 「所得税法」→「所得税法施行令」「所得税法施行規則」のように、名前の末尾に付ける・落とすだけで候補を作る。
 * ここでは文字列だけを扱い、実在の確認（e-Gov `/laws` で `law_title` が完全一致する 1 件）は law-service が行う。
 *
 * 名前の候補は「施行令」「施行規則」の 2 つだけ。「…の施行に関する省令」「…施行細則」のような形は名前から
 * 一意に作れないので対象にしない（応答の note で明示する）。
 */

/** 関連の種類 */
export type LawRelation = 'enforcement_order' | 'enforcement_rule' | 'parent_act';

export interface RelationCandidate {
  relation: LawRelation;
  /** e-Gov の law_title と完全一致させる候補名 */
  title: string;
}

const SUBORDINATE_SUFFIXES = ['施行規則', '施行令'] as const;

/** 法令名が施行令・施行規則の形なら、親の法律名を返す。そうでなければ null */
export function parentActTitle(title: string): string | null {
  for (const suffix of SUBORDINATE_SUFFIXES) {
    if (title.endsWith(suffix) && title.length > suffix.length) {
      return title.slice(0, -suffix.length);
    }
  }
  return null;
}

/**
 * 法令名から関連法令の候補を作る。
 *
 * - 法律（末尾が施行令・施行規則でない）: `施行令` / `施行規則`
 * - 施行令: 親の法律 / 兄弟の `施行規則`
 * - 施行規則: 親の法律 / 兄弟の `施行令`
 */
export function relationCandidates(title: string): RelationCandidate[] {
  const parent = parentActTitle(title);
  if (parent === null) {
    return [
      { relation: 'enforcement_order', title: `${title}施行令` },
      { relation: 'enforcement_rule', title: `${title}施行規則` },
    ];
  }
  const out: RelationCandidate[] = [{ relation: 'parent_act', title: parent }];
  if (title.endsWith('施行令')) {
    out.push({ relation: 'enforcement_rule', title: `${parent}施行規則` });
  } else {
    out.push({ relation: 'enforcement_order', title: `${parent}施行令` });
  }
  return out;
}

/** 応答に常に付ける注記（網羅性を主張しない） */
export const RELATED_LAWS_NOTE =
  '法令名の末尾に「施行令」「施行規則」を付けた（または落とした）名前で e-Gov に実在するものだけを返しています。「…の施行に関する省令」など別の名前の下位法令、複数の省令、告示は対象外です。網羅性は保証しません';
