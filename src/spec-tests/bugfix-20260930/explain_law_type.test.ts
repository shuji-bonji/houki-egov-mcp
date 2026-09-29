/**
 * 受入テスト: explain_law_type（差分 20260930-bugfix-batch の ADDED、houki-egov-mcp #73）
 *
 * 期待値の正本は specs/changes/20260930-bugfix-batch/specs/explain_law_type/spec.md。
 * 同梱の知識だけを引くツールなので、e-Gov への問い合わせは起きない（fetch を差し替えて 0 回を確かめる）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toolHandlers } from '../../tools/handlers.js';

interface ExplainResult {
  name: string;
  found: boolean;
  hint?: string;
  related_tools?: string[];
  next_actions?: Array<{ action: string; reason: string; example?: { names?: string[] } }>;
  info?: { name: string };
}

const KNOWN_NAMES = ['憲法', '法律', '政令', '省令', '規則', '条例', '告示', '訓令', '通達'];

const fetchMock = vi.fn(async () => {
  throw new Error('fetch はこのツールでは呼ばれない');
});

async function explain(name: string): Promise<ExplainResult> {
  return (await toolHandlers.explain_law_type({ name })) as ExplainResult;
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('explain_law_type — Object.prototype のプロパティの名前（差分 20260930-bugfix-batch）', () => {
  describe('SPEC-EGOV-EXPLAIN-LAW-TYPE-018 Object.prototype のプロパティの名前は知らない名前として found: false を返す', () => {
    it.each(['toString', 'constructor', 'hasOwnProperty', 'valueOf', '__proto__'])(
      'SPEC-EGOV-EXPLAIN-LAW-TYPE-018 %s は found: false で、hint と next_actions を持ち、info と related_tools を持たない',
      async (name) => {
        const r = await explain(name);
        expect(r.name).toBe(name);
        expect(r.found).toBe(false);
        expect(r.hint?.startsWith('知らない法令種別です。試せる名前: ')).toBe(true);
        expect(r.next_actions).toHaveLength(1);
        expect(r.next_actions?.[0].action).toBe('list_known_law_types');
        expect(r.next_actions?.[0].example?.names).toEqual(expect.arrayContaining(KNOWN_NAMES));
        expect(r).not.toHaveProperty('info');
        expect(r).not.toHaveProperty('related_tools');
      }
    );

    it('SPEC-EGOV-EXPLAIN-LAW-TYPE-018 toString の応答を JSON にしても found: false のままで info が無い', async () => {
      const r = JSON.parse(JSON.stringify(await explain('toString'))) as ExplainResult;
      expect(r.found).toBe(false);
      expect(r.info).toBeUndefined();
    });
  });
});
