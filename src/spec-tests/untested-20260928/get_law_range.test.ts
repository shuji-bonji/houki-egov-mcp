/**
 * 受入テスト: get_law_range（差分 20260928-untested-behaviors の ADDED）
 *
 * 期待値の正本は specs/changes/20260928-untested-behaviors/specs/get_law_range/spec.md。
 * e-Gov クライアント（`services/egov-client.js`）を `vi.mock` で差し替え、実際の e-Gov には触れない。
 * ツールは createServer() を InMemoryTransport でつなぎ、tools/call の応答（content / isError）を見る。
 */

import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LawNode } from '../../services/egov-client.js';

const LAW_ID = '999AC0000000001';
const TITLE = 'テスト法';
const LAW_NUM = '令和七年法律第一号';
const LAW_URL = `https://laws.e-gov.go.jp/law/${LAW_ID}`;

/** 1 条。本文は `length` 文字 */
const article = (num: string, caption: string, length = 20): LawNode => ({
  tag: 'Article',
  attr: { Num: num },
  children: [
    { tag: 'ArticleCaption', attr: {}, children: [`（${caption}）`] },
    { tag: 'ArticleTitle', attr: {}, children: [`第${num}条`] },
    {
      tag: 'Paragraph',
      attr: { Num: '1' },
      children: [{ tag: 'ParagraphSentence', attr: {}, children: ['あ'.repeat(length)] }],
    },
  ],
});

const structural = (tag: string, num: string, title: string, children: LawNode[]): LawNode => ({
  tag,
  attr: { Num: num },
  children: [{ tag: `${tag}Title`, attr: {}, children: [title] }, ...children],
});

const lawOf = (main: LawNode[]): LawNode => ({
  tag: 'Law',
  attr: {},
  children: [
    {
      tag: 'LawBody',
      attr: {},
      children: [
        { tag: 'LawTitle', attr: {}, children: [TITLE] },
        { tag: 'MainProvision', attr: {}, children: main },
      ],
    },
  ],
});

/**
 * 第一章（本文 20 文字の第1条・第2条）と、
 * 第二章 > 第一節 > 第一款（第一目に第3条、第二目に第4条・第5条）・第二款の二（第6条）を持つ法令
 */
const BASIC_TREE = lawOf([
  structural('Chapter', '1', '第一章　総則', [article('1', '趣旨'), article('2', '定義')]),
  structural('Chapter', '2', '第二章　契約', [
    structural('Section', '1', '第一節　通則', [
      structural('Subsection', '1', '第一款　成立', [
        structural('Division', '1', '第一目　申込み', [article('3', '申込み')]),
        structural('Division', '2', '第二目　承諾', [
          article('4', '承諾'),
          article('5', '承諾の期間'),
        ]),
      ]),
      structural('Subsection', '2_2', '第二款の二　解除', [article('6', '解除')]),
    ]),
  ]),
]);

/** 第1編〜第6編のどれにも第一章がある法令 */
const SIX_PARTS_TREE = lawOf(
  ['一', '二', '三', '四', '五', '六'].map((kan, i) =>
    structural('Part', String(i + 1), `第${kan}編　編${i + 1}`, [
      structural('Chapter', '1', '第一章　通則', [article(String(i + 1), `条${i + 1}`)]),
    ])
  )
);

/** e-Gov クライアントの差し替えの振る舞いと呼び出しの記録 */
const fake = vi.hoisted(() => ({
  tree: null as unknown,
  lawDataError: null as Error | null,
  searchCalls: [] as string[],
  lawDataCalls: [] as { lawId: string; at?: string }[],
}));

vi.mock('../../services/egov-client.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../services/egov-client.js')>();
  const lawInfo = { law_id: LAW_ID, law_type: 'Act', law_num: LAW_NUM };
  return {
    ...mod,
    searchLaws: async (params: { law_title?: string }) => {
      fake.searchCalls.push(params.law_title ?? '');
      const laws =
        params.law_title === TITLE
          ? [{ law_info: lawInfo, revision_info: { law_title: TITLE } }]
          : [];
      return { total_count: laws.length, count: laws.length, laws };
    },
    getLawData: async (lawId: string, params: { at?: string } = {}) => {
      fake.lawDataCalls.push({ lawId, at: params.at });
      if (fake.lawDataError) throw fake.lawDataError;
      return { law_info: lawInfo, revision_info: { law_title: TITLE }, law_full_text: fake.tree };
    },
  };
});

// 差し替えの factory が上の定数を使うので、テスト対象は定数の初期化の後に読み込む
const { EgovHttpError } = await import('../../services/egov-client.js');
const { createServer } = await import('../../server.js');
const { _resetCachesForTest } = await import('../../services/law-service.js');

interface TextContent {
  type: 'text';
  text: string;
}

// biome-ignore lint/suspicious/noExplicitAny: tools/call の JSON を自由に読むため
type Json = any;

let client: Client;

async function callRange(args: Record<string, unknown>): Promise<{ isError: boolean; body: Json }> {
  const res = await client.callTool({ name: 'get_law_range', arguments: args });
  const content = res.content as TextContent[];
  return { isError: res.isError === true, body: JSON.parse(content[0].text) };
}

async function okRange(args: Record<string, unknown>): Promise<Json> {
  const r = await callRange(args);
  if (r.isError) throw new Error(`unexpected error: ${JSON.stringify(r.body)}`);
  return r.body;
}

async function errRange(args: Record<string, unknown>): Promise<Json> {
  const r = await callRange(args);
  expect(r.isError).toBe(true);
  return r.body;
}

/** 末尾の空行を除いた行の配列 */
const lines = (md: string): string[] => md.replace(/\n+$/, '').split('\n');

const egovCalls = () => fake.searchCalls.length + fake.lawDataCalls.length;

beforeEach(async () => {
  _resetCachesForTest();
  fake.tree = BASIC_TREE;
  fake.lawDataError = null;
  fake.searchCalls.length = 0;
  fake.lawDataCalls.length = 0;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  client = new Client({ name: 'houki-egov-test', version: '0.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
});

describe('get_law_range の法令と e-Gov のエラー', () => {
  it('SPEC-EGOV-GET-LAW-RANGE-017 法令が見つからないときは LAW_NOT_FOUND と resolve_abbreviation・search_law の案内', async () => {
    const e = await errRange({ law_name: '存在しない法', chapter: 1 });
    expect(e.code).toBe('LAW_NOT_FOUND');
    expect(e.error).toBe('法令が見つかりません: 存在しない法');
    expect(e.next_actions).toHaveLength(2);
    expect(e.next_actions.map((a: Json) => a.action)).toEqual([
      'resolve_abbreviation',
      'search_law',
    ]);
    expect(e.next_actions[0].example).toEqual({ abbr: '存在しない法' });
    expect(e.next_actions[1].example).toEqual({ keyword: '存在しない法' });
  });

  it('SPEC-EGOV-GET-LAW-RANGE-018 管轄外の名前（消基通）は e-Gov に問い合わせずに OUT_OF_SCOPE', async () => {
    const e = await errRange({ law_name: '消基通', chapter: 1 });
    expect(e.code).toBe('OUT_OF_SCOPE');
    expect(e.error.startsWith('「消費税法基本通達」は houki-nta の管轄です')).toBe(true);
    expect(e.next_actions[0]).toMatchObject({
      action: 'delegate_to_mcp',
      example: { mcp: 'houki-nta' },
    });
    expect(typeof e.next_actions[0].reason).toBe('string');
    expect(e.next_actions[0].reason.length).toBeGreaterThan(0);
    expect(e.detail.cause).toBe('source_mcp_hint=houki-nta');
    expect(egovCalls()).toBe(0);
  });

  it('SPEC-EGOV-GET-LAW-RANGE-018 範囲の指定を読む前に OUT_OF_SCOPE を返す（読めない chapter でも）', async () => {
    const e = await errRange({ law_name: '消基通', chapter: '総則' });
    expect(e.code).toBe('OUT_OF_SCOPE');
    expect(egovCalls()).toBe(0);
  });

  it('SPEC-EGOV-GET-LAW-RANGE-019 本文の取得が 503 で失敗すると SOURCE_API_ERROR', async () => {
    fake.lawDataError = new EgovHttpError(503, 'https://laws.e-gov.go.jp/api/2/law_data/x', 'x');
    const e = await errRange({ law_name: TITLE, chapter: 1 });
    expect(e.code).toBe('SOURCE_API_ERROR');
    expect(e.error).toBe('e-Gov API がサーバーエラーを返しました（503）');
    expect(e.retryable).toBe(true);
    expect(e.detail.status).toBe(503);
    expect(e.next_actions.map((a: Json) => a.action)).toEqual(['retry_later', 'visit_egov_site']);
  });

  it('SPEC-EGOV-GET-LAW-RANGE-019 本文の取得が 429 で失敗すると SOURCE_RATE_LIMITED', async () => {
    fake.lawDataError = new EgovHttpError(429, 'https://laws.e-gov.go.jp/api/2/law_data/x', 'x');
    const e = await errRange({ law_name: TITLE, chapter: 1 });
    expect(e.code).toBe('SOURCE_RATE_LIMITED');
    expect(e.error).toBe('e-Gov API がレート制限を返しました（429）');
    expect(e.retryable).toBe(true);
    expect(e.detail.status).toBe(429);
    expect(e.next_actions.map((a: Json) => a.action)).toEqual(['retry_later']);
  });

  it('SPEC-EGOV-GET-LAW-RANGE-019 本文の取得がタイムアウトすると SOURCE_TIMEOUT', async () => {
    // e-Gov クライアントはタイムアウトを status 0 の EgovHttpError で投げる
    fake.lawDataError = new EgovHttpError(
      0,
      'https://laws.e-gov.go.jp/api/2/law_data/x',
      'e-Gov API request timeout: https://laws.e-gov.go.jp/api/2/law_data/x'
    );
    const e = await errRange({ law_name: TITLE, chapter: 1 });
    expect(e.code).toBe('SOURCE_TIMEOUT');
    expect(e.error).toBe('e-Gov API がタイムアウトしました');
    expect(e.retryable).toBe(true);
    expect(e.next_actions.map((a: Json) => a.action)).toEqual(['retry_later', 'visit_egov_site']);
  });
});

describe('get_law_range の引数の検査', () => {
  it('SPEC-EGOV-GET-LAW-RANGE-020 chapter: "総則" は e-Gov に問い合わせずに INVALID_ARGUMENT', async () => {
    const e = await errRange({ law_name: TITLE, chapter: '総則' });
    expect(e.code).toBe('INVALID_ARGUMENT');
    expect(e.error).toBe(
      '編・章・節の番号の形式が不正です（例: "3", "三", "第三章", "2の2", "第二章の二"）: 総則'
    );
    expect(e.hint).toBe(
      'chapter は "3"・"三"・"第三章"・"2の2" のいずれかの形式で指定してください'
    );
    expect(egovCalls()).toBe(0);
  });

  it('SPEC-EGOV-GET-LAW-RANGE-020 chapter: 0 は 1 以上の整数で指定するよう返す', async () => {
    const e = await errRange({ law_name: TITLE, chapter: 0 });
    expect(e.code).toBe('INVALID_ARGUMENT');
    expect(e.error).toBe('編・章・節の番号は 1 以上の整数で指定してください: 0');
    expect(egovCalls()).toBe(0);
  });

  it.each([['三〇'], [''], [-1], [1.5]])(
    'SPEC-EGOV-GET-LAW-RANGE-020 chapter: %j も e-Gov に問い合わせずに INVALID_ARGUMENT',
    async (chapter) => {
      const e = await errRange({ law_name: TITLE, chapter });
      expect(e.code).toBe('INVALID_ARGUMENT');
      expect(e.error).toContain(String(chapter));
      expect(egovCalls()).toBe(0);
    }
  );

  it('SPEC-EGOV-GET-LAW-RANGE-020 subsection: "総則" の hint は subsection で始まる', async () => {
    const e = await errRange({ law_name: TITLE, subsection: '総則' });
    expect(e.code).toBe('INVALID_ARGUMENT');
    expect(e.hint.startsWith('subsection は')).toBe(true);
    expect(e.error).toContain('総則');
    expect(egovCalls()).toBe(0);
  });

  it('SPEC-EGOV-GET-LAW-RANGE-021 from_article: "abc" は INVALID_ARTICLE_NUM', async () => {
    const e = await errRange({ law_name: TITLE, chapter: 1, from_article: 'abc' });
    expect(e.code).toBe('INVALID_ARTICLE_NUM');
    expect(e.error).toBe(
      '条番号の形式が不正です（例: "30", "30の2", "第三十条", "第三十条の二"）: abc'
    );
    expect(e.hint).toBe(
      'from_article は "561"、"548の4"、"第五百六十一条" のいずれかの形式で指定してください'
    );
  });

  it.each([['第一項'], ['']])(
    'SPEC-EGOV-GET-LAW-RANGE-021 from_article: %j も INVALID_ARTICLE_NUM',
    async (fromArticle) => {
      const e = await errRange({ law_name: TITLE, chapter: 1, from_article: fromArticle });
      expect(e.code).toBe('INVALID_ARTICLE_NUM');
      expect(e.error).toContain(fromArticle);
    }
  );

  it('SPEC-EGOV-GET-LAW-RANGE-022 max_chars を省くと range.max_chars は 30000', async () => {
    const r = await okRange({ law_name: TITLE, chapter: 1 });
    expect(r.range.max_chars).toBe(30000);
  });

  it.each([[2000], [50000], [120000]])(
    'SPEC-EGOV-GET-LAW-RANGE-022 max_chars: %d を渡すと range.max_chars はその値',
    async (maxChars) => {
      const r = await okRange({ law_name: TITLE, chapter: 1, max_chars: maxChars });
      expect(r.range.max_chars).toBe(maxChars);
    }
  );

  it('SPEC-EGOV-GET-LAW-RANGE-023 max_chars: 1999 は inputSchema の検査で INVALID_ARGUMENT', async () => {
    const e = await errRange({ law_name: TITLE, chapter: 1, max_chars: 1999 });
    expect(e.code).toBe('INVALID_ARGUMENT');
    expect(e.detail.issues).toEqual([{ path: 'max_chars', message: 'must be >= 2000' }]);
  });

  it('SPEC-EGOV-GET-LAW-RANGE-023 max_chars: 120001 は inputSchema の検査で INVALID_ARGUMENT', async () => {
    const e = await errRange({ law_name: TITLE, chapter: 1, max_chars: 120001 });
    expect(e.code).toBe('INVALID_ARGUMENT');
    expect(e.detail.issues).toEqual([{ path: 'max_chars', message: 'must be <= 120000' }]);
  });
});

describe('get_law_range の款・目', () => {
  it('SPEC-EGOV-GET-LAW-RANGE-024 chapter・section・subsection で款を範囲にする', async () => {
    const r = await okRange({ law_name: TITLE, chapter: 2, section: 1, subsection: 1 });
    expect(r.range.path).toBe('Chapter2/Section1/Subsection1');
    expect(r.range.tag).toBe('Subsection');
    expect(r.articles.map((a: Json) => a.num)).toEqual(['3', '4', '5']);
    expect(r.range.titles).toEqual(['第二章　契約', '第一節　通則', '第一款　成立']);
  });

  it('SPEC-EGOV-GET-LAW-RANGE-024 subsection: "第一款" も同じ範囲を返す', async () => {
    const r = await okRange({ law_name: TITLE, subsection: '第一款' });
    expect(r.range.path).toBe('Chapter2/Section1/Subsection1');
    expect(r.range.tag).toBe('Subsection');
    expect(r.articles.map((a: Json) => a.num)).toEqual(['3', '4', '5']);
    expect(r.range.titles).toEqual(['第二章　契約', '第一節　通則', '第一款　成立']);
  });

  it('SPEC-EGOV-GET-LAW-RANGE-024 division: "二" で目を範囲にし、見出しは上位から並べる', async () => {
    const r = await okRange({ law_name: TITLE, division: '二' });
    expect(r.range.path).toBe('Chapter2/Section1/Subsection1/Division2');
    expect(r.range.tag).toBe('Division');
    expect(r.articles.map((a: Json) => a.num)).toEqual(['4', '5']);
    expect(r.markdown).toContain('# テスト法 第二章　契約 第一節　通則 第一款　成立 第二目　承諾');
  });

  it('SPEC-EGOV-GET-LAW-RANGE-024 subsection: "2の2" で款の枝番号を指す', async () => {
    const r = await okRange({ law_name: TITLE, subsection: '2の2' });
    expect(r.range.path).toBe('Chapter2/Section1/Subsection2_2');
    expect(r.articles.map((a: Json) => a.num)).toEqual(['6']);
  });

  it('SPEC-EGOV-GET-LAW-RANGE-024 division: 9 は RANGE_NOT_FOUND', async () => {
    const e = await errRange({ law_name: TITLE, division: 9 });
    expect(e.code).toBe('RANGE_NOT_FOUND');
  });
});

describe('get_law_range の meta と markdown の末尾', () => {
  it('SPEC-EGOV-GET-LAW-RANGE-025 meta は law_id・title・law_num・retrieved_at・url を持ち、at を省くと at を持たない', async () => {
    const r = await okRange({ law_name: TITLE, chapter: 1 });
    expect(r.meta).toEqual({
      law_id: LAW_ID,
      title: TITLE,
      law_num: LAW_NUM,
      retrieved_at: expect.any(String),
      url: LAW_URL,
    });
    expect(r.meta).not.toHaveProperty('at');
    expect(new Date(r.meta.retrieved_at).toISOString()).toBe(r.meta.retrieved_at);
  });

  it('SPEC-EGOV-GET-LAW-RANGE-026 markdown の末尾に ---・range.note・出典・URL・取得日時の 5 行を書く', async () => {
    const r = await okRange({ law_name: TITLE, chapter: 1 });
    const note =
      '範囲の条 2 件のうち 2 件を返しました（第1条〜第2条）。本文 68 文字（上限 30,000 文字）。';
    expect(lines(r.markdown).slice(-5)).toEqual([
      '---',
      note,
      '出典：e-Gov法令検索（デジタル庁）',
      `URL: ${LAW_URL}`,
      `取得日時: ${r.meta.retrieved_at}`,
    ]);
    expect(r.markdown).not.toContain('時点:');
    expect(r.range.note).toBe(note);
  });

  it('SPEC-EGOV-GET-LAW-RANGE-027 at を渡すと e-Gov に時点が渡り、meta.at と markdown の時点の行に入る', async () => {
    const r = await okRange({ law_name: TITLE, chapter: 1, at: '2020-04-01' });
    expect(fake.lawDataCalls).toEqual([{ lawId: LAW_ID, at: '2020-04-01' }]);
    expect(r.meta.at).toBe('2020-04-01');
    expect(lines(r.markdown).slice(-3)).toEqual([
      `URL: ${LAW_URL}`,
      '時点: 2020-04-01',
      `取得日時: ${r.meta.retrieved_at}`,
    ]);
  });
});

describe('get_law_range の候補が多いとき', () => {
  it('SPEC-EGOV-GET-LAW-RANGE-028 候補が 6 か所のとき hint には全部、next_actions には先頭の 5 件', async () => {
    fake.tree = SIX_PARTS_TREE;
    const e = await errRange({ law_name: TITLE, chapter: 1 });
    expect(e.code).toBe('INVALID_ARGUMENT');
    expect(e.error).toBe('指定された範囲が 6 か所あります。上位の階層も指定してください');
    for (let i = 1; i <= 6; i++) {
      expect(e.hint).toContain(`Part${i}/Chapter1`);
    }
    expect(e.next_actions).toHaveLength(5);
    expect(e.next_actions.map((a: Json) => a.example.path)).toEqual([
      'Part1/Chapter1',
      'Part2/Chapter1',
      'Part3/Chapter1',
      'Part4/Chapter1',
      'Part5/Chapter1',
    ]);
  });
});
