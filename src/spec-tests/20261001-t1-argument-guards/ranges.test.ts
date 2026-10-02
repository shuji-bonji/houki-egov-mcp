/**
 * 差分 20261001-t1-argument-guards の受入テスト — 数値の範囲・search_law・search_fulltext・get_attachment の src
 *
 * 期待値の正本: specs/changes/20261001-t1-argument-guards/specs/<tool>/spec.md
 * MCP クライアントから tools/call を呼ぶ。e-Gov への通信は fetch を差し替え、呼ばれた URL を数える。
 */

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initSchema } from '../../db/schema.js';
import { seedTestDb } from '../../test-helpers/law-db-fixture.js';
import {
  type AnyObj,
  expectEmptyAndBlank,
  type Harness,
  json,
  lawDataResponse,
  lawsResponse,
  MINPO,
  SHOHI,
  SHOTOKU,
  simpleLawTree,
  startHarness,
} from '../../test-helpers/mcp-harness.js';
import { handleSearchFulltext } from '../../tools/handlers.js';

const TMP = join(tmpdir(), `houki-egov-spec-t1-${process.pid}`);
const DB_EMPTY = join(TMP, 'empty.db');
const DB_STD = join(TMP, 'std.db');

beforeAll(async () => {
  mkdirSync(TMP, { recursive: true });
  const db = new Database(DB_EMPTY);
  initSchema(db);
  db.close();
  const std = new Database(DB_STD);
  initSchema(std);
  await seedTestDb(std);
  std.close();
});
afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

/** 改正履歴 n 件の /law_revisions の応答 */
function revisionsResponse(lawId: string, n: number): Response {
  return json({
    law_info: { law_id: lawId, law_type: 'Act', law_num: SHOHI.law_num },
    revisions: Array.from({ length: n }, (_, i) => ({
      law_revision_id: `${lawId}_2024040${i + 1}_000000000000000`,
      law_type: 'Act',
      law_title: SHOHI.title,
      amendment_promulgate_date: `2024-01-0${i + 1}`,
    })),
  });
}

describe('数値の範囲・空の keyword・src (20261001-t1-argument-guards)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  const issues = async (name: string, args: Record<string, unknown>) => {
    const r = await h.call(name, args);
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.tool).toBe(name);
    return r.body.detail.issues as Array<{ path: string; message: string }>;
  };

  // ---------- search_law ----------

  it('SPEC-EGOV-SEARCH-LAW-001 空の keyword は inputSchema の検査の形の INVALID_ARGUMENT で、e-Gov を検索しない', async () => {
    const r = await h.call('search_law', { keyword: '' });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.tool).toBe('search_law');
    expect(r.body.error).toBe(
      '引数が tools/list の inputSchema に合いません: keyword: 空文字は指定できません'
    );
    expect(r.body.detail.issues).toEqual([{ path: 'keyword', message: '空文字は指定できません' }]);
    expect(h.urls()).toHaveLength(0);
  });

  it('SPEC-EGOV-SEARCH-LAW-007 空白だけの keyword は tool・detail.issues を持つ INVALID_ARGUMENT で、e-Gov を検索しない', async () => {
    await expectEmptyAndBlank(h, 'search_law', (v) => ({ keyword: v }), 'keyword');
    for (const keyword of ['   ', '\t\n']) {
      const r = await h.call('search_law', { keyword });
      expect(r.body.error).toBe('keyword が空です');
      expect(r.body.detail.issues[0].path).toBe('keyword');
      expect(r.body.hint).toContain('"消費税"');
    }
    expect(h.urls()).toHaveLength(0);
  });

  it('SPEC-EGOV-SEARCH-LAW-013 limit は 1 以上 50 以下の整数で、範囲の外は e-Gov に問い合わせずに INVALID_ARGUMENT', async () => {
    expect(await issues('search_law', { keyword: '消費税', limit: 100 })).toEqual([
      { path: 'limit', message: '50 以下で指定してください' },
    ]);
    expect(await issues('search_law', { keyword: '消費税', limit: 51 })).toEqual([
      { path: 'limit', message: '50 以下で指定してください' },
    ]);
    expect(await issues('search_law', { keyword: '消費税', limit: 0 })).toEqual([
      { path: 'limit', message: '1 以上で指定してください' },
    ]);
    expect(await issues('search_law', { keyword: '消費税', limit: -1 })).toEqual([
      { path: 'limit', message: '1 以上で指定してください' },
    ]);
    expect(await issues('search_law', { keyword: '消費税', limit: 2.5 })).toEqual([
      { path: 'limit', message: '整数で指定してください' },
    ]);
    expect(await issues('search_law', { keyword: '消費税', limit: '10' })).toEqual([
      { path: 'limit', message: '整数で指定してください' },
    ]);
    expect(h.urls()).toHaveLength(0);
  });

  it('SPEC-EGOV-SEARCH-LAW-013 limit: 50 と limit: 1 はその件数を e-Gov の /laws に渡す', async () => {
    h.setRoute((url) => (url.pathname.endsWith('/laws') ? lawsResponse([]) : null));
    for (const limit of [50, 1]) {
      const r = await h.call('search_law', { keyword: `消費税${limit}`, limit });
      expect(r.isError).toBe(false);
    }
    expect(h.urls().map((u) => u.searchParams.get('limit'))).toEqual(['50', '1']);
  });

  // ---------- get_law ----------

  it('SPEC-EGOV-GET-LAW-036 paragraph は 1 以上の整数で、0・負の数・小数は法令を取らずに INVALID_ARGUMENT', async () => {
    for (const paragraph of [0, -1]) {
      expect(await issues('get_law', { law_name: '民法', article: '1', paragraph })).toEqual([
        { path: 'paragraph', message: '1 以上で指定してください' },
      ]);
    }
    expect(await issues('get_law', { law_name: '民法', article: '1', paragraph: 1.5 })).toEqual([
      { path: 'paragraph', message: '整数で指定してください' },
    ]);
    expect(h.urls()).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-LAW-036 paragraph: 2 は検査を通り、第 2 項が無い条なら ARTICLE_NOT_FOUND', async () => {
    h.setRoute((url) => (url.pathname.includes('/law_data/') ? lawDataResponse(MINPO) : null));
    const r = await h.call('get_law', { law_name: '民法', article: '1', paragraph: 2 });
    expect(r.body.code).toBe('ARTICLE_NOT_FOUND');
  });

  // ---------- get_toc ----------

  it('SPEC-EGOV-GET-TOC-023 depth は 1 以上の整数で、0・負の数・小数は法令を取らずに INVALID_ARGUMENT', async () => {
    for (const depth of [0, -1]) {
      expect(await issues('get_toc', { law_name: '民法', depth })).toEqual([
        { path: 'depth', message: '1 以上で指定してください' },
      ]);
    }
    expect(await issues('get_toc', { law_name: '民法', depth: 1.5 })).toEqual([
      { path: 'depth', message: '整数で指定してください' },
    ]);
    expect(h.urls()).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-TOC-023 depth: 99 は検査を通り、条まで返して truncated: false', async () => {
    h.setRoute((url) =>
      url.pathname.includes('/law_data/') ? lawDataResponse(MINPO, simpleLawTree('民法')) : null
    );
    const r = await h.call('get_toc', { law_name: '民法', depth: 99 });
    expect(r.isError).toBe(false);
    expect(r.body.truncated).toBe(false);
  });

  // ---------- get_law_revisions ----------

  it('SPEC-EGOV-GET-LAW-REVISIONS-012 latest は 1 以上の整数で、0・負の数・小数は改正履歴を取らずに INVALID_ARGUMENT', async () => {
    for (const latest of [0, -1]) {
      expect(await issues('get_law_revisions', { law_name: '消法', latest })).toEqual([
        { path: 'latest', message: '1 以上で指定してください' },
      ]);
    }
    expect(await issues('get_law_revisions', { law_name: '消法', latest: 2.5 })).toEqual([
      { path: 'latest', message: '整数で指定してください' },
    ]);
    expect(h.urls()).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-LAW-REVISIONS-012 latest: 10 は検査を通り、改正履歴が 3 件なら 3 件を返す', async () => {
    h.setRoute((url) =>
      url.pathname.includes('/law_revisions/') ? revisionsResponse(SHOHI.law_id, 3) : null
    );
    const r = await h.call('get_law_revisions', { law_name: '消法', latest: 10 });
    expect(r.isError).toBe(false);
    expect(r.body.revisions).toHaveLength(3);
  });

  // ---------- get_article_references ----------

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-040 paragraph は 1 以上の整数で、0・小数は法令を取らずに INVALID_ARGUMENT', async () => {
    expect(
      await issues('get_article_references', {
        law_name: '所得税法',
        article: '57の2',
        paragraph: 0,
      })
    ).toEqual([{ path: 'paragraph', message: '1 以上で指定してください' }]);
    expect(
      await issues('get_article_references', {
        law_name: '所得税法',
        article: '57の2',
        paragraph: 1.5,
      })
    ).toEqual([{ path: 'paragraph', message: '整数で指定してください' }]);
    expect(h.urls()).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-040 paragraph: 1 は検査を通る', async () => {
    h.setRoute((url) =>
      url.pathname.includes('/law_data/')
        ? lawDataResponse(SHOTOKU, simpleLawTree('所得税法', '57_2'))
        : null
    );
    const r = await h.call('get_article_references', {
      law_name: '所得税法',
      article: '57の2',
      paragraph: 1,
    });
    expect(r.isError).toBe(false);
  });

  // ---------- verify_citations ----------

  it('SPEC-EGOV-VERIFY-CITATIONS-041 citations[].paragraph が 0・小数ならツール全体を INVALID_ARGUMENT にし、法令を取らない', async () => {
    const r = await h.call('verify_citations', {
      citations: [
        { law_name: '民法', article: '709' },
        { law_name: '民法', article: '709', paragraph: 0 },
      ],
    });
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.tool).toBe('verify_citations');
    expect(r.body.detail.issues).toEqual([
      { path: 'citations.1.paragraph', message: '1 以上で指定してください' },
    ]);
    expect(r.body).not.toHaveProperty('results');
    const b = await h.call('verify_citations', {
      citations: [{ law_name: '民法', article: '709', paragraph: 1.5 }],
    });
    expect(b.body.detail.issues).toEqual([
      { path: 'citations.0.paragraph', message: '整数で指定してください' },
    ]);
    expect(h.urls()).toHaveLength(0);
  });

  // ---------- get_law_range ----------

  it('SPEC-EGOV-GET-LAW-RANGE-030 suppl_index は 1 以上の整数で、0・小数は法令を取らずに INVALID_ARGUMENT', async () => {
    expect(await issues('get_law_range', { law_name: '民法', suppl_index: 0 })).toEqual([
      { path: 'suppl_index', message: '1 以上で指定してください' },
    ]);
    expect(await issues('get_law_range', { law_name: '民法', suppl_index: 1.5 })).toEqual([
      { path: 'suppl_index', message: '整数で指定してください' },
    ]);
    expect(h.urls()).toHaveLength(0);
  });

  // ---------- get_attachment ----------

  it('SPEC-EGOV-GET-ATTACHMENT-025 src が空文字・空白だけなら src を省いたときと同じ zip の応答', async () => {
    h.setRoute((url) =>
      url.pathname.includes('/law_data/')
        ? lawDataResponse(MINPO, simpleLawTree('民法'), ['./pict/H11HO127-001.jpg'])
        : null
    );
    const omitted = (await h.call('get_attachment', { law_name: '民法' })).body;
    expect(omitted.kind).toBe('zip');
    for (const src of ['', '   ', '　', '\t\n']) {
      const r = await h.call('get_attachment', { law_name: '民法', src });
      expect(r.isError, JSON.stringify(src)).toBe(false);
      expect(r.body.kind).toBe('zip');
      expect(r.body.src).toBeNull();
      expect(r.body.url).toBe(omitted.url);
    }
    const padded = await h.call('get_attachment', { law_name: '民法', src: ' H11HO127-001.jpg ' });
    expect(padded.body.kind).toBe('file');
    expect(padded.body.src).toBe('./pict/H11HO127-001.jpg');
  });

  // ---------- search_fulltext ----------

  it('SPEC-EGOV-SEARCH-FULLTEXT-005 語が残らない入力（1 文字・記号だけ）は hits: []。空文字はここに含めない', async () => {
    for (const keyword of ['税', '"*:()']) {
      const a = (await handleSearchFulltext({ keyword }, { dbPath: DB_STD })) as AnyObj;
      expect(a.source, keyword).toBe('bulk');
      expect(a.hits, keyword).toEqual([]);
    }
    const r = await h.call('search_fulltext', { keyword: '' });
    expect(r.body.code).toBe('INVALID_ARGUMENT');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-029 search_law に切り替えたときは渡した limit（省けば 10）をそのまま渡す', async () => {
    h.setRoute((url) => (url.pathname.endsWith('/laws') ? lawsResponse([]) : null));
    await handleSearchFulltext(
      { keyword: '消法', law_type: 'Act', limit: 3 },
      { dbPath: DB_EMPTY }
    );
    await handleSearchFulltext({ keyword: '所得税', limit: 30 }, { dbPath: DB_EMPTY });
    await handleSearchFulltext({ keyword: '所得税2' }, { dbPath: DB_EMPTY });
    const got = h.urls().map((u) => ({
      law_title: u.searchParams.get('law_title'),
      law_type: u.searchParams.get('law_type'),
      limit: u.searchParams.get('limit'),
    }));
    expect(got).toEqual([
      { law_title: '消費税法', law_type: 'Act', limit: '3' },
      { law_title: '所得税法', law_type: null, limit: '30' },
      { law_title: '所得税2', law_type: null, limit: '10' },
    ]);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-033 limit は 1 以上 30 以下の整数で、範囲の外は丸めずに INVALID_ARGUMENT', async () => {
    expect(await issues('search_fulltext', { keyword: '適格請求書', limit: 0 })).toEqual([
      { path: 'limit', message: '1 以上で指定してください' },
    ]);
    for (const limit of [31, 100]) {
      expect(await issues('search_fulltext', { keyword: '適格請求書', limit })).toEqual([
        { path: 'limit', message: '30 以下で指定してください' },
      ]);
    }
    expect(await issues('search_fulltext', { keyword: '適格請求書', limit: 2.5 })).toEqual([
      { path: 'limit', message: '整数で指定してください' },
    ]);
    expect(h.urls()).toHaveLength(0);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-033 limit: 30 は検査を通る（DB が無ければ search_law に limit=30 で切り替える）', async () => {
    h.setRoute((url) => (url.pathname.endsWith('/laws') ? lawsResponse([]) : null));
    const r = (await handleSearchFulltext(
      { keyword: '適格請求書', limit: 30 },
      { dbPath: DB_EMPTY }
    )) as AnyObj;
    expect(r.source).toBe('api-fallback');
    expect(h.urls()[0].searchParams.get('limit')).toBe('30');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-034 keyword が空文字・空白だけなら DB も e-Gov も引かずに INVALID_ARGUMENT', async () => {
    await expectEmptyAndBlank(h, 'search_fulltext', (v) => ({ keyword: v }), 'keyword');
    for (const keyword of ['　　', ' \t']) {
      const r = await h.call('search_fulltext', { keyword });
      expect(r.body.error).toBe('keyword が空です');
      expect(r.body).not.toHaveProperty('source');
    }
    expect(h.urls()).toHaveLength(0);
  });
});
