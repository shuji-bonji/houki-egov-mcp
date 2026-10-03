/**
 * 差分 20261003-law-resolution の受入テスト — common_errors（027・029・023 の MODIFIED、032・033 の ADDED）
 *
 * 期待値の正本: specs/changes/20261003-law-resolution/specs/common_errors/spec.md
 * ツールごとの細部は同じフォルダーの各ツールのテストで確かめ、ここでは共通の規則を確かめる。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ASOF_400044,
  ASOF_400044_MESSAGE,
  GYOSEI_IT,
  HOKEN,
  hokenLaws,
  type LawsTable,
  lawsSearch,
  NOT_FOUND_404001,
  NOT_FOUND_404004,
  SHOTOKU_KISOKU,
  SHOTOKU_REI,
} from '../../test-helpers/law-resolution-fixtures.js';
import {
  type AnyObj,
  type Harness,
  json,
  lawDataResponse,
  startHarness,
} from '../../test-helpers/mcp-harness.js';
import { tools } from '../../tools/definitions.js';

const TABLE: LawsTable = { laws: [SHOTOKU_REI, SHOTOKU_KISOKU, ...hokenLaws(), GYOSEI_IT] };

const schemaOf = (name: string): AnyObj =>
  tools.find((t) => t.name === name)?.inputSchema as unknown as AnyObj;

describe('common_errors（20261003-law-resolution）', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness(
      (url) => {
        if (url.pathname.endsWith('/laws')) return lawsSearch(TABLE, url);
        if (url.pathname.includes('/law_data/')) {
          const id = url.pathname.split('/').pop() as string;
          const f = TABLE.laws.find((l) => l.law_id === id);
          return f ? lawDataResponse(f) : null;
        }
        return null;
      },
      { fastRetry: true }
    );
  });
  afterEach(async () => {
    await h.close();
  });

  it('SPEC-EGOV-COMMON-ERRORS-027 法令名の検索が 400 で終わったときは SOURCE_API_ERROR・retryable: false（LAW_NOT_FOUND ではない）', async () => {
    h.setRoute((url) =>
      url.pathname.endsWith('/laws') ? json({ code: '400001', message: 'bad' }, 400) : null
    );
    const r = await h.call('get_law', { law_name: 'ほげほげ法', article: '1' });
    expect(r.body.code).toBe('SOURCE_API_ERROR');
    expect(r.body.retryable).toBe(false);
    expect(r.body.detail.status).toBe(400);
  });

  it('SPEC-EGOV-COMMON-ERRORS-027 法令名の検索が 503 で終わったときは SOURCE_API_ERROR・retryable: true、0 件なら LAW_NOT_FOUND', async () => {
    h.setRoute((url) =>
      url.pathname.endsWith('/laws') ? new Response('', { status: 503 }) : null
    );
    const r = await h.call('get_law', { law_name: 'ほげほげ法', article: '1' });
    expect(r.body.code).toBe('SOURCE_API_ERROR');
    expect(r.body.retryable).toBe(true);
    h.setRoute((url) => (url.pathname.endsWith('/laws') ? lawsSearch({ laws: [] }, url) : null));
    const r0 = await h.call('get_law', { law_name: 'ほげほげ法', article: '1' });
    expect(r0.body.code).toBe('LAW_NOT_FOUND');
  });

  it('SPEC-EGOV-COMMON-ERRORS-029 at を付けた法令名の検索が 400・400044 なら、通信の失敗ではなく INVALID_ARGUMENT（path: at）', async () => {
    h.setRoute((url) => (url.pathname.endsWith('/laws') ? ASOF_400044() : null));
    const r = await h.call('get_toc', { law_name: 'ほげほげ法', at: '2000-01-01' });
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.tool).toBe('get_toc');
    expect(r.body.detail.issues).toEqual([
      { path: 'at', message: 'e-Gov が受け付ける時点の範囲の外です' },
    ]);
    expect(r.body.hint).toContain(ASOF_400044_MESSAGE);
  });

  it('SPEC-EGOV-COMMON-ERRORS-029 部分一致だけのときも LAW_NOT_FOUND（0 件のときと同じ code）', async () => {
    const r = await h.call('get_law_revisions', { law_name: '所得税法施行' });
    expect(r.body.code).toBe('LAW_NOT_FOUND');
  });

  it('SPEC-EGOV-COMMON-ERRORS-032 完全一致が無ければ検索結果の先頭の法令を使わず、候補（先頭 5 件）と search_law を next_actions に入れる', async () => {
    const r = await h.call('get_toc', { law_name: '保険' });
    expect(r.body.code).toBe('LAW_NOT_FOUND');
    expect(r.body.retryable).toBe(false);
    expect(r.body.error).toBe('完全一致する法令名がありません: 保険（部分一致 114 件）');
    expect(r.body.hint).toMatch(
      /^部分一致した法令（先頭 5 件）: 健康保険法（大正十一年法律第七十号）、/
    );
    expect(r.body.next_actions).toHaveLength(6);
    expect(r.body.next_actions.slice(0, 5).map((a: AnyObj) => a.action)).toEqual(
      Array(5).fill('get_toc')
    );
    expect(r.body.next_actions[0].example).toEqual({ law_name: '健康保険法' });
    expect(r.body.next_actions[5]).toMatchObject({
      action: 'search_law',
      example: { keyword: '保険' },
    });
    expect(h.urls().filter((u) => u.pathname.includes('/law_data/'))).toHaveLength(0);
  });

  it('SPEC-EGOV-COMMON-ERRORS-032 全件の中に完全一致があればその法令に決める（保険法は 114 件の 78 件目）', async () => {
    const r = await h.call('get_toc', { law_name: '保険法', depth: 1 });
    expect(r.isError).toBe(false);
    expect(r.body.meta.law_id).toBe(HOKEN.law_id);
  });

  it('SPEC-EGOV-COMMON-ERRORS-033 改正履歴の取得が 404・404001 なら LAW_NOT_FOUND（detail.cause に e-Gov の code）', async () => {
    h.setRoute((url) => (url.pathname.includes('/law_revisions/') ? NOT_FOUND_404001() : null));
    const r = await h.call('get_law_revisions', { law_name: '消法' });
    expect(r.body.code).toBe('LAW_NOT_FOUND');
    expect(r.body.detail.cause).toBe('404001');
  });

  it('SPEC-EGOV-COMMON-ERRORS-033 法令本文の取得が 404・404004 なら LAW_NOT_FOUND、400・400044 なら INVALID_ARGUMENT', async () => {
    h.setRoute((url) => (url.pathname.includes('/law_data/') ? NOT_FOUND_404004() : null));
    const nf = await h.call('get_law', { law_name: '民法', article: '1' });
    expect(nf.body.code).toBe('LAW_NOT_FOUND');
    expect(nf.body.detail).toMatchObject({ status: 404, cause: '404004' });
    h.setRoute((url) => (url.pathname.includes('/law_data/') ? ASOF_400044() : null));
    const ia = await h.call('get_law', { law_name: '所得税法', article: '9', at: '2000-01-01' });
    expect(ia.body.code).toBe('INVALID_ARGUMENT');
    expect(ia.body.detail).toMatchObject({ status: 400, cause: '400044' });
  });

  it('SPEC-EGOV-COMMON-ERRORS-023 get_law と verify_citations の suppl_index は integer・minimum 1・maximum なし', async () => {
    const getLaw = schemaOf('get_law').properties.suppl_index;
    expect(getLaw.type).toBe('integer');
    expect(getLaw.minimum).toBe(1);
    expect(getLaw.maximum).toBeUndefined();
    const verify = schemaOf('verify_citations').properties.citations.items.properties.suppl_index;
    expect(verify.type).toBe('integer');
    expect(verify.minimum).toBe(1);
    expect(verify.maximum).toBeUndefined();
    const r = await h.call('get_law', { law_name: '消費税法', article: '100', suppl_index: 0 });
    expect(r.body.detail.issues).toEqual([
      { path: 'suppl_index', message: '1 以上で指定してください' },
    ]);
    expect(h.urls()).toHaveLength(0);
  });
});
