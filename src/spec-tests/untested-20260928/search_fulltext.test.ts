/**
 * 差分 20260928-untested-behaviors の受入テスト — search_fulltext
 *
 * 期待値の正本: specs/changes/20260928-untested-behaviors/specs/search_fulltext/spec.md
 * e-Gov への通信は vi.stubGlobal('fetch', …) で差し替える。
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb } from '../../db/index.js';
import { initSchema } from '../../db/schema.js';
import { ingestZip } from '../../services/bulk/ingester.js';
import { createMemoryZip } from '../../services/bulk/zip-reader.js';
import { _resetCachesForTest } from '../../services/law-service.js';
import { seedTestDb } from '../../test-helpers/law-db-fixture.js';
import { handleSearchFulltext } from '../../tools/handlers.js';

// biome-ignore lint/suspicious/noExplicitAny: 応答の形をテストで自由に辿るため
type AnyObj = Record<string, any>;

const TMP = join(tmpdir(), `houki-egov-spec-sf-${process.pid}`);
const DB_STD = join(TMP, 'std.db');
const DB_200 = join(TMP, 'many200.db');
const DB_149 = join(TMP, 'many149.db');
const DB_EMPTY = join(TMP, 'empty.db');

const BOM = '﻿';
const CRLF = '\r\n';
const HEADER =
  '法令種別,法令番号,法令名,法令名読み,旧法令名,公布日,改正法令名,改正法令番号,改正法令公布日,施行日,施行日備考,法令ID,本文URL,未施行';
const BIG_LAW_ID = '508AC0000000999';
const BIG_CSV = `法律,令和八年法律第九百九十九号,大量条文試験法,たいりょうじょうぶんしけんほう,,令和八年三月三十一日,,,,令和八年四月一日,,${BIG_LAW_ID},https://laws.e-gov.go.jp/law/${BIG_LAW_ID}/20260401_000000000000000,`;

/** 本文に「試験用条文」と「保存」を含む条を n 件持つ法令「大量条文試験法」の XML */
function bigLawXml(n: number): string {
  const articles = Array.from(
    { length: n },
    (_, i) => `      <Article Num="${i + 1}">
        <ArticleTitle>第${i + 1}条</ArticleTitle>
        <Paragraph Num="1"><ParagraphSentence><Sentence>この条は試験用条文であり、帳簿の保存について定める。</Sentence></ParagraphSentence></Paragraph>
      </Article>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Law Era="Reiwa" Year="08" Num="999" LawType="Act" Lang="ja" PromulgateMonth="03" PromulgateDay="31">
  <LawNum>令和八年法律第九百九十九号</LawNum>
  <LawBody>
    <LawTitle Kana="たいりょうじょうぶんしけんほう">大量条文試験法</LawTitle>
    <MainProvision>
${articles}
    </MainProvision>
  </LawBody>
</Law>`;
}

async function seedBigDb(path: string, n: number): Promise<void> {
  const db = new Database(path);
  initSchema(db);
  const zip = createMemoryZip([
    { path: 'all_law_list.csv', content: `${BOM}${HEADER}${CRLF}${BIG_CSV}${CRLF}` },
    { path: `${BIG_LAW_ID}_20260401_000000000000000.xml`, content: bigLawXml(n) },
  ]);
  await ingestZip({ db, zip, nowIso: '2026-09-01T00:00:00+09:00' });
  closeDb(db);
}

const SHOHI_LAW = {
  law_info: {
    law_id: '363AC0000000108',
    law_type: 'Act',
    law_num: '昭和六十三年法律第百八号',
    promulgation_date: '1988-12-30',
  },
  revision_info: { law_title: '消費税法' },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** /laws を差し替える。keyword が消費税法のときだけ 1 件、それ以外は 0 件 */
function stubLawsFetch() {
  const fn = vi.fn(async (input: unknown) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/laws')) {
      const laws = url.searchParams.get('law_title') === '消費税法' ? [SHOHI_LAW] : [];
      return jsonResponse({ total_count: laws.length, count: laws.length, laws });
    }
    return jsonResponse({ message: 'not stubbed' }, 404);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const TRUNC_NOTE = '走査は 150 件で打ち切っており、該当する条をすべて数えたものではありません。';

beforeAll(async () => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  const std = new Database(DB_STD);
  initSchema(std);
  await seedTestDb(std);
  closeDb(std);
  await seedBigDb(DB_200, 200);
  await seedBigDb(DB_149, 149);
}, 60_000);

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

beforeEach(() => {
  _resetCachesForTest();
  rmSync(DB_EMPTY, { force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('search_fulltext — limit の既定と丸め', () => {
  it('SPEC-EGOV-SEARCH-FULLTEXT-024 limit を省くと 10 件で打ち切る', async () => {
    const r = (await handleSearchFulltext({ keyword: '試験用条文' }, { dbPath: DB_200 })) as AnyObj;
    expect(r.source).toBe('bulk');
    expect(r.count).toBe(10);
    expect(r.hits).toHaveLength(10);
  });

  // 差分 20261001-t1-argument-guards で REMOVED。テストは specs/current に取り込むコミットで外す
  it.skip('SPEC-EGOV-SEARCH-FULLTEXT-025 limit が 0 や負の数なら 1 件にし、filters に limit は入らない', async () => {
    for (const limit of [0, -5]) {
      const r = (await handleSearchFulltext(
        { keyword: '試験用条文', limit },
        { dbPath: DB_200 }
      )) as AnyObj;
      expect(r.source).toBe('bulk');
      expect(r.count).toBe(1);
      expect(r.filters).not.toHaveProperty('limit');
      expect(r).not.toHaveProperty('code');
    }
  });

  // 差分 20261001-t1-argument-guards で REMOVED。テストは specs/current に取り込むコミットで外す
  it.skip('SPEC-EGOV-SEARCH-FULLTEXT-025 tools/call から limit: 0 を渡しても source: bulk、count: 1', async () => {
    const prev = process.env.HOUKI_EGOV_DB_PATH;
    process.env.HOUKI_EGOV_DB_PATH = DB_STD;
    vi.resetModules();
    try {
      const { createServer } = await import('../../server.js');
      const { Client, InMemoryTransport } = await import('@modelcontextprotocol/client');
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const server = createServer();
      const client = new Client({ name: 'spec-test', version: '0.0.0' });
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      try {
        const res = await client.callTool({
          name: 'search_fulltext',
          arguments: { keyword: '適格請求書', limit: 0 },
        });
        const content = res.content as Array<{ type: string; text: string }>;
        const body = JSON.parse(content[0].text) as AnyObj;
        expect(res.isError).toBeFalsy();
        expect(body.source).toBe('bulk');
        expect(body.count).toBe(1);
      } finally {
        await client.close();
      }
    } finally {
      if (prev === undefined) delete process.env.HOUKI_EGOV_DB_PATH;
      else process.env.HOUKI_EGOV_DB_PATH = prev;
      vi.resetModules();
    }
  });

  // 差分 20261001-t1-argument-guards で REMOVED。テストは specs/current に取り込むコミットで外す
  it.skip('SPEC-EGOV-SEARCH-FULLTEXT-026 limit が 30 を超えると 30 件にする', async () => {
    for (const limit of [31, 100]) {
      const r = (await handleSearchFulltext(
        { keyword: '試験用条文', limit },
        { dbPath: DB_200 }
      )) as AnyObj;
      expect(r.source).toBe('bulk');
      expect(r.count).toBe(30);
      expect(r.filters).not.toHaveProperty('limit');
    }
    const r30 = (await handleSearchFulltext(
      { keyword: '試験用条文', limit: 30 },
      { dbPath: DB_200 }
    )) as AnyObj;
    expect(r30.count).toBe(30);
  });
});

describe('search_fulltext — search_law への切り替え', () => {
  it('SPEC-EGOV-SEARCH-FULLTEXT-027 DB のパスの途中が普通のファイルなら search_law に切り替える', async () => {
    const afile = join(TMP, 'afile');
    writeFileSync(afile, 'not a directory');
    const r = (await handleSearchFulltext(
      { keyword: '' },
      { dbPath: join(afile, 'x.db') }
    )) as AnyObj;
    expect(r.source).toBe('api-fallback');
    expect(
      r.note.startsWith(
        'bulk DB を開けなかったため、search_law (法令名のタイトル一致) にフォールバックしています。'
      )
    ).toBe(true);
    expect(r.note).not.toContain('bulk DL 未実行のため');
    expect(r.note).toContain('--bulk-download-everything');
    expect(r.next_actions[0].action).toBe('bulk_download_everything');
    expect(r.fallback.code).toBe('INVALID_ARGUMENT');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-027 DB のパスが既存のディレクトリでも同じ形で切り替える', async () => {
    const dir = join(TMP, 'adir');
    mkdirSync(dir, { recursive: true });
    const r = (await handleSearchFulltext({ keyword: '' }, { dbPath: dir })) as AnyObj;
    expect(r.source).toBe('api-fallback');
    expect(r.note.startsWith('bulk DB を開けなかったため')).toBe(true);
    expect(r.note).toContain('--bulk-download-everything');
    expect(r.next_actions[0].action).toBe('bulk_download_everything');
    expect(r.fallback.code).toBe('INVALID_ARGUMENT');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-028 SPEC-EGOV-SEARCH-FULLTEXT-032 略称の keyword は正式名称で e-Gov を引き、結果を fallback に入れる', async () => {
    stubLawsFetch();
    const r = (await handleSearchFulltext(
      { keyword: ' 消法 ', law_type: 'Act', limit: 3 },
      { dbPath: DB_EMPTY }
    )) as AnyObj;
    expect(r.keyword).toBe('消法');
    expect(r.source).toBe('api-fallback');
    expect(r.fallback.query).toEqual({ keyword: '消法', law_type: 'Act', resolved: '消費税法' });
    expect(r.fallback.total_count).toBe(1);
    expect(r.fallback.results[0]).toMatchObject({
      law_id: '363AC0000000108',
      title: '消費税法',
      law_num: '昭和六十三年法律第百八号',
      law_type: 'Act',
      url: 'https://laws.e-gov.go.jp/law/363AC0000000108',
    });
    expect(r.next_actions[1].action).toBe('search_law');
    expect(r.next_actions[1].example).toEqual({ keyword: '消法' });
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-029 e-Gov の /laws に law_title・law_type・渡した limit（省けば 10）を付ける', async () => {
    const fn = stubLawsFetch();
    const params = () => new URL(String(fn.mock.calls.at(-1)?.[0])).searchParams;

    await handleSearchFulltext(
      { keyword: '消法', law_type: 'Act', limit: 3 },
      { dbPath: DB_EMPTY }
    );
    expect(fn).toHaveBeenCalledTimes(1);
    expect(params().get('law_title')).toBe('消費税法');
    expect(params().get('law_type')).toBe('Act');
    expect(params().get('limit')).toBe('3');

    await handleSearchFulltext({ keyword: '所得税', limit: 30 }, { dbPath: DB_EMPTY });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(params().get('law_title')).toBe('所得税法');
    expect(params().get('limit')).toBe('30');
    expect(params().has('law_type')).toBe(false);

    await handleSearchFulltext({ keyword: '所得税2' }, { dbPath: DB_EMPTY });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(params().get('law_title')).toBe('所得税2');
    expect(params().get('limit')).toBe('10');
  });
});

describe('search_fulltext — 2 文字の語の 150 件の打ち切り', () => {
  it('SPEC-EGOV-SEARCH-FULLTEXT-030 scan_body: true の走査が 150 件に達したら truncated: true と note の文', async () => {
    const r = (await handleSearchFulltext(
      { keyword: '保存', scan_body: true, limit: 30 },
      { dbPath: DB_200 }
    )) as AnyObj;
    expect(r.source).toBe('bulk');
    expect(r.count).toBe(30);
    expect(r.short_tokens.body_search).toBe('like_all_articles');
    expect(r.short_tokens.truncated).toBe(true);
    expect(r.short_tokens.note).toContain('走査は 150 件で打ち切っており');
    expect(r.short_tokens.note.endsWith(TRUNC_NOTE)).toBe(true);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-030 149 件なら truncated: false で打ち切りの文は付かない', async () => {
    const r = (await handleSearchFulltext(
      { keyword: '保存', scan_body: true, limit: 30 },
      { dbPath: DB_149 }
    )) as AnyObj;
    expect(r.short_tokens.body_search).toBe('like_all_articles');
    expect(r.short_tokens.truncated).toBe(false);
    expect(r.short_tokens.note ?? '').not.toContain('打ち切って');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-031 法令名で絞った 2 文字の語の検索も 150 件で打ち切る', async () => {
    const r = (await handleSearchFulltext(
      { keyword: '大量条文試験法 保存' },
      { dbPath: DB_200 }
    )) as AnyObj;
    expect(r.source).toBe('bulk');
    expect(r.count).toBe(10);
    expect(r.short_tokens.body_search).toBe('like_in_law_scope');
    expect(r.short_tokens.truncated).toBe(true);
    expect(r.short_tokens.note.endsWith(TRUNC_NOTE)).toBe(true);
    expect(r.law_scope[0].token).toBe('大量条文試験法');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-031 条が 149 件なら truncated: false', async () => {
    const r = (await handleSearchFulltext(
      { keyword: '大量条文試験法 保存' },
      { dbPath: DB_149 }
    )) as AnyObj;
    expect(r.short_tokens.body_search).toBe('like_in_law_scope');
    expect(r.short_tokens.truncated).toBe(false);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-031 3 文字以上の語で索引を引いたときは 150 件を超えても truncated: false', async () => {
    const r = (await handleSearchFulltext(
      { keyword: '試験用条文 保存' },
      { dbPath: DB_200 }
    )) as AnyObj;
    expect(r.short_tokens.body_search).toBe('fts_then_filter');
    expect(r.short_tokens.truncated).toBe(false);
  });
});

describe('search_fulltext — keyword の前後の空白', () => {
  it('SPEC-EGOV-SEARCH-FULLTEXT-032 前後の半角・全角空白、タブ、改行を除いた keyword で検索して返す', async () => {
    for (const keyword of ['  適格請求書　 ', '\t適格請求書\n']) {
      const r = (await handleSearchFulltext({ keyword }, { dbPath: DB_STD })) as AnyObj;
      expect(r.source).toBe('bulk');
      expect(r.keyword).toBe('適格請求書');
      expect(r.count).toBe(2);
    }
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-032 api-fallback の応答でも keyword は前後の空白を除いた値', async () => {
    stubLawsFetch();
    const r = (await handleSearchFulltext({ keyword: ' 消法 ' }, { dbPath: DB_EMPTY })) as AnyObj;
    expect(r.source).toBe('api-fallback');
    expect(r.keyword).toBe('消法');
  });
});
