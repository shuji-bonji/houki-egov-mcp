/**
 * law-search.ts のテスト — Phase 2-7
 *
 * `:memory:` DB に `seedTestDb` (test-helpers/law-db-fixture) で 3 法令を投入し、
 * FTS ヒット / 略称 OR 展開 / status フィルタ / law_meta 捕捉 / sanitize を検証する。
 */

import type DatabaseT from 'better-sqlite3';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db/index.js';
import { initSchema } from '../db/schema.js';
import { seedTestDb } from '../test-helpers/law-db-fixture.js';
import {
  buildFtsQueryWithAbbreviation,
  formatArticleNumForDisplay,
  hasAnyArticle,
  hasAnyLaw,
  sanitizeFtsQuery,
  searchLawsInDb,
  splitLawScope,
} from './law-search.js';

describe('formatArticleNumForDisplay', () => {
  it('本則 / 附則 / 別表を表示用に整形する', () => {
    expect(formatArticleNumForDisplay('30')).toBe('30');
    expect(formatArticleNumForDisplay('30_2')).toBe('30の2');
    expect(formatArticleNumForDisplay('Suppl3_1')).toBe('附則(3) 1');
    expect(formatArticleNumForDisplay('Suppl137_51_2')).toBe('附則(137) 51の2');
    expect(formatArticleNumForDisplay('Appendix2')).toBe('別表(2)');
  });
});

describe('sanitizeFtsQuery', () => {
  it('空白区切りを "tok" AND "tok" に整形する', () => {
    expect(sanitizeFtsQuery('適格請求書 発行事業者')).toBe('"適格請求書" AND "発行事業者"');
  });
  it('全角数字・全角スペース・大文字を正規化する', () => {
    expect(sanitizeFtsQuery('ＰＬ法　１２３')).toBe('"pl法" AND "123"');
  });
  it('FTS5 メタ文字を除去する', () => {
    expect(sanitizeFtsQuery('消費税"*:()税額控除')).toBe('"消費税" AND "税額控除"');
  });
  it('3 文字未満のトークンは落とす (trigram に乗らないため)', () => {
    expect(sanitizeFtsQuery('税')).toBe('');
    expect(sanitizeFtsQuery('民法')).toBe('');
    expect(sanitizeFtsQuery('民法 不法行為')).toBe('"不法行為"');
    expect(sanitizeFtsQuery('')).toBe('');
  });
  it('「第30条」は MATCH 式から取り除く (boost 専用)', () => {
    expect(sanitizeFtsQuery('適格請求書 第30条')).toBe('"適格請求書"');
    expect(sanitizeFtsQuery('第30条の2')).toBe('');
  });
});

describe('buildFtsQueryWithAbbreviation', () => {
  it('houki-egov 管轄の略称を formal に OR 展開する', () => {
    const r = buildFtsQueryWithAbbreviation('労基法');
    expect(r.query).toBe('("労基法") OR ("労働基準法")');
    expect(r.expandedFrom).toBe('労基法');
    expect(r.expandedTo).toBe('労働基準法');
  });
  it('正式名称そのものは展開しない', () => {
    const r = buildFtsQueryWithAbbreviation('消費税法');
    expect(r.query).toBe('"消費税法"');
    expect(r.expandedFrom).toBeUndefined();
  });
  it('辞書にない語は展開しない', () => {
    expect(buildFtsQueryWithAbbreviation('課税仕入れ').query).toBe('"課税仕入れ"');
  });
  it('通称 alias (適格請求書) も 消費税法 に OR 展開される', () => {
    const r = buildFtsQueryWithAbbreviation('適格請求書');
    expect(r.query).toBe('("適格請求書") OR ("消費税法")');
    expect(r.expandedTo).toBe('消費税法');
  });
  it('2 文字の略称 (消法) は formal だけで検索する', () => {
    const r = buildFtsQueryWithAbbreviation('消法');
    expect(r.query).toBe('"消費税法"');
    expect(r.expandedFrom).toBe('消法');
  });
  it('enableExpansion=false で展開を止められる', () => {
    expect(buildFtsQueryWithAbbreviation('労基法', { enableExpansion: false }).query).toBe(
      '"労基法"'
    );
  });
});

describe('searchLawsInDb', () => {
  let db: DatabaseT.Database;

  beforeEach(async () => {
    db = new Database(':memory:');
    initSchema(db);
    await seedTestDb(db);
  });

  afterEach(() => {
    closeDb(db);
  });

  it('hasAnyArticle / hasAnyLaw が投入後に true', () => {
    expect(hasAnyLaw(db)).toBe(true);
    expect(hasAnyArticle(db)).toBe(true);
  });

  it('条本文のキーワードで article ヒットを返す (snippet / 条番号付き)', () => {
    const r = searchLawsInDb(db, '適格請求書');
    expect(r.hits.length).toBe(2);
    for (const h of r.hits) {
      expect(h.match_type).toBe('article');
      expect(h.law_title).toBe('消費税法');
      expect(h.snippet).toContain('<b>適格請求書</b>');
    }
    expect(r.hits.map((h) => h.article_num).sort()).toEqual(['30', '30の2']);
  });

  it('同一法令の PreviousEnforced revision は重複ヒットしない', () => {
    const r = searchLawsInDb(db, '適格請求書', { limit: 30 });
    const revisions = new Set(r.hits.map((h) => h.law_revision_id));
    expect(revisions.size).toBe(1);
    expect([...revisions][0]).toBe('363AC0000000108_20231001_000000000000000');
  });

  it('略称 (消法) は OR 展開されて本文の「消費税」を含む条もヒットする', () => {
    const r = searchLawsInDb(db, '消法');
    expect(r.expanded).toEqual({ from: '消法', to: '消費税法' });
    expect(r.fts_query).toBe('"消費税法"');
    // law_meta (法令名) 経路 or article (「消費税」を含む本文) のどちらかで消費税法が拾える
    expect(r.hits.some((h) => h.law_title === '消費税法')).toBe(true);
  });

  it('全角数字のクエリでも半角で投入された本文にヒットする (Normalize-everywhere)', () => {
    const r = searchLawsInDb(db, '４５時間');
    expect(r.hits.length).toBe(1);
    expect(r.hits[0].law_title).toBe('労働基準法');
    expect(r.hits[0].article_num).toBe('36');
  });

  it('Article を持たない法令は law_meta 経路で法令名から捕捉される', () => {
    const r = searchLawsInDb(db, '改暦ノ布告');
    expect(r.hits.length).toBe(1);
    expect(r.hits[0].match_type).toBe('law_meta');
    expect(r.hits[0].law_id).toBe('105DF0000000337');
    expect(r.hits[0].article_num).toBeNull();
    expect(r.hits[0].score_reasons.join(' ')).toContain('law_meta');
  });

  it('law_meta 経路は abbrev (XML Abbrev) でもヒットする', () => {
    const r = searchLawsInDb(db, '改暦の布告');
    expect(r.hits.length).toBe(1);
    expect(r.hits[0].match_type).toBe('law_meta');
    expect(r.hits[0].score_reasons).toContain('abbrev_match');
  });

  it('lawType で絞り込める', () => {
    expect(searchLawsInDb(db, '改暦ノ布告', { lawType: 'Act' }).hits.length).toBe(0);
    expect(searchLawsInDb(db, '改暦ノ布告', { lawType: 'CabinetOrder' }).hits.length).toBe(1);
  });

  it('2 文字の法令名 (改暦 / 消費税法の「消費」等) は法令名 LIKE で補完される', () => {
    const r = searchLawsInDb(db, '改暦');
    expect(r.hits.length).toBe(1);
    expect(r.hits[0].match_type).toBe('law_meta');
    expect(r.hits[0].law_id).toBe('105DF0000000337');
  });

  it('LIKE 補完でも PreviousEnforced は除外され、完全一致が最上位になる', () => {
    const r = searchLawsInDb(db, '消費税法');
    const shohi = r.hits.filter((h) => h.law_title === '消費税法');
    expect(new Set(shohi.map((h) => h.law_revision_id)).size).toBe(1);
    expect(r.hits[0].law_title).toBe('消費税法');
  });

  it('「第30条」を含むクエリは該当条が最上位になる', () => {
    const r = searchLawsInDb(db, '適格請求書 第30条');
    expect(r.hits[0].article_num).toBe('30');
    expect(r.hits[0].score_reasons).toContain('article_num_match');
  });

  it('limit で件数を絞る', () => {
    expect(searchLawsInDb(db, '適格請求書', { limit: 1 }).hits.length).toBe(1);
  });

  it('1 文字 / メタ文字のみのクエリは 0 件 (例外を投げない)', () => {
    expect(searchLawsInDb(db, '税').hits).toEqual([]);
    expect(searchLawsInDb(db, '"*:()').hits).toEqual([]);
    expect(searchLawsInDb(db, '').hits).toEqual([]);
  });

  it('2 文字トークンは FTS ヒットの本文に含まれるかで AND 絞り込みする', () => {
    // 「保存」は第30条の本文にだけある
    const r = searchLawsInDb(db, '適格請求書 保存');
    expect(r.hits.map((h) => h.article_num)).toEqual(['30']);
    // 本文にない 2 文字語を足すと 0 件
    expect(searchLawsInDb(db, '適格請求書 判例').hits).toEqual([]);
  });

  it('2 文字語だけのクエリは既定では本文を引かず、next_actions で 2 つの道を示す (#23)', () => {
    // 「控除」は消費税法第30条の本文にあるが、trigram に載らないので MATCH 式は空
    const r = searchLawsInDb(db, '控除');
    expect(r.fts_query).toBe('');
    expect(r.hits.every((h) => h.match_type === 'law_meta')).toBe(true);
    expect(r.short_tokens?.body_search).toBe('not_searched');
    expect(r.short_tokens?.tokens).toEqual(['控除']);
    expect(r.short_tokens?.fts_min_token_length).toBe(3);
    expect(r.short_tokens?.hits_by_match_type.article).toBe(0);
    expect(r.short_tokens?.note).toContain('条の本文は引いていません');
    expect(r.short_tokens?.next_actions?.map((a) => a.example)).toEqual([
      { keyword: '民法 控除' },
      { keyword: '控除', scan_body: true },
    ]);
  });

  it('scan_body: true のときだけ articles の本文を走査する (#23)', () => {
    const r = searchLawsInDb(db, '控除', { scanBody: true });
    expect(r.hits.some((h) => h.match_type === 'article' && h.article_num === '30')).toBe(true);
    expect(r.short_tokens?.body_search).toBe('like_all_articles');
    expect(r.short_tokens?.truncated).toBe(false);
    expect(r.short_tokens?.hits_by_match_type.article).toBe(1);
    expect(r.short_tokens?.next_actions).toBeUndefined();
  });

  it('走査の snippet は一致位置の前後を切り出す (#23)', () => {
    const hit = searchLawsInDb(db, '控除', { scanBody: true }).hits.find(
      (h) => h.match_type === 'article'
    );
    expect(hit?.snippet).toContain('控除');
  });

  it('走査でも PreviousEnforced revision は除外される (#23)', () => {
    const r = searchLawsInDb(db, '控除', { limit: 30, scanBody: true });
    expect(new Set(r.hits.map((h) => h.law_revision_id)).size).toBe(1);
  });

  it('本文に無い 2 文字語は走査しても hits_by_match_type で本文 0 件と分かる (#23)', () => {
    // 「改暦」は法令名にだけあり、条の本文には無い
    const r = searchLawsInDb(db, '改暦', { scanBody: true });
    expect(r.short_tokens?.body_search).toBe('like_all_articles');
    expect(r.short_tokens?.hits_by_match_type).toEqual({ article: 0, law_meta: 1 });
    expect(r.short_tokens?.note).toContain('scan_body: true');
  });

  it('3 文字以上の語があるときは索引を引いてから 2 文字語で絞る (#23)', () => {
    const r = searchLawsInDb(db, '適格請求書 保存');
    expect(r.short_tokens?.body_search).toBe('fts_then_filter');
    expect(r.short_tokens?.tokens).toEqual(['保存']);
    expect(r.short_tokens?.truncated).toBe(false);
    // 索引を引ける語があるので scan_body は効かない
    expect(
      searchLawsInDb(db, '適格請求書 保存', { scanBody: true }).short_tokens?.body_search
    ).toBe('fts_then_filter');
  });

  it('2 文字語を含まないクエリには short_tokens が付かない (#23)', () => {
    expect(searchLawsInDb(db, '適格請求書').short_tokens).toBeUndefined();
    expect(searchLawsInDb(db, '税').short_tokens).toBeUndefined();
  });

  it('ヒットには e-Gov URL と score (0〜1) が付く', () => {
    const r = searchLawsInDb(db, '適格請求書');
    for (const h of r.hits) {
      expect(h.url).toBe('https://laws.e-gov.go.jp/law/363AC0000000108');
      expect(h.score).toBeGreaterThan(0);
      expect(h.score).toBeLessThanOrEqual(1);
    }
  });
});

describe('law scope (法令名 + 語 のクエリ)', () => {
  let db: DatabaseT.Database;

  beforeEach(async () => {
    db = new Database(':memory:');
    initSchema(db);
    await seedTestDb(db);
  });

  afterEach(() => {
    closeDb(db);
  });

  it('splitLawScope: 略称 / 正式名称 / DB の法令名をスコープに、残りを検索語にする', () => {
    expect(splitLawScope(db, ['労基法', '労働時間'])).toEqual({
      scope: [{ token: '労基法', law_title: '労働基準法', law_id: '322AC0000000049' }],
      rest: ['労働時間'],
    });
    expect(splitLawScope(db, ['消費税法', '適格請求書']).scope[0].law_title).toBe('消費税法');
    // aliases (通称) は法令名ではないのでスコープにしない
    expect(splitLawScope(db, ['適格請求書', '保存']).scope).toEqual([]);
    // 1 トークンは対象外、全トークンが法令名でも対象外
    expect(splitLawScope(db, ['民法']).scope).toEqual([]);
    expect(splitLawScope(db, ['消費税法', '労基法']).scope).toEqual([]);
  });

  it('「労基法 労働時間」は労働基準法の条に絞り、本文には「労基法」を要求しない', () => {
    const r = searchLawsInDb(db, '労基法 労働時間');
    expect(r.law_scope?.[0].law_title).toBe('労働基準法');
    expect(r.fts_query).toBe('"労働時間"');
    expect(r.hits.length).toBe(1);
    expect(r.hits[0].law_title).toBe('労働基準法');
    expect(r.hits[0].article_num).toBe('36');
  });

  it('スコープ外の法令の条はヒットしない', () => {
    // 「課税」は消費税法にしかないが、労基法スコープなので 0 件
    const r = searchLawsInDb(db, '労基法 課税仕入れ');
    expect(r.hits).toEqual([]);
  });

  it('スコープ + 2 文字語だけ (「労基法 協定」) は本文 LIKE で引く', () => {
    const r = searchLawsInDb(db, '労基法 協定');
    expect(r.hits.length).toBe(1);
    expect(r.hits[0].article_num).toBe('36');
    expect(r.hits[0].law_title).toBe('労働基準法');
    expect(r.short_tokens?.body_search).toBe('like_in_law_scope');
    expect(r.short_tokens?.hits_by_match_type).toEqual({ article: 1, law_meta: 0 });
  });

  it('「労基法 第36条」は条番号で直接引く (本文検索なし)', () => {
    const r = searchLawsInDb(db, '労基法 第36条');
    expect(r.law_scope?.[0].law_title).toBe('労働基準法');
    expect(r.hits.length).toBe(1);
    expect(r.hits[0].article_num).toBe('36');
    expect(r.hits[0].score_reasons).toContain('article_num_match');
    expect(r.hits[0].snippet).toContain('使用者は');
    // 存在しない条は 0 件
    expect(searchLawsInDb(db, '労基法 第999条').hits).toEqual([]);
    // 「消費税法 第30条の2」も引ける
    expect(searchLawsInDb(db, '消費税法 第30条の2').hits[0].article_num).toBe('30の2');
  });

  it('附則の条は supplementary_provision で減点される', () => {
    const r = searchLawsInDb(db, '適格請求書');
    // fixture には附則がないので減点理由は付かない
    for (const h of r.hits) expect(h.score_reasons).not.toContain('supplementary_provision');
  });
});

describe('searchLawsInDb (空 DB)', () => {
  it('hasAnyArticle が false で検索は 0 件', () => {
    const db = new Database(':memory:');
    initSchema(db);
    expect(hasAnyArticle(db)).toBe(false);
    expect(searchLawsInDb(db, '適格請求書').hits).toEqual([]);
    closeDb(db);
  });
});
