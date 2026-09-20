/**
 * get_toc が本則と附則を分けて返すこと（egov#24）を、e-Gov クライアントを差し替えて確かめる。
 * 附則の形（`AmendLawNum`・`Extract`・項だけの附則）と改正履歴の法令番号の書き方は、
 * 2026-09-20 に消費税法（363AC0000000108）から取った実データを写したもの。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LawNode } from './egov-client.js';

const LAW_ID = '363AC0000000108';
const TITLE = '消費税法';
const LAW_NUM = '昭和六十三年法律第百八号';

/** 改正履歴を何回引いたかの記録 */
const revisionsCalls: string[] = [];

const article = (num: string, title: string, caption?: string): LawNode => ({
  tag: 'Article',
  attr: { Num: num },
  children: [
    ...(caption ? [{ tag: 'ArticleCaption', attr: {}, children: [caption] }] : []),
    { tag: 'ArticleTitle', attr: {}, children: [title] },
  ],
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
            {
              tag: 'Chapter',
              attr: { Num: '1' },
              children: [
                { tag: 'ChapterTitle', attr: {}, children: ['第一章　総則'] },
                article('1', '第一条', '（趣旨）'),
                article('2', '第二条', '（定義）'),
              ],
            },
          ],
        },
        // 制定時の附則（抄）
        {
          tag: 'SupplProvision',
          attr: { Extract: 'true' },
          children: [
            { tag: 'SupplProvisionLabel', attr: {}, children: ['附　則'] },
            article('1', '第一条', '（施行期日）'),
          ],
        },
        // 改正法の附則（抄）。改正履歴に題名がある
        {
          tag: 'SupplProvision',
          attr: { AmendLawNum: '平成元年六月二八日法律第三九号', Extract: 'true' },
          children: [
            { tag: 'SupplProvisionLabel', attr: {}, children: ['附　則'] },
            article('1', '第一条'),
            article('2', '第二条'),
          ],
        },
        // 条を立てず項だけの附則。改正履歴に無い古い改正法
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
    getLawRevisions: async (lawId: string) => {
      revisionsCalls.push(lawId);
      return {
        law_info: lawInfo,
        revisions: [
          {
            law_revision_id: `${LAW_ID}_19890628_401AC0000000039`,
            law_type: 'Act',
            law_title: TITLE,
            // 附則は「平成元年六月二八日法律第三九号」、改正履歴は公布の月日が入らず漢数字の書き方も違う
            amendment_law_num: '平成元年法律第三十九号',
            amendment_law_title: '消費税法の一部を改正する法律',
          },
        ],
      };
    },
  };
});

const { _resetCachesForTest, getLawToc, isError } = await import('./law-service.js');

beforeEach(() => {
  _resetCachesForTest();
  revisionsCalls.length = 0;
});

describe('get_toc の本則と附則（#24）', () => {
  it('既定では附則の見出しと条数だけを返し、本則に附則の条を混ぜない', async () => {
    const r = await getLawToc({ law_name: TITLE });
    if (isError(r)) throw new Error(`unexpected error: ${r.error}`);

    expect(r.toc).toHaveLength(1);
    expect(r.toc[0].tag).toBe('Chapter');
    expect(r.toc[0].children.map((c) => c.num)).toEqual(['1', '2']);

    expect(r.suppl.mode).toBe('list');
    expect(r.suppl.count).toBe(3);
    expect(r.suppl.article_count).toBe(3);
    expect(r.suppl_provisions).toHaveLength(3);
    expect(r.suppl_provisions.every((sp) => sp.children.length === 0)).toBe(true);
    expect(r.suppl.note).toContain('suppl: "full"');
  });

  it('附則の 1 本目は制定時、2 本目以降は改正法の番号が付く', async () => {
    const r = await getLawToc({ law_name: TITLE });
    if (isError(r)) throw new Error(`unexpected error: ${r.error}`);

    expect(r.suppl_provisions[0].amend_law_num).toBeUndefined();
    expect(r.suppl_provisions[0].extract).toBe(true);
    expect(r.suppl_provisions[1].amend_law_num).toBe('平成元年六月二八日法律第三九号');
    expect(r.suppl_provisions[2].paragraph_only).toBe(true);
  });

  it('suppl: "full" で附則の中の条まで返す', async () => {
    const r = await getLawToc({ law_name: TITLE, suppl: 'full' });
    if (isError(r)) throw new Error(`unexpected error: ${r.error}`);

    expect(r.suppl.mode).toBe('full');
    expect(r.suppl_provisions[1].children.map((c) => c.num)).toEqual(['1', '2']);
    expect(r.markdown).toContain('## 本則');
    expect(r.markdown).toContain('## 附則（3 本・条 3 件）');
    expect(r.markdown).toContain('附則(2) 平成元年六月二八日法律第三九号（抄） — 条 2 件');
    expect(r.markdown).toContain('附則(3) 平成二年六月二二日法律第三六号 — 項のみ');
  });

  it('suppl: "none" で附則を落とすが、本数と条数は数えて返す', async () => {
    const r = await getLawToc({ law_name: TITLE, suppl: 'none' });
    if (isError(r)) throw new Error(`unexpected error: ${r.error}`);

    expect(r.suppl_provisions).toEqual([]);
    expect(r.suppl.count).toBe(3);
    expect(r.suppl.article_count).toBe(3);
    expect(r.markdown).not.toContain('## 附則');
  });

  it('既定では改正履歴を引かない', async () => {
    await getLawToc({ law_name: TITLE });
    expect(revisionsCalls).toEqual([]);
  });

  it('with_amend_titles で改正法の題名を付け、付かなかった本数を返す', async () => {
    const r = await getLawToc({ law_name: TITLE, with_amend_titles: true });
    if (isError(r)) throw new Error(`unexpected error: ${r.error}`);

    expect(revisionsCalls).toEqual([LAW_ID]);
    expect(r.suppl_provisions[1].amend_law_title).toBe('消費税法の一部を改正する法律');
    // 制定時の附則は照合しない。改正履歴に無い 3 本目は題名が付かない
    expect(r.suppl_provisions[0].amend_law_title).toBeUndefined();
    expect(r.suppl_provisions[2].amend_law_title).toBeUndefined();
    expect(r.suppl.amend_law_titles).toEqual({
      matched: 1,
      unmatched: 1,
      revisions: 1,
      source: 'law_revisions',
    });
    expect(r.suppl.note).toContain('残り 1 本');
  });

  it('depth は本則の階層に効き、附則の本数は変わらない', async () => {
    const r = await getLawToc({ law_name: TITLE, depth: 1 });
    if (isError(r)) throw new Error(`unexpected error: ${r.error}`);

    expect(r.truncated).toBe(true);
    expect(r.toc[0].children).toEqual([]);
    expect(r.suppl_provisions).toHaveLength(3);
  });
});
