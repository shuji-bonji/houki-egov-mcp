/**
 * 差分 20261003-t4-response-shape の受入テスト — get_law の json の paragraph_num と item_num
 *
 * 期待値の正本: specs/changes/20261003-t4-response-shape/specs/get_law/spec.md
 * 法令本文は、項が 1 つで号を持つ第14条の3と、項が 2 つで第1項に号を持つ第2条の簡略版。
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
  law_id: '999CO0000000001',
  title: 'テスト法施行令',
  law_num: '令和七年政令第一号',
  law_type: 'CabinetOrder',
};

const node = (tag: string, attr: Record<string, string>, children: unknown[]): AnyObj => ({
  tag,
  attr,
  children,
});
const sentence = (text: string) => node('Sentence', { Num: '1' }, [text]);
const item = (num: string, title: string) =>
  node('Item', { Num: num }, [
    node('ItemTitle', {}, [title]),
    node('ItemSentence', {}, [sentence(`第${num}号の本文`)]),
  ]);
const paragraph = (num: string, items: AnyObj[] = []) =>
  node('Paragraph', { Num: num }, [
    node('ParagraphNum', {}, []),
    node('ParagraphSentence', {}, [sentence(`第${num}項の本文`)]),
    ...items,
  ]);

const TREE = node('Law', {}, [
  node('LawBody', {}, [
    node('LawTitle', {}, [TEST_LAW.title]),
    node('MainProvision', {}, [
      node('Article', { Num: '2' }, [
        node('ArticleTitle', {}, ['第二条']),
        paragraph('1', [item('1', '一'), item('8', '八')]),
        paragraph('2'),
      ]),
      node('Article', { Num: '14_3' }, [
        node('ArticleTitle', {}, ['第十四条の三']),
        paragraph('1', [item('1', '一'), item('2', '二')]),
      ]),
    ]),
  ]),
]);

describe('get_law の json の paragraph_num と item_num（20261003-t4-response-shape）', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await startHarness((url) => {
      if (url.pathname.endsWith('/laws')) return lawsResponse([TEST_LAW]);
      if (url.pathname.includes('/law_data/')) return lawDataResponse(TEST_LAW, TREE);
      return null;
    });
  });
  afterEach(async () => {
    await h.close();
  });

  async function json(args: Record<string, unknown>): Promise<AnyObj> {
    const r = await h.call('get_law', { law_name: TEST_LAW.title, format: 'json', ...args });
    if (r.isError) throw new Error(r.text);
    return r.body;
  }

  it('SPEC-EGOV-GET-LAW-040 item だけで項を補うと data.paragraph_num は 1、item_num は渡した値、node は号', async () => {
    const r = await json({ article: '14の3', item: 1 });
    expect(r.data.paragraph_num).toBe(1);
    expect(r.data.item_num).toBe(1);
    expect(r.data.node.tag).toBe('Item');
    expect(r.data.node.attr.Num).toBe('1');
    const s = await json({ article: '14の3', item: '二' });
    expect(s.data.paragraph_num).toBe(1);
    expect(s.data.item_num).toBe('二');
    expect(s.data.node.attr.Num).toBe('2');
  });

  it('SPEC-EGOV-GET-LAW-024 paragraph・item を渡さないと paragraph_num・item_num は null（キーはある）', async () => {
    const r = await json({ article: '2' });
    expect(Object.keys(r.data).sort()).toEqual([
      'article_num',
      'item_num',
      'node',
      'paragraph_num',
    ]);
    expect(r.data.paragraph_num).toBeNull();
    expect(r.data.item_num).toBeNull();
    const p = await json({ article: '2', paragraph: 2 });
    expect(p.data.paragraph_num).toBe(2);
    expect(p.data.item_num).toBeNull();
    const both = await json({ article: '2', paragraph: 1, item: '八' });
    expect(both.data.paragraph_num).toBe(1);
    expect(both.data.item_num).toBe('八');
  });
});
