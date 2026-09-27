/**
 * 受入テスト: search_law（差分 20260928-untested-behaviors の ADDED）
 *
 * 期待値の正本は specs/changes/20260928-untested-behaviors/specs/search_law/spec.md。
 * e-Gov への問い合わせは `vi.stubGlobal('fetch', …)` で差し替え、実際の e-Gov には触れない。
 * ツールは createServer() を InMemoryTransport でつなぎ、tools/call の応答（content / isError）を見る。
 */

import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../../server.js';
import { _resetCachesForTest } from '../../services/law-service.js';

const LAWS_URL = 'https://laws.e-gov.go.jp/api/2/laws';

interface FakeLaw {
  law_id: string;
  title: string;
  law_num: string;
  law_type: string;
  promulgation_date?: string;
}

const SHOHIZEI: FakeLaw = {
  law_id: '363AC0000000108',
  title: '消費税法',
  law_num: '昭和六十三年法律第百八号',
  law_type: 'Act',
  promulgation_date: '1988-12-30',
};

const SHOHIZEI_REI: FakeLaw = {
  law_id: '363CO0000000360',
  title: '消費税法施行令',
  law_num: '昭和六十三年政令第三百六十号',
  law_type: 'CabinetOrder',
  promulgation_date: '1988-12-30',
};

const ROKI: FakeLaw = {
  law_id: '322AC0000000049',
  title: '労働基準法',
  law_num: '昭和二十二年法律第四十九号',
  law_type: 'Act',
  promulgation_date: '1947-04-07',
};

function lawItem(l: FakeLaw) {
  const lawInfo: Record<string, unknown> = {
    law_id: l.law_id,
    law_type: l.law_type,
    law_num: l.law_num,
  };
  if (l.promulgation_date) lawInfo.promulgation_date = l.promulgation_date;
  return { law_info: lawInfo, revision_info: { law_title: l.title } };
}

function jsonResponse(laws: FakeLaw[]): Response {
  return new Response(
    JSON.stringify({ total_count: laws.length, count: laws.length, laws: laws.map(lawItem) }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

/** law_title ごとに e-Gov の応答を決める差し替え */
function lawsFor(title: string | null): FakeLaw[] {
  switch (title) {
    case '消費税法':
      return [SHOHIZEI, SHOHIZEI_REI];
    case '労働基準':
      return [ROKI];
    default:
      return [];
  }
}

const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
  const title = url.searchParams.get('law_title');
  if (title === 'err429') return new Response('', { status: 429 });
  if (title === 'err503') return new Response('', { status: 503 });
  if (title === 'err400') {
    return new Response(JSON.stringify({ code: '400', message: 'bad request' }), { status: 400 });
  }
  if (title === 'err404') {
    return new Response(JSON.stringify({ code: '404', message: 'not found' }), { status: 404 });
  }
  if (title === 'errabort') {
    const e = new Error('The operation was aborted');
    e.name = 'AbortError';
    throw e;
  }
  return jsonResponse(lawsFor(title));
});

/** /laws への問い合わせの URL の一覧 */
function lawsCalls(): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(typeof input === 'string' ? input : String(input)))
    .filter((u) => `${u.origin}${u.pathname}` === LAWS_URL);
}

interface TextContent {
  type: 'text';
  text: string;
}

/** 成功・エラーの両方の応答の JSON（確かめるフィールドだけ） */
interface SearchBody {
  query: { keyword: string; resolved?: string; law_type?: string };
  total_count: number;
  results: Array<{ title: string; law_type: string; url: string; [key: string]: unknown }>;
  error: string;
  code: string;
  hint?: string;
  retryable?: boolean;
  detail: { status?: number; url?: string; issues: Array<{ path: string }> };
  next_actions: Array<{ action: string }>;
}

interface CallOutcome {
  isError: boolean;
  body: SearchBody;
}

let client: Client;

async function call(args: Record<string, unknown>): Promise<CallOutcome> {
  const r = await client.callTool({ name: 'search_law', arguments: args });
  const content = r.content as TextContent[];
  expect(content[0]?.type).toBe('text');
  return { isError: r.isError === true, body: JSON.parse(content[0].text) };
}

beforeEach(async () => {
  _resetCachesForTest();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  client = new Client({ name: 'search-law-spec-test', version: '0.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
  vi.unstubAllGlobals();
  _resetCachesForTest();
});

describe('search_law — 略称・別名の置き換え', () => {
  it('SPEC-EGOV-SEARCH-LAW-002 略称 消法 は law_title=消費税法 で検索し query.resolved に正式名称を入れる', async () => {
    const r = await call({ keyword: '消法' });
    expect(r.isError).toBe(false);
    const calls = lawsCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get('law_title')).toBe('消費税法');
    expect(r.body.query.keyword).toBe('消法');
    expect(r.body.query.resolved).toBe('消費税法');
    expect(r.body.results[0].title).toBe('消費税法');
  });

  it('SPEC-EGOV-SEARCH-LAW-003 辞書に無い keyword はそのまま検索し query に resolved のキーを付けない', async () => {
    const r = await call({ keyword: '消費税法施行' });
    expect(r.isError).toBe(false);
    const calls = lawsCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get('law_title')).toBe('消費税法施行');
    expect(r.body.query).toEqual({ keyword: '消費税法施行' });
    expect(Object.hasOwn(r.body.query, 'resolved')).toBe(false);
  });

  it.each(['消費税', 'インボイス'])(
    'SPEC-EGOV-SEARCH-LAW-004 別名 %s も law_title=消費税法 で検索し query.keyword は渡した値のまま',
    async (keyword) => {
      const r = await call({ keyword });
      expect(r.isError).toBe(false);
      const calls = lawsCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].searchParams.get('law_title')).toBe('消費税法');
      expect(r.body.query.resolved).toBe('消費税法');
      expect(r.body.query.keyword).toBe(keyword);
    }
  );

  it('SPEC-EGOV-SEARCH-LAW-004 正式名称 消費税法 も辞書の正式名称で検索し query.resolved を入れる', async () => {
    const r = await call({ keyword: '消費税法' });
    expect(r.isError).toBe(false);
    expect(lawsCalls()[0].searchParams.get('law_title')).toBe('消費税法');
    expect(r.body.query.keyword).toBe('消費税法');
    expect(r.body.query.resolved).toBe('消費税法');
  });

  it('SPEC-EGOV-SEARCH-LAW-005 前後の空白を除いて照合し query.keyword は渡した値のまま返す', async () => {
    const r = await call({ keyword: ' 消法 ' });
    expect(r.isError).toBe(false);
    const calls = lawsCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get('law_title')).toBe('消費税法');
    expect(r.body.query.keyword).toBe(' 消法 ');
    expect(r.body.query.resolved).toBe('消費税法');
  });
});

describe('search_law — 成功時の応答の形', () => {
  it('SPEC-EGOV-SEARCH-LAW-006 成功時は isError を付けず results の要素が決まったフィールドを持つ', async () => {
    const r = await call({ keyword: '消法' });
    expect(r.isError).toBe(false);
    expect(typeof r.body.total_count).toBe('number');
    expect(Array.isArray(r.body.results)).toBe(true);
    expect(r.body.results[0]).toEqual({
      law_id: '363AC0000000108',
      title: '消費税法',
      law_num: '昭和六十三年法律第百八号',
      law_type: 'Act',
      promulgation_date: '1988-12-30',
      url: 'https://laws.e-gov.go.jp/law/363AC0000000108',
    });
    // e-Gov が返した順
    expect(r.body.results.map((x: { title: string }) => x.title)).toEqual([
      '消費税法',
      '消費税法施行令',
    ]);
  });

  it('SPEC-EGOV-SEARCH-LAW-006 公布日が e-Gov の応答に無ければ promulgation_date は付かない', async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse([{ ...SHOHIZEI, promulgation_date: undefined }])
    );
    const r = await call({ keyword: '消法' });
    expect(r.isError).toBe(false);
    expect(Object.hasOwn(r.body.results[0], 'promulgation_date')).toBe(false);
    expect(r.body.results[0].url).toBe('https://laws.e-gov.go.jp/law/363AC0000000108');
  });

  it('SPEC-EGOV-SEARCH-LAW-006 e-Gov が 0 件なら total_count 0・results [] でエラーにしない', async () => {
    const r = await call({ keyword: '存在しない' });
    expect(r.isError).toBe(false);
    expect(r.body.total_count).toBe(0);
    expect(r.body.results).toEqual([]);
  });

  it('SPEC-EGOV-SEARCH-LAW-006 format を渡すと INVALID_ARGUMENT（detail.issues[0].path: format）', async () => {
    const r = await call({ keyword: '消法', format: 'json' });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.detail.issues[0].path).toBe('format');
    expect(lawsCalls()).toHaveLength(0);
  });
});

describe('search_law — 空白だけの keyword', () => {
  describe('SPEC-EGOV-SEARCH-LAW-007 空白だけの keyword は e-Gov に問い合わせず INVALID_ARGUMENT', () => {
    it.each(['   ', '\t\n', '　'])(
      'SPEC-EGOV-SEARCH-LAW-007 空白だけの keyword %j は e-Gov に問い合わせず INVALID_ARGUMENT',
      async (keyword) => {
        const r = await call({ keyword });
        expect(r.isError).toBe(true);
        expect(r.body.code).toBe('INVALID_ARGUMENT');
        expect(r.body.error).toBe('keyword が空です');
        expect(r.body.hint).toBeTruthy();
        expect(fetchMock).not.toHaveBeenCalled();
      }
    );
  });
});

describe('search_law — law_type', () => {
  it('SPEC-EGOV-SEARCH-LAW-008 law_type を e-Gov に渡し query.law_type に入れる', async () => {
    const r = await call({ keyword: '労働基準', law_type: 'Act' });
    expect(r.isError).toBe(false);
    const calls = lawsCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get('law_title')).toBe('労働基準');
    expect(calls[0].searchParams.get('law_type')).toBe('Act');
    expect(r.body.query.law_type).toBe('Act');
    expect(r.body.results).toHaveLength(1);
    expect(r.body.results[0].title).toBe('労働基準法');
    expect(r.body.results[0].law_type).toBe('Act');
  });

  it('SPEC-EGOV-SEARCH-LAW-008 law_type を渡さなければ問い合わせにも query にも law_type が無い', async () => {
    const r = await call({ keyword: '消法' });
    expect(r.isError).toBe(false);
    expect(lawsCalls()[0].searchParams.has('law_type')).toBe(false);
    expect(Object.hasOwn(r.body.query, 'law_type')).toBe(false);
  });
});

describe('search_law — e-Gov のエラー', () => {
  it('SPEC-EGOV-SEARCH-LAW-009 429 が続くと SOURCE_RATE_LIMITED（retryable, detail.status/url, retry_later）', async () => {
    const r = await call({ keyword: 'err429' });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('SOURCE_RATE_LIMITED');
    expect(r.body.retryable).toBe(true);
    expect(r.body.detail.status).toBe(429);
    expect(r.body.detail.url).toBe(`${LAWS_URL}?law_title=err429&limit=10`);
    expect(r.body.next_actions[0].action).toBe('retry_later');
  }, 20000);

  it('SPEC-EGOV-SEARCH-LAW-010 打ち切り（AbortError）は SOURCE_TIMEOUT（detail は url だけ）', async () => {
    const r = await call({ keyword: 'errabort' });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('SOURCE_TIMEOUT');
    expect(r.body.retryable).toBe(true);
    expect(r.body.detail).toEqual({ url: `${LAWS_URL}?law_title=errabort&limit=10` });
    expect(Object.hasOwn(r.body.detail, 'status')).toBe(false);
    expect(r.body.next_actions.map((a: { action: string }) => a.action)).toEqual([
      'retry_later',
      'visit_egov_site',
    ]);
  }, 20000);

  it('SPEC-EGOV-SEARCH-LAW-011 5xx が続くと retryable: true の SOURCE_API_ERROR', async () => {
    const r = await call({ keyword: 'err503' });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('SOURCE_API_ERROR');
    expect(r.body.retryable).toBe(true);
    expect(r.body.detail.status).toBe(503);
    expect(r.body.detail.url).toBe(`${LAWS_URL}?law_title=err503&limit=10`);
    expect(r.body.error).toBe('e-Gov API がサーバーエラーを返しました（503）');
    expect(r.body.next_actions.map((a: { action: string }) => a.action)).toEqual([
      'retry_later',
      'visit_egov_site',
    ]);
  }, 20000);

  it('SPEC-EGOV-SEARCH-LAW-012 400 は retryable: false の SOURCE_API_ERROR', async () => {
    const r = await call({ keyword: 'err400' });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('SOURCE_API_ERROR');
    expect(r.body.retryable).toBe(false);
    expect(r.body.detail.status).toBe(400);
    expect(r.body.detail.url).toBe(`${LAWS_URL}?law_title=err400&limit=10`);
  }, 20000);

  it('SPEC-EGOV-SEARCH-LAW-012 404 も retryable: false の SOURCE_API_ERROR', async () => {
    const r = await call({ keyword: 'err404' });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('SOURCE_API_ERROR');
    expect(r.body.retryable).toBe(false);
    expect(r.body.detail.status).toBe(404);
    expect(r.body.detail.url).toBe(`${LAWS_URL}?law_title=err404&limit=10`);
  }, 20000);
});
