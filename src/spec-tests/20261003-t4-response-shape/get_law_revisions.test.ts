/**
 * 差分 20261003-t4-response-shape の受入テスト — get_law_revisions の並びと値の無いキー
 *
 * 期待値の正本: specs/changes/20261003-t4-response-shape/specs/get_law_revisions/spec.md
 * e-Gov の改正履歴（/law_revisions/<law_id>）は fetch の差し替えで返す。e-Gov が返す順を
 * テストごとに変え、ツールが施行日の新しい順に並べ直すことを確かめる。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AnyObj,
  type Harness,
  json,
  lawsResponse,
  startHarness,
} from '../../test-helpers/mcp-harness.js';

const LAW_ID = '363AC0000000108';

const REV1 = {
  law_revision_id: '363AC0000000108_20291001_505AC0000000003',
  amendment_promulgate_date: '2023-03-31',
  amendment_enforcement_date: '2029-10-01',
  amendment_enforcement_comment: null,
  amendment_law_num: '令和五年法律第三号',
  amendment_law_title: '所得税法等の一部を改正する法律',
  amendment_law_id: '505AC0000000003',
  current_revision_status: 'UnEnforced',
};
const REV2 = {
  law_revision_id: '363AC0000000108_20260401_507AC0000000013',
  amendment_promulgate_date: '2025-03-31',
  amendment_enforcement_date: '2026-04-01',
  amendment_enforcement_comment: null,
  amendment_law_num: '令和七年法律第十三号',
  amendment_law_title: '所得税法等の一部を改正する法律',
  amendment_law_id: '507AC0000000013',
  current_revision_status: 'CurrentEnforced',
};
const REV3 = {
  law_revision_id: '363AC0000000108_20250401_506AC0000000008',
  amendment_promulgate_date: '2024-03-30',
  amendment_enforcement_date: '2025-04-01',
  amendment_enforcement_comment: null,
  amendment_law_num: '令和六年法律第八号',
  amendment_law_title: '所得税法等の一部を改正する法律',
  amendment_law_id: '506AC0000000008',
  current_revision_status: 'PreviousEnforced',
};

/** 施行日だけを変えた改正。law_revision_id で見分ける */
function rev(id: string, date: string | null, status = 'PreviousEnforced'): AnyObj {
  return {
    law_revision_id: id,
    amendment_promulgate_date: '2020-01-01',
    amendment_enforcement_date: date,
    amendment_enforcement_comment: null,
    amendment_law_num: '令和二年法律第一号',
    amendment_law_title: '改正法',
    amendment_law_id: '502AC0000000001',
    current_revision_status: status,
  };
}

const KEYS = [
  'amendment_enforcement_comment',
  'amendment_enforcement_date',
  'amendment_law_id',
  'amendment_law_num',
  'amendment_law_title',
  'amendment_promulgate_date',
  'current_revision_status',
  'law_revision_id',
];

describe('get_law_revisions の並びと値の無いキー（20261003-t4-response-shape）', () => {
  let h: Harness;
  let revisions: unknown[];

  beforeEach(async () => {
    revisions = [REV1, REV2, REV3];
    h = await startHarness((url) => {
      if (url.pathname.endsWith('/laws')) return lawsResponse([]);
      if (url.pathname.endsWith(`/law_revisions/${LAW_ID}`)) {
        return json({
          law_info: { law_id: LAW_ID, law_type: 'Act', law_num: '昭和六十三年法律第百八号' },
          revisions,
        });
      }
      return null;
    });
  });
  afterEach(async () => {
    await h.close();
  });

  async function ok(args: Record<string, unknown>): Promise<AnyObj> {
    const r = await h.call('get_law_revisions', { law_name: '消法', ...args });
    if (r.isError) throw new Error(r.text);
    return r.body;
  }
  const ids = (r: AnyObj) => r.revisions.map((x: AnyObj) => x.law_revision_id);

  it('SPEC-EGOV-GET-LAW-REVISIONS-016 e-Gov が施行日の古い順に返しても、施行日の新しい順に並べる（未施行も含める）', async () => {
    revisions = [REV3, REV2, REV1];
    const r = await ok({});
    expect(ids(r)).toEqual([REV1.law_revision_id, REV2.law_revision_id, REV3.law_revision_id]);
    expect(r.revisions[0].current_revision_status).toBe('UnEnforced');
  });

  it('SPEC-EGOV-GET-LAW-REVISIONS-016 施行日が同じ改正は e-Gov が返した順のまま', async () => {
    revisions = [
      rev('B', '2025-04-01'),
      rev('C1', '2026-10-01', 'CurrentEnforced'),
      rev('C2', '2026-10-01'),
      rev('A', '2030-06-19', 'UnEnforced'),
      rev('C3', '2026-10-01'),
    ];
    expect(ids(await ok({}))).toEqual(['A', 'C1', 'C2', 'C3', 'B']);
    revisions = [rev('C3', '2026-10-01'), rev('C2', '2026-10-01'), rev('C1', '2026-10-01')];
    expect(ids(await ok({}))).toEqual(['C3', 'C2', 'C1']);
  });

  it('SPEC-EGOV-GET-LAW-REVISIONS-016 施行日が null の改正は先頭に置き、null どうしは e-Gov が返した順', async () => {
    revisions = [
      rev('D2025', '2025-04-01'),
      rev('N1', null, 'UnEnforced'),
      rev('D2030', '2030-06-19', 'UnEnforced'),
      { ...rev('N2', null, 'UnEnforced'), amendment_enforcement_date: undefined },
    ];
    const r = await ok({});
    expect(ids(r)).toEqual(['N1', 'N2', 'D2030', 'D2025']);
    expect(r.revisions[1].amendment_enforcement_date).toBeNull();
  });

  it('SPEC-EGOV-GET-LAW-REVISIONS-009 latest は施行日の新しい順の先頭から数え、total は絞る前の件数', async () => {
    revisions = [REV3, REV2, REV1];
    const one = await ok({ latest: 1 });
    expect(one.total).toBe(3);
    expect(ids(one)).toEqual(['363AC0000000108_20291001_505AC0000000003']);
    const two = await ok({ latest: 2 });
    expect(ids(two)).toEqual([REV1.law_revision_id, REV2.law_revision_id]);
    const ten = await ok({ latest: 10 });
    expect(ten.total).toBe(3);
    expect(ids(ten)).toEqual([REV1.law_revision_id, REV2.law_revision_id, REV3.law_revision_id]);
  });

  it('SPEC-EGOV-GET-LAW-REVISIONS-002 e-Gov の要素にキーが無くても 8 つのキーを持ち、値は null', async () => {
    const { amendment_enforcement_comment: _c, ...noComment } = REV1;
    revisions = [
      { ...noComment, extra_field: 'x' },
      { law_revision_id: 'ONLY_ID', amendment_enforcement_date: '2020-01-01' },
    ];
    const r = await ok({});
    expect(r.meta.at).toBeNull();
    expect(r.total).toBe(2);
    expect(r.revisions[0]).toEqual(REV1);
    expect(r.revisions[0].amendment_enforcement_comment).toBeNull();
    expect(r.revisions[0]).not.toHaveProperty('extra_field');
    expect(Object.keys(r.revisions[1]).sort()).toEqual(KEYS);
    expect(r.revisions[1]).toEqual({
      law_revision_id: 'ONLY_ID',
      amendment_promulgate_date: null,
      amendment_enforcement_date: '2020-01-01',
      amendment_enforcement_comment: null,
      amendment_law_num: null,
      amendment_law_title: null,
      amendment_law_id: null,
      current_revision_status: null,
    });
  });

  it('SPEC-EGOV-GET-LAW-REVISIONS-017 current_revision_status は e-Gov の値のまま（日本語にしない、知らない値もそのまま）', async () => {
    revisions = [
      rev('U', '2030-06-19', 'UnEnforced'),
      rev('C', '2026-10-01', 'CurrentEnforced'),
      rev('P', '2025-04-01', 'PreviousEnforced'),
      rev('X', '2024-04-01', 'SomethingNew'),
    ];
    const r = await ok({});
    expect(r.revisions.map((x: AnyObj) => x.current_revision_status)).toEqual([
      'UnEnforced',
      'CurrentEnforced',
      'PreviousEnforced',
      'SomethingNew',
    ]);
    for (const x of r.revisions) expect(Object.keys(x).sort()).toEqual(KEYS);
  });
});
