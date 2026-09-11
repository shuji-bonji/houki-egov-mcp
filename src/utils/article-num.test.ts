import { describe, expect, it } from 'vitest';
import { formatArticleLabel, fromEgovArticleNum, toEgovArticleNum } from './article-num.js';

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
