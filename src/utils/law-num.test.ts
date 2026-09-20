import { describe, expect, it } from 'vitest';
import { lawNumMatchKey, parseLawNumNumeral } from './law-num.js';

describe('parseLawNumNumeral', () => {
  it('半角・全角の数字を読む', () => {
    expect(parseLawNumNumeral('74')).toBe(74);
    expect(parseLawNumNumeral('７４')).toBe(74);
  });

  it('位ごとに並べる書き方を読む', () => {
    expect(parseLawNumNumeral('七四')).toBe(74);
    expect(parseLawNumNumeral('二〇')).toBe(20);
    expect(parseLawNumNumeral('一一')).toBe(11);
    expect(parseLawNumNumeral('一〇九')).toBe(109);
  });

  it('十・百・千を使う書き方を読む', () => {
    expect(parseLawNumNumeral('七十四')).toBe(74);
    expect(parseLawNumNumeral('十')).toBe(10);
    expect(parseLawNumNumeral('百八')).toBe(108);
    expect(parseLawNumNumeral('二百二十')).toBe(220);
    expect(parseLawNumNumeral('千二百')).toBe(1200);
  });

  it('元年は 1', () => {
    expect(parseLawNumNumeral('元')).toBe(1);
  });

  it('読めない文字は null', () => {
    expect(parseLawNumNumeral('')).toBeNull();
    expect(parseLawNumNumeral('甲')).toBeNull();
  });
});

describe('lawNumMatchKey', () => {
  it('公布の月日と漢数字の書き方の違いを落として同じキーにする', () => {
    // 附則の AmendLawNum と改正履歴の amendment_law_num
    expect(lawNumMatchKey('令和七年六月二〇日法律第七四号')).toBe('令和7|法律|74');
    expect(lawNumMatchKey('令和七年法律第七十四号')).toBe('令和7|法律|74');
    expect(lawNumMatchKey('平成一〇年三月三一日法律第二四号')).toBe('平成10|法律|24');
    expect(lawNumMatchKey('平成十年法律第二十四号')).toBe('平成10|法律|24');
  });

  it('元年の法令番号を揃える', () => {
    expect(lawNumMatchKey('令和元年五月三一日法律第一六号')).toBe('令和1|法律|16');
    expect(lawNumMatchKey('令和元年法律第十六号')).toBe('令和1|法律|16');
  });

  it('法律以外の種別も種別ごとに分ける', () => {
    expect(lawNumMatchKey('昭和四十年政令第九十六号')).toBe('昭和40|政令|96');
    expect(lawNumMatchKey('昭和四十年大蔵省令第十一号')).toBe('昭和40|大蔵省令|11');
    // 種別が違えば別のキー
    expect(lawNumMatchKey('昭和四十年政令第九十六号')).not.toBe(
      lawNumMatchKey('昭和四十年法律第九十六号')
    );
  });

  it('全角空白を含む番号も揃う', () => {
    expect(lawNumMatchKey('昭和六十三年法律第百八号')).toBe('昭和63|法律|108');
    expect(lawNumMatchKey('昭和六十三年　法律第百八号')).toBe('昭和63|法律|108');
  });

  it('元号で始まらない番号・空の値は null', () => {
    expect(lawNumMatchKey(null)).toBeNull();
    expect(lawNumMatchKey(undefined)).toBeNull();
    expect(lawNumMatchKey('')).toBeNull();
    expect(lawNumMatchKey('太政官布告第百三号')).toBeNull();
  });
});
