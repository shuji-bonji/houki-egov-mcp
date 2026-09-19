/**
 * 条文本文からの参照抽出（egov#20、v0.10.0）。
 *
 * 文字列だけを扱い、e-Gov API も略称辞書も呼ばない（呼び出し側の law-service が名前の解決を行う）。
 * 同じ本文と同じ既知法令名からは同じ結果を返す。
 *
 * 取る順（先に取れた文字範囲は後の規則の対象から外す）:
 *   ① 法令名（法令番号）+ 条項号        → external（法令番号で解決済みの名前を呼び出し側から受け取る）
 *   ② 同法 / 前項 / 次条 / 同条第四項 …  → relative（解決しない）
 *   ③ 既知の法令名 + 条項号              → external（辞書の正式名称、①で解決した名前、施行令の中の「法」）
 *   ④ 第N条 第N項 第N号（法令名なし）    → internal（同一法令内）
 *   ⑤ 政令で定める / 財務省令で定める    → delegation（法令単位の委任。条は特定しない）
 *
 * 取れなかった参照は検出できない。呼び出し側は応答に「抽出できた範囲だけ」と書く。
 */

import {
  fromEgovArticleNum,
  kanjiToNumber,
  toEgovArticleNum,
  toEgovItemNum,
} from '../utils/article-num.js';

const KAN = '[〇一二三四五六七八九十百千]';
/** 「第五十七条の二第二項第一号」のような条・項・号の並び。どれも省略可 */
const ART_CHAIN = `(第${KAN}+条(?:の${KAN}+)*)?(第${KAN}+項)?(第${KAN}+号(?:の${KAN}+)*)?`;
/** 法令番号。例: 昭和四十九年法律第百十六号、昭和四十年大蔵省令第十一号 */
const LAW_NUM = `(?:明治|大正|昭和|平成|令和)[一二三四五六七八九十元]+年[^（）]{1,20}?第${KAN}+号`;

/** 参照先の条・項・号（利用者向け表記。`get_law` にそのまま渡せる） */
export interface ArticleLocator {
  /** 条番号。"57の2" のような枝番号も含む */
  article?: string;
  paragraph?: number;
  /** 号番号。"8の2" のような枝番号を保つため文字列 */
  item?: string;
  /**
   * 「第二条第二項第二号及び第六項第五号」の後半のように、条を書かずに直前の参照と「及び」「又は」「、」で
   * つながっている参照は、直前の参照の条を引き継ぐ。引き継いだときは、その直前の参照の raw をここに入れる（v0.10.1）
   */
  article_from?: string;
}

/** 法令番号の付いた法令名の出現（① の前段。呼び出し側が法令番号で名前を解決する） */
export interface LawNumMention {
  /** 法令番号。例: "昭和四十九年法律第百十六号" */
  law_num: string;
  /** 括弧の直前にあった文字列。法令名の候補で、末尾だけが法令名（前に「つき」などが付く） */
  name_candidate: string;
}

/** 呼び出し側で解決済みの法令（① と ③ で本文と照合する） */
export interface KnownLaw {
  title: string;
  law_id: string;
  law_num?: string;
}

export interface ExtractContext {
  /** 法令番号で解決できた法令。① で `title（law_num）` を照合する */
  resolvedByNum: KnownLaw[];
  /** 名前だけで照合する法令（辞書の正式名称など）。③ で使う */
  knownLaws: KnownLaw[];
  /** 施行令・施行規則の本文で「法」が指す親の法律。あれば ③ で「法第N条」を external にする */
  parentAct?: KnownLaw;
}

export interface ExternalReference extends ArticleLocator {
  kind: 'external';
  raw: string;
  /** 解決できたときは e-Gov の法令名。できなかったときは本文から切った候補（末尾が法・令・規則・条例） */
  law_name: string;
  law_num?: string;
  law_id?: string;
  /** false なら law_name は候補で、law_id は無い */
  resolved: boolean;
}

export interface InternalReference extends ArticleLocator {
  kind: 'internal';
  raw: string;
}

export interface RelativeReference {
  kind: 'relative';
  raw: string;
  resolved: false;
}

export type ExtractedReference = ExternalReference | InternalReference | RelativeReference;

export interface Delegation {
  kind: 'delegation';
  /** "政令で定める" / "財務省令で定める" のような文言（出現回数でまとめる） */
  raw: string;
  count: number;
  /** 政令 → enforcement_order、府令・省令 → enforcement_rule */
  target: 'enforcement_order' | 'enforcement_rule';
}

export interface ExtractResult {
  references: ExtractedReference[];
  delegations: Delegation[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 本文中の「（法令番号）」を列挙する（重複は法令番号で除く） */
export function findLawNumMentions(text: string): LawNumMention[] {
  const re = new RegExp(`([^、。（）「」\\s]{1,60}?)（(${LAW_NUM})）`, 'g');
  const seen = new Set<string>();
  const out: LawNumMention[] = [];
  for (const m of text.matchAll(re)) {
    const lawNum = m[2];
    if (seen.has(lawNum)) continue;
    seen.add(lawNum);
    out.push({ law_num: lawNum, name_candidate: m[1] });
  }
  return out;
}

/** 条・項・号の並びを利用者向け表記にする。どれも取れなければ null */
function parseChain(art?: string, para?: string, item?: string): ArticleLocator | null {
  const out: ArticleLocator = {};
  try {
    if (art) out.article = fromEgovArticleNum(toEgovArticleNum(art));
    if (para) {
      const n = kanjiToNumber(para.replace(/^第/, '').replace(/項$/, ''));
      if (n !== null) out.paragraph = n;
    }
    if (item) out.item = fromEgovArticleNum(toEgovItemNum(item));
  } catch {
    return null;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** 文字範囲の重なりを管理する */
class Spans {
  private readonly spans: Array<[number, number]> = [];
  overlaps(start: number, end: number): boolean {
    return this.spans.some(([s, e]) => start < e && end > s);
  }
  add(start: number, end: number): void {
    this.spans.push([start, end]);
  }
}

interface Found {
  index: number;
  end: number;
  ref: ExtractedReference;
}

/** 直前の参照と 1 語でつながっていれば、条を引き継ぐ。その 1 語 */
const CHAIN_CONNECTORS = /^(?:及び|又は|並びに|若しくは|、|から)$/;

/**
 * 本文から参照と委任を取り出す。
 */
export function extractReferences(text: string, ctx: ExtractContext): ExtractResult {
  const spans = new Spans();
  const found: Found[] = [];

  // ① 法令名（法令番号）+ 条項号
  for (const law of ctx.resolvedByNum) {
    if (!law.law_num) continue;
    const re = new RegExp(
      `${escapeRegExp(law.title)}（${escapeRegExp(law.law_num)}）${ART_CHAIN}`,
      'g'
    );
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (spans.overlaps(start, end)) continue;
      spans.add(start, end);
      const loc = parseChain(m[1], m[2], m[3]) ?? {};
      found.push({
        index: start,
        end,
        ref: {
          kind: 'external',
          raw: m[0],
          law_name: law.title,
          law_num: law.law_num,
          law_id: law.law_id,
          ...loc,
          resolved: true,
        },
      });
    }
  }

  // ② 同法 / 前項 / 次条 / 同条第四項 / 前三項 …（解決しない）
  {
    const re = new RegExp(
      `(?:(?:同|前|次)(?:法|令|規則|条|項|号|款|節|章|編)|前${KAN}+(?:条|項|号))${ART_CHAIN}`,
      'g'
    );
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (spans.overlaps(start, end)) continue;
      spans.add(start, end);
      found.push({ index: start, end, ref: { kind: 'relative', raw: m[0], resolved: false } });
    }
  }

  // ③ 既知の法令名 + 条項号（長い名前から先に照合する）
  const byName: Array<{ law: KnownLaw; name: string }> = [
    ...ctx.resolvedByNum.map((law) => ({ law, name: law.title })),
    ...ctx.knownLaws.map((law) => ({ law, name: law.title })),
  ];
  // 「法第N条」は施行令・施行規則の中の書き方。親の法律が分かっているときだけ external にする
  if (ctx.parentAct) byName.push({ law: ctx.parentAct, name: '法' });
  byName.sort((a, b) => b.name.length - a.name.length);
  for (const { law, name } of byName) {
    // 条項号が続くものだけを参照とみなす（定義の「（以下「法」という。）」のような裸の名前は取らない）
    const re = new RegExp(
      `${escapeRegExp(name)}(第${KAN}+条(?:の${KAN}+)*)(第${KAN}+項)?(第${KAN}+号(?:の${KAN}+)*)?`,
      'g'
    );
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (spans.overlaps(start, end)) continue;
      // 直前が漢字なら、より長い名前の一部（「旧所得税法」「民法」の「法」）なので取らない
      if (start > 0 && /[一-龥]/.test(text[start - 1])) continue;
      const loc = parseChain(m[1], m[2], m[3]);
      if (!loc) continue;
      spans.add(start, end);
      found.push({
        index: start,
        end,
        ref: {
          kind: 'external',
          raw: m[0],
          law_name: law.title,
          law_num: law.law_num,
          law_id: law.law_id,
          ...loc,
          resolved: true,
        },
      });
    }
  }

  // ④ 第N条 第N項 第N号（法令名なし → 同一法令内）
  {
    const re = new RegExp(
      `(第${KAN}+条(?:の${KAN}+)*)?(第${KAN}+項)?(第${KAN}+号(?:の${KAN}+)*)?`,
      'g'
    );
    for (const m of text.matchAll(re)) {
      if (!m[0]) continue;
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (spans.overlaps(start, end)) continue;
      const loc = parseChain(m[1], m[2], m[3]);
      if (!loc) continue;
      // 直前に「…法」「…令」「…規則」「…条例」が付いていれば、知らない法令への参照。候補名を付けて未解決で返す
      const before = /([一-龥]+)$/.exec(text.slice(0, start));
      const candidate = before?.[1];
      if (candidate && /(?:法|令|規則|条例)$/.test(candidate) && loc.article) {
        const nameStart = start - candidate.length;
        spans.add(nameStart, end);
        found.push({
          index: nameStart,
          end,
          ref: {
            kind: 'external',
            raw: `${candidate}${m[0]}`,
            law_name: candidate,
            ...loc,
            resolved: false,
          },
        });
        continue;
      }
      spans.add(start, end);
      found.push({ index: start, end, ref: { kind: 'internal', raw: m[0], ...loc } });
    }
  }

  // ⑤ 政令で定める / 財務省令で定める
  const delegations = new Map<string, Delegation>();
  {
    const re = /(政令|内閣府令|[一-龥]{1,6}省令|省令)で定める/g;
    for (const m of text.matchAll(re)) {
      const raw = m[0];
      const cur = delegations.get(raw);
      if (cur) {
        cur.count += 1;
        continue;
      }
      delegations.set(raw, {
        kind: 'delegation',
        raw,
        count: 1,
        target: m[1] === '政令' ? 'enforcement_order' : 'enforcement_rule',
      });
    }
  }

  found.sort((a, b) => a.index - b.index);
  inheritArticles(text, found);
  return {
    references: found.map((f) => f.ref),
    delegations: [...delegations.values()],
  };
}

/**
 * 条を書かない項・号の参照（「第六項第五号」）が、直前の参照と「及び」「又は」「、」などの 1 語だけでつながっているとき、
 * 直前の参照の条（他法令なら法令も）を引き継ぐ。「第二条第二項第二号及び第六項第五号」の後半は第二条第六項第五号。
 * 引き継がなければ、その項・号は「この条の」と読まれ、`get_law` に渡すと違う条を引いてしまう。
 */
function inheritArticles(text: string, found: Found[]): void {
  for (let i = 1; i < found.length; i++) {
    const cur = found[i].ref;
    if (cur.kind !== 'internal' || cur.article !== undefined) continue;
    const prev = found[i - 1];
    if (prev.ref.kind === 'relative' || prev.ref.article === undefined) continue;
    const gap = text.slice(prev.end, found[i].index);
    if (!CHAIN_CONNECTORS.test(gap)) continue;
    const base: ArticleLocator = { article: prev.ref.article, article_from: prev.ref.raw };
    // 「第六項第四号及び第五号」の後半は、項も引き継ぐ
    if (cur.paragraph === undefined && cur.item !== undefined && prev.ref.paragraph !== undefined) {
      base.paragraph = prev.ref.paragraph;
    }
    if (prev.ref.kind === 'external') {
      found[i].ref = {
        kind: 'external',
        raw: cur.raw,
        law_name: prev.ref.law_name,
        ...(prev.ref.law_num ? { law_num: prev.ref.law_num } : {}),
        ...(prev.ref.law_id ? { law_id: prev.ref.law_id } : {}),
        ...base,
        ...(cur.paragraph !== undefined ? { paragraph: cur.paragraph } : {}),
        ...(cur.item !== undefined ? { item: cur.item } : {}),
        resolved: prev.ref.resolved,
      };
    } else {
      Object.assign(cur, base);
    }
  }
}
