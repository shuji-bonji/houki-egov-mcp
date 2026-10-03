/**
 * 差分 20261003-search-explain-attachment の受入テスト — search_fulltext（#55・#67・#88）
 *
 * 期待値の正本: specs/changes/20261003-search-explain-attachment/specs/search_fulltext/spec.md
 * 標準の fixture の DB（src/test-helpers/law-db-fixture.ts）は、消費税法第30条・第30条の2の本文に「適格請求書」があり、
 * どの条の本文にも「インボイス」が無い。
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb } from '../../db/index.js';
import { initSchema } from '../../db/schema.js';
import { _resetCachesForTest } from '../../services/law-service.js';
import { seedTestDb } from '../../test-helpers/law-db-fixture.js';
import { type Harness, json, startHarness } from '../../test-helpers/mcp-harness.js';
import { tools } from '../../tools/definitions.js';
import { handleSearchFulltext } from '../../tools/handlers.js';

// biome-ignore lint/suspicious/noExplicitAny: 応答の形をテストで自由に辿るため
type AnyObj = Record<string, any>;

const TMP = join(tmpdir(), `houki-egov-spec-sea-${process.pid}`);
const DB_STD = join(TMP, 'std.db');
const DB_EMPTY = join(TMP, 'empty.db');
/** 途中が普通のファイルなので開けない DB のパス */
const DB_BROKEN = join(TMP, 'not-a-dir', 'x.db');

const DOMAIN_NOTE = '分野での絞り込みはしていません（domain の引数は 0.18.0 で外しました）';

beforeAll(async () => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, 'not-a-dir'), 'file');
  const std = new Database(DB_STD);
  initSchema(std);
  await seedTestDb(std);
  closeDb(std);
}, 60_000);

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

beforeEach(() => {
  _resetCachesForTest();
  rmSync(DB_EMPTY, { force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** e-Gov への問い合わせを数える（0 件の /laws を返す） */
function stubFetch() {
  const fn = vi.fn(async () => json({ total_count: 0, count: 0, laws: [] }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const bulk = async (args: AnyObj, dbPath = DB_STD): Promise<AnyObj> =>
  (await handleSearchFulltext(args as never, { dbPath })) as AnyObj;

describe('search_fulltext の展開（SPEC-EGOV-SEARCH-FULLTEXT-007）', () => {
  it('SPEC-EGOV-SEARCH-FULLTEXT-007 略称は今までどおり正式名称にも展開する（労基法 → 労働基準法、消法 → 消費税法）', async () => {
    const roki = await bulk({ keyword: '労基法' });
    expect(roki.expanded_keywords).toEqual({ from: '労基法', to: '労働基準法' });
    const shoho = await bulk({ keyword: '消法' });
    expect(shoho.expanded_keywords).toEqual({ from: '消法', to: '消費税法' });
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-007 通称は元の語で条が当たれば展開しない（適格請求書は第30条・第30条の2に当たる）', async () => {
    const r = await bulk({ keyword: '適格請求書' });
    expect(r.source).toBe('bulk');
    expect(r).not.toHaveProperty('expanded_keywords');
    const articles = r.hits.filter((h: AnyObj) => h.match_type === 'article');
    expect(articles.map((h: AnyObj) => h.article_num).sort()).toEqual(['30', '30の2']);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-007 通称の元の語で条が 0 件なら、正式名称で探し直して expanded_keywords を付ける（インボイス → 消費税法）', async () => {
    const r = await bulk({ keyword: 'インボイス' });
    expect(r.expanded_keywords).toEqual({ from: 'インボイス', to: '消費税法' });
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.every((h: AnyObj) => h.law_id === '363AC0000000108')).toBe(true);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-007 正式名称そのものと辞書に無い語は展開しない', async () => {
    expect(await bulk({ keyword: '消費税法' })).not.toHaveProperty('expanded_keywords');
    expect(await bulk({ keyword: '課税仕入れ' })).not.toHaveProperty('expanded_keywords');
  });
});

describe('search_fulltext の 2 文字の語（SPEC-EGOV-SEARCH-FULLTEXT-018）', () => {
  it('SPEC-EGOV-SEARCH-FULLTEXT-018 1 件目の案内は example を付けず reason に「<法令名> <語>」の形を書く。2 件目は scan_body', async () => {
    const r = await bulk({ keyword: '控除' });
    expect(r.short_tokens.body_search).toBe('not_searched');
    expect(r.short_tokens.next_actions).toHaveLength(2);
    expect(r.short_tokens.next_actions[0]).toEqual({
      action: 'search_fulltext',
      reason:
        '法令名を添えて keyword を「<法令名> 控除」の形にすると、その法令の条本文を索引で引けます',
    });
    expect(r.short_tokens.next_actions[0]).not.toHaveProperty('example');
    expect(r.short_tokens.next_actions[1]).toMatchObject({
      action: 'search_fulltext',
      example: { keyword: '控除', scan_body: true },
    });
  });
});

describe('search_fulltext の domain（SPEC-EGOV-SEARCH-FULLTEXT-022）', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness(() => null);
  });
  afterEach(async () => {
    await h.close();
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-022 inputSchema に domain は無く、渡すと INVALID_ARGUMENT（DB も e-Gov も引かない）', async () => {
    const schema = tools.find((t) => t.name === 'search_fulltext')
      ?.inputSchema as unknown as AnyObj;
    expect(schema.properties).not.toHaveProperty('domain');
    const r = await h.call('search_fulltext', { keyword: '適格請求書', domain: 'tax' });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.tool).toBe('search_fulltext');
    expect(r.body.detail.issues).toEqual([
      { path: 'domain', message: 'inputSchema に無い引数です' },
    ]);
    expect(h.urls()).toHaveLength(0);
  });
});

describe('search_fulltext の filters.domain（SPEC-EGOV-SEARCH-FULLTEXT-022）', () => {
  it('SPEC-EGOV-SEARCH-FULLTEXT-022 bulk の応答の filters.domain はキーを残し、requested: null・applied: false と外したことを書く', async () => {
    const r = await bulk({ keyword: '適格請求書' });
    expect(r.filters.domain).toEqual({ requested: null, applied: false, note: DOMAIN_NOTE });
  });
});

describe('search_fulltext に管轄外の略称（SPEC-EGOV-SEARCH-FULLTEXT-037）', () => {
  it('SPEC-EGOV-SEARCH-FULLTEXT-037 keyword 全体が管轄外の略称なら、DB があっても OUT_OF_SCOPE（e-Gov は引かない）', async () => {
    const fetchFn = stubFetch();
    const r = await bulk({ keyword: '消基通' });
    expect(r.code).toBe('OUT_OF_SCOPE');
    expect(r.error).toContain('消費税法基本通達');
    expect(r.error).toContain('houki-nta');
    expect(r.next_actions).toEqual([
      expect.objectContaining({ action: 'delegate_to_mcp', example: { mcp: 'houki-nta' } }),
    ]);
    expect(typeof r.next_actions[0].reason).toBe('string');
    expect(typeof r.hint).toBe('string');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-037 DB が無くても、開けなくても OUT_OF_SCOPE（search_law に切り替えない）', async () => {
    const fetchFn = stubFetch();
    for (const dbPath of [DB_EMPTY, DB_BROKEN]) {
      const r = await bulk({ keyword: '  消基通 ' }, dbPath);
      expect(r.code).toBe('OUT_OF_SCOPE');
      expect(r).not.toHaveProperty('fallback');
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-037 管轄外の略称と別の語の組み合わせは、今までどおり本文を探す', async () => {
    const r = await bulk({ keyword: '消基通 仕入税額控除' });
    expect(r.code).toBeUndefined();
    expect(r.source).toBe('bulk');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-037 MCP 経由でも isError の OUT_OF_SCOPE', async () => {
    const h = await startHarness(() => null);
    try {
      const r = await h.call('search_fulltext', { keyword: '消基通' });
      expect(r.isError).toBe(true);
      expect(r.body.code).toBe('OUT_OF_SCOPE');
      expect(h.urls()).toHaveLength(0);
    } finally {
      await h.close();
    }
  });
});
