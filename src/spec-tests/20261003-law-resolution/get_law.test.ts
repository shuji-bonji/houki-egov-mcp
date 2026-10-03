/**
 * 差分 20261003-law-resolution の受入テスト — get_law（#45・#51・#87）
 *
 * 期待値の正本: specs/changes/20261003-law-resolution/specs/get_law/spec.md と
 * specs/changes/20261003-law-resolution/specs/common_errors/spec.md（032・033）
 * e-Gov への通信は差し替える（値は proposal.md の「確かめた値」）。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ASOF_400044,
  ASOF_400044_MESSAGE,
  article,
  GYOSEI_IT,
  GYOSEI_IT_OLD_TITLE,
  HOKEN,
  hokenLaws,
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
  SUPPL_100_CAPTION,
  SUPPL_168_NUM,
  shohiTree,
  supplProvision,
} from '../../test-helpers/law-resolution-fixtures.js';
import {
  type AnyObj,
  type Harness,
  json,
  type LawFixture,
  lawDataResponse,
  type Route,
  simpleLawTree,
  startHarness,
} from '../../test-helpers/mcp-harness.js';

/** 本則に第1条だけがあり、第2条が 7 本の附則にある法令（next_actions の 5 件の上限を確かめる） */
const MANY: LawFixture = {
  law_id: '499AC0000000999',
  title: '架空多附則法',
  law_num: '令和九十九年法律第九百九十九号',
};
const MANY_TREE = lawTree(
  MANY.title,
  [article('1', '第一条', [paragraph('1', '本則')])],
  Array.from({ length: 7 }, (_, i) =>
    supplProvision(`令和元年五月${i + 1}日法律第${i + 1}号`, [
      article('2', '第二条', [paragraph('1', `附則(${i + 1})の第二条`)]),
    ])
  )
);

const TABLE: LawsTable = {
  laws: [SHOTOKU_REI, SHOTOKU_KISOKU, ...hokenLaws(), GYOSEI_IT, MANY],
  asofTitles: { '2018-01-01': { [GYOSEI_IT.law_id]: GYOSEI_IT_OLD_TITLE } },
};

function defaultRoute(url: URL): Response | null {
  if (url.pathname.endsWith('/laws')) return lawsSearch(TABLE, url);
  const m = /\/law_data\/([^/]+)$/.exec(url.pathname);
  if (!m) return null;
  const id = m[1];
  if (id === SHOHI.law_id) return lawDataResponse(SHOHI, shohiTree());
  if (id === MANY.law_id) return lawDataResponse(MANY, MANY_TREE);
  const all: LawFixture[] = [...TABLE.laws, SHOTOKU];
  const f = all.find((l) => l.law_id === id);
  return f ? lawDataResponse(f, simpleLawTree(f.title)) : null;
}

describe('get_law（20261003-law-resolution）', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness(defaultRoute);
  });
  afterEach(async () => {
    await h.close();
  });

  const lawsCalls = () => h.urls().filter((u) => u.pathname.endsWith('/laws'));
  const lawDataCalls = () => h.urls().filter((u) => u.pathname.includes('/law_data/'));

  // ---------- #45 完全一致しない法令名 ----------

  it('SPEC-EGOV-GET-LAW-041 完全一致しない法令名は、条文を返さず候補を付けた LAW_NOT_FOUND を返す', async () => {
    const r = await h.call('get_law', { law_name: '所得税法施行', article: '1' });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('LAW_NOT_FOUND');
    expect(r.body.retryable).toBe(false);
    expect(r.body.error).toBe('完全一致する法令名がありません: 所得税法施行（部分一致 2 件）');
    expect(r.body.hint).toBe(
      '部分一致した法令（先頭 2 件）: 所得税法施行令（昭和四十年政令第九十六号）、所得税法施行規則（昭和四十年大蔵省令第十一号）。求めた法令なら、その題名を law_name に渡して呼び直してください'
    );
    expect(r.body.next_actions).toHaveLength(3);
    expect(r.body.next_actions[0]).toEqual({
      action: 'get_law',
      reason: '所得税法施行令（昭和四十年政令第九十六号）を指すなら、この名前で呼び直せます',
      example: { law_name: '所得税法施行令', article: '1' },
    });
    expect(r.body.next_actions[1]).toEqual({
      action: 'get_law',
      reason: '所得税法施行規則（昭和四十年大蔵省令第十一号）を指すなら、この名前で呼び直せます',
      example: { law_name: '所得税法施行規則', article: '1' },
    });
    expect(r.body.next_actions[2]).toMatchObject({
      action: 'search_law',
      example: { keyword: '所得税法施行' },
    });
    expect(typeof r.body.next_actions[2].reason).toBe('string');
    // 法令本文は取らない
    expect(lawDataCalls()).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-LAW-041 候補の example は、渡した引数の law_name だけを替えたもの（渡さなかった引数は足さない）', async () => {
    const r = await h.call('get_law', {
      law_name: '所得税法施行',
      article: '2',
      paragraph: 1,
      format: 'json',
    });
    expect(r.body.code).toBe('LAW_NOT_FOUND');
    expect(r.body.next_actions[0].example).toEqual({
      law_name: '所得税法施行令',
      article: '2',
      paragraph: 1,
      format: 'json',
    });
  });

  it('SPEC-EGOV-GET-LAW-041 保険法は検索結果の全件（114 件）から完全一致を探し、78 件目の保険法の第1条を返す', async () => {
    const r = await h.call('get_law', { law_name: '保険法', article: '1', format: 'json' });
    expect(r.isError).toBe(false);
    expect(r.body.meta.law_id).toBe(HOKEN.law_id);
    expect(r.body.meta.title).toBe('保険法');
    expect(lawDataCalls().map((u) => u.pathname)).toEqual([`/api/2/law_data/${HOKEN.law_id}`]);
  });

  it('SPEC-EGOV-GET-LAW-041 at を渡したときは法令名の検索にも asof を付ける', async () => {
    const r = await h.call('get_law', { law_name: '所得税法施行', article: '1', at: '2024-04-01' });
    expect(r.body.code).toBe('LAW_NOT_FOUND');
    expect(lawsCalls().every((u) => u.searchParams.get('asof') === '2024-04-01')).toBe(true);
    expect(r.body.next_actions[0].example).toEqual({
      law_name: '所得税法施行令',
      article: '1',
      at: '2024-04-01',
    });
  });

  it('SPEC-EGOV-COMMON-ERRORS-032 改題した法令は旧題名と at で引け、at が無ければ候補付きの LAW_NOT_FOUND', async () => {
    const withAt = await h.call('get_law', {
      law_name: GYOSEI_IT_OLD_TITLE,
      article: '1',
      at: '2018-01-01',
      format: 'json',
    });
    expect(withAt.isError).toBe(false);
    expect(withAt.body.meta.law_id).toBe(GYOSEI_IT.law_id);
    const withoutAt = await h.call('get_law', { law_name: GYOSEI_IT_OLD_TITLE, article: '1' });
    expect(withoutAt.body.code).toBe('LAW_NOT_FOUND');
    expect(withoutAt.body.error).toBe(
      `完全一致する法令名がありません: ${GYOSEI_IT_OLD_TITLE}（部分一致 1 件）`
    );
    expect(withoutAt.body.next_actions[0].example).toEqual({
      law_name: GYOSEI_IT.title,
      article: '1',
    });
  });

  // ---------- #51 本則と附則 ----------

  it('SPEC-EGOV-GET-LAW-008 article の条は本則から取り出す（同じ番号の附則の条ではない）', async () => {
    const r = await h.call('get_law', { law_name: '消費税法', article: '1' });
    expect(r.isError).toBe(false);
    expect(r.text).toContain('本則の第一条');
    expect(r.text).not.toContain('施行期日');
    const r30 = await h.call('get_law', { law_name: '消費税法', article: '30' });
    expect((r30.body.markdown as string).split('\n')[0]).toBe('# 消費税法 第30条');
  });

  it('SPEC-EGOV-GET-LAW-042 本則に無く附則にだけある条番号は ARTICLE_NOT_FOUND にし、附則の番号を案内する', async () => {
    const r = await h.call('get_law', { law_name: '消費税法', article: '100' });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('ARTICLE_NOT_FOUND');
    expect(r.body.hint).toBe(
      `本則に第100条はありません。附則に同じ番号の条があります: 附則(27) ${SUPPL_27_NUM}、附則(168) ${SUPPL_168_NUM}。附則の条は suppl_index で附則を指して取ります`
    );
    expect(r.body.next_actions).toEqual([
      {
        action: 'get_law',
        reason: `附則(27) ${SUPPL_27_NUM} の第100条を取れます`,
        example: { law_name: '消費税法', article: '100', suppl_index: 27 },
      },
      {
        action: 'get_law',
        reason: `附則(168) ${SUPPL_168_NUM} の第100条を取れます`,
        example: { law_name: '消費税法', article: '100', suppl_index: 168 },
      },
    ]);
  });

  it('SPEC-EGOV-GET-LAW-042 next_actions は附則の出現順に先頭の 5 件まで（hint には同じ番号の条を持つ附則を並べる）', async () => {
    const r = await h.call('get_law', { law_name: MANY.title, article: '2', format: 'json' });
    expect(r.body.code).toBe('ARTICLE_NOT_FOUND');
    expect(r.body.next_actions.map((a: AnyObj) => a.example.suppl_index)).toEqual([1, 2, 3, 4, 5]);
    expect(r.body.next_actions[0].example).toEqual({
      law_name: MANY.title,
      article: '2',
      format: 'json',
      suppl_index: 1,
    });
    expect(r.body.hint).toContain('附則(7) 令和元年五月7日法律第7号');
  });

  it('SPEC-EGOV-GET-LAW-042 附則にも無い条番号は今までどおりの ARTICLE_NOT_FOUND（附則の案内は付けない）', async () => {
    const r = await h.call('get_law', { law_name: '消費税法', article: '999' });
    expect(r.body.code).toBe('ARTICLE_NOT_FOUND');
    expect(r.body.hint ?? '').not.toContain('附則に同じ番号の条があります');
    expect((r.body.next_actions ?? []).some((a: AnyObj) => a.example?.suppl_index)).toBe(false);
  });

  it('SPEC-EGOV-GET-LAW-043 suppl_index で附則を指すと、その附則の条を markdown で返す（1 行目・2 行目・条見出し）', async () => {
    const r = await h.call('get_law', { law_name: '消費税法', article: '100', suppl_index: 27 });
    expect(r.isError).toBe(false);
    const lines = (r.body.markdown as string).split('\n');
    expect(lines[0]).toBe('# 消費税法 附則(27) 第100条');
    expect(lines[1]).toBe(`附則(27) ${SUPPL_27_NUM}（抄）`);
    expect(lines[2]).toBe(SUPPL_100_CAPTION);
    expect(r.text).toContain('附則第百条第一項の本文');
    const r168 = await h.call('get_law', {
      law_name: '消費税法',
      article: '100',
      suppl_index: 168,
    });
    expect((r168.body.markdown as string).split('\n')[1]).toBe(`附則(168) ${SUPPL_168_NUM}`);
    expect(r168.text).toContain('附則(168)の第百条の本文');
  });

  it('SPEC-EGOV-GET-LAW-043 附則の条の項・号を指すと、1 行目に項・号を続ける', async () => {
    const r = await h.call('get_law', {
      law_name: '消費税法',
      article: '100',
      suppl_index: 27,
      paragraph: 1,
      item: 2,
    });
    expect(r.isError).toBe(false);
    expect((r.body.markdown as string).split('\n')[0]).toBe(
      '# 消費税法 附則(27) 第100条第1項第2号'
    );
    expect(r.text).toContain('附則第百条第一項第二号の本文');
  });

  it('SPEC-EGOV-GET-LAW-043 json の data.suppl_index は附則の番号、本則の条では null（キーは常に置く）', async () => {
    const s = await h.call('get_law', {
      law_name: '消費税法',
      article: '100',
      suppl_index: 27,
      format: 'json',
    });
    expect(s.body.data.suppl_index).toBe(27);
    const m = await h.call('get_law', { law_name: '消費税法', article: '30', format: 'json' });
    expect(m.body.data).toHaveProperty('suppl_index');
    expect(m.body.data.suppl_index).toBeNull();
  });

  it('SPEC-EGOV-GET-LAW-043 附則の本数より大きい suppl_index は RANGE_NOT_FOUND（hint に附則の本数）', async () => {
    const r = await h.call('get_law', { law_name: '消費税法', article: '100', suppl_index: 999 });
    expect(r.body.code).toBe('RANGE_NOT_FOUND');
    expect(r.body.hint).toContain('附則は 168 本');
  });

  it('SPEC-EGOV-GET-LAW-043 その附則に条が無ければ ARTICLE_NOT_FOUND、項だけの附則なら get_law_range を案内する', async () => {
    const r = await h.call('get_law', { law_name: '消費税法', article: '5', suppl_index: 27 });
    expect(r.body.code).toBe('ARTICLE_NOT_FOUND');
    expect(r.body.error).toBe('条文が見つかりません: 附則(27) 第5条');
    const p = await h.call('get_law', { law_name: '消費税法', article: '1', suppl_index: 5 });
    expect(p.body.code).toBe('ARTICLE_NOT_FOUND');
    expect(p.body.error).toBe('条文が見つかりません: 附則(5) 第1条');
    expect(p.body.hint).toContain('この附則は条を立てず項だけで書かれています');
    expect(p.body.next_actions).toContainEqual(
      expect.objectContaining({
        action: 'get_law_range',
        example: { law_name: '消費税法', suppl_index: 5 },
      })
    );
  });

  it('SPEC-EGOV-GET-LAW-043 article を渡さず suppl_index だけを渡すと INVALID_ARGUMENT、format: toc なら suppl_index を使わない', async () => {
    const r = await h.call('get_law', { law_name: '消費税法', suppl_index: 27 });
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.error).toBe('suppl_index を渡すときは article も渡してください');
    expect(r.body.next_actions).toContainEqual(
      expect.objectContaining({
        action: 'get_law_range',
        example: { law_name: '消費税法', suppl_index: 27 },
      })
    );
    const toc = await h.call('get_law', { law_name: '消費税法', suppl_index: 27, format: 'toc' });
    expect(toc.isError).toBe(false);
    expect(toc.body.format).toBe('toc');
    expect(toc.body.markdown).toContain('消費税法');
  });

  it('SPEC-EGOV-GET-LAW-043 inputSchema の suppl_index は integer・minimum 1 で、0 は INVALID_ARGUMENT', async () => {
    const r = await h.call('get_law', { law_name: '消費税法', article: '100', suppl_index: 0 });
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.detail.issues).toEqual([
      { path: 'suppl_index', message: '1 以上で指定してください' },
    ]);
    for (const v of [-1, 1.5]) {
      const x = await h.call('get_law', { law_name: '消費税法', article: '100', suppl_index: v });
      expect(x.body.code).toBe('INVALID_ARGUMENT');
    }
  });

  // ---------- #87 law_id を決めた後の 400・404 ----------

  async function withLawData(res: () => Response): Promise<void> {
    const route: Route = (url) => (url.pathname.includes('/law_data/') ? res() : defaultRoute(url));
    h.setRoute(route);
  }

  it('SPEC-EGOV-GET-LAW-031 法令本文の取得が 404・404004 なら LAW_NOT_FOUND（at を渡さないときの文）', async () => {
    await withLawData(NOT_FOUND_404004);
    const r = await h.call('get_law', { law_name: '消費税法', article: '30' });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('LAW_NOT_FOUND');
    expect(r.body.retryable).toBe(false);
    expect(r.body.error).toBe('e-Gov に law_id 363AC0000000108 の法令がありません');
    expect(r.body.hint).toBe(
      '略称辞書の law_id が古い（廃止・統合された）か、law_id の書き間違いの可能性があります'
    );
    expect(r.body.next_actions).toEqual([
      expect.objectContaining({ action: 'search_law', example: { keyword: '消費税法' } }),
    ]);
    expect(r.body.detail.status).toBe(404);
    expect(r.body.detail.cause).toBe('404004');
    expect(r.body.detail.url).toContain('/law_data/363AC0000000108');
  });

  it('SPEC-EGOV-GET-LAW-031 at を渡して 404・404004 なら、時点に無いことを書き get_law_revisions を先に案内する', async () => {
    await withLawData(NOT_FOUND_404004);
    const r = await h.call('get_law', { law_name: '消費税法', article: '30', at: '2024-04-01' });
    expect(r.body.code).toBe('LAW_NOT_FOUND');
    expect(r.body.error).toBe('消費税法 は 2024-04-01 の時点の e-Gov に収録されていません');
    expect(r.body.hint).toBe(
      'その時点にこの法令がまだ無いか、law_id が古い可能性があります。改正履歴で施行日を確かめるか、at を省いて呼び直してください'
    );
    expect(r.body.next_actions.map((a: AnyObj) => a.action)).toEqual([
      'get_law_revisions',
      'search_law',
    ]);
    expect(r.body.next_actions[0].example).toEqual({ law_name: '消費税法' });
    expect(r.body.next_actions[1].example).toEqual({ keyword: '消費税法' });
    expect(r.body.detail.url).toContain('asof=2024-04-01');
  });

  it('SPEC-EGOV-GET-LAW-031 at が e-Gov の範囲の外（400・400044）なら INVALID_ARGUMENT（path: at、hint に e-Gov の message）', async () => {
    await withLawData(ASOF_400044);
    const r = await h.call('get_law', { law_name: '所得税法', article: '9', at: '2000-01-01' });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.tool).toBe('get_law');
    expect(r.body.error).toBe('at の時点を e-Gov が受け付けません: 2000-01-01');
    expect(r.body.detail.issues).toEqual([
      { path: 'at', message: 'e-Gov が受け付ける時点の範囲の外です' },
    ]);
    expect(r.body.hint).toContain(ASOF_400044_MESSAGE);
    expect(r.body.detail.status).toBe(400);
    expect(r.body.detail.cause).toBe('400044');
    expect(r.body.detail.url).toContain('asof=2000-01-01');
    expect(r.body.retryable).toBe(false);
  });

  it('SPEC-EGOV-GET-LAW-031 そのほかの 4xx（403、本文の code が読めない 404）は SOURCE_API_ERROR・retryable: false のまま', async () => {
    await withLawData(() => json({ code: '403000', message: 'forbidden' }, 403));
    const r = await h.call('get_law', { law_name: '消費税法', article: '30' });
    expect(r.body.code).toBe('SOURCE_API_ERROR');
    expect(r.body.retryable).toBe(false);
    expect(r.body.detail.status).toBe(403);
    await withLawData(() => new Response('Not Found', { status: 404 }));
    const r2 = await h.call('get_law', { law_name: '民法', article: '1' });
    expect(r2.body.code).toBe('SOURCE_API_ERROR');
    expect(r2.body.retryable).toBe(false);
    expect(r2.body.detail.status).toBe(404);
  });
});
