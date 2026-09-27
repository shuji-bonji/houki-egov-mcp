/**
 * 差分 20260928-untested-behaviors の受入テスト（common_errors）。
 *
 * 期待値は specs/changes/20260928-untested-behaviors/specs/common_errors/spec.md から取る。
 * createServer() を InMemoryTransport で in-process 起動し、tools/call の応答を検証する。
 * e-Gov への通信は fetch を差し替えて塞ぐ（呼ばれたら失敗させる）。
 */

import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeError } from '../../errors.js';
import { createServer } from '../../server.js';
import { tools } from '../../tools/definitions.js';

vi.mock('../../tools/handlers.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../tools/handlers.js')>();
  return {
    ...mod,
    toolHandlers: {
      ...mod.toolHandlers,
      __test_throw_error: async () => {
        throw new Error('boom');
      },
      __test_throw_string: async () => {
        throw 'strboom';
      },
      __test_empty_hint: async () => makeError('LAW_NOT_FOUND', 'x', { hint: '' }),
    },
  };
});

interface TextContent {
  type: 'text';
  text: string;
}

interface ErrorBody {
  error: string;
  code: string;
  hint?: string;
  next_actions?: Array<{ action: string; reason: string; example?: unknown }>;
  retryable?: boolean;
  detail?: { cause?: string; issues?: Array<{ path: string; message: string }> };
}

function firstText(result: { content?: unknown }): string {
  const content = result.content as TextContent[];
  expect(content[0]?.type).toBe('text');
  return content[0].text;
}

const PREFIX = '引数が tools/list の inputSchema に合いません: ';
const INTERNAL_HINT = 'バグの可能性があります。再現手順を添えて GitHub issue でご報告ください';
const RETRY_LATER = {
  action: 'retry_later',
  reason: '一時的な API エラーの可能性があります。30秒〜数分後に再試行してください',
};
const LIST_TOOLS = {
  action: 'list_tools',
  reason: 'inputSchema で引数の型と必須項目を確認できます',
};

function schemaHint(name: string): string {
  return `tools/list の ${name} の inputSchema を確認してください (型・必須・enum・未知の引数)`;
}

function expectedError(issues: Array<{ path: string; message: string }>): string {
  const parts = issues.map((i) => (i.path === '' ? i.message : `${i.path}: ${i.message}`));
  return `${PREFIX}${parts.join('; ')}`;
}

describe('common_errors (20260928-untested-behaviors)', () => {
  let client: Client;
  const fetchMock = vi.fn(async () => {
    throw new Error('e-Gov にアクセスしてはいけません');
  });

  beforeEach(async () => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    client = new Client({ name: 'houki-egov-spec-test', version: '0.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    vi.unstubAllGlobals();
  });

  async function call(name: string, args?: Record<string, unknown>) {
    const res =
      args === undefined
        ? await client.callTool({ name })
        : await client.callTool({ name, arguments: args });
    return { res, text: firstText(res), body: JSON.parse(firstText(res)) as ErrorBody };
  }

  it('SPEC-EGOV-COMMON-ERRORS-012 search_law を arguments なしで呼ぶと INVALID_ARGUMENT と決まった hint', async () => {
    const { res, body } = await call('search_law');
    expect(res.isError).toBe(true);
    expect(body.code).toBe('INVALID_ARGUMENT');
    expect(body.hint).toBe(
      'tools/list の search_law の inputSchema を確認してください (型・必須・enum・未知の引数)'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('SPEC-EGOV-COMMON-ERRORS-012 例のツールを arguments なしで呼ぶとどれも INVALID_ARGUMENT で、arguments: {} と同じ本文', async () => {
    const names = [
      'explain_law_type',
      'get_law',
      'resolve_abbreviation',
      'verify_citations',
      'list_attachments',
      'get_law_file',
    ];
    for (const name of names) {
      const omitted = await call(name);
      expect(omitted.res.isError, name).toBe(true);
      expect(omitted.body.code, name).toBe('INVALID_ARGUMENT');
      const empty = await call(name, {});
      expect(omitted.text, name).toBe(empty.text);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('SPEC-EGOV-COMMON-ERRORS-012 14 ツールのどれも arguments なしで INVALID_ARGUMENT（ツールの処理に進まない）', async () => {
    expect(tools).toHaveLength(14);
    for (const t of tools) {
      const omitted = await call(t.name);
      expect(omitted.res.isError, t.name).toBe(true);
      expect(omitted.body.code, t.name).toBe('INVALID_ARGUMENT');
      const empty = await call(t.name, {});
      expect(omitted.text, t.name).toBe(empty.text);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('SPEC-EGOV-COMMON-ERRORS-013 error は前置きの後に detail.issues を <path>: <message> で ; 区切りに続けたもの', async () => {
    const cases: Array<{ name: string; args: Record<string, unknown>; path: string }> = [
      { name: 'explain_law_type', args: { name: 123 }, path: 'name' },
      { name: 'explain_law_type', args: { name: '政令', typo: 1 }, path: 'typo' },
      { name: 'search_law', args: { keyword: '消費税', law_type: 'Bogus' }, path: 'law_type' },
    ];
    for (const c of cases) {
      const { res, body } = await call(c.name, c.args);
      expect(res.isError).toBe(true);
      expect(body.code).toBe('INVALID_ARGUMENT');
      const issues = body.detail?.issues ?? [];
      expect(issues).toHaveLength(1);
      expect(issues[0].path).toBe(c.path);
      expect(body.error).toBe(expectedError(issues));
      expect(body.error).toBe(`${PREFIX}${c.path}: ${issues[0].message}`);
    }
  });

  it('SPEC-EGOV-COMMON-ERRORS-013 複数の問題や path が空の問題でも同じ規則で組み立てる', async () => {
    const targets: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: 'search_law', args: {} },
      { name: 'get_article_references', args: { typo: 1 } },
      { name: 'explain_law_type', args: { name: 1, extra: true } },
    ];
    for (const t of targets) {
      const { body } = await call(t.name, t.args);
      expect(body.code).toBe('INVALID_ARGUMENT');
      const issues = body.detail?.issues ?? [];
      expect(issues.length).toBeGreaterThan(0);
      expect(body.error).toBe(expectedError(issues));
    }
  });

  it('SPEC-EGOV-COMMON-ERRORS-014 hint は呼んだツールの名前を入れた決まった文', async () => {
    const a = await call('explain_law_type', { name: 123 });
    expect(a.body.hint).toBe(
      'tools/list の explain_law_type の inputSchema を確認してください (型・必須・enum・未知の引数)'
    );
    const b = await call('search_law', { keyword: '消費税', law_type: 'Bogus' });
    expect(b.body.hint).toBe(
      'tools/list の search_law の inputSchema を確認してください (型・必須・enum・未知の引数)'
    );
    for (const t of tools) {
      const { body } = await call(t.name, { __unknown_arg__: 1 });
      expect(body.code, t.name).toBe('INVALID_ARGUMENT');
      expect(body.hint, t.name).toBe(schemaHint(t.name));
    }
  });

  it('SPEC-EGOV-COMMON-ERRORS-015 next_actions は list_tools の 1 件で、example も retryable も無い', async () => {
    const { body } = await call('explain_law_type', { name: '政令', typo: 1 });
    expect(body.next_actions).toEqual([LIST_TOOLS]);
    expect(body.next_actions?.[0]).not.toHaveProperty('example');
    expect(body).not.toHaveProperty('retryable');
    const b = await call('explain_law_type', { name: 123 });
    expect(b.body.next_actions).toEqual([LIST_TOOLS]);
    expect(b.body).not.toHaveProperty('retryable');
  });

  it('SPEC-EGOV-COMMON-ERRORS-016 INTERNAL_ERROR の error と detail.cause は例外の文（Error と文字列）', async () => {
    const a = await call('__test_throw_error', {});
    expect(a.res.isError).toBe(true);
    expect(a.body.code).toBe('INTERNAL_ERROR');
    expect(a.body.error).toBe('内部エラーが発生しました: boom');
    expect(a.body.detail?.cause).toBe('boom');
    const b = await call('__test_throw_string', {});
    expect(b.res.isError).toBe(true);
    expect(b.body.code).toBe('INTERNAL_ERROR');
    expect(b.body.error).toBe('内部エラーが発生しました: strboom');
    expect(b.body.detail?.cause).toBe('strboom');
  });

  it('SPEC-EGOV-COMMON-ERRORS-017 INTERNAL_ERROR の hint は例外の文によらず決まった文', async () => {
    const a = await call('__test_throw_error', {});
    expect(a.body.hint).toBe(INTERNAL_HINT);
    const b = await call('__test_throw_string', {});
    expect(b.body.hint).toBe(INTERNAL_HINT);
  });

  it('SPEC-EGOV-COMMON-ERRORS-018 INTERNAL_ERROR の next_actions は retry_later の 1 件で example は無い', async () => {
    const a = await call('__test_throw_error', {});
    expect(a.body.next_actions).toEqual([RETRY_LATER]);
    expect(a.body.next_actions?.[0]).not.toHaveProperty('example');
    const b = await call('__test_throw_string', {});
    expect(b.body.next_actions).toEqual([RETRY_LATER]);
  });

  it('SPEC-EGOV-COMMON-ERRORS-019 hint が空文字のエラーには hint のキーを付けない', async () => {
    const { res, body } = await call('__test_empty_hint', {});
    expect(res.isError).toBe(true);
    expect(body).toEqual({ error: 'x', code: 'LAW_NOT_FOUND' });
    expect(body).not.toHaveProperty('hint');
  });
});
