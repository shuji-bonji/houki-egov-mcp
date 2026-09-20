/**
 * get_law_range が編・章・節（または附則 1 本）の範囲で条を返すこと（egov#22）を、
 * e-Gov クライアントを差し替えて確かめる。
 *
 * フィクスチャは民法の形を小さく写したもの。編を 2 つ置き、どちらの編にも第一章・第二章を
 * 置いてある（`Chapter@Num` は編ごとに振り直されるため、上位を省いた指定は複数に当たる）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LawNode } from './egov-client.js';

const LAW_ID = '999AC0000000001';
const TITLE = 'テスト法';
const LAW_NUM = '令和七年法律第一号';

/** 1 条。本文は `length` 文字（打ち切りの確認で長さを効かせる） */
const article = (num: string, caption: string, length = 20): LawNode => ({
  tag: 'Article',
  attr: { Num: num },
  children: [
    { tag: 'ArticleCaption', attr: {}, children: [`（${caption}）`] },
    { tag: 'ArticleTitle', attr: {}, children: [`第${num}条`] },
    {
      tag: 'Paragraph',
      attr: { Num: '1' },
      children: [{ tag: 'ParagraphSentence', attr: {}, children: ['あ'.repeat(length)] }],
    },
  ],
});

/**
 * 削除された条をまとめた範囲表記の条（e-Gov の `Article@Num` = "4:5"）。
 * 条見出しは無く、`ArticleTitle` が「第四条及び第五条」で本文は「削除」。
 */
const deletedArticles = (num: string, title: string): LawNode => ({
  tag: 'Article',
  attr: { Num: num },
  children: [
    { tag: 'ArticleTitle', attr: {}, children: [title] },
    {
      tag: 'Paragraph',
      attr: { Num: '1' },
      children: [{ tag: 'ParagraphSentence', attr: {}, children: ['削除'] }],
    },
  ],
});

const structural = (tag: string, num: string, title: string, children: LawNode[]): LawNode => ({
  tag,
  attr: { Num: num },
  children: [{ tag: `${tag}Title`, attr: {}, children: [title] }, ...children],
});

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
              structural('Chapter', '1', '第一章　通則', [
                article('1', '趣旨'),
                article('2', '定義'),
              ]),
              structural('Chapter', '2', '第二章　人', [
                // 第3条だけで上限（2,000 文字）を超える長さにして、削除条で打ち切らせる
                article('3', '権利能力', 2500),
                deletedArticles('4:5', '第四条及び第五条'),
              ]),
            ]),
            structural('Part', '2', '第二編　物権', [
              structural('Chapter', '1', '第一章　総則', [article('4', '物権の創設')]),
              structural('Chapter', '2', '第二章　占有権', [
                structural('Section', '1', '第一節　占有権の取得', [
                  // 文字数の上限（既定の下限 2,000 文字）で打ち切られる長さにしてある
                  article('5', '占有権の取得', 900),
                  article('6', '代理占有', 900),
                  article('7', '占有の承継', 2500),
                ]),
                structural('Section', '2_2', '第二節の二　占有権の消滅', [article('8', '消滅')]),
              ]),
            ]),
          ],
        },
        // 制定時の附則（抄）— 条を持つ
        {
          tag: 'SupplProvision',
          attr: { Extract: 'true' },
          children: [
            { tag: 'SupplProvisionLabel', attr: {}, children: ['附　則'] },
            article('1', '施行期日'),
          ],
        },
        // 条を立てず項だけの附則
        {
          tag: 'SupplProvision',
          attr: { AmendLawNum: '平成二年六月二二日法律第三六号' },
          children: [
            { tag: 'SupplProvisionLabel', attr: {}, children: ['附　則'] },
            {
              tag: 'Paragraph',
              attr: { Num: '1' },
              children: [
                {
                  tag: 'ParagraphSentence',
                  attr: {},
                  children: ['この法律は、公布の日から施行する。'],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

vi.mock('./egov-client.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./egov-client.js')>();
  const lawInfo = { law_id: LAW_ID, law_type: 'Act', law_num: LAW_NUM };
  return {
    ...mod,
    searchLaws: async (params: { law_title?: string }) => {
      const hit = params.law_title && TITLE.includes(params.law_title);
      const laws = hit ? [{ law_info: lawInfo, revision_info: { law_title: TITLE } }] : [];
      return { total_count: laws.length, count: laws.length, laws };
    },
    getLawData: async () => ({
      law_info: lawInfo,
      revision_info: { law_title: TITLE },
      law_full_text: LAW_TREE,
    }),
  };
});

const { _resetCachesForTest, getLawRange, getLawToc, isError } = await import('./law-service.js');

/** エラーでないことを確かめてから中身を返す */
const ok = async <T>(p: Promise<T>) => {
  const r = await p;
  if (isError(r as never)) throw new Error(`unexpected error: ${JSON.stringify(r)}`);
  return r as Exclude<T, { error: string }>;
};

/** エラーであることを確かめてから返す */
const err = async <T>(p: Promise<T>) => {
  const r = await p;
  if (!isError(r as never)) throw new Error(`error を期待しました: ${JSON.stringify(r)}`);
  return r as Extract<T, { error: string; code: string }>;
};

beforeEach(() => {
  _resetCachesForTest();
});

describe('get_law_range の範囲の指定（#22）', () => {
  it('編と章を指定するとその章の条だけを返し、範囲を range に入れる', async () => {
    const r = await ok(getLawRange({ law_name: TITLE, part: 1, chapter: 1 }));

    expect(r.range.path).toBe('Part1/Chapter1');
    expect(r.range.tag).toBe('Chapter');
    expect(r.range.titles).toEqual(['第一編　総則', '第一章　通則']);
    expect(r.range.article_count).toBe(2);
    expect(r.range.returned_count).toBe(2);
    expect(r.range.truncated).toBe(false);
    expect(r.articles.map((a) => a.num)).toEqual(['1', '2']);
    expect(r.articles[0].caption).toBe('（趣旨）');
    expect(r.markdown).toContain('# テスト法 第一編　総則 第一章　通則');
    expect(r.markdown).toContain('## 第1条');
    expect(r.markdown).not.toContain('## 第3条');
  });

  it('漢数字と「第三編」の表記でも同じ範囲を指す', async () => {
    const r = await ok(getLawRange({ law_name: TITLE, part: '第二編', chapter: '二' }));
    expect(r.range.path).toBe('Part2/Chapter2');
    expect(r.range.article_count).toBe(4);
  });

  it('節の枝番号（第二節の二）を指定できる', async () => {
    const r = await ok(getLawRange({ law_name: TITLE, part: 2, chapter: 2, section: '2の2' }));
    expect(r.range.path).toBe('Part2/Chapter2/Section2_2');
    expect(r.range.tag).toBe('Section');
    expect(r.articles.map((a) => a.num)).toEqual(['8']);
  });

  it('get_toc が返す path をそのまま渡せる', async () => {
    const toc = await ok(getLawToc({ law_name: TITLE, suppl: 'none' }));
    const path = toc.toc[1].children[1].path;
    expect(path).toBe('Part2/Chapter2');

    const r = await ok(getLawRange({ law_name: TITLE, path: path as string }));
    expect(r.range.path).toBe('Part2/Chapter2');
    expect(r.range.titles).toEqual(['第二編　物権', '第二章　占有権']);
  });

  it('上位を省いた指定が複数に当たるときは候補のパスを返す', async () => {
    const e = await err(getLawRange({ law_name: TITLE, chapter: 2 }));

    expect(e.code).toBe('INVALID_ARGUMENT');
    expect(e.error).toContain('2 か所');
    expect(e.hint).toContain('Part1/Chapter2');
    expect(e.hint).toContain('Part2/Chapter2');
    expect(e.next_actions?.map((a) => a.example?.path)).toEqual([
      'Part1/Chapter2',
      'Part2/Chapter2',
    ]);
  });

  it('範囲が無いときは RANGE_NOT_FOUND を返す', async () => {
    const e = await err(getLawRange({ law_name: TITLE, part: 9 }));
    expect(e.code).toBe('RANGE_NOT_FOUND');
    expect(e.next_actions?.[0].action).toBe('get_toc');
  });

  it('範囲の指定が無いときと、2 通り同時に指定したときはエラーにする', async () => {
    const none = await err(getLawRange({ law_name: TITLE }));
    expect(none.code).toBe('INVALID_ARGUMENT');
    expect(none.error).toContain('範囲を指定してください');

    const both = await err(getLawRange({ law_name: TITLE, path: 'Part1', chapter: 1 }));
    expect(both.code).toBe('INVALID_ARGUMENT');
    expect(both.error).toContain('1 通りにしてください');
  });

  it('path の書式が不正なときはエラーにする', async () => {
    const e = await err(getLawRange({ law_name: TITLE, path: '第一編/第一章' }));
    expect(e.code).toBe('INVALID_ARGUMENT');
    expect(e.error).toContain('path の形式が不正です');
  });
});

describe('get_law_range の文字数の上限（#22）', () => {
  it('上限を超える範囲は条の単位で打ち切り、続きの条番号を返す', async () => {
    const r = await ok(
      getLawRange({ law_name: TITLE, part: 2, chapter: 2, section: 1, max_chars: 2000 })
    );

    expect(r.range.article_count).toBe(3);
    expect(r.range.returned_count).toBe(2);
    expect(r.range.truncated).toBe(true);
    expect(r.range.next_from_article).toBe('7');
    expect(r.range.first_article).toBe('第5条');
    expect(r.range.last_article).toBe('第6条');
    expect(r.range.body_chars).toBeLessThanOrEqual(2000);
    expect(r.range.note).toContain('from_article: "7"');
    expect(r.range.next_actions?.[0]).toEqual({
      action: 'get_law_range',
      reason: '同じ範囲の続きの条から取れます',
      example: { law_name: TITLE, path: 'Part2/Chapter2/Section1', from_article: '7' },
    });
    expect(r.markdown).toContain('上限で打ち切りました');
  });

  it('from_article で続きから返し、飛ばした条数を skipped_count に入れる', async () => {
    const r = await ok(
      getLawRange({
        law_name: TITLE,
        part: 2,
        chapter: 2,
        section: 1,
        from_article: '7',
      })
    );

    expect(r.range.skipped_count).toBe(2);
    expect(r.range.returned_count).toBe(1);
    expect(r.range.truncated).toBe(false);
    expect(r.articles.map((a) => a.num)).toEqual(['7']);
    expect(r.range.note).toContain('先頭の 2 件は from_article より前');
  });

  it('1 条だけで上限を超えるときも、その 1 条は返す', async () => {
    // 第7条は本文が 2,500 文字あり、1 条だけで上限（2,000 文字）を超える
    const r = await ok(
      getLawRange({
        law_name: TITLE,
        part: 2,
        chapter: 2,
        section: 1,
        max_chars: 2000,
        from_article: '7',
      })
    );
    expect(r.range.returned_count).toBe(1);
    expect(r.range.body_chars).toBeGreaterThan(2000);
    expect(r.range.truncated).toBe(false);
  });

  it('範囲にない条を from_article に渡すと ARTICLE_NOT_FOUND を返す', async () => {
    const e = await err(getLawRange({ law_name: TITLE, part: 1, chapter: 1, from_article: '999' }));
    expect(e.code).toBe('ARTICLE_NOT_FOUND');
    expect(e.hint).toContain('第1条');
  });
});

describe('get_law_range の附則（#22）', () => {
  it('suppl_index で附則 1 本の条を返す', async () => {
    const r = await ok(getLawRange({ law_name: TITLE, suppl_index: 1 }));

    expect(r.range.suppl_index).toBe(1);
    expect(r.range.path).toBeUndefined();
    expect(r.range.tag).toBe('SupplProvision');
    expect(r.range.titles).toEqual(['附則(1) 制定時（抄）']);
    expect(r.articles.map((a) => a.num)).toEqual(['1']);
    expect(r.markdown).toContain('# テスト法 附則(1) 制定時（抄）');
  });

  it('条を持たず項だけの附則は、範囲の本文をそのまま返す', async () => {
    const r = await ok(getLawRange({ law_name: TITLE, suppl_index: 2 }));

    expect(r.range.article_count).toBe(0);
    expect(r.range.returned_count).toBe(0);
    expect(r.range.note).toContain('条を持たず項だけ');
    expect(r.markdown).toContain('この法律は、公布の日から施行する。');
  });

  it('無い附則の番号は RANGE_NOT_FOUND を返し、本数を hint に入れる', async () => {
    const e = await err(getLawRange({ law_name: TITLE, suppl_index: 99 }));
    expect(e.code).toBe('RANGE_NOT_FOUND');
    expect(e.hint).toContain('附則は 2 本');
  });

  it('本則の範囲には附則の条が入らない', async () => {
    const r = await ok(getLawRange({ law_name: TITLE, part: 1, max_chars: 120000 }));
    // 第一編は第1条〜第3条と削除条（第4条及び第5条）。附則の第1条は入らない
    expect(r.articles.map((a) => a.num)).toEqual(['1', '2', '3', '4:5']);
    expect(r.range.article_count).toBe(4);
  });

  it('削除された条をまとめた範囲表記でも続きが取れる（v0.14.1）', async () => {
    const first = await ok(getLawRange({ law_name: TITLE, part: 1, chapter: 2, max_chars: 2000 }));
    // 第3条だけで上限を超えるので 1 条返して打ち切り、続きは削除条から
    expect(first.range.returned_count).toBe(1);
    expect(first.range.truncated).toBe(true);
    expect(first.range.next_from_article).toBe('4:5');

    const next = await ok(
      getLawRange({ law_name: TITLE, part: 1, chapter: 2, from_article: '4:5' })
    );
    expect(next.range.skipped_count).toBe(1);
    expect(next.articles.map((a) => a.label)).toEqual(['第4条及び第5条']);
    expect(next.range.first_article).toBe('第4条及び第5条');
    expect(next.markdown).toContain('## 第4条及び第5条');
    expect(next.markdown).toContain('削除');
  });
});
