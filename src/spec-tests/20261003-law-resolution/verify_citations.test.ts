/**
 * 差分 20261003-law-resolution の受入テスト — verify_citations（#45・#51・#87）
 *
 * 期待値の正本: specs/changes/20261003-law-resolution/specs/verify_citations/spec.md
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ASOF_400044,
  ASOF_400044_MESSAGE,
  HOKEN,
  hokenLaws,
  type LawsTable,
  lawsSearch,
  NOT_FOUND_404004,
  SHOHI,
  SUPPL_27_NUM,
  SUPPL_100_CAPTION,
  SUPPL_168_NUM,
  shohiTree,
} from '../../test-helpers/law-resolution-fixtures.js';
import {
  type AnyObj,
  type Harness,
  json,
  lawDataResponse,
  type Route,
  SHOTOKU,
  simpleLawTree,
  startHarness,
} from '../../test-helpers/mcp-harness.js';

const TABLE: LawsTable = { laws: hokenLaws() };

const defaultRoute: Route = (url) => {
  if (url.pathname.endsWith('/laws')) return lawsSearch(TABLE, url);
  const id = url.pathname.split('/').pop();
  if (id === SHOHI.law_id) return lawDataResponse(SHOHI, shohiTree());
  if (id === HOKEN.law_id) return lawDataResponse(HOKEN, simpleLawTree(HOKEN.title));
  if (id === SHOTOKU.law_id) return lawDataResponse(SHOTOKU, simpleLawTree(SHOTOKU.title, '9'));
  return null;
};

describe('verify_citations（20261003-law-resolution）', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness(defaultRoute);
  });
  afterEach(async () => {
    await h.close();
  });
  const verify = async (citations: AnyObj[], at?: string) => {
    const r = await h.call('verify_citations', { citations, ...(at ? { at } : {}) });
    return r;
  };

  it('SPEC-EGOV-VERIFY-CITATIONS-045 辞書に無い法令名は検索結果の全件から完全一致を探す（保険法は 114 件の 78 件目）', async () => {
    const r = await verify([{ law_name: '保険法', article: '1' }]);
    expect(r.isError).toBe(false);
    const v = r.body.results[0];
    expect(v.status).toBe('found');
    expect(v.resolved_by).toBe('exact_title');
    expect(v.law.law_id).toBe(HOKEN.law_id);
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-045 完全一致が無ければ件ごとの ambiguous のまま（reason の件数は total_count、候補は先頭 5 件）', async () => {
    const r = await verify([{ law_name: '保険', article: '1' }]);
    expect(r.isError).toBe(false);
    const v = r.body.results[0];
    expect(v.status).toBe('ambiguous');
    expect(v.reason).toBe(
      '「保険」に完全一致する法令名が e-Gov に無く、部分一致が 114 件ありました'
    );
    expect(v.candidates).toHaveLength(5);
    expect(v.candidates[0].title).toBe('健康保険法');
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-045 at を渡したときは法令名の検索にも asof を付ける', async () => {
    await verify([{ law_name: '保険法', article: '1' }], '2024-04-01');
    const laws = h.urls().filter((u) => u.pathname.endsWith('/laws'));
    expect(laws.length).toBeGreaterThan(0);
    expect(laws.every((u) => u.searchParams.get('asof') === '2024-04-01')).toBe(true);
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-046 suppl_index の無い件は本則だけで確かめ、附則にだけある条番号は ARTICLE_NOT_FOUND', async () => {
    const r = await verify([{ law_name: '消費税法', article: '100' }]);
    const v = r.body.results[0];
    expect(v.status).toBe('not_found');
    expect(v.code).toBe('ARTICLE_NOT_FOUND');
    expect(v.reason).toBe(
      `消費税法の本則に第100条はありません。附則に同じ番号の条があります: 附則(27) ${SUPPL_27_NUM}、附則(168) ${SUPPL_168_NUM}`
    );
    expect(v.next_actions.map((a: AnyObj) => [a.action, a.example])).toEqual([
      ['get_law', { law_name: '消費税法', article: '100', suppl_index: 27 }],
      ['get_law', { law_name: '消費税法', article: '100', suppl_index: 168 }],
      ['get_toc', { law_name: '消費税法' }],
    ]);
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-047 suppl_index を書いた件は、その附則の中で条を確かめる', async () => {
    const r = await verify([
      { law_name: '消費税法', article: '100', suppl_index: 27 },
      { law_name: '消費税法', article: '100', suppl_index: 999 },
      { law_name: '消費税法', article: '5', suppl_index: 27 },
      { law_name: '消費税法', article: '100', suppl_index: 27, paragraph: 1, item: 2 },
    ]);
    const [ok, noSuppl, noArticle, deep] = r.body.results;
    expect(ok.status).toBe('found');
    expect(ok.article).toEqual({
      num: '100',
      label: '附則(27) 第100条',
      caption: SUPPL_100_CAPTION,
      suppl_index: 27,
    });
    expect(noSuppl).toMatchObject({
      status: 'not_found',
      code: 'ARTICLE_NOT_FOUND',
      reason: '消費税法に附則(999)はありません（附則は 168 本）',
    });
    expect(noArticle).toMatchObject({
      status: 'not_found',
      code: 'ARTICLE_NOT_FOUND',
      reason: '消費税法の附則(27)に第5条はありません',
    });
    expect(deep).toMatchObject({ status: 'found', paragraph: 1, item: '2' });
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-047 citations[].suppl_index は integer・minimum 1 で、0 はツール全体の INVALID_ARGUMENT', async () => {
    const r = await verify([{ law_name: '消費税法', article: '100', suppl_index: 0 }]);
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.detail.issues).toEqual([
      { path: 'citations.0.suppl_index', message: '1 以上で指定してください' },
    ]);
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-005 found の件の article は suppl_index を持ち、本則の条では null', async () => {
    const r = await verify([{ law_name: '消費税法', article: '30' }]);
    const v = r.body.results[0];
    expect(v.status).toBe('found');
    expect(v.article).toEqual({
      num: '30',
      label: '第30条',
      caption: '（仕入れに係る消費税額の控除）',
      suppl_index: null,
    });
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-015 law_id の件で e-Gov が 404・404004 なら、その件を LAW_NOT_FOUND（at の有無で reason を分ける）', async () => {
    h.setRoute((url) =>
      url.pathname.includes('/law_data/') ? NOT_FOUND_404004() : defaultRoute(url)
    );
    const noAt = await verify([{ law_id: '999AC0000000999', article: '1' }]);
    expect(noAt.isError).toBe(false);
    expect(noAt.body.results[0]).toMatchObject({
      status: 'not_found',
      code: 'LAW_NOT_FOUND',
      reason: 'e-Gov に law_id 999AC0000000999 の法令がありません',
    });
    expect(noAt.body.results[0].next_actions.map((a: AnyObj) => a.action)).toEqual(['search_law']);
    const withAt = await verify([{ law_id: '503AC0000000035', article: '1' }], '2018-01-01');
    expect(withAt.body.results[0]).toMatchObject({
      status: 'not_found',
      code: 'LAW_NOT_FOUND',
      reason: '503AC0000000035 は 2018-01-01 の時点の e-Gov に収録されていません',
    });
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-015 法令名で決めた件が 404・404004 で at を渡したときは、決めた法令名で書き get_law_revisions を先に置く', async () => {
    h.setRoute((url) =>
      url.pathname.includes('/law_data/') ? NOT_FOUND_404004() : defaultRoute(url)
    );
    const r = await verify([{ law_name: '消費税法', article: '1' }], '2018-01-01');
    const v = r.body.results[0];
    expect(v).toMatchObject({
      status: 'not_found',
      code: 'LAW_NOT_FOUND',
      reason: '消費税法 は 2018-01-01 の時点の e-Gov に収録されていません',
    });
    expect(v.next_actions.map((a: AnyObj) => [a.action, a.example])).toEqual([
      ['get_law_revisions', { law_name: '消費税法' }],
      ['search_law', { keyword: '消費税法' }],
    ]);
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-048 法令本文の取得が 400・400044 ならツール全体の INVALID_ARGUMENT（results を持たない）', async () => {
    h.setRoute((url) => (url.pathname.includes('/law_data/') ? ASOF_400044() : defaultRoute(url)));
    const r = await verify([{ law_name: '所得税法', article: '9' }], '2000-01-01');
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.tool).toBe('verify_citations');
    expect(r.body.detail.issues).toEqual([
      { path: 'at', message: 'e-Gov が受け付ける時点の範囲の外です' },
    ]);
    expect(r.body.hint).toContain(ASOF_400044_MESSAGE);
    expect(r.body.results).toBeUndefined();
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-048 法令名の検索が 400・400044 でもツール全体の INVALID_ARGUMENT', async () => {
    h.setRoute((url) => (url.pathname.endsWith('/laws') ? ASOF_400044() : defaultRoute(url)));
    const r = await verify([{ law_name: '保険法', article: '1' }], '2000-01-01');
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.tool).toBe('verify_citations');
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-048 400044 以外の 400 はツール全体の SOURCE_API_ERROR（件を LAW_NOT_FOUND にしない）', async () => {
    h.setRoute((url) =>
      url.pathname.includes('/law_data/')
        ? json({ code: '400004', message: '日付（asof等）が誤っています。' }, 400)
        : defaultRoute(url)
    );
    const r = await verify([{ law_id: '340AC0000000033', article: '9' }]);
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('SOURCE_API_ERROR');
    expect(r.body.retryable).toBe(false);
    expect(r.body.detail.status).toBe(400);
  });
});
