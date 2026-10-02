/**
 * 差分 20260928-untested-behaviors の get_related_laws の受入テスト。
 * 期待値は specs/changes/20260928-untested-behaviors/specs/get_related_laws/spec.md から取る。
 * e-Gov クライアント（searchLaws / getLawData）を差し替え、実際の e-Gov には問い合わせない。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LawListItem } from '../../services/egov-client.js';

const LAWS: Record<string, { law_id: string; law_type: string; law_num: string }> = {
  所得税法: { law_id: '340AC0000000033', law_type: 'Act', law_num: '昭和四十年法律第三十三号' },
  所得税法施行令: {
    law_id: '340CO0000000096',
    law_type: 'CabinetOrder',
    law_num: '昭和四十年政令第九十六号',
  },
  所得税法施行規則: {
    law_id: '340M50000040011',
    law_type: 'MinisterialOrdinance',
    law_num: '昭和四十年大蔵省令第十一号',
  },
  民法: { law_id: '129AC0000000089', law_type: 'Act', law_num: '明治二十九年法律第八十九号' },
  // 法令番号が空の文字列で返る法令（SPEC-EGOV-GET-RELATED-LAWS-011）
  番号無し法: { law_id: '999AC0000000001', law_type: 'Act', law_num: '' },
};

function item(title: string): LawListItem {
  const l = LAWS[title];
  return {
    law_info: { law_id: l.law_id, law_type: l.law_type, law_num: l.law_num },
    revision_info: { law_title: title },
  };
}

/** e-Gov への問い合わせの記録 */
const calls: Array<Record<string, unknown>> = [];
/** 指定した法令名の問い合わせで投げる例外（SPEC-EGOV-GET-RELATED-LAWS-014） */
let failOnTitle: { title: string; err: Error } | null = null;

vi.mock('../../services/egov-client.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../services/egov-client.js')>();
  return {
    ...mod,
    searchLaws: async (params: { law_title?: string; law_num?: string }) => {
      calls.push({ ...params });
      if (failOnTitle && params.law_title === failOnTitle.title) throw failOnTitle.err;
      let laws: LawListItem[] = [];
      if (params.law_num) {
        const t = Object.keys(LAWS).find((k) => LAWS[k].law_num === params.law_num);
        laws = t ? [item(t)] : [];
      } else if (params.law_title) {
        // e-Gov の /laws は部分一致
        laws = Object.keys(LAWS)
          .filter((k) => k.includes(params.law_title as string))
          .map(item);
      }
      return { total_count: laws.length, count: laws.length, laws };
    },
    getLawData: async (lawId: string) => {
      calls.push({ law_data: lawId });
      throw new Error(`getLawData は呼ばれない想定: ${lawId}`);
    },
  };
});

const { EgovHttpError } = await import('../../services/egov-client.js');
const { _resetCachesForTest } = await import('../../services/law-service.js');
const { toolHandlers } = await import('../../tools/handlers.js');

type Obj = Record<string, unknown>;
type Related = Obj & { relation: string; law_id: string; title: string };
type RelatedResponse = Obj & {
  law: Obj;
  related: Related[];
  not_found: Obj[];
  meta: Obj;
  next_actions: Obj[];
};

/** server.ts は応答を JSON.stringify して返すので、クライアントに届く形（JSON を通した形）で確かめる */
async function call(args: Obj): Promise<Obj> {
  const raw = await toolHandlers.get_related_laws(args);
  return JSON.parse(JSON.stringify(raw)) as Obj;
}

async function ok(args: Obj): Promise<RelatedResponse> {
  const r = await call(args);
  if ('error' in r) throw new Error(`エラー応答: ${JSON.stringify(r)}`);
  return r as RelatedResponse;
}

beforeEach(() => {
  _resetCachesForTest();
  calls.length = 0;
  failOnTitle = null;
});

describe('get_related_laws（差分 20260928-untested-behaviors）', () => {
  it('SPEC-EGOV-GET-RELATED-LAWS-009 related の要素に law_num・law_type・url を付ける', async () => {
    const r = await ok({ law_name: '所得税法' });
    expect(r.related[0]).toEqual({
      relation: 'enforcement_order',
      law_id: '340CO0000000096',
      title: '所得税法施行令',
      law_num: '昭和四十年政令第九十六号',
      law_type: 'CabinetOrder',
      abbr: '所令',
      url: 'https://laws.e-gov.go.jp/law/340CO0000000096',
    });
    expect(r.related[1].law_type).toBe('MinisterialOrdinance');
    expect(r.related[1].url).toBe('https://laws.e-gov.go.jp/law/340M50000040011');
  });

  it('SPEC-EGOV-GET-RELATED-LAWS-010 成功の応答の meta は retrieved_at（ISO 8601（UTC）の文字列）と at: null', async () => {
    const before = Date.now();
    const r = await ok({ law_name: '所得税法' });
    const after = Date.now();
    expect(Object.keys(r.meta)).toEqual(['retrieved_at', 'at']);
    expect(r.meta.at).toBeNull();
    const at = r.meta.retrieved_at as string;
    expect(typeof at).toBe('string');
    expect(new Date(at).toISOString()).toBe(at);
    expect(new Date(at).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(at).getTime()).toBeLessThanOrEqual(after + 1000);
  });

  it('SPEC-EGOV-GET-RELATED-LAWS-010 related が空の応答（民法）にも同じ形の meta（retrieved_at と at: null）が付く', async () => {
    const r = await ok({ law_name: '民法' });
    expect(r.related).toEqual([]);
    expect(Object.keys(r.meta)).toEqual(['retrieved_at', 'at']);
    expect(r.meta.at).toBeNull();
    const at = r.meta.retrieved_at as string;
    expect(new Date(at).toISOString()).toBe(at);
  });

  it('SPEC-EGOV-GET-RELATED-LAWS-011 法令番号が空の文字列の法令は、law に law_num のキーを付けない', async () => {
    const r = await ok({ law_name: '番号無し法' });
    expect(r.law).toEqual({ law_id: '999AC0000000001', title: '番号無し法' });
    expect(Object.hasOwn(r.law, 'law_num')).toBe(false);
  });

  it('SPEC-EGOV-GET-RELATED-LAWS-012 法律からの get_toc は施行令・施行規則の reason と related の title を持つ', async () => {
    const r = await ok({ law_name: '所得税法' });
    expect(r.next_actions).toEqual([
      {
        action: 'get_toc',
        reason: '施行令の目次を見て、委任先の条を探せます',
        example: { law_name: '所得税法施行令' },
      },
      {
        action: 'get_toc',
        reason: '施行規則の目次を見て、委任先の条を探せます',
        example: { law_name: '所得税法施行規則' },
      },
    ]);
  });

  it('SPEC-EGOV-GET-RELATED-LAWS-012 施行令（所令）からの get_toc の 1 件めは親の法律の reason', async () => {
    const r = await ok({ law_name: '所令' });
    expect(r.next_actions[0]).toEqual({
      action: 'get_toc',
      reason: '親の法律の目次を見て、委任している条を探せます',
      example: { law_name: '所得税法' },
    });
  });

  it('SPEC-EGOV-GET-RELATED-LAWS-013 管轄外の略称（消基通）は OUT_OF_SCOPE で、e-Gov に問い合わせない', async () => {
    const r = await call({ law_name: '消基通' });
    expect(r).toMatchObject({
      code: 'OUT_OF_SCOPE',
      error:
        '「消費税法基本通達」は houki-nta の管轄です（houki-egov-mcp は法律・政令・省令の本文のみを扱います）',
      hint: 'houki-nta-mcp の対応 tool に切り替えてください',
    });
    const next = r.next_actions as Obj[];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      action: 'delegate_to_mcp',
      example: { mcp: 'houki-nta' },
    });
    expect(calls).toEqual([]);
  });

  describe('SPEC-EGOV-GET-RELATED-LAWS-014 候補の問い合わせの失敗', () => {
    const url = 'https://laws.e-gov.go.jp/api/2/laws?law_title=test';
    const cases: Array<[string, () => Error, string, boolean]> = [
      [
        'タイムアウト',
        () => new EgovHttpError(0, url, `e-Gov API request timeout: ${url}`),
        'SOURCE_TIMEOUT',
        true,
      ],
      [
        'HTTP 429',
        () => new EgovHttpError(429, url, 'e-Gov API returned 429'),
        'SOURCE_RATE_LIMITED',
        true,
      ],
      [
        'HTTP 503',
        () => new EgovHttpError(503, url, 'e-Gov API returned 503'),
        'SOURCE_API_ERROR',
        true,
      ],
      [
        'HTTP 400',
        () =>
          new EgovHttpError(
            400,
            url,
            'e-Gov API returned 400',
            '{"code":"400001","message":"bad request"}'
          ),
        'SOURCE_API_ERROR',
        false,
      ],
    ];
    for (const [label, makeErr, code, retryable] of cases) {
      it(`SPEC-EGOV-GET-RELATED-LAWS-014 ${label} は ${code}（retryable: ${retryable}）で、related・not_found・law を返さない`, async () => {
        failOnTitle = { title: '所得税法施行令', err: makeErr() };
        const r = await call({ law_name: '所得税法' });
        expect(r.code).toBe(code);
        expect(r.retryable).toBe(retryable);
        expect(r).not.toHaveProperty('related');
        expect(r).not.toHaveProperty('not_found');
        expect(r).not.toHaveProperty('law');
      });
    }
  });

  it('SPEC-EGOV-GET-RELATED-LAWS-015 LAW_NOT_FOUND に hint と resolve_abbreviation・search_law の next_actions を付ける', async () => {
    const r = await call({ law_name: '存在しない法' });
    expect(r).toMatchObject({
      code: 'LAW_NOT_FOUND',
      error: '法令が見つかりません: 存在しない法',
      hint: '略称辞書 / e-Gov 法令検索で該当なし。表記を確認してください',
    });
    const next = r.next_actions as Obj[];
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({
      action: 'resolve_abbreviation',
      example: { abbr: '存在しない法' },
    });
    expect(next[1]).toMatchObject({ action: 'search_law', example: { keyword: '存在しない法' } });
  });
});
