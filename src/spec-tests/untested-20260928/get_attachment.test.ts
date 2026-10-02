/**
 * 差分 20260928-untested-behaviors の get_attachment（SPEC-EGOV-GET-ATTACHMENT-011〜022）の受入テスト。
 *
 * 期待値は specs/changes/20260928-untested-behaviors/specs/get_attachment/spec.md から取る。
 * e-Gov への通信は fetch を差し替えて返す（実際の e-Gov には問い合わせない）。
 * 取り直しの待ち時間（0.5 秒・1 秒・2 秒）は実時間で待つので、取り直すテストは timeout を延ばす。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shuji-bonji/houki-abbreviations', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@shuji-bonji/houki-abbreviations')>();
  return {
    ...mod,
    resolveAbbreviation: (abbr: string) => {
      if (abbr === '所基通') {
        return { formal: '所得税基本通達', source_mcp_hint: 'houki-nta', law_id: null };
      }
      return null;
    },
  };
});

type Node = { tag: string; attr?: Record<string, string>; children?: Array<Node | string> };

const LID1 = 'LID1';
const REV1 = 'REV1';
const REV_AT = 'LID1_20190401_X';
const UPDATED_A = '2024-07-25T00:20:13+09:00';

function fig(src: string): Node {
  return { tag: 'FigStruct', children: [{ tag: 'Fig', attr: { src }, children: [] }] };
}

/** 一覧に 2 件（a.jpg・b.pdf）、本文にだけある図が 1 件（body-only.pdf） */
const TREE: Node = {
  tag: 'Law',
  attr: { Num: '1' },
  children: [
    {
      tag: 'LawBody',
      children: [
        {
          tag: 'MainProvision',
          children: [
            {
              tag: 'Article',
              attr: { Num: '1' },
              children: [
                { tag: 'ArticleTitle', children: ['第一条'] },
                {
                  tag: 'Paragraph',
                  attr: { Num: '1' },
                  children: [fig('./pict/a.jpg'), fig('./pict/b.pdf'), fig('./pict/body-only.pdf')],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const EMPTY_TREE: Node = { tag: 'Law', children: [{ tag: 'LawBody', children: [] }] };

function attachedFor(rev: string) {
  return [
    { law_revision_id: rev, src: './pict/a.jpg', updated: UPDATED_A },
    { law_revision_id: rev, src: './pict/b.pdf', updated: '2024-01-01T00:00:00+09:00' },
  ];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function lawData(asof: string | null): Response {
  const law_info = { law_id: LID1, law_type: 'Act', law_num: '令和六年法律第一号' };
  if (asof === '2018-01-01') {
    return json({
      law_info,
      revision_info: { law_title: 'テスト法', law_revision_id: 'LID1_20180101_EMPTY' },
      law_full_text: EMPTY_TREE,
      attached_files_info: { image_data: '', attached_files: [] },
    });
  }
  const rev = asof === '2019-04-01' ? REV_AT : REV1;
  return json({
    law_info,
    revision_info: { law_title: 'テスト法', law_revision_id: rev },
    law_full_text: TREE,
    attached_files_info: { image_data: '', attached_files: attachedFor(rev) },
  });
}

function binary(body: string, contentType = 'image/jpeg'): Response {
  return new Response(new TextEncoder().encode(body), {
    status: 200,
    headers: { 'content-type': contentType },
  });
}

/** 問い合わせの記録（URL） */
const requests: string[] = [];
/** テストごとに差し替える /attachment の応答。n は /attachment への何回目の問い合わせか */
let attachmentHandler: (url: URL, n: number) => Response | Promise<Response> = (url) =>
  binary(`BYTES:${url.searchParams.get('src') ?? 'zip'}`);

const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  );
  requests.push(url.toString());
  const path = url.pathname;
  if (path === '/api/2/laws') {
    const title = url.searchParams.get('law_title');
    const laws =
      title === 'テスト法'
        ? [
            {
              law_info: { law_id: LID1, law_type: 'Act', law_num: '令和六年法律第一号' },
              revision_info: { law_title: 'テスト法' },
            },
          ]
        : [];
    return json({ total_count: laws.length, count: laws.length, laws });
  }
  if (path === `/api/2/law_data/${LID1}`) return lawData(url.searchParams.get('asof'));
  if (path.startsWith('/api/2/attachment/')) {
    const n = requests.filter((r) => r.includes('/api/2/attachment/')).length;
    return attachmentHandler(url, n);
  }
  return new Response('Not Found', { status: 404 });
});

const { getAttachment } = await import('../../services/law-files.js');
const { _resetCachesForTest } = await import('../../services/law-service.js');

const ENV_KEYS = ['HOUKI_EGOV_FILES_DIR', 'XDG_CACHE_HOME', 'HOME'] as const;
const savedEnv: Record<string, string | undefined> = {};
let workDir: string;
let filesDir: string;

function attachmentRequests(): string[] {
  return requests.filter((r) => r.includes('/api/2/attachment/'));
}

function lawDataRequests(): string[] {
  return requests.filter((r) => r.includes('/api/2/law_data/'));
}

function abortError(): Error {
  const e = new Error('This operation was aborted');
  e.name = 'AbortError';
  return e;
}

beforeAll(() => {
  vi.stubGlobal('fetch', fetchMock);
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  workDir = mkdtempSync(join(tmpdir(), 'houki-egov-ga-'));
});

afterAll(() => {
  vi.unstubAllGlobals();
  rmSync(workDir, { recursive: true, force: true });
});

beforeEach(() => {
  _resetCachesForTest();
  requests.length = 0;
  attachmentHandler = (url) => binary(`BYTES:${url.searchParams.get('src') ?? 'zip'}`);
  filesDir = mkdtempSync(join(workDir, 'files-'));
  process.env.HOUKI_EGOV_FILES_DIR = filesDir;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

const PDF_URL = `https://laws.e-gov.go.jp/api/2/attachment/${REV1}?src=.%2Fpict%2Fb.pdf`;
const A_URL = `https://laws.e-gov.go.jp/api/2/attachment/${REV1}?src=.%2Fpict%2Fa.jpg`;

describe('get_attachment（差分 20260928-untested-behaviors）', () => {
  it('SPEC-EGOV-GET-ATTACHMENT-011 save なしで pdf を指すと next_actions は pdf-reader-mcp:read_url の 1 件だけ', async () => {
    for (const save of [undefined, false]) {
      const res = await getAttachment({ law_name: 'テスト法', src: './pict/b.pdf', save });
      if ('error' in res) throw new Error(res.error);
      expect(res.url).toBe(PDF_URL);
      expect(res.next_actions).toEqual([
        {
          action: 'pdf-reader-mcp:read_url',
          reason: expect.any(String),
          example: { url: PDF_URL },
        },
      ]);
    }
    expect(attachmentRequests()).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-011 本文にだけある pdf でも read_url を案内する', async () => {
    const res = await getAttachment({ law_name: 'テスト法', src: './pict/body-only.pdf' });
    if ('error' in res) throw new Error(res.error);
    const url = `https://laws.e-gov.go.jp/api/2/attachment/${REV1}?src=.%2Fpict%2Fbody-only.pdf`;
    expect(res.next_actions).toEqual([
      { action: 'pdf-reader-mcp:read_url', reason: expect.any(String), example: { url } },
    ]);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-011 jpg と zip では next_actions を付けない', async () => {
    const jpg = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg' });
    if ('error' in jpg) throw new Error(jpg.error);
    expect(jpg.next_actions).toBeUndefined();
    const zip = await getAttachment({ law_name: 'テスト法' });
    if ('error' in zip) throw new Error(zip.error);
    expect(zip.next_actions).toBeUndefined();
  });

  it('SPEC-EGOV-GET-ATTACHMENT-012 save なしの zip の note は件数（一覧と本文の図を合わせ重複を除いた数）で始まる', async () => {
    const res = await getAttachment({ law_name: 'テスト法' });
    if ('error' in res) throw new Error(res.error);
    expect(res.note).toBe(
      '添付ファイル 3 件をまとめた zip の URL です。ファイルをディスクに置くには save: true を付けてください。'
    );
  });

  it('SPEC-EGOV-GET-ATTACHMENT-013 save なしの 1 件の note には保存先のディレクトリを書く', async () => {
    const res = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg' });
    if ('error' in res) throw new Error(res.error);
    expect(res.note).toBe(
      `a.jpg の URL です。認証なしで開けます。ファイルをディスクに置くには save: true を付けてください（${filesDir} 以下に保存します）。`
    );
  });

  it('SPEC-EGOV-GET-ATTACHMENT-014 at を渡すとその時点の履歴 ID を meta・url・saved.path に使い、meta.at を付ける', async () => {
    const res = await getAttachment({
      law_name: 'テスト法',
      src: './pict/a.jpg',
      at: '2019-04-01',
      save: true,
    });
    if ('error' in res) throw new Error(res.error);
    expect(res.meta.law_revision_id).toBe(REV_AT);
    expect(res.meta.at).toBe('2019-04-01');
    expect(res.url).toBe(
      `https://laws.e-gov.go.jp/api/2/attachment/${REV_AT}?src=.%2Fpict%2Fa.jpg`
    );
    expect(res.saved?.path).toBe(join(filesDir, REV_AT, 'a.jpg'));
    expect(lawDataRequests()).toEqual([
      `https://laws.e-gov.go.jp/api/2/law_data/${LID1}?asof=2019-04-01`,
    ]);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-014 at を渡さないと meta.at は null（キーは無くならない）', async () => {
    const res = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg' });
    if ('error' in res) throw new Error(res.error);
    expect(res.meta.law_revision_id).toBe(REV1);
    expect('at' in res.meta).toBe(true);
    expect(res.meta.at).toBeNull();
  });

  it('SPEC-EGOV-GET-ATTACHMENT-015 一覧に無い src のエラーで案内する list_attachments の example に at も入れる', async () => {
    const withAt = await getAttachment({
      law_name: 'テスト法',
      src: './pict/zz.jpg',
      at: '2019-04-01',
    });
    expect('error' in withAt).toBe(true);
    if (!('error' in withAt)) return;
    expect(withAt.code).toBe('ATTACHMENT_NOT_FOUND');
    const la = withAt.next_actions?.find((a) => a.action === 'list_attachments');
    expect(la?.example).toEqual({ law_name: 'テスト法', at: '2019-04-01' });

    const noAt = await getAttachment({ law_name: 'テスト法', src: './pict/zz.jpg' });
    if (!('error' in noAt)) throw new Error('error expected');
    const la2 = noAt.next_actions?.find((a) => a.action === 'list_attachments');
    expect(la2?.example).toEqual({ law_name: 'テスト法' });
  });

  it('SPEC-EGOV-GET-ATTACHMENT-016 管轄外の資料は OUT_OF_SCOPE（delegate_to_mcp、houki-nta）で、e-Gov から本文も添付も取らない', async () => {
    for (const save of [true, false]) {
      const res = await getAttachment({ law_name: '所基通', src: './pict/a.jpg', save });
      expect('error' in res).toBe(true);
      if (!('error' in res)) return;
      expect(res.code).toBe('OUT_OF_SCOPE');
      expect(res.next_actions?.map((a) => a.action)).toEqual(['delegate_to_mcp']);
      expect(res.next_actions?.[0].example).toEqual({ mcp: 'houki-nta' });
    }
    expect(lawDataRequests()).toHaveLength(0);
    expect(attachmentRequests()).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-016 特定できない法令は LAW_NOT_FOUND（resolve_abbreviation と search_law）で、e-Gov から本文も添付も取らない', async () => {
    for (const save of [true, false]) {
      const res = await getAttachment({ law_name: '無い法', save });
      expect('error' in res).toBe(true);
      if (!('error' in res)) return;
      expect(res.code).toBe('LAW_NOT_FOUND');
      expect(res.next_actions?.map((a) => a.action)).toEqual([
        'resolve_abbreviation',
        'search_law',
      ]);
      expect(res.next_actions?.[0].example).toEqual({ abbr: '無い法' });
      expect(res.next_actions?.[1].example).toEqual({ keyword: '無い法' });
    }
    expect(lawDataRequests()).toHaveLength(0);
    expect(attachmentRequests()).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-017 添付が無いときの hint と next_actions（get_law_revisions、at は入れない）', async () => {
    const res = await getAttachment({ law_name: 'テスト法', at: '2018-01-01' });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('ATTACHMENT_NOT_FOUND');
    expect(res.hint).toBe(
      'attached_files_info が空で、本文に Fig 要素もありません。別の時点（at）の履歴には付いていることがあります'
    );
    expect(res.next_actions).toEqual([
      {
        action: 'get_law_revisions',
        reason: expect.any(String),
        example: { law_name: 'テスト法' },
      },
    ]);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-018 400（404003 以外）は SOURCE_API_ERROR で、detail.cause に応答本文', async () => {
    attachmentHandler = () => new Response('{"code":"400039","message":"m"}', { status: 400 });
    const res = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg', save: true });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_API_ERROR');
    expect(res.retryable).toBe(false);
    expect(res.detail).toEqual({
      status: 400,
      url: A_URL,
      cause: '{"code":"400039","message":"m"}',
    });
    expect(attachmentRequests()).toHaveLength(1);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-018 404 で本文が JSON でないときも SOURCE_API_ERROR で detail.cause に本文', async () => {
    attachmentHandler = () => new Response('Not Found', { status: 404 });
    const res = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg', save: true });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_API_ERROR');
    expect(res.retryable).toBe(false);
    expect(res.detail?.status).toBe(404);
    expect(res.detail?.cause).toBe('Not Found');
  });

  it('SPEC-EGOV-GET-ATTACHMENT-018 403 は SOURCE_API_ERROR で detail.cause は付かない', async () => {
    attachmentHandler = () => new Response('Forbidden', { status: 403 });
    const res = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg', save: true });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_API_ERROR');
    expect(res.retryable).toBe(false);
    expect(res.detail?.status).toBe(403);
    expect(res.detail?.url).toBe(A_URL);
    expect(res.detail?.cause).toBeUndefined();
  });

  it('SPEC-EGOV-GET-ATTACHMENT-019 4 回とも 429 → 問い合わせ 4 回で SOURCE_RATE_LIMITED', async () => {
    attachmentHandler = () => new Response('', { status: 429 });
    const res = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg', save: true });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_RATE_LIMITED');
    expect(res.retryable).toBe(true);
    expect(res.detail?.status).toBe(429);
    expect(res.detail?.url).toBe(A_URL);
    expect(attachmentRequests()).toHaveLength(4);
  }, 20000);

  it('SPEC-EGOV-GET-ATTACHMENT-019 5xx が続くと SOURCE_API_ERROR（retryable: true）', async () => {
    attachmentHandler = () => new Response('', { status: 500 });
    const res = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg', save: true });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_API_ERROR');
    expect(res.retryable).toBe(true);
    expect(res.detail?.url).toBe(A_URL);
    expect(attachmentRequests()).toHaveLength(4);
  }, 20000);

  it('SPEC-EGOV-GET-ATTACHMENT-019 時間切れは SOURCE_TIMEOUT（retryable: true）で、取り直さない', async () => {
    attachmentHandler = () => {
      throw abortError();
    };
    const res = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg', save: true });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_TIMEOUT');
    expect(res.retryable).toBe(true);
    expect(res.detail?.url).toBe(A_URL);
    expect(attachmentRequests()).toHaveLength(1);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-019 1 回目が 500、2 回目が 200 → saved 付きの成功応答', async () => {
    attachmentHandler = (_url, n) =>
      n === 1 ? new Response('', { status: 500 }) : binary('OK-BYTES');
    const res = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg', save: true });
    if ('error' in res) throw new Error(res.error);
    expect(res.saved?.bytes).toBe('OK-BYTES'.length);
    expect(attachmentRequests()).toHaveLength(2);
  }, 20000);

  it('SPEC-EGOV-GET-ATTACHMENT-019 応答が来ないネットワークの失敗も取り直し、成功すれば保存する', async () => {
    attachmentHandler = (_url, n) => {
      if (n === 1) throw new TypeError('fetch failed');
      return binary('NET-OK');
    };
    const res = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg', save: true });
    if ('error' in res) throw new Error(res.error);
    expect(res.saved?.bytes).toBe('NET-OK'.length);
    expect(attachmentRequests()).toHaveLength(2);
  }, 20000);

  it('SPEC-EGOV-GET-ATTACHMENT-020 HOUKI_EGOV_FILES_DIR が無いときは XDG_CACHE_HOME/houki-egov-mcp/files に保存する', async () => {
    delete process.env.HOUKI_EGOV_FILES_DIR;
    const xdg = join(workDir, 'xdg');
    process.env.XDG_CACHE_HOME = xdg;
    const res = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg', save: true });
    if ('error' in res) throw new Error(res.error);
    expect(res.saved?.path).toBe(join(xdg, 'houki-egov-mcp', 'files', REV1, 'a.jpg'));
  });

  it('SPEC-EGOV-GET-ATTACHMENT-020 空文字は無いのと同じ。どちらも無ければ <ホーム>/.cache/houki-egov-mcp/files', async () => {
    process.env.HOUKI_EGOV_FILES_DIR = '';
    process.env.XDG_CACHE_HOME = '';
    const home = join(workDir, 'home');
    mkdirSync(home, { recursive: true });
    process.env.HOME = home;
    const res = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg', save: true });
    if ('error' in res) throw new Error(res.error);
    expect(res.saved?.path).toBe(join(home, '.cache', 'houki-egov-mcp', 'files', REV1, 'a.jpg'));
  });

  it('SPEC-EGOV-GET-ATTACHMENT-021 同じ法令履歴の同じファイル名をもう一度保存すると上書きする', async () => {
    attachmentHandler = () => binary('ONE');
    const first = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg', save: true });
    if ('error' in first) throw new Error(first.error);
    expect(first.saved?.bytes).toBe(3);

    attachmentHandler = () => binary('TWO!');
    const second = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg', save: true });
    if ('error' in second) throw new Error(second.error);
    expect(second.saved?.path).toBe(first.saved?.path);
    expect(second.saved?.bytes).toBe(4);
    expect(readFileSync(second.saved?.path as string, 'utf8')).toBe('TWO!');
  });

  it('SPEC-EGOV-GET-ATTACHMENT-022 一覧に updated があるファイルは応答にも updated を付ける（save の有無を問わない）', async () => {
    const noSave = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg' });
    if ('error' in noSave) throw new Error(noSave.error);
    expect(noSave.updated).toBe(UPDATED_A);
    const saved = await getAttachment({ law_name: 'テスト法', src: './pict/a.jpg', save: true });
    if ('error' in saved) throw new Error(saved.error);
    expect(saved.updated).toBe(UPDATED_A);
  });

  it('SPEC-EGOV-GET-ATTACHMENT-022 本文にだけあるファイルと zip には updated を付けない', async () => {
    const bodyOnly = await getAttachment({ law_name: 'テスト法', src: './pict/body-only.pdf' });
    if ('error' in bodyOnly) throw new Error(bodyOnly.error);
    expect(bodyOnly.updated).toBeUndefined();
    const zip = await getAttachment({ law_name: 'テスト法', save: true });
    if ('error' in zip) throw new Error(zip.error);
    expect(zip.updated).toBeUndefined();
  });
});
