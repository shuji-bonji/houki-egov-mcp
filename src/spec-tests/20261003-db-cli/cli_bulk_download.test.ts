/**
 * 差分 20261003-db-cli の受入テスト: cli_bulk_download
 *
 * 期待値の正本は specs/changes/20261003-db-cli/specs/cli_bulk_download/spec.md。
 * e-Gov への通信は差し替え、今日（日本時間）は vi.useFakeTimers({ toFake: ['Date'] }) で決める。
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSchema } from '../../db/schema.js';
import { ingestZip } from '../../services/bulk/ingester.js';
import { createMemoryZip } from '../../services/bulk/zip-reader.js';
import {
  CSV_KAIREKI,
  CSV_NODAY,
  CSV_YOKIN,
  captureOutput,
  csvText,
  KAIREKI_SENTENCE,
  lines,
  type Output,
  REV_KAIREKI,
  REV_NODAY,
  REV_YOKIN,
  runCliWith,
  seedVersionedDb,
  setupEnv,
  snapshot,
  stubEgov,
  type TestEnv,
  withDb,
  XML_KAIREKI,
  XML_NODAY,
  XML_YOKIN,
  ZIP_YOKIN,
  zipOf,
} from '../../test-helpers/cli-db-harness.js';

let env: TestEnv;
let out: Output;
let dbPath: string;

beforeEach(() => {
  env = setupEnv('td-db-cli-bulk-');
  out = captureOutput();
  dbPath = join(env.root, 'db', 'laws.db');
  process.env.HOUKI_EGOV_DB_PATH = dbPath;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  env.restore();
});

/** 版 3 の DB を作り、預金保険法を取り込む。lastSyncDate があれば同期の状態を書く */
async function seedCurrentDb(lastSyncDate?: string): Promise<void> {
  mkdirSync(join(env.root, 'db'), { recursive: true });
  const db = new Database(dbPath);
  try {
    initSchema(db);
    await ingestZip({
      db,
      zip: createMemoryZip([
        { path: 'all_law_list.csv', content: csvText([CSV_YOKIN]) },
        { path: `${REV_YOKIN}/${REV_YOKIN}.xml`, content: XML_YOKIN },
      ]),
      source: 'all_xml',
      updateSyncState: false,
    });
    if (lastSyncDate) {
      db.prepare(
        `INSERT INTO sync_state (id, last_sync_date, last_full_dl_at, total_laws, bulk_source)
         VALUES (1, ?, '2026-09-07T04:53:21.112Z', 1, 'all_xml')`
      ).run(lastSyncDate);
    }
  } finally {
    db.close();
  }
}

describe('取り込む中身（--bulk-download-everything）', () => {
  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-011 公布日の欄が無い法令の promulgation_date は NULL、明治 5 年 11 月 9 日は 1872-11-09', async () => {
    stubEgov({
      full: zipOf([CSV_NODAY, REV_NODAY, XML_NODAY], [CSV_KAIREKI, REV_KAIREKI, XML_KAIREKI]),
    });
    expect((await runCliWith(['--bulk-download-everything'])).exitCode).toBe(0);
    const rows = withDb(
      dbPath,
      (db) =>
        db.prepare('SELECT law_id, promulgation_date FROM laws ORDER BY law_id').all() as Array<{
          law_id: string;
          promulgation_date: string | null;
        }>
    );
    expect(rows).toEqual([
      { law_id: '105DF0000000337', promulgation_date: '1872-11-09' },
      { law_id: '402AC0000000002', promulgation_date: null },
    ]);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-011 元号が知らない値・年が 1 以上の整数でないときも promulgation_date は NULL', async () => {
    const xmlEra = XML_NODAY.replace('Era="Heisei"', 'Era="Unknown"').replace(
      'PromulgateMonth="02"',
      'PromulgateMonth="02" PromulgateDay="02"'
    );
    const xmlYear = XML_NODAY.replace('Year="02"', 'Year="0"').replace(
      'PromulgateMonth="02"',
      'PromulgateMonth="02" PromulgateDay="02"'
    );
    const csvYear = CSV_NODAY.replace(/402AC0000000002/g, '402AC0000000003');
    const revYear = REV_NODAY.replace('402AC0000000002', '402AC0000000003');
    stubEgov({ full: zipOf([CSV_NODAY, REV_NODAY, xmlEra], [csvYear, revYear, xmlYear]) });
    expect((await runCliWith(['--bulk-download-everything'])).exitCode).toBe(0);
    const rows = withDb(dbPath, (db) =>
      db.prepare('SELECT promulgation_date FROM laws').all()
    ) as Array<{ promulgation_date: string | null }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.promulgation_date === null)).toBe(true);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-027 本則が段落だけの法令は MainProvision の 1 行（見出しは NULL）になり、別表は Appendix1 のまま', async () => {
    stubEgov({ full: zipOf([CSV_KAIREKI, REV_KAIREKI, XML_KAIREKI]) });
    expect((await runCliWith(['--bulk-download-everything'])).exitCode).toBe(0);
    const rows = withDb(dbPath, (db) =>
      db
        .prepare(
          'SELECT article_num, caption, chapter_path, body, body_raw FROM articles ORDER BY ord'
        )
        .all()
    ) as Array<Record<string, string | null>>;
    expect(rows.map((r) => r.article_num)).toEqual(['MainProvision', 'Appendix1']);
    expect(rows[0]).toMatchObject({
      article_num: 'MainProvision',
      caption: null,
      chapter_path: null,
      body_raw: KAIREKI_SENTENCE,
    });
    // 検索用の本文も持つ（全角空白は揃えられている）
    expect(rows[0]?.body).toContain('今般改暦ノ儀');
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-027 本則の段落が複数なら改行でつないで 1 行にする', async () => {
    const xml = XML_KAIREKI.replace(
      '</Paragraph>\n    </MainProvision>',
      '</Paragraph>\n      <Paragraph Num="2"><ParagraphSentence><Sentence>第二の段落</Sentence></ParagraphSentence></Paragraph>\n    </MainProvision>'
    );
    expect(xml).toContain('第二の段落');
    stubEgov({ full: zipOf([CSV_KAIREKI, REV_KAIREKI, xml]) });
    expect((await runCliWith(['--bulk-download-everything'])).exitCode).toBe(0);
    const row = withDb(dbPath, (db) =>
      db.prepare("SELECT body_raw FROM articles WHERE article_num = 'MainProvision'").get()
    ) as { body_raw: string };
    expect(row.body_raw).toBe(`${KAIREKI_SENTENCE}\n第二の段落`);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-027 本則に条が 1 つでもあれば MainProvision の行は作らない', async () => {
    stubEgov({ full: ZIP_YOKIN });
    expect((await runCliWith(['--bulk-download-everything'])).exitCode).toBe(0);
    const nums = withDb(dbPath, (db) =>
      (db.prepare('SELECT article_num FROM articles').all() as Array<{ article_num: string }>).map(
        (r) => r.article_num
      )
    );
    expect(nums).toEqual(['1', '2']);
  });
});

describe('同期の状態', () => {
  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-017 日本時間 2026-10-03 08:30 に取得を始めると last_sync_date は 2026-10-03、last_full_dl_at はその時刻（UTC の Z 付き）', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-02T23:30:00.000Z'));
    stubEgov({ full: zipOf([CSV_YOKIN, REV_YOKIN, XML_YOKIN], [CSV_NODAY, REV_NODAY, XML_NODAY]) });
    expect((await runCliWith(['--bulk-download-everything'])).exitCode).toBe(0);
    expect(snapshot(dbPath).syncState).toEqual([
      {
        id: 1,
        last_sync_date: '2026-10-03',
        last_full_dl_at: '2026-10-02T23:30:00.000Z',
        total_laws: 2,
        bulk_source: 'all_xml',
      },
    ]);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-017 基準は取得を始めた時刻で、取得中に日本時間の日付が変わっても取得を始めた日になる', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 日本時間 2026-10-02 23:50 に取得を始め、取得の途中で 10-03 00:10 になる
    vi.setSystemTime(new Date('2026-10-02T14:50:00.000Z'));
    stubEgov({
      full: () => {
        vi.setSystemTime(new Date('2026-10-02T15:10:00.000Z'));
        return ZIP_YOKIN;
      },
    });
    expect((await runCliWith(['--bulk-download-everything'])).exitCode).toBe(0);
    const ss = snapshot(dbPath).syncState[0];
    expect(ss?.last_sync_date).toBe('2026-10-02');
    expect(ss?.last_full_dl_at).toBe('2026-10-02T14:50:00.000Z');
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-018 --bulk-download-by-date は last_sync_date などの同期の状態を変えない', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-03T03:00:00.000Z'));
    await seedCurrentDb('2026-09-19');
    const before = snapshot(dbPath).syncState;
    stubEgov({
      head: 200,
      days: { '20260801': zipOf([CSV_NODAY, REV_NODAY, XML_NODAY]) },
    });
    expect((await runCliWith(['--bulk-download-by-date', '20260801'])).exitCode).toBe(0);
    const after = snapshot(dbPath);
    expect(after.laws).toBe(2);
    expect(after.syncState).toEqual(before);
    expect(after.syncState[0]?.last_sync_date).toBe('2026-09-19');
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-018 同期の状態が無い DB に --bulk-download-by-date で取り込んでも sync_state は 0 行のまま', async () => {
    await seedCurrentDb();
    stubEgov({ head: 200, days: { '20260801': zipOf([CSV_NODAY, REV_NODAY, XML_NODAY]) } });
    expect((await runCliWith(['--bulk-download-by-date', '20260801'])).exitCode).toBe(0);
    const s = snapshot(dbPath);
    expect(s.laws).toBe(2);
    expect(s.syncState).toEqual([]);
  });
});

describe('--bulk-download-by-date の差分の無い日', () => {
  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-028 HTTP 500 なら取り直さずに 差分なし (HTTP 500) を出して exit 0、DB は変わらない', async () => {
    await seedCurrentDb('2026-09-19');
    const before = snapshot(dbPath);
    const egov = stubEgov({
      head: 200,
      days: { '20260920': { status: 500, statusText: 'Internal Server Error' } },
    });
    const r = await runCliWith(['--bulk-download-by-date', '20260920']);
    expect(r.exitCode).toBe(0);
    const err = lines(out.stderr);
    const i = err.indexOf('[1/2] 差分 zip ダウンロード中...');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(err[i + 1]).toBe('  差分なし (HTTP 500)');
    expect(err.some((l) => l.startsWith('[2/2]'))).toBe(false);
    expect(err.some((l) => l.startsWith('[ERROR]'))).toBe(false);
    expect(egov.zipCalls()).toHaveLength(1);
    expect(egov.headCalls()).toBe(1);
    expect(snapshot(dbPath)).toEqual(before);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-028 HTTP 404 も 1 回目で差分なし、HOUKI_EGOV_BULK_RETRY=3 でも取得は 1 回', async () => {
    process.env.HOUKI_EGOV_BULK_RETRY = '3';
    await seedCurrentDb('2026-09-19');
    const egov = stubEgov({ head: 200, days: { '20260920': { status: 404 } } });
    expect((await runCliWith(['--bulk-download-by-date', '20260920'])).exitCode).toBe(0);
    expect(lines(out.stderr)).toContain('  差分なし (HTTP 404)');
    expect(egov.zipCalls()).toHaveLength(1);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-028 e-Gov に届かなければ（HEAD が 503）差分 zip を取得せずに [ERROR] で exit 1', async () => {
    await seedCurrentDb('2026-09-19');
    const egov = stubEgov({ head: 503, days: { '20260920': ZIP_YOKIN } });
    expect((await runCliWith(['--bulk-download-by-date', '20260920'])).exitCode).toBe(1);
    expect(lines(out.stderr)).toContain(
      '[ERROR] e-Gov に接続できません (HTTP 503 from https://laws.e-gov.go.jp/bulkdownload/)'
    );
    expect(egov.zipCalls()).toHaveLength(0);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-028 HEAD の通信が失敗したら通信の失敗の文で exit 1', async () => {
    await seedCurrentDb('2026-09-19');
    const egov = stubEgov({ head: new TypeError('fetch failed'), days: {} });
    expect((await runCliWith(['--bulk-download-by-date', '20260920'])).exitCode).toBe(1);
    expect(lines(out.stderr)).toContain('[ERROR] fetch failed');
    expect(egov.zipCalls()).toHaveLength(0);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-028 HTTP 503 は今までどおり取り直し、使い切ったら [ERROR] で exit 1', async () => {
    process.env.HOUKI_EGOV_BULK_RETRY = '2';
    await seedCurrentDb('2026-09-19');
    const egov = stubEgov({
      head: 200,
      days: { '20260920': { status: 503, statusText: 'Service Unavailable' } },
    });
    expect((await runCliWith(['--bulk-download-by-date', '20260920'])).exitCode).toBe(1);
    expect(egov.zipCalls()).toHaveLength(2);
    expect(lines(out.stderr).some((l) => l.startsWith('[ERROR] HTTP 503'))).toBe(true);
  }, 15_000);
});

describe('取得の前の DB の確認', () => {
  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-029 版 4 の DB では [1/2] を出さず、e-Gov へ接続せずに exit 1', async () => {
    mkdirSync(join(env.root, 'db'));
    seedVersionedDb(dbPath, '4');
    const egov = stubEgov({ full: ZIP_YOKIN });
    expect((await runCliWith(['--bulk-download-everything'])).exitCode).toBe(1);
    expect(egov.fn).not.toHaveBeenCalled();
    const err = lines(out.stderr);
    expect(err.some((l) => l.startsWith('[1/2]'))).toBe(false);
    expect(err[0]).toBe('[bulk-download-everything] 全件 zip を取得します');
    expect(err.at(-1)).toMatch(
      /^\[ERROR\] DB の版 \(4\) がこの houki-egov-mcp の版 \(3\) より新しいため/
    );
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-029 版 2 の DB では、取得の前に作り直すことを出してから取得し、取り込む', async () => {
    mkdirSync(join(env.root, 'db'));
    seedVersionedDb(dbPath, '2');
    stubEgov({ full: ZIP_YOKIN });
    expect((await runCliWith(['--bulk-download-everything'])).exitCode).toBe(0);
    const err = lines(out.stderr);
    const notice = err.indexOf(
      '  DB の版 (2) が古いため、取得の後で作り直します（取り込んだ中身は消えます）'
    );
    expect(notice).toBeGreaterThan(err.findIndex((l) => l.startsWith('  DB:         ')));
    expect(notice).toBeLessThan(err.indexOf('[1/2] zip ダウンロード中...'));
    expect(snapshot(dbPath).schemaVersion).toBe('3');
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-029 版 3 の DB には今までどおり取得して取り込み、作り直しの文は出さない', async () => {
    await seedCurrentDb('2026-09-19');
    stubEgov({ full: zipOf([CSV_NODAY, REV_NODAY, XML_NODAY]) });
    expect((await runCliWith(['--bulk-download-everything'])).exitCode).toBe(0);
    expect(lines(out.stderr).some((l) => l.includes('作り直します'))).toBe(false);
    expect(snapshot(dbPath).laws).toBe(2);
  });
});

describe('--bulk-download-by-date は版が同じ DB にだけ取り込む', () => {
  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-030 DB ファイルの無い場所では DB がまだありませんの文で exit 1、ファイルもフォルダーもできない', async () => {
    const egov = stubEgov({ head: 200, days: { '20260917': ZIP_YOKIN } });
    expect((await runCliWith(['--bulk-download-by-date', '20260917'])).exitCode).toBe(1);
    expect(lines(out.stderr)).toContain(
      '[ERROR] DB がまだありません。先に houki-egov-mcp --bulk-download-everything を実行してください'
    );
    expect(egov.fn).not.toHaveBeenCalled();
    expect(existsSync(dbPath)).toBe(false);
    expect(existsSync(join(env.root, 'db'))).toBe(false);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-030 版の記録が無い DB（テーブルの無い SQLite）でも同じ文で exit 1、書き込まない', async () => {
    mkdirSync(join(env.root, 'db'));
    new Database(dbPath).close();
    const egov = stubEgov({ head: 200, days: { '20260917': ZIP_YOKIN } });
    expect((await runCliWith(['--bulk-download-by-date', '20260917'])).exitCode).toBe(1);
    expect(lines(out.stderr)).toContain(
      '[ERROR] DB がまだありません。先に houki-egov-mcp --bulk-download-everything を実行してください'
    );
    expect(egov.fn).not.toHaveBeenCalled();
    expect(withDb(dbPath, (db) => db.prepare('SELECT name FROM sqlite_master').all())).toEqual([]);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-030 経過の 1・2 行目の後に DB を確かめ、版を読めない DB は読めない版のエラー（SPEC-EGOV-DB-SCHEMA-025 の文）で exit 1', async () => {
    mkdirSync(join(env.root, 'db'));
    seedVersionedDb(dbPath, 'x1');
    const egov = stubEgov({ head: 200, days: { '20260917': ZIP_YOKIN } });
    expect((await runCliWith(['--bulk-download-by-date', '20260917'])).exitCode).toBe(1);
    const err = lines(out.stderr);
    expect(err[0]).toBe('[bulk-download-by-date] update_date=20260917 の差分 zip を取得します');
    expect(err.at(-1)).toBe(
      `[ERROR] DB の版を読めないため (schema_version: x1)、DB を変更しません。DB ファイル (${dbPath}) を消してから HOUKI_EGOV_DB_PATH='${dbPath}' npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything を実行してください`
    );
    expect(egov.fn).not.toHaveBeenCalled();
  });
});
