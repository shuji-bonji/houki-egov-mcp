/**
 * get_law の受入テスト（差分 20260928-untested-behaviors）。
 *
 * - ADDED の SPEC-EGOV-GET-LAW-019〜035
 * - 未決 1 の「ツールの呼び出しを通したテスト」として、current の SPEC-EGOV-GET-LAW-004〜018
 *
 * MCP クライアントから get_law を呼び、e-Gov への通信は fetch の差し替えで返す。
 * 法令本文のフィクスチャは e-Gov 法令 API v2 の law_full_text の形を簡略化したもの。
 */
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LawNode } from '../../services/egov-client.js';

// ---------- フィクスチャ ----------

const sentence = (text: string): LawNode => ({
  tag: 'Sentence',
  attr: { Num: '1' },
  children: [text],
});
const column = (num: string, text: string): LawNode => ({
  tag: 'Column',
  attr: { Num: num },
  children: [sentence(text)],
});
const node = (tag: string, attr: Record<string, string>, children: Array<LawNode | string>) => ({
  tag,
  attr,
  children,
});
const item = (num: string, title: string | null, body: LawNode[], extra: LawNode[] = []): LawNode =>
  node('Item', { Num: num }, [
    ...(title ? [node('ItemTitle', {}, [title])] : []),
    node('ItemSentence', {}, body),
    ...extra,
  ]);
const paragraph = (num: string, text: string | null, extra: LawNode[] = []): LawNode =>
  node('Paragraph', { Num: num }, [
    node('ParagraphNum', {}, num === '1' ? [] : [String.fromCharCode(0xff10 + Number(num))]),
    ...(text !== null ? [node('ParagraphSentence', {}, [sentence(text)])] : []),
    ...extra,
  ]);
const article = (
  num: string,
  title: string,
  caption: string | null,
  paragraphs: LawNode[]
): LawNode =>
  node('Article', { Num: num }, [
    ...(caption ? [node('ArticleCaption', {}, [caption])] : []),
    node('ArticleTitle', {}, [title]),
    ...paragraphs,
  ]);
const cell = (text: string, attr: Record<string, string> = {}, tag = 'TableColumn'): LawNode =>
  node(tag, attr, [sentence(text)]);
const row = (cells: Array<string | LawNode>, tag = 'TableRow'): LawNode =>
  node(
    tag,
    {},
    cells.map((c) => (typeof c === 'string' ? cell(c) : c))
  );
const table = (rows: LawNode[], before: LawNode[] = [], after: LawNode[] = []): LawNode =>
  node('TableStruct', {}, [...before, node('Table', {}, rows), ...after]);
const lawTree = (title: string, main: LawNode[], suppl: LawNode[] = []): LawNode =>
  node('Law', {}, [
    node('LawBody', {}, [node('LawTitle', {}, [title]), node('MainProvision', {}, main), ...suppl]),
  ]);

const SHOHI_ID = '363AC0000000108';
const SHOHI_NUM = '昭和六十三年法律第百八号';
const SHOTOKU_ID = '340AC0000000033';
const SHOTOKU_NUM = '昭和四十年法律第三十三号';
const SOTOKU_ID = '332AC0000000026';
const SOTOKU_NUM = '昭和三十二年法律第二十六号';
const SHOREI_ID = '363CO0000000360';
const SHOREI_NUM = '昭和六十三年政令第三百六十号';

/** 消費税法（時点 at ごとに第30条第1項の本文が変わる） */
function shohiTree(at: string | null): LawNode {
  const para1Text = at ? `第一項本文（${at}時点）` : '第一項本文（現行）';
  return lawTree(
    '消費税法',
    [
      node('Chapter', { Num: '1' }, [
        node('ChapterTitle', {}, ['第一章　総則']),
        article('1', '第一条', '（趣旨）', [paragraph('1', '趣旨の本文')]),
        article('2', '第二条', '（定義）', [
          paragraph(
            '1',
            'この法律において、次の各号に掲げる用語の意義は、当該各号に定めるところによる。',
            [
              item('8', '八', [
                column('1', '資産の譲渡等'),
                column(
                  '2',
                  '事業として対価を得て行われる資産の譲渡及び貸付け並びに役務の提供をいう。'
                ),
              ]),
              item('8_2', '八の二', [
                column('1', '特定資産の譲渡等'),
                column('2', '事業者向け電気通信利用役務の提供をいう。'),
              ]),
              item('12', '十二', [sentence('第十二号の本文')]),
              item('12_8', '十二の八', [sentence('第十二号の八の本文')]),
            ]
          ),
          paragraph('2', '第二条第二項の本文'),
        ]),
        article('10', '第十条', null, [paragraph('1', '第十条の本文')]),
      ]),
      node('Chapter', { Num: '4' }, [
        node('ChapterTitle', {}, ['第四章　税額控除等']),
        article('30', '第三十条', '（仕入れに係る消費税額の控除）', [
          paragraph('1', para1Text),
          paragraph('2', '次の各号に定める方法により計算した金額とする。', [
            item(
              '1',
              '一',
              [
                column('1', '区分が明らかにされている場合'),
                column('2', 'イに掲げる金額にロに掲げる金額を加算する方法'),
              ],
              [
                node('Subitem1', { Num: '1' }, [
                  node('Subitem1Title', {}, ['イ']),
                  node('Subitem1Sentence', {}, [
                    sentence('課税資産の譲渡等にのみ要する税額の合計額'),
                  ]),
                ]),
                node('Subitem1', { Num: '2' }, [
                  node('Subitem1Title', {}, ['ロ']),
                  node('Subitem1Sentence', {}, [
                    sentence('共通して要する税額に課税売上割合を乗じた金額'),
                  ]),
                  node('Subitem2', { Num: '1' }, [
                    node('Subitem2Title', {}, ['（１）']),
                    node('Subitem2Sentence', {}, [sentence('深さ 2 の本文')]),
                  ]),
                ]),
              ]
            ),
            item(
              '2',
              '二',
              [sentence('次に掲げるもの')],
              [node('List', {}, [node('ListSentence', {}, [sentence('列記の甲')])])]
            ),
            item('3_2', null, [sentence('号の表記の無い号の本文')]),
          ]),
        ]),
        article('30_2', '第三十条の二', '（第三十条の二の見出し）', [
          paragraph('1', '第三十条の二の本文'),
        ]),
        article('57_4', '第五十七条の四', null, [paragraph('1', '第五十七条の四の本文')]),
        article('1050', '第千五十条', null, [paragraph('1', '第千五十条の本文')]),
      ]),
    ],
    [
      node('SupplProvision', { Extract: 'true' }, [
        node('SupplProvisionLabel', {}, ['附　則']),
        article('1', '第一条', '（施行期日の附則見出し）', [paragraph('1', '附則第一条の本文')]),
        article('2', '第二条', '（経過措置の附則見出し）', [paragraph('1', '附則第二条の本文')]),
      ]),
      node('SupplProvision', { AmendLawNum: '平成元年六月二八日法律第三九号', Extract: 'true' }, [
        node('SupplProvisionLabel', {}, ['附　則']),
        article('1', '第一条', null, [paragraph('1', '改正附則の本文')]),
      ]),
      node('SupplProvision', { AmendLawNum: '平成二年六月二二日法律第三六号' }, [
        node('SupplProvisionLabel', {}, ['附　則']),
        node('Paragraph', { Num: '1' }, [
          node('ParagraphSentence', {}, [sentence('この法律は、公布の日から施行する。')]),
        ]),
      ]),
    ]
  );
}

/** 所得税法（表を持つ。附則は無い） */
const SHOTOKU_TREE = lawTree('所得税法', [
  article('2', '第二条', '（定義）', [
    paragraph('1', '次の各号に掲げる用語の意義は、当該各号に定めるところによる。', [
      item('8', '八', [sentence('第八号の本文')]),
      item('8_2', '八の二', [sentence('第八号の二の本文')]),
    ]),
  ]),
  article('89', '第八十九条', '（税率）', [
    paragraph('1', '次の表の下欄に掲げる税率を乗じて計算する。', [
      table([
        row(['百九十五万円以下の金額', '百分の五']),
        row(['四千万円を超える金額', '百分の四十五']),
      ]),
    ]),
  ]),
  article('90', '第九十条', null, [
    paragraph('1', '見出し付きの表の項。', [
      table(
        [
          row(
            [cell('区分', {}, 'TableHeaderColumn'), cell('税率', {}, 'TableHeaderColumn')],
            'TableHeaderRow'
          ),
          row(['甲', '百分の五']),
        ],
        [node('TableStructTitle', {}, ['別表'])],
        [
          node('Remarks', {}, [
            node('RemarksLabel', {}, ['備考']),
            sentence('この表は例示である。'),
          ]),
        ]
      ),
    ]),
    paragraph('2', '結合された表の項。', [
      table([row([cell('A', { rowspan: '2' }), cell('B|C', { colspan: '2' })]), row(['d', 'e'])]),
    ]),
    paragraph('3', '号の中に表がある項。', [
      item(
        '1',
        '一',
        [sentence('次による')],
        [
          node('Subitem1', { Num: '1' }, [
            node('Subitem1Title', {}, ['イ']),
            node('Subitem1Sentence', {}, [sentence('次の表のとおり')]),
            table([row(['区分', '税率'])]),
          ]),
        ]
      ),
    ]),
  ]),
]);

/** 租税特別措置法（枝番号の条。附則を 1 本持つ） */
const SOTOKU_TREE = lawTree(
  '租税特別措置法',
  [
    node('Chapter', { Num: '1' }, [
      node('ChapterTitle', {}, ['第一章　総則']),
      article('1', '第一条', '（趣旨）', [paragraph('1', '趣旨の本文')]),
    ]),
    node('Chapter', { Num: '2' }, [
      node('ChapterTitle', {}, ['第二章　相続税法の特例']),
      article('70_6', '第七十条の六', '（農地等についての相続税の納税猶予等）', [
        paragraph('1', '第七十条の六第一項の本文'),
      ]),
    ]),
  ],
  [
    node('SupplProvision', {}, [
      node('SupplProvisionLabel', {}, ['附　則']),
      article('99', '第九十九条', '（租特の附則の条の見出し）', [paragraph('1', '附則の本文')]),
    ]),
  ]
);

/** 消費税法施行令（項が 1 つの条 第14条の3） */
const SHOREI_TREE = lawTree('消費税法施行令', [
  article('14_3', '第十四条の三', null, [
    paragraph('1', '次に掲げる資産の譲渡等とする。', [
      item('1', '一', [sentence('施行令第十四条の三第一号の本文')]),
      item('2', '二', [sentence('施行令第十四条の三第二号の本文')]),
    ]),
  ]),
]);

// ---------- e-Gov の差し替え ----------

type LawDataMode = { kind: 'ok' } | { kind: 'status'; status: number } | { kind: 'timeout' };

const state: {
  lawDataMode: LawDataMode;
  lawDataUrls: string[];
  searchTitles: string[];
} = { lawDataMode: { kind: 'ok' }, lawDataUrls: [], searchTitles: [] };

const SEARCHABLE: Record<string, { law_id: string; law_num: string; law_type: string }> = {
  租税特別措置法: { law_id: SOTOKU_ID, law_num: SOTOKU_NUM, law_type: 'Act' },
  消費税法施行令: { law_id: SHOREI_ID, law_num: SHOREI_NUM, law_type: 'CabinetOrder' },
};

const LAWS_BY_ID: Record<
  string,
  { title: string; num: string; tree: (at: string | null) => LawNode }
> = {
  [SHOHI_ID]: { title: '消費税法', num: SHOHI_NUM, tree: shohiTree },
  [SHOTOKU_ID]: { title: '所得税法', num: SHOTOKU_NUM, tree: () => SHOTOKU_TREE },
  [SOTOKU_ID]: { title: '租税特別措置法', num: SOTOKU_NUM, tree: () => SOTOKU_TREE },
  [SHOREI_ID]: { title: '消費税法施行令', num: SHOREI_NUM, tree: () => SHOREI_TREE },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  );
  if (url.host !== 'laws.e-gov.go.jp') throw new Error(`unexpected fetch: ${url.href}`);
  if (url.pathname === '/api/2/laws') {
    const title = url.searchParams.get('law_title') ?? '';
    state.searchTitles.push(title);
    const hit = SEARCHABLE[title];
    const laws = hit ? [{ law_info: { ...hit }, revision_info: { law_title: title } }] : [];
    return json({ total_count: laws.length, count: laws.length, laws });
  }
  const m = /^\/api\/2\/law_data\/([^/]+)$/.exec(url.pathname);
  if (m) {
    state.lawDataUrls.push(url.href);
    const mode = state.lawDataMode;
    if (mode.kind === 'status')
      return json({ code: String(mode.status), message: 'x' }, mode.status);
    if (mode.kind === 'timeout') {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('This operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }
    const law = LAWS_BY_ID[m[1]];
    if (!law) return json({ code: '404001', message: 'not found' }, 404);
    const at = url.searchParams.get('asof');
    return json({
      law_info: { law_id: m[1], law_type: 'Act', law_num: law.num },
      revision_info: { law_title: law.title },
      law_full_text: law.tree(at),
    });
  }
  throw new Error(`unexpected fetch: ${url.href}`);
}

vi.stubGlobal('fetch', fakeFetch);

const { createServer } = await import('../../server.js');
const { _resetCachesForTest } = await import('../../services/law-service.js');

// ---------- 呼び出しの補助 ----------

interface ToolResult {
  isError: boolean;
  body: Record<string, unknown>;
}
interface Meta {
  law_id: string;
  title: string;
  law_num: string;
  retrieved_at: string;
  url: string;
  at?: string;
}
interface Ok {
  format: string;
  markdown: string;
  data: {
    article_num: string;
    paragraph_num?: number;
    item_num?: number | string;
    node: { tag: string; attr: Record<string, string>; children: unknown[] };
  };
  meta: Meta;
}
interface Err {
  error: string;
  code: string;
  hint?: string;
  retryable?: boolean;
  next_actions?: Array<{ action: string; reason?: string; example?: Record<string, unknown> }>;
  detail?: Record<string, unknown>;
}

let client: Client;

beforeEach(async () => {
  _resetCachesForTest();
  state.lawDataMode = { kind: 'ok' };
  state.lawDataUrls.length = 0;
  state.searchTitles.length = 0;
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  client = new Client({ name: 'spec-test-get-law', version: '0.0.0' });
  await server.connect(st);
  await client.connect(ct);
});

afterEach(async () => {
  vi.useRealTimers();
  await client.close();
});

async function callRaw(args: Record<string, unknown>): Promise<ToolResult> {
  const res = await client.callTool({ name: 'get_law', arguments: args });
  const text = (res.content as Array<{ type: string; text: string }>)[0].text;
  return { isError: res.isError === true, body: JSON.parse(text) as Record<string, unknown> };
}

async function ok(args: Record<string, unknown>): Promise<Ok> {
  const r = await callRaw(args);
  if (r.isError) throw new Error(`unexpected error: ${JSON.stringify(r.body)}`);
  return r.body as unknown as Ok;
}

async function err(args: Record<string, unknown>): Promise<Err> {
  const r = await callRaw(args);
  expect(r.isError).toBe(true);
  return r.body as unknown as Err;
}

/** 待ち時間（再試行・時間切れ）を偽の時計で進めながら呼ぶ */
async function errWithTimers(args: Record<string, unknown>, advanceMs: number): Promise<Err> {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const p = callRaw(args);
  await vi.advanceTimersByTimeAsync(advanceMs);
  const r = await p;
  vi.useRealTimers();
  expect(r.isError).toBe(true);
  return r.body as unknown as Err;
}

const lines = (md: string) => md.split('\n');
const firstNonEmptyAfter = (ls: string[], index: number) =>
  ls.slice(index + 1).find((l) => l.trim() !== '');
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

// ========================================================
// 未決 1: current の SPEC-EGOV-GET-LAW-004〜018 をツールの呼び出しで確かめる
// ========================================================

describe('get_law — current の 004〜018（ツールの呼び出しを通す）', () => {
  it.each([
    ['30', '第30条'],
    ['第30条', '第30条'],
    ['三十', '第30条'],
    ['第三十条', '第30条'],
    ['３０', '第30条'],
    ['  30  ', '第30条'],
    ['30の2', '第30条の2'],
    ['第30条の2', '第30条の2'],
    ['第三十条の二', '第30条の2'],
    ['三十の二', '第30条の2'],
    ['第３０条の２', '第30条の2'],
    ['57の4', '第57条の4'],
    ['第千五十条', '第1050条'],
    ['第十条', '第10条'],
  ])('SPEC-EGOV-GET-LAW-004 article %j を条として読む', async (articleArg, label) => {
    const r = await ok({ law_name: '消費税法', article: articleArg });
    expect(r.format).toBe('markdown');
    expect(lines(r.markdown)[0]).toBe(`# 消費税法 ${label}`);
  });

  it.each(['第三〇条', '三0', '30-2', '30の'])(
    'SPEC-EGOV-GET-LAW-005 article %j は INVALID_ARTICLE_NUM',
    async (articleArg) => {
      const e = await err({ law_name: '消費税法', article: articleArg });
      expect(e.code).toBe('INVALID_ARTICLE_NUM');
    }
  );

  it.each([
    [8, '# 消費税法 第2条第1項第8号'],
    ['8', '# 消費税法 第2条第1項第8号'],
    ['8の2', '# 消費税法 第2条第1項第8号の2'],
    ['第8号の2', '# 消費税法 第2条第1項第8号の2'],
    [' 12の8 ', '# 消費税法 第2条第1項第12号の8'],
    ['八', '# 消費税法 第2条第1項第8号'],
    ['八の二', '# 消費税法 第2条第1項第8号の2'],
    ['第八号の二', '# 消費税法 第2条第1項第8号の2'],
    ['１２の８', '# 消費税法 第2条第1項第12号の8'],
  ])('SPEC-EGOV-GET-LAW-006 item %j を号として読む', async (itemArg, header) => {
    const r = await ok({ law_name: '消費税法', article: '2', paragraph: 1, item: itemArg });
    expect(lines(r.markdown)[0]).toBe(header);
  });

  it.each([['八八'], [0], [1.5], ['8-2'], ['']])(
    'SPEC-EGOV-GET-LAW-007 item %j は INVALID_ARTICLE_NUM',
    async (itemArg) => {
      const e = await err({ law_name: '消費税法', article: '2', paragraph: 1, item: itemArg });
      expect(e.code).toBe('INVALID_ARTICLE_NUM');
    }
  );

  it('SPEC-EGOV-GET-LAW-008 条番号で条を取り出す（枝番号の条を含む）', async () => {
    const r30 = await ok({ law_name: '消費税法', article: '30' });
    expect(r30.markdown).toContain('第一項本文（現行）');
    expect(r30.markdown).not.toContain('第三十条の二の本文');
    const r302 = await ok({ law_name: '消費税法', article: '30の2' });
    expect(r302.markdown).toContain('第三十条の二の本文');
    expect(r302.markdown).not.toContain('第一項本文');
  });

  it('SPEC-EGOV-GET-LAW-009 存在しない条・号は ARTICLE_NOT_FOUND', async () => {
    const e1 = await err({ law_name: '消費税法', article: '999' });
    expect(e1.code).toBe('ARTICLE_NOT_FOUND');
    // 第8号と第8号の2しかない項で item: 9
    const e2 = await err({ law_name: '所得税法', article: '2', paragraph: 1, item: 9 });
    expect(e2.code).toBe('ARTICLE_NOT_FOUND');
  });

  it('SPEC-EGOV-GET-LAW-010 paragraph で項を、paragraph と item で号を取り出す', async () => {
    const p = await ok({ law_name: '消費税法', article: '30', paragraph: 2 });
    expect(p.markdown).toContain('次の各号に定める方法により計算した金額とする。');
    expect(p.markdown).not.toContain('第一項本文');
    const i = await ok({ law_name: '消費税法', article: '30', paragraph: 2, item: 2 });
    expect(i.markdown).toContain('次に掲げるもの');
    expect(i.markdown).not.toContain('区分が明らかにされている場合');
    expect(i.markdown).not.toContain('次の各号に定める方法により計算した金額とする。');
  });

  it('SPEC-EGOV-GET-LAW-011 item だけのとき、項が 1 つの条はその項の号を返す', async () => {
    const r = await ok({ law_name: '消費税法施行令', article: '14の3', item: 1 });
    expect(r.markdown).toContain('施行令第十四条の三第一号の本文');
    expect(r.markdown).not.toContain('施行令第十四条の三第二号の本文');
  });

  it('SPEC-EGOV-GET-LAW-011 item だけのとき、項が複数の条は INVALID_ARGUMENT', async () => {
    const e = await err({ law_name: '消費税法', article: '30', item: 1 });
    expect(e.code).toBe('INVALID_ARGUMENT');
  });

  it('SPEC-EGOV-GET-LAW-012 枝番号の号だけを返し、第8号の本文を含めない', async () => {
    const r = await ok({ law_name: '消費税法', article: '2', paragraph: 1, item: '8の2' });
    expect(r.markdown).toContain('特定資産の譲渡等');
    expect(r.markdown).not.toContain('事業として対価を得て行われる');
    const r8 = await ok({ law_name: '消費税法', article: '2', paragraph: 1, item: 8 });
    expect(r8.markdown).toContain('事業として対価を得て行われる');
    expect(r8.markdown).not.toContain('特定資産の譲渡等');
  });

  it('SPEC-EGOV-GET-LAW-013 条だけの見出しと、条の見出しの行', async () => {
    const r = await ok({ law_name: '消費税法', article: '30' });
    const ls = lines(r.markdown);
    expect(ls[0]).toBe('# 消費税法 第30条');
    expect(firstNonEmptyAfter(ls, 0)).toBe('（仕入れに係る消費税額の控除）');
    const s = await ok({ law_name: '租税特別措置法', article: '70の6' });
    expect(lines(s.markdown)[0]).toBe('# 租税特別措置法 第70条の6');
    expect(s.markdown).not.toContain('第70の6条');
  });

  it('SPEC-EGOV-GET-LAW-013 項まで・号までの見出し', async () => {
    const p = await ok({ law_name: '消費税法', article: '30', paragraph: 2 });
    expect(lines(p.markdown)[0]).toBe('# 消費税法 第30条第2項');
    const i = await ok({ law_name: '消費税法', article: '2', paragraph: 1, item: 8 });
    expect(lines(i.markdown)[0]).toBe('# 消費税法 第2条第1項第8号');
    const b = await ok({ law_name: '消費税法', article: '2', paragraph: 1, item: '8の2' });
    expect(lines(b.markdown)[0]).toBe('# 消費税法 第2条第1項第8号の2');
    expect(b.markdown).not.toContain('第8_2号');
  });

  it('SPEC-EGOV-GET-LAW-014 号の行は e-Gov の号の表記と本文、欄は全角空白で区切る', async () => {
    const r = await ok({ law_name: '消費税法', article: '2', paragraph: 1 });
    const ls = lines(r.markdown);
    expect(ls).toContain(
      '八 資産の譲渡等　事業として対価を得て行われる資産の譲渡及び貸付け並びに役務の提供をいう。'
    );
    expect(ls).toContain('八の二 特定資産の譲渡等　事業者向け電気通信利用役務の提供をいう。');
    expect(r.markdown).not.toContain('8_2');
  });

  it('SPEC-EGOV-GET-LAW-014 イロハの箇条書き・号の表記が無い号・列記の行', async () => {
    const r = await ok({ law_name: '消費税法', article: '30', paragraph: 2 });
    const ls = lines(r.markdown);
    expect(ls).toContain(
      '一 区分が明らかにされている場合　イに掲げる金額にロに掲げる金額を加算する方法'
    );
    expect(ls).toContain('- イ 課税資産の譲渡等にのみ要する税額の合計額');
    expect(ls).toContain('- ロ 共通して要する税額に課税売上割合を乗じた金額');
    expect(ls).toContain('  - （１） 深さ 2 の本文');
    expect(ls).toContain('3の2 号の表記の無い号の本文');
    expect(ls).toContain('二 次に掲げるもの');
    expect(ls).toContain('列記の甲');
  });

  it('SPEC-EGOV-GET-LAW-015 第2項以降の項には項番号の行を付ける', async () => {
    const r = await ok({ law_name: '消費税法', article: '30', paragraph: 2 });
    const ls = lines(r.markdown);
    const i = ls.indexOf('**第2項**');
    expect(i).toBeGreaterThan(0);
    expect(ls[i + 1]).toBe('次の各号に定める方法により計算した金額とする。');
    expect(ls[i + 2]).toBe(
      '一 区分が明らかにされている場合　イに掲げる金額にロに掲げる金額を加算する方法'
    );
  });

  it('SPEC-EGOV-GET-LAW-016 項の直下の見出し行の無い表を Markdown の表にする', async () => {
    const r = await ok({ law_name: '所得税法', article: '89', paragraph: 1 });
    expect(r.markdown).toContain(
      [
        '次の表の下欄に掲げる税率を乗じて計算する。',
        '',
        '|  |  |',
        '| --- | --- |',
        '| 百九十五万円以下の金額 | 百分の五 |',
        '| 四千万円を超える金額 | 百分の四十五 |',
        '',
      ].join('\n')
    );
  });

  it('SPEC-EGOV-GET-LAW-016 見出し行・表の題・備考、結合セルと | のエスケープ', async () => {
    const h = await ok({ law_name: '所得税法', article: '90', paragraph: 1 });
    const hl = lines(h.markdown);
    const title = hl.indexOf('別表');
    const header = hl.indexOf('| 区分 | 税率 |');
    const remarks = hl.indexOf('備考 この表は例示である。');
    expect(title).toBeGreaterThan(0);
    expect(header).toBeGreaterThan(title);
    expect(hl[header + 1]).toBe('| --- | --- |');
    expect(hl[header + 2]).toBe('| 甲 | 百分の五 |');
    expect(remarks).toBeGreaterThan(header);

    const m = await ok({ law_name: '所得税法', article: '90', paragraph: 2 });
    expect(m.markdown).toContain(
      ['|  |  |  |', '| --- | --- | --- |', '| A | B\\|C |  |', '|  | d | e |'].join('\n')
    );
  });

  it('SPEC-EGOV-GET-LAW-016 号・イロハの中の表は字下げし、前後に空行を入れる', async () => {
    const r = await ok({ law_name: '所得税法', article: '90', paragraph: 3 });
    expect(r.markdown).toContain(
      ['- イ 次の表のとおり', '', '  |  |  |', '  | --- | --- |', '  | 区分 | 税率 |', ''].join(
        '\n'
      )
    );
  });

  it('SPEC-EGOV-GET-LAW-017 article を省くと目次を返し、本則の階層と条を箇条書きにする', async () => {
    const r = await ok({ law_name: '租税特別措置法' });
    expect(r.format).toBe('toc');
    const ls = lines(r.markdown);
    const ch1 = ls.findIndex((l) => /^\s*- .*第一章　総則/.test(l));
    const a1 = ls.findIndex((l) => /^\s*- 第1条 （趣旨）$/.test(l));
    const ch2 = ls.findIndex((l) => /^\s*- .*第二章　相続税法の特例/.test(l));
    const a706 = ls.findIndex((l) =>
      /^\s*- 第70条の6 （農地等についての相続税の納税猶予等）$/.test(l)
    );
    expect(ch1).toBeGreaterThan(0);
    expect(a1).toBeGreaterThan(ch1);
    expect(ch2).toBeGreaterThan(a1);
    expect(a706).toBeGreaterThan(ch2);
    // 附則の条は本則に混ぜない
    expect(r.markdown).not.toContain('租特の附則の条の見出し');
    expect(r.markdown).not.toContain('第99条');
  });

  it('SPEC-EGOV-GET-LAW-017 format: "toc" でも目次を返す', async () => {
    const r = await ok({ law_name: '消費税法', format: 'toc' });
    expect(r.format).toBe('toc');
    expect(r.markdown).toMatch(/^\s*- 第30条の2 （第三十条の二の見出し）$/m);
  });

  it('SPEC-EGOV-GET-LAW-018 目次の附則は本則と節を分け、1 本 1 行の見出しだけを返す', async () => {
    const r = await ok({ law_name: '消費税法' });
    const ls = lines(r.markdown);
    const main = ls.indexOf('## 本則');
    const suppl = ls.indexOf('## 附則（3 本・条 3 件）');
    expect(main).toBeGreaterThan(0);
    expect(suppl).toBeGreaterThan(main);
    const after = ls.slice(suppl + 1);
    expect(after).toContain('- 附則(1) 制定時（抄） — 条 2 件');
    expect(
      after.some((l) =>
        /^- 附則\(2\) 平成元年六月二八日法律第三九号（抄） — 条 1 件( ／ 改正法: .+)?$/.test(l)
      )
    ).toBe(true);
    expect(after).toContain('- 附則(3) 平成二年六月二二日法律第三六号 — 項のみ');
    // 附則の中の条は載せない
    expect(r.markdown).not.toContain('施行期日の附則見出し');
    expect(r.markdown).not.toContain('経過措置の附則見出し');
  });

  it('SPEC-EGOV-GET-LAW-018 附則が無い法令では本則・附則の見出しを付けない', async () => {
    const r = await ok({ law_name: '所得税法' });
    expect(r.format).toBe('toc');
    expect(r.markdown).not.toContain('## 本則');
    expect(r.markdown).not.toContain('## 附則');
  });
});

// ========================================================
// ADDED: SPEC-EGOV-GET-LAW-019〜035
// ========================================================

describe('get_law — 応答の外形と meta', () => {
  it('SPEC-EGOV-GET-LAW-019 format ごとの応答の外形', async () => {
    const md = await ok({ law_name: '消費税法', article: '30' });
    expect(Object.keys(md).sort()).toEqual(['format', 'markdown', 'meta']);
    expect(md.format).toBe('markdown');
    expect(typeof md.markdown).toBe('string');

    const explicit = await ok({ law_name: '消費税法', article: '30', format: 'markdown' });
    expect(Object.keys(explicit).sort()).toEqual(['format', 'markdown', 'meta']);
    expect(explicit.format).toBe('markdown');

    const toc = await ok({ law_name: '消費税法' });
    expect(Object.keys(toc).sort()).toEqual(['format', 'markdown', 'meta']);
    expect(toc.format).toBe('toc');

    const js = await ok({ law_name: '消費税法', article: '2', format: 'json' });
    expect(Object.keys(js).sort()).toEqual(['data', 'format', 'meta']);
    expect(js.format).toBe('json');
    expect(js).not.toHaveProperty('markdown');
  });

  it('SPEC-EGOV-GET-LAW-020 meta に法令の識別情報・取得日時・URL が入り、at を渡さなければ at は無い', async () => {
    const r = await ok({ law_name: '消費税法', article: '30' });
    expect(r.meta.law_id).toBe(SHOHI_ID);
    expect(r.meta.title).toBe('消費税法');
    expect(r.meta.law_num).toBe(SHOHI_NUM);
    expect(r.meta.retrieved_at).toMatch(ISO_UTC);
    expect(r.meta.url).toBe('https://laws.e-gov.go.jp/law/363AC0000000108');
    expect(r.meta).not.toHaveProperty('at');

    const toc = await ok({ law_name: '消費税法' });
    expect(toc.meta.law_id).toBe(SHOHI_ID);
    expect(toc.meta.title).toBe('消費税法');
    expect(toc.meta.law_num).toBe(SHOHI_NUM);
    expect(toc.meta.retrieved_at).toMatch(ISO_UTC);
    expect(toc.meta.url).toBe('https://laws.e-gov.go.jp/law/363AC0000000108');
  });

  it('SPEC-EGOV-GET-LAW-020 条文を返すとき at を渡すと meta.at に入る（markdown・json）', async () => {
    const md = await ok({ law_name: '消費税法', article: '30', at: '2020-04-01' });
    expect(md.meta.at).toBe('2020-04-01');
    const js = await ok({ law_name: '消費税法', article: '30', format: 'json', at: '2020-04-01' });
    expect(js.meta.at).toBe('2020-04-01');
  });
});

describe('get_law — markdown と目次の末尾', () => {
  it('SPEC-EGOV-GET-LAW-021 at を渡すと、本文の後に空行・出典・URL・時点・取得日時の行を置く', async () => {
    const r = await ok({ law_name: '消費税法', article: '30', paragraph: 1, at: '2020-04-01' });
    const ls = lines(r.markdown.replace(/\n+$/, ''));
    const tail = ls.slice(-5);
    expect(tail).toEqual([
      '---',
      '出典：e-Gov法令検索（デジタル庁）',
      `URL: ${r.meta.url}`,
      '時点: 2020-04-01',
      `取得日時: ${r.meta.retrieved_at}`,
    ]);
    expect(r.meta.url).toBe('https://laws.e-gov.go.jp/law/363AC0000000108');
    expect(ls[ls.length - 6]).toBe('');
    expect(ls[ls.length - 7]).toContain('第一項本文');
  });

  it('SPEC-EGOV-GET-LAW-021 at を渡さないときは 時点: の行が無い', async () => {
    const r = await ok({ law_name: '消費税法', article: '30', paragraph: 1 });
    const ls = lines(r.markdown.replace(/\n+$/, ''));
    expect(ls.slice(-4)).toEqual([
      '---',
      '出典：e-Gov法令検索（デジタル庁）',
      `URL: ${r.meta.url}`,
      `取得日時: ${r.meta.retrieved_at}`,
    ]);
    expect(ls[ls.length - 5]).toBe('');
    expect(r.markdown).not.toContain('時点:');
  });

  it('SPEC-EGOV-GET-LAW-022 目次の 1 行目は「<法令名> — 目次」、末尾は条文と同じ行', async () => {
    const r = await ok({ law_name: '消費税法' });
    const ls = lines(r.markdown.replace(/\n+$/, ''));
    expect(ls[0]).toBe('# 消費税法 — 目次');
    expect(ls.slice(-4)).toEqual([
      '---',
      '出典：e-Gov法令検索（デジタル庁）',
      'URL: https://laws.e-gov.go.jp/law/363AC0000000108',
      `取得日時: ${r.meta.retrieved_at}`,
    ]);
    expect(r.markdown).not.toContain('時点:');
  });

  it('SPEC-EGOV-GET-LAW-022 目次で at を渡すと 時点: の行がある', async () => {
    const r = await ok({ law_name: '消費税法', format: 'toc', at: '2020-04-01' });
    const ls = lines(r.markdown.replace(/\n+$/, ''));
    expect(ls[0]).toBe('# 消費税法 — 目次');
    expect(ls).toContain('時点: 2020-04-01');
    expect(ls.slice(-5)).toEqual([
      '---',
      '出典：e-Gov法令検索（デジタル庁）',
      'URL: https://laws.e-gov.go.jp/law/363AC0000000108',
      '時点: 2020-04-01',
      `取得日時: ${r.meta.retrieved_at}`,
    ]);
  });
});

describe('get_law — json の応答', () => {
  it('SPEC-EGOV-GET-LAW-023 article だけのとき data.node は条、article_num は e-Gov 形式', async () => {
    const r = await ok({ law_name: '消費税法', article: '第三十条の二', format: 'json' });
    expect(r.data.article_num).toBe('30_2');
    expect(r.data.node.tag).toBe('Article');
    expect(r.data.node.attr.Num).toBe('30_2');
    expect(Array.isArray(r.data.node.children)).toBe(true);
  });

  it.each(['30の2', '第30条の2', '三十の二', '第３０条の２'])(
    'SPEC-EGOV-GET-LAW-023 article %j でも article_num は 30_2',
    async (articleArg) => {
      const r = await ok({ law_name: '消費税法', article: articleArg, format: 'json' });
      expect(r.data.article_num).toBe('30_2');
    }
  );

  it('SPEC-EGOV-GET-LAW-023 paragraph だけのとき data.node は項、item まで指定すると号', async () => {
    const p = await ok({ law_name: '消費税法', article: '30', paragraph: 2, format: 'json' });
    expect(p.data.article_num).toBe('30');
    expect(p.data.node.tag).toBe('Paragraph');
    expect(p.data.node.attr.Num).toBe('2');
    const i = await ok({
      law_name: '消費税法',
      article: '2',
      paragraph: 1,
      item: 8,
      format: 'json',
    });
    expect(i.data.node.tag).toBe('Item');
    expect(i.data.node.attr.Num).toBe('8');
  });

  it('SPEC-EGOV-GET-LAW-024 paragraph_num と item_num は渡した値をそのまま返す', async () => {
    const r = await ok({
      law_name: '消費税法',
      article: '2',
      paragraph: 1,
      item: '八',
      format: 'json',
    });
    expect(r.data.paragraph_num).toBe(1);
    expect(r.data.item_num).toBe('八');
    const b = await ok({
      law_name: '消費税法',
      article: '2',
      paragraph: 1,
      item: '第8号の2',
      format: 'json',
    });
    expect(b.data.item_num).toBe('第8号の2');
    const n = await ok({
      law_name: '消費税法',
      article: '2',
      paragraph: 1,
      item: 8,
      format: 'json',
    });
    expect(n.data.item_num).toBe(8);
  });

  it('SPEC-EGOV-GET-LAW-024 paragraph・item を渡さないときはキーが無い', async () => {
    const r = await ok({ law_name: '消費税法', article: '2', format: 'json' });
    expect(r.data).not.toHaveProperty('paragraph_num');
    expect(r.data).not.toHaveProperty('item_num');
    const p = await ok({ law_name: '消費税法', article: '2', paragraph: 1, format: 'json' });
    expect(p.data.paragraph_num).toBe(1);
    expect(p.data).not.toHaveProperty('item_num');
  });

  it('SPEC-EGOV-GET-LAW-025 format: json で article を省くと INVALID_ARGUMENT と目次の案内', async () => {
    const e = await err({ law_name: '消費税法', format: 'json' });
    expect(e.code).toBe('INVALID_ARGUMENT');
    expect(e.hint).toContain('format: "toc"');
    expect(e.hint).toContain('get_toc');
    expect(e.next_actions).toContainEqual(
      expect.objectContaining({ action: 'get_toc', example: { law_name: '消費税法' } })
    );
    expect(e).not.toHaveProperty('markdown');
    expect(e).not.toHaveProperty('data');
  });
});

describe('get_law — エラー', () => {
  it('SPEC-EGOV-GET-LAW-026 法令が特定できないときは LAW_NOT_FOUND と略称確認・検索の案内', async () => {
    const e = await err({ law_name: 'ほげほげ法', article: '1' });
    expect(e.code).toBe('LAW_NOT_FOUND');
    expect(e.error).toContain('ほげほげ法');
    expect(e.next_actions).toHaveLength(2);
    expect(e.next_actions?.[0]).toMatchObject({
      action: 'resolve_abbreviation',
      example: { abbr: 'ほげほげ法' },
    });
    expect(e.next_actions?.[1]).toMatchObject({
      action: 'search_law',
      example: { keyword: 'ほげほげ法' },
    });
    for (const a of e.next_actions ?? []) expect(typeof a.reason).toBe('string');
    expect(state.lawDataUrls).toEqual([]);
  });

  it('SPEC-EGOV-GET-LAW-027 存在しない項は ARTICLE_NOT_FOUND と項番号 1 始まりの案内', async () => {
    const e = await err({ law_name: '消費税法', article: '30', paragraph: 3 });
    expect(e.code).toBe('ARTICLE_NOT_FOUND');
    expect(e.error).toBe('項が見つかりません: 第30条第3項');
    expect(e.hint).toContain('1 始まり');
    expect(e.hint).toContain('paragraph');
  });

  it('SPEC-EGOV-GET-LAW-028 e-Gov が 429 を返し続けると SOURCE_RATE_LIMITED', async () => {
    state.lawDataMode = { kind: 'status', status: 429 };
    const e = await errWithTimers({ law_name: '消費税法', article: '30' }, 10_000);
    expect(e.code).toBe('SOURCE_RATE_LIMITED');
    expect(e.retryable).toBe(true);
    expect(e.detail?.status).toBe(429);
    expect(e.next_actions?.map((a) => a.action)).toContain('retry_later');
  });

  it('SPEC-EGOV-GET-LAW-029 e-Gov の応答が時間切れのときは SOURCE_TIMEOUT', async () => {
    state.lawDataMode = { kind: 'timeout' };
    const e = await errWithTimers({ law_name: '消費税法', article: '30' }, 40_000);
    expect(e.code).toBe('SOURCE_TIMEOUT');
    expect(e.retryable).toBe(true);
    const actions = e.next_actions ?? [];
    const retry = actions.findIndex((a) => a.action === 'retry_later');
    const visit = actions.findIndex((a) => a.action === 'visit_egov_site');
    expect(retry).toBeGreaterThanOrEqual(0);
    expect(visit).toBeGreaterThan(retry);
    expect(actions[visit].example).toEqual({ url: 'https://laws.e-gov.go.jp/' });
  });

  it('SPEC-EGOV-GET-LAW-030 e-Gov が 5xx を返し続けると再試行できる SOURCE_API_ERROR', async () => {
    state.lawDataMode = { kind: 'status', status: 503 };
    const e = await errWithTimers({ law_name: '消費税法', article: '30' }, 10_000);
    expect(e.code).toBe('SOURCE_API_ERROR');
    expect(e.retryable).toBe(true);
    expect(e.detail?.status).toBe(503);
    expect(e.error).toContain('503');
    const actions = (e.next_actions ?? []).map((a) => a.action);
    expect(actions).toContain('retry_later');
    expect(actions).toContain('visit_egov_site');
  });

  it('SPEC-EGOV-GET-LAW-031 e-Gov が 429 以外の 4xx を返すと再試行できない SOURCE_API_ERROR', async () => {
    state.lawDataMode = { kind: 'status', status: 404 };
    const e = await err({ law_name: '消費税法', article: '30' });
    expect(e.code).toBe('SOURCE_API_ERROR');
    expect(e.retryable).toBe(false);
    expect(e.detail?.status).toBe(404);
  });

  it('SPEC-EGOV-GET-LAW-032 OUT_OF_SCOPE は正式名称と管轄を書き、delegate_to_mcp を案内する', async () => {
    const e = await err({ law_name: '消基通', article: '1' });
    expect(e.code).toBe('OUT_OF_SCOPE');
    expect(e.error).toContain('消費税法基本通達');
    expect(e.error).toContain('houki-nta');
    expect(e.next_actions).toHaveLength(1);
    expect(e.next_actions?.[0]).toMatchObject({
      action: 'delegate_to_mcp',
      example: { mcp: 'houki-nta' },
    });
    expect(typeof e.next_actions?.[0].reason).toBe('string');
    expect(state.lawDataUrls).toEqual([]);
  });
});

describe('get_law — toc と at', () => {
  it('SPEC-EGOV-GET-LAW-033 format: toc では article を使わず、無い条でもエラーにしない', async () => {
    const r = await ok({ law_name: '消費税法', format: 'toc', article: '999' });
    expect(r.format).toBe('toc');
    expect(lines(r.markdown)[0]).toBe('# 消費税法 — 目次');
  });

  it('SPEC-EGOV-GET-LAW-033 format: toc では条番号として読めない article・paragraph・item も使わない', async () => {
    const r = await ok({
      law_name: '消費税法',
      format: 'toc',
      article: '30-2',
      paragraph: 99,
      item: '八八',
    });
    expect(r.format).toBe('toc');
    expect(lines(r.markdown)[0]).toBe('# 消費税法 — 目次');
  });

  it('SPEC-EGOV-GET-LAW-034 at を渡すと asof=<at> を付けて本文を取り、その本文を返す', async () => {
    const r = await ok({ law_name: '消費税法', article: '30', paragraph: 1, at: '2020-04-01' });
    expect(state.lawDataUrls).toEqual([
      'https://laws.e-gov.go.jp/api/2/law_data/363AC0000000108?asof=2020-04-01',
    ]);
    expect(r.markdown).toContain('第一項本文（2020-04-01時点）');
  });

  it('SPEC-EGOV-GET-LAW-034 at を渡さないときは asof を付けない', async () => {
    await ok({ law_name: '消費税法', article: '30', paragraph: 1 });
    expect(state.lawDataUrls).toEqual(['https://laws.e-gov.go.jp/api/2/law_data/363AC0000000108']);
  });

  it('SPEC-EGOV-GET-LAW-035 at が違えば同じ法令でも別の本文として取る', async () => {
    const a = await ok({ law_name: '消費税法', article: '30', paragraph: 1, at: '2020-04-01' });
    const b = await ok({ law_name: '消費税法', article: '30', paragraph: 1, at: '2024-04-01' });
    const c = await ok({ law_name: '消費税法', article: '30', paragraph: 1 });
    expect(state.lawDataUrls).toEqual([
      'https://laws.e-gov.go.jp/api/2/law_data/363AC0000000108?asof=2020-04-01',
      'https://laws.e-gov.go.jp/api/2/law_data/363AC0000000108?asof=2024-04-01',
      'https://laws.e-gov.go.jp/api/2/law_data/363AC0000000108',
    ]);
    expect(a.markdown).toContain('第一項本文（2020-04-01時点）');
    expect(b.markdown).toContain('第一項本文（2024-04-01時点）');
    expect(c.markdown).toContain('第一項本文（現行）');
    expect(c.markdown).not.toContain('時点）');
  });
});
