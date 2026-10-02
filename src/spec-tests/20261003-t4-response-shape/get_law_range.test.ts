/**
 * 差分 20261003-t4-response-shape の受入テスト — get_law_range の続きの呼び出し例
 *
 * 期待値の正本: specs/changes/20261003-t4-response-shape/specs/get_law_range/spec.md
 * 第1章に条を 3 つ置き、本文の長さで打ち切りの位置を決める。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AnyObj,
  type Harness,
  type LawFixture,
  lawDataResponse,
  lawsResponse,
  startHarness,
} from '../../test-helpers/mcp-harness.js';

const TEST_LAW: LawFixture = {
  law_id: '999AC0000000001',
  title: 'テスト法',
  law_num: '令和七年法律第一号',
};

const node = (tag: string, attr: Record<string, string>, children: unknown[]): AnyObj => ({
  tag,
  attr,
  children,
});
const article = (num: string, chars: number) =>
  node('Article', { Num: num }, [
    node('ArticleTitle', {}, [`第${num}条`]),
    node('Paragraph', { Num: '1' }, [
      node('ParagraphNum', {}, []),
      node('ParagraphSentence', {}, [node('Sentence', { Num: '1' }, ['あ'.repeat(chars)])]),
    ]),
  ]);
const tree = (lengths: number[]) =>
  node('Law', {}, [
    node('LawBody', {}, [
      node('LawTitle', {}, [TEST_LAW.title]),
      node('MainProvision', {}, [
        node('Chapter', { Num: '1' }, [
          node('ChapterTitle', {}, ['第一章　総則']),
          ...lengths.map((n, i) => article(String(i + 1), n)),
        ]),
      ]),
    ]),
  ]);

describe('get_law_range の続きの呼び出し例（20261003-t4-response-shape）', () => {
  let h: Harness;
  let lengths: number[];

  beforeEach(async () => {
    lengths = [900, 900, 2500];
    h = await startHarness((url) => {
      if (url.pathname.endsWith('/laws')) return lawsResponse([TEST_LAW]);
      if (url.pathname.includes('/law_data/')) return lawDataResponse(TEST_LAW, tree(lengths));
      return null;
    });
  });
  afterEach(async () => {
    await h.close();
  });

  async function range(args: Record<string, unknown>): Promise<AnyObj> {
    const r = await h.call('get_law_range', { law_name: TEST_LAW.title, chapter: 1, ...args });
    if (r.isError) throw new Error(r.text);
    return r.body.range;
  }

  it('SPEC-EGOV-GET-LAW-RANGE-008 渡した max_chars を続きの例にそのまま入れる', async () => {
    const r = await range({ max_chars: 2000 });
    expect(r.truncated).toBe(true);
    expect(r.returned_count).toBe(2);
    expect(r.next_from_article).toBe('3');
    expect(r.next_actions).toEqual([
      {
        action: 'get_law_range',
        reason: '同じ範囲の続きの条から取れます',
        example: { law_name: 'テスト法', path: 'Chapter1', from_article: '3', max_chars: 2000 },
      },
    ]);
  });

  it('SPEC-EGOV-GET-LAW-RANGE-008 at も渡したときは続きの例に max_chars と at を入れる', async () => {
    const r = await range({ max_chars: 2000, at: '2020-04-01' });
    expect(r.next_actions[0].example).toEqual({
      law_name: 'テスト法',
      path: 'Chapter1',
      from_article: '3',
      max_chars: 2000,
      at: '2020-04-01',
    });
  });

  it('SPEC-EGOV-GET-LAW-RANGE-008 max_chars を省いて既定の 30,000 文字で打ち切ったときは、例に max_chars も at も入れない', async () => {
    lengths = [12000, 12000, 12000];
    const r = await range({});
    expect(r.truncated).toBe(true);
    expect(r.max_chars).toBe(30000);
    expect(r.next_from_article).toBe('3');
    expect(r.next_actions[0].example).toEqual({
      law_name: 'テスト法',
      path: 'Chapter1',
      from_article: '3',
    });
    const withAt = await range({ at: '2020-04-01' });
    expect(withAt.next_actions[0].example).toEqual({
      law_name: 'テスト法',
      path: 'Chapter1',
      from_article: '3',
      at: '2020-04-01',
    });
  });

  it('SPEC-EGOV-GET-LAW-RANGE-008 例のとおりに呼び直すと、同じ上限で続きの条から返す', async () => {
    lengths = [900, 900, 900, 900, 2500];
    const first = await range({ max_chars: 2000 });
    const example = first.next_actions[0].example as Record<string, unknown>;
    const r = await h.call('get_law_range', example);
    expect(r.isError).toBe(false);
    expect(r.body.range.max_chars).toBe(2000);
    expect(r.body.range.first_article).toBe('第3条');
    expect(r.body.range.returned_count).toBe(2);
    expect(r.body.range.next_actions[0].example.max_chars).toBe(2000);
  });
});
