/**
 * 差分 20261001-t1-argument-guards の受入テスト — common_errors
 *
 * 期待値の正本: specs/changes/20261001-t1-argument-guards/specs/common_errors/spec.md
 * MCP クライアントから tools/call を呼ぶ。e-Gov への通信は fetch を差し替えて塞ぐ（呼ばれたら失敗させる）。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Harness, startHarness } from '../../test-helpers/mcp-harness.js';
import { tools } from '../../tools/definitions.js';

const PREFIX = '引数が tools/list の inputSchema に合いません: ';
const LIST_TOOLS = {
  action: 'list_tools',
  reason: 'inputSchema で引数の型と必須項目を確認できます',
};
const schemaHint = (name: string) =>
  `tools/list の ${name} の inputSchema を確認してください (型・必須・enum・範囲・形式・未知の引数)`;

/** inputSchema の properties を名前で引く（入れ子は citations.items のように辿る） */
function prop(toolName: string, ...path: string[]): Record<string, unknown> {
  const t = tools.find((x) => x.name === toolName);
  // biome-ignore lint/suspicious/noExplicitAny: inputSchema を自由に辿るため
  let node: any = t?.inputSchema;
  for (const key of path) {
    node = key === 'items' ? node.items : node.properties[key];
  }
  return node as Record<string, unknown>;
}

describe('common_errors (20261001-t1-argument-guards)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it('SPEC-EGOV-COMMON-ERRORS-003 範囲・形の違反も inputSchema の検査で INVALID_ARGUMENT（tool と detail.issues）', async () => {
    const cases: Array<{ name: string; args: Record<string, unknown>; path: string }> = [
      { name: 'explain_law_type', args: { name: 123 }, path: 'name' },
      { name: 'search_law', args: {}, path: 'keyword' },
      { name: 'search_law', args: { keyword: '消費税', law_type: 'Bogus' }, path: 'law_type' },
      { name: 'search_law', args: { keyword: '消費税', limit: 100 }, path: 'limit' },
      { name: 'get_article_references', args: { law_name: '所得税法' }, path: 'article' },
      { name: 'get_law', args: { law_name: '民法', at: '2024/04/01' }, path: 'at' },
      { name: 'get_law', args: { law_name: '' }, path: 'law_name' },
      { name: 'verify_citations', args: { citations: [] }, path: 'citations' },
    ];
    for (const c of cases) {
      const r = await h.call(c.name, c.args);
      expect(r.isError, c.name).toBe(true);
      expect(r.body.code, c.name).toBe('INVALID_ARGUMENT');
      expect(r.body.tool, c.name).toBe(c.name);
      expect(r.body.detail.issues[0].path, c.name).toBe(c.path);
    }
    expect(h.urls()).toHaveLength(0);
  });

  it('SPEC-EGOV-COMMON-ERRORS-012 arguments を省くと INVALID_ARGUMENT。hint と detail.issues は決まった形で、arguments: {} と同じ本文', async () => {
    const r = await h.call('search_law');
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.tool).toBe('search_law');
    expect(r.body.hint).toBe(schemaHint('search_law'));
    expect(r.body.detail.issues).toEqual([{ path: 'keyword', message: '必須の引数です' }]);
    for (const t of tools) {
      const omitted = await h.call(t.name);
      const empty = await h.call(t.name, {});
      expect(omitted.body.code, t.name).toBe('INVALID_ARGUMENT');
      expect(omitted.text, t.name).toBe(empty.text);
    }
    expect(h.urls()).toHaveLength(0);
  });

  it('SPEC-EGOV-COMMON-ERRORS-013 error は前置きの後に detail.issues を <path>: <message> の形で ; 区切りに続けたもの（例の表）', async () => {
    const cases: Array<{
      name: string;
      args: Record<string, unknown>;
      error: string;
      issues: Array<{ path: string; message: string }>;
    }> = [
      {
        name: 'explain_law_type',
        args: { name: 123 },
        error: `${PREFIX}name: 文字列で指定してください`,
        issues: [{ path: 'name', message: '文字列で指定してください' }],
      },
      {
        name: 'explain_law_type',
        args: { name: '政令', typo: 1 },
        error: `${PREFIX}typo: inputSchema に無い引数です`,
        issues: [{ path: 'typo', message: 'inputSchema に無い引数です' }],
      },
      {
        name: 'search_law',
        args: { keyword: '消費税', law_type: 'Bogus' },
        error: `${PREFIX}law_type: Act・CabinetOrder・ImperialOrdinance・MinisterialOrdinance・Rule のどれかで指定してください`,
        issues: [
          {
            path: 'law_type',
            message:
              'Act・CabinetOrder・ImperialOrdinance・MinisterialOrdinance・Rule のどれかで指定してください',
          },
        ],
      },
      {
        name: 'search_law',
        args: { keyword: 1, limit: 'x' },
        error: `${PREFIX}keyword: 文字列で指定してください; limit: 整数で指定してください`,
        issues: [
          { path: 'keyword', message: '文字列で指定してください' },
          { path: 'limit', message: '整数で指定してください' },
        ],
      },
    ];
    for (const c of cases) {
      const r = await h.call(c.name, c.args);
      expect(r.body.error).toBe(c.error);
      expect(r.body.detail.issues).toEqual(c.issues);
    }
  });

  it('SPEC-EGOV-COMMON-ERRORS-014 hint は呼んだツールの名前を入れた決まった文（範囲・形式を含む）', async () => {
    const a = await h.call('explain_law_type', { name: 123 });
    expect(a.body.hint).toBe(
      'tools/list の explain_law_type の inputSchema を確認してください (型・必須・enum・範囲・形式・未知の引数)'
    );
    const b = await h.call('search_law', { keyword: '消費税', limit: 0 });
    expect(b.body.hint).toBe(
      'tools/list の search_law の inputSchema を確認してください (型・必須・enum・範囲・形式・未知の引数)'
    );
    for (const t of tools) {
      const r = await h.call(t.name, { __unknown_arg__: 1 });
      expect(r.body.hint, t.name).toBe(schemaHint(t.name));
      expect(r.body.next_actions, t.name).toEqual([LIST_TOOLS]);
    }
  });

  it('SPEC-EGOV-COMMON-ERRORS-020 inputSchema の検査の INVALID_ARGUMENT は code と並ぶ位置に tool を持つ（detail の中ではない）', async () => {
    const a = await h.call('explain_law_type', { name: 123 });
    expect(a.body.tool).toBe('explain_law_type');
    expect(a.body.detail).not.toHaveProperty('tool');
    expect(Object.keys(a.body).slice(0, 3)).toEqual(['error', 'code', 'tool']);
    const b = await h.call('get_related_laws', { law_name: '所得税法', mcp: 'houki-egov' });
    expect(b.body.tool).toBe('get_related_laws');
    const c = await h.call('verify_citations');
    expect(c.body.tool).toBe('verify_citations');
  });

  it('SPEC-EGOV-COMMON-ERRORS-021 detail.issues は違反 1 件ごとに分け、path は空でない引数名', async () => {
    const a = await h.call('explain_law_type', { name: '政令', typo: 1, foo: 2 });
    expect(a.body.detail.issues).toEqual([
      { path: 'typo', message: 'inputSchema に無い引数です' },
      { path: 'foo', message: 'inputSchema に無い引数です' },
    ]);
    const b = await h.call('get_article_references', {});
    expect(b.body.detail.issues).toEqual([
      { path: 'law_name', message: '必須の引数です' },
      { path: 'article', message: '必須の引数です' },
    ]);
    const c = await h.call('search_law', { keyword: 'a', limit: 'x', zz: 1 });
    expect(c.body.detail.issues.map((i: { path: string }) => i.path)).toEqual(['limit', 'zz']);
    const d = await h.call('verify_citations', {
      citations: [{ law_name: '民法', article: '1', paragraph: 0 }],
    });
    expect(d.body.detail.issues).toEqual([
      { path: 'citations.0.paragraph', message: '1 以上で指定してください' },
    ]);
    for (const t of tools) {
      const r = await h.call(t.name, {});
      for (const i of r.body.detail.issues) expect(i.path, t.name).not.toBe('');
    }
  });

  it('SPEC-EGOV-COMMON-ERRORS-022 detail.issues[].message は違反の種類ごとに決まった日本語の 1 文', async () => {
    const msg = async (name: string, args: Record<string, unknown>) =>
      (await h.call(name, args)).body.detail.issues[0].message;
    expect(await msg('get_law', { law_name: '民法', paragraph: 1.5 })).toBe(
      '整数で指定してください'
    );
    expect(await msg('get_law', { law_name: '民法', paragraph: 0 })).toBe(
      '1 以上で指定してください'
    );
    expect(await msg('search_law', { keyword: '民法', limit: 51 })).toBe(
      '50 以下で指定してください'
    );
    expect(await msg('get_law', { law_name: '民法', at: '2024/04/01' })).toBe(
      'YYYY-MM-DD の形で指定してください'
    );
    expect(await msg('get_law', { law_name: '' })).toBe('空文字は指定できません');
    expect(await msg('get_law_file', { law_name: '民法', file_type: 'pdf' })).toBe(
      'xml・json・html・rtf・docx のどれかで指定してください'
    );
    expect(await msg('verify_citations', { citations: [] })).toBe('1 件以上で指定してください');
    const many = Array.from({ length: 51 }, () => ({ law_name: '民法', article: '1' }));
    expect(await msg('verify_citations', { citations: many })).toBe('50 件以下で指定してください');
    expect(await msg('verify_citations', { citations: 'x' })).toBe('配列で指定してください');
    expect(await msg('verify_citations', { citations: [1] })).toBe(
      'オブジェクトで指定してください'
    );
    expect(await msg('get_toc', { law_name: '民法', with_amend_titles: 'yes' })).toBe(
      'true か false で指定してください'
    );
    expect(await msg('explain_law_type', {})).toBe('必須の引数です');
    expect(await msg('explain_law_type', { name: '政令', typo: 1 })).toBe(
      'inputSchema に無い引数です'
    );
    expect(await msg('get_law_range', { law_name: '民法', chapter: 1, max_chars: 1999 })).toBe(
      '2000 以上で指定してください'
    );
    // 英文（検査の部品の文）をそのまま返さない
    for (const t of tools) {
      const r = await h.call(t.name, { __unknown_arg__: 1 });
      expect(r.body.error, t.name).not.toMatch(/must|additional properties/);
    }
  });

  it('SPEC-EGOV-COMMON-ERRORS-023 数値の引数は inputSchema に integer と範囲を持ち、範囲の外は丸めずに INVALID_ARGUMENT', async () => {
    const table: Array<[string, string[], number, number | undefined]> = [
      ['search_law', ['limit'], 1, 50],
      ['search_fulltext', ['limit'], 1, 30],
      ['get_law_revisions', ['latest'], 1, undefined],
      ['get_toc', ['depth'], 1, undefined],
      ['get_law', ['paragraph'], 1, undefined],
      ['get_article_references', ['paragraph'], 1, undefined],
      ['verify_citations', ['citations', 'items', 'paragraph'], 1, undefined],
      ['get_law_range', ['suppl_index'], 1, undefined],
      ['get_law_range', ['max_chars'], 2000, 120000],
    ];
    for (const [name, path, min, max] of table) {
      const p = prop(name, ...path);
      expect(p.type, `${name}.${path.join('.')}`).toBe('integer');
      expect(p.minimum, `${name}.${path.join('.')}`).toBe(min);
      if (max === undefined) expect(p, `${name}.${path.join('.')}`).not.toHaveProperty('maximum');
      else expect(p.maximum, `${name}.${path.join('.')}`).toBe(max);
    }
    const r = await h.call('get_toc', { law_name: '民法', depth: -1 });
    expect(r.body.code).toBe('INVALID_ARGUMENT');
    expect(r.body.detail.issues).toEqual([{ path: 'depth', message: '1 以上で指定してください' }]);
    expect(h.urls()).toHaveLength(0);
  });

  it('SPEC-EGOV-COMMON-ERRORS-024 at は 8 ツールの inputSchema に pattern を持ち、形の違反と暦に無い日付は e-Gov に問い合わせずに INVALID_ARGUMENT', async () => {
    const atTools = [
      'get_law',
      'get_toc',
      'get_law_range',
      'get_article_references',
      'verify_citations',
      'list_attachments',
      'get_attachment',
      'get_law_file',
    ];
    for (const name of atTools) {
      expect(prop(name, 'at').pattern, name).toBe('^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
    }
    for (const at of ['2024/04/01', '20240401', '2024-4-1', '2024-04-01T00:00:00Z']) {
      const r = await h.call('get_law', { law_name: '民法', at });
      expect(r.body.code, at).toBe('INVALID_ARGUMENT');
      expect(r.body.tool, at).toBe('get_law');
      expect(r.body.detail.issues, at).toEqual([
        { path: 'at', message: 'YYYY-MM-DD の形で指定してください' },
      ]);
    }
    for (const at of ['2026-02-30', '2026-13-01', '2026-04-31']) {
      const r = await h.call('get_law', { law_name: '民法', at });
      expect(r.isError, at).toBe(true);
      expect(r.body.code, at).toBe('INVALID_ARGUMENT');
      expect(r.body.tool, at).toBe('get_law');
      expect(r.body.error, at).toBe(`at が暦に無い日付です: ${at}`);
      expect(r.body.detail.issues, at).toEqual([{ path: 'at', message: '暦に無い日付です' }]);
    }
    expect(h.urls()).toHaveLength(0);
  });

  it('SPEC-EGOV-COMMON-ERRORS-025 必須の文字列は inputSchema に minLength: 1 を持ち、空文字は e-Gov に問い合わせずに INVALID_ARGUMENT', async () => {
    const required: Array<[string, string[]]> = [
      ['search_law', ['keyword']],
      ['search_fulltext', ['keyword']],
      ['get_law', ['law_name']],
      ['get_toc', ['law_name']],
      ['get_law_range', ['law_name']],
      ['get_law_revisions', ['law_name']],
      ['get_related_laws', ['law_name']],
      ['get_article_references', ['law_name']],
      ['get_article_references', ['article']],
      ['list_attachments', ['law_name']],
      ['get_attachment', ['law_name']],
      ['get_law_file', ['law_name']],
      ['resolve_abbreviation', ['abbr']],
      ['explain_law_type', ['name']],
      ['verify_citations', ['citations', 'items', 'article']],
    ];
    for (const [name, path] of required) {
      expect(prop(name, ...path).minLength, `${name}.${path.join('.')}`).toBe(1);
    }
    expect(prop('get_law_file', 'file_type')).not.toHaveProperty('minLength');
    expect(prop('verify_citations', 'citations', 'items', 'law_name')).not.toHaveProperty(
      'minLength'
    );
    expect(prop('verify_citations', 'citations', 'items', 'law_id')).not.toHaveProperty(
      'minLength'
    );
    const a = await h.call('get_law', { law_name: '' });
    expect(a.body.code).toBe('INVALID_ARGUMENT');
    expect(a.body.tool).toBe('get_law');
    expect(a.body.detail.issues).toEqual([{ path: 'law_name', message: '空文字は指定できません' }]);
    const b = await h.call('resolve_abbreviation', { abbr: '' });
    expect(b.body.code).toBe('INVALID_ARGUMENT');
    const c = await h.call('search_fulltext', { keyword: '' });
    expect(c.body.code).toBe('INVALID_ARGUMENT');
    expect(h.urls()).toHaveLength(0);
  });

  it('SPEC-EGOV-COMMON-ERRORS-026 空白だけの必須の文字列は、ツールの処理で tool・detail.issues を持つ INVALID_ARGUMENT', async () => {
    const a = await h.call('get_law', { law_name: '   ' });
    expect(a.isError).toBe(true);
    expect(a.body.code).toBe('INVALID_ARGUMENT');
    expect(a.body.tool).toBe('get_law');
    expect(a.body.error).toBe('law_name が空です');
    expect(a.body.detail.issues).toEqual([
      { path: 'law_name', message: '空白だけは指定できません' },
    ]);
    expect(typeof a.body.hint).toBe('string');
    const b = await h.call('explain_law_type', { name: '\t\n' });
    expect(b.body.code).toBe('INVALID_ARGUMENT');
    expect(b.body).not.toHaveProperty('found');
    for (const blank of ['　', ' \t\n', '　　']) {
      const r = await h.call('search_law', { keyword: blank });
      expect(r.body.code).toBe('INVALID_ARGUMENT');
      expect(r.body.detail.issues[0].message).toBe('空白だけは指定できません');
    }
    expect(h.urls()).toHaveLength(0);
  });
});
