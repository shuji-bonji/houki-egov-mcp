/**
 * 条番号の表記揺れ吸収
 *
 * - 利用者入力例: "30", "30の2", "第30条", "第30条の2"
 * - e-Gov API 形式: "30", "30_2"
 *
 * 注意: 漢数字（"三十"等）の変換は v0.1.0 では未サポート。
 *       数字＋"の"の組み合わせのみ対応する。
 */

/**
 * 利用者入力の条番号を e-Gov API 形式に正規化する。
 *
 * "30"        → "30"
 * "30の2"      → "30_2"
 * "第30条"    → "30"
 * "第30条の2" → "30_2"
 * "第三十条"  → throw (kanji not supported in v0.1.0)
 */
export function toEgovArticleNum(input: string): string {
  let s = input.trim();
  // 「第」前置・「条」（位置を問わず）を取り除く
  s = s.replace(/^第/, '').replace(/条/g, '');
  // 漢数字が残っていたらエラー（v0.1.0 では未対応）
  if (/[一二三四五六七八九十百千]/.test(s)) {
    throw new Error(
      `漢数字の条番号には未対応です（v0.1.0）。アラビア数字でご指定ください: ${input}`
    );
  }
  // "の" を "_" に置換
  s = s.replace(/の/g, '_');
  return s;
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
