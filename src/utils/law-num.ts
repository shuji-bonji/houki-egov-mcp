/**
 * 法令番号の表記の違いを吸収して、同じ改正法かどうかを照合できる形にする。
 *
 * 同じ改正法でも、どこから取った値かで書き方が違う。
 *
 * | 取得元 | 例 |
 * |---|---|
 * | 附則の属性 `SupplProvision@AmendLawNum` | `令和七年六月二〇日法律第七四号` |
 * | 改正履歴 `law_revisions` の `amendment_law_num` | `令和七年法律第七十四号` |
 *
 * 違いは 2 つで、附則の側には公布の月日が入ることと、数を位ごとに並べる書き方
 * （「七四」）と正式な書き方（「七十四」）で分かれることです。この 2 つを落として
 * 「元号 + 年 + 種別 + 号数」だけを取り出し、文字列として比べられるようにします。
 */

/** 漢数字 1 文字 → 値 */
const KANJI_DIGITS: Record<string, number> = {
  〇: 0,
  零: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** 漢数字・全角数字・半角数字に現れる文字（正規表現の文字クラス用） */
const NUM_CHARS = '0-9０-９〇零一二三四五六七八九十百千';

/** 「七十四」「百八」のような位取りのある書き方を解く */
function parseWithUnits(s: string): number | null {
  let total = 0;
  let current = 0;
  for (const ch of s) {
    const d = KANJI_DIGITS[ch];
    if (d !== undefined) {
      current = current * 10 + d;
      continue;
    }
    if (ch === '十') {
      total += (current || 1) * 10;
      current = 0;
      continue;
    }
    if (ch === '百') {
      total += (current || 1) * 100;
      current = 0;
      continue;
    }
    if (ch === '千') {
      total += (current || 1) * 1000;
      current = 0;
      continue;
    }
    return null;
  }
  return total + current;
}

/**
 * 法令番号の中の数を値にする。
 *
 * - 半角・全角の数字（`74`・`７４`）
 * - 位ごとに並べる書き方（`七四` = 74、`二〇` = 20）
 * - 十・百・千を使う書き方（`七十四` = 74、`百八` = 108）
 * - 元年（`元` = 1）
 *
 * 解けない文字が混ざっていれば null を返す。
 */
export function parseLawNumNumeral(input: string): number | null {
  const s = input.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim();
  if (s === '') return null;
  if (s === '元') return 1;
  if (/^\d+$/.test(s)) return Number(s);
  if (/[十百千]/.test(s)) return parseWithUnits(s);
  let n = 0;
  for (const ch of s) {
    const d = KANJI_DIGITS[ch];
    if (d === undefined) return null;
    n = n * 10 + d;
  }
  return n;
}

const DATE_PATTERN = new RegExp(`([${NUM_CHARS}]+)月([${NUM_CHARS}]+)日`);
const LAW_NUM_PATTERN = new RegExp(
  `^(明治|大正|昭和|平成|令和)(元|[${NUM_CHARS}]+)年(.+?)第([${NUM_CHARS}]+)号$`
);

/**
 * 法令番号の照合キーを作る。`元号 + 年 + 種別 + 号数` の形で、公布の月日と
 * 数の書き方の違いを落とす。
 *
 * ```ts
 * lawNumMatchKey('令和七年六月二〇日法律第七四号'); // → '令和7|法律|74'
 * lawNumMatchKey('令和七年法律第七十四号');         // → '令和7|法律|74'
 * ```
 *
 * 元号 + 年で始まらない番号（「太政官布告」など）や解けない数が入っている番号は
 * null を返す。照合できないことを呼び出し側で数えるため、例外は投げない。
 */
export function lawNumMatchKey(lawNum: string | null | undefined): string | null {
  if (!lawNum) return null;
  const compact = lawNum.replace(/[\s　]/g, '');
  const withoutDate = compact.replace(DATE_PATTERN, '');
  const m = withoutDate.match(LAW_NUM_PATTERN);
  if (!m) return null;
  const [, era, yearRaw, kind, numRaw] = m;
  const year = parseLawNumNumeral(yearRaw);
  const num = parseLawNumNumeral(numRaw);
  if (year === null || num === null) return null;
  return `${era}${year}|${kind}|${num}`;
}
