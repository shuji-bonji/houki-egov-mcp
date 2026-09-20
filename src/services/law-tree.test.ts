import { describe, expect, it } from 'vitest';
import type { LawNode } from './egov-client.js';
import {
  countTocArticles,
  countTocNodes,
  extractSupplProvisions,
  extractText,
  extractToc,
  findArticle,
  findChildByTag,
  findChildrenByTag,
  findItem,
  findParagraph,
  findParagraphForItem,
  getArticleCaption,
  getArticleTitle,
  getLawTitle,
  limitTocDepth,
} from './law-tree.js';

// 消費税法 第30条第1項 を簡略化したフィクスチャ
const fixture: LawNode = {
  tag: 'Law',
  attr: { Era: 'Showa', Year: '63', Num: '108' },
  children: [
    {
      tag: 'LawNum',
      children: ['昭和六十三年法律第百八号'],
    },
    {
      tag: 'LawBody',
      children: [
        { tag: 'LawTitle', children: ['消費税法'] },
        {
          tag: 'MainProvision',
          children: [
            {
              tag: 'Chapter',
              attr: { Num: '3' },
              children: [
                { tag: 'ChapterTitle', children: ['第三章　税額控除等'] },
                {
                  tag: 'Article',
                  attr: { Num: '30' },
                  children: [
                    { tag: 'ArticleCaption', children: ['（仕入れに係る消費税額の控除）'] },
                    { tag: 'ArticleTitle', children: ['第三十条'] },
                    {
                      tag: 'Paragraph',
                      attr: { Num: '1' },
                      children: [
                        { tag: 'ParagraphNum', children: [] },
                        {
                          tag: 'ParagraphSentence',
                          children: [
                            { tag: 'Sentence', children: ['事業者…課税仕入れに係る消費税額…'] },
                          ],
                        },
                        {
                          tag: 'Item',
                          attr: { Num: '1' },
                          children: [
                            { tag: 'ItemTitle', children: ['一'] },
                            {
                              tag: 'ItemSentence',
                              children: [
                                {
                                  tag: 'Sentence',
                                  children: ['国内において課税仕入れを行つた場合'],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  tag: 'Article',
                  attr: { Num: '30_2' },
                  children: [
                    { tag: 'ArticleCaption', children: ['（の2の見出し）'] },
                    { tag: 'ArticleTitle', children: ['第三十条の二'] },
                    {
                      tag: 'Paragraph',
                      attr: { Num: '1' },
                      children: [
                        {
                          tag: 'ParagraphSentence',
                          children: ['本文'],
                        },
                      ],
                    },
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

describe('extractText', () => {
  it('extracts string children', () => {
    expect(extractText({ tag: 'X', children: ['hello'] })).toBe('hello');
  });

  it('concatenates nested string children', () => {
    expect(
      extractText({
        tag: 'X',
        children: [
          { tag: 'A', children: ['foo '] },
          { tag: 'B', children: ['bar'] },
        ],
      })
    ).toBe('foo bar');
  });

  it('handles null/undefined', () => {
    expect(extractText(null)).toBe('');
    expect(extractText(undefined)).toBe('');
  });
});

describe('findArticle', () => {
  it('finds article by Num', () => {
    const a = findArticle(fixture, '30');
    expect(a).not.toBeNull();
    expect(a?.attr?.Num).toBe('30');
  });

  it('finds article with の2 (underscore)', () => {
    const a = findArticle(fixture, '30_2');
    expect(a).not.toBeNull();
    expect(a?.attr?.Num).toBe('30_2');
  });

  it('returns null for missing article', () => {
    expect(findArticle(fixture, '999')).toBeNull();
  });
});

describe('findParagraph / findItem', () => {
  it('finds paragraph by num', () => {
    const a = findArticle(fixture, '30')!;
    const p = findParagraph(a, 1);
    expect(p?.attr?.Num).toBe('1');
  });

  it('finds item within paragraph', () => {
    const a = findArticle(fixture, '30')!;
    const p = findParagraph(a, 1)!;
    const i = findItem(p, '1');
    expect(i?.attr?.Num).toBe('1');
  });

  it('findParagraphForItem: 項が 1 つの条はその項、複数ある条は null (v0.6.0)', () => {
    const single: LawNode = {
      tag: 'Article',
      attr: { Num: '14_3' },
      children: [
        { tag: 'ArticleTitle', children: ['第十四条の三'] },
        { tag: 'Paragraph', attr: { Num: '1' }, children: [] },
      ],
    };
    expect(findParagraphForItem(single)?.attr?.Num).toBe('1');
    const multi: LawNode = {
      tag: 'Article',
      attr: { Num: '2' },
      children: [
        { tag: 'Paragraph', attr: { Num: '1' }, children: [] },
        { tag: 'Paragraph', attr: { Num: '2' }, children: [] },
      ],
    };
    expect(findParagraphForItem(multi)).toBeNull();
  });

  it('finds a branch-numbered item by e-Gov Num (v0.6.0)', () => {
    const p: LawNode = {
      tag: 'Paragraph',
      attr: { Num: '1' },
      children: [
        { tag: 'Item', attr: { Num: '8' }, children: [] },
        { tag: 'Item', attr: { Num: '8_2' }, children: [] },
      ],
    };
    expect(findItem(p, '8_2')?.attr?.Num).toBe('8_2');
    expect(findItem(p, '8')?.attr?.Num).toBe('8');
    expect(findItem(p, '9')).toBeNull();
  });
});

describe('getArticleCaption / getArticleTitle', () => {
  it('extracts caption', () => {
    const a = findArticle(fixture, '30')!;
    expect(getArticleCaption(a)).toBe('（仕入れに係る消費税額の控除）');
  });

  it('extracts title', () => {
    const a = findArticle(fixture, '30')!;
    expect(getArticleTitle(a)).toBe('第三十条');
  });
});

describe('extractToc', () => {
  it('extracts hierarchical TOC', () => {
    const toc = extractToc(fixture);
    expect(toc.length).toBeGreaterThan(0);
    const chapter = toc[0];
    expect(chapter.tag).toBe('Chapter');
    expect(chapter.title).toContain('税額控除等');
    expect(chapter.children.length).toBeGreaterThan(0);
    const firstArticle = chapter.children.find((c) => c.tag === 'Article');
    expect(firstArticle?.num).toBe('30');
  });
});

describe('getLawTitle', () => {
  it('extracts law title from LawBody', () => {
    expect(getLawTitle(fixture)).toBe('消費税法');
  });
});

describe('findChildByTag / findChildrenByTag', () => {
  it('finds first matching child', () => {
    const node: LawNode = {
      tag: 'X',
      children: [
        { tag: 'A', children: ['1'] },
        { tag: 'A', children: ['2'] },
      ],
    };
    expect(extractText(findChildByTag(node, 'A'))).toBe('1');
  });

  it('finds all matching children', () => {
    const node: LawNode = {
      tag: 'X',
      children: [
        { tag: 'A', children: ['1'] },
        { tag: 'B', children: ['skip'] },
        { tag: 'A', children: ['2'] },
      ],
    };
    expect(findChildrenByTag(node, 'A').length).toBe(2);
  });
});

// 大規模法令を想定した深い階層フィクスチャ（Part > Chapter > Section > Article）
const deepFixture: LawNode = {
  tag: 'Law',
  children: [
    {
      tag: 'LawBody',
      children: [
        { tag: 'LawTitle', children: ['深い法令'] },
        {
          tag: 'MainProvision',
          children: [
            {
              tag: 'Part',
              attr: { Num: '1' },
              children: [
                { tag: 'PartTitle', children: ['第一編 総則'] },
                {
                  tag: 'Chapter',
                  attr: { Num: '1' },
                  children: [
                    { tag: 'ChapterTitle', children: ['第一章 通則'] },
                    {
                      tag: 'Section',
                      attr: { Num: '1' },
                      children: [
                        { tag: 'SectionTitle', children: ['第一節 X'] },
                        {
                          tag: 'Article',
                          attr: { Num: '1' },
                          children: [{ tag: 'ArticleTitle', children: ['第一条'] }],
                        },
                      ],
                    },
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

describe('limitTocDepth', () => {
  it('depth=1 keeps only the top structural level (Part)', () => {
    const toc = extractToc(deepFixture);
    const limited = limitTocDepth(toc, 1);
    expect(limited.length).toBe(1);
    expect(limited[0].tag).toBe('Part');
    expect(limited[0].children).toEqual([]);
  });

  it('depth=2 keeps Part and Chapter', () => {
    const toc = extractToc(deepFixture);
    const limited = limitTocDepth(toc, 2);
    const part = limited[0];
    expect(part.tag).toBe('Part');
    expect(part.children).toHaveLength(1);
    expect(part.children[0].tag).toBe('Chapter');
    expect(part.children[0].children).toEqual([]);
  });

  it('depth=3 keeps down to Section (Article still trimmed off Section)', () => {
    const toc = extractToc(deepFixture);
    const limited = limitTocDepth(toc, 3);
    const section = limited[0].children[0].children[0];
    expect(section.tag).toBe('Section');
    expect(section.children).toEqual([]);
  });

  it('depth >= structural depth keeps everything (Article preserved)', () => {
    const toc = extractToc(deepFixture);
    const limited = limitTocDepth(toc, 4);
    const section = limited[0].children[0].children[0];
    expect(section.children[0].tag).toBe('Article');
  });

  it('invalid depth (<= 0) returns the input unchanged', () => {
    const toc = extractToc(deepFixture);
    expect(limitTocDepth(toc, 0)).toBe(toc);
    expect(limitTocDepth(toc, -1)).toBe(toc);
  });

  it('does not mutate the original TOC', () => {
    const toc = extractToc(deepFixture);
    const before = JSON.stringify(toc);
    limitTocDepth(toc, 1);
    expect(JSON.stringify(toc)).toBe(before);
  });
});

describe('countTocNodes', () => {
  it('counts every node including children', () => {
    const toc = extractToc(deepFixture);
    // Part(1) + Chapter(1) + Section(1) + Article(1) = 4
    expect(countTocNodes(toc)).toBe(4);
  });

  it('returns 0 for an empty TOC', () => {
    expect(countTocNodes([])).toBe(0);
  });
});

// 附則を持つ法令のフィクスチャ（#24）。消費税法の附則の形を写した
//   - 1 本目: 制定時の附則（AmendLawNum が無い）。条が 2 本
//   - 2 本目: 改正法の附則（抄）。条が 1 本
//   - 3 本目: 条を立てず項だけで書かれた附則
const supplFixture: LawNode = {
  tag: 'Law',
  children: [
    {
      tag: 'LawBody',
      children: [
        { tag: 'LawTitle', children: ['消費税法'] },
        {
          tag: 'MainProvision',
          children: [
            {
              tag: 'Chapter',
              attr: { Num: '1' },
              children: [
                { tag: 'ChapterTitle', children: ['第一章　総則'] },
                {
                  tag: 'Article',
                  attr: { Num: '1' },
                  children: [{ tag: 'ArticleTitle', children: ['第一条'] }],
                },
              ],
            },
          ],
        },
        {
          tag: 'SupplProvision',
          attr: { Extract: 'true' },
          children: [
            { tag: 'SupplProvisionLabel', children: ['附　則'] },
            {
              tag: 'Article',
              attr: { Num: '1' },
              children: [
                { tag: 'ArticleCaption', children: ['（施行期日）'] },
                { tag: 'ArticleTitle', children: ['第一条'] },
              ],
            },
            {
              tag: 'Article',
              attr: { Num: '2' },
              children: [{ tag: 'ArticleTitle', children: ['第二条'] }],
            },
          ],
        },
        {
          tag: 'SupplProvision',
          attr: { AmendLawNum: '平成元年六月二八日法律第三九号', Extract: 'true' },
          children: [
            { tag: 'SupplProvisionLabel', children: ['附　則'] },
            {
              tag: 'Article',
              attr: { Num: '1' },
              children: [{ tag: 'ArticleTitle', children: ['第一条'] }],
            },
          ],
        },
        {
          tag: 'SupplProvision',
          attr: { AmendLawNum: '平成二年六月二二日法律第三六号' },
          children: [
            { tag: 'SupplProvisionLabel', children: ['附　則'] },
            {
              tag: 'Paragraph',
              attr: { Num: '1' },
              children: [{ tag: 'ParagraphSentence', children: ['この法律は…から施行する。'] }],
            },
          ],
        },
      ],
    },
  ],
};

describe('extractToc（附則の扱い）', () => {
  it('本則だけを返し、附則の条は混ぜない', () => {
    const toc = extractToc(supplFixture);
    expect(toc).toHaveLength(1);
    expect(toc[0].tag).toBe('Chapter');
    expect(countTocArticles(toc)).toBe(1);
  });
});

describe('extractSupplProvisions', () => {
  it('附則を出現順に返し、index が 1 始まりになる', () => {
    const suppl = extractSupplProvisions(supplFixture);
    expect(suppl.map((s) => s.index)).toEqual([1, 2, 3]);
  });

  it('見出しの全角空白を詰める', () => {
    expect(extractSupplProvisions(supplFixture)[0].label).toBe('附則');
  });

  it('制定時の附則には amend_law_num を付けない', () => {
    const first = extractSupplProvisions(supplFixture)[0];
    expect(first.amend_law_num).toBeUndefined();
    expect(first.extract).toBe(true);
    expect(first.article_count).toBe(2);
    expect(first.children.map((c) => c.num)).toEqual(['1', '2']);
    expect(first.children[0].caption).toBe('（施行期日）');
  });

  it('改正法の附則には AmendLawNum が入る', () => {
    const second = extractSupplProvisions(supplFixture)[1];
    expect(second.amend_law_num).toBe('平成元年六月二八日法律第三九号');
    expect(second.article_count).toBe(1);
    expect(second.paragraph_only).toBe(false);
  });

  it('条を立てず項だけの附則は paragraph_only になる', () => {
    const third = extractSupplProvisions(supplFixture)[2];
    expect(third.article_count).toBe(0);
    expect(third.paragraph_only).toBe(true);
    expect(third.extract).toBe(false);
    expect(third.children).toEqual([]);
  });

  it('附則が無い法令では空配列を返す', () => {
    expect(extractSupplProvisions(fixture)).toEqual([]);
  });
});

describe('countTocArticles', () => {
  it('入れ子の中の条も数える', () => {
    expect(countTocArticles(extractToc(deepFixture))).toBe(1);
  });

  it('条が無ければ 0', () => {
    expect(countTocArticles([])).toBe(0);
  });
});
