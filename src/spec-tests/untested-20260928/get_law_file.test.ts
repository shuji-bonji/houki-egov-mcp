/**
 * 差分 20260928-untested-behaviors の get_law_file（SPEC-EGOV-GET-LAW-FILE-008〜017）の受入テスト。
 *
 * 期待値は specs/changes/20260928-untested-behaviors/specs/get_law_file/spec.md から取る。
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

const MINPO_ID = '129AC0000000089';
const FILE_REV = '129AC0000000089_20260624_508AC0000000045';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** /law_file の成功応答。Content-Disposition に "<law_revision_id>.<file_type>" のファイル名を付ける */
function lawFileOk(fileType: string, body: string | Uint8Array): Response {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${FILE_REV}.${fileType}"`,
    },
  });
}

/** 問い合わせの記録（URL） */
const requests: string[] = [];
/** テストごとに差し替える /law_file の応答。n は /law_file への何回目の問い合わせか */
let lawFileHandler: (fileType: string, n: number) => Response | Promise<Response> = (t) =>
  lawFileOk(t, '<Law/>');

const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  );
  requests.push(url.toString());
  const path = url.pathname;
  if (path === '/api/2/laws') {
    const title = url.searchParams.get('law_title');
    const laws =
      title === '民法'
        ? [
            {
              law_info: {
                law_id: MINPO_ID,
                law_type: 'Act',
                law_num: '明治二十九年法律第八十九号',
              },
              revision_info: { law_title: '民法' },
            },
          ]
        : [];
    return json({ total_count: laws.length, count: laws.length, laws });
  }
  const m = /^\/api\/2\/law_file\/([^/]+)\/([^/]+)$/.exec(path);
  if (m) {
    const n = requests.filter((r) => r.includes('/api/2/law_file/')).length;
    return lawFileHandler(m[1], n);
  }
  // /law_data・/law_revisions は save なしでは呼ばれないはず。呼ばれたら記録に残る
  return new Response('Not Found', { status: 404 });
});

const { getLawFile } = await import('../../services/law-files.js');
const { _resetCachesForTest } = await import('../../services/law-service.js');

const ENV_KEYS = ['HOUKI_EGOV_FILES_DIR', 'XDG_CACHE_HOME', 'HOME'] as const;
const savedEnv: Record<string, string | undefined> = {};
let workDir: string;
let filesDir: string;

function lawFileRequests(): string[] {
  return requests.filter((r) => r.includes('/api/2/law_file/'));
}

function abortError(): Error {
  const e = new Error('This operation was aborted');
  e.name = 'AbortError';
  return e;
}

beforeAll(() => {
  vi.stubGlobal('fetch', fetchMock);
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  workDir = mkdtempSync(join(tmpdir(), 'houki-egov-glf-'));
});

afterAll(() => {
  vi.unstubAllGlobals();
  rmSync(workDir, { recursive: true, force: true });
});

beforeEach(() => {
  _resetCachesForTest();
  requests.length = 0;
  lawFileHandler = (t) => lawFileOk(t, '<Law/>');
  filesDir = mkdtempSync(join(workDir, 'files-'));
  process.env.HOUKI_EGOV_FILES_DIR = filesDir;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

const XML_AT_URL = `https://laws.e-gov.go.jp/api/2/law_file/xml/${MINPO_ID}?asof=2020-04-01`;

describe('get_law_file（差分 20260928-untested-behaviors）', () => {
  it('SPEC-EGOV-GET-LAW-FILE-008 save なしでは e-Gov への問い合わせは法令検索の 1 回だけ（at ありでも）', async () => {
    for (const save of [undefined, false]) {
      requests.length = 0;
      _resetCachesForTest();
      const res = await getLawFile({ law_name: '民法', file_type: 'xml', at: '2020-04-01', save });
      if ('error' in res) throw new Error(res.error);
      expect(res.url).toBe(XML_AT_URL);
      expect(requests).toHaveLength(1);
      const only = new URL(requests[0]);
      expect(only.pathname).toBe('/api/2/laws');
      expect(only.searchParams.get('law_title')).toBe('民法');
    }
  });

  it('SPEC-EGOV-GET-LAW-FILE-009 json でも get_law を案内する（content_type は application/json）', async () => {
    for (const save of [undefined, true]) {
      const res = await getLawFile({ law_name: '民法', file_type: 'json', save });
      if ('error' in res) throw new Error(res.error);
      expect(res.content_type).toBe('application/json');
      expect(res.next_actions).toEqual([
        {
          action: 'get_law',
          reason: expect.any(String),
          example: { law_name: '民法', article: '1' },
        },
      ]);
    }
  });

  it('SPEC-EGOV-GET-LAW-FILE-009 xml でも get_law の 1 件（save なし）', async () => {
    const res = await getLawFile({ law_name: '民法', file_type: 'xml' });
    if ('error' in res) throw new Error(res.error);
    expect(res.next_actions).toEqual([
      {
        action: 'get_law',
        reason: expect.any(String),
        example: { law_name: '民法', article: '1' },
      },
    ]);
  });

  it('SPEC-EGOV-GET-LAW-FILE-009 html・rtf・docx では next_actions を付けない', async () => {
    const html = await getLawFile({ law_name: '民法', file_type: 'html' });
    if ('error' in html) throw new Error(html.error);
    expect(html.content_type).toBe('text/html');
    expect(html.next_actions).toBeUndefined();

    const rtf = await getLawFile({ law_name: '民法', file_type: 'rtf', save: true });
    if ('error' in rtf) throw new Error(rtf.error);
    expect(rtf.content_type).toBe('application/rtf');
    expect(rtf.next_actions).toBeUndefined();

    const docx = await getLawFile({ law_name: '民法', file_type: 'docx', save: true });
    if ('error' in docx) throw new Error(docx.error);
    expect(docx.next_actions).toBeUndefined();
  });

  it('SPEC-EGOV-GET-LAW-FILE-010 save なしの note（at ありは「時点 <at> 以前で最新の履歴」、保存先のディレクトリ）', async () => {
    const res = await getLawFile({ law_name: '民法', file_type: 'xml', at: '2020-04-01' });
    if ('error' in res) throw new Error(res.error);
    expect(res.note).toBe(
      `民法 の本文を xml で取る URL です。認証なしで開けます（時点 2020-04-01 以前で最新の履歴）。ファイルをディスクに置くには save: true を付けてください（${filesDir} 以下に保存します）。`
    );
  });

  it('SPEC-EGOV-GET-LAW-FILE-010 at なしの note は「現時点で最新の履歴」', async () => {
    const res = await getLawFile({ law_name: '民法', file_type: 'html' });
    if ('error' in res) throw new Error(res.error);
    expect(res.note).toBe(
      `民法 の本文を html で取る URL です。認証なしで開けます（現時点で最新の履歴）。ファイルをディスクに置くには save: true を付けてください（${filesDir} 以下に保存します）。`
    );
  });

  it('SPEC-EGOV-GET-LAW-FILE-011 保存したときの note（3 バイト → 3 B）', async () => {
    lawFileHandler = (t) => lawFileOk(t, 'abc');
    const res = await getLawFile({ law_name: '民法', file_type: 'docx', save: true });
    if ('error' in res) throw new Error(res.error);
    const name = `${FILE_REV}.docx`;
    expect(res.note).toBe(`${name}（3 B）を ${join(filesDir, FILE_REV, name)} に保存しました。`);
  });

  it('SPEC-EGOV-GET-LAW-FILE-011 サイズの書き方（1023 B・1.0 KB・1.5 KB・1.0 MB）', async () => {
    const cases: Array<[number, string]> = [
      [1023, '1023 B'],
      [1024, '1.0 KB'],
      [1536, '1.5 KB'],
      [1024 * 1024, '1.0 MB'],
    ];
    const name = `${FILE_REV}.xml`;
    for (const [size, label] of cases) {
      lawFileHandler = (t) => lawFileOk(t, new Uint8Array(size));
      const res = await getLawFile({ law_name: '民法', file_type: 'xml', save: true });
      if ('error' in res) throw new Error(res.error);
      expect(res.saved?.bytes).toBe(size);
      expect(res.note).toBe(
        `${name}（${label}）を ${join(filesDir, FILE_REV, name)} に保存しました。`
      );
    }
  });

  it('SPEC-EGOV-GET-LAW-FILE-012 管轄外の資料は OUT_OF_SCOPE（delegate_to_mcp、houki-nta）で、ファイルを取らない', async () => {
    for (const save of [undefined, true]) {
      const res = await getLawFile({ law_name: '所基通', file_type: 'xml', save });
      expect('error' in res).toBe(true);
      if (!('error' in res)) return;
      expect(res.code).toBe('OUT_OF_SCOPE');
      expect(res.next_actions?.map((a) => a.action)).toEqual(['delegate_to_mcp']);
      expect(res.next_actions?.[0].example).toEqual({ mcp: 'houki-nta' });
    }
    expect(lawFileRequests()).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-LAW-FILE-012 特定できない法令は LAW_NOT_FOUND（resolve_abbreviation と search_law）で、save: true でもファイルを取らない', async () => {
    const res = await getLawFile({ law_name: '無い法', file_type: 'xml', save: true });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('LAW_NOT_FOUND');
    expect(res.next_actions?.map((a) => a.action)).toEqual(['resolve_abbreviation', 'search_law']);
    expect(res.next_actions?.[0].example).toEqual({ abbr: '無い法' });
    expect(res.next_actions?.[1].example).toEqual({ keyword: '無い法' });
    expect(lawFileRequests()).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-LAW-FILE-013 file_type の検査は法令の特定より先（管轄外・特定できない法令でも INVALID_ARGUMENT、問い合わせ 0 回）', async () => {
    const oos = await getLawFile({ law_name: '所基通', file_type: 'txt' });
    expect('error' in oos && oos.code).toBe('INVALID_ARGUMENT');
    const nf = await getLawFile({ law_name: '無い法', file_type: 'txt' });
    expect('error' in nf && nf.code).toBe('INVALID_ARGUMENT');
    expect(requests).toHaveLength(0);
  });

  it('SPEC-EGOV-GET-LAW-FILE-014 404 は SOURCE_API_ERROR（retryable: false、detail.status と ?asof= 付きの detail.url）', async () => {
    lawFileHandler = () => new Response('{"code":"404001","message":"m"}', { status: 404 });
    const res = await getLawFile({
      law_name: '民法',
      file_type: 'xml',
      at: '2020-04-01',
      save: true,
    });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_API_ERROR');
    expect(res.retryable).toBe(false);
    expect(res.detail?.status).toBe(404);
    expect(res.detail?.url).toBe(XML_AT_URL);
  });

  it('SPEC-EGOV-GET-LAW-FILE-014 時間切れは SOURCE_TIMEOUT（retryable: true、detail.status は付かない）', async () => {
    lawFileHandler = () => {
      throw abortError();
    };
    const res = await getLawFile({ law_name: '民法', file_type: 'xml', save: true });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_TIMEOUT');
    expect(res.retryable).toBe(true);
    expect(res.detail?.status).toBeUndefined();
    expect(res.detail?.url).toBe(`https://laws.e-gov.go.jp/api/2/law_file/xml/${MINPO_ID}`);
  });

  it('SPEC-EGOV-GET-LAW-FILE-014 SPEC-EGOV-GET-LAW-FILE-015 429 が続くと 4 回問い合わせて SOURCE_RATE_LIMITED', async () => {
    lawFileHandler = () => new Response('', { status: 429 });
    const res = await getLawFile({
      law_name: '民法',
      file_type: 'xml',
      at: '2020-04-01',
      save: true,
    });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_RATE_LIMITED');
    expect(res.retryable).toBe(true);
    expect(res.detail?.status).toBe(429);
    expect(res.detail?.url).toBe(XML_AT_URL);
    expect(lawFileRequests()).toHaveLength(4);
  }, 20000);

  it('SPEC-EGOV-GET-LAW-FILE-014 SPEC-EGOV-GET-LAW-FILE-015 4 回とも 502 → 問い合わせ 4 回で SOURCE_API_ERROR（retryable: true、status 502）', async () => {
    lawFileHandler = () => new Response('', { status: 502 });
    const res = await getLawFile({ law_name: '民法', file_type: 'xml', save: true });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_API_ERROR');
    expect(res.retryable).toBe(true);
    expect(res.detail?.status).toBe(502);
    expect(res.detail?.url).toBe(`https://laws.e-gov.go.jp/api/2/law_file/xml/${MINPO_ID}`);
    expect(lawFileRequests()).toHaveLength(4);
  }, 20000);

  it('SPEC-EGOV-GET-LAW-FILE-014 SPEC-EGOV-GET-LAW-FILE-015 400 は SOURCE_API_ERROR（retryable: false）で、問い合わせは 1 回', async () => {
    lawFileHandler = () => new Response('{"code":"400001","message":"m"}', { status: 400 });
    const res = await getLawFile({ law_name: '民法', file_type: 'xml', save: true });
    expect('error' in res).toBe(true);
    if (!('error' in res)) return;
    expect(res.code).toBe('SOURCE_API_ERROR');
    expect(res.retryable).toBe(false);
    expect(res.detail?.status).toBe(400);
    expect(lawFileRequests()).toHaveLength(1);
  });

  it('SPEC-EGOV-GET-LAW-FILE-015 時間切れは取り直さない（問い合わせ 1 回）', async () => {
    lawFileHandler = () => {
      throw abortError();
    };
    await getLawFile({ law_name: '民法', file_type: 'xml', save: true });
    expect(lawFileRequests()).toHaveLength(1);
  });

  it('SPEC-EGOV-GET-LAW-FILE-015 1 回目が 502 で 2 回目が成功なら保存して成功応答', async () => {
    lawFileHandler = (t, n) => (n === 1 ? new Response('', { status: 502 }) : lawFileOk(t, 'OK'));
    const res = await getLawFile({ law_name: '民法', file_type: 'xml', save: true });
    if ('error' in res) throw new Error(res.error);
    expect(res.saved?.bytes).toBe(2);
    expect(lawFileRequests()).toHaveLength(2);
  }, 20000);

  it('SPEC-EGOV-GET-LAW-FILE-015 応答が来ないネットワークの失敗も取り直し、成功すれば保存する', async () => {
    lawFileHandler = (t, n) => {
      if (n === 1) throw new TypeError('fetch failed');
      return lawFileOk(t, 'NET');
    };
    const res = await getLawFile({ law_name: '民法', file_type: 'xml', save: true });
    if ('error' in res) throw new Error(res.error);
    expect(res.saved?.bytes).toBe(3);
    expect(lawFileRequests()).toHaveLength(2);
  }, 20000);

  it('SPEC-EGOV-GET-LAW-FILE-016 HOUKI_EGOV_FILES_DIR が無いときは XDG_CACHE_HOME/houki-egov-mcp/files に保存する', async () => {
    delete process.env.HOUKI_EGOV_FILES_DIR;
    const xdg = join(workDir, 'xdg');
    process.env.XDG_CACHE_HOME = xdg;
    const res = await getLawFile({ law_name: '民法', file_type: 'docx', save: true });
    if ('error' in res) throw new Error(res.error);
    expect(res.saved?.path).toBe(
      join(xdg, 'houki-egov-mcp', 'files', FILE_REV, `${FILE_REV}.docx`)
    );
  });

  it('SPEC-EGOV-GET-LAW-FILE-016 空文字は無いのと同じ。どちらも無ければ <ホーム>/.cache/houki-egov-mcp/files（note も同じ）', async () => {
    process.env.HOUKI_EGOV_FILES_DIR = '';
    process.env.XDG_CACHE_HOME = '';
    const home = join(workDir, 'home');
    mkdirSync(home, { recursive: true });
    process.env.HOME = home;
    const root = join(home, '.cache', 'houki-egov-mcp', 'files');

    const saved = await getLawFile({ law_name: '民法', file_type: 'docx', save: true });
    if ('error' in saved) throw new Error(saved.error);
    expect(saved.saved?.path).toBe(join(root, FILE_REV, `${FILE_REV}.docx`));

    delete process.env.HOUKI_EGOV_FILES_DIR;
    delete process.env.XDG_CACHE_HOME;
    const noSave = await getLawFile({ law_name: '民法', file_type: 'docx' });
    if ('error' in noSave) throw new Error(noSave.error);
    expect(noSave.note).toContain(`（${root} 以下に保存します）`);
  });

  it('SPEC-EGOV-GET-LAW-FILE-017 同じファイルをもう一度保存すると上書きする', async () => {
    lawFileHandler = (t) => lawFileOk(t, 'ONE');
    const first = await getLawFile({ law_name: '民法', file_type: 'docx', save: true });
    if ('error' in first) throw new Error(first.error);
    expect(first.saved?.bytes).toBe(3);

    lawFileHandler = (t) => lawFileOk(t, 'TWO!');
    const second = await getLawFile({ law_name: '民法', file_type: 'docx', save: true });
    if ('error' in second) throw new Error(second.error);
    expect(second.saved?.path).toBe(first.saved?.path);
    expect(second.saved?.law_revision_id).toBe(first.saved?.law_revision_id);
    expect(second.saved?.file_name).toBe(first.saved?.file_name);
    expect(second.saved?.bytes).toBe(4);
    expect(readFileSync(second.saved?.path as string, 'utf8')).toBe('TWO!');
  });
});
