/**
 * 受入テスト: resolve_abbreviation（差分 20260928-untested-behaviors の ADDED）
 *
 * 期待値の正本は specs/changes/20260928-untested-behaviors/specs/resolve_abbreviation/spec.md。
 * 略称辞書だけを引くツールなので、e-Gov への問い合わせは起きない（念のため fetch を差し替えて 0 回を確かめる）。
 */

import { resolveAbbreviation } from '@shuji-bonji/houki-abbreviations';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toolHandlers } from '../../tools/handlers.js';

interface ResolveResult {
  abbr: string;
  resolved: Record<string, unknown> | null;
}

const fetchMock = vi.fn(async () => {
  throw new Error('fetch はこのツールでは呼ばれない');
});

async function resolve(abbr: string): Promise<ResolveResult> {
  return (await toolHandlers.resolve_abbreviation({ abbr })) as ResolveResult;
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('resolve_abbreviation — 正式名称・別名からの解決', () => {
  describe('SPEC-EGOV-RESOLVE-ABBREVIATION-005 正式名称からエントリを返す', () => {
    it.each([
      ['消費税法', '消法'],
      ['所得税法', '所法'],
      ['労働基準法', '労基法'],
    ])(
      'SPEC-EGOV-RESOLVE-ABBREVIATION-005 正式名称 %s からエントリを返す（resolved.abbr: %s）',
      async (formal, dictAbbr) => {
        const r = await resolve(formal);
        expect(r.abbr).toBe(formal);
        expect(r.resolved).not.toBeNull();
        expect(r.resolved?.abbr).toBe(dictAbbr);
        expect(r.resolved?.formal).toBe(formal);
        expect(r.resolved?.abbr).not.toBe(r.abbr);
      }
    );
  });

  describe('SPEC-EGOV-RESOLVE-ABBREVIATION-006 別名からもエントリを返す', () => {
    it.each(['消費税', 'インボイス'])(
      'SPEC-EGOV-RESOLVE-ABBREVIATION-006 別名 %s からもエントリを返す',
      async (alias) => {
        const r = await resolve(alias);
        expect(r.resolved).not.toBeNull();
        expect(r.resolved?.abbr).toBe('消法');
        expect(r.resolved?.formal).toBe('消費税法');
      }
    );
  });
});

describe('resolve_abbreviation — 前後の空白', () => {
  describe('SPEC-EGOV-RESOLVE-ABBREVIATION-007 前後の空白を除いてから照合する', () => {
    it.each([' 消法 ', '　消法　', '\t消法\n'])(
      'SPEC-EGOV-RESOLVE-ABBREVIATION-007 前後の空白 %j を除いてから照合する',
      async (abbr) => {
        const r = await resolve(abbr);
        expect(r.resolved?.abbr).toBe('消法');
        expect(r.resolved?.formal).toBe('消費税法');
      }
    );
  });

  it('SPEC-EGOV-RESOLVE-ABBREVIATION-008 辞書にあるとき応答の abbr は渡した値のまま', async () => {
    const r = await resolve(' 消法 ');
    expect(r.abbr).toBe(' 消法 ');
    expect(r.resolved?.abbr).toBe('消法');
  });

  it('SPEC-EGOV-RESOLVE-ABBREVIATION-008 辞書に無いときも応答の abbr は渡した値のまま', async () => {
    const r = await resolve(' 存在しない法律 ');
    expect(r.abbr).toBe(' 存在しない法律 ');
    expect(r.resolved).toBeNull();
  });
});

describe('resolve_abbreviation — 辞書のエントリをそのまま返す', () => {
  it('SPEC-EGOV-RESOLVE-ABBREVIATION-009 resolved は resolveAbbreviation の戻り値と深く等しい', async () => {
    const r = await resolve('消法');
    expect(r.resolved).toEqual(resolveAbbreviation('消法'));
  });

  it('SPEC-EGOV-RESOLVE-ABBREVIATION-009 辞書のエントリが持つフィールドが付く（消法）', async () => {
    const r = await resolve('消法');
    const e = r.resolved as Record<string, unknown>;
    expect(e.abbr).toBe('消法');
    expect(e.formal).toBe('消費税法');
    expect(e.law_id).toBe('363AC0000000108');
    expect(e.law_num).toBe('昭和六十三年法律第百八号');
    expect(e.law_type).toBe('Act');
    expect(e.domain).toBe('tax');
    expect(e.category).toBe('law');
    expect(e.source_mcp_hint).toBe('houki-egov');
    const aliases = e.aliases as string[];
    expect(Array.isArray(aliases)).toBe(true);
    expect(aliases[0]).toBe('消費税');
    expect(aliases).toContain('インボイス');
    expect(aliases).toHaveLength(10);
    expect(e.note).toBeTruthy();
  });
});
