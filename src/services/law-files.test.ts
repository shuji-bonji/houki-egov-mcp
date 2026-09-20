/**
 * list_attachments / get_attachment / get_law_file（egov#19）を、e-Gov クライアントを差し替えて確かめる。
 *
 * 法令の値は 2026-09-20 に e-Gov から取ったもの（国旗及び国歌に関する法律 411AC0000000127 の
 * 添付 2 件、戸籍法施行規則の別表・様式の見出し）を元にした固定値で、木はこのテスト用に組んだもの。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fromJsonSchema, type JsonSchemaType } from '@modelcontextprotocol/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAttachmentTool, getLawFileTool, listAttachmentsTool } from '../tools/definitions.js';
import type { LawNode } from './egov-client.js';

const KOKKI_ID = '411AC0000000127';
const KOKKI_REV = '411AC0000000127_19990813_000000000000000';
const MINPO_ID = '129AC0000000089';

/** 呼び出しの記録 */
const calls: {
  attachment: Array<[string, string | undefined]>;
  lawFile: Array<[string, string, string | undefined]>;
} = { attachment: [], lawFile: [] };

let filesDir: string;

function fig(src: string): LawNode {
  return { tag: 'FigStruct', children: [{ tag: 'Fig', attr: { src }, children: [] }] };
}

/** 国旗国歌法の形: 別記第一（第一条関係）と別記第二（第二条関係）に図が 1 つずつ。第一条の中にも図を 1 つ足す */
const KOKKI_TREE: LawNode = {
  tag: 'Law',
  attr: { Num: '127' },
  children: [
    {
      tag: 'LawBody',
      children: [
        {
          tag: 'MainProvision',
          children: [
            {
              tag: 'Article',
              attr: { Num: '1' },
              children: [
                { tag: 'ArticleCaption', children: ['（国旗）'] },
                { tag: 'ArticleTitle', children: ['第一条'] },
                { tag: 'Paragraph', attr: { Num: '1' }, children: [fig('./pict/in-article.jpg')] },
              ],
            },
          ],
        },
        {
          tag: 'SupplProvision',
          attr: { AmendLawNum: '平成一一年法律第一二七号' },
          children: [
            { tag: 'Paragraph', attr: { Num: '1' }, children: [fig('./pict/in-suppl.jpg')] },
          ],
        },
        {
          tag: 'AppdxNote',
          children: [
            { tag: 'AppdxNoteTitle', children: ['別記第一'] },
            { tag: 'RelatedArticleNum', children: ['（第一条関係）'] },
            { tag: 'TableStruct', children: [fig('./pict/H11HO127-001.jpg')] },
          ],
        },
        {
          tag: 'AppdxNote',
          children: [
            { tag: 'AppdxNoteTitle', children: ['別記第二'] },
            { tag: 'RelatedArticleNum', children: ['（第二条関係）'] },
            { tag: 'TableStruct', children: [fig('./pict/H11HO127-002.jpg')] },
          ],
        },
        {
          tag: 'AppdxStyle',
          children: [
            { tag: 'AppdxStyleTitle', children: ['附録第十一号様式'] },
            {
              tag: 'RelatedArticleNum',
              children: ['　出生の届書（日本産業規格Ａ列四番）（第五十九条関係）'],
            },
            { tag: 'StyleStruct', children: [fig('./pict/2FH00000007000.pdf')] },
          ],
        },
      ],
    },
  ],
};

const ATTACHED = [
  {
    law_revision_id: KOKKI_REV,
    src: './pict/H11HO127-001.jpg',
    updated: '2024-07-25T00:20:13+09:00',
  },
  {
    law_revision_id: KOKKI_REV,
    src: './pict/H11HO127-002.jpg',
    updated: '2024-07-25T00:20:13+09:00',
  },
  {
    law_revision_id: KOKKI_REV,
    src: './pict/2FH00000007000.pdf',
    updated: '2024-07-25T00:20:13+09:00',
  },
  // 一覧にだけあり、本文の Fig には無いファイル
  { law_revision_id: KOKKI_REV, src: './pict/list-only.jpg', updated: '2024-07-25T00:20:13+09:00' },
];

vi.mock('./egov-client.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./egov-client.js')>();
  return {
    ...mod,
    searchLaws: async (params: { law_title?: string }) => {
      const table: Record<string, { law_id: string; law_num: string }> = {
        国旗及び国歌に関する法律: { law_id: KOKKI_ID, law_num: '平成十一年法律第百二十七号' },
        民法: { law_id: MINPO_ID, law_num: '明治二十九年法律第八十九号' },
      };
      const hit = params.law_title ? table[params.law_title] : undefined;
      const laws = hit
        ? [
            {
              law_info: { law_id: hit.law_id, law_type: 'Act', law_num: hit.law_num },
              revision_info: { law_title: params.law_title as string },
            },
          ]
        : [];
      return { total_count: laws.length, count: laws.length, laws };
    },
    getLawData: async (lawId: string, params: { at?: string } = {}) => {
      if (lawId === KOKKI_ID) {
        return {
          law_info: { law_id: KOKKI_ID, law_type: 'Act', law_num: '平成十一年法律第百二十七号' },
          revision_info: {
            law_title: '国旗及び国歌に関する法律',
            law_revision_id: params.at
              ? `${KOKKI_ID}_${params.at.replace(/-/g, '')}_000000000000000`
              : KOKKI_REV,
          },
          law_full_text: KOKKI_TREE,
          attached_files_info: { image_data: '', attached_files: params.at ? [] : ATTACHED },
        };
      }
      if (lawId === MINPO_ID) {
        return {
          law_info: { law_id: MINPO_ID, law_type: 'Act', law_num: '明治二十九年法律第八十九号' },
          revision_info: {
            law_title: '民法',
            law_revision_id: `${MINPO_ID}_20250601_504AC0000000068`,
          },
          law_full_text: { tag: 'Law', children: [{ tag: 'LawBody', children: [] }] },
          attached_files_info: { image_data: '', attached_files: [] },
        };
      }
      throw new mod.EgovHttpError(
        404,
        `https://laws.e-gov.go.jp/api/2/law_data/${lawId}`,
        'Not Found'
      );
    },
    getAttachment: async (revisionId: string, src?: string) => {
      calls.attachment.push([revisionId, src]);
      if (src === './pict/list-only.jpg') {
        throw new mod.EgovHttpError(
          404,
          `https://laws.e-gov.go.jp/api/2/attachment/${revisionId}?src=${src}`,
          'e-Gov API returned 404',
          '{"code":"404003","message":"指定のパラメータで取得できる添付ファイルは存在しません。"}'
        );
      }
      const bytes = new TextEncoder().encode(src ? `JPEG:${src}` : 'ZIP');
      return {
        url: `https://laws.e-gov.go.jp/api/2/attachment/${revisionId}`,
        bytes,
        contentType: src ? 'image/jpeg' : 'application/octet-stream',
        fileName: null,
      };
    },
    getLawFile: async (fileType: string, id: string, asof?: string) => {
      calls.lawFile.push([fileType, id, asof]);
      return {
        url: `https://laws.e-gov.go.jp/api/2/law_file/${fileType}/${id}`,
        bytes: new TextEncoder().encode(`<Law/>`),
        contentType: 'application/octet-stream',
        fileName: `${MINPO_ID}_20260624_508AC0000000045.${fileType}`,
      };
    },
  };
});

vi.mock('@shuji-bonji/houki-abbreviations', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@shuji-bonji/houki-abbreviations')>();
  return {
    ...mod,
    resolveAbbreviation: (abbr: string) => {
      if (abbr === '所基通') {
        return { formal: '所得税基本通達', source_mcp_hint: 'houki-nta', law_id: null };
      }
      return null;
    },
  };
});

const { getAttachment, getLawFile, listAttachments } = await import('./law-files.js');
const { _resetCachesForTest } = await import('./law-service.js');

beforeAll(() => {
  filesDir = mkdtempSync(join(tmpdir(), 'houki-egov-files-'));
  process.env.HOUKI_EGOV_FILES_DIR = filesDir;
});

afterAll(() => {
  rmSync(filesDir, { recursive: true, force: true });
  delete process.env.HOUKI_EGOV_FILES_DIR;
});

beforeEach(() => {
  _resetCachesForTest();
  calls.attachment.length = 0;
  calls.lawFile.length = 0;
});

describe('list_attachments', () => {
  it('attached_files_info と本文の Fig を src で突き合わせ、位置と URL を付ける', async () => {
    const res = await listAttachments({ law_name: '国旗及び国歌に関する法律' });
    expect('error' in res).toBe(false);
    if ('error' in res) return;

    expect(res.meta.law_revision_id).toBe(KOKKI_REV);
    // 一覧 4 件 + 本文にだけある 2 件（条の中・附則の中）
    expect(res.count).toBe(6);
    expect(res.zip_url).toBe(`https://laws.e-gov.go.jp/api/2/attachment/${KOKKI_REV}`);

    const first = res.attachments[0];
    expect(first.src).toBe('./pict/H11HO127-001.jpg');
    expect(first.file_name).toBe('H11HO127-001.jpg');
    expect(first.file_type).toBe('jpg');
    expect(first.content_type).toBe('image/jpeg');
    expect(first.url).toBe(
      `https://laws.e-gov.go.jp/api/2/attachment/${KOKKI_REV}?src=.%2Fpict%2FH11HO127-001.jpg`
    );
    expect(first.updated).toBe('2024-07-25T00:20:13+09:00');
    expect(first.location).toEqual({
      tag: 'AppdxNote',
      title: '別記第一',
      related_article: '（第一条関係）',
    });

    const pdf = res.attachments.find((a) => a.file_type === 'pdf');
    expect(pdf?.content_type).toBe('application/pdf');
    expect(pdf?.location).toEqual({
      tag: 'AppdxStyle',
      title: '附録第十一号様式',
      related_article: '出生の届書（日本産業規格Ａ列四番）（第五十九条関係）',
    });

    // 一覧にだけあるファイルは location が null
    const listOnly = res.attachments.find((a) => a.src === './pict/list-only.jpg');
    expect(listOnly?.location).toBeNull();
    expect(res.note).toContain('1 件は attached_files_info にあるが本文の Fig 要素に見つからず');

    // 本文にだけあるファイルは updated が無く、条・附則の位置が付く
    const inArticle = res.attachments.find((a) => a.src === './pict/in-article.jpg');
    expect(inArticle?.updated).toBeUndefined();
    expect(inArticle?.location).toEqual({ tag: 'Article', article: '1', title: '第一条（国旗）' });
    const inSuppl = res.attachments.find((a) => a.src === './pict/in-suppl.jpg');
    expect(inSuppl?.location).toEqual({
      tag: 'SupplProvision',
      amend_law_num: '平成一一年法律第一二七号',
    });

    // pdf があるので pdf-reader-mcp の read_url を勧める
    expect(res.next_actions?.map((a) => a.action)).toEqual([
      'get_attachment',
      'pdf-reader-mcp:read_url',
    ]);
  });

  it('添付が無い法令は count 0 の成功応答（エラーにしない）', async () => {
    const res = await listAttachments({ law_name: '民法' });
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.count).toBe(0);
    expect(res.zip_url).toBeNull();
    expect(res.note).toContain('添付ファイルはありません');
    expect(res.next_actions).toBeUndefined();
  });

  it('時点（at）を渡すと、その時点の履歴の一覧になる', async () => {
    const res = await listAttachments({ law_name: '国旗及び国歌に関する法律', at: '2000-01-01' });
    if ('error' in res) throw new Error(res.error);
    expect(res.meta.law_revision_id).toBe(`${KOKKI_ID}_20000101_000000000000000`);
    expect(res.meta.at).toBe('2000-01-01');
    // attached_files が空でも本文の Fig 5 件は残る
    expect(res.count).toBe(5);
  });

  it('LAW_NOT_FOUND / OUT_OF_SCOPE は他のツールと同じ code', async () => {
    const nf = await listAttachments({ law_name: '存在しない法律' });
    expect('error' in nf && nf.code).toBe('LAW_NOT_FOUND');
    const oos = await listAttachments({ law_name: '所基通' });
    expect('error' in oos && oos.code).toBe('OUT_OF_SCOPE');
  });
});

describe('get_attachment', () => {
  it('save なしは e-Gov からファイルを取らず、URL と位置だけ返す', async () => {
    const res = await getAttachment({
      law_name: '国旗及び国歌に関する法律',
      src: './pict/H11HO127-002.jpg',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.kind).toBe('file');
    expect(res.file_name).toBe('H11HO127-002.jpg');
    expect(res.location?.title).toBe('別記第二');
    expect(res.saved).toBeUndefined();
    expect(res.note).toContain('save: true');
    expect(calls.attachment).toHaveLength(0);
  });

  it('ファイル名だけでも引ける', async () => {
    const res = await getAttachment({
      law_name: '国旗及び国歌に関する法律',
      src: 'H11HO127-001.jpg',
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.src).toBe('./pict/H11HO127-001.jpg');
  });

  it('save: true で保存先に書き、絶対パスとサイズを返す', async () => {
    const res = await getAttachment({
      law_name: '国旗及び国歌に関する法律',
      src: './pict/H11HO127-001.jpg',
      save: true,
    });
    if ('error' in res) throw new Error(res.error);
    expect(calls.attachment).toEqual([[KOKKI_REV, './pict/H11HO127-001.jpg']]);
    expect(res.saved?.path).toBe(join(filesDir, KOKKI_REV, 'H11HO127-001.jpg'));
    expect(res.saved?.bytes).toBe('JPEG:./pict/H11HO127-001.jpg'.length);
    expect(res.saved?.response_content_type).toBe('image/jpeg');
    expect(readFileSync(res.saved?.path as string, 'utf8')).toBe('JPEG:./pict/H11HO127-001.jpg');
    expect(res.note).toContain('保存しました');
  });

  it('pdf を保存すると pdf-reader-mcp の read_text を勧める', async () => {
    const res = await getAttachment({
      law_name: '国旗及び国歌に関する法律',
      src: './pict/2FH00000007000.pdf',
      save: true,
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.content_type).toBe('application/pdf');
    expect(res.next_actions?.[0]).toEqual({
      action: 'pdf-reader-mcp:read_text',
      reason: expect.any(String),
      example: { path: res.saved?.path },
    });
  });

  it('src 省略は zip。save で <law_revision_id>.zip に保存する', async () => {
    const res = await getAttachment({ law_name: '国旗及び国歌に関する法律', save: true });
    if ('error' in res) throw new Error(res.error);
    expect(res.kind).toBe('zip');
    expect(res.src).toBeNull();
    expect(res.file_name).toBe(`${KOKKI_REV}.zip`);
    expect(res.content_type).toBe('application/zip');
    expect(calls.attachment).toEqual([[KOKKI_REV, undefined]]);
    expect(existsSync(join(filesDir, KOKKI_REV, `${KOKKI_REV}.zip`))).toBe(true);
  });

  it('一覧に無い src は ATTACHMENT_NOT_FOUND（候補を hint に、list_attachments を next_actions に）', async () => {
    const res = await getAttachment({
      law_name: '国旗及び国歌に関する法律',
      src: './pict/nope.jpg',
    });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('ATTACHMENT_NOT_FOUND');
    expect(res.hint).toContain('./pict/H11HO127-001.jpg');
    expect(res.next_actions?.[0].action).toBe('list_attachments');
    expect(calls.attachment).toHaveLength(0);
  });

  it('添付が無い法令は ATTACHMENT_NOT_FOUND', async () => {
    const res = await getAttachment({ law_name: '民法', save: true });
    expect('error' in res && res.code).toBe('ATTACHMENT_NOT_FOUND');
    expect(calls.attachment).toHaveLength(0);
  });

  it('e-Gov が 404003 を返したら ATTACHMENT_NOT_FOUND（一覧にはあるが実体が無い）', async () => {
    const res = await getAttachment({
      law_name: '国旗及び国歌に関する法律',
      src: './pict/list-only.jpg',
      save: true,
    });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('ATTACHMENT_NOT_FOUND');
    expect(res.detail?.status).toBe(404);
    expect(res.detail?.cause).toContain('404003');
  });
});

describe('get_law_file', () => {
  it('save なしは URL だけ。/law_data は引かない', async () => {
    const res = await getLawFile({ law_name: '民法', file_type: 'docx' });
    if ('error' in res) throw new Error(res.error);
    expect(res.file_type).toBe('docx');
    expect(res.url).toBe(`https://laws.e-gov.go.jp/api/2/law_file/docx/${MINPO_ID}`);
    expect(res.content_type).toContain('wordprocessingml');
    expect(res.saved).toBeUndefined();
    expect(res.next_actions).toBeUndefined();
    expect(calls.lawFile).toHaveLength(0);
  });

  it('at は asof として URL に付く', async () => {
    const res = await getLawFile({ law_name: '民法', file_type: 'html', at: '2020-04-01' });
    if ('error' in res) throw new Error(res.error);
    expect(res.url).toBe(
      `https://laws.e-gov.go.jp/api/2/law_file/html/${MINPO_ID}?asof=2020-04-01`
    );
    expect(res.meta.at).toBe('2020-04-01');
  });

  it('save: true は Content-Disposition のファイル名で保存し、履歴 ID を返す', async () => {
    const res = await getLawFile({ law_name: '民法', file_type: 'xml', save: true });
    if ('error' in res) throw new Error(res.error);
    expect(calls.lawFile).toEqual([['xml', MINPO_ID, undefined]]);
    expect(res.saved?.file_name).toBe(`${MINPO_ID}_20260624_508AC0000000045.xml`);
    expect(res.saved?.law_revision_id).toBe(`${MINPO_ID}_20260624_508AC0000000045`);
    expect(res.saved?.path).toBe(
      join(
        filesDir,
        `${MINPO_ID}_20260624_508AC0000000045`,
        `${MINPO_ID}_20260624_508AC0000000045.xml`
      )
    );
    expect(res.saved?.bytes).toBe('<Law/>'.length);
    // xml は法令全体なので get_law を勧める
    expect(res.next_actions?.[0].action).toBe('get_law');
  });

  it('file_type が enum 外なら INVALID_ARGUMENT', async () => {
    const res = await getLawFile({ law_name: '民法', file_type: 'txt' });
    expect('error' in res && res.code).toBe('INVALID_ARGUMENT');
  });
});

describe('inputSchema', () => {
  const validate = (schema: unknown, args: unknown) =>
    fromJsonSchema(schema as JsonSchemaType)['~standard'].validate(args);

  it('3 ツールとも additionalProperties: false で、未知の引数を拒否する', async () => {
    for (const tool of [listAttachmentsTool, getAttachmentTool, getLawFileTool]) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
      const r = await validate(tool.inputSchema, { law_name: '民法', file_type: 'xml', nope: 1 });
      expect(r.issues).toBeDefined();
    }
  });

  it('get_law_file の file_type は xml / json / html / rtf / docx', async () => {
    expect(getLawFileTool.inputSchema.properties.file_type.enum).toEqual([
      'xml',
      'json',
      'html',
      'rtf',
      'docx',
    ]);
    const bad = await validate(getLawFileTool.inputSchema, { law_name: '民法', file_type: 'txt' });
    expect(bad.issues).toBeDefined();
  });
});
