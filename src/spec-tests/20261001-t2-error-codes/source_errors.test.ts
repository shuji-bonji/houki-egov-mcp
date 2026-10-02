/**
 * 差分 20261001-t2-error-codes の受入テスト — 「見つからない」と「取得元の失敗」の code
 *
 * 期待値の正本: specs/changes/20261001-t2-error-codes/specs/<dir>/spec.md
 * MCP クライアントから tools/call を呼ぶ。e-Gov への通信は fetch を差し替え、
 * 取り直しの待ちは fastRetry で 0 にする。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  abortError,
  connectError,
  type Harness,
  json,
  lawDataResponse,
  lawsResponse,
  MINPO,
  startHarness,
} from '../../test-helpers/mcp-harness.js';

/** 法令名の検索（/laws）の失敗の仕方と、返るはずの code */
interface Failure {
  label: string;
  fail: () => Response;
  code: string;
  retryable: boolean;
  detail: Record<string, unknown>;
}

const FAILURES: Failure[] = [
  {
    label: '503',
    fail: () => new Response('', { status: 503 }),
    code: 'SOURCE_API_ERROR',
    retryable: true,
    detail: { status: 503 },
  },
  {
    label: '429',
    fail: () => new Response('', { status: 429 }),
    code: 'SOURCE_RATE_LIMITED',
    retryable: true,
    detail: { status: 429 },
  },
  {
    label: '400',
    fail: () => json({ code: '400001', message: 'bad request' }, 400),
    code: 'SOURCE_API_ERROR',
    retryable: false,
    detail: { status: 400 },
  },
  {
    label: '時間切れ',
    fail: () => {
      throw abortError();
    },
    code: 'SOURCE_TIMEOUT',
    retryable: true,
    detail: {},
  },
  {
    label: '接続できない（ENOTFOUND）',
    fail: () => {
      throw connectError('ENOTFOUND');
    },
    code: 'SOURCE_UNAVAILABLE',
    retryable: true,
    detail: { cause: 'ENOTFOUND' },
  },
];

const UNKNOWN = '架空の法律';

/** 法令名の検索が fail で終わるときの応答を、10 ツールの引数で確かめる */
async function expectSearchFailure(
  h: Harness,
  tool: string,
  args: Record<string, unknown>
): Promise<void> {
  for (const f of FAILURES) {
    h.setRoute((url) => (url.pathname.endsWith('/laws') ? f.fail() : null));
    const r = await h.call(tool, args);
    expect(r.isError, `${tool} ${f.label}`).toBe(true);
    expect(r.body.code, `${tool} ${f.label}`).toBe(f.code);
    expect(r.body.retryable, `${tool} ${f.label}`).toBe(f.retryable);
    for (const [k, v] of Object.entries(f.detail)) {
      expect(r.body.detail?.[k], `${tool} ${f.label} detail.${k}`).toBe(v);
    }
    const actions = (r.body.next_actions ?? []).map((a: { action: string }) => a.action);
    expect(actions, `${tool} ${f.label}`).not.toContain('resolve_abbreviation');
    expect(actions, `${tool} ${f.label}`).not.toContain('search_law');
  }
  // 検索が成功して 0 件なら今までどおり LAW_NOT_FOUND
  h.setRoute((url) => (url.pathname.endsWith('/laws') ? lawsResponse([]) : null));
  const r = await h.call(tool, args);
  if (tool === 'verify_citations') {
    expect(r.body.results[0].code).toBe('LAW_NOT_FOUND');
  } else {
    expect(r.body.code, `${tool} 0 件`).toBe('LAW_NOT_FOUND');
  }
}

describe('取得元の失敗の code (20261001-t2-error-codes)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness(undefined, { fastRetry: true });
  });
  afterEach(async () => {
    await h.close();
  });

  it('SPEC-EGOV-COMMON-ERRORS-027 SOURCE_* は通信の失敗だけ。法令名の検索が 0 件で成功したら LAW_NOT_FOUND、503 なら SOURCE_API_ERROR', async () => {
    h.setRoute((url) => (url.pathname.endsWith('/laws') ? lawsResponse([]) : null));
    const a = await h.call('get_law', { law_name: 'ほげほげ法', article: '1' });
    expect(a.body.code).toBe('LAW_NOT_FOUND');
    h.setRoute((url) =>
      url.pathname.endsWith('/laws') ? new Response('', { status: 503 }) : null
    );
    const b = await h.call('get_law', { law_name: 'ほげほげ法', article: '1' });
    expect(b.body.code).toBe('SOURCE_API_ERROR');
    expect(b.body.retryable).toBe(true);
    expect(b.body.code).not.toBe('LAW_NOT_FOUND');
  });

  it('SPEC-EGOV-COMMON-ERRORS-027 法令本文の取得の終わり方ごとの code・retryable・detail の表', async () => {
    const rows: Array<[() => Response, string, boolean, Record<string, unknown>]> = [
      [() => new Response('', { status: 429 }), 'SOURCE_RATE_LIMITED', true, { status: 429 }],
      [
        () => {
          throw abortError();
        },
        'SOURCE_TIMEOUT',
        true,
        {},
      ],
      [() => new Response('', { status: 500 }), 'SOURCE_API_ERROR', true, { status: 500 }],
      [() => json({ code: '400', message: 'x' }, 400), 'SOURCE_API_ERROR', false, { status: 400 }],
      [
        () => {
          throw connectError('ECONNREFUSED');
        },
        'SOURCE_UNAVAILABLE',
        true,
        { cause: 'ECONNREFUSED' },
      ],
      [
        () => {
          throw connectError('EPROTO');
        },
        'SOURCE_API_ERROR',
        true,
        { cause: 'fetch failed' },
      ],
    ];
    for (const [fail, code, retryable, detail] of rows) {
      h.setRoute((url) => (url.pathname.includes('/law_data/') ? fail() : null));
      const r = await h.call('get_law', { law_name: '民法', article: '1' });
      expect(r.body.code).toBe(code);
      expect(r.body.retryable).toBe(retryable);
      for (const [k, v] of Object.entries(detail)) expect(r.body.detail?.[k]).toBe(v);
    }
  });

  it('SPEC-EGOV-COMMON-ERRORS-028 接続できないときは cause.code を見て SOURCE_UNAVAILABLE（3 回取り直した後）', async () => {
    for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT']) {
      const before = h.urls().length;
      h.setRoute(() => {
        throw connectError(code);
      });
      const r = await h.call('search_law', { keyword: `消費税${code}` });
      expect(r.body.code, code).toBe('SOURCE_UNAVAILABLE');
      expect(r.body.retryable, code).toBe(true);
      expect(r.body.detail.cause, code).toBe(code);
      expect(typeof r.body.hint, code).toBe('string');
      expect(r.body.next_actions.map((a: { action: string }) => a.action)).toEqual([
        'retry_later',
        'visit_egov_site',
      ]);
      expect(h.urls().length - before, code).toBe(4);
    }
    // 表に無い cause.code は SOURCE_API_ERROR（retryable: true）のまま
    h.setRoute(() => {
      throw connectError('EPIPE');
    });
    const r = await h.call('search_law', { keyword: '消費税EPIPE' });
    expect(r.body.code).toBe('SOURCE_API_ERROR');
    expect(r.body.retryable).toBe(true);
  });

  it('SPEC-EGOV-COMMON-ERRORS-028 e-Gov を呼ぶ 11 ツールで接続できないときは SOURCE_UNAVAILABLE', async () => {
    h.setRoute(() => {
      throw connectError('ENOTFOUND');
    });
    const calls: Array<[string, Record<string, unknown>]> = [
      ['search_law', { keyword: '消費税' }],
      ['get_law', { law_name: '民法', article: '1' }],
      ['get_toc', { law_name: '民法' }],
      ['get_law_range', { law_name: '民法', chapter: '1' }],
      ['get_law_revisions', { law_name: '民法' }],
      ['get_related_laws', { law_name: '民法' }],
      ['get_article_references', { law_name: '民法', article: '1' }],
      ['verify_citations', { citations: [{ law_name: '民法', article: '1' }] }],
      ['list_attachments', { law_name: '民法' }],
      ['get_attachment', { law_name: '民法' }],
      ['get_law_file', { law_name: '民法', file_type: 'xml', save: true }],
    ];
    for (const [tool, args] of calls) {
      const r = await h.call(tool, args);
      expect(r.body.code, tool).toBe('SOURCE_UNAVAILABLE');
      expect(r.body.detail?.cause, tool).toBe('ENOTFOUND');
    }
  });

  it('SPEC-EGOV-COMMON-ERRORS-029 法令名の検索が通信の失敗で終わったら LAW_NOT_FOUND ではなく SOURCE_*（get_toc の例）', async () => {
    h.setRoute((url) =>
      url.pathname.endsWith('/laws') ? new Response('', { status: 503 }) : null
    );
    const r = await h.call('get_toc', { law_name: UNKNOWN });
    expect(r.body.code).toBe('SOURCE_API_ERROR');
    expect(r.body.retryable).toBe(true);
    expect(r.body.detail.status).toBe(503);
  });

  it('SPEC-EGOV-COMMON-ERRORS-029 略称辞書に law_id がある名前では法令名の検索を引かない', async () => {
    h.setRoute((url) => (url.pathname.includes('/law_data/') ? lawDataResponse(MINPO) : null));
    const r = await h.call('get_law', { law_name: '民法', article: '1' });
    expect(r.isError).toBe(false);
    expect(h.urls().some((u) => u.pathname.endsWith('/laws'))).toBe(false);
  });

  it('SPEC-EGOV-GET-LAW-038 法令名の検索が通信の失敗で終わったら SOURCE_*', async () => {
    await expectSearchFailure(h, 'get_law', { law_name: UNKNOWN, article: '1' });
  });

  it('SPEC-EGOV-GET-TOC-026 法令名の検索が通信の失敗で終わったら SOURCE_*', async () => {
    await expectSearchFailure(h, 'get_toc', { law_name: UNKNOWN });
  });

  it('SPEC-EGOV-GET-LAW-RANGE-032 法令名の検索が通信の失敗で終わったら SOURCE_*', async () => {
    await expectSearchFailure(h, 'get_law_range', { law_name: UNKNOWN, chapter: '1' });
  });

  it('SPEC-EGOV-GET-LAW-REVISIONS-014 法令名の検索が通信の失敗で終わったら SOURCE_*', async () => {
    await expectSearchFailure(h, 'get_law_revisions', { law_name: UNKNOWN });
  });

  it('SPEC-EGOV-GET-RELATED-LAWS-017 法令名の検索が通信の失敗で終わったら SOURCE_*', async () => {
    await expectSearchFailure(h, 'get_related_laws', { law_name: UNKNOWN });
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-042 法令名の検索が通信の失敗で終わったら SOURCE_*', async () => {
    await expectSearchFailure(h, 'get_article_references', { law_name: UNKNOWN, article: '1' });
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-022 法令名の検索が通信の失敗で終わったら SOURCE_*', async () => {
    await expectSearchFailure(h, 'list_attachments', { law_name: UNKNOWN });
  });

  it('SPEC-EGOV-GET-ATTACHMENT-026 法令名の検索が通信の失敗で終わったら SOURCE_*', async () => {
    await expectSearchFailure(h, 'get_attachment', { law_name: UNKNOWN, src: './pict/a.jpg' });
  });

  it('SPEC-EGOV-GET-LAW-FILE-020 法令名の検索が通信の失敗で終わったら SOURCE_*', async () => {
    await expectSearchFailure(h, 'get_law_file', {
      law_name: UNKNOWN,
      file_type: 'xml',
      save: true,
    });
  });

  it('SPEC-EGOV-COMMON-ERRORS-029 verify_citations は v0.15.4 の時点で既に同じ規則（ツール全体を SOURCE_*）', async () => {
    await expectSearchFailure(h, 'verify_citations', {
      citations: [{ law_name: UNKNOWN, article: '1' }],
    });
  });
});
