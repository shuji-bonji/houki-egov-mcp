/**
 * 差分 20261003-search-explain-attachment の受入テスト — explain_law_type（#62）
 *
 * 期待値の正本: specs/changes/20261003-search-explain-attachment/specs/explain_law_type/spec.md
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type AnyObj, type Harness, startHarness } from '../../test-helpers/mcp-harness.js';

describe('explain_law_type（20261003-search-explain-attachment）', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness(() => null);
  });
  afterEach(async () => {
    await h.close();
  });
  const explain = async (name: string): Promise<AnyObj> => {
    const r = await h.call('explain_law_type', { name });
    expect(r.isError).toBe(false);
    return r.body;
  };

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-012 憲法は law_type_code: Constitution、規則は Rule。通達の aliases は基本通達・取扱通達', async () => {
    const kenpo = await explain('憲法');
    expect(kenpo.info.aliases).toEqual(['日本国憲法']);
    expect(kenpo.info.law_type_code).toBe('Constitution');
    expect((await explain('規則')).info.law_type_code).toBe('Rule');
    expect((await explain('法律')).info.law_type_code).toBe('Act');
    const seirei = await explain('政令');
    expect(seirei.info.aliases).toEqual(['施行令', 'CabinetOrder']);
    expect(seirei.info.law_type_code).toBe('CabinetOrder');
    expect((await explain('省令')).info.law_type_code).toBe('MinisterialOrdinance');
    expect((await explain('通達')).info.aliases).toEqual(['基本通達', '取扱通達']);
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-021 通知は通達と別の種別として解説し、通達の別名に入れない', async () => {
    const tsuchi = await explain('通知');
    expect(tsuchi.found).toBe(true);
    expect(tsuchi.info).toMatchObject({
      name: '通知',
      enacting_body: '行政機関',
      hierarchy_rank: 99,
      level: 'agency-internal',
      binds_citizens: false,
      can_set_penalties: false,
    });
    const tsutatsu = await explain('通達');
    expect(tsutatsu.info.aliases).not.toContain('通知');
    const unknown = await explain('存在しない種別');
    expect(unknown.found).toBe(false);
    expect(unknown.hint).toContain('通知');
    expect(unknown.next_actions[0].example.names).toContain('通知');
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-022 Constitution は憲法、Rule は規則の解説を返す', async () => {
    const c = await explain('Constitution');
    expect(c.found).toBe(true);
    expect(c.info.name).toBe('憲法');
    const r = await explain('Rule');
    expect(r.found).toBe(true);
    expect(r.info.name).toBe('規則');
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-022 ImperialOrder・Misc・ImperialOrdinance は収録している種別に当たらず found: false', async () => {
    for (const name of ['ImperialOrder', 'Misc', 'ImperialOrdinance']) {
      expect((await explain(name)).found).toBe(false);
    }
  });
});
