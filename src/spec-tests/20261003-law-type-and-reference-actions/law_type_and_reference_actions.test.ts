/**
 * 差分 20261003-law-type-and-reference-actions の受入テスト（#97・#98）
 *
 * 期待値の正本: specs/changes/20261003-law-type-and-reference-actions/specs/<dir>/spec.md
 * - search_law / search_fulltext の law_type の選択肢（SEARCH-LAW-018・SEARCH-FULLTEXT-038・COMMON-ERRORS-013）
 * - get_article_references の条を持たない external からの get_toc（GET-ARTICLE-REFERENCES-015・036・052）
 */

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  article,
  lawsSearch,
  lawTree,
  paragraph,
  SHOTOKU,
  SHOTOKU_KISOKU,
  SHOTOKU_REI,
} from '../../test-helpers/law-resolution-fixtures.js';
import {
  type AnyObj,
  type Harness,
  json,
  type LawFixture,
  lawDataResponse,
  lawListItem,
  startHarness,
} from '../../test-helpers/mcp-harness.js';
import { tools } from '../../tools/definitions.js';
import { handleSearchFulltext } from '../../tools/handlers.js';

const LAW_TYPES = [
  'Constitution',
  'Act',
  'CabinetOrder',
  'ImperialOrder',
  'MinisterialOrdinance',
  'Rule',
];
const ENUM_MESSAGE =
  'Constitution・Act・CabinetOrder・ImperialOrder・MinisterialOrdinance・Rule のどれかで指定してください';

const KENPO_REI: LawFixture = {
  law_id: '215IO0000000243',
  title: '健康保険法施行令',
  law_num: '大正十五年勅令第二百四十三号',
  law_type: 'ImperialOrder',
};
const KENPO: LawFixture = {
  law_id: '321CONSTITUTION',
  title: '日本国憲法',
  law_num: '昭和二十一年憲法',
  law_type: 'Constitution',
};

const schemaOf = (name: string): AnyObj =>
  tools.find((t) => t.name === name)?.inputSchema as unknown as AnyObj;

describe('law_type の選択肢（20261003-law-type-and-reference-actions）', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness((url) => {
      if (!url.pathname.endsWith('/laws')) return null;
      const type = url.searchParams.get('law_type');
      const title = url.searchParams.get('law_title') ?? '';
      const hits = [KENPO_REI, KENPO].filter(
        (l) => l.title.includes(title) && (type === null || l.law_type === type)
      );
      return json({ total_count: hits.length, count: hits.length, laws: hits.map(lawListItem) });
    });
  });
  afterEach(async () => {
    await h.close();
  });

  it('SPEC-EGOV-SEARCH-LAW-018 inputSchema の law_type は e-Gov の値の enum（勅令は ImperialOrder、Constitution を含む）', () => {
    expect(schemaOf('search_law').properties.law_type.enum).toEqual(LAW_TYPES);
  });

  it('SPEC-EGOV-SEARCH-LAW-018 ImperialOrder で絞ると e-Gov に law_type=ImperialOrder を渡し、勅令を返す', async () => {
    const r = await h.call('search_law', { keyword: '健康保険法', law_type: 'ImperialOrder' });
    expect(r.isError).toBe(false);
    expect(h.urls()[0].searchParams.get('law_type')).toBe('ImperialOrder');
    expect(r.body.results.map((x: AnyObj) => [x.law_id, x.law_type])).toEqual([
      ['215IO0000000243', 'ImperialOrder'],
    ]);
  });

  it('SPEC-EGOV-SEARCH-LAW-018 ImperialOrdinance は e-Gov に問い合わせずに INVALID_ARGUMENT', async () => {
    const r = await h.call('search_law', { keyword: '健康保険法', law_type: 'ImperialOrdinance' });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.tool).toBe('search_law');
    expect(r.body.detail.issues).toEqual([{ path: 'law_type', message: ENUM_MESSAGE }]);
    expect(h.urls()).toHaveLength(0);
  });

  it('SPEC-EGOV-SEARCH-LAW-018 Constitution で日本国憲法を引ける', async () => {
    const r = await h.call('search_law', { keyword: '日本国憲法', law_type: 'Constitution' });
    expect(r.isError).toBe(false);
    expect(r.body.results[0].law_id).toBe('321CONSTITUTION');
  });

  it('SPEC-EGOV-COMMON-ERRORS-013 law_type の enum の文は Constitution・…・ImperialOrder・… の並び', async () => {
    const r = await h.call('search_law', { keyword: '消費税', law_type: 'Bogus' });
    expect(r.body.error).toBe(
      `引数が tools/list の inputSchema に合いません: law_type: ${ENUM_MESSAGE}`
    );
    expect(r.body.detail.issues).toEqual([{ path: 'law_type', message: ENUM_MESSAGE }]);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-038 search_fulltext の law_type も同じ enum で、ImperialOrdinance は DB も e-Gov も引かずに INVALID_ARGUMENT', async () => {
    expect(schemaOf('search_fulltext').properties.law_type.enum).toEqual(LAW_TYPES);
    const r = await h.call('search_fulltext', {
      keyword: '健康保険法施行令',
      law_type: 'ImperialOrdinance',
    });
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.tool).toBe('search_fulltext');
    expect(r.body.detail.issues[0].path).toBe('law_type');
    expect(h.urls()).toHaveLength(0);
  });
});

describe('search_fulltext の law_type（SPEC-EGOV-SEARCH-FULLTEXT-038）', () => {
  const TMP = join(tmpdir(), `houki-egov-spec-ltra-${process.pid}`);
  const DB_EMPTY = join(TMP, 'empty.db');
  beforeAll(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });
  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-038 DB が無いときの search_law への切り替えにも同じ値（ImperialOrder）を渡す', async () => {
    const urls: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        urls.push(new URL(String(input)));
        return json({ total_count: 0, count: 0, laws: [] });
      })
    );
    const r = (await handleSearchFulltext(
      { keyword: '健康保険法施行令', law_type: 'ImperialOrder' },
      { dbPath: DB_EMPTY }
    )) as AnyObj;
    expect(r.source).toBe('api-fallback');
    expect(urls[0].searchParams.get('law_type')).toBe('ImperialOrder');
  });
});

// ---------- get_article_references の条を持たない external ----------

const TOKUREI: LawFixture = {
  law_id: '403AC0000000071',
  title: '日本国との平和条約に基づき日本の国籍を離脱した者等の出入国管理に関する特例法',
  law_num: '平成三年法律第七十一号',
};

const KISOKU_TREE = lawTree(SHOTOKU_KISOKU.title, [
  article('3', '第三条', [
    paragraph(
      '1',
      `${TOKUREI.title}（${TOKUREI.law_num}）の規定により在留する者は、${TOKUREI.title}（${TOKUREI.law_num}）に定める者とし、所得税法（昭和四十年法律第三十三号）第二条第一項第三号に規定する者を除く。`
    ),
  ]),
]);

describe('get_article_references の条を持たない external（20261003-law-type-and-reference-actions）', () => {
  let h: Harness;
  beforeEach(async () => {
    const table = { laws: [SHOTOKU, SHOTOKU_REI, SHOTOKU_KISOKU, TOKUREI] };
    h = await startHarness((url) => {
      if (url.pathname.endsWith('/laws')) return lawsSearch(table, url);
      if (url.pathname.endsWith(`/law_data/${SHOTOKU_KISOKU.law_id}`)) {
        return lawDataResponse(SHOTOKU_KISOKU, KISOKU_TREE);
      }
      return null;
    });
  });
  afterEach(async () => {
    await h.close();
  });

  const call = async (): Promise<AnyObj> => {
    const r = await h.call('get_article_references', {
      law_name: '所得税法施行規則',
      article: '3',
    });
    if (r.isError) throw new Error(r.text);
    return r.body;
  };

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-052 条を持たない external からは get_law を作らず、参照先の法令の get_toc を 1 件だけ入れる', async () => {
    const body = await call();
    const tokurei = body.references.filter(
      (r: AnyObj) => r.kind === 'external' && r.law_id === TOKUREI.law_id
    );
    expect(tokurei.length).toBe(2);
    expect(tokurei.every((r: AnyObj) => r.article === undefined && r.resolved === true)).toBe(true);
    const toTokurei = body.next_actions.filter(
      (a: AnyObj) => a.example?.law_name === TOKUREI.title
    );
    expect(toTokurei).toEqual([
      {
        action: 'get_toc',
        reason: '引用先の法令の目次を見られます',
        example: { law_name: TOKUREI.title },
      },
    ]);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-015 条を持つ external は今までどおり get_law（呼んだ条の番号を参照先の条に使わない）', async () => {
    const body = await call();
    expect(body.next_actions).toContainEqual({
      action: 'get_law',
      reason: '引用先の条を読めます',
      example: { law_name: '所得税法', article: '2', paragraph: 1, item: '3' },
    });
    expect(
      body.next_actions.some(
        (a: AnyObj) => a.action === 'get_law' && a.example?.law_name === TOKUREI.title
      )
    ).toBe(false);
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-036 get_toc の reason は「引用先の法令の目次を見られます」で、references の順の位置に入る', async () => {
    const body = await call();
    const actions = body.next_actions.map((a: AnyObj) => a.action);
    expect(actions.indexOf('get_toc')).toBeLessThan(
      body.next_actions.findIndex(
        (a: AnyObj) => a.action === 'get_law' && a.example?.law_name === '所得税法'
      )
    );
    expect(body.next_actions.find((a: AnyObj) => a.action === 'get_toc').reason).toBe(
      '引用先の法令の目次を見られます'
    );
  });
});
