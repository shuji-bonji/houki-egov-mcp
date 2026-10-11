/**
 * 受入テスト: get_toc の truncated_by（差分 20261012-toc-truncated-by、#121）
 *
 * 期待値の正本は specs/changes/20261012-toc-truncated-by/specs/get_toc/spec.md
 * （ADDED SPEC-EGOV-GET-TOC-030、MODIFIED 010・016）。
 * e-Gov クライアント（`services/egov-client.js`）を `vi.mock` で差し替え、実際の e-Gov には触れない。
 * ツールは createServer() を InMemoryTransport でつなぎ、tools/call の応答を見る。
 */

import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LawNode } from '../../services/egov-client.js';

const LAW_ID = '999AC0000000001';
const TITLE = 'テスト法';
const LAW_NUM = '令和七年法律第一号';

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
 * 第一編 > 第一章（第1条・第2条）・第二章 > 第一節（第3条）の本則（構造階層は編・章・節の 3 段）と、
 * 条だけ（第1条）の附則・第一章（第1条・第2条）を持つ附則の 2 本
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

vi.mock('../../services/egov-client.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../services/egov-client.js')>();
  const lawInfo = { law_id: LAW_ID, law_type: 'Act', law_num: LAW_NUM };
  return {
    ...mod,
    searchLaws: async (params: { law_title?: string }) => {
      const laws =
        params.law_title === TITLE
          ? [{ law_info: lawInfo, revision_info: { law_title: TITLE } }]
          : [];
      return { total_count: laws.length, count: laws.length, laws };
    },
    getLawData: async () => ({
      law_info: lawInfo,
      revision_info: { law_title: TITLE },
      law_full_text: LAW_TREE,
    }),
    getLawRevisions: async () => ({ law_info: lawInfo, revisions: [] }),
  };
});

// 差し替えの factory が上の定数を使うので、テスト対象は定数の初期化の後に読み込む
const { createServer } = await import('../../server.js');
const { _resetCachesForTest } = await import('../../services/law-service.js');

interface TextContent {
  type: 'text';
  text: string;
}

// biome-ignore lint/suspicious/noExplicitAny: tools/call の JSON を自由に読むため
type Json = any;

let client: Client;

async function okToc(args: Record<string, unknown>): Promise<Json> {
  const res = await client.callTool({ name: 'get_toc', arguments: args });
  const content = res.content as TextContent[];
  const body = JSON.parse(content[0].text);
  if (res.isError === true) throw new Error(`unexpected error: ${JSON.stringify(body)}`);
  return body;
}

beforeEach(async () => {
  _resetCachesForTest();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  client = new Client({ name: 'houki-egov-test', version: '0.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
});

describe('get_toc の truncated_by', () => {
  it('SPEC-EGOV-GET-TOC-030 depth で本則の枝を刈ったときは truncated: true と truncated_by: "depth"', async () => {
    const r = await okToc({ law_name: TITLE, depth: 2 });
    expect(r.truncated).toBe(true);
    expect(r.truncated_by).toBe('depth');
  });

  it('SPEC-EGOV-GET-TOC-030 depth が構造階層の深さ以上で何も刈らなかったときは truncated: false と truncated_by: null', async () => {
    const r = await okToc({ law_name: TITLE, depth: 99 });
    expect(r.truncated).toBe(false);
    expect(r).toHaveProperty('truncated_by', null);
    // 条まで残る
    expect(r.toc[0].children[1].children[0].children.map((c: Json) => c.num)).toEqual(['3']);
  });

  it('SPEC-EGOV-GET-TOC-030 編 > 章 > 節 > 条の法令に depth: 4（条まで）を渡すと刈らないので truncated_by: null', async () => {
    const r = await okToc({ law_name: TITLE, depth: 4 });
    expect(r.truncated).toBe(false);
    expect(r).toHaveProperty('truncated_by', null);
    expect(r.node_count).toBe(7);
  });

  it('SPEC-EGOV-GET-TOC-030 同じ法令に depth: 3（節まで。節の children は空配列）を渡すと刈るので truncated_by: "depth"', async () => {
    const r = await okToc({ law_name: TITLE, depth: 3 });
    expect(r.toc[0].children[1].children[0].children).toEqual([]);
    expect(r.truncated).toBe(true);
    expect(r.truncated_by).toBe('depth');
  });

  it('SPEC-EGOV-GET-TOC-030 depth を省いたときは truncated: false と truncated_by: null（キーは無くならない）', async () => {
    const r = await okToc({ law_name: TITLE });
    expect(r.truncated).toBe(false);
    expect(Object.keys(r)).toContain('truncated_by');
    expect(r.truncated_by).toBeNull();
  });

  it('SPEC-EGOV-GET-TOC-030 suppl: "full" と depth: 1 で附則の中の目次も刈ったときも、本則を刈っていれば truncated_by: "depth"', async () => {
    const r = await okToc({ law_name: TITLE, suppl: 'full', depth: 1 });
    expect(r.truncated).toBe(true);
    expect(r.truncated_by).toBe('depth');
  });

  it('SPEC-EGOV-GET-TOC-030 刈ったことを markdown には書かない', async () => {
    const r = await okToc({ law_name: TITLE, depth: 1 });
    expect(r.truncated_by).toBe('depth');
    expect(r.markdown).not.toContain('depth');
    expect(r.markdown).not.toContain('truncated');
    expect(r.markdown).not.toContain('刈');
  });
});

describe('get_toc の depth と truncated（truncated_by を添えた形）', () => {
  it('SPEC-EGOV-GET-TOC-010 depth: 1 は編だけを返し、truncated: true・truncated_by: "depth" で、next_actions は無い', async () => {
    const r = await okToc({ law_name: TITLE, depth: 1 });
    expect(r.toc).toHaveLength(1);
    expect(r.toc[0].tag).toBe('Part');
    expect(r.toc[0].children).toEqual([]);
    expect(r.truncated).toBe(true);
    expect(r.truncated_by).toBe('depth');
    expect(r.next_actions).toBeUndefined();
    expect(r.next_from_article).toBeUndefined();
    // 附則の本数は depth で変わらない
    expect(r.suppl.count).toBe(2);
    expect(r.suppl_provisions).toHaveLength(2);
  });

  it('SPEC-EGOV-GET-TOC-010 depth: 2 は編と章を返し（章の children は空配列）、truncated_by: "depth"', async () => {
    const r = await okToc({ law_name: TITLE, depth: 2 });
    expect(r.toc[0].children.map((c: Json) => c.tag)).toEqual(['Chapter', 'Chapter']);
    expect(r.toc[0].children.every((c: Json) => c.children.length === 0)).toBe(true);
    expect(r.truncated).toBe(true);
    expect(r.truncated_by).toBe('depth');
  });

  it('SPEC-EGOV-GET-TOC-016 node_count は返した本則のノード数で、刈らなければ 7・truncated: false・truncated_by: null', async () => {
    const r = await okToc({ law_name: TITLE });
    expect(r.node_count).toBe(7);
    expect(r.truncated).toBe(false);
    expect(r.truncated_by).toBeNull();
  });

  it('SPEC-EGOV-GET-TOC-016 depth: 1 で刈ったときは刈った後のノード数 1・truncated: true・truncated_by: "depth"', async () => {
    const r = await okToc({ law_name: TITLE, depth: 1 });
    expect(r.node_count).toBe(1);
    expect(r.truncated).toBe(true);
    expect(r.truncated_by).toBe('depth');
  });
});
