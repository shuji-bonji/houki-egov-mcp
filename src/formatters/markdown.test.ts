import { describe, expect, it } from 'vitest';
import type { LawNode } from '../services/egov-client.js';
import {
  formatArticleMarkdown,
  formatProvisionLines,
  formatTableStructLines,
  formatTocMarkdown,
} from './markdown.js';

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

const cell = (text: string, attr?: Record<string, string>, tag = 'TableColumn'): LawNode => ({
  tag,
  attr,
  children: [sentence(text)],
});
const row = (cells: Array<string | LawNode>, tag = 'TableRow'): LawNode => ({
  tag,
  children: cells.map((c) => (typeof c === 'string' ? cell(c) : c)),
});
const table = (rows: LawNode[], extra: LawNode[] = []): LawNode => ({
  tag: 'TableStruct',
  children: [{ tag: 'Table', children: rows }, ...extra],
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

  it('puts other children (List etc.) on their own line', () => {
    const node: LawNode = {
      tag: 'Item',
      attr: { Num: '1' },
      children: [
        { tag: 'ItemTitle', children: ['一'] },
        { tag: 'ItemSentence', children: [sentence('次に掲げるもの')] },
        { tag: 'List', children: [{ tag: 'ListSentence', children: [sentence('甲')] }] },
      ],
    };
    expect(formatProvisionLines(node)).toEqual(['一 次に掲げるもの', '甲']);
  });

  it('renders TableStruct in a Subitem as an indented Markdown table', () => {
    const node: LawNode = {
      tag: 'Item',
      attr: { Num: '1' },
      children: [
        { tag: 'ItemTitle', children: ['一'] },
        { tag: 'ItemSentence', children: [sentence('次による')] },
        {
          tag: 'Subitem1',
          attr: { Num: '1' },
          children: [
            { tag: 'Subitem1Title', children: ['イ'] },
            { tag: 'Subitem1Sentence', children: [sentence('次の表のとおり')] },
            table([row(['区分', '税率'])]),
          ],
        },
      ],
    };
    expect(formatProvisionLines(node)).toEqual([
      '一 次による',
      '- イ 次の表のとおり',
      '',
      '  |  |  |',
      '  | --- | --- |',
      '  | 区分 | 税率 |',
      '',
    ]);
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

  it('paragraph: renders a TableStruct directly under Paragraph (所得税法 89 条 1 項)', () => {
    const p = paragraph('1', [
      { tag: 'ParagraphNum', children: [] },
      {
        tag: 'ParagraphSentence',
        children: [sentence('次の表の下欄に掲げる税率を乗じて計算する。')],
      },
      table([
        row(['百九十五万円以下の金額', '百分の五']),
        row(['四千万円を超える金額', '百分の四十五']),
      ]),
    ]);
    const md = formatArticleMarkdown({
      ...base,
      lawTitle: '所得税法',
      article: article('89', [p]),
      paragraph: p,
    });
    expect(md).toContain(
      [
        '次の表の下欄に掲げる税率を乗じて計算する。',
        '',
        '|  |  |',
        '| --- | --- |',
        '| 百九十五万円以下の金額 | 百分の五 |',
        '| 四千万円を超える金額 | 百分の四十五 |',
        '',
        '---',
      ].join('\n')
    );
  });

  it('item: branch-numbered item header is 第8号の2 (no "第8_2号")', () => {
    const p = paragraph('1', [item8, item8no2]);
    const md = formatArticleMarkdown({
      ...base,
      article: article('2', [p]),
      paragraph: p,
      item: item8no2,
    });
    const lines = md.split('\n');
    expect(lines[0]).toBe('# 消費税法 第2条第1項第8号の2');
    expect(lines).toContain('八の二 特定資産の譲渡等　事業者向け電気通信利用役務の提供をいう。');
    expect(md).not.toContain('資産の譲渡等　事業として');
  });

  it('paragraph: branch-numbered items keep 八の二 (no "8_2 の二")', () => {
    const p = paragraph('1', [item8, item8no2]);
    const md = formatArticleMarkdown({ ...base, article: article('2', [p]), paragraph: p });
    expect(md).toContain('八の二 特定資産の譲渡等　');
    expect(md).not.toContain('8_2');
  });
});

describe('formatTableStructLines', () => {
  it('uses a blank header row when TableHeaderRow is absent', () => {
    expect(formatTableStructLines(table([row(['a', 'b']), row(['c', 'd'])]))).toEqual([
      '',
      '|  |  |',
      '| --- | --- |',
      '| a | b |',
      '| c | d |',
      '',
    ]);
  });

  it('uses TableHeaderRow as the header and prints TableStructTitle and Remarks', () => {
    const node: LawNode = {
      tag: 'TableStruct',
      children: [
        { tag: 'TableStructTitle', children: ['別表'] },
        {
          tag: 'Table',
          children: [
            row(
              [
                cell('区分', undefined, 'TableHeaderColumn'),
                cell('税率', undefined, 'TableHeaderColumn'),
              ],
              'TableHeaderRow'
            ),
            row(['甲', '百分の五']),
          ],
        },
        {
          tag: 'Remarks',
          children: [{ tag: 'RemarksLabel', children: ['備考'] }, sentence('この表は例示である。')],
        },
      ],
    };
    expect(formatTableStructLines(node)).toEqual([
      '',
      '別表',
      '',
      '| 区分 | 税率 |',
      '| --- | --- |',
      '| 甲 | 百分の五 |',
      '',
      '備考 この表は例示である。',
      '',
    ]);
  });

  it('fills cells merged by rowspan / colspan with empty cells and escapes |', () => {
    const node = table([
      row([cell('A', { rowspan: '2' }), cell('B|C', { colspan: '2' })]),
      row(['d', 'e']),
    ]);
    expect(formatTableStructLines(node)).toEqual([
      '',
      '|  |  |  |',
      '| --- | --- | --- |',
      '| A | B\\|C |  |',
      '|  | d | e |',
      '',
    ]);
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
