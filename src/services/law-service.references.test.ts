/**
 * get_related_laws / get_article_references（egov#20）を、e-Gov クライアントを差し替えて確かめる。
 * 応答は 2026-09-19 に e-Gov から取った値を元にした固定値。
 */
import { fromJsonSchema, type JsonSchemaType } from '@modelcontextprotocol/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLawTool, searchFulltextTool } from '../tools/definitions.js';
import type { LawListItem, LawNode } from './egov-client.js';

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
  // 「日本国憲法」のように、規則で作った候補名が実在しないケースの相手
  民法: { law_id: '129AC0000000089', law_type: 'Act', law_num: '明治二十九年法律第八十九号' },
};

function item(title: string): LawListItem {
  const l = LAWS[title];
  return {
    law_info: { law_id: l.law_id, law_type: l.law_type, law_num: l.law_num },
    revision_info: { law_title: title },
  };
}

/** 呼び出しの記録（同じ法令番号・名前を二度引かないことの確認用） */
const calls: Array<Record<string, unknown>> = [];

vi.mock('./egov-client.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./egov-client.js')>();
  return {
    ...mod,
    searchLaws: async (params: { law_title?: string; law_num?: string }) => {
      calls.push(params);
      let laws: LawListItem[] = [];
      if (params.law_num) {
        const t = Object.keys(LAWS).find((k) => LAWS[k].law_num === params.law_num);
        laws = t ? [item(t)] : [];
      } else if (params.law_title) {
        // e-Gov の /laws は部分一致。「所得税法」で 3 件返る
        laws = Object.keys(LAWS)
          .filter((k) => k.includes(params.law_title as string))
          .map(item);
      }
      return { total_count: laws.length, count: laws.length, laws };
    },
    getLawData: async (lawId: string) => ({ law_full_text: LAW_TREE[lawId] }),
  };
});

const sentence = (s: string): LawNode => ({ tag: 'Sentence', attr: {}, children: [s] });
const ARTICLE_57_2: LawNode = {
  tag: 'Article',
  attr: { Num: '57_2' },
  children: [
    { tag: 'ArticleCaption', attr: {}, children: ['（給与所得者の特定支出の控除の特例）'] },
    { tag: 'ArticleTitle', attr: {}, children: ['第五十七条の二'] },
    {
      tag: 'Paragraph',
      attr: { Num: '1' },
      children: [
        {
          tag: 'ParagraphSentence',
          attr: {},
          children: [
            sentence(
              'その年中の特定支出の額の合計額が第二十八条第二項（給与所得）に規定する給与所得控除額を超えるときは、同項の規定にかかわらず'
            ),
          ],
        },
      ],
    },
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
// 所得税法施行令 第167条の3（抜粋）。「法第…」は親の法律、「政令で定める」は施行令自身を指す
const ORDER_167_3: LawNode = {
  tag: 'Article',
  attr: { Num: '167_3' },
  children: [
    { tag: 'ArticleTitle', attr: {}, children: ['第百六十七条の三'] },
    {
      tag: 'Paragraph',
      attr: { Num: '1' },
      children: [
        {
          tag: 'ParagraphSentence',
          attr: {},
          children: [
            sentence(
              '法第五十七条の二第二項第一号に規定する政令で定める支出は、次に掲げる支出とする。'
            ),
          ],
        },
      ],
    },
  ],
};
const wrap = (article: LawNode): LawNode => ({
  tag: 'Law',
  attr: {},
  children: [
    {
      tag: 'LawBody',
      attr: {},
      children: [{ tag: 'MainProvision', attr: {}, children: [article] }],
    },
  ],
});
const LAW_TREE: Record<string, LawNode> = {
  '340AC0000000033': wrap(ARTICLE_57_2),
  '340CO0000000096': wrap(ORDER_167_3),
};

const { getArticleReferences, getRelatedLaws, _resetCachesForTest } = await import(
  './law-service.js'
);

beforeEach(() => {
  _resetCachesForTest();
  calls.length = 0;
});

describe('getRelatedLaws', () => {
  it('所得税法から、実在する施行令と施行規則を law_id 付きで返す', async () => {
    const r = await getRelatedLaws({ law_name: '所得税法' });
    if ('error' in r) throw new Error(r.error);
    expect(r.law).toEqual({
      law_id: '340AC0000000033',
      title: '所得税法',
      law_num: '昭和四十年法律第三十三号',
    });
    expect(r.related.map((x) => [x.relation, x.law_id, x.abbr])).toEqual([
      ['enforcement_order', '340CO0000000096', '所令'],
      ['enforcement_rule', '340M50000040011', '所規'],
    ]);
    expect(r.not_found).toEqual([]);
    expect(r.method).toBe('law_name_rule');
    expect(r.note).toContain('網羅性は保証しません');
    expect(r.next_actions.map((a) => a.action)).toEqual(['get_toc', 'get_toc']);
  });

  it('略称（所令）から親の法律と兄弟の施行規則を返す', async () => {
    const r = await getRelatedLaws({ law_name: '所令' });
    if ('error' in r) throw new Error(r.error);
    expect(r.related.map((x) => [x.relation, x.title])).toEqual([
      ['parent_act', '所得税法'],
      ['enforcement_rule', '所得税法施行規則'],
    ]);
  });

  it('候補が e-Gov に無ければ related は空、not_found に候補名を入れる（エラーにしない）', async () => {
    const r = await getRelatedLaws({ law_name: '民法' });
    if ('error' in r) throw new Error(r.error);
    expect(r.related).toEqual([]);
    expect(r.not_found).toEqual([
      { relation: 'enforcement_order', title: '民法施行令' },
      { relation: 'enforcement_rule', title: '民法施行規則' },
    ]);
  });

  it('知らない法令名は LAW_NOT_FOUND', async () => {
    const r = await getRelatedLaws({ law_name: '存在しない法' });
    expect('code' in r && r.code).toBe('LAW_NOT_FOUND');
  });
});

describe('getArticleReferences', () => {
  it('他法令の条は law_id 付き、同一法令内は internal、委任には施行令・施行規則が付く', async () => {
    const r = await getArticleReferences({ law_name: '所得税法', article: '57の2' });
    if ('error' in r) throw new Error(r.error);
    expect(r.meta.article).toBe('57の2');
    expect(r.references).toEqual([
      { kind: 'internal', raw: '第二十八条第二項', article: '28', paragraph: 2 },
      { kind: 'relative', raw: '同項', resolved: false },
      { kind: 'relative', raw: '前項', resolved: false },
      expect.objectContaining({
        kind: 'external',
        law_name: '雇用保険法',
        law_id: '349AC0000000116',
        article: '10',
        paragraph: 5,
        item: '1',
        resolved: true,
      }),
      // 法令番号なしの名前は、候補名の完全一致で解決する
      expect.objectContaining({
        kind: 'external',
        law_name: '職業能力開発促進法',
        law_id: '344AC0000000064',
        article: '30の3',
        resolved: true,
      }),
      // e-Gov に無い候補名は未解決のまま
      expect.objectContaining({
        kind: 'external',
        law_name: '架空法',
        article: '1',
        resolved: false,
      }),
      // 条も項も無い「第三号」には、その文が属する項の番号を付ける（get_law が paragraph を求めるため）
      { kind: 'internal', raw: '第三号', item: '3', paragraph: 2 },
    ]);
    expect(r.delegations).toEqual([
      expect.objectContaining({
        raw: '財務省令で定める',
        count: 1,
        target_law: expect.objectContaining({
          relation: 'enforcement_rule',
          law_id: '340M50000040011',
        }),
      }),
      expect.objectContaining({
        raw: '政令で定める',
        count: 1,
        target_law: expect.objectContaining({
          relation: 'enforcement_order',
          law_id: '340CO0000000096',
        }),
      }),
    ]);
    expect(r.coverage.method).toBe('regex');
    expect(r.coverage.note).toContain('網羅性は保証しません');
  });

  it('paragraph を指定するとその項だけを対象にする', async () => {
    const r = await getArticleReferences({ law_name: '所得税法', article: '57の2', paragraph: 1 });
    if ('error' in r) throw new Error(r.error);
    expect(r.meta.paragraph).toBe(1);
    expect(r.references.map((x) => x.raw)).toEqual(['第二十八条第二項', '同項']);
    expect(r.delegations).toEqual([]);
  });

  it('next_actions の example は、そのまま get_law / search_fulltext の inputSchema を通る', async () => {
    const r = await getArticleReferences({ law_name: '所得税法', article: '57の2' });
    if ('error' in r) throw new Error(r.error);
    const getLaw = fromJsonSchema(getLawTool.inputSchema as unknown as JsonSchemaType);
    const fulltext = fromJsonSchema(searchFulltextTool.inputSchema as unknown as JsonSchemaType);
    expect(r.next_actions.length).toBeGreaterThan(0);
    for (const a of r.next_actions) {
      const validator =
        a.action === 'get_law' ? getLaw : a.action === 'search_fulltext' ? fulltext : null;
      expect(validator, a.action).not.toBeNull();
      const v = await validator?.['~standard'].validate(a.example);
      expect(v?.issues, JSON.stringify(a)).toBeUndefined();
    }
    // 未解決（resolved: false）と relative からは next_actions を作らない
    expect(r.next_actions.map((a) => a.example)).toEqual([
      { law_name: '所得税法', article: '28', paragraph: 2 },
      { law_name: '雇用保険法', article: '10', paragraph: 5, item: '1' },
      { law_name: '職業能力開発促進法', article: '30の3' },
      { law_name: '所得税法', article: '57の2', paragraph: 2, item: '3' },
      { keyword: '所得税法施行規則 法第五十七条の二' },
      { keyword: '所得税法施行令 法第五十七条の二' },
    ]);
  });

  it('同じ法令番号・候補名は 1 回しか e-Gov に問い合わせない', async () => {
    await getArticleReferences({ law_name: '所得税法', article: '57の2' });
    const nums = calls.filter((c) => c.law_num).map((c) => c.law_num);
    expect(nums).toEqual(['昭和四十九年法律第百十六号']);
    const titles = calls.filter((c) => c.law_title).map((c) => c.law_title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('条が無ければ ARTICLE_NOT_FOUND、項が無ければ ARTICLE_NOT_FOUND', async () => {
    const r1 = await getArticleReferences({ law_name: '所得税法', article: '999' });
    expect('code' in r1 && r1.code).toBe('ARTICLE_NOT_FOUND');
    const r2 = await getArticleReferences({ law_name: '所得税法', article: '57の2', paragraph: 9 });
    expect('code' in r2 && r2.code).toBe('ARTICLE_NOT_FOUND');
  });

  it('条番号の形式が不正なら INVALID_ARTICLE_NUM', async () => {
    const r = await getArticleReferences({ law_name: '所得税法', article: '三〇' });
    expect('code' in r && r.code).toBe('INVALID_ARTICLE_NUM');
  });

  it('施行令の条では「法第N条」が親の法律への external になり、「政令で定める」は自身（self: true）', async () => {
    const r = await getArticleReferences({ law_name: '所得税法施行令', article: '167の3' });
    if ('error' in r) throw new Error(r.error);
    expect(r.references).toEqual([
      expect.objectContaining({
        kind: 'external',
        raw: '法第五十七条の二第二項第一号',
        law_name: '所得税法',
        law_id: '340AC0000000033',
        article: '57の2',
        paragraph: 2,
        item: '1',
        resolved: true,
      }),
    ]);
    expect(r.delegations).toEqual([
      expect.objectContaining({
        raw: '政令で定める',
        target_law: expect.objectContaining({ law_id: '340CO0000000096', self: true }),
      }),
    ]);
    // 自身への委任からは search_fulltext を作らない
    expect(r.next_actions.map((a) => a.action)).toEqual(['get_law']);
  });
});
