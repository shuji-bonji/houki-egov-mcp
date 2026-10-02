/**
 * 受入テスト用の MCP サーバーの起動と、e-Gov への通信の差し替え。
 *
 * createServer() を InMemoryTransport で in-process 起動し、tools/call の応答を JSON で返す。
 * e-Gov への通信は fetch を差し替えて、テストごとの route 関数で返す（route が無ければ失敗させる）。
 * 呼ばれた URL は `urls()` で取れるので、「e-Gov への問い合わせは 0 回」を確かめられる。
 *
 * tsconfig の exclude 対象（dist には含めない）。
 */

import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { vi } from 'vitest';
import { createServer } from '../server.js';
import { _resetCachesForTest } from '../services/law-service.js';

// biome-ignore lint/suspicious/noExplicitAny: 応答の形をテストで自由に辿るため
export type AnyObj = Record<string, any>;

/** e-Gov への要求 1 件に応答を返す関数。null を返すと「呼ばれてはいけない」として失敗させる */
export type Route = (url: URL) => Response | Promise<Response> | null;

export interface Harness {
  call(
    name: string,
    args?: Record<string, unknown>
  ): Promise<{ isError: boolean; text: string; body: AnyObj }>;
  /** fetch に渡された URL の一覧 */
  urls(): URL[];
  /** 応答を返す関数を差し替える */
  setRoute(route: Route | undefined): void;
  close(): Promise<void>;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export async function startHarness(initial?: Route): Promise<Harness> {
  let route = initial;
  const calls: URL[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url
    );
    calls.push(url);
    const res = route ? await route(url) : null;
    if (!res) throw new Error(`e-Gov にアクセスしてはいけません: ${url.toString()}`);
    return res;
  });
  vi.stubGlobal('fetch', fetchMock);
  _resetCachesForTest();

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  const client = new Client({ name: 'houki-egov-spec-test', version: '0.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    async call(name, args) {
      const res =
        args === undefined
          ? await client.callTool({ name })
          : await client.callTool({ name, arguments: args });
      const content = res.content as Array<{ type: string; text: string }>;
      const text = content[0].text;
      let body: AnyObj;
      try {
        body = JSON.parse(text) as AnyObj;
      } catch {
        body = { __text: text };
      }
      return { isError: res.isError === true, text, body };
    },
    urls: () => [...calls],
    setRoute(r) {
      route = r;
    },
    async close() {
      await client.close();
      vi.unstubAllGlobals();
    },
  };
}

// ---------- e-Gov の応答のフィクスチャ（必要な項目だけ） ----------

export interface LawFixture {
  law_id: string;
  title: string;
  law_num: string;
  law_type?: string;
  law_revision_id?: string;
}

/** /laws の 1 件 */
export function lawListItem(f: LawFixture): AnyObj {
  return {
    law_info: {
      law_id: f.law_id,
      law_type: f.law_type ?? 'Act',
      law_num: f.law_num,
      promulgation_date: '2000-01-01',
    },
    revision_info: {
      law_revision_id: f.law_revision_id ?? `${f.law_id}_20240401_000000000000000`,
      law_title: f.title,
    },
  };
}

/** /laws の応答 */
export function lawsResponse(items: LawFixture[]): Response {
  return json({
    total_count: items.length,
    count: items.length,
    laws: items.map(lawListItem),
  });
}

/** 条 1 つ（項 n 個）の法令本文 */
export function simpleLawTree(title: string, articleNum = '1', paragraphs = 1): AnyObj {
  const paras = Array.from({ length: paragraphs }, (_, i) => ({
    tag: 'Paragraph',
    attr: { Num: String(i + 1) },
    children: [
      { tag: 'ParagraphNum', attr: {}, children: [] },
      {
        tag: 'ParagraphSentence',
        attr: {},
        children: [{ tag: 'Sentence', attr: { Num: '1' }, children: [`第${i + 1}項の本文`] }],
      },
    ],
  }));
  return {
    tag: 'Law',
    attr: {},
    children: [
      {
        tag: 'LawBody',
        attr: {},
        children: [
          { tag: 'LawTitle', attr: {}, children: [title] },
          {
            tag: 'MainProvision',
            attr: {},
            children: [
              {
                tag: 'Chapter',
                attr: { Num: '1' },
                children: [
                  { tag: 'ChapterTitle', attr: {}, children: ['第一章　総則'] },
                  {
                    tag: 'Article',
                    attr: { Num: articleNum },
                    children: [
                      { tag: 'ArticleTitle', attr: {}, children: [`第${articleNum}条`] },
                      ...paras,
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

/** /law_data の応答 */
export function lawDataResponse(
  f: LawFixture,
  tree: AnyObj = simpleLawTree(f.title),
  attachedSrcs: string[] = []
): Response {
  const revisionId = f.law_revision_id ?? `${f.law_id}_20240401_000000000000000`;
  return json({
    law_info: { law_id: f.law_id, law_type: f.law_type ?? 'Act', law_num: f.law_num },
    revision_info: { law_revision_id: revisionId, law_title: f.title },
    law_full_text: tree,
    ...(attachedSrcs.length > 0
      ? {
          attached_files_info: {
            attached_files: attachedSrcs.map((src) => ({ law_revision_id: revisionId, src })),
          },
        }
      : {}),
  });
}

export const MINPO: LawFixture = {
  law_id: '129AC0000000089',
  title: '民法',
  law_num: '明治二十九年法律第八十九号',
};
export const SHOTOKU: LawFixture = {
  law_id: '340AC0000000033',
  title: '所得税法',
  law_num: '昭和四十年法律第三十三号',
};
export const SHOHI: LawFixture = {
  law_id: '363AC0000000108',
  title: '消費税法',
  law_num: '昭和六十三年法律第百八号',
};

// ---------- 引数の検査（T1）の共通の確かめ方 ----------

/**
 * 必須の文字列 `field` に空文字・空白だけを渡すと、e-Gov に問い合わせずに INVALID_ARGUMENT になることを確かめる。
 * 空文字は inputSchema の検査（SPEC-EGOV-COMMON-ERRORS-025）、空白だけはツールの処理（026）。
 * `set` は引数の組み立て方（入れ子の citations[].article などのため）。
 */
export async function expectEmptyAndBlank(
  h: Harness,
  tool: string,
  set: (value: string) => Record<string, unknown>,
  path: string,
  errorName: string = path
): Promise<void> {
  const before = h.urls().length;
  const empty = await h.call(tool, set(''));
  if (!empty.isError) throw new Error(`${tool}: 空文字が通った`);
  const expectEq = (actual: unknown, expected: unknown, label: string) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `${tool} ${label}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`
      );
    }
  };
  expectEq(empty.body.code, 'INVALID_ARGUMENT', 'empty.code');
  expectEq(empty.body.tool, tool, 'empty.tool');
  expectEq(
    empty.body.detail?.issues,
    [{ path, message: '空文字は指定できません' }],
    'empty.issues'
  );
  for (const blank of ['　', ' \n', '  ', '\t']) {
    const r = await h.call(tool, set(blank));
    expectEq(r.isError, true, `blank(${JSON.stringify(blank)}).isError`);
    expectEq(r.body.code, 'INVALID_ARGUMENT', `blank(${JSON.stringify(blank)}).code`);
    expectEq(r.body.tool, tool, `blank(${JSON.stringify(blank)}).tool`);
    expectEq(r.body.error, `${errorName} が空です`, `blank(${JSON.stringify(blank)}).error`);
    expectEq(
      r.body.detail?.issues,
      [{ path, message: '空白だけは指定できません' }],
      `blank(${JSON.stringify(blank)}).issues`
    );
    if (typeof r.body.hint !== 'string' || r.body.hint === '') {
      throw new Error(`${tool}: 空白だけのときの hint が無い`);
    }
  }
  expectEq(h.urls().length - before, 0, 'e-Gov への問い合わせの回数');
}

/**
 * `at` に形の違う値と暦に無い日付を渡すと、e-Gov に問い合わせずに INVALID_ARGUMENT になることを確かめる
 * （SPEC-EGOV-COMMON-ERRORS-024）。
 */
export async function expectAtGuard(
  h: Harness,
  tool: string,
  base: Record<string, unknown>
): Promise<void> {
  const before = h.urls().length;
  for (const at of ['2024/04/01', '20240401', '2024-4-1']) {
    const r = await h.call(tool, { ...base, at });
    if (r.body.code !== 'INVALID_ARGUMENT' || r.body.tool !== tool) {
      throw new Error(`${tool} at=${at}: ${r.text}`);
    }
    const issues = JSON.stringify(r.body.detail?.issues);
    if (issues !== JSON.stringify([{ path: 'at', message: 'YYYY-MM-DD の形で指定してください' }])) {
      throw new Error(`${tool} at=${at}: issues ${issues}`);
    }
  }
  const r = await h.call(tool, { ...base, at: '2026-02-30' });
  if (r.body.code !== 'INVALID_ARGUMENT' || r.body.tool !== tool) {
    throw new Error(`${tool} at=2026-02-30: ${r.text}`);
  }
  const issues = JSON.stringify(r.body.detail?.issues);
  if (issues !== JSON.stringify([{ path: 'at', message: '暦に無い日付です' }])) {
    throw new Error(`${tool} at=2026-02-30: issues ${issues}`);
  }
  if (h.urls().length !== before) throw new Error(`${tool}: e-Gov に問い合わせた`);
}
