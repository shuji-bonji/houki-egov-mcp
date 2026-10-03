/**
 * 差分 20261003-db-cli-followup の受入テスト: 段落だけの附則（cli_bulk_download・search_fulltext）
 *
 * 期待値の正本は specs/changes/20261003-db-cli-followup/specs/{cli_bulk_download,search_fulltext}/spec.md。
 * 獣医師法施行規則（324M50010000093）の附則の並び（1〜6・8 番目は段落だけ、7 番目は条あり）をまねた XML を、
 * --bulk-download-everything で取り込んでから確かめる。
 */

import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureOutput,
  runCliWith,
  setupEnv,
  stubEgov,
  type TestEnv,
  withDb,
  zipOf,
} from '../../test-helpers/cli-db-harness.js';

// biome-ignore lint/suspicious/noExplicitAny: 応答の形をテストで自由に辿るため
type AnyObj = Record<string, any>;

const CSV_JUI =
  '府省令,昭和二十四年農林省令第九十三号,獣医師法施行規則,じゅういしほうしこうきそく,,昭和二十四年十二月二十八日,,,,令和元年七月一日,,324M50010000093,https://laws.e-gov.go.jp/law/324M50010000093/20190701_000000000000000,';
const REV_JUI = '324M50010000093_20190701_000000000000000';

function supplParagraphOnly(i: number, sentence: string): string {
  return `    <SupplProvision AmendLawNum="改正${i}">
      <SupplProvisionLabel>附　則</SupplProvisionLabel>
      <Paragraph Num="1"><ParagraphNum/><ParagraphSentence><Sentence>${sentence}</Sentence></ParagraphSentence></Paragraph>
    </SupplProvision>`;
}

const XML_JUI = `<?xml version="1.0" encoding="UTF-8"?>
<Law Era="Showa" Year="24" Num="093" LawType="MinisterialOrdinance" Lang="ja" PromulgateMonth="12" PromulgateDay="28">
  <LawNum>昭和二十四年農林省令第九十三号</LawNum>
  <LawBody>
    <LawTitle Kana="じゅういしほうしこうきそく">獣医師法施行規則</LawTitle>
    <MainProvision>
      <Article Num="1">
        <ArticleTitle>第一条</ArticleTitle>
        <Paragraph Num="1"><ParagraphSentence><Sentence>獣医師の免許の申請について定める。</Sentence></ParagraphSentence></Paragraph>
      </Article>
    </MainProvision>
${supplParagraphOnly(1, 'この省令は、公布の日から施行する。第一の附則。')}
${supplParagraphOnly(2, 'この省令は、昭和二十八年九月一日から施行する。')}
${supplParagraphOnly(3, '第三の附則の本文。')}
${supplParagraphOnly(4, '第四の附則の本文。')}
${supplParagraphOnly(5, '第五の附則の本文。')}
${supplParagraphOnly(6, '第六の附則の本文。')}
    <SupplProvision AmendLawNum="改正7">
      <SupplProvisionLabel>附　則</SupplProvisionLabel>
      <Article Num="1">
        <ArticleCaption>（施行期日）</ArticleCaption>
        <ArticleTitle>第一条</ArticleTitle>
        <Paragraph Num="1"><ParagraphSentence><Sentence>この省令は、公布の日から施行する。第七の附則。</Sentence></ParagraphSentence></Paragraph>
      </Article>
    </SupplProvision>
${supplParagraphOnly(8, '第八の附則の本文。')}
  </LawBody>
</Law>`;

let env: TestEnv;
let dbPath: string;

beforeEach(async () => {
  env = setupEnv('td-db-cli-fu-suppl-');
  captureOutput();
  dbPath = join(env.root, 'db', 'laws.db');
  process.env.HOUKI_EGOV_DB_PATH = dbPath;
  stubEgov({ full: zipOf([CSV_JUI, REV_JUI, XML_JUI]) });
  expect((await runCliWith(['--bulk-download-everything'])).exitCode).toBe(0);
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  env.restore();
});

describe('段落だけの附則（差分 20261003-db-cli-followup）', () => {
  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-012 段落だけの附則は Suppl<n>_intro の 1 行で、条の見出しは NULL、編章節の見出しは附則の見出し', () => {
    const row = withDb(dbPath, (db) =>
      db
        .prepare(
          "SELECT article_num, caption, chapter_path, body_raw FROM articles WHERE article_num = 'Suppl2_intro'"
        )
        .get()
    );
    expect(row).toEqual({
      article_num: 'Suppl2_intro',
      caption: null,
      chapter_path: '附　則',
      body_raw: 'この省令は、昭和二十八年九月一日から施行する。',
    });
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-012 条を持つ附則は Suppl<n>_<条番号> の行になり、その附則の intro の行は作らない', () => {
    const nums = withDb(dbPath, (db) =>
      (
        db.prepare('SELECT article_num FROM articles ORDER BY ord').all() as Array<{
          article_num: string;
        }>
      ).map((r) => r.article_num)
    );
    expect(nums).toEqual([
      '1',
      'Suppl1_intro',
      'Suppl2_intro',
      'Suppl3_intro',
      'Suppl4_intro',
      'Suppl5_intro',
      'Suppl6_intro',
      'Suppl7_1',
      'Suppl8_intro',
    ]);
    const captions = withDb(
      dbPath,
      (db) =>
        db
          .prepare("SELECT caption FROM articles WHERE article_num LIKE 'Suppl%_intro'")
          .all() as Array<{ caption: string | null }>
    );
    expect(captions.every((c) => c.caption === null)).toBe(true);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-041 段落だけの附則のヒットは article_num 附則(2)、caption null、chapter_path 附　則', async () => {
    vi.resetModules();
    const { handleSearchFulltext } = await import('../../tools/handlers.js');
    const r = (await handleSearchFulltext({
      keyword: '獣医師法施行規則 昭和二十八年九月一日から施行する',
    })) as AnyObj;
    expect(r.source).toBe('bulk');
    const hit = r.hits.find((h: AnyObj) => h.match_type === 'article');
    expect(hit).toMatchObject({
      law_id: '324M50010000093',
      article_num: '附則(2)',
      caption: null,
      chapter_path: '附　則',
    });
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-041 同じ法令の条のある附則は今までどおり 附則(7) 1', async () => {
    vi.resetModules();
    const { handleSearchFulltext } = await import('../../tools/handlers.js');
    const r = (await handleSearchFulltext({ keyword: '第七の附則' })) as AnyObj;
    const hit = r.hits.find((h: AnyObj) => h.match_type === 'article');
    expect(hit?.article_num).toBe('附則(7) 1');
  });
});
