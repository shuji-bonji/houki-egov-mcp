/**
 * 差分 20261003-law-resolution の受入テスト — get_toc・get_law_range・get_law_revisions・
 * list_attachments・get_attachment・get_law_file（#45・#87）
 *
 * 期待値の正本: specs/changes/20261003-law-resolution/specs/<tool>/spec.md と common_errors の 032・033
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ASOF_400044,
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
  type Route,
  startHarness,
} from '../../test-helpers/mcp-harness.js';

const TABLE: LawsTable = { laws: [SHOTOKU_REI, SHOTOKU_KISOKU, ...hokenLaws()] };

const defaultRoute: Route = (url) => {
  if (url.pathname.endsWith('/laws')) return lawsSearch(TABLE, url);
  return null;
};

/** 032 の候補の形（所得税法施行 → 所得税法施行令・所得税法施行規則 → search_law） */
function expectCandidates(body: AnyObj, tool: string, rest: Record<string, unknown>): void {
  expect(body.code).toBe('LAW_NOT_FOUND');
  expect(body.retryable).toBe(false);
  expect(body.error).toBe('完全一致する法令名がありません: 所得税法施行（部分一致 2 件）');
  expect(body.next_actions).toHaveLength(3);
  expect(body.next_actions[0]).toMatchObject({
    action: tool,
    example: { law_name: '所得税法施行令', ...rest },
  });
  expect(body.next_actions[0].example).toEqual({ law_name: '所得税法施行令', ...rest });
  expect(body.next_actions[1].example).toEqual({ law_name: '所得税法施行規則', ...rest });
  expect(body.next_actions[2]).toMatchObject({
    action: 'search_law',
    example: { keyword: '所得税法施行' },
  });
}

describe('法令名を受け取るツール（20261003-law-resolution）', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness(defaultRoute);
  });
  afterEach(async () => {
    await h.close();
  });
  const fetched = (part: string) => h.urls().filter((u) => u.pathname.includes(part));

  // ---------- get_toc ----------

  it('SPEC-EGOV-GET-TOC-028 完全一致しない法令名は目次を返さず候補付きの LAW_NOT_FOUND、保険法は全件から決める', async () => {
    const r = await h.call('get_toc', { law_name: '所得税法施行', depth: 1, suppl: 'none' });
    expectCandidates(r.body, 'get_toc', { depth: 1, suppl: 'none' });
    expect(fetched('/law_data/')).toHaveLength(0);
    h.setRoute((url) =>
      url.pathname.includes('/law_data/') ? lawDataResponse(HOKEN) : defaultRoute(url)
    );
    const ok = await h.call('get_toc', { law_name: '保険法', depth: 1 });
    expect(ok.isError).toBe(false);
    expect(ok.body.meta.law_id).toBe('420AC0000000056');
  });

  it('SPEC-EGOV-GET-TOC-029 法令本文の取得が 400・400044 なら INVALID_ARGUMENT（tool: get_toc）、404・404004 なら LAW_NOT_FOUND', async () => {
    h.setRoute((url) => (url.pathname.includes('/law_data/') ? ASOF_400044() : null));
    const ia = await h.call('get_toc', { law_name: '消費税法', at: '2000-01-01' });
    expect(ia.body.code).toBe('INVALID_ARGUMENT');
    expect(ia.body.tool).toBe('get_toc');
    expect(ia.body.detail.issues).toEqual([
      { path: 'at', message: 'e-Gov が受け付ける時点の範囲の外です' },
    ]);
    h.setRoute((url) => (url.pathname.includes('/law_data/') ? NOT_FOUND_404004() : null));
    const nf = await h.call('get_toc', { law_name: '消費税法' });
    expect(nf.body.code).toBe('LAW_NOT_FOUND');
    expect(nf.body.retryable).toBe(false);
  });

  // ---------- get_law_range ----------

  it('SPEC-EGOV-GET-LAW-RANGE-034 完全一致しない法令名は範囲を返さず、get_law_range の候補を付けた LAW_NOT_FOUND', async () => {
    const r = await h.call('get_law_range', { law_name: '所得税法施行', chapter: 1 });
    expectCandidates(r.body, 'get_law_range', { chapter: 1 });
    expect(fetched('/law_data/')).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-LAW-RANGE-035 法令本文の取得が 400・400044 なら INVALID_ARGUMENT、404・404004 なら LAW_NOT_FOUND、403 は SOURCE_API_ERROR', async () => {
    h.setRoute((url) => (url.pathname.includes('/law_data/') ? ASOF_400044() : null));
    const ia = await h.call('get_law_range', {
      law_name: '消費税法',
      chapter: 1,
      at: '2000-01-01',
    });
    expect(ia.body.code).toBe('INVALID_ARGUMENT');
    expect(ia.body.tool).toBe('get_law_range');
    expect(ia.body.detail.issues).toEqual([
      { path: 'at', message: 'e-Gov が受け付ける時点の範囲の外です' },
    ]);
    h.setRoute((url) => (url.pathname.includes('/law_data/') ? NOT_FOUND_404004() : null));
    const nf = await h.call('get_law_range', { law_name: '消費税法', chapter: 1 });
    expect(nf.body.code).toBe('LAW_NOT_FOUND');
    h.setRoute((url) =>
      url.pathname.includes('/law_data/') ? json({ code: 'x', message: 'x' }, 403) : null
    );
    const se = await h.call('get_law_range', { law_name: '消費税法', chapter: 1 });
    expect(se.body.code).toBe('SOURCE_API_ERROR');
    expect(se.body.retryable).toBe(false);
    expect(se.body.detail.status).toBe(403);
  });

  // ---------- get_law_revisions ----------

  it('SPEC-EGOV-GET-LAW-REVISIONS-018 完全一致しない法令名は改正履歴を返さず候補付きの LAW_NOT_FOUND（asof は付けない）', async () => {
    const r = await h.call('get_law_revisions', { law_name: '所得税法施行', latest: 2 });
    expectCandidates(r.body, 'get_law_revisions', { latest: 2 });
    expect(fetched('/law_revisions/')).toHaveLength(0);
    expect(fetched('/laws').every((u) => u.searchParams.get('asof') === null)).toBe(true);
  });

  it('SPEC-EGOV-GET-LAW-REVISIONS-008 改正履歴の取得が 404・404001 なら、1 回だけ呼んで LAW_NOT_FOUND', async () => {
    h.setRoute((url) => (url.pathname.includes('/law_revisions/') ? NOT_FOUND_404001() : null));
    const r = await h.call('get_law_revisions', { law_name: '消法' });
    expect(r.body.code).toBe('LAW_NOT_FOUND');
    expect(r.body.retryable).toBe(false);
    expect(r.body.error).toBe('e-Gov に law_id 363AC0000000108 の法令がありません');
    expect(r.body.hint).toBe(
      '略称辞書の law_id が古い（廃止・統合された）か、law_id の書き間違いの可能性があります'
    );
    expect(r.body.next_actions).toEqual([
      expect.objectContaining({ action: 'search_law', example: { keyword: '消法' } }),
    ]);
    expect(r.body.detail).toMatchObject({ status: 404, cause: '404001' });
    expect(r.body.detail.url).toContain('/law_revisions/363AC0000000108');
    expect(fetched('/law_revisions/')).toHaveLength(1);
  });

  it('SPEC-EGOV-GET-LAW-REVISIONS-008 400 は今までどおり SOURCE_API_ERROR・retryable: false・next_actions なし', async () => {
    h.setRoute((url) =>
      url.pathname.includes('/law_revisions/') ? json({ code: '400001', message: 'x' }, 400) : null
    );
    const r = await h.call('get_law_revisions', { law_name: '消法' });
    expect(r.body.code).toBe('SOURCE_API_ERROR');
    expect(r.body.retryable).toBe(false);
    expect(r.body.detail.status).toBe(400);
    expect(r.body.next_actions).toBeUndefined();
  });

  // ---------- list_attachments ----------

  it('SPEC-EGOV-LIST-ATTACHMENTS-024 完全一致しない法令名は一覧を返さず、list_attachments の候補を付けた LAW_NOT_FOUND', async () => {
    const r = await h.call('list_attachments', { law_name: '所得税法施行' });
    expectCandidates(r.body, 'list_attachments', {});
    expect(fetched('/law_data/')).toHaveLength(0);
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-018 法令本文の取得の 404・404004 は LAW_NOT_FOUND、400・400044 は INVALID_ARGUMENT、JSON でない 404 は SOURCE_API_ERROR', async () => {
    h.setRoute((url) => (url.pathname.includes('/law_data/') ? NOT_FOUND_404004() : null));
    const nf = await h.call('list_attachments', { law_name: '民法' });
    expect(nf.body.code).toBe('LAW_NOT_FOUND');
    expect(nf.body.retryable).toBe(false);
    expect(nf.body.detail).toEqual({
      status: 404,
      url: 'https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089',
      cause: '404004',
    });
    h.setRoute((url) => (url.pathname.includes('/law_data/') ? ASOF_400044() : null));
    const ia = await h.call('list_attachments', { law_name: '民法', at: '2000-01-01' });
    expect(ia.body.code).toBe('INVALID_ARGUMENT');
    expect(ia.body.tool).toBe('list_attachments');
    expect(ia.body.detail.issues).toEqual([
      { path: 'at', message: 'e-Gov が受け付ける時点の範囲の外です' },
    ]);
    expect(ia.body.detail.url).toContain('?asof=2000-01-01');
    h.setRoute((url) =>
      url.pathname.includes('/law_data/') ? new Response('Not Found', { status: 404 }) : null
    );
    const se = await h.call('list_attachments', { law_name: '民法' });
    expect(se.body.code).toBe('SOURCE_API_ERROR');
    expect(se.body.retryable).toBe(false);
    expect(se.body.detail.status).toBe(404);
  });

  // ---------- get_attachment ----------

  it('SPEC-EGOV-GET-ATTACHMENT-030 完全一致しない法令名は、save の値によらず法令本文も添付も取らずに候補付きの LAW_NOT_FOUND', async () => {
    for (const save of [false, true]) {
      const r = await h.call('get_attachment', {
        law_name: '所得税法施行',
        src: './pict/a.jpg',
        save,
      });
      expectCandidates(r.body, 'get_attachment', { src: './pict/a.jpg', save });
    }
    expect(fetched('/law_data/')).toHaveLength(0);
    expect(fetched('/attachment')).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-031 法令本文の取得が 400・400044 なら INVALID_ARGUMENT（tool: get_attachment）、404・404004 なら LAW_NOT_FOUND', async () => {
    h.setRoute((url) => (url.pathname.includes('/law_data/') ? ASOF_400044() : null));
    const ia = await h.call('get_attachment', {
      law_name: '民法',
      src: './pict/a.jpg',
      at: '2000-01-01',
    });
    expect(ia.body.code).toBe('INVALID_ARGUMENT');
    expect(ia.body.tool).toBe('get_attachment');
    expect(ia.body.detail.issues[0].path).toBe('at');
    h.setRoute((url) => (url.pathname.includes('/law_data/') ? NOT_FOUND_404004() : null));
    const nf = await h.call('get_attachment', { law_name: '民法', src: './pict/a.jpg' });
    expect(nf.body.code).toBe('LAW_NOT_FOUND');
  });

  // ---------- get_law_file ----------

  it('SPEC-EGOV-GET-LAW-FILE-023 完全一致しない法令名は、save の値によらず URL を返さずファイルも取らずに候補付きの LAW_NOT_FOUND', async () => {
    const r = await h.call('get_law_file', { law_name: '所得税法施行', file_type: 'xml' });
    expectCandidates(r.body, 'get_law_file', { file_type: 'xml' });
    const s = await h.call('get_law_file', {
      law_name: '所得税法施行',
      file_type: 'xml',
      save: true,
    });
    expectCandidates(s.body, 'get_law_file', { file_type: 'xml', save: true });
    expect(fetched('/law_file/')).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-LAW-FILE-014 ファイルの取得の 400・400044 は INVALID_ARGUMENT、404・404004 は LAW_NOT_FOUND（url に asof）、400042 は SOURCE_API_ERROR', async () => {
    h.setRoute((url) => (url.pathname.includes('/law_file/') ? ASOF_400044() : null));
    const ia = await h.call('get_law_file', {
      law_name: '民法',
      file_type: 'xml',
      at: '2000-01-01',
      save: true,
    });
    expect(ia.body.code).toBe('INVALID_ARGUMENT');
    expect(ia.body.tool).toBe('get_law_file');
    expect(ia.body.detail.issues).toEqual([
      { path: 'at', message: 'e-Gov が受け付ける時点の範囲の外です' },
    ]);
    h.setRoute((url) => (url.pathname.includes('/law_file/') ? NOT_FOUND_404004() : null));
    const nf = await h.call('get_law_file', {
      law_name: '民法',
      file_type: 'xml',
      at: '2018-01-01',
      save: true,
    });
    expect(nf.body.code).toBe('LAW_NOT_FOUND');
    expect(nf.body.retryable).toBe(false);
    expect(nf.body.detail).toMatchObject({ status: 404, cause: '404004' });
    expect(nf.body.detail.url).toContain('?asof=2018-01-01');
    h.setRoute((url) =>
      url.pathname.includes('/law_file/') ? json({ code: '400042', message: 'x' }, 400) : null
    );
    const se = await h.call('get_law_file', { law_name: '民法', file_type: 'xml', save: true });
    expect(se.body.code).toBe('SOURCE_API_ERROR');
    expect(se.body.retryable).toBe(false);
    expect(se.body.detail.status).toBe(400);
  });
});
