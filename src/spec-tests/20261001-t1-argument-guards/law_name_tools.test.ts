/**
 * 差分 20261001-t1-argument-guards の受入テスト — 法令名を受け取るツールの空の引数と at の形
 *
 * 期待値の正本: specs/changes/20261001-t1-argument-guards/specs/<tool>/spec.md
 * MCP クライアントから tools/call を呼ぶ。e-Gov への通信は fetch を差し替え、呼ばれた回数を数える。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  expectAtGuard,
  expectEmptyAndBlank,
  type Harness,
  lawDataResponse,
  MINPO,
  startHarness,
} from '../../test-helpers/mcp-harness.js';

describe('法令名・at の検査 (20261001-t1-argument-guards)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  // ---------- get_law ----------

  it('SPEC-EGOV-GET-LAW-003 law_name が空文字・空白だけなら e-Gov に問い合わせずに INVALID_ARGUMENT（LAW_NOT_FOUND ではない）', async () => {
    await expectEmptyAndBlank(h, 'get_law', (v) => ({ law_name: v }), 'law_name');
    const r = await h.call('get_law', { law_name: ' \n' });
    expect(r.body.code).not.toBe('LAW_NOT_FOUND');
  });

  it('SPEC-EGOV-GET-LAW-037 at は YYYY-MM-DD の形だけ。形の違反と暦に無い日付は INVALID_ARGUMENT', async () => {
    await expectAtGuard(h, 'get_law', { law_name: '民法', article: '1' });
  });

  it('SPEC-EGOV-GET-LAW-037 at: "2024-04-01" は検査を通り、その時点の本文を取る', async () => {
    h.setRoute((url) => (url.pathname.includes('/law_data/') ? lawDataResponse(MINPO) : null));
    const r = await h.call('get_law', { law_name: '民法', article: '1', at: '2024-04-01' });
    expect(r.isError).toBe(false);
    expect(h.urls()[0].searchParams.get('asof')).toBe('2024-04-01');
  });

  // ---------- get_toc ----------

  it('SPEC-EGOV-GET-TOC-024 at は YYYY-MM-DD の形だけ。形の違反と暦に無い日付は INVALID_ARGUMENT', async () => {
    await expectAtGuard(h, 'get_toc', { law_name: '民法' });
  });

  it('SPEC-EGOV-GET-TOC-025 law_name が空文字・空白だけなら e-Gov に問い合わせずに INVALID_ARGUMENT', async () => {
    await expectEmptyAndBlank(h, 'get_toc', (v) => ({ law_name: v }), 'law_name');
  });

  // ---------- get_law_range ----------

  it('SPEC-EGOV-GET-LAW-RANGE-029 law_name が空文字・空白だけなら略称辞書と e-Gov に問い合わせずに INVALID_ARGUMENT', async () => {
    await expectEmptyAndBlank(h, 'get_law_range', (v) => ({ law_name: v, chapter: 1 }), 'law_name');
  });

  it('SPEC-EGOV-GET-LAW-RANGE-031 at は YYYY-MM-DD の形だけ。形の違反と暦に無い日付は INVALID_ARGUMENT', async () => {
    await expectAtGuard(h, 'get_law_range', { law_name: '民法', path: 'Part3/Chapter2' });
  });

  // ---------- get_law_revisions ----------

  it('SPEC-EGOV-GET-LAW-REVISIONS-013 law_name が空文字・空白だけなら略称辞書と e-Gov に問い合わせずに INVALID_ARGUMENT', async () => {
    await expectEmptyAndBlank(h, 'get_law_revisions', (v) => ({ law_name: v }), 'law_name');
  });

  // ---------- get_related_laws ----------

  it('SPEC-EGOV-GET-RELATED-LAWS-016 law_name が空文字・空白だけなら略称辞書と e-Gov に問い合わせずに INVALID_ARGUMENT', async () => {
    await expectEmptyAndBlank(h, 'get_related_laws', (v) => ({ law_name: v }), 'law_name');
  });

  // ---------- get_article_references ----------

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-039 law_name・article が空文字・空白だけなら e-Gov に問い合わせずに INVALID_ARGUMENT', async () => {
    await expectEmptyAndBlank(
      h,
      'get_article_references',
      (v) => ({ law_name: v, article: '57の2' }),
      'law_name'
    );
    await expectEmptyAndBlank(
      h,
      'get_article_references',
      (v) => ({ law_name: '所得税法', article: v }),
      'article'
    );
    const r = await h.call('get_article_references', { law_name: '所得税法', article: '  ' });
    expect(r.body.code).not.toBe('INVALID_ARTICLE_NUM');
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-041 at は YYYY-MM-DD の形だけ。形の違反と暦に無い日付は INVALID_ARGUMENT', async () => {
    await expectAtGuard(h, 'get_article_references', { law_name: '所得税法', article: '57の2' });
  });

  // ---------- list_attachments ----------

  it('SPEC-EGOV-LIST-ATTACHMENTS-020 law_name が空文字・空白だけなら略称辞書と e-Gov に問い合わせずに INVALID_ARGUMENT', async () => {
    await expectEmptyAndBlank(h, 'list_attachments', (v) => ({ law_name: v }), 'law_name');
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-021 at は YYYY-MM-DD の形だけ。形の違反と暦に無い日付は INVALID_ARGUMENT', async () => {
    await expectAtGuard(h, 'list_attachments', { law_name: '戸籍法施行規則' });
  });

  // ---------- get_attachment ----------

  it('SPEC-EGOV-GET-ATTACHMENT-023 law_name が空文字・空白だけなら略称辞書と e-Gov に問い合わせずに INVALID_ARGUMENT', async () => {
    await expectEmptyAndBlank(h, 'get_attachment', (v) => ({ law_name: v }), 'law_name');
  });

  it('SPEC-EGOV-GET-ATTACHMENT-024 at は YYYY-MM-DD の形だけ。形の違反と暦に無い日付は INVALID_ARGUMENT', async () => {
    await expectAtGuard(h, 'get_attachment', {
      law_name: '戸籍法施行規則',
      src: 'H11HO127-001.jpg',
    });
  });

  // ---------- get_law_file ----------

  it('SPEC-EGOV-GET-LAW-FILE-018 law_name が空文字・空白だけなら略称辞書と e-Gov に問い合わせずに INVALID_ARGUMENT', async () => {
    await expectEmptyAndBlank(
      h,
      'get_law_file',
      (v) => ({ law_name: v, file_type: 'xml' }),
      'law_name'
    );
  });

  it('SPEC-EGOV-GET-LAW-FILE-019 at は YYYY-MM-DD の形だけ。形に合わない at を URL に入れて返さない', async () => {
    await expectAtGuard(h, 'get_law_file', { law_name: '民法', file_type: 'xml' });
    const r = await h.call('get_law_file', { law_name: '民法', file_type: 'xml', at: '20240401' });
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body).not.toHaveProperty('url');
  });

  // ---------- verify_citations ----------

  it('SPEC-EGOV-VERIFY-CITATIONS-040 at は YYYY-MM-DD の形だけ。形の違反と暦に無い日付はツール全体の INVALID_ARGUMENT', async () => {
    await expectAtGuard(h, 'verify_citations', {
      citations: [{ law_name: '民法', article: '709' }],
    });
    const r = await h.call('verify_citations', {
      citations: [{ law_name: '民法', article: '709' }],
      at: '2026-02-30',
    });
    expect(r.body).not.toHaveProperty('results');
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-042 citations[].article が空文字・空白だけならツール全体の INVALID_ARGUMENT', async () => {
    await expectEmptyAndBlank(
      h,
      'verify_citations',
      (v) => ({
        citations: [
          { law_name: '民法', article: '709' },
          { law_name: '民法', article: v },
        ],
      }),
      'citations.1.article',
      'citations[1].article'
    );
    const r = await h.call('verify_citations', { citations: [{ law_name: '民法', article: '' }] });
    expect(r.body.detail.issues).toEqual([
      { path: 'citations.0.article', message: '空文字は指定できません' },
    ]);
    expect(r.body).not.toHaveProperty('results');
  });

  // ---------- resolve_abbreviation / explain_law_type ----------

  it('SPEC-EGOV-RESOLVE-ABBREVIATION-010 abbr が空文字・空白だけなら略称辞書を引かずに INVALID_ARGUMENT（resolved: null ではない）', async () => {
    await expectEmptyAndBlank(h, 'resolve_abbreviation', (v) => ({ abbr: v }), 'abbr');
    const r = await h.call('resolve_abbreviation', { abbr: '' });
    expect(r.body).not.toHaveProperty('resolved');
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-019 name が空文字・空白だけなら種別の表と照合せずに INVALID_ARGUMENT（found: false ではない）', async () => {
    await expectEmptyAndBlank(h, 'explain_law_type', (v) => ({ name: v }), 'name');
    const r = await h.call('explain_law_type', { name: ' \n' });
    expect(r.body).not.toHaveProperty('found');
  });
});
