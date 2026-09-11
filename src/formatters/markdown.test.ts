import { describe, expect, it } from 'vitest';
import type { LawNode } from '../services/egov-client.js';
import { formatArticleMarkdown, formatProvisionLines, formatTocMarkdown } from './markdown.js';

const sentence = (text: string): LawNode => ({
  tag: 'Sentence',
  attr: { Num: '1' },
  children: [text],
});
const column = (num: string, text: string): LawNode => ({
  tag: 'Column',
  attr: { Num: num },
  children: [sentence(text)],
});

// 消費税法 第2条第1項第8号・第8号の2 を簡略化したフィクスチャ（ItemSentence が Column 2 つ）
const item8: LawNode = {
  tag: 'Item',
  attr: { Num: '8' },
  children: [
    { tag: 'ItemTitle', children: ['八'] },
    {
      tag: 'ItemSentence',
      children: [
        column('1', '資産の譲渡等'),
        column('2', '事業として対価を得て行われる資産の譲渡及び貸付け並びに役務の提供をいう。'),
      ],
    },
  ],
};
const item8no2: LawNode = {
  tag: 'Item',
  attr: { Num: '8_2' },
  children: [
    { tag: 'ItemTitle', children: ['八の二'] },
    {
      tag: 'ItemSentence',
      children: [
        column('1', '特定資産の譲渡等'),
        column('2', '事業者向け電気通信利用役務の提供をいう。'),
      ],
    },
  ],
};

// 消費税法 第30条第2項第1号 を簡略化したフィクスチャ（Column 2 つ + Subitem1 イ・ロ）
const item30_2_1: LawNode = {
  tag: 'Item',
  attr: { Num: '1' },
  children: [
    { tag: 'ItemTitle', children: ['一'] },
    {
      tag: 'ItemSentence',
      children: [
        column('1', '区分が明らかにされている場合'),
        column('2', 'イに掲げる金額にロに掲げる金額を加算する方法'),
      ],
    },
    {
      tag: 'Subitem1',
      attr: { Num: '1' },
      children: [
        { tag: 'Subitem1Title', children: ['イ'] },
        {
          tag: 'Subitem1Sentence',
          children: [sentence('課税資産の譲渡等にのみ要する税額の合計額')],
        },
      ],
    },
    {
      tag: 'Subitem1',
      attr: { Num: '2' },
      children: [
        { tag: 'Subitem1Title', children: ['ロ'] },
        {
          tag: 'Subitem1Sentence',
          children: [sentence('共通して要する税額に課税売上割合を乗じた金額')],
        },
        {
          tag: 'Subitem2',
          attr: { Num: '1' },
          children: [
            { tag: 'Subitem2Title', children: ['（１）'] },
            { tag: 'Subitem2Sentence', children: [sentence('深さ 2 の本文')] },
          ],
        },
      ],
    },
  ],
};

const article = (num: string, children: LawNode[]): LawNode => ({
  tag: 'Article',
  attr: { Num: num },
  children: [{ tag: 'ArticleCaption', children: ['（定義）'] }, ...children],
});
const paragraph = (num: string, children: LawNode[]): LawNode => ({
  tag: 'Paragraph',
  attr: { Num: num },
  children,
});

const base = {
  lawTitle: '消費税法',
  lawId: '363AC0000000108',
  retrievedAt: '2026-09-11T00:00:00.000Z',
};

describe('formatProvisionLines', () => {
  it('puts a space after ItemTitle and a full-width space between Columns', () => {
    expect(formatProvisionLines(item8)).toEqual([
      '八 資産の譲渡等　事業として対価を得て行われる資産の譲渡及び貸付け並びに役務の提供をいう。',
    ]);
  });

  it('keeps branch-numbered ItemTitle as is', () => {
    expect(formatProvisionLines(item8no2)).toEqual([
      '八の二 特定資産の譲渡等　事業者向け電気通信利用役務の提供をいう。',
    ]);
  });

  it('renders Subitem1 / Subitem2 as nested Markdown list items', () => {
    expect(formatProvisionLines(item30_2_1)).toEqual([
      '一 区分が明らかにされている場合　イに掲げる金額にロに掲げる金額を加算する方法',
      '- イ 課税資産の譲渡等にのみ要する税額の合計額',
      '- ロ 共通して要する税額に課税売上割合を乗じた金額',
      '  - （１） 深さ 2 の本文',
    ]);
  });

  it('falls back to Num when ItemTitle is missing', () => {
    const node: LawNode = {
      tag: 'Item',
      attr: { Num: '3_2' },
      children: [{ tag: 'ItemSentence', children: [sentence('本文')] }],
    };
    expect(formatProvisionLines(node)).toEqual(['3の2 本文']);
  });

  it('puts other children (TableStruct etc.) on their own line', () => {
    const node: LawNode = {
      tag: 'Item',
      attr: { Num: '1' },
      children: [
        { tag: 'ItemTitle', children: ['一'] },
        { tag: 'ItemSentence', children: [sentence('次の表のとおり')] },
        { tag: 'TableStruct', children: [{ tag: 'Table', children: ['区分', '税率'] }] },
      ],
    };
    expect(formatProvisionLines(node)).toEqual(['一 次の表のとおり', '区分税率']);
  });
});

describe('formatArticleMarkdown', () => {
  it('builds 第70条の6 for branch-numbered articles', () => {
    const md = formatArticleMarkdown({
      ...base,
      lawTitle: '租税特別措置法',
      article: article('70_6', [
        paragraph('9', [{ tag: 'ParagraphSentence', children: [sentence('本文')] }]),
      ]),
    });
    expect(md.split('\n')[0]).toBe('# 租税特別措置法 第70条の6');
  });

  it('item: header with 号 and body with separated ItemTitle / Columns', () => {
    const p = paragraph('1', [item8]);
    const md = formatArticleMarkdown({
      ...base,
      article: article('2', [p]),
      paragraph: p,
      item: item8,
    });
    const lines = md.split('\n');
    expect(lines[0]).toBe('# 消費税法 第2条第1項第8号');
    expect(lines).toContain(
      '八 資産の譲渡等　事業として対価を得て行われる資産の譲渡及び貸付け並びに役務の提供をいう。'
    );
  });

  it('paragraph: each item on its own line, Subitem1 as list items', () => {
    const p = paragraph('2', [
      { tag: 'ParagraphNum', children: ['２'] },
      {
        tag: 'ParagraphSentence',
        children: [sentence('次の各号に定める方法により計算した金額とする。')],
      },
      item30_2_1,
    ]);
    const md = formatArticleMarkdown({ ...base, article: article('30', [p]), paragraph: p });
    expect(md).toContain(
      [
        '**第2項**',
        '次の各号に定める方法により計算した金額とする。',
        '一 区分が明らかにされている場合　イに掲げる金額にロに掲げる金額を加算する方法',
        '- イ 課税資産の譲渡等にのみ要する税額の合計額',
        '- ロ 共通して要する税額に課税売上割合を乗じた金額',
        '  - （１） 深さ 2 の本文',
      ].join('\n')
    );
    expect(md.split('\n')[0]).toBe('# 消費税法 第30条第2項');
  });

  it('paragraph: branch-numbered items keep 八の二 (no "8_2 の二")', () => {
    const p = paragraph('1', [item8, item8no2]);
    const md = formatArticleMarkdown({ ...base, article: article('2', [p]), paragraph: p });
    expect(md).toContain('八の二 特定資産の譲渡等　');
    expect(md).not.toContain('8_2');
  });
});

describe('formatTocMarkdown', () => {
  it('lists branch-numbered articles as 第N条のM', () => {
    const md = formatTocMarkdown({
      ...base,
      lawTitle: '租税特別措置法',
      toc: [
        {
          tag: 'Article',
          num: '70_6',
          title: '第七十条の六',
          caption: '（農地等についての相続税の納税猶予等）',
          children: [],
        },
      ],
    });
    expect(md).toContain('- 第70条の6 （農地等についての相続税の納税猶予等）');
  });
});
