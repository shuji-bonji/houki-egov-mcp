import { describe, expect, it } from 'vitest';
import {
  formatArticleLabel,
  formatItemLabel,
  fromEgovArticleNum,
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

  it('throws on kanji input (v0.1.0 limitation)', () => {
    expect(() => toEgovArticleNum('三十')).toThrow();
    expect(() => toEgovArticleNum('第三十条')).toThrow();
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

  it('throws on kanji, non-integer numbers and malformed strings', () => {
    expect(() => toEgovItemNum('八の二')).toThrow();
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
