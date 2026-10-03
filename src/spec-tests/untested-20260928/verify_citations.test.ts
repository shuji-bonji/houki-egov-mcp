/**
 * 差分 20260928-untested-behaviors の verify_citations（SPEC-EGOV-VERIFY-CITATIONS-020〜039）の受入テスト。
 * e-Gov への通信は fetch を差し替えて、このテスト用に組んだ法令の木を返す。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LawNode } from '../../services/egov-client.js';

// ---------- 法令の木 ----------

const sentence = (s: string): LawNode => ({ tag: 'Sentence', attr: {}, children: [s] });
const paragraphNode = (num: string, text: string, items: LawNode[] = []): LawNode => ({
  tag: 'Paragraph',
  attr: { Num: num },
  children: [{ tag: 'ParagraphSentence', attr: {}, children: [sentence(text)] }, ...items],
});
const itemNode = (num: string, text: string): LawNode => ({
  tag: 'Item',
  attr: { Num: num },
  children: [
    { tag: 'ItemTitle', attr: {}, children: [num] },
    { tag: 'ItemSentence', attr: {}, children: [sentence(text)] },
  ],
});
const articleNode = (
  num: string,
  title: string,
  paragraphs: LawNode[],
  caption?: string
): LawNode => ({
  tag: 'Article',
  attr: { Num: num },
  children: [
    ...(caption ? [{ tag: 'ArticleCaption', attr: {}, children: [caption] }] : []),
    { tag: 'ArticleTitle', attr: {}, children: [title] },
    ...paragraphs,
  ],
});
const lawTree = (articles: LawNode[]): LawNode => ({
  tag: 'Law',
  attr: {},
  children: [{ tag: 'MainProvision', attr: {}, children: articles }],
});

/** 項が 1 つだけで号が 2 つ */
const ART_9 = articleNode(
  '9',
  '第九条',
  [
    paragraphNode('1', '次に掲げる所得については、所得税を課さない。', [
      itemNode('1', '当座預金の利子'),
      itemNode('2', '学資金'),
    ]),
  ],
  '（非課税所得）'
);
const ART_30 = articleNode('30', '第三十条', [paragraphNode('1', '退職所得とは')], '（退職所得）');
const ART_30_2 = articleNode('30_2', '第三十条の二', [paragraphNode('1', '第三十条の二の本文')]);
/** 項が 2 つ。第 2 項に号が 2 つ */
const ART_57_2 = articleNode(
  '57_2',
  '第五十七条の二',
  [
    paragraphNode('1', '第一項の本文'),
    paragraphNode('2', '特定支出とは、次に掲げる支出をいう。', [
      itemNode('1', '通勤のための支出'),
      itemNode('2', '転居のための支出'),
    ]),
  ],
  '（給与所得者の特定支出の控除の特例）'
);
const ART_1 = articleNode('1', '第一条', [paragraphNode('1', 'この法律は')], '（趣旨）');
const ART_534_535 = articleNode('534:535', '第五百三十四条及び第五百三十五条', [
  paragraphNode('1', '削除'),
]);

interface LawDef {
  law_id: string;
  title: string;
  law_type: string;
  law_num: string;
  tree: LawNode;
  /** asof を付けて問い合わせたときの木（時点ごと） */
  treeAt?: Record<string, LawNode>;
}

const SHOTOKU: LawDef = {
  law_id: '340AC0000000033',
  title: '所得税法',
  law_type: 'Act',
  law_num: '昭和四十年法律第三十三号',
  tree: lawTree([ART_9, ART_30, ART_30_2, ART_57_2]),
  treeAt: { '2000-01-01': lawTree([ART_9, ART_30]) },
};
const SHOTOKU_REI: LawDef = {
  law_id: '340CO0000000096',
  title: '所得税法施行令',
  law_type: 'CabinetOrder',
  law_num: '昭和四十年政令第九十六号',
  tree: lawTree([ART_1]),
};
const SHOTOKU_KISOKU: LawDef = {
  law_id: '340M50000040011',
  title: '所得税法施行規則',
  law_type: 'MinisterialOrdinance',
  law_num: '昭和四十年大蔵省令第十一号',
  tree: lawTree([ART_1]),
};
const DENCHO: LawDef = {
  law_id: '410AC0000000025',
  title: '電子計算機を使用して作成する国税関係帳簿書類の保存方法等の特例に関する法律',
  law_type: 'Act',
  law_num: '平成十年法律第二十五号',
  tree: lawTree([ART_1]),
};
const MINPO: LawDef = {
  law_id: '129AC0000000089',
  title: '民法',
  law_type: 'Act',
  law_num: '明治二十九年法律第八十九号',
  tree: lawTree([ART_1, ART_534_535]),
};
const TEST_LAWS: LawDef[] = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  law_id: `499AC000000010${n}`,
  title: `検証用テスト法第${n}`,
  law_type: 'Act',
  law_num: `平成十一年法律第百${n}号`,
  tree: lawTree([ART_1]),
}));

const LAWS: LawDef[] = [SHOTOKU, SHOTOKU_REI, SHOTOKU_KISOKU, DENCHO, MINPO, ...TEST_LAWS];

// ---------- fetch の差し替え ----------

type Override = (url: URL, init?: RequestInit) => Promise<Response> | undefined;

/** 問い合わせた URL の記録 */
const fetchCalls: URL[] = [];
/** テストごとの差し替え（undefined を返すと既定の応答） */
let override: Override | undefined;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function listItem(l: LawDef) {
  return {
    law_info: { law_id: l.law_id, law_type: l.law_type, law_num: l.law_num },
    revision_info: { law_title: l.title },
  };
}

function defaultResponse(url: URL): Response {
  const path = url.pathname;
  if (path.endsWith('/laws')) {
    const title = url.searchParams.get('law_title');
    const num = url.searchParams.get('law_num');
    const hits = LAWS.filter(
      (l) => (title ? l.title.includes(title) : true) && (num ? l.law_num === num : true)
    ).filter(() => Boolean(title || num));
    return json({ total_count: hits.length, count: hits.length, laws: hits.map(listItem) });
  }
  const m = path.match(/\/law_data\/([^/]+)$/);
  if (m) {
    const law = LAWS.find((l) => l.law_id === decodeURIComponent(m[1]));
    // e-Gov は law_id の無い法令本文を 404・404004 で返す（2026-10-03 JST に確かめた値。SPEC-EGOV-VERIFY-CITATIONS-015）
    if (!law) {
      return json(
        { code: '404004', message: '指定のパラメータで取得できる法令本文ファイルは存在しません。' },
        404
      );
    }
    const asof = url.searchParams.get('asof');
    const tree = asof && law.treeAt?.[asof] ? law.treeAt[asof] : law.tree;
    return json({
      law_info: { law_id: law.law_id, law_type: law.law_type, law_num: law.law_num },
      revision_info: { law_title: law.title },
      law_full_text: tree,
    });
  }
  return json({ code: '404000', message: 'Not Found' }, 404);
}

const fetchStub = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  );
  fetchCalls.push(url);
  const o = override?.(url, init);
  if (o) return o;
  return defaultResponse(url);
});

vi.stubGlobal('fetch', fetchStub);

const { _resetCachesForTest, isError, verifyCitations } = await import(
  '../../services/law-service.js'
);

type Args = Parameters<typeof verifyCitations>[0];

async function ok(args: Args) {
  const res = await verifyCitations(args);
  if (isError(res)) throw new Error(`ツール全体がエラーになった: ${res.code} ${res.error}`);
  return res;
}

const lawDataCalls = (lawId: string) =>
  fetchCalls.filter((u) => u.pathname.endsWith(`/law_data/${lawId}`));
const titleSearches = (title: string) =>
  fetchCalls.filter(
    (u) => u.pathname.endsWith('/laws') && u.searchParams.get('law_title') === title
  );

beforeEach(() => {
  _resetCachesForTest();
  fetchCalls.length = 0;
  override = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------- note と meta ----------

describe('応答の note と meta', () => {
  it('SPEC-EGOV-VERIFY-CITATIONS-020 note に判定の範囲の 3 つを書き、判定の内訳によらず同じ文である', async () => {
    const allFound = await ok({ citations: [{ law_name: '所得税法', article: '9' }] });
    const mixed = await ok({
      citations: [
        { law_name: '架空法', article: '1' },
        { law_name: '所得税法施行', article: '1' },
        { law_name: '所得税法', article: '9999' },
      ],
    });
    expect(typeof allFound.note).toBe('string');
    expect(allFound.note).toContain('主張を支えるかどうかは判定していません');
    expect(allFound.note).toContain('最大 5 件');
    expect(allFound.note).toContain('code は付きません');
    expect(allFound.note).toContain('SOURCE_*');
    expect(mixed.note).toBe(allFound.note);
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-021 meta に retrieved_at（ISO 8601 UTC）と at を付け、at を渡さないときは at: null', async () => {
    const withAt = await ok({
      citations: [{ law_name: '所得税法', article: '9' }],
      at: '2024-04-01',
    });
    expect(withAt.meta).toEqual({ retrieved_at: expect.any(String), at: '2024-04-01' });
    expect(withAt.meta.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
    expect(new Date(withAt.meta.retrieved_at).toISOString()).toBe(withAt.meta.retrieved_at);

    const withoutAt = await ok({ citations: [{ law_name: '所得税法', article: '9' }] });
    expect(Object.keys(withoutAt.meta)).toEqual(['retrieved_at', 'at']);
    expect(withoutAt.meta.at).toBeNull();
    expect(withoutAt.meta.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
  });
});

// ---------- at ----------

describe('at を渡したとき', () => {
  it('SPEC-EGOV-VERIFY-CITATIONS-022 at の時点の本文で条を確かめ、省くと現在の本文で確かめる', async () => {
    const res = await ok({
      citations: [
        { law_name: '所得税法', article: '57の2' },
        { law_name: '所得税法', article: '9' },
      ],
      at: '2000-01-01',
    });
    const [first, second] = res.results;
    expect(first.status).toBe('not_found');
    expect(first.code).toBe('ARTICLE_NOT_FOUND');
    expect(first.reason).toBe('所得税法に第57条の2はありません');
    expect(second.status).toBe('found');
    const bodies = lawDataCalls('340AC0000000033');
    expect(bodies.length).toBeGreaterThan(0);
    for (const u of bodies) expect(u.searchParams.get('asof')).toBe('2000-01-01');

    _resetCachesForTest();
    fetchCalls.length = 0;
    const now = await ok({ citations: [{ law_name: '所得税法', article: '57の2' }] });
    expect(now.results[0].status).toBe('found');
    for (const u of lawDataCalls('340AC0000000033')) expect(u.searchParams.has('asof')).toBe(false);
  });
});

// ---------- 号 ----------

describe('号が無い件・号番号が読めない件', () => {
  it('SPEC-EGOV-VERIFY-CITATIONS-023 号が無い件は ARTICLE_NOT_FOUND で article と paragraph を残す', async () => {
    const res = await ok({
      citations: [
        { law_name: '所得税法', article: '57の2', paragraph: 2, item: 3 },
        { law_name: '所得税法', article: '9', item: 5 },
      ],
    });
    const [a, b] = res.results;
    expect(a.status).toBe('not_found');
    expect(a.code).toBe('ARTICLE_NOT_FOUND');
    expect(a.article?.num).toBe('57_2');
    expect(a.paragraph).toBe(2);
    expect(a.item).toBeUndefined();
    expect(a.reason).toBe('所得税法第57条の2第2項に第3号はありません（号は 2 個）');

    expect(b.status).toBe('not_found');
    expect(b.code).toBe('ARTICLE_NOT_FOUND');
    expect(b.article?.num).toBe('9');
    expect(b.paragraph).toBe(1);
    expect(b.item).toBeUndefined();
    expect(b.reason).toBe('所得税法第9条第1項に第5号はありません（号は 2 個）');
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-024 号番号が読めない件は INVALID_ARTICLE_NUM で article と paragraph を残す', async () => {
    const res = await ok({
      citations: [
        { law_name: '所得税法', article: '9', item: 0 },
        { law_name: '所得税法', article: '9', item: 1.5 },
        { law_name: '所得税法', article: '9', item: 'abc' },
        { law_name: '所得税法', article: '9', item: -1 },
      ],
    });
    for (const r of res.results) {
      expect(r.status).toBe('not_found');
      expect(r.code).toBe('INVALID_ARTICLE_NUM');
      expect(r.article?.num).toBe('9');
      expect(r.paragraph).toBe(1);
      expect(r.item).toBeUndefined();
    }
    expect(res.results[0].reason).toBe('号番号は 1 以上の整数で指定してください: 0');
    expect(res.results[1].reason).toBe('号番号は 1 以上の整数で指定してください: 1.5');
    expect(res.results[2].reason).toContain('号番号の形式が不正です');
  });
});

// ---------- next_actions ----------

const getToc = (lawName: string) => [
  { action: 'get_toc', reason: expect.any(String), example: { law_name: lawName } },
];

describe('found 以外の件の next_actions', () => {
  it('SPEC-EGOV-VERIFY-CITATIONS-025 条・項・号が無い件と条番号・号番号が読めない件は get_toc の 1 件', async () => {
    const res = await ok({
      citations: [
        { law_name: '所得税法', article: '57の2', paragraph: 5 },
        { law_name: '所得税法', article: '57の2', paragraph: 2, item: 3 },
        { law_name: '所得税法', article: '三〇' },
        { law_name: '所得税法', article: '9', item: 'abc' },
        { law_name: '所得税法', article: '9999' },
        { law_id: '340AC0000000033', article: '9999' },
      ],
    });
    expect(res.results.map((r) => r.code)).toEqual([
      'ARTICLE_NOT_FOUND',
      'ARTICLE_NOT_FOUND',
      'INVALID_ARTICLE_NUM',
      'INVALID_ARTICLE_NUM',
      'ARTICLE_NOT_FOUND',
      'ARTICLE_NOT_FOUND',
    ]);
    for (const r of res.results) {
      expect(r.next_actions).toEqual(getToc('所得税法'));
    }
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-026 法令名が引けない件は resolve_abbreviation と search_law の順の 2 件', async () => {
    const res = await ok({ citations: [{ law_name: '架空法', article: '1' }] });
    const r = res.results[0];
    expect(r.code).toBe('LAW_NOT_FOUND');
    expect(r.reason).toBe('e-Gov に「架空法」という法令名はありません');
    expect(r.next_actions).toEqual([
      { action: 'resolve_abbreviation', reason: expect.any(String), example: { abbr: '架空法' } },
      { action: 'search_law', reason: expect.any(String), example: { keyword: '架空法' } },
    ]);
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-027 SPEC-EGOV-VERIFY-CITATIONS-015 部分一致の候補がある件と e-Gov が知らない law_id の件は search_law の 1 件', async () => {
    const res = await ok({
      citations: [
        { law_name: '所得税法施行', article: '1' },
        { law_id: '999AC0000000999', article: '1' },
      ],
    });
    const [partial, badId] = res.results;
    expect(partial.status).toBe('ambiguous');
    expect(partial.next_actions).toEqual([
      { action: 'search_law', reason: expect.any(String), example: { keyword: '所得税法施行' } },
    ]);
    expect(badId.code).toBe('LAW_NOT_FOUND');
    expect(badId.reason).toBe('e-Gov に law_id 999AC0000000999 の法令がありません');
    expect(badId.next_actions).toEqual([
      { action: 'search_law', reason: expect.any(String), example: { keyword: '999AC0000000999' } },
    ]);
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-027 SPEC-EGOV-VERIFY-CITATIONS-015 e-Gov が知らない law_id の件に law_name があれば search_law の keyword は law_name', async () => {
    const res = await ok({
      citations: [{ law_name: '所得税法', law_id: '999AC0000000999', article: '1' }],
    });
    const badIdWithName = res.results[0];
    expect(badIdWithName.code).toBe('LAW_NOT_FOUND');
    expect(badIdWithName.reason).toBe('e-Gov に law_id 999AC0000000999 の法令がありません');
    expect(badIdWithName.next_actions).toEqual([
      { action: 'search_law', reason: expect.any(String), example: { keyword: '所得税法' } },
    ]);
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-027 SPEC-EGOV-VERIFY-CITATIONS-015 同じ未知の law_id が law_name の有無で並んでも、keyword は件ごとに決まる', async () => {
    const res = await ok({
      citations: [
        { law_id: '999AC0000000999', article: '1' },
        { law_name: '所得税法', law_id: '999AC0000000999', article: '1' },
      ],
    });
    const [withoutName, withName] = res.results;
    expect(withoutName.next_actions).toEqual([
      { action: 'search_law', reason: expect.any(String), example: { keyword: '999AC0000000999' } },
    ]);
    expect(withName.next_actions).toEqual([
      { action: 'search_law', reason: expect.any(String), example: { keyword: '所得税法' } },
    ]);
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-028 管轄外の件は delegate_to_mcp の 1 件で、reason に管轄の MCP を書く', async () => {
    const res = await ok({ citations: [{ law_name: '消基通', article: '1' }] });
    const r = res.results[0];
    expect(r.code).toBe('OUT_OF_SCOPE');
    expect(r.reason).toBe(
      '「消費税法基本通達」は houki-nta の管轄です（houki-egov-mcp は法律・政令・省令の本文のみを扱います）'
    );
    expect(r.next_actions).toEqual([
      { action: 'delegate_to_mcp', reason: expect.any(String), example: { mcp: 'houki-nta' } },
    ]);
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-029 項が複数ある条で号だけの件は add_paragraph の 1 件で、article を残す', async () => {
    const res = await ok({
      citations: [
        { law_name: '所得税法', article: '57の2', item: 1 },
        { law_id: '340AC0000000033', article: '57の2', item: 1 },
      ],
    });
    const [byName, byId] = res.results;
    expect(byName.status).toBe('ambiguous');
    expect(byName.article?.num).toBe('57_2');
    expect(byName.reason).toBe(
      '所得税法第57条の2は項が 2 個あるため、号だけではどの項の号か決まりません'
    );
    expect(byName.next_actions).toEqual([
      {
        action: 'add_paragraph',
        reason: expect.any(String),
        example: { law_name: '所得税法', article: '57の2', paragraph: 1 },
      },
    ]);
    expect(byId.status).toBe('ambiguous');
    expect(byId.next_actions).toEqual([
      {
        action: 'add_paragraph',
        reason: expect.any(String),
        example: { law_name: '所得税法', article: '57の2', paragraph: 1 },
      },
    ]);
  });
});

// ---------- 法令の決め方 ----------

describe('法令の決め方', () => {
  it('SPEC-EGOV-VERIFY-CITATIONS-030 部分一致の候補は先頭の 5 件までで、reason に全件数を書く', async () => {
    const res = await ok({ citations: [{ law_name: '検証用テスト法', article: '1' }] });
    const r = res.results[0];
    expect(r.status).toBe('ambiguous');
    expect(r.candidates?.map((c) => c.title)).toEqual([
      '検証用テスト法第1',
      '検証用テスト法第2',
      '検証用テスト法第3',
      '検証用テスト法第4',
      '検証用テスト法第5',
    ]);
    expect(r.reason).toBe(
      '「検証用テスト法」に完全一致する法令名が e-Gov に無く、部分一致が 7 件ありました'
    );
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-031 law_name と law_id の両方を書いた件は law_id だけで決め、食い違いを知らせない', async () => {
    const res = await ok({
      citations: [{ law_name: '民法', law_id: '340AC0000000033', article: '9' }],
    });
    const r = res.results[0];
    expect(r.status).toBe('found');
    expect(r.resolved_by).toBe('law_id');
    expect(r.law?.title).toBe('所得税法');
    expect(r.reason).toBeUndefined();
    expect(r.next_actions).toBeUndefined();
    expect(r.code).toBeUndefined();
    for (const key of Object.keys(r)) {
      expect(['index', 'input', 'status', 'law', 'resolved_by', 'article']).toContain(key);
    }
    expect(fetchCalls.filter((u) => u.pathname.endsWith('/laws'))).toHaveLength(0);
    expect(lawDataCalls('129AC0000000089')).toHaveLength(0);
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-032 空白だけの law_name / law_id は無いものとして扱う', async () => {
    const res = await verifyCitations({
      citations: [
        { law_name: '   ', article: '9' },
        { law_id: ' ', article: '1' },
        { law_name: ' ', law_id: '  ', article: '1' },
      ],
    });
    if (!isError(res)) throw new Error('エラーにならなかった');
    expect(res.code).toBe('INVALID_ARGUMENT');
    expect(res.error).toBe(
      'law_name と law_id のどちらも無い引用があります: citations[0], citations[1], citations[2]'
    );

    const ok2 = await ok({ citations: [{ law_name: '所得税法', law_id: '  ', article: '9' }] });
    expect(ok2.results[0].status).toBe('found');
    expect(ok2.results[0].resolved_by).toBe('abbreviation');
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-033 同じ law_id が並んでも法令本文の問い合わせは 1 回', async () => {
    const res = await ok({
      citations: [
        { law_id: '340AC0000000033', article: '9' },
        { law_id: '340AC0000000033', article: '30' },
        { law_id: '340AC0000000033', article: '57の2' },
      ],
    });
    expect(lawDataCalls('340AC0000000033')).toHaveLength(1);
    expect(res.results).toHaveLength(3);
    expect(res.results.map((r) => r.status)).toEqual(['found', 'found', 'found']);
    expect(res.results.map((r) => r.article?.num)).toEqual(['9', '30', '57_2']);
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-039 略称辞書に law_id が無い法令名は e-Gov の法令名との完全一致で照合する', async () => {
    const res = await ok({
      citations: [
        { law_name: '電子帳簿保存法', article: '1' },
        { law_name: '所得税法施行令', article: '1' },
      ],
    });
    const [dencho, rei] = res.results;
    expect(dencho.status).toBe('found');
    expect(dencho.resolved_by).toBe('exact_title');
    expect(dencho.law?.law_id).toBe('410AC0000000025');
    expect(dencho.law?.law_num).toBe('平成十年法律第二十五号');
    expect(dencho.law?.title).toBe(DENCHO.title);
    expect(dencho.law?.law_type).toBe('Act');
    expect(typeof dencho.law?.url).toBe('string');
    expect(titleSearches(DENCHO.title).length).toBeGreaterThan(0);

    expect(rei.status).toBe('found');
    expect(rei.resolved_by).toBe('exact_title');
    expect(rei.law?.law_id).toBe('340CO0000000096');
  });
});

// ---------- 条番号の書き方 ----------

describe('条番号の書き方', () => {
  it('SPEC-EGOV-VERIFY-CITATIONS-037 削除された条をまとめた範囲表記を照合できる', async () => {
    const res = await ok({
      citations: [
        { law_name: '民法', article: '534:535' },
        { law_name: '民法', article: '534' },
        { law_name: '民法', article: '534:' },
      ],
    });
    const [range, single, broken] = res.results;
    expect(range.status).toBe('found');
    expect(range.article).toMatchObject({ num: '534:535', label: '第534条及び第535条' });
    expect(single.status).toBe('not_found');
    expect(single.code).toBe('ARTICLE_NOT_FOUND');
    expect(single.reason).toBe('民法に第534条はありません');
    expect(broken.status).toBe('not_found');
    expect(broken.code).toBe('INVALID_ARTICLE_NUM');
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-038 漢数字・全角数字・「第…条」を e-Gov の形に直して照合する', async () => {
    const res = await ok({
      citations: [
        { law_name: '所得税法', article: '第三十条の二' },
        { law_name: '所得税法', article: '30の2' },
        { law_name: '所得税法', article: '３０' },
        { law_name: '所得税法', article: '第30条' },
        { law_name: '所得税法', article: '三十' },
        { law_name: '所得税法', article: '30' },
      ],
    });
    for (const r of res.results) expect(r.status).toBe('found');
    for (const r of res.results.slice(0, 2)) {
      expect(r.article).toMatchObject({ num: '30_2', label: '第30条の2' });
    }
    for (const r of res.results.slice(2)) {
      expect(r.article).toMatchObject({ num: '30', label: '第30条' });
    }
  });
});

// ---------- e-Gov の失敗 ----------

describe('e-Gov に問い合わせられなかったとき', () => {
  const useTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

  it('SPEC-EGOV-VERIFY-CITATIONS-034 タイムアウトはツール全体が SOURCE_TIMEOUT で results を持たない', async () => {
    useTimers();
    override = (url, init) => {
      if (!url.pathname.includes('/law_data/')) return undefined;
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    };
    const p = verifyCitations({
      citations: [
        { law_name: '所得税法', article: '9' },
        { law_name: '架空法', article: '1' },
      ],
    });
    await vi.advanceTimersByTimeAsync(120_000);
    const res = await p;
    if (!isError(res)) throw new Error('エラーにならなかった');
    expect(res.code).toBe('SOURCE_TIMEOUT');
    expect(res.retryable).toBe(true);
    expect((res as unknown as Record<string, unknown>).results).toBeUndefined();
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-035 5xx はツール全体が SOURCE_API_ERROR（法令本文でも法令名の検索でも）', async () => {
    useTimers();
    override = (url) =>
      url.pathname.includes('/law_data/') ? Promise.resolve(json({}, 503)) : undefined;
    const p1 = verifyCitations({ citations: [{ law_name: '所得税法', article: '9' }] });
    await vi.advanceTimersByTimeAsync(60_000);
    const r1 = await p1;
    if (!isError(r1)) throw new Error('エラーにならなかった');
    expect(r1.code).toBe('SOURCE_API_ERROR');
    expect(r1.retryable).toBe(true);
    expect((r1 as unknown as Record<string, unknown>).results).toBeUndefined();

    _resetCachesForTest();
    override = (url) =>
      url.pathname.endsWith('/laws') ? Promise.resolve(json({}, 503)) : undefined;
    const p2 = verifyCitations({ citations: [{ law_name: '架空法', article: '1' }] });
    await vi.advanceTimersByTimeAsync(60_000);
    const r2 = await p2;
    if (!isError(r2)) throw new Error('エラーにならなかった');
    expect(r2.code).toBe('SOURCE_API_ERROR');
    expect(r2.retryable).toBe(true);

    _resetCachesForTest();
    override = (url) =>
      url.pathname.includes('/law_data/') ? Promise.resolve(json({}, 500)) : undefined;
    const p3 = verifyCitations({ citations: [{ law_name: '所得税法', article: '9' }] });
    await vi.advanceTimersByTimeAsync(60_000);
    const r3 = await p3;
    if (!isError(r3)) throw new Error('エラーにならなかった');
    expect(r3.code).toBe('SOURCE_API_ERROR');
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-036 429 はツール全体が SOURCE_RATE_LIMITED', async () => {
    useTimers();
    override = (url) =>
      url.pathname.includes('/law_data/') ? Promise.resolve(json({}, 429)) : undefined;
    const p = verifyCitations({ citations: [{ law_name: '所得税法', article: '9' }] });
    await vi.advanceTimersByTimeAsync(60_000);
    const res = await p;
    if (!isError(res)) throw new Error('エラーにならなかった');
    expect(res.code).toBe('SOURCE_RATE_LIMITED');
    expect(res.retryable).toBe(true);
    expect((res as unknown as Record<string, unknown>).results).toBeUndefined();
  });
});
