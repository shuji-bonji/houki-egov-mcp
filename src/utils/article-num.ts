/**
 * 条番号・号番号の表記揺れ吸収
 *
 * - 利用者入力例: "30", "30の2", "第30条", "第30条の2", "第三十条", "第三十条の二", "３０"
 * - e-Gov API 形式: "30", "30_2"
 *
 * 漢数字は位取り形式（"三十" "百二十三" "千五十"）を受け付ける（v0.7.0、Issue #17）。
 * 「一〇五〇」のような位ごとに並べる形式は受け付けない。
 * 全角数字（"３０"）は半角に直す。
 */

const KANJI_DIGITS: Readonly<Record<string, number>> = {
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

const KANJI_UNITS: Readonly<Record<string, number>> = { 十: 10, 百: 100, 千: 1000 };

const KANJI_NUMERAL = /^[一二三四五六七八九十百千]+$/;

/**
 * 位取り形式の漢数字を数値にする。
 *
 * "三十" → 30、"十" → 10、"百二十三" → 123、"千五十" → 1050、"一千" → 1000
 *
 * 位取りとして読めない並び（"三三"、"十十"、"五百百"）と、漢数字以外を含む文字列は null。
 * 条番号・号番号の範囲（千の位まで）だけを扱い、万以上は対象にしない。
 */
export function kanjiToNumber(input: string): number | null {
  if (!KANJI_NUMERAL.test(input)) return null;
  let total = 0;
  let current = 0;
  let lastUnit = Number.POSITIVE_INFINITY;
  for (const ch of input) {
    const digit = KANJI_DIGITS[ch];
    if (digit !== undefined) {
      if (current !== 0) return null; // "三三" のように数字が続く
      current = digit;
      continue;
    }
    const unit = KANJI_UNITS[ch];
    if (unit >= lastUnit) return null; // "十十" や "五百百" のように位が下がらない
    total += (current === 0 ? 1 : current) * unit;
    current = 0;
    lastUnit = unit;
  }
  return total + current;
}

/** 全角数字を半角にする（"３０" → "30"）。ほかの文字は変えない */
function foldFullWidthDigits(s: string): string {
  return s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
}

/**
 * 条番号・号番号の 1 区切り（"の" で分けた 1 つ）を算用数字の文字列にする。
 *
 * "30" → "30"、"３０" → "30"、"三十" → "30"。読めなければ null。
 */
function normalizeNumberSegment(segment: string): string | null {
  const s = foldFullWidthDigits(segment.trim());
  if (/^\d+$/.test(s)) return s;
  const n = kanjiToNumber(s);
  return n === null ? null : String(n);
}

/**
 * "30の2" / "三十の二" のような区切り付きの番号を、区切りごとに算用数字にして "_" で結ぶ。
 * 1 区切りでも読めなければ null。
 */
function normalizeSegmentedNumber(s: string): string | null {
  const parts = s.split('の');
  const out: string[] = [];
  for (const part of parts) {
    const n = normalizeNumberSegment(part);
    if (n === null) return null;
    out.push(n);
  }
  return out.join('_');
}

/**
 * 利用者入力の条番号を e-Gov API 形式に正規化する。
 *
 * "30"          → "30"
 * "30の2"        → "30_2"
 * "第30条"      → "30"
 * "第30条の2"   → "30_2"
 * "第三十条"    → "30"          （v0.7.0 から）
 * "第三十条の二" → "30_2"        （v0.7.0 から）
 * "３０"        → "30"          （v0.7.0 から）
 * "第三〇条"    → throw（位ごとに並べる形式は受け付けない）
 */
export function toEgovArticleNum(input: string): string {
  let s = input.trim();
  // 「第」前置・「条」（位置を問わず）を取り除く
  s = s.replace(/^第/, '').replace(/条/g, '');
  const normalized = normalizeSegmentedNumber(s);
  if (normalized === null) {
    throw new Error(
      `条番号の形式が不正です（例: "30", "30の2", "第三十条", "第三十条の二"）: ${input}`
    );
  }
  return normalized;
}

/**
 * e-Gov API 形式の条番号を表示用にフォーマット。
 *
 * "30"   → "30"
 * "30_2" → "30の2"
 */
export function fromEgovArticleNum(num: string): string {
  return num.replace(/_/g, 'の');
}

/**
 * 条番号から「第N条」「第N条のM」の表示を作る。
 *
 * "30"      → "第30条"
 * "70_6"    → "第70条の6"
 * "42_12_4" → "第42条の12の4"
 *
 * 利用者入力の "70の6" を渡しても同じ結果になる。
 * `fromEgovArticleNum()` の戻り値を `第${…}条` に埋め込むと「第70の6条」になるため、
 * 見出し・目次・エラーメッセージの条表示はこの関数で組み立てる。
 */
export function formatArticleLabel(num: string): string {
  const s = num.trim();
  if (!s) return '';
  const [head, ...branches] = s.replace(/の/g, '_').split('_');
  return `第${head}条${branches.map((b) => `の${b}`).join('')}`;
}

/**
 * 利用者入力の号番号を e-Gov API 形式（`Item` の `Num` 属性）に正規化する。
 *
 * 8           → "8"
 * "8"         → "8"
 * "8の2"      → "8_2"
 * "第8号の2"  → "8_2"
 * "八"        → "8"     （v0.7.0 から）
 * "八の二"    → "8_2"   （v0.7.0 から）
 * "第八号の二" → "8_2"  （v0.7.0 から）
 *
 * v0.5.4 までは号番号を数値でしか受け付けず、`Num="8_2"` の号（第8号の2）を指定できなかった。
 */
export function toEgovItemNum(input: number | string): string {
  if (typeof input === 'number') {
    if (!Number.isInteger(input) || input < 1) {
      throw new Error(`号番号は 1 以上の整数で指定してください: ${input}`);
    }
    return String(input);
  }
  let s = input.trim();
  s = s.replace(/^第/, '').replace(/号/g, '');
  const normalized = normalizeSegmentedNumber(s);
  if (normalized === null) {
    throw new Error(`号番号の形式が不正です（例: 8, "8の2", "第8号の2", "八の二"）: ${input}`);
  }
  return normalized;
}

/**
 * 号番号から「第N号」「第N号のM」の表示を作る。
 *
 * "8"   → "第8号"
 * "8_2" → "第8号の2"
 */
export function formatItemLabel(num: string): string {
  const s = num.trim();
  if (!s) return '';
  const [head, ...branches] = s.replace(/の/g, '_').split('_');
  return `第${head}号${branches.map((b) => `の${b}`).join('')}`;
}
