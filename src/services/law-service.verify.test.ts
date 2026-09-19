/**
 * verify_citations（egov#18）を、e-Gov クライアントを差し替えて確かめる。
 * 法令の値は 2026-09-19 に e-Gov から取ったものを元にした固定値で、条文の木はこのテスト用に組んだもの。
 */
import { fromJsonSchema, type JsonSchemaType } from '@modelcontextprotocol/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyCitationsTool } from '../tools/definitions.js';
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
};

function item(title: string): LawListItem {
  const l = LAWS[title];
  return {
    law_info: { law_id: l.law_id, law_type: l.law_type, law_num: l.law_num },
    revision_info: { law_title: title },
  };
}

/** 呼び出しの記録（同じ法令名を二度引かないことの確認用） */
const searchCalls: Array<Record<string, unknown>> = [];

vi.mock('./egov-client.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./egov-client.js')>();
  return {
    ...mod,
    searchLaws: async (params: { law_title?: string; law_num?: string }) => {
      searchCalls.push(params);
      // e-Gov の /laws?law_title= は部分一致
      const laws = params.law_title
        ? Object.keys(LAWS)
            .filter((k) => k.includes(params.law_title as string))
            .map(item)
        : [];
      return { total_count: laws.length, count: laws.length, laws };
    },
    getLawData: async (lawId: string) => {
      const title = Object.keys(LAWS).find((k) => LAWS[k].law_id === lawId);
      if (!title) {
        throw new mod.EgovHttpError(
          404,
          `https://laws.e-gov.go.jp/api/2/law_data/${lawId}`,
          'Not Found'
        );
      }
      return {
        law_info: { law_id: lawId, law_type: LAWS[title].law_type, law_num: LAWS[title].law_num },
        revision_info: { law_title: title },
        law_full_text: LAW_TREE[lawId],
      };
    },
  };
});

const sentence = (s: string): LawNode => ({ tag: 'Sentence', attr: {}, children: [s] });
const paragraphSentence = (s: string): LawNode => ({
  tag: 'ParagraphSentence',
  attr: {},
  children: [sentence(s)],
});
const itemNode = (num: string, text: string): LawNode => ({
  tag: 'Item',
  attr: { Num: num },
  children: [
    { tag: 'ItemTitle', attr: {}, children: [num] },
    { tag: 'ItemSentence', attr: {}, children: [sentence(text)] },
  ],
});

/** 項が 2 つある条。第 2 項に号が 2 つ */
const ARTICLE_57_2: LawNode = {
  tag: 'Article',
  attr: { Num: '57_2' },
  children: [
    { tag: 'ArticleCaption', attr: {}, children: ['（給与所得者の特定支出の控除の特例）'] },
    { tag: 'ArticleTitle', attr: {}, children: ['第五十七条の二'] },
    { tag: 'Paragraph', attr: { Num: '1' }, children: [paragraphSentence('第一項の本文')] },
    {
      tag: 'Paragraph',
      attr: { Num: '2' },
      children: [
        paragraphSentence('前項に規定する特定支出とは、次に掲げる支出をいう。'),
        itemNode('1', '通勤のために必要な交通機関の利用のための支出'),
        itemNode('2', '転任に伴う転居のために通常必要であると認められる支出'),
      ],
    },
  ],
};

/** 項が 1 つだけの条。号が 2 つ */
const ARTICLE_9: LawNode = {
  tag: 'Article',
  attr: { Num: '9' },
  children: [
    { tag: 'ArticleCaption', attr: {}, children: ['（非課税所得）'] },
    { tag: 'ArticleTitle', attr: {}, children: ['第九条'] },
    {
      tag: 'Paragraph',
      attr: { Num: '1' },
      children: [
        paragraphSentence('次に掲げる所得については、所得税を課さない。'),
        itemNode('1', '当座預金の利子'),
        itemNode('2', '学校教育法に規定する学校の学生が受ける学資金'),
      ],
    },
  ],
};

const LAW_TREE: Record<string, LawNode> = {
  '340AC0000000033': {
    tag: 'Law',
    attr: {},
    children: [{ tag: 'MainProvision', attr: {}, children: [ARTICLE_9, ARTICLE_57_2] }],
  },
  '340CO0000000096': { tag: 'Law', attr: {}, children: [] },
  '340M50000040011': { tag: 'Law', attr: {}, children: [] },
};

const { _resetCachesForTest, isError, verifyCitations } = await import('./law-service.js');

beforeEach(() => {
  _resetCachesForTest();
  searchCalls.length = 0;
});

describe('verify_citations の inputSchema', () => {
  it('引用の配列にも件ごとの形にも additionalProperties: false が付く', () => {
    const schema = verifyCitationsTool.inputSchema;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.citations.items.additionalProperties).toBe(false);
    expect(schema.properties.citations.maxItems).toBe(50);
  });

  it('inputSchema に無い引数は検証で弾かれる', async () => {
    const validator = fromJsonSchema(verifyCitationsTool.inputSchema as unknown as JsonSchemaType);
    const result = await validator['~standard'].validate({
      citations: [{ law_name: '所得税法', article: '9', note: '余計な引数' }],
    });
    expect(result.issues).toBeDefined();
  });
});

describe('verifyCitations', () => {
  it('実在する引用と存在しない引用を混ぜても、件ごとに判定が返る', async () => {
    const res = await verifyCitations({
      citations: [
        { law_name: '所得税法', article: '57の2', paragraph: 2, item: 1, label: '所法57の2②一' },
        { law_name: '所法', article: '9' },
        { law_id: '340AC0000000033', article: '9', item: 2 },
        { law_name: '所得税法', article: '9999' },
        { law_name: '所得税法', article: '57の2', paragraph: 5 },
        { law_name: '所得税法', article: '57の2', item: 1 },
        { law_name: '架空法', article: '1' },
        { law_name: '所得税法施行', article: '1' },
        { law_name: '消基通', article: '1' },
        { law_id: '999AC0000000999', article: '1' },
      ],
    });
    if (isError(res)) throw new Error(`ツール全体がエラーになった: ${res.error}`);

    // ツール全体は isError にしない
    expect(res.results).toHaveLength(10);
    expect(res.summary.total).toBe(10);
    expect(res.summary.all_found).toBe(false);
    expect(res.method).toBe('per_citation_lookup');

    const [full, abbr, byId, noArticle, noParagraph, itemOnly, noLaw, partial, outOfScope, badId] =
      res.results;

    // 条・項・号まで実在
    expect(full.status).toBe('found');
    expect(full.law?.law_id).toBe('340AC0000000033');
    expect(full.law?.law_num).toBe('昭和四十年法律第三十三号');
    expect(full.article).toEqual({
      num: '57_2',
      label: '第57条の2',
      caption: '（給与所得者の特定支出の控除の特例）',
    });
    expect(full.paragraph).toBe(2);
    expect(full.item).toBe('1');
    expect(full.input.label).toBe('所法57の2②一');
    expect(full.next_actions).toBeUndefined();

    // 略称は辞書で正式名称に直してから照合する
    expect(abbr.status).toBe('found');
    expect(abbr.resolved_by).toBe('abbreviation');
    expect(abbr.law?.title).toBe('所得税法');

    // law_id 指定。項が 1 つだけの条は項を書かずに号を指定できる
    expect(byId.status).toBe('found');
    expect(byId.resolved_by).toBe('law_id');
    expect(byId.paragraph).toBe(1);
    expect(byId.item).toBe('2');

    // 条が無い
    expect(noArticle.status).toBe('not_found');
    expect(noArticle.code).toBe('ARTICLE_NOT_FOUND');
    expect(noArticle.article).toBeUndefined();
    expect(noArticle.next_actions?.[0].action).toBe('get_toc');

    // 項が無い。条は実在したので article は残る
    expect(noParagraph.status).toBe('not_found');
    expect(noParagraph.code).toBe('ARTICLE_NOT_FOUND');
    expect(noParagraph.article?.num).toBe('57_2');
    expect(noParagraph.reason).toContain('第5項はありません');

    // 項が複数ある条で号だけを書いた引用は、どの項の号か決まらない
    expect(itemOnly.status).toBe('ambiguous');
    expect(itemOnly.code).toBe('INVALID_ARGUMENT');

    // 法令名が引けない
    expect(noLaw.status).toBe('not_found');
    expect(noLaw.code).toBe('LAW_NOT_FOUND');

    // 完全一致が無く、部分一致が複数
    expect(partial.status).toBe('ambiguous');
    expect(partial.code).toBeUndefined();
    expect(partial.candidates?.map((c) => c.title)).toEqual(['所得税法施行令', '所得税法施行規則']);

    // 通達は houki-nta の管轄
    expect(outOfScope.status).toBe('not_found');
    expect(outOfScope.code).toBe('OUT_OF_SCOPE');

    // e-Gov が知らない law_id
    expect(badId.status).toBe('not_found');
    expect(badId.code).toBe('LAW_NOT_FOUND');

    expect(res.summary).toEqual({
      total: 10,
      found: 3,
      not_found: 5,
      ambiguous: 2,
      all_found: false,
    });
  });

  it('全件が実在すれば all_found が true になる', async () => {
    const res = await verifyCitations({
      citations: [
        { law_name: '所得税法', article: '9', item: 1 },
        { law_name: '所法', article: '57の2', paragraph: 1 },
      ],
    });
    if (isError(res)) throw new Error(res.error);
    expect(res.summary).toEqual({
      total: 2,
      found: 2,
      not_found: 0,
      ambiguous: 0,
      all_found: true,
    });
  });

  it('同じ法令名が並んでも e-Gov の検索は 1 回で済む', async () => {
    const res = await verifyCitations({
      citations: [
        { law_name: '所得税法施行令', article: '1' },
        { law_name: '所得税法施行令', article: '2' },
        { law_name: '所得税法施行令', article: '3' },
      ],
    });
    if (isError(res)) throw new Error(res.error);
    expect(searchCalls.filter((c) => c.law_title === '所得税法施行令')).toHaveLength(1);
  });

  it('law_name と law_id のどちらも無い引用があれば、ツール全体が INVALID_ARGUMENT になる', async () => {
    const res = await verifyCitations({
      citations: [{ law_name: '所得税法', article: '9' }, { article: '9' }],
    });
    if (!isError(res)) throw new Error('エラーにならなかった');
    expect(res.code).toBe('INVALID_ARGUMENT');
    expect(res.error).toContain('citations[1]');
  });

  it('citations が空ならツール全体が INVALID_ARGUMENT になる', async () => {
    const res = await verifyCitations({ citations: [] });
    if (!isError(res)) throw new Error('エラーにならなかった');
    expect(res.code).toBe('INVALID_ARGUMENT');
  });

  it('条番号の書き方が不正なら件ごとに INVALID_ARTICLE_NUM を返す', async () => {
    const res = await verifyCitations({
      citations: [{ law_name: '所得税法', article: '三〇' }],
    });
    if (isError(res)) throw new Error(res.error);
    expect(res.results[0].status).toBe('not_found');
    expect(res.results[0].code).toBe('INVALID_ARTICLE_NUM');
  });

  it('e-Gov に問い合わせられなかったときは、件ごとの判定ではなくツール全体のエラーを返す', async () => {
    const mod = await import('./egov-client.js');
    const spy = vi.spyOn(mod, 'getLawData').mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    const res = await verifyCitations({ citations: [{ law_name: '所得税法', article: '9' }] });
    spy.mockRestore();
    if (!isError(res)) throw new Error('エラーにならなかった');
    expect(res.code).toBe('SOURCE_UNAVAILABLE');
    expect(res.retryable).toBe(true);
  });
});
