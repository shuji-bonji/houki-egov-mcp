/**
 * 受入テスト: explain_law_type（差分 20260928-untested-behaviors の ADDED）
 *
 * 期待値の正本は specs/changes/20260928-untested-behaviors/specs/explain_law_type/spec.md。
 * 同梱の知識だけを引くツールなので、e-Gov への問い合わせは起きない（fetch を差し替えて 0 回を確かめる）。
 * `see_also`（#56）と `通知`（#62）は約束にしていないので確かめない。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toolHandlers } from '../../tools/handlers.js';

interface Source {
  label: string;
  url: string;
}

interface ExplainResult {
  name: string;
  found: boolean;
  hint?: string;
  related_tools?: string[];
  next_actions?: Array<{ action: string; reason: string; example?: { names?: string[] } }>;
  info?: {
    name: string;
    enacting_body?: string;
    binds_citizens?: boolean;
    aliases?: string[];
    law_type_code?: string;
    notes?: string[];
    sources?: Source[];
  };
}

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

describe('explain_law_type — found: true の応答', () => {
  describe('SPEC-EGOV-EXPLAIN-LAW-TYPE-011 found: true の応答は related_tools を決まった順で持つ', () => {
    it.each(['政令', '通達', '法律', '施行令'])(
      'SPEC-EGOV-EXPLAIN-LAW-TYPE-011 %s の応答は related_tools を決まった順で持つ',
      async (name) => {
        const r = await explain(name);
        expect(r.found).toBe(true);
        expect(r.related_tools).toEqual(['search_law', 'get_law', 'get_toc']);
      }
    );
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-012 政令の info は aliases・law_type_code・notes を持つ', async () => {
    const r = await explain('政令');
    expect(r.info?.aliases).toEqual(['施行令', 'CabinetOrder']);
    expect(r.info?.law_type_code).toBe('CabinetOrder');
    expect(Array.isArray(r.info?.notes)).toBe(true);
    expect(r.info?.notes).toHaveLength(1);
    expect(typeof r.info?.notes?.[0]).toBe('string');
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-012 法律の info は law_type_code: Act を持ち aliases・notes を持たない', async () => {
    const r = await explain('法律');
    expect(r.info?.law_type_code).toBe('Act');
    expect(r.info && Object.hasOwn(r.info, 'aliases')).toBe(false);
    expect(r.info && Object.hasOwn(r.info, 'notes')).toBe(false);
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-012 省令の law_type_code は MinisterialOrdinance', async () => {
    const r = await explain('省令');
    expect(r.info?.law_type_code).toBe('MinisterialOrdinance');
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-012 憲法の info は aliases: [日本国憲法] を持ち law_type_code を持たない', async () => {
    const r = await explain('憲法');
    expect(r.info?.aliases).toEqual(['日本国憲法']);
    expect(r.info && Object.hasOwn(r.info, 'law_type_code')).toBe(false);
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-013 憲法の sources は e-Gov の URL を持つ', async () => {
    const r = await explain('憲法');
    expect(r.info?.sources).toEqual([
      { label: 'e-Gov 法令検索', url: 'https://laws.e-gov.go.jp/law/321CONSTITUTION' },
    ]);
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-013 条例の sources は url が空文字', async () => {
    const r = await explain('条例');
    expect(r.info?.sources).toEqual([{ label: '各自治体の例規集（自治体ウェブサイト）', url: '' }]);
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-013 規則の sources の 2 件目は url が空文字', async () => {
    const r = await explain('規則');
    expect(r.info?.sources?.[1]).toEqual({ label: '各自治体例規集', url: '' });
  });

  it.each(['憲法', '法律', '政令', '省令', '規則', '条例', '告示', '訓令', '通達'])(
    'SPEC-EGOV-EXPLAIN-LAW-TYPE-013 %s の sources の各要素は label と url（文字列）を持つ',
    async (name) => {
      const r = await explain(name);
      for (const s of r.info?.sources ?? []) {
        expect(typeof s.label).toBe('string');
        expect(typeof s.url).toBe('string');
      }
    }
  );
});

describe('explain_law_type — found: false の応答', () => {
  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-014 next_actions は 1 件で、example.names は hint の試せる名前と同じ', async () => {
    const r = await explain('架空法令');
    expect(r.found).toBe(false);
    expect(r.next_actions).toHaveLength(1);
    const a = r.next_actions?.[0];
    expect(a?.action).toBe('list_known_law_types');
    expect(a?.reason).toBe('知られている法令種別は次のとおり');
    const names = a?.example?.names ?? [];
    for (const n of ['憲法', '法律', '政令', '省令', '規則', '条例', '告示', '訓令', '通達']) {
      expect(names).toContain(n);
    }
    const marker = '試せる名前: ';
    const hint = r.hint ?? '';
    expect(hint).toContain(marker);
    expect(names.join(', ')).toBe(hint.slice(hint.indexOf(marker) + marker.length));
  });
});

describe('explain_law_type — 応答の name', () => {
  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-015 前後に空白のある name は渡した値のまま、info.name は主名', async () => {
    const r = await explain(' 政令 ');
    expect(r.name).toBe(' 政令 ');
    expect(r.info?.name).toBe('政令');
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-015 別名で引くと name は別名のまま、info.name は主名', async () => {
    const r = await explain('施行令');
    expect(r.name).toBe('施行令');
    expect(r.info?.name).toBe('政令');
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-015 found: false でも name は渡した値のまま', async () => {
    const r = await explain('架空法令');
    expect(r.found).toBe(false);
    expect(r.name).toBe('架空法令');
  });
});

describe('explain_law_type — 照合の区別', () => {
  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-016 Act は法律に一致する', async () => {
    const r = await explain('Act');
    expect(r.found).toBe(true);
    expect(r.info?.name).toBe('法律');
  });

  it.each(['act', 'ACT', 'ＡＣＴ'])(
    'SPEC-EGOV-EXPLAIN-LAW-TYPE-016 大文字小文字・全角半角の違う %s は found: false',
    async (name) => {
      const r = await explain(name);
      expect(r.found).toBe(false);
    }
  );
});

describe('explain_law_type — 府令・通達の別名', () => {
  it.each([
    ['府令', '省令'],
    ['内閣府令', '省令'],
    ['基本通達', '通達'],
    ['取扱通達', '通達'],
  ])('SPEC-EGOV-EXPLAIN-LAW-TYPE-017 %s は %s の解説を返す', async (name, main) => {
    const r = await explain(name);
    expect(r.found).toBe(true);
    expect(r.info?.name).toBe(main);
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-017 府令の enacting_body', async () => {
    const r = await explain('府令');
    expect(r.info?.enacting_body).toBe('各省大臣／内閣府の主任の大臣');
  });

  it('SPEC-EGOV-EXPLAIN-LAW-TYPE-017 取扱通達は binds_citizens: false', async () => {
    const r = await explain('取扱通達');
    expect(r.info?.binds_citizens).toBe(false);
  });
});
