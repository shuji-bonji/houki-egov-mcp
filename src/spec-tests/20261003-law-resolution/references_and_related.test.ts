/**
 * 差分 20261003-law-resolution の受入テスト — get_article_references・get_related_laws（#45・#51・#63・#87）
 *
 * 期待値の正本: specs/changes/20261003-law-resolution/specs/get_article_references/spec.md と
 * specs/changes/20261003-law-resolution/specs/get_related_laws/spec.md
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ASOF_400044,
  article,
  HOKEN,
  hokenLaws,
  item,
  type LawsTable,
  lawsSearch,
  lawTree,
  NOT_FOUND_404004,
  paragraph,
  SHOHI,
  SHOTOKU,
  SHOTOKU_KISOKU,
  SHOTOKU_REI,
  SUPPL_27_NUM,
  SUPPL_168_NUM,
  shohiTree,
} from '../../test-helpers/law-resolution-fixtures.js';
import {
  type AnyObj,
  type Harness,
  json,
  type LawFixture,
  lawDataResponse,
  type Route,
  startHarness,
} from '../../test-helpers/mcp-harness.js';

const DOKO: LawFixture = {
  law_id: '335AC0000000105',
  title: '道路交通法',
  law_num: '昭和三十五年法律第百五号',
};
const DOKO_KISOKU: LawFixture = {
  law_id: '335M50000002060',
  title: '道路交通法施行規則',
  law_num: '昭和三十五年総理府令第六十号',
  law_type: 'MinisterialOrdinance',
};
const ROKI: LawFixture = {
  law_id: '322AC0000000049',
  title: '労働基準法',
  law_num: '昭和二十二年法律第四十九号',
};
const ROKI_KISOKU: LawFixture = {
  law_id: '322M40000100023',
  title: '労働基準法施行規則',
  law_num: '昭和二十二年厚生省令第二十三号',
  law_type: 'MinisterialOrdinance',
};
const MINPO: LawFixture = {
  law_id: '129AC0000000089',
  title: '民法',
  law_num: '明治二十九年法律第八十九号',
};
const KOKUZEI_SHOREI: LawFixture = {
  law_id: '415M60000040071',
  title: '国税関係法令に係る情報通信技術を活用した行政の推進等に関する省令',
  law_num: '平成十五年財務省令第七十一号',
  law_type: 'MinisterialOrdinance',
};
/** 本文の参照を確かめるための架空の法律（辞書に無い） */
const SANSHO: LawFixture = {
  law_id: '499AC0000000500',
  title: '架空参照法',
  law_num: '令和九十九年法律第五百号',
};
/** 法令番号の検索で、番号の違う法令だけが返る */
const WRONG_NUM: LawFixture = {
  law_id: '499AC0000000777',
  title: '架空別番号法',
  law_num: '令和九十九年法律第七百七十七号',
};

const TABLE: LawsTable = {
  laws: [
    SHOTOKU,
    SHOTOKU_REI,
    SHOTOKU_KISOKU,
    DOKO,
    DOKO_KISOKU,
    ROKI,
    ROKI_KISOKU,
    MINPO,
    KOKUZEI_SHOREI,
    SANSHO,
    ...hokenLaws(),
  ],
};

const TREES: Record<string, AnyObj> = {
  [SHOHI.law_id]: shohiTree(),
  [SHOTOKU.law_id]: lawTree(SHOTOKU.title, [
    article('57_2', '第五十七条の二', [
      paragraph('1', '財務省令で定めるところにより、政令で定める金額を控除する。'),
      paragraph('2', '前項の書類は財務省令で定める。'),
    ]),
    article('99', '第九十九条', [
      paragraph('1', '主務省令で定める事項及び経済産業省令で定める事項を記載する。'),
    ]),
  ]),
  [SHOTOKU_KISOKU.law_id]: lawTree(SHOTOKU_KISOKU.title, [
    article('3', '第三条', [
      paragraph('1', '令第二十四条第一号に掲げる者は、法第二条の規定による。', [
        item('1', '一', '政令で定める場合'),
      ]),
    ]),
  ]),
  [DOKO.law_id]: lawTree(DOKO.title, [
    article('2', '第二条', [
      paragraph(
        '1',
        '内閣府令で定める車両、内閣府令で定める装置、内閣府令・環境省令で定める基準及び内閣府令・国土交通省令で定める構造をいう。'
      ),
    ]),
  ]),
  [ROKI.law_id]: lawTree(ROKI.title, [
    article('15', '第十五条', [
      paragraph('1', '厚生労働省令で定める事項を明示しなければならない。'),
    ]),
  ]),
  [MINPO.law_id]: lawTree(MINPO.title, [
    article('1', '第一条', [paragraph('1', '政令で定めるところによる。')]),
  ]),
  [SANSHO.law_id]: lawTree(SANSHO.title, [
    article('1', '第一条', [
      paragraph(
        '1',
        '附則第三条の規定により、所得税法附則第五条第二項に定めるところによる。この場合において、保険法第二条に規定する者とする。'
      ),
    ]),
    article('2', '第二条', [
      paragraph('1', '架空別名法（令和九十九年法律第一号）第一条の規定を準用する。'),
    ]),
  ]),
};

const defaultRoute: Route = (url) => {
  if (url.pathname.endsWith('/laws')) {
    // 法令番号の検索は、番号の違う法令だけを返す（SPEC-EGOV-GET-ARTICLE-REFERENCES-045）
    if (url.searchParams.get('law_num') === '令和九十九年法律第一号') {
      return lawsSearch(
        { laws: [WRONG_NUM] },
        new URL(url.toString().replace(/law_num=[^&]+/, ''))
      );
    }
    return lawsSearch(TABLE, url);
  }
  const m = /\/law_data\/([^/]+)$/.exec(url.pathname);
  if (!m) return null;
  const tree = TREES[m[1]];
  const f = [...TABLE.laws, SHOHI].find((l) => l.law_id === m[1]);
  return f && tree ? lawDataResponse(f, tree) : null;
};

describe('get_article_references（20261003-law-resolution）', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness(defaultRoute);
  });
  afterEach(async () => {
    await h.close();
  });
  const call = async (args: Record<string, unknown>): Promise<AnyObj> => {
    const r = await h.call('get_article_references', args);
    if (r.isError) throw new Error(r.text);
    return r.body;
  };

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-044 完全一致しない法令名は、参照を取り出さず候補付きの LAW_NOT_FOUND', async () => {
    const r = await h.call('get_article_references', { law_name: '所得税法施行', article: '1' });
    expect(r.body.code).toBe('LAW_NOT_FOUND');
    expect(r.body.error).toBe('完全一致する法令名がありません: 所得税法施行（部分一致 2 件）');
    expect(r.body.next_actions[0]).toMatchObject({
      action: 'get_article_references',
      example: { law_name: '所得税法施行令', article: '1' },
    });
    expect(r.body.next_actions[0].example).toEqual({ law_name: '所得税法施行令', article: '1' });
    expect(r.body.next_actions.at(-1)).toMatchObject({
      action: 'search_law',
      example: { keyword: '所得税法施行' },
    });
    expect(h.urls().filter((u) => u.pathname.includes('/law_data/'))).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-045 本文の候補名は検索結果の全件から完全一致で解決する（保険法は 114 件の 78 件目）', async () => {
    const body = await call({ law_name: SANSHO.title, article: '1' });
    const hoken = body.references.find(
      (r: AnyObj) => r.kind === 'external' && r.raw.startsWith('保険法')
    );
    expect(hoken).toMatchObject({
      law_name: '保険法',
      law_id: HOKEN.law_id,
      article: '2',
      resolved: true,
    });
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-045 法令番号の検索結果に番号の一致する法令が無ければ、先頭の法令を使わない', async () => {
    const body = await call({ law_name: SANSHO.title, article: '2' });
    expect(body.references.some((r: AnyObj) => r.law_id === WRONG_NUM.law_id)).toBe(false);
    for (const r of body.references.filter((x: AnyObj) => String(x.raw).includes('架空別名法'))) {
      expect(r.resolved).toBe(false);
      expect(r.law_id).toBeUndefined();
    }
    expect(body.next_actions.some((a: AnyObj) => a.example?.law_name === WRONG_NUM.title)).toBe(
      false
    );
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-046 本則に無く附則にだけある条番号は ARTICLE_NOT_FOUND にし、get_law の suppl_index を案内する', async () => {
    const r = await h.call('get_article_references', { law_name: '消費税法', article: '100' });
    expect(r.body.code).toBe('ARTICLE_NOT_FOUND');
    expect(r.body.hint).toBe(
      `本則に第100条はありません。附則に同じ番号の条があります: 附則(27) ${SUPPL_27_NUM}、附則(168) ${SUPPL_168_NUM}。このツールは本則の条だけを対象にします。附則の条の本文は get_law の suppl_index で読めます`
    );
    expect(r.body.next_actions.map((a: AnyObj) => [a.action, a.example])).toEqual([
      ['get_law', { law_name: '消費税法', article: '100', suppl_index: 27 }],
      ['get_law', { law_name: '消費税法', article: '100', suppl_index: 168 }],
    ]);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-047 本文の「附則第N条」は kind: suppl・resolved: false で返し、本則の条への get_law を作らない', async () => {
    const body = await call({ law_name: SANSHO.title, article: '1' });
    expect(body.references).toContainEqual({
      kind: 'suppl',
      raw: '附則第三条',
      article: '3',
      resolved: false,
    });
    const named = body.references.find(
      (r: AnyObj) => r.kind === 'suppl' && r.law_name === '所得税法'
    );
    expect(named).toMatchObject({ article: '5', paragraph: 2, resolved: false });
    expect(body.references.some((r: AnyObj) => r.kind === 'internal' && r.article === '3')).toBe(
      false
    );
    expect(
      body.next_actions.some((a: AnyObj) => a.action === 'get_law' && a.example?.article === '3')
    ).toBe(false);
    expect(
      body.next_actions.some((a: AnyObj) => a.action === 'get_law' && a.example?.article === '5')
    ).toBe(false);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-048 施行規則の本文の「令第N条」は兄弟の施行令への external で返し、get_law を付ける', async () => {
    const body = await call({ law_name: '所得税法施行規則', article: '3' });
    expect(body.references).toContainEqual({
      kind: 'external',
      raw: '令第二十四条第一号',
      law_name: '所得税法施行令',
      law_num: '昭和四十年政令第九十六号',
      law_id: '340CO0000000096',
      article: '24',
      item: '1',
      resolved: true,
    });
    expect(body.next_actions).toContainEqual(
      expect.objectContaining({
        action: 'get_law',
        example: { law_name: '所得税法施行令', article: '24', item: '1' },
      })
    );
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-049 委任の命令の名前が施行規則の法令番号の命令と合うときだけ target_law を付ける（道路交通法第2条）', async () => {
    const body = await call({ law_name: '道路交通法', article: '2' });
    const byRaw = Object.fromEntries(body.delegations.map((d: AnyObj) => [d.raw, d]));
    expect(byRaw['内閣府令で定める'].count).toBe(2);
    expect(byRaw['内閣府令で定める'].target).toBe('enforcement_rule');
    expect(byRaw['内閣府令で定める'].target_law).toMatchObject({
      relation: 'enforcement_rule',
      law_id: DOKO_KISOKU.law_id,
      title: '道路交通法施行規則',
    });
    for (const raw of ['環境省令で定める', '国土交通省令で定める']) {
      expect(byRaw[raw].target).toBe('enforcement_rule');
      expect(byRaw[raw]).toHaveProperty('target_law');
      expect(byRaw[raw].target_law).toBeNull();
    }
    const fulltext = body.next_actions.filter((a: AnyObj) => a.action === 'search_fulltext');
    expect(fulltext).toHaveLength(1);
    expect(fulltext[0].example.keyword).toMatch(/^道路交通法施行規則 /);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-049 厚生省令の施行規則は厚生労働省令の委任に当たる。主務省令・名前の合わない省令は null', async () => {
    const roki = await call({ law_name: '労働基準法', article: '15' });
    expect(roki.delegations[0].target_law).toMatchObject({ law_id: ROKI_KISOKU.law_id });
    const shotoku = await call({ law_name: '所得税法', article: '99' });
    const byRaw = Object.fromEntries(shotoku.delegations.map((d: AnyObj) => [d.raw, d]));
    expect(byRaw['主務省令で定める'].target_law).toBeNull();
    expect(byRaw['経済産業省令で定める'].target_law).toBeNull();
    expect(shotoku.next_actions.filter((a: AnyObj) => a.action === 'search_fulltext')).toEqual([]);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-012 財務省令の委任は大蔵省令の施行規則に、政令の委任は施行令に結び付け、出現回数でまとめる', async () => {
    const body = await call({ law_name: '所得税法', article: '57の2' });
    expect(body.delegations).toEqual([
      {
        kind: 'delegation',
        raw: '財務省令で定める',
        count: 2,
        target: 'enforcement_rule',
        target_law: expect.objectContaining({
          relation: 'enforcement_rule',
          law_id: '340M50000040011',
          title: '所得税法施行規則',
        }),
      },
      {
        kind: 'delegation',
        raw: '政令で定める',
        count: 1,
        target: 'enforcement_order',
        target_law: expect.objectContaining({
          relation: 'enforcement_order',
          law_id: '340CO0000000096',
          title: '所得税法施行令',
        }),
      },
    ]);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-031 委任先が e-Gov に無いときは target_law: null（キーは消さない）で、search_fulltext を作らない', async () => {
    const body = await call({ law_name: '民法', article: '1' });
    expect(body.delegations).toEqual([
      {
        kind: 'delegation',
        raw: '政令で定める',
        count: 1,
        target: 'enforcement_order',
        target_law: null,
      },
    ]);
    expect(body.next_actions).toEqual([]);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-050 施行規則の条からは、施行令への委任の search_fulltext を作らない', async () => {
    const body = await call({ law_name: '所得税法施行規則', article: '3' });
    const seirei = body.delegations.find((d: AnyObj) => d.raw === '政令で定める');
    expect(seirei.target_law).toMatchObject({ law_id: '340CO0000000096' });
    expect(body.next_actions.filter((a: AnyObj) => a.action === 'search_fulltext')).toEqual([]);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-051 対象の法令本文の取得が 400・400044 なら INVALID_ARGUMENT、404・404004 なら LAW_NOT_FOUND', async () => {
    h.setRoute((url) => (url.pathname.includes('/law_data/') ? ASOF_400044() : defaultRoute(url)));
    const ia = await h.call('get_article_references', {
      law_name: '所得税法',
      article: '57の2',
      at: '2000-01-01',
    });
    expect(ia.body.code).toBe('INVALID_ARGUMENT');
    expect(ia.body.tool).toBe('get_article_references');
    expect(ia.body.detail.issues).toEqual([
      { path: 'at', message: 'e-Gov が受け付ける時点の範囲の外です' },
    ]);
    h.setRoute((url) =>
      url.pathname.includes('/law_data/') ? NOT_FOUND_404004() : defaultRoute(url)
    );
    const nf = await h.call('get_article_references', { law_name: '所得税法', article: '57の2' });
    expect(nf.body.code).toBe('LAW_NOT_FOUND');
    h.setRoute((url) =>
      url.pathname.includes('/law_data/')
        ? json({ code: 'x', message: 'x' }, 403)
        : defaultRoute(url)
    );
    const se = await h.call('get_article_references', { law_name: '所得税法', article: '57の2' });
    expect(se.body.code).toBe('SOURCE_API_ERROR');
    expect(se.body.retryable).toBe(false);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-051 本文の参照から他の法令を引く検索が 400・400044 を返したときも INVALID_ARGUMENT', async () => {
    h.setRoute((url) => (url.pathname.endsWith('/laws') ? ASOF_400044() : defaultRoute(url)));
    const r = await h.call('get_article_references', {
      law_name: '所得税法',
      article: '57の2',
      at: '2018-01-01',
    });
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.tool).toBe('get_article_references');
    expect(r.body.detail.issues[0].path).toBe('at');
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-045 at を渡したときは、参照から他の法令を引く検索にも asof を付ける', async () => {
    await call({ law_name: '所得税法', article: '57の2', at: '2024-04-01' });
    const laws = h.urls().filter((u) => u.pathname.endsWith('/laws'));
    expect(laws.length).toBeGreaterThan(0);
    expect(laws.every((u) => u.searchParams.get('asof') === '2024-04-01')).toBe(true);
  });
});

describe('get_related_laws（20261003-law-resolution）', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness(defaultRoute);
  });
  afterEach(async () => {
    await h.close();
  });

  it('SPEC-EGOV-GET-RELATED-LAWS-019 完全一致しない法令名は、関連法令を引かず候補付きの LAW_NOT_FOUND', async () => {
    const r = await h.call('get_related_laws', { law_name: '所得税法施行' });
    expect(r.body.code).toBe('LAW_NOT_FOUND');
    expect(r.body.next_actions.map((a: AnyObj) => [a.action, a.example])).toEqual([
      ['get_related_laws', { law_name: '所得税法施行令' }],
      ['get_related_laws', { law_name: '所得税法施行規則' }],
      ['search_law', { keyword: '所得税法施行' }],
    ]);
    // 法令名の検索だけで、候補名の問い合わせはしない
    expect(h.urls().every((u) => u.searchParams.get('law_title') === '所得税法施行')).toBe(true);
  });

  it('SPEC-EGOV-GET-RELATED-LAWS-020 法律でも施行令・施行規則でもない法令からは候補を作らず、e-Gov に問い合わせない', async () => {
    const r = await h.call('get_related_laws', { law_name: KOKUZEI_SHOREI.title });
    expect(r.isError).toBe(false);
    expect(r.body.law.law_id).toBe('415M60000040071');
    expect(r.body.related).toEqual([]);
    expect(r.body.not_found).toEqual([]);
    expect(r.body.next_actions).toEqual([]);
    expect(r.body.method).toBe('law_name_rule');
    expect(r.body.note).toMatch(
      new RegExp(
        `${KOKUZEI_SHOREI.title} は法律でも施行令・施行規則でもないため、名前の規則で関連法令を作っていません$`
      )
    );
    expect(r.body.meta.at).toBeNull();
    // 法令名を決める検索の 1 回だけ
    expect(h.urls()).toHaveLength(1);
  });

  it('SPEC-EGOV-GET-RELATED-LAWS-004 末尾が「施行令」「施行規則」の法令は、法律でなくても親の法律と兄弟を引く', async () => {
    const r = await h.call('get_related_laws', { law_name: '所得税法施行規則' });
    expect(r.isError).toBe(false);
    expect(r.body.related.map((x: AnyObj) => [x.relation, x.title])).toEqual([
      ['parent_act', '所得税法'],
      ['enforcement_order', '所得税法施行令'],
    ]);
  });
});
