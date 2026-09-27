/**
 * 差分 20260928-untested-behaviors の get_article_references の受入テスト。
 * 期待値は specs/changes/20260928-untested-behaviors/specs/get_article_references/spec.md から取る。
 * e-Gov クライアント（searchLaws / getLawData）を差し替え、実際の e-Gov には問い合わせない。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LawListItem, LawNode } from '../../services/egov-client.js';

const LAWS: Record<string, { law_id: string; law_type: string; law_num: string }> = {
  所得税法: { law_id: '340AC0000000033', law_type: 'Act', law_num: '昭和四十年法律第三十三号' },
  所得税法施行令: {
    law_id: '340CO0000000096',
    law_type: 'CabinetOrder',
    law_num: '昭和四十年政令第九十六号',
  },
  所得税法施行規則: {
    law_id: '340M50000040011',
    law_type: 'MinisterialOrdinance',
    law_num: '昭和四十年大蔵省令第十一号',
  },
  雇用保険法: { law_id: '349AC0000000116', law_type: 'Act', law_num: '昭和四十九年法律第百十六号' },
  職業能力開発促進法: {
    law_id: '344AC0000000064',
    law_type: 'Act',
    law_num: '昭和四十四年法律第六十四号',
  },
  民法: { law_id: '129AC0000000089', law_type: 'Act', law_num: '明治二十九年法律第八十九号' },
  // SPEC-EGOV-GET-ARTICLE-REFERENCES-030 の実在する候補名（1 種類めと 21 種類め）
  架空一法: { law_id: '999AC0000000101', law_type: 'Act', law_num: '令和九十九年法律第百一号' },
  架空二十一法: {
    law_id: '999AC0000000121',
    law_type: 'Act',
    law_num: '令和九十九年法律第百二十一号',
  },
};

function item(title: string): LawListItem {
  const l = LAWS[title];
  return {
    law_info: { law_id: l.law_id, law_type: l.law_type, law_num: l.law_num },
    revision_info: { law_title: title },
  };
}

/** e-Gov への問い合わせの記録 */
const calls: Array<Record<string, unknown>> = [];
/** 問い合わせの失敗の差し込み（SPEC-EGOV-GET-ARTICLE-REFERENCES-025） */
let failure: { law_title?: string; law_num?: string; law_data?: string; err: Error } | null = null;

vi.mock('../../services/egov-client.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../services/egov-client.js')>();
  return {
    ...mod,
    searchLaws: async (params: { law_title?: string; law_num?: string }) => {
      calls.push({ ...params });
      if (failure?.law_title && params.law_title === failure.law_title) throw failure.err;
      if (failure?.law_num && params.law_num === failure.law_num) throw failure.err;
      let laws: LawListItem[] = [];
      if (params.law_num) {
        const t = Object.keys(LAWS).find((k) => LAWS[k].law_num === params.law_num);
        laws = t ? [item(t)] : [];
      } else if (params.law_title) {
        // e-Gov の /laws は部分一致
        laws = Object.keys(LAWS)
          .filter((k) => k.includes(params.law_title as string))
          .map(item);
      }
      return { total_count: laws.length, count: laws.length, laws };
    },
    getLawData: async (lawId: string) => {
      calls.push({ law_data: lawId });
      if (failure?.law_data === lawId) throw failure.err;
      return { law_full_text: LAW_TREE[lawId] };
    },
  };
});

const sentence = (s: string): LawNode => ({ tag: 'Sentence', attr: {}, children: [s] });
const paragraph = (num: string, text: string): LawNode => ({
  tag: 'Paragraph',
  attr: { Num: num },
  children: [{ tag: 'ParagraphSentence', attr: {}, children: [sentence(text)] }],
});
const article = (num: string, title: string, paragraphs: LawNode[]): LawNode => ({
  tag: 'Article',
  attr: { Num: num },
  children: [{ tag: 'ArticleTitle', attr: {}, children: [title] }, ...paragraphs],
});

// 所得税法 第57条の2（抜粋。既存のテストと同じ本文）
const ARTICLE_57_2: LawNode = {
  tag: 'Article',
  attr: { Num: '57_2' },
  children: [
    { tag: 'ArticleCaption', attr: {}, children: ['（給与所得者の特定支出の控除の特例）'] },
    { tag: 'ArticleTitle', attr: {}, children: ['第五十七条の二'] },
    paragraph(
      '1',
      'その年中の特定支出の額の合計額が第二十八条第二項（給与所得）に規定する給与所得控除額を超えるときは、同項の規定にかかわらず'
    ),
    {
      tag: 'Paragraph',
      attr: { Num: '2' },
      children: [
        {
          tag: 'ParagraphSentence',
          attr: {},
          children: [
            sentence(
              '前項に規定する特定支出とは、雇用保険法（昭和四十九年法律第百十六号）第十条第五項第一号（失業等給付）に規定する教育訓練給付金'
            ),
          ],
        },
        {
          tag: 'Item',
          attr: { Num: '1' },
          children: [
            { tag: 'ItemTitle', attr: {}, children: ['一'] },
            {
              tag: 'ItemSentence',
              attr: {},
              children: [
                sentence(
                  '財務省令で定めるところにより証明がされたもののうち、政令で定める支出。職業能力開発促進法第三十条の三（業務）に規定するキャリアコンサルタント。架空法第一条の規定。第三号に掲げる場合を除く。'
                ),
              ],
            },
          ],
        },
      ],
    },
  ],
};

const KANJI = [
  '一',
  '二',
  '三',
  '四',
  '五',
  '六',
  '七',
  '八',
  '九',
  '十',
  '十一',
  '十二',
  '十三',
  '十四',
  '十五',
  '十六',
  '十七',
  '十八',
  '十九',
  '二十',
  '二十一',
];
const FICTIONAL_21 = KANJI.map((k) => `架空${k}法第一条`).join('、');

// 所得税法の架空の条（差分の例の本文を置く）
const ARTICLE_901 = article('901', '第九百一条', [
  paragraph('1', '政令で定める者は、次に掲げる。'),
  paragraph('2', '前項の場合において政令で定める額とする。'),
]);
const ARTICLE_902 = article('902', '第九百二条', [
  paragraph('1', '消費税法第三十条の規定を準用する。'),
]);
const ARTICLE_903 = article('903', '第九百三条', [paragraph('1', `${FICTIONAL_21}の規定。`)]);
const ARTICLE_904 = article('904', '第九百四条', [
  paragraph('1', '第二十八条第二項の規定及び第二十八条第二項の規定による。'),
]);
// 民法の架空の条（民法施行令・民法施行規則は e-Gov に無い）
const CIVIL_1 = article('1', '第一条', [paragraph('1', '政令で定めるところによる。')]);
// 所得税法施行令 第1条（差分の例の本文）
const ORDER_1 = article('1', '第一条', [paragraph('1', '財務省令で定める書類とする。')]);

const wrap = (...articles: LawNode[]): LawNode => ({
  tag: 'Law',
  attr: {},
  children: [
    {
      tag: 'LawBody',
      attr: {},
      children: [{ tag: 'MainProvision', attr: {}, children: articles }],
    },
  ],
});
const LAW_TREE: Record<string, LawNode> = {
  '340AC0000000033': wrap(ARTICLE_57_2, ARTICLE_901, ARTICLE_902, ARTICLE_903, ARTICLE_904),
  '340CO0000000096': wrap(ORDER_1),
  '129AC0000000089': wrap(CIVIL_1),
};

const { EgovHttpError } = await import('../../services/egov-client.js');
const { _resetCachesForTest } = await import('../../services/law-service.js');
const { toolHandlers } = await import('../../tools/handlers.js');

type Obj = Record<string, unknown>;
type RefsResponse = Obj & {
  references: Obj[];
  delegations: Obj[];
  meta: Obj;
  coverage: Obj;
  next_actions: Obj[];
};

/** server.ts は応答を JSON.stringify して返すので、クライアントに届く形（JSON を通した形）で確かめる */
async function call(args: Obj): Promise<Obj> {
  const raw = await toolHandlers.get_article_references(args);
  return JSON.parse(JSON.stringify(raw)) as Obj;
}

async function ok(args: Obj): Promise<RefsResponse> {
  const r = await call(args);
  if ('error' in r) throw new Error(`エラー応答: ${JSON.stringify(r)}`);
  return r as RefsResponse;
}

const titleCalls = () => calls.filter((c) => c.law_title !== undefined).map((c) => c.law_title);
const egovCalls = () => calls.length;

beforeEach(() => {
  _resetCachesForTest();
  calls.length = 0;
  failure = null;
});

describe('get_article_references（差分 20260928-untested-behaviors）', () => {
  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-023 法令に解決できない law_name は LAW_NOT_FOUND で、resolve_abbreviation・search_law を案内する', async () => {
    const r = await call({ law_name: '存在しない法', article: '1' });
    expect(r).toMatchObject({
      code: 'LAW_NOT_FOUND',
      error: '法令が見つかりません: 存在しない法',
      hint: '略称辞書 / e-Gov 法令検索で該当なし。表記を確認してください',
    });
    const next = r.next_actions as Obj[];
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({
      action: 'resolve_abbreviation',
      example: { abbr: '存在しない法' },
    });
    expect(next[1]).toMatchObject({ action: 'search_law', example: { keyword: '存在しない法' } });
    // 条文を取得しない
    expect(calls.filter((c) => c.law_data !== undefined)).toEqual([]);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-024 管轄外の略称（消基通）は OUT_OF_SCOPE で、e-Gov に問い合わせない', async () => {
    const r = await call({ law_name: '消基通', article: '1' });
    expect(r).toMatchObject({
      code: 'OUT_OF_SCOPE',
      hint: 'houki-nta-mcp の対応 tool に切り替えてください',
    });
    const next = r.next_actions as Obj[];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ action: 'delegate_to_mcp', example: { mcp: 'houki-nta' } });
    expect(egovCalls()).toBe(0);
  });

  describe('SPEC-EGOV-GET-ARTICLE-REFERENCES-025 e-Gov からの取得の失敗', () => {
    const url = 'https://laws.e-gov.go.jp/api/2/test';
    const ERROR_KEYS = ['code', 'detail', 'error', 'hint', 'next_actions', 'retryable'];
    const cases: Array<[string, () => NonNullable<typeof failure>, string]> = [
      [
        '(a) 条文の取得がタイムアウト',
        () => ({
          law_data: '340AC0000000033',
          err: new EgovHttpError(0, url, `e-Gov API request timeout: ${url}`),
        }),
        'SOURCE_TIMEOUT',
      ],
      [
        '(b) 法令番号の問い合わせが HTTP 429',
        () => ({
          law_num: '昭和四十九年法律第百十六号',
          err: new EgovHttpError(429, url, 'e-Gov API returned 429'),
        }),
        'SOURCE_RATE_LIMITED',
      ],
      [
        '(c) 法令名の問い合わせが HTTP 503',
        () => ({
          law_title: '職業能力開発促進法',
          err: new EgovHttpError(503, url, 'e-Gov API returned 503'),
        }),
        'SOURCE_API_ERROR',
      ],
    ];
    for (const [label, makeFailure, code] of cases) {
      it(`SPEC-EGOV-GET-ARTICLE-REFERENCES-025 ${label} は ${code}（retryable: true）で、エラーのキーだけを返す`, async () => {
        failure = makeFailure();
        const r = await call({ law_name: '所得税法', article: '57の2' });
        expect(r.code).toBe(code);
        expect(r.retryable).toBe(true);
        expect(Object.keys(r).sort()).toEqual(ERROR_KEYS);
      });
    }

    it('SPEC-EGOV-GET-ARTICLE-REFERENCES-025 委任先の法令名の問い合わせが HTTP 503 でも SOURCE_API_ERROR', async () => {
      failure = {
        law_title: '所得税法施行令',
        err: new EgovHttpError(503, url, 'e-Gov API returned 503'),
      };
      const r = await call({ law_name: '所得税法', article: '57の2' });
      expect(r.code).toBe('SOURCE_API_ERROR');
      expect(r.retryable).toBe(true);
      expect(Object.keys(r).sort()).toEqual(ERROR_KEYS);
    });
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-026 条が無いときの ARTICLE_NOT_FOUND は、渡した略称のまま get_toc を案内する', async () => {
    const r = await call({ law_name: '所法', article: '999' });
    expect(r).toMatchObject({
      code: 'ARTICLE_NOT_FOUND',
      error: '条文が見つかりません: 第999条 in 所得税法',
      hint: '法令名・条番号を確認してください。get_toc で目次を確認できます',
    });
    const next = r.next_actions as Obj[];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ action: 'get_toc', example: { law_name: '所法' } });
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-027 項が無いときの ARTICLE_NOT_FOUND は next_actions を持たず、hint で項番号の数え方を書く', async () => {
    const r = await call({ law_name: '所得税法', article: '57の2', paragraph: 9 });
    expect(r).toMatchObject({
      code: 'ARTICLE_NOT_FOUND',
      error: '項が見つかりません: 第57条の2第9項',
      hint: '項番号は 1 始まりで指定してください。条全体が必要なら paragraph を省略してください',
    });
    expect(r).not.toHaveProperty('next_actions');
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-028 INVALID_ARTICLE_NUM の hint に条番号の形の例を書き、next_actions を持たない', async () => {
    const r = await call({ law_name: '所得税法', article: '三〇' });
    expect(r).toMatchObject({
      code: 'INVALID_ARTICLE_NUM',
      hint: '条番号は "30"、"30の2"、"第三十条"、"第三十条の二" のいずれかの形式で指定してください',
    });
    expect(r).not.toHaveProperty('next_actions');
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-029 略称辞書の正式名称（消費税法）は e-Gov に問い合わせずに external で解決する', async () => {
    const r = await ok({ law_name: '所得税法', article: '902' });
    expect(r.references).toEqual([
      {
        kind: 'external',
        raw: '消費税法第三十条',
        law_name: '消費税法',
        law_num: '昭和六十三年法律第百八号',
        law_id: '363AC0000000108',
        article: '30',
        resolved: true,
      },
    ]);
    // e-Gov の法令名検索は 1 回も呼ばれない（モックの応答に消費税法は無い）
    expect(titleCalls()).toEqual([]);
    expect(r.next_actions).toHaveLength(1);
    expect(r.next_actions[0]).toMatchObject({
      action: 'get_law',
      example: { law_name: '消費税法', article: '30' },
    });
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-030 名前だけの参照の候補名は 20 種類までしか問い合わせず、21 種類めは resolved: false', async () => {
    const r = await ok({ law_name: '所得税法', article: '903' });
    const first = r.references.find((x) => x.law_name === '架空一法');
    const last = r.references.find((x) => x.law_name === '架空二十一法');
    expect(first).toMatchObject({ kind: 'external', resolved: true, law_id: '999AC0000000101' });
    expect(last).toMatchObject({ kind: 'external', resolved: false });
    expect(last).not.toHaveProperty('law_id');
    expect(r.references[0]).toBe(first);
    expect(r.references[20]).toBe(last);
    expect(titleCalls()).toHaveLength(20);
    // 上限に達したことは応答に書かない
    const base = await ok({ law_name: '所得税法', article: '57の2' });
    expect(r.coverage).toEqual(base.coverage);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-031 委任先の法令が e-Gov に無ければ target_law を付けず、search_fulltext を作らない', async () => {
    const r = await ok({ law_name: '民法', article: '1' });
    expect(r.delegations).toEqual([
      { kind: 'delegation', raw: '政令で定める', count: 1, target: 'enforcement_order' },
    ]);
    expect(r.next_actions).toEqual([]);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-032 next_actions は example が同じ案内を 1 回だけ入れる（references は重複を除かない）', async () => {
    const r = await ok({ law_name: '所得税法', article: '904' });
    expect(r.references.filter((x) => x.kind === 'internal')).toHaveLength(2);
    expect(r.references).toHaveLength(2);
    expect(r.next_actions).toEqual([
      {
        action: 'get_law',
        reason: '同一法令内の参照先を読めます',
        example: { law_name: '所得税法', article: '28', paragraph: 2 },
      },
    ]);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-033 条全体では、別の項に出た同じ委任の文言を 1 件にまとめて count を合算する', async () => {
    const r = await ok({ law_name: '所得税法', article: '901' });
    expect(r.delegations).toHaveLength(1);
    expect(r.delegations[0]).toMatchObject({
      raw: '政令で定める',
      count: 2,
      target_law: expect.objectContaining({ law_id: '340CO0000000096' }),
    });
    expect(r.next_actions.filter((a) => a.action === 'search_fulltext')).toHaveLength(1);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-034 meta に law_id・title・law_num・url・retrieved_at と渡した at を入れる', async () => {
    const before = Date.now();
    const r = await ok({ law_name: '所得税法', article: '57の2', at: '2024-04-01' });
    const after = Date.now();
    expect(r.meta).toEqual({
      law_id: '340AC0000000033',
      title: '所得税法',
      law_num: '昭和四十年法律第三十三号',
      url: 'https://laws.e-gov.go.jp/law/340AC0000000033',
      retrieved_at: expect.any(String),
      at: '2024-04-01',
      article: '57の2',
    });
    const at = r.meta.retrieved_at as string;
    expect(new Date(at).toISOString()).toBe(at);
    expect(new Date(at).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(at).getTime()).toBeLessThanOrEqual(after + 1000);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-034 at を省くと meta に at のキーが無い（略称・paragraph 指定）', async () => {
    const r = await ok({ law_name: '所法', article: '57の2', paragraph: 1 });
    expect(r.meta).not.toHaveProperty('at');
    expect(r.meta.title).toBe('所得税法');
    expect(r.meta.paragraph).toBe(1);
    expect(r.meta.law_id).toBe('340AC0000000033');
    expect(r.meta.url).toBe('https://laws.e-gov.go.jp/law/340AC0000000033');
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-035 target_law に委任先の法令の公開ページの URL を入れる', async () => {
    const r = await ok({ law_name: '所得税法', article: '57の2' });
    const byRaw = (raw: string) =>
      r.delegations.find((d) => d.raw === raw)?.target_law as Obj | undefined;
    expect(byRaw('財務省令で定める')?.url).toBe('https://laws.e-gov.go.jp/law/340M50000040011');
    expect(byRaw('政令で定める')?.url).toBe('https://laws.e-gov.go.jp/law/340CO0000000096');
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-036 next_actions の reason は案内の種類ごとに決まった文言', async () => {
    const r = await ok({ law_name: '所得税法', article: '57の2' });
    const find = (pred: (ex: Obj) => boolean) => r.next_actions.find((a) => pred(a.example as Obj));
    expect(find((ex) => ex.law_name === '所得税法' && ex.article === '28')?.reason).toBe(
      '同一法令内の参照先を読めます'
    );
    expect(find((ex) => ex.law_name === '雇用保険法')?.reason).toBe('引用先の条を読めます');
    expect(find((ex) => ex.keyword === '所得税法施行規則 法第五十七条の二')?.reason).toBe(
      '所得税法施行規則の中で第57条の2を受けている条を探せます（ローカル DB がある場合。無ければ get_toc で目次から探してください）'
    );
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-037 漢数字の条番号を渡しても meta.article は get_law に渡せる表記', async () => {
    const r = await ok({ law_name: '所得税法', article: '第五十七条の二' });
    expect(r.meta.article).toBe('57の2');
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-038 施行令の条からの search_fulltext は呼び名を「令」にする', async () => {
    const r = await ok({ law_name: '所得税法施行令', article: '1' });
    expect(r.delegations).toHaveLength(1);
    expect(r.delegations[0]).toMatchObject({
      raw: '財務省令で定める',
      target_law: expect.objectContaining({ law_id: '340M50000040011' }),
    });
    expect(r.next_actions).toHaveLength(1);
    expect(r.next_actions[0]).toMatchObject({
      action: 'search_fulltext',
      example: { keyword: '所得税法施行規則 令第一条' },
    });
  });
});
