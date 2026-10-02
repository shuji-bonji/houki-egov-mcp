/**
 * 差分 20261002-t1-followups の受入テスト — common_errors
 *
 * 期待値の正本: specs/changes/20261002-t1-followups/specs/common_errors/spec.md
 * （SPEC-EGOV-COMMON-ERRORS-022 の表の、型が number と string の和の行）
 * MCP クライアントから tools/call を呼ぶ。e-Gov への通信は fetch を差し替えて塞ぐ（呼ばれたら失敗させる）。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Harness, startHarness } from '../../test-helpers/mcp-harness.js';

describe('common_errors (20261002-t1-followups)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it('SPEC-EGOV-COMMON-ERRORS-022 型が number と string の和の引数に、どちらでもない値を渡すと「数値か文字列で指定してください」（type の並びによらない）', async () => {
    const cases: Array<{ name: string; args: Record<string, unknown>; path: string }> = [
      // type: ["number", "string"]
      { name: 'get_law', args: { law_name: '民法', article: '1', item: null }, path: 'item' },
      { name: 'get_law', args: { law_name: '民法', article: '1', item: [8] }, path: 'item' },
      {
        name: 'verify_citations',
        args: { citations: [{ law_name: '民法', article: '1', item: true }] },
        path: 'citations.0.item',
      },
      // type: ["string", "number"]
      { name: 'get_law_range', args: { law_name: '民法', chapter: null }, path: 'chapter' },
      { name: 'get_law_range', args: { law_name: '民法', part: {} }, path: 'part' },
    ];
    for (const c of cases) {
      const r = await h.call(c.name, c.args);
      expect(r.isError, c.path).toBe(true);
      expect(r.body.code, c.path).toBe('INVALID_ARGUMENT');
      expect(r.body.detail.issues, c.path).toEqual([
        { path: c.path, message: '数値か文字列で指定してください' },
      ]);
    }
    expect(h.urls()).toHaveLength(0);
  });
});
