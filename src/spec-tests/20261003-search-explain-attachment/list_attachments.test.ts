/**
 * 差分 20261003-search-explain-attachment の受入テスト — list_attachments・get_attachment の附則の別表・様式・付録の図（#72）
 *
 * 期待値の正本: specs/changes/20261003-search-explain-attachment/specs/list_attachments/spec.md
 * 要素名は e-Gov の法令標準 XML スキーマの名前（SupplProvisionAppdxTable など）。
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

const LAW: LawFixture = {
  law_id: '499AC0000000072',
  title: '架空附則別表法',
  law_num: '令和九十九年法律第七十二号',
};

const node = (tag: string, attr: Record<string, string>, children: unknown[]): AnyObj => ({
  tag,
  attr,
  children,
});
const fig = (src: string) => node('FigStruct', {}, [node('Fig', { src }, [])]);

const TREE = node('Law', {}, [
  node('LawBody', {}, [
    node('LawTitle', {}, [LAW.title]),
    node('MainProvision', {}, [
      node('Article', { Num: '1' }, [node('ArticleTitle', {}, ['第一条'])]),
    ]),
    // 制定時の附則（AmendLawNum が無い）の別表
    node('SupplProvision', {}, [
      node('SupplProvisionLabel', {}, ['附　則']),
      node('SupplProvisionAppdxTable', {}, [
        node('SupplProvisionAppdxTableTitle', {}, ['附則別表']),
        fig('./pict/s0.jpg'),
      ]),
    ]),
    node('SupplProvision', { AmendLawNum: '令和二年法律第一号' }, [
      node('SupplProvisionLabel', {}, ['附　則']),
      node('SupplProvisionAppdxTable', {}, [
        node('SupplProvisionAppdxTableTitle', {}, ['　附則別表第一']),
        node('RelatedArticleNum', {}, ['（附則第三条関係）']),
        fig('./pict/s1.jpg'),
      ]),
      node('SupplProvisionAppdxStyle', {}, [
        node('SupplProvisionAppdxStyleTitle', {}, ['附則様式第一']),
        node('RelatedArticleNum', {}, ['（附則第四条関係）']),
        fig('./pict/s2.jpg'),
      ]),
      node('SupplProvisionAppdx', {}, [
        node('ArithFormulaNum', {}, ['附則付録']),
        fig('./pict/s3.jpg'),
      ]),
      // 附則の別表・様式・付録・条のどれの中でもない図
      node('Paragraph', { Num: '1' }, [fig('./pict/s4.jpg')]),
    ]),
  ]),
]);

describe('附則の別表・様式・付録の中の図（20261003-search-explain-attachment）', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness((url) => {
      if (url.pathname.endsWith('/laws')) return lawsResponse([LAW]);
      if (url.pathname.includes('/law_data/')) return lawDataResponse(LAW, TREE);
      return null;
    });
  });
  afterEach(async () => {
    await h.close();
  });

  const locations = async (): Promise<Record<string, AnyObj>> => {
    const r = await h.call('list_attachments', { law_name: LAW.title });
    expect(r.isError).toBe(false);
    return Object.fromEntries(r.body.attachments.map((a: AnyObj) => [a.src, a.location]));
  };

  it('SPEC-EGOV-LIST-ATTACHMENTS-025 附則の別表の図は、その要素名・見出し・関係条文・附則の改正法番号を location に持つ', async () => {
    const loc = await locations();
    expect(loc['./pict/s1.jpg']).toEqual({
      tag: 'SupplProvisionAppdxTable',
      title: '附則別表第一',
      related_article: '（附則第三条関係）',
      amend_law_num: '令和二年法律第一号',
    });
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-025 附則の様式は SupplProvisionAppdxStyleTitle、附則の付録は ArithFormulaNum を見出しにする', async () => {
    const loc = await locations();
    expect(loc['./pict/s2.jpg']).toEqual({
      tag: 'SupplProvisionAppdxStyle',
      title: '附則様式第一',
      related_article: '（附則第四条関係）',
      amend_law_num: '令和二年法律第一号',
    });
    expect(loc['./pict/s3.jpg']).toEqual({
      tag: 'SupplProvisionAppdx',
      title: '附則付録',
      amend_law_num: '令和二年法律第一号',
    });
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-025 制定時の附則（AmendLawNum が無い）の別表には amend_law_num を付けない', async () => {
    const loc = await locations();
    expect(loc['./pict/s0.jpg']).toEqual({ tag: 'SupplProvisionAppdxTable', title: '附則別表' });
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-002 附則の別表・様式・付録・条のどれの中でもない図は tag: SupplProvision と附則の改正法番号', async () => {
    const loc = await locations();
    expect(loc['./pict/s4.jpg']).toEqual({
      tag: 'SupplProvision',
      amend_law_num: '令和二年法律第一号',
    });
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-025 get_attachment の location も同じ値', async () => {
    const r = await h.call('get_attachment', { law_name: LAW.title, src: './pict/s1.jpg' });
    expect(r.isError).toBe(false);
    expect(r.body.location).toEqual({
      tag: 'SupplProvisionAppdxTable',
      title: '附則別表第一',
      related_article: '（附則第三条関係）',
      amend_law_num: '令和二年法律第一号',
    });
  });
});
