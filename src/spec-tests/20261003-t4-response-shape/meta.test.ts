/**
 * 差分 20261003-t4-response-shape の受入テスト — meta の at と、値の無い meta のフィールド
 *
 * 期待値の正本: specs/changes/20261003-t4-response-shape/specs/<tool>/spec.md
 * MCP クライアントから呼び、e-Gov への通信は fetch の差し替えで返す。
 * meta を持つ 10 ツールで、at を省いたときも meta に at のキーがあり、値が null であることを確かめる。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AnyObj,
  type Harness,
  json,
  type LawFixture,
  lawDataResponse,
  lawsResponse,
  MINPO,
  SHOHI,
  SHOTOKU,
  simpleLawTree,
  startHarness,
} from '../../test-helpers/mcp-harness.js';

/** 略称辞書に無い法令。法令名の検索（/laws）で引く */
const TEST_LAW: LawFixture = {
  law_id: '999AC0000000001',
  title: 'テスト法',
  law_num: '令和七年法律第一号',
};
const FIXTURES = [MINPO, SHOTOKU, SHOHI, TEST_LAW];

function route(url: URL): Response | null {
  if (url.pathname.endsWith('/laws')) {
    const title = url.searchParams.get('law_title');
    return lawsResponse(title === TEST_LAW.title ? [TEST_LAW] : []);
  }
  const data = /\/law_data\/([^/]+)$/.exec(url.pathname);
  if (data) {
    const f = FIXTURES.find((x) => x.law_id === data[1]);
    return f ? lawDataResponse(f, simpleLawTree(f.title), ['./pict/a.jpg']) : null;
  }
  const revs = /\/law_revisions\/([^/]+)$/.exec(url.pathname);
  if (revs) {
    return json({
      law_info: { law_id: revs[1], law_type: 'Act', law_num: 'x', promulgation_date: '2000-01-01' },
      revisions: [],
    });
  }
  return null;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const AT = '2020-04-01';

describe('meta の at（20261003-t4-response-shape）', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await startHarness(route);
  });
  afterEach(async () => {
    await h.close();
  });

  async function ok(tool: string, args: Record<string, unknown>): Promise<AnyObj> {
    const r = await h.call(tool, args);
    if (r.isError) throw new Error(`${tool}: ${r.text}`);
    return r.body;
  }

  /** at を省くと meta.at は null（キーはある）、渡すとその値 */
  async function expectAt(tool: string, args: Record<string, unknown>): Promise<void> {
    const without = await ok(tool, args);
    expect(Object.hasOwn(without.meta, 'at'), `${tool} の meta に at のキーが無い`).toBe(true);
    expect(without.meta.at).toBeNull();
    const withAt = await ok(tool, { ...args, at: AT });
    expect(withAt.meta.at).toBe(AT);
  }

  it('SPEC-EGOV-GET-LAW-020 条文（markdown・json）の meta.at は、at を省くと null、渡すとその値', async () => {
    await expectAt('get_law', { law_name: '消費税法', article: '1' });
    await expectAt('get_law', { law_name: '消費税法', article: '1', format: 'json' });
  });

  it('SPEC-EGOV-GET-LAW-020 目次の meta にも at を置く（format: "toc"、article の省略）', async () => {
    await expectAt('get_law', { law_name: '消費税法', format: 'toc' });
    await expectAt('get_law', { law_name: '消費税法' });
  });

  it('SPEC-EGOV-GET-LAW-020 meta のキーは format と at の有無で変わらない', async () => {
    const keys = ['at', 'law_id', 'law_num', 'retrieved_at', 'title', 'url'];
    for (const args of [
      { law_name: '消費税法', article: '1' },
      { law_name: '消費税法', article: '1', format: 'json' },
      { law_name: '消費税法', article: '1', at: AT },
      { law_name: '消費税法' },
      { law_name: '消費税法', format: 'toc', at: AT },
    ]) {
      const r = await ok('get_law', args);
      expect(Object.keys(r.meta).sort(), JSON.stringify(args)).toEqual(keys);
    }
  });

  it('SPEC-EGOV-GET-LAW-020 目次で at を渡しても、渡さなくても markdown の時点の行は今までどおり', async () => {
    const without = await ok('get_law', { law_name: '消費税法' });
    expect(without.markdown).not.toContain('時点:');
    const withAt = await ok('get_law', { law_name: '消費税法', at: AT });
    expect(withAt.markdown).toContain(`時点: ${AT}`);
  });

  it('SPEC-EGOV-GET-TOC-015 at を省いた meta は法令の情報と at: null', async () => {
    const r = await ok('get_toc', { law_name: 'テスト法' });
    expect(r.meta).toEqual({
      law_id: '999AC0000000001',
      title: 'テスト法',
      law_num: '令和七年法律第一号',
      retrieved_at: expect.stringMatching(ISO_UTC),
      url: 'https://laws.e-gov.go.jp/law/999AC0000000001',
      at: null,
    });
    await expectAt('get_toc', { law_name: 'テスト法' });
  });

  it('SPEC-EGOV-GET-LAW-RANGE-025 chapter: 1 を at なしで取った meta は法令の情報と at: null', async () => {
    const r = await ok('get_law_range', { law_name: 'テスト法', chapter: 1 });
    expect(r.meta).toEqual({
      law_id: '999AC0000000001',
      title: 'テスト法',
      law_num: '令和七年法律第一号',
      retrieved_at: expect.stringMatching(ISO_UTC),
      url: 'https://laws.e-gov.go.jp/law/999AC0000000001',
      at: null,
    });
    await expectAt('get_law_range', { law_name: 'テスト法', chapter: 1 });
  });

  it('SPEC-EGOV-GET-LAW-REVISIONS-002 at を受け取らないので meta.at は常に null', async () => {
    const r = await ok('get_law_revisions', { law_name: '消法' });
    expect(Object.hasOwn(r.meta, 'at')).toBe(true);
    expect(r.meta.at).toBeNull();
  });

  it('SPEC-EGOV-GET-RELATED-LAWS-010 meta は retrieved_at と at: null（related が空の応答も同じ形）', async () => {
    const r = await ok('get_related_laws', { law_name: '所得税法' });
    expect(r.meta).toEqual({ retrieved_at: expect.stringMatching(ISO_UTC), at: null });
    expect(new Date(r.meta.retrieved_at).toISOString()).toBe(r.meta.retrieved_at);
    expect(r.related).toEqual([]);
    const minpo = await ok('get_related_laws', { law_name: '民法' });
    expect(minpo.meta).toEqual({ retrieved_at: expect.stringMatching(ISO_UTC), at: null });
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-034 meta.at は at を省くと null、渡すとその値', async () => {
    const r = await ok('get_article_references', { law_name: '所法', article: '1', paragraph: 1 });
    expect(r.meta).toEqual({
      law_id: '340AC0000000033',
      title: '所得税法',
      law_num: '昭和四十年法律第三十三号',
      url: 'https://laws.e-gov.go.jp/law/340AC0000000033',
      retrieved_at: expect.stringMatching(ISO_UTC),
      at: null,
      article: '1',
      paragraph: 1,
    });
    await expectAt('get_article_references', { law_name: '所得税法', article: '1' });
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-022 paragraph を指定しないと meta.paragraph は null、指定するとその項番号', async () => {
    const without = await ok('get_article_references', { law_name: '所得税法', article: '1' });
    expect(Object.hasOwn(without.meta, 'paragraph')).toBe(true);
    expect(without.meta.paragraph).toBeNull();
    const withParagraph = await ok('get_article_references', {
      law_name: '所得税法',
      article: '1',
      paragraph: 1,
    });
    expect(withParagraph.meta.paragraph).toBe(1);
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-015 meta.at は at を渡さないと null、渡すとその値', async () => {
    await expectAt('list_attachments', { law_name: '民法' });
  });

  it('SPEC-EGOV-GET-ATTACHMENT-014 meta.at は at を渡さないと null、渡すとその値', async () => {
    await expectAt('get_attachment', { law_name: '民法' });
    await expectAt('get_attachment', { law_name: '民法', src: './pict/a.jpg' });
  });

  it('SPEC-EGOV-GET-LAW-FILE-001 save なしの meta.at は at を渡さないと null、渡すとその値', async () => {
    const r = await ok('get_law_file', { law_name: '民法', file_type: 'docx' });
    expect(Object.keys(r.meta).sort()).toEqual([
      'at',
      'law_id',
      'law_num',
      'retrieved_at',
      'title',
      'url',
    ]);
    expect(r.meta.at).toBeNull();
    const html = await ok('get_law_file', { law_name: '民法', file_type: 'html', at: AT });
    expect(html.meta.at).toBe(AT);
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-021 meta は at を省くと { retrieved_at, at: null }、渡すとその値', async () => {
    const citations = [{ law_name: '所得税法', article: '1' }];
    const without = await ok('verify_citations', { citations });
    expect(without.meta).toEqual({ retrieved_at: expect.stringMatching(ISO_UTC), at: null });
    const withAt = await ok('verify_citations', { citations, at: '2024-04-01' });
    expect(withAt.meta).toEqual({
      retrieved_at: expect.stringMatching(ISO_UTC),
      at: '2024-04-01',
    });
  });
});
