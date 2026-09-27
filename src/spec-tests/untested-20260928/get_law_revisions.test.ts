/**
 * 差分 20260928-untested-behaviors の受入テスト — get_law_revisions
 *
 * 期待値の正本: specs/changes/20260928-untested-behaviors/specs/get_law_revisions/spec.md
 * e-Gov の改正履歴（/law_revisions/<law_id>）と法令検索（/laws）は vi.stubGlobal('fetch', …) で差し替える。
 * 取り直しの待ち時間（最大 3 回）があるテストは timeout を延ばしている。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetCachesForTest } from '../../services/law-service.js';
import { handleGetLawRevisions } from '../../tools/handlers.js';

// biome-ignore lint/suspicious/noExplicitAny: 応答の形をテストで自由に辿るため
type AnyObj = Record<string, any>;

const LAW_ID = '363AC0000000108';
const REVISIONS_URL = `https://laws.e-gov.go.jp/api/2/law_revisions/${LAW_ID}`;
const RETRY_TIMEOUT = 20_000;

const REV1 = {
  law_revision_id: '363AC0000000108_20291001_505AC0000000003',
  amendment_promulgate_date: '2023-03-31',
  amendment_enforcement_date: '2029-10-01',
  amendment_enforcement_comment: null,
  amendment_law_num: '令和五年法律第三号',
  amendment_law_title: '所得税法等の一部を改正する法律',
  amendment_law_id: '505AC0000000003',
  current_revision_status: 'UnEnforced',
};
const REV2 = {
  law_revision_id: '363AC0000000108_20260401_507AC0000000013',
  amendment_promulgate_date: '2025-03-31',
  amendment_enforcement_date: '2026-04-01',
  amendment_enforcement_comment: null,
  amendment_law_num: '令和七年法律第十三号',
  amendment_law_title: '所得税法等の一部を改正する法律',
  amendment_law_id: '507AC0000000013',
  current_revision_status: 'CurrentEnforced',
};
const REV3 = {
  law_revision_id: '363AC0000000108_20250401_506AC0000000008',
  amendment_promulgate_date: '2024-03-30',
  amendment_enforcement_date: '2025-04-01',
  amendment_enforcement_comment: null,
  amendment_law_num: '令和六年法律第八号',
  amendment_law_title: '所得税法等の一部を改正する法律',
  amendment_law_id: '506AC0000000008',
  current_revision_status: 'PreviousEnforced',
};
const REVS = [REV1, REV2, REV3];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function revisionsBody(revisions: unknown[]) {
  return {
    law_info: {
      law_id: LAW_ID,
      law_type: 'Act',
      law_num: '昭和六十三年法律第百八号',
      promulgation_date: '1988-12-30',
    },
    revisions,
  };
}

type RevisionsBehavior = (() => Response | Promise<Response>) | undefined;

/** /laws は常に 0 件、/law_revisions は behavior（省くと REVS）を返す fetch */
function stubFetch(opts: { revisions?: RevisionsBehavior } = {}) {
  const fn = vi.fn(async (input: unknown) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/laws')) {
      return jsonResponse({ total_count: 0, count: 0, laws: [] });
    }
    if (url.pathname.includes('/law_revisions/')) {
      if (opts.revisions) return opts.revisions();
      return jsonResponse(revisionsBody(REVS));
    }
    return jsonResponse({ message: 'not stubbed' }, 404);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const calledUrls = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  _resetCachesForTest();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('get_law_revisions — 応答の形', () => {
  it('SPEC-EGOV-GET-LAW-REVISIONS-002 meta・total・revisions の形で改正履歴を返し、余分なフィールドは入れない', async () => {
    stubFetch({
      revisions: () => jsonResponse(revisionsBody([{ ...REV1, extra_field: 'x' }, REV2, REV3])),
    });
    const before = Date.now();
    const r = (await handleGetLawRevisions({ law_name: '消法' })) as AnyObj;
    expect(r).not.toHaveProperty('code');
    expect(r.meta.law_id).toBe(LAW_ID);
    expect(r.meta.url).toBe('https://laws.e-gov.go.jp/law/363AC0000000108');
    expect(r.meta).toHaveProperty('title');
    expect(r.meta).toHaveProperty('law_num');
    expect(typeof r.meta.retrieved_at).toBe('string');
    const at = Date.parse(r.meta.retrieved_at);
    expect(Number.isNaN(at)).toBe(false);
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(r.total).toBe(3);
    expect(r.revisions).toHaveLength(3);
    expect(r.revisions[0]).toEqual(REV1);
    expect(r.revisions[0]).not.toHaveProperty('extra_field');
    expect(r.revisions.map((x: AnyObj) => x.law_revision_id)).toEqual(
      REVS.map((x) => x.law_revision_id)
    );
  });
});

describe('get_law_revisions — 法令を決められないとき', () => {
  it('SPEC-EGOV-GET-LAW-REVISIONS-003 管轄外の名前は e-Gov を引かずに OUT_OF_SCOPE', async () => {
    const fn = stubFetch();
    const r = (await handleGetLawRevisions({ law_name: '消基通' })) as AnyObj;
    expect(fn).not.toHaveBeenCalled();
    expect(r.code).toBe('OUT_OF_SCOPE');
    expect(r.error).toContain('消費税法基本通達');
    expect(r.error).toContain('houki-nta');
    expect(r.next_actions[0]).toMatchObject({
      action: 'delegate_to_mcp',
      example: { mcp: 'houki-nta' },
    });
    expect(r.detail.cause).toBe('source_mcp_hint=houki-nta');
  });

  it('SPEC-EGOV-GET-LAW-REVISIONS-004 法令検索が 0 件なら改正履歴を引かずに LAW_NOT_FOUND', async () => {
    const fn = stubFetch();
    const r = (await handleGetLawRevisions({ law_name: '存在しない法律' })) as AnyObj;
    expect(r.code).toBe('LAW_NOT_FOUND');
    expect(r.error).toBe('法令が見つかりません: 存在しない法律');
    expect(r.next_actions).toHaveLength(2);
    expect(r.next_actions[0].action).toBe('resolve_abbreviation');
    expect(r.next_actions[0].example).toEqual({ abbr: '存在しない法律' });
    expect(r.next_actions[1].action).toBe('search_law');
    expect(r.next_actions[1].example).toEqual({ keyword: '存在しない法律' });
    const urls = calledUrls(fn);
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]).pathname.endsWith('/laws')).toBe(true);
    expect(urls.some((u) => u.includes('/law_revisions/'))).toBe(false);
  });
});

describe('get_law_revisions — e-Gov のエラー', () => {
  it(
    'SPEC-EGOV-GET-LAW-REVISIONS-005 429 を返し続けたら 4 回呼んで SOURCE_RATE_LIMITED',
    async () => {
      const fn = stubFetch({ revisions: () => jsonResponse({ message: 'too many' }, 429) });
      const r = (await handleGetLawRevisions({ law_name: '消法' })) as AnyObj;
      expect(fn).toHaveBeenCalledTimes(4);
      expect(r.code).toBe('SOURCE_RATE_LIMITED');
      expect(r.retryable).toBe(true);
      expect(r.next_actions[0].action).toBe('retry_later');
      expect(r.detail).toMatchObject({ status: 429, url: REVISIONS_URL });
    },
    RETRY_TIMEOUT
  );

  it('SPEC-EGOV-GET-LAW-REVISIONS-006 AbortError で終わったら取り直さずに SOURCE_TIMEOUT', async () => {
    const fn = stubFetch({
      revisions: () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    });
    const r = (await handleGetLawRevisions({ law_name: '消法' })) as AnyObj;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(r.code).toBe('SOURCE_TIMEOUT');
    expect(r.retryable).toBe(true);
    expect(r.next_actions.map((a: AnyObj) => a.action)).toEqual(['retry_later', 'visit_egov_site']);
    expect(r.next_actions[1].example).toEqual({ url: 'https://laws.e-gov.go.jp/' });
    expect(r.detail.url).toBe(REVISIONS_URL);
  });

  it(
    'SPEC-EGOV-GET-LAW-REVISIONS-007 503 を返し続けたら 4 回呼んで retryable: true の SOURCE_API_ERROR',
    async () => {
      const fn = stubFetch({ revisions: () => jsonResponse({ message: 'unavailable' }, 503) });
      const r = (await handleGetLawRevisions({ law_name: '消法' })) as AnyObj;
      expect(fn).toHaveBeenCalledTimes(4);
      expect(r.code).toBe('SOURCE_API_ERROR');
      expect(r.retryable).toBe(true);
      expect(r.detail.status).toBe(503);
      expect(r.detail.url).toBe(REVISIONS_URL);
      expect(r.error).toContain('503');
      expect(r.next_actions.map((a: AnyObj) => a.action)).toEqual([
        'retry_later',
        'visit_egov_site',
      ]);
    },
    RETRY_TIMEOUT
  );

  it('SPEC-EGOV-GET-LAW-REVISIONS-008 404 / 400 は取り直さずに retryable: false の SOURCE_API_ERROR', async () => {
    for (const status of [404, 400]) {
      _resetCachesForTest();
      const fn = stubFetch({
        revisions: () => jsonResponse({ code: 'x', message: 'client error' }, status),
      });
      const r = (await handleGetLawRevisions({ law_name: '消法' })) as AnyObj;
      expect(fn).toHaveBeenCalledTimes(1);
      expect(r.code).toBe('SOURCE_API_ERROR');
      expect(r.retryable).toBe(false);
      expect(r.detail.status).toBe(status);
      expect(r.detail.url).toBe(REVISIONS_URL);
      expect(r.next_actions).toBeUndefined();
      vi.unstubAllGlobals();
    }
  });
});

describe('get_law_revisions — latest', () => {
  it('SPEC-EGOV-GET-LAW-REVISIONS-009 latest が 1 以上なら先頭から latest 件、total は絞る前のまま', async () => {
    stubFetch();
    const r1 = (await handleGetLawRevisions({ law_name: '消法', latest: 1 })) as AnyObj;
    expect(r1.total).toBe(3);
    expect(r1.revisions).toHaveLength(1);
    expect(r1.revisions[0].law_revision_id).toBe('363AC0000000108_20291001_505AC0000000003');

    const r2 = (await handleGetLawRevisions({ law_name: '消法', latest: 2 })) as AnyObj;
    expect(r2.total).toBe(3);
    expect(r2.revisions).toHaveLength(2);
    expect(r2.revisions.map((x: AnyObj) => x.law_revision_id)).toEqual([
      REV1.law_revision_id,
      REV2.law_revision_id,
    ]);

    const r10 = (await handleGetLawRevisions({ law_name: '消法', latest: 10 })) as AnyObj;
    expect(r10.total).toBe(3);
    expect(r10.revisions).toHaveLength(3);
  });

  it('SPEC-EGOV-GET-LAW-REVISIONS-010 latest を省くと全件を返す', async () => {
    stubFetch();
    const r = (await handleGetLawRevisions({ law_name: '消法' })) as AnyObj;
    expect(r.total).toBe(3);
    expect(r.revisions).toHaveLength(3);
  });
});

describe('get_law_revisions — 略称辞書の law_id', () => {
  it('SPEC-EGOV-GET-LAW-REVISIONS-011 辞書に law_id がある名前は /laws を引かず、meta は辞書の値', async () => {
    const fn = stubFetch();
    const r = (await handleGetLawRevisions({ law_name: '消法' })) as AnyObj;
    expect(calledUrls(fn)).toEqual([REVISIONS_URL]);
    expect(r.meta.title).toBe('消費税法');
    expect(r.meta.law_num).toBe('昭和六十三年法律第百八号');
  });
});
