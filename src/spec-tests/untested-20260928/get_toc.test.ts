/**
 * 受入テスト: get_toc（差分 20260928-untested-behaviors の ADDED）
 *
 * 期待値の正本は specs/changes/20260928-untested-behaviors/specs/get_toc/spec.md。
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

const article = (num: string): LawNode => ({
  tag: 'Article',
  attr: { Num: num },
  children: [
    { tag: 'ArticleTitle', attr: {}, children: [`第${num}条`] },
    {
      tag: 'Paragraph',
      attr: { Num: '1' },
      children: [{ tag: 'ParagraphSentence', attr: {}, children: ['本文'] }],
    },
  ],
});

const structural = (tag: string, num: string, title: string, children: LawNode[]): LawNode => ({
  tag,
  attr: { Num: num },
  children: [{ tag: `${tag}Title`, attr: {}, children: [title] }, ...children],
});

/**
 * 第一編 > 第一章（第1条・第2条）・第二章 > 第一節（第3条）の本則と、
 * 条だけ（第1条）の附則・第一章（第1条・第2条）を持つ附則の 2 本（附則の条は合計 3 件）
 */
const LAW_TREE: LawNode = {
  tag: 'Law',
  attr: {},
  children: [
    {
      tag: 'LawBody',
      attr: {},
      children: [
        { tag: 'LawTitle', attr: {}, children: [TITLE] },
        {
          tag: 'MainProvision',
          attr: {},
          children: [
            structural('Part', '1', '第一編　総則', [
              structural('Chapter', '1', '第一章　通則', [article('1'), article('2')]),
              structural('Chapter', '2', '第二章　雑則', [
                structural('Section', '1', '第一節　補則', [article('3')]),
              ]),
            ]),
          ],
        },
        {
          tag: 'SupplProvision',
          attr: {},
          children: [{ tag: 'SupplProvisionLabel', attr: {}, children: ['附　則'] }, article('1')],
        },
        {
          tag: 'SupplProvision',
          attr: { AmendLawNum: '令和八年三月三一日法律第五号' },
          children: [
            { tag: 'SupplProvisionLabel', attr: {}, children: ['附　則'] },
            structural('Chapter', '1', '第一章　経過措置', [article('1'), article('2')]),
          ],
        },
      ],
    },
  ],
};

/** e-Gov クライアントの差し替えの振る舞いと呼び出しの記録 */
const fake = vi.hoisted(() => ({
  lawDataError: null as Error | null,
  revisionsError: null as Error | null,
  searchCalls: [] as string[],
  lawDataCalls: [] as { lawId: string; at?: string }[],
  revisionsCalls: [] as string[],
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
      return { law_info: lawInfo, revision_info: { law_title: TITLE }, law_full_text: LAW_TREE };
    },
    getLawRevisions: async (lawId: string) => {
      fake.revisionsCalls.push(lawId);
      if (fake.revisionsError) throw fake.revisionsError;
      return { law_info: lawInfo, revisions: [] };
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

async function callToc(args: Record<string, unknown>): Promise<{ isError: boolean; body: Json }> {
  const res = await client.callTool({ name: 'get_toc', arguments: args });
  const content = res.content as TextContent[];
  return { isError: res.isError === true, body: JSON.parse(content[0].text) };
}

async function okToc(args: Record<string, unknown>): Promise<Json> {
  const r = await callToc(args);
  if (r.isError) throw new Error(`unexpected error: ${JSON.stringify(r.body)}`);
  return r.body;
}

async function errToc(args: Record<string, unknown>): Promise<Json> {
  const r = await callToc(args);
  expect(r.isError).toBe(true);
  return r.body;
}

/** 末尾の空行を除いた行の配列 */
const lines = (md: string): string[] => md.replace(/\n+$/, '').split('\n');

beforeEach(async () => {
  _resetCachesForTest();
  fake.lawDataError = null;
  fake.revisionsError = null;
  fake.searchCalls.length = 0;
  fake.lawDataCalls.length = 0;
  fake.revisionsCalls.length = 0;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  client = new Client({ name: 'houki-egov-test', version: '0.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
});

describe('get_toc のエラー', () => {
  it('SPEC-EGOV-GET-TOC-012 法令が見つからないときは LAW_NOT_FOUND と resolve_abbreviation・search_law の案内', async () => {
    const e = await errToc({ law_name: '存在しない法' });
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

  it('SPEC-EGOV-GET-TOC-013 管轄外の名前（消基通）は e-Gov に問い合わせずに OUT_OF_SCOPE', async () => {
    const e = await errToc({ law_name: '消基通' });
    expect(e.code).toBe('OUT_OF_SCOPE');
    expect(e.error.startsWith('「消費税法基本通達」は houki-nta の管轄です')).toBe(true);
    expect(e.next_actions[0]).toMatchObject({
      action: 'delegate_to_mcp',
      example: { mcp: 'houki-nta' },
    });
    expect(typeof e.next_actions[0].reason).toBe('string');
    expect(e.next_actions[0].reason.length).toBeGreaterThan(0);
    expect(e.detail.cause).toBe('source_mcp_hint=houki-nta');
    expect(fake.searchCalls).toEqual([]);
    expect(fake.lawDataCalls).toEqual([]);
  });

  it('SPEC-EGOV-GET-TOC-014 本文の取得が 503 で失敗すると SOURCE_API_ERROR', async () => {
    fake.lawDataError = new EgovHttpError(503, 'https://laws.e-gov.go.jp/api/2/law_data/x', 'x');
    const e = await errToc({ law_name: TITLE });
    expect(e.code).toBe('SOURCE_API_ERROR');
    expect(e.error).toBe('e-Gov API がサーバーエラーを返しました（503）');
    expect(e.retryable).toBe(true);
    expect(e.detail.status).toBe(503);
    expect(e.next_actions.map((a: Json) => a.action)).toEqual(['retry_later', 'visit_egov_site']);
  });

  it('SPEC-EGOV-GET-TOC-014 本文の取得が 429 で失敗すると SOURCE_RATE_LIMITED', async () => {
    fake.lawDataError = new EgovHttpError(429, 'https://laws.e-gov.go.jp/api/2/law_data/x', 'x');
    const e = await errToc({ law_name: TITLE });
    expect(e.code).toBe('SOURCE_RATE_LIMITED');
    expect(e.error).toBe('e-Gov API がレート制限を返しました（429）');
    expect(e.retryable).toBe(true);
    expect(e.detail.status).toBe(429);
    expect(e.next_actions.map((a: Json) => a.action)).toEqual(['retry_later']);
  });

  it('SPEC-EGOV-GET-TOC-014 本文の取得がタイムアウトすると SOURCE_TIMEOUT', async () => {
    // e-Gov クライアントはタイムアウトを status 0 の EgovHttpError で投げる
    fake.lawDataError = new EgovHttpError(
      0,
      'https://laws.e-gov.go.jp/api/2/law_data/x',
      'e-Gov API request timeout: https://laws.e-gov.go.jp/api/2/law_data/x'
    );
    const e = await errToc({ law_name: TITLE });
    expect(e.code).toBe('SOURCE_TIMEOUT');
    expect(e.error).toBe('e-Gov API がタイムアウトしました');
    expect(e.retryable).toBe(true);
    expect(e.next_actions.map((a: Json) => a.action)).toEqual(['retry_later', 'visit_egov_site']);
  });
});

describe('get_toc の応答', () => {
  it('SPEC-EGOV-GET-TOC-015 meta は law_id・title・law_num・retrieved_at・url を持ち、at を省くと at を持たない', async () => {
    const r = await okToc({ law_name: TITLE });
    expect(r.meta).toEqual({
      law_id: LAW_ID,
      title: TITLE,
      law_num: LAW_NUM,
      retrieved_at: expect.any(String),
      url: LAW_URL,
    });
    expect(r.meta).not.toHaveProperty('at');
    expect(r.meta.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(r.meta.retrieved_at).toISOString()).toBe(r.meta.retrieved_at);
  });

  it('SPEC-EGOV-GET-TOC-016 node_count は本則の目次のノード数で、附則は数えない', async () => {
    const r = await okToc({ law_name: TITLE });
    expect(r.node_count).toBe(7);
    expect(r.truncated).toBe(false);
  });

  it('SPEC-EGOV-GET-TOC-016 depth で刈ったときは刈った後のノード数', async () => {
    const r = await okToc({ law_name: TITLE, depth: 1 });
    expect(r.node_count).toBe(1);
    expect(r.truncated).toBe(true);
  });

  it('SPEC-EGOV-GET-TOC-017 markdown の 1 行目は見出し、末尾は出典・URL・取得日時で時点の行を含まない', async () => {
    const r = await okToc({ law_name: TITLE });
    const ls = lines(r.markdown);
    expect(ls[0]).toBe('# テスト法 — 目次');
    expect(ls.slice(-4)).toEqual([
      '---',
      '出典：e-Gov法令検索（デジタル庁）',
      `URL: ${LAW_URL}`,
      `取得日時: ${r.meta.retrieved_at}`,
    ]);
    expect(r.markdown).not.toContain('時点:');
  });

  it('SPEC-EGOV-GET-TOC-018 at を渡すと e-Gov に時点が渡り、meta.at と markdown の時点の行に入る', async () => {
    const r = await okToc({ law_name: TITLE, at: '2020-04-01' });
    expect(fake.lawDataCalls).toEqual([{ lawId: LAW_ID, at: '2020-04-01' }]);
    expect(r.meta.at).toBe('2020-04-01');
    expect(lines(r.markdown).slice(-3)).toEqual([
      `URL: ${LAW_URL}`,
      '時点: 2020-04-01',
      `取得日時: ${r.meta.retrieved_at}`,
    ]);
  });
});

describe('get_toc の附則と depth', () => {
  it('SPEC-EGOV-GET-TOC-019 suppl: "full" と depth: 1 では附則の中の目次も打ち切る', async () => {
    const r = await okToc({ law_name: TITLE, suppl: 'full', depth: 1 });
    const [first, second] = r.suppl_provisions;
    expect(first.children).toHaveLength(1);
    expect(first.children[0].tag).toBe('Article');
    expect(first.children[0].num).toBe('1');
    expect(second.children).toHaveLength(1);
    expect(second.children[0].tag).toBe('Chapter');
    expect(second.children[0].children).toEqual([]);
  });

  it('SPEC-EGOV-GET-TOC-019 suppl: "full" と depth: 2 では附則の章の下の条まで残る', async () => {
    const r = await okToc({ law_name: TITLE, suppl: 'full', depth: 2 });
    expect(r.suppl_provisions[1].children[0].children.map((c: Json) => c.num)).toEqual(['1', '2']);
  });

  it('SPEC-EGOV-GET-TOC-019 suppl: "list" では depth は附則に効かず、中身を返さない', async () => {
    const r = await okToc({ law_name: TITLE, suppl: 'list', depth: 1 });
    expect(r.suppl_provisions).toHaveLength(2);
    expect(r.suppl_provisions.every((sp: Json) => sp.children.length === 0)).toBe(true);
  });

  it('SPEC-EGOV-GET-TOC-020 改正履歴の取得に失敗しても、題名なしの目次を返し note に理由を書く', async () => {
    fake.revisionsError = new EgovHttpError(
      503,
      `https://laws.e-gov.go.jp/api/2/law_revisions/${LAW_ID}`,
      'svc down'
    );
    const r = await callToc({ law_name: TITLE, with_amend_titles: true });
    expect(r.isError).toBe(false);
    const body = r.body;
    expect(fake.revisionsCalls).toEqual([LAW_ID]);
    expect(body.toc).toHaveLength(1);
    expect(body.suppl_provisions).toHaveLength(2);
    for (const sp of body.suppl_provisions) {
      expect(sp).not.toHaveProperty('amend_law_title');
    }
    expect(body.suppl).not.toHaveProperty('amend_law_titles');
    expect(body.suppl.note).toBe(
      '附則 2 本の見出しと条数だけを返しました（条は合計 3 件）。中の条まで要るときは suppl: "full" を指定してください。改正法の題名は付けられませんでした（改正履歴の取得に失敗: svc down）'
    );
  });

  it('SPEC-EGOV-GET-TOC-021 suppl: "none" と with_amend_titles: true では改正履歴を引かない', async () => {
    const r = await okToc({ law_name: TITLE, suppl: 'none', with_amend_titles: true });
    expect(fake.revisionsCalls).toEqual([]);
    expect(r.suppl).toEqual({
      mode: 'none',
      count: 2,
      article_count: 3,
      note: '附則 2 本（条 3 件）は返していません（suppl: "none"）',
    });
  });

  // 差分 20261001-t1-argument-guards で REMOVED。テストは specs/current に取り込むコミットで外す
  it.skip('SPEC-EGOV-GET-TOC-022 depth: 0 と depth: -1 は全階層を返し、truncated: false', async () => {
    const full = await okToc({ law_name: TITLE });
    for (const depth of [0, -1]) {
      const r = await callToc({ law_name: TITLE, depth });
      expect(r.isError).toBe(false);
      expect(r.body.toc).toEqual(full.toc);
      expect(r.body.node_count).toBe(7);
      expect(r.body.truncated).toBe(false);
    }
  });
});
