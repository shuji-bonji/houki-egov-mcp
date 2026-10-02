/**
 * 差分 20261003-t5-docs-mismatch の受入テスト — UNKNOWN_TOOL と INTERNAL_ERROR
 *
 * 期待値の正本: specs/changes/20261003-t5-docs-mismatch/specs/common_errors/spec.md
 * createServer() を InMemoryTransport で in-process 起動する。想定外の例外は、テスト用のツールを
 * toolHandlers に足して投げさせる。e-Gov への通信は呼ばれたら失敗させる。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Harness, startHarness } from '../../test-helpers/mcp-harness.js';

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
    },
  };
});

describe('UNKNOWN_TOOL と INTERNAL_ERROR（20261003-t5-docs-mismatch）', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it('SPEC-EGOV-COMMON-ERRORS-002 存在しないツール名は UNKNOWN_TOOL で、error は日本語の 1 文、retryable: false', async () => {
    const r = await h.call('no_such_tool', {});
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('UNKNOWN_TOOL');
    expect(r.body.error).toBe('存在しないツールです: no_such_tool');
    expect(r.body.retryable).toBe(false);
    expect(r.body.hint).toContain('search_law');
    expect(r.body.next_actions[0].action).toBe('list_tools');
    expect(h.urls()).toHaveLength(0);
  });

  it('SPEC-EGOV-COMMON-ERRORS-007 処理中の想定外の例外は INTERNAL_ERROR で retryable: false、detail.cause に例外の文', async () => {
    const r = await h.call('__test_throw_error', {});
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('INTERNAL_ERROR');
    expect(r.body.retryable).toBe(false);
    expect(r.body.detail.cause).toBe('boom');
    const s = await h.call('__test_throw_string', {});
    expect(s.body.code).toBe('INTERNAL_ERROR');
    expect(s.body.retryable).toBe(false);
    expect(s.body.detail.cause).toBe('strboom');
  });

  it('SPEC-EGOV-COMMON-ERRORS-018 処理中の想定外の例外の INTERNAL_ERROR には next_actions のキーが無い', async () => {
    for (const name of ['__test_throw_error', '__test_throw_string']) {
      const r = await h.call(name, {});
      expect(r.body.code, name).toBe('INTERNAL_ERROR');
      expect(Object.hasOwn(r.body, 'next_actions'), name).toBe(false);
      expect(r.text, name).not.toContain('retry_later');
    }
  });
});
