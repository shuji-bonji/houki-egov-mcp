/**
 * 差分 20260928-untested-behaviors の list_attachments（SPEC-EGOV-LIST-ATTACHMENTS-010〜019）の受入テスト。
 *
 * 期待値は specs/changes/20260928-untested-behaviors/specs/list_attachments/spec.md から取る。
 * e-Gov への通信は fetch を差し替えて返す（実際の e-Gov には問い合わせない）。
 * 取り直しの待ち時間（0.5 秒・1 秒・2 秒）は実時間で待つので、取り直すテストは timeout を延ばす。
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shuji-bonji/houki-abbreviations', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@shuji-bonji/houki-abbreviations')>();
  return {
    ...mod,
    resolveAbbreviation: (abbr: string) => {
      if (abbr === '所基通') {
        return { formal: '所得税基本通達', source_mcp_hint: 'houki-nta', law_id: null };
      }
      if (abbr === '辞書略称') {
        return {
          formal: '辞書にある正式名の法律',
          source_mcp_hint: 'houki-egov',
          law_id: 'LIDDICT',
          law_num: '令和元年法律第九号',
        };
      }
      return null;
    },
  };
});

type Node = { tag: string; attr?: Record<string, string>; children?: Array<Node | string> };

const LID1 = 'LID1';
const REV1 = 'LID1_20240101_000000000000000';
const KOKKI_ID = '411AC0000000127';
const KOKKI_REV = '411AC0000000127_19990813_000000000000000';

function fig(src: string): Node {
  return { tag: 'FigStruct', children: [{ tag: 'Fig', attr: { src }, children: [] }] };
}

/** 並び・重複・置き場所を確かめる法令の本文 */
const TEST_TREE: Node = {
  tag: 'Law',
  attr: { Num: '1' },
  children: [
    {
      tag: 'LawBody',
      children: [
        // LawBody の直下（どこにも入らない図）
        fig('./pict/top.jpg'),
        {
          tag: 'MainProvision',
          children: [
            {
              tag: 'Article',
              attr: { Num: '30_2' },
              children: [
                { tag: 'ArticleTitle', children: ['第三十条の二'] },
                {
                  tag: 'Paragraph',
                  attr: { Num: '1' },
                  children: [fig('./pict/b.jpg'), fig('./pict/a.jpg')],
                },
              ],
            },
          ],
        },
        {
          tag: 'SupplProvision',
          attr: { AmendLawNum: '令和二年法律第一号' },
          children: [
            {
              tag: 'Article',
              attr: { Num: '2' },
              children: [
                { tag: 'ArticleTitle', children: ['第二条'] },
                { tag: 'Paragraph', attr: { Num: '1' }, children: [fig('./pict/sup.jpg')] },
              ],
            },
          ],
        },
        {
          tag: 'AppdxTable',
          children: [
            { tag: 'AppdxTableTitle', children: ['　別表第一'] },
            { tag: 'RelatedArticleNum', children: ['（第三条関係）'] },
            { tag: 'TableStruct', children: [fig('./pict/tbl.jpg')] },
          ],
        },
        {
          tag: 'AppdxFormat',
          children: [
            { tag: 'AppdxFormatTitle', children: ['別記様式第一'] },
            { tag: 'FormatStruct', children: [fig('./pict/fmt.pdf')] },
          ],
        },
        {
          tag: 'AppdxFig',
          children: [{ tag: 'AppdxFigTitle', children: ['別図第一'] }, fig('./pict/afig.jpg')],
        },
        {
          tag: 'Appdx',
          children: [
            { tag: 'ArithFormulaNum', children: ['付録第一'] },
            { tag: 'ArithFormula', children: [fig('./pict/apx.jpg')] },
          ],
        },
        // 本文の末尾（どこにも入らない場所）にもう一度 a.jpg
        fig('./pict/a.jpg'),
      ],
    },
  ],
};

const TEST_ATTACHED = [
  { law_revision_id: REV1, src: './pict/z.jpg', updated: 'U1' },
  { law_revision_id: REV1, src: './pict/fmt.pdf', updated: 'U2' },
  { law_revision_id: REV1, src: './pict/other.pdf', updated: 'U2' },
  { law_revision_id: REV1, src: './pict/z.jpg', updated: 'U3' },
];

const KOKKI_TREE: Node = {
  tag: 'Law',
  attr: { Num: '127' },
  children: [{ tag: 'LawBody', children: [fig('./pict/H11HO127-001.jpg')] }],
};

/** 法令検索（/laws の law_title）で当たる法令 */
const SEARCH_TABLE: Record<string, { law_id: string; law_num: string; title: string }> = {
  テスト法: { law_id: LID1, law_num: '令和六年法律第一号', title: 'テスト法' },
  国旗及び国歌に関する法律: {
    law_id: KOKKI_ID,
    law_num: '平成十一年法律第百二十七号',
    title: '国旗及び国歌に関する法律',
  },
  履歴ID無し法: { law_id: 'LIDNOREV', law_num: '令和六年法律第二号', title: '履歴ID無し法' },
  失敗する法: { law_id: 'LIDFAIL', law_num: '令和六年法律第三号', title: '失敗する法' },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function lawDataBody(
  lawId: string,
  lawNum: string,
  title: string,
  revisionId: string | undefined,
  tree: Node,
  attached: unknown[]
) {
  const revision_info: Record<string, string> = { law_title: title };
  if (revisionId) revision_info.law_revision_id = revisionId;
  return {
    law_info: { law_id: lawId, law_type: 'Act', law_num: lawNum },
    revision_info,
    law_full_text: tree,
    attached_files_info: { image_data: '', attached_files: attached },
  };
}

function defaultLawData(lawId: string): Response {
  if (lawId === LID1) {
    return json(
      lawDataBody(LID1, '令和六年法律第一号', 'テスト法', REV1, TEST_TREE, TEST_ATTACHED)
    );
  }
  if (lawId === KOKKI_ID) {
    return json(
      lawDataBody(
        KOKKI_ID,
        '平成十一年法律第百二十七号',
        '国旗及び国歌に関する法律',
        KOKKI_REV,
        KOKKI_TREE,
        [{ law_revision_id: KOKKI_REV, src: './pict/H11HO127-001.jpg' }]
      )
    );
  }
  if (lawId === 'LIDDICT') {
    return json(
      lawDataBody(
        'LIDDICT',
        '令和元年法律第九号',
        'e-Gov 側の題名',
        'LIDDICT_20190101_000000000000000',
        KOKKI_TREE,
        []
      )
    );
  }
  if (lawId === 'LIDNOREV') {
    return json(
      lawDataBody('LIDNOREV', '令和六年法律第二号', '履歴ID無し法', undefined, KOKKI_TREE, [])
    );
  }
  if (lawId === 'LIDFAIL') {
    return json(
      lawDataBody('LIDFAIL', '令和六年法律第三号', '失敗する法', 'LIDFAIL_REV', KOKKI_TREE, [])
    );
  }
  return new Response('Not Found', { status: 404 });
}

/** 問い合わせの記録（URL） */
const requests: string[] = [];
/** テストごとに差し替える /law_data の応答。null なら defaultLawData */
let lawDataHandler: ((lawId: string, n: number) => Response | Promise<Response>) | null = null;

const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  );
  requests.push(url.toString());
  const path = url.pathname;
  if (path === '/api/2/laws') {
    const title = url.searchParams.get('law_title') ?? '';
    const hit = SEARCH_TABLE[title];
    const laws = hit
      ? [
          {
            law_info: { law_id: hit.law_id, law_type: 'Act', law_num: hit.law_num },
            revision_info: { law_title: hit.title },
          },
        ]
      : [];
    return json({ total_count: laws.length, count: laws.length, laws });
  }
  const m = /^\/api\/2\/law_data\/([^/]+)$/.exec(path);
  if (m) {
    const n = requests.filter((r) => r.includes(`/law_data/${m[1]}`)).length;
    return lawDataHandler ? lawDataHandler(m[1], n) : defaultLawData(m[1]);
  }
  return new Response('Not Found', { status: 404 });
});

const { listAttachments } = await import('../../services/law-files.js');
const { _resetCachesForTest } = await import('../../services/law-service.js');

function lawDataRequests(lawId: string): string[] {
  return requests.filter((r) => r.includes(`/api/2/law_data/${lawId}`));
}

function abortError(): Error {
  const e = new Error('This operation was aborted');
  e.name = 'AbortError';
  return e;
}

beforeAll(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  _resetCachesForTest();
  requests.length = 0;
  lawDataHandler = null;
});

afterEach(() => {
  vi.useRealTimers();
});

async function listTest() {
  const res = await listAttachments({ law_name: 'テスト法' });
  if ('error' in res) throw new Error(`${res.code}: ${res.error}`);
  return res;
}

describe('list_attachments（差分 20260928-untested-behaviors）', () => {
  it('SPEC-EGOV-LIST-ATTACHMENTS-010 attached_files_info の順、その後ろに本文にだけある図を本文の出現順に並べる', async () => {
    const res = await listTest();
    expect(res.attachments.map((a) => a.src)).toEqual([
      './pict/z.jpg',
      './pict/fmt.pdf',
      './pict/other.pdf',
      './pict/top.jpg',
      './pict/b.jpg',
      './pict/a.jpg',
      './pict/sup.jpg',
      './pict/tbl.jpg',
      './pict/afig.jpg',
      './pict/apx.jpg',
    ]);
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-011 同じ src は 1 件にし、最初に出てきたものの updated と location を使う', async () => {
    const res = await listTest();
    const z = res.attachments.filter((a) => a.src === './pict/z.jpg');
    expect(z).toHaveLength(1);
    expect(z[0].updated).toBe('U1');
    const a = res.attachments.filter((x) => x.src === './pict/a.jpg');
    expect(a).toHaveLength(1);
    expect(a[0].location).toEqual({ tag: 'Article', article: '30_2', title: '第三十条の二' });
    expect(res.count).toBe(10);
    expect(res.count).toBe(res.attachments.length);
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-012 別表・書式・別図・付録の中の図の置き場所', async () => {
    const res = await listTest();
    const loc = (src: string) => res.attachments.find((a) => a.src === src)?.location;
    expect(loc('./pict/tbl.jpg')).toEqual({
      tag: 'AppdxTable',
      title: '別表第一',
      related_article: '（第三条関係）',
    });
    expect(loc('./pict/fmt.pdf')).toEqual({ tag: 'AppdxFormat', title: '別記様式第一' });
    expect(loc('./pict/afig.jpg')).toEqual({ tag: 'AppdxFig', title: '別図第一' });
    expect(loc('./pict/apx.jpg')).toEqual({ tag: 'Appdx', title: '付録第一' });
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-013 どこにも入らない図は location が { tag: "Law" } だけ', async () => {
    const res = await listTest();
    const top = res.attachments.find((a) => a.src === './pict/top.jpg');
    expect(top?.location).toEqual({ tag: 'Law' });
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-014 附則の中の条にある図には amend_law_num も付き、本則の条には付かない', async () => {
    const res = await listTest();
    const sup = res.attachments.find((a) => a.src === './pict/sup.jpg');
    expect(sup?.location).toEqual({
      tag: 'Article',
      article: '2',
      title: '第二条',
      amend_law_num: '令和二年法律第一号',
    });
    const b = res.attachments.find((a) => a.src === './pict/b.jpg');
    expect(b?.location).toEqual({ tag: 'Article', article: '30_2', title: '第三十条の二' });
    expect(b?.location && 'amend_law_num' in b.location).toBe(false);
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-015 meta の法令 ID・題名・法令番号・取得日時・URL（at なしでは meta.at は null）', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-27T20:32:08.782Z'));
    const res = await listAttachments({ law_name: '国旗及び国歌に関する法律' });
    if ('error' in res) throw new Error(res.error);
    expect(res.meta.law_id).toBe('411AC0000000127');
    expect(res.meta.title).toBe('国旗及び国歌に関する法律');
    expect(res.meta.law_num).toBe('平成十一年法律第百二十七号');
    expect(res.meta.retrieved_at).toBe('2026-09-27T20:32:08.782Z');
    expect(res.meta.url).toBe('https://laws.e-gov.go.jp/law/411AC0000000127');
    expect('at' in res.meta).toBe(true);
    expect(res.meta.at).toBeNull();
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-015 at を渡すと meta.at は渡した値', async () => {
    const res = await listAttachments({ law_name: '国旗及び国歌に関する法律', at: '2001-02-03' });
    if ('error' in res) throw new Error(res.error);
    expect(res.meta.at).toBe('2001-02-03');
    expect(res.meta.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-015 略称辞書に法令 ID があるときは meta.title が辞書の正式名', async () => {
    const res = await listAttachments({ law_name: '辞書略称' });
    if ('error' in res) throw new Error(res.error);
    expect(res.meta.law_id).toBe('LIDDICT');
    expect(res.meta.title).toBe('辞書にある正式名の法律');
    expect(res.meta.law_num).toBe('令和元年法律第九号');
    expect(res.meta.url).toBe('https://laws.e-gov.go.jp/law/LIDDICT');
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-016 next_actions の example（get_attachment は先頭の src、read_url は最初の pdf の url）', async () => {
    const res = await listTest();
    const ga = res.next_actions?.find((a) => a.action === 'get_attachment');
    expect(ga?.example).toEqual({ law_name: 'テスト法', src: './pict/z.jpg', save: true });
    const ru = res.next_actions?.find((a) => a.action === 'pdf-reader-mcp:read_url');
    expect(ru?.example).toEqual({
      url: `https://laws.e-gov.go.jp/api/2/attachment/${REV1}?src=.%2Fpict%2Ffmt.pdf`,
    });
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-017 法令本文の応答に law_revision_id が無いと SOURCE_API_ERROR（detail.url に asof は付かない）', async () => {
    const res = await listAttachments({ law_name: '履歴ID無し法', at: '2020-01-01' });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_API_ERROR');
    expect(res.retryable).toBe(false);
    expect(res.detail?.url).toBe('https://laws.e-gov.go.jp/api/2/law_data/LIDNOREV');
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-018 404 は SOURCE_API_ERROR（retryable: false、detail.status と detail.url）', async () => {
    lawDataHandler = () => new Response('Not Found', { status: 404 });
    const res = await listAttachments({ law_name: '失敗する法' });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_API_ERROR');
    expect(res.retryable).toBe(false);
    expect(res.detail?.status).toBe(404);
    expect(res.detail?.url).toBe('https://laws.e-gov.go.jp/api/2/law_data/LIDFAIL');
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-018 400・403 は SOURCE_API_ERROR（retryable: false）、at があれば detail.url に ?asof=', async () => {
    for (const status of [400, 403]) {
      _resetCachesForTest();
      lawDataHandler = () => new Response('{"code":"x"}', { status });
      const res = await listAttachments({ law_name: '失敗する法', at: '2020-04-01' });
      expect('error' in res).toBe(true);
      if (!('error' in res)) return;
      expect(res.code).toBe('SOURCE_API_ERROR');
      expect(res.retryable).toBe(false);
      expect(res.detail?.status).toBe(status);
      expect(res.detail?.url).toBe(
        'https://laws.e-gov.go.jp/api/2/law_data/LIDFAIL?asof=2020-04-01'
      );
    }
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-018 時間切れは SOURCE_TIMEOUT（retryable: true、detail.status は付かない）', async () => {
    lawDataHandler = () => {
      throw abortError();
    };
    const res = await listAttachments({ law_name: '失敗する法' });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_TIMEOUT');
    expect(res.retryable).toBe(true);
    expect(res.detail?.status).toBeUndefined();
    expect(res.detail?.url).toBe('https://laws.e-gov.go.jp/api/2/law_data/LIDFAIL');
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-018 SPEC-EGOV-LIST-ATTACHMENTS-019 429 が続くと 4 回問い合わせて SOURCE_RATE_LIMITED', async () => {
    lawDataHandler = () => new Response('', { status: 429 });
    const res = await listAttachments({ law_name: '失敗する法', at: '2020-04-01' });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_RATE_LIMITED');
    expect(res.retryable).toBe(true);
    expect(res.detail?.status).toBe(429);
    expect(res.detail?.url).toBe('https://laws.e-gov.go.jp/api/2/law_data/LIDFAIL?asof=2020-04-01');
    expect(lawDataRequests('LIDFAIL')).toHaveLength(4);
  }, 20000);

  it('SPEC-EGOV-LIST-ATTACHMENTS-018 5xx（503）は SOURCE_API_ERROR（retryable: true、detail.status）', async () => {
    lawDataHandler = () => new Response('', { status: 503 });
    const res = await listAttachments({ law_name: '失敗する法' });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_API_ERROR');
    expect(res.retryable).toBe(true);
    expect(res.detail?.status).toBe(503);
    expect(res.detail?.url).toBe('https://laws.e-gov.go.jp/api/2/law_data/LIDFAIL');
  }, 20000);

  it('SPEC-EGOV-LIST-ATTACHMENTS-019 4 回とも 500 → 問い合わせ 4 回で SOURCE_API_ERROR（retryable: true、status 500）', async () => {
    lawDataHandler = () => new Response('', { status: 500 });
    const res = await listAttachments({ law_name: '失敗する法' });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_API_ERROR');
    expect(res.retryable).toBe(true);
    expect(res.detail?.status).toBe(500);
    expect(lawDataRequests('LIDFAIL')).toHaveLength(4);
  }, 20000);

  it('SPEC-EGOV-LIST-ATTACHMENTS-019 1 回目が 429、2 回目が 200 → 成功応答', async () => {
    lawDataHandler = (lawId, n) =>
      n === 1 ? new Response('', { status: 429 }) : defaultLawData(lawId);
    const res = await listAttachments({ law_name: '失敗する法' });
    expect('error' in res).toBe(false);
    expect(lawDataRequests('LIDFAIL')).toHaveLength(2);
  }, 20000);

  it('SPEC-EGOV-LIST-ATTACHMENTS-019 応答が来ないネットワークの失敗も取り直し、成功すれば成功応答', async () => {
    lawDataHandler = (lawId, n) => {
      if (n === 1) throw new TypeError('fetch failed');
      return defaultLawData(lawId);
    };
    const res = await listAttachments({ law_name: '失敗する法' });
    expect('error' in res).toBe(false);
    expect(lawDataRequests('LIDFAIL')).toHaveLength(2);
  }, 20000);

  it('SPEC-EGOV-LIST-ATTACHMENTS-019 404 と時間切れは取り直さない（問い合わせ 1 回）', async () => {
    lawDataHandler = () => new Response('Not Found', { status: 404 });
    const r404 = await listAttachments({ law_name: '失敗する法' });
    expect('error' in r404 && r404.retryable).toBe(false);
    expect(lawDataRequests('LIDFAIL')).toHaveLength(1);

    _resetCachesForTest();
    requests.length = 0;
    lawDataHandler = () => {
      throw abortError();
    };
    const rTimeout = await listAttachments({ law_name: '失敗する法' });
    expect('error' in rTimeout && rTimeout.code).toBe('SOURCE_TIMEOUT');
    expect(lawDataRequests('LIDFAIL')).toHaveLength(1);
  });
});
