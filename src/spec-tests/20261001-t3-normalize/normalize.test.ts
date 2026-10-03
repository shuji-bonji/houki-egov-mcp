/**
 * 差分 20261001-t3-normalize の受入テスト — 全角・半角・ダッシュ類の揃え方
 *
 * 期待値の正本: specs/changes/20261001-t3-normalize/specs/<dir>/spec.md
 * MCP クライアントから tools/call を呼ぶ。e-Gov への通信は fetch を差し替え、呼ばれた URL を確かめる。
 * search_fulltext と db_schema は、createMemoryZip + ingestZip で作った DB を引く。
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSchemaVersion, initSchema } from '../../db/schema.js';
import { ingestZip } from '../../services/bulk/ingester.js';
import { createMemoryZip } from '../../services/bulk/zip-reader.js';
import {
  type AnyObj,
  type Harness,
  type LawFixture,
  lawDataResponse,
  lawsResponse,
  simpleLawTree,
  startHarness,
} from '../../test-helpers/mcp-harness.js';
import { handleSearchFulltext } from '../../tools/handlers.js';

/** 製造物責任法（略称辞書の PL法。辞書に law_id が無いので e-Gov の法令名検索で決まる） */
const PL: LawFixture = {
  law_id: '406AC0000000085',
  title: '製造物責任法',
  law_num: '平成六年法律第八十五号',
};
/** 労働基準法（略称辞書の 労基法。law_id 付き） */
const ROUKI: LawFixture = {
  law_id: '322AC0000000049',
  title: '労働基準法',
  law_num: '昭和二十二年法律第四十九号',
};

/** 製造物責任法・労働基準法を返す e-Gov の差し替え */
function route(url: URL): Response | null {
  if (url.pathname.endsWith('/laws')) {
    return url.searchParams.get('law_title') === PL.title ? lawsResponse([PL]) : lawsResponse([]);
  }
  if (url.pathname.includes(`/law_data/${PL.law_id}`)) {
    return lawDataResponse(PL, simpleLawTree(PL.title, '3'), ['./pict/a.jpg']);
  }
  if (url.pathname.includes(`/law_data/${ROUKI.law_id}`)) {
    return lawDataResponse(ROUKI, simpleLawTree(ROUKI.title, '3'));
  }
  if (url.pathname.includes('/law_revisions/')) {
    return new Response(JSON.stringify({ law_info: {}, revisions: [] }), {
      headers: { 'content-type': 'application/json' },
    });
  }
  return null;
}

/** 法令名の検索に渡した law_title の一覧 */
const lawTitles = (h: Harness) =>
  h
    .urls()
    .filter((u) => u.pathname.endsWith('/laws'))
    .map((u) => u.searchParams.get('law_title'));

/** law_data を引いた law_id の一覧 */
const lawDataIds = (h: Harness) =>
  h
    .urls()
    .filter((u) => u.pathname.includes('/law_data/'))
    .map((u) => u.pathname.split('/').pop());

describe('law_name の略称の照合 (20261001-t3-normalize)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness(route);
  });
  afterEach(async () => {
    await h.close();
  });

  /**
   * ＰＬ法 が PL法 と同じく 製造物責任法 に当たり、末尾が全角空白の 労基法　 が 労働基準法 に当たることを確かめる。
   * check はツールごとの応答の確かめ方
   */
  async function expectNormalized(
    tool: string,
    args: (lawName: string) => Record<string, unknown>,
    check: (body: AnyObj) => void
  ) {
    const r = await h.call(tool, args('ＰＬ法'));
    expect(r.body.code, `${tool} ＰＬ法`).not.toBe('LAW_NOT_FOUND');
    check(r.body);
    expect(lawTitles(h), tool).toContain('製造物責任法');
    expect(lawTitles(h), tool).not.toContain('ＰＬ法');
    const before = lawDataIds(h).length;
    const r2 = await h.call(tool, args('労基法　'));
    expect(r2.body.code, `${tool} 労基法　`).not.toBe('LAW_NOT_FOUND');
    if (tool === 'get_related_laws') {
      expect(r2.body.law.law_id, tool).toBe(ROUKI.law_id);
    } else if (tool !== 'get_law_file' && tool !== 'get_law_revisions') {
      expect(lawDataIds(h).slice(before), tool).toContain(ROUKI.law_id);
    }
  }

  it('SPEC-EGOV-GET-LAW-039 law_name の全角英数字・全角空白を揃えてから辞書と照合する（ＰＬ法 は PL法 と同じ応答）', async () => {
    const strip = (md: string) => md.replace(/取得日時: .*$/m, '');
    let fullMarkdown = '';
    await expectNormalized(
      'get_law',
      (n) => ({ law_name: n, article: '3' }),
      (b) => {
        expect(b.meta?.law_id).toBe(PL.law_id);
        fullMarkdown = b.markdown;
      }
    );
    const half = await h.call('get_law', { law_name: 'PL法', article: '3' });
    expect(strip(fullMarkdown)).toBe(strip(half.body.markdown));
  });

  it('SPEC-EGOV-GET-LAW-039 辞書に無い名前は、前後の空白を除いた渡した値のまま（全角のまま）法令名の検索に渡す', async () => {
    const r = await h.call('get_law', { law_name: '　ＡＢＣ法　', article: '1' });
    expect(r.body.code).toBe('LAW_NOT_FOUND');
    expect(lawTitles(h)).toEqual(['ＡＢＣ法']);
  });

  it('SPEC-EGOV-GET-TOC-027 law_name の全角英数字・全角空白を揃えてから辞書と照合する', async () => {
    await expectNormalized(
      'get_toc',
      (n) => ({ law_name: n }),
      (b) => expect(b.meta.law_id).toBe(PL.law_id)
    );
  });

  it('SPEC-EGOV-GET-LAW-RANGE-033 law_name の全角英数字・全角空白を揃えてから辞書と照合する（無い附則は RANGE_NOT_FOUND）', async () => {
    await expectNormalized(
      'get_law_range',
      (n) => ({ law_name: n, suppl_index: 1 }),
      (b) => expect(b.code).toBe('RANGE_NOT_FOUND')
    );
  });

  it('SPEC-EGOV-GET-LAW-REVISIONS-015 law_name の全角英数字・全角空白を揃えてから辞書と照合する', async () => {
    await expectNormalized(
      'get_law_revisions',
      (n) => ({ law_name: n }),
      (b) => expect(b.meta.law_id).toBe(PL.law_id)
    );
  });

  it('SPEC-EGOV-GET-RELATED-LAWS-018 law_name の全角英数字・全角空白を揃えてから辞書と照合する', async () => {
    await expectNormalized(
      'get_related_laws',
      (n) => ({ law_name: n }),
      (b) => expect(b.law.law_id).toBe(PL.law_id)
    );
  });

  it('SPEC-EGOV-GET-ARTICLE-REFERENCES-043 law_name の全角英数字・全角空白を揃えてから辞書と照合する', async () => {
    await expectNormalized(
      'get_article_references',
      (n) => ({ law_name: n, article: '3' }),
      (b) => expect(JSON.stringify(b)).toContain(PL.law_id)
    );
  });

  it('SPEC-EGOV-LIST-ATTACHMENTS-023 law_name の全角英数字・全角空白を揃えてから辞書と照合する', async () => {
    await expectNormalized(
      'list_attachments',
      (n) => ({ law_name: n }),
      (b) => expect(JSON.stringify(b)).toContain(PL.law_id)
    );
  });

  it('SPEC-EGOV-GET-ATTACHMENT-028 law_name の全角英数字・全角空白を揃えてから辞書と照合する（一覧に無い src は ATTACHMENT_NOT_FOUND）', async () => {
    await expectNormalized(
      'get_attachment',
      (n) => ({ law_name: n, src: './pict/none.jpg' }),
      (b) => expect(b.code).toBe('ATTACHMENT_NOT_FOUND')
    );
  });

  it('SPEC-EGOV-GET-LAW-FILE-022 law_name の全角英数字・全角空白を揃えてから辞書と照合する', async () => {
    await expectNormalized(
      'get_law_file',
      (n) => ({ law_name: n, file_type: 'xml' }),
      (b) => expect(b.url).toContain(PL.law_id)
    );
  });

  it('SPEC-EGOV-VERIFY-CITATIONS-044 law_name の全角英数字・全角空白を揃えてから辞書と照合する（PL法 の件と同じ判定）', async () => {
    const half = await h.call('verify_citations', {
      citations: [{ law_name: 'PL法', article: '3' }],
    });
    expect(half.body.results[0].status).toBe('found');
    const full = await h.call('verify_citations', {
      citations: [
        { law_name: 'ＰＬ法', article: '3' },
        { law_name: '労基法　', article: '3' },
      ],
    });
    expect(full.body.results[0].status).toBe('found');
    expect(full.body.results[0].law.law_id).toBe(PL.law_id);
    expect(full.body.results[1].status).toBe('found');
    expect(full.body.results[1].law.law_id).toBe(ROUKI.law_id);
    expect(lawTitles(h)).not.toContain('ＰＬ法');
  });
});

describe('resolve_abbreviation と search_law (20261001-t3-normalize)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness(route);
  });
  afterEach(async () => {
    await h.close();
  });

  it('SPEC-EGOV-RESOLVE-ABBREVIATION-011 abbr の全角英数字・全角空白を揃えて照合し、応答の abbr は渡した値のまま', async () => {
    const r = await h.call('resolve_abbreviation', { abbr: 'ＰＬ法' });
    expect(r.body.abbr).toBe('ＰＬ法');
    expect(r.body.resolved.formal).toBe('製造物責任法');
    const lower = await h.call('resolve_abbreviation', { abbr: 'pl法' });
    expect(lower.body.resolved).toBeNull();
    const inner = await h.call('resolve_abbreviation', { abbr: '消　法' });
    expect(inner.body.resolved).toBeNull();
    const trailing = await h.call('resolve_abbreviation', { abbr: '労基法　' });
    expect(trailing.body.resolved.formal).toBe('労働基準法');
  });

  it('SPEC-EGOV-RESOLVE-ABBREVIATION-012 houki-egov の管轄のエントリには in_scope: true を付け、hint は付けない', async () => {
    const r = await h.call('resolve_abbreviation', { abbr: '消法' });
    expect(r.body.resolved.source_mcp_hint).toBe('houki-egov');
    expect(r.body.in_scope).toBe(true);
    expect(r.body).not.toHaveProperty('hint');
  });

  it('SPEC-EGOV-RESOLVE-ABBREVIATION-013 管轄外のエントリには in_scope: false と管轄先の hint を付ける（エラーにしない）', async () => {
    const r = await h.call('resolve_abbreviation', { abbr: '消基通' });
    expect(r.isError).toBe(false);
    expect(r.body.resolved.formal).toBe('消費税法基本通達');
    expect(r.body.resolved.source_mcp_hint).toBe('houki-nta');
    expect(r.body.in_scope).toBe(false);
    expect(r.body.hint).toBe(
      'このエントリは houki-nta の管轄です。houki-nta-mcp で取得してください。'
    );
  });

  it('SPEC-EGOV-SEARCH-LAW-014 keyword の略称の照合で全角英数字を吸収し、query.keyword は渡した値のまま', async () => {
    const r = await h.call('search_law', { keyword: 'ＰＬ法' });
    expect(r.isError).toBe(false);
    expect(r.body.query.keyword).toBe('ＰＬ法');
    expect(r.body.query.resolved).toBe('製造物責任法');
    expect(lawTitles(h)).toEqual(['製造物責任法']);
  });

  it('SPEC-EGOV-SEARCH-LAW-015 管轄外の略称は OUT_OF_SCOPE で e-Gov を引かない（get_law と同じ本文）', async () => {
    const r = await h.call('search_law', { keyword: '消基通' });
    expect(r.isError).toBe(true);
    expect(r.body.code).toBe('OUT_OF_SCOPE');
    expect(r.body.next_actions[0].action).toBe('delegate_to_mcp');
    expect(h.urls()).toHaveLength(0);
    const g = await h.call('get_law', { law_name: '消基通', article: '1' });
    expect(r.body.error).toBe(g.body.error);
    expect(r.body.hint).toBe(g.body.hint);
    expect(r.body.next_actions).toEqual(g.body.next_actions);
    const ok = await h.call('search_law', { keyword: '育児休業' });
    expect(ok.isError).toBe(false);
    expect(lawTitles(h)).toEqual(['育児休業']);
  });
});

// ---------- search_fulltext と db_schema ----------

const BOM = '﻿';
const CRLF = '\r\n';
const HEADER =
  '法令種別,法令番号,法令名,法令名読み,旧法令名,公布日,改正法令名,改正法令番号,改正法令公布日,施行日,施行日備考,法令ID,本文URL,未施行';
const DASH_ID = '508AC0000000777';
const DASH_REV = `${DASH_ID}_20260401_000000000000000`;
const DASH_CSV = `法律,令和八年法律第七百七十七号,ダッシュ試験法,だっしゅしけんほう,,令和八年三月三十一日,,,,令和八年四月一日,,${DASH_ID},https://laws.e-gov.go.jp/law/${DASH_ID}/20260401_000000000000000,`;
const DASH_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Law Era="Reiwa" Year="08" Num="777" LawType="Act" Lang="ja" PromulgateMonth="03" PromulgateDay="31">
  <LawNum>令和八年法律第七百七十七号</LawNum>
  <LawBody>
    <LawTitle Kana="だっしゅしけんほう">ダッシュ試験法</LawTitle>
    <MainProvision>
      <Article Num="1">
        <ArticleTitle>第一条</ArticleTitle>
        <Paragraph Num="1"><ParagraphSentence><Sentence>この条は様式第１８３―２号による届出について定める。</Sentence></ParagraphSentence></Paragraph>
      </Article>
    </MainProvision>
  </LawBody>
</Law>`;

async function seedDashDb(path: string): Promise<void> {
  const db = new Database(path);
  try {
    initSchema(db);
    const zip = createMemoryZip([
      { path: 'all_law_list.csv', content: `${BOM}${HEADER}${CRLF}${DASH_CSV}${CRLF}` },
      { path: `${DASH_ID}_20260401_000000000000000.xml`, content: DASH_XML },
    ]);
    await ingestZip({ db, zip, nowIso: '2026-09-01T00:00:00+09:00' });
  } finally {
    db.close();
  }
}

describe('search_fulltext と db_schema のダッシュ類 (20261001-t3-normalize)', () => {
  let root: string;
  let fresh: string;
  let legacy: string;
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'houki-egov-t3-'));
    fresh = join(root, 'fresh.db');
    legacy = join(root, 'legacy.db');
    await seedDashDb(fresh);
    await seedDashDb(legacy);
    // 0.15.4 以前に取り込んだ行（本文のダッシュ類が ― のまま）を再現する。
    // その DB はスキーマの版 2 なので、版も 2 にする（0.19.0 の版 3 の DB にはこの行は無い。SPEC-EGOV-SEARCH-FULLTEXT-036）
    const db = new Database(legacy);
    db.prepare(
      `UPDATE articles SET body = replace(body, '183-2', '183―2') WHERE law_revision_id = ?`
    ).run(DASH_REV);
    db.prepare("UPDATE schema_meta SET value = '2' WHERE key = 'schema_version'").run();
    db.close();
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-036 検索語のダッシュ類は - に揃え、0.16.0 で取り込んだ本文は 183-2 でも １８３―２ でも当たる', async () => {
    const db = new Database(fresh, { readonly: true });
    const body = (
      db.prepare('SELECT body FROM articles WHERE law_revision_id = ?').get(DASH_REV) as {
        body: string;
      }
    ).body;
    db.close();
    expect(body).toContain('183-2');
    for (const keyword of ['183-2', '１８３―２', '183−2']) {
      const r = (await handleSearchFulltext({ keyword }, { dbPath: fresh })) as AnyObj;
      expect(r.source, keyword).toBe('bulk');
      expect(
        r.hits.some((x: AnyObj) => x.law_id === DASH_ID),
        keyword
      ).toBe(true);
    }
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-036 0.15.4 以前に取り込んだ本文（183―2 のまま、版 2 の DB）は引かずに search_law に切り替える', async () => {
    // v0.16.0〜v0.18.x では版 2 の DB を引き、hits: [] だった
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ total_count: 0, laws: [] }), { status: 200 }))
    );
    try {
      const r = (await handleSearchFulltext({ keyword: '183-2' }, { dbPath: legacy })) as AnyObj;
      expect(r.source).toBe('api-fallback');
      expect(r.note.startsWith('bulk DB の版 (2) がこの houki-egov-mcp (3) より古いため、')).toBe(
        true
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('SPEC-EGOV-DB-SCHEMA-024 版 2 の DB を 0.16.0 で開いても schema_version は 2 のままで、既存の行の本文は書き換えない', async () => {
    const db = new Database(legacy);
    try {
      expect(getSchemaVersion(db)).toBe(2);
      const row = db
        .prepare('SELECT body FROM articles WHERE law_revision_id = ?')
        .get(DASH_REV) as {
        body: string;
      };
      expect(row.body).toContain('183―2');
    } finally {
      db.close();
    }
  });
});
