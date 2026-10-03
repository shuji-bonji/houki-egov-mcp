/**
 * 差分 20261003-search-explain-attachment の受入テスト — search_law（#55）
 *
 * 期待値の正本: specs/changes/20261003-search-explain-attachment/specs/search_law/spec.md
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AnyObj,
  type Harness,
  json,
  type LawFixture,
  lawListItem,
  startHarness,
} from '../../test-helpers/mcp-harness.js';
import { tools } from '../../tools/definitions.js';

/** 題名に「保険」を含む法令が 278 件ある e-Gov（2026-10-03 10:20 JST の /laws?law_title=保険 の total_count） */
function hokenLaws(): LawFixture[] {
  return Array.from({ length: 278 }, (_, i) => ({
    law_id: `499AC${String(i + 1).padStart(10, '0')}`,
    title: `架空${i + 1}保険法`,
    law_num: `令和九十九年法律第${i + 1}号`,
  }));
}
const SHOHI: LawFixture = {
  law_id: '363AC0000000108',
  title: '消費税法',
  law_num: '昭和六十三年法律第百八号',
};

function lawsRoute(url: URL): Response | null {
  if (!url.pathname.endsWith('/laws')) return null;
  const title = url.searchParams.get('law_title') ?? '';
  const limit = Number(url.searchParams.get('limit') ?? '10');
  const all = [...hokenLaws(), SHOHI].filter((l) => l.title.includes(title));
  const page = all.slice(0, limit);
  return json({ total_count: all.length, count: page.length, laws: page.map(lawListItem) });
}

describe('search_law（20261003-search-explain-attachment）', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness(lawsRoute);
  });
  afterEach(async () => {
    await h.close();
  });

  it('SPEC-EGOV-SEARCH-LAW-006 total_count は e-Gov で一致した総数で、results は limit 以下。1 件以上なら hint: null・next_actions: []', async () => {
    const r = await h.call('search_law', { keyword: '保険', limit: 2 });
    expect(r.isError).toBe(false);
    expect(r.body.total_count).toBe(278);
    expect(r.body.results).toHaveLength(2);
    expect(r.body).toHaveProperty('hint');
    expect(r.body.hint).toBeNull();
    expect(r.body.next_actions).toEqual([]);
  });

  it('SPEC-EGOV-SEARCH-LAW-006 消法の results の要素と、hint: null・next_actions: []', async () => {
    const r = await h.call('search_law', { keyword: '消法' });
    expect(r.body.total_count).toBe(1);
    expect(r.body.results[0]).toMatchObject({
      law_id: '363AC0000000108',
      title: '消費税法',
      law_num: '昭和六十三年法律第百八号',
      law_type: 'Act',
      url: 'https://laws.e-gov.go.jp/law/363AC0000000108',
    });
    expect(r.body.hint).toBeNull();
    expect(r.body.next_actions).toEqual([]);
  });

  it('SPEC-EGOV-SEARCH-LAW-016 inputSchema に domain は無く、渡すと e-Gov を引かずに INVALID_ARGUMENT', async () => {
    const schema = tools.find((t) => t.name === 'search_law')?.inputSchema as unknown as AnyObj;
    expect(schema.properties).not.toHaveProperty('domain');
    const r = await h.call('search_law', { keyword: '労働基準', domain: 'tax', law_type: 'Act' });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.tool).toBe('search_law');
    expect(r.body.detail.issues).toEqual([
      { path: 'domain', message: 'inputSchema に無い引数です' },
    ]);
    expect(h.urls()).toHaveLength(0);
    const ok = await h.call('search_law', { keyword: '労働基準', law_type: 'Act' });
    expect(ok.isError).toBe(false);
  });

  it('SPEC-EGOV-SEARCH-LAW-017 一致が 0 件なら、題名だけを探したことと search_fulltext・resolve_abbreviation を返す', async () => {
    const r = await h.call('search_law', { keyword: '存在しない' });
    expect(r.isError).toBe(false);
    expect(r.body.total_count).toBe(0);
    expect(r.body.results).toEqual([]);
    expect(r.body.hint).toBe(
      '「存在しない」を題名に含む法令は e-Gov にありません。search_law は法令の題名だけを探します。条文の本文にある語なら search_fulltext、略称なら resolve_abbreviation を試してください'
    );
    expect(r.body.next_actions).toEqual([
      {
        action: 'search_fulltext',
        reason: '条文の本文から語を探せます（ローカル DB がある場合）',
        example: { keyword: '存在しない' },
      },
      {
        action: 'resolve_abbreviation',
        reason: '略称・通称かどうかを確かめられます',
        example: { abbr: '存在しない' },
      },
    ]);
  });

  it('SPEC-EGOV-SEARCH-LAW-017 law_type を渡して 0 件なら、先に law_type を外した search_law を案内する（limit は渡したときだけ）', async () => {
    const r = await h.call('search_law', { keyword: '存在しない', law_type: 'Act' });
    expect(r.body.next_actions.map((a: AnyObj) => a.action)).toEqual([
      'search_law',
      'search_fulltext',
      'resolve_abbreviation',
    ]);
    expect(r.body.next_actions[0]).toEqual({
      action: 'search_law',
      reason: '法令種別を外して探せます',
      example: { keyword: '存在しない' },
    });
    const withLimit = await h.call('search_law', {
      keyword: '  存在しない ',
      law_type: 'Act',
      limit: 3,
    });
    expect(withLimit.body.next_actions[0].example).toEqual({ keyword: '  存在しない ', limit: 3 });
    expect(withLimit.body.next_actions[1].example).toEqual({ keyword: '存在しない' });
    expect(withLimit.body.next_actions[2].example).toEqual({ abbr: '存在しない' });
  });

  it('SPEC-EGOV-SEARCH-LAW-017 hint の名前は e-Gov に渡した law_title（略称なら正式名称）', async () => {
    h.setRoute((url) =>
      url.pathname.endsWith('/laws') ? json({ total_count: 0, count: 0, laws: [] }) : null
    );
    const r = await h.call('search_law', { keyword: '消法' });
    expect(r.body.hint).toMatch(/^「消費税法」を題名に含む法令は e-Gov にありません。/);
  });
});
