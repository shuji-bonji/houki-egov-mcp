/**
 * 差分 20261003-t5-docs-mismatch の受入テスト — explain_law_type の see_also
 *
 * 期待値の正本: specs/changes/20261003-t5-docs-mismatch/specs/explain_law_type/spec.md
 * 同梱の知識だけを引くツールなので、e-Gov への問い合わせは起きない。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Harness, startHarness } from '../../test-helpers/mcp-harness.js';

const SEE_ALSO = 'https://github.com/shuji-bonji/houki-egov-mcp/blob/main/docs/LAW-HIERARCHY.md';

describe('explain_law_type の see_also（20261003-t5-docs-mismatch）', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-020 found: true の応答の see_also は GitHub の URL', async () => {
    for (const name of ['政令', '法律', '省令']) {
      const r = await h.call('explain_law_type', { name });
      expect(r.isError, name).toBe(false);
      expect(r.body.found, name).toBe(true);
      expect(r.body.see_also, name).toBe(SEE_ALSO);
    }
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-020 found: false の応答の see_also も GitHub の URL（キーは消さない）', async () => {
    const r = await h.call('explain_law_type', { name: '架空法令' });
    expect(r.isError).toBe(false);
    expect(r.body.found).toBe(false);
    expect(Object.hasOwn(r.body, 'see_also')).toBe(true);
    expect(r.body.see_also).toBe(SEE_ALSO);
    expect(h.urls()).toHaveLength(0);
  });
});
