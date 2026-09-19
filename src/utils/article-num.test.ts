import { describe, expect, it } from 'vitest';
import {
  formatArticleLabel,
  formatItemLabel,
  fromEgovArticleNum,
  kanjiToNumber,
  toEgovArticleNum,
  toEgovItemNum,
} from './article-num.js';

describe('toEgovArticleNum', () => {
  it('handles bare arabic numbers', () => {
    expect(toEgovArticleNum('30')).toBe('30');
  });

  it('handles の suffix', () => {
    expect(toEgovArticleNum('30の2')).toBe('30_2');
    expect(toEgovArticleNum('57の4')).toBe('57_4');
  });

  it('strips 第 / 条', () => {
    expect(toEgovArticleNum('第30条')).toBe('30');
    expect(toEgovArticleNum('第30条の2')).toBe('30_2');
  });

  it('accepts kanji numerals (v0.7.0, #17)', () => {
    expect(toEgovArticleNum('三十')).toBe('30');
    expect(toEgovArticleNum('第三十条')).toBe('30');
    expect(toEgovArticleNum('第三十条の二')).toBe('30_2');
    expect(toEgovArticleNum('三十の二')).toBe('30_2');
    expect(toEgovArticleNum('第千五十条')).toBe('1050');
    expect(toEgovArticleNum('第十条')).toBe('10');
  });

  it('folds full-width digits (v0.7.0)', () => {
    expect(toEgovArticleNum('３０')).toBe('30');
    expect(toEgovArticleNum('第３０条の２')).toBe('30_2');
  });

  it('throws on numerals it cannot read', () => {
    expect(() => toEgovArticleNum('第三〇条')).toThrow(/条番号の形式が不正/); // 位ごとに並べる形式
    expect(() => toEgovArticleNum('三0')).toThrow(); // 漢数字と算用数字の混在
    expect(() => toEgovArticleNum('30-2')).toThrow();
    expect(() => toEgovArticleNum('30の')).toThrow(); // 空の区切り
    expect(() => toEgovArticleNum('')).toThrow();
  });

  it('handles whitespace', () => {
    expect(toEgovArticleNum('  30  ')).toBe('30');
  });
});

describe('fromEgovArticleNum', () => {
  it('replaces underscore with の', () => {
    expect(fromEgovArticleNum('30')).toBe('30');
    expect(fromEgovArticleNum('30_2')).toBe('30の2');
    expect(fromEgovArticleNum('57_4')).toBe('57の4');
  });
});

describe('formatArticleLabel', () => {
  it('builds 第N条 for a plain number', () => {
    expect(formatArticleLabel('30')).toBe('第30条');
  });

  it('puts branch numbers after 条', () => {
    expect(formatArticleLabel('70_6')).toBe('第70条の6');
    expect(formatArticleLabel('42_12_4')).toBe('第42条の12の4');
  });

  it('accepts user input with の', () => {
    expect(formatArticleLabel('70の6')).toBe('第70条の6');
  });

  it('returns empty string for empty input', () => {
    expect(formatArticleLabel('')).toBe('');
  });
});

describe('toEgovItemNum (v0.6.0)', () => {
  it('accepts numbers as before', () => {
    expect(toEgovItemNum(8)).toBe('8');
  });

  it('accepts strings with の / 第 / 号', () => {
    expect(toEgovItemNum('8')).toBe('8');
    expect(toEgovItemNum('8の2')).toBe('8_2');
    expect(toEgovItemNum('第8号の2')).toBe('8_2');
    expect(toEgovItemNum(' 12の8 ')).toBe('12_8');
  });

  it('accepts kanji numerals (v0.7.0, #17)', () => {
    expect(toEgovItemNum('八')).toBe('8');
    expect(toEgovItemNum('八の二')).toBe('8_2');
    expect(toEgovItemNum('第八号の二')).toBe('8_2');
    expect(toEgovItemNum('１２の８')).toBe('12_8');
  });

  it('throws on non-integer numbers and malformed strings', () => {
    expect(() => toEgovItemNum('八八')).toThrow();
    expect(() => toEgovItemNum(0)).toThrow();
    expect(() => toEgovItemNum(1.5)).toThrow();
    expect(() => toEgovItemNum('8-2')).toThrow();
    expect(() => toEgovItemNum('')).toThrow();
  });
});

describe('formatItemLabel (v0.6.0)', () => {
  it('builds 第N号 / 第N号のM', () => {
    expect(formatItemLabel('8')).toBe('第8号');
    expect(formatItemLabel('8_2')).toBe('第8号の2');
    expect(formatItemLabel('8の2')).toBe('第8号の2');
  });
});

describe('kanjiToNumber (v0.7.0, #17)', () => {
  it('reads positional kanji numerals up to the thousands', () => {
    expect(kanjiToNumber('一')).toBe(1);
    expect(kanjiToNumber('九')).toBe(9);
    expect(kanjiToNumber('十')).toBe(10);
    expect(kanjiToNumber('三十')).toBe(30);
    expect(kanjiToNumber('二十二')).toBe(22);
    expect(kanjiToNumber('百二十三')).toBe(123);
    expect(kanjiToNumber('千五十')).toBe(1050);
    expect(kanjiToNumber('一千')).toBe(1000);
  });

  it('returns null for sequences that are not positional numerals', () => {
    expect(kanjiToNumber('三三')).toBeNull(); // 数字が続く
    expect(kanjiToNumber('十十')).toBeNull(); // 位が下がらない
    expect(kanjiToNumber('五百百')).toBeNull();
    expect(kanjiToNumber('三〇')).toBeNull(); // 〇 は扱わない
    expect(kanjiToNumber('30')).toBeNull();
    expect(kanjiToNumber('')).toBeNull();
  });
});
