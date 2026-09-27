/**
 * 差分 20260928-untested-behaviors の受入テスト: cli_sync
 *
 * 期待値の正本は specs/changes/20260928-untested-behaviors/specs/cli_sync/spec.md。
 * e-Gov への通信は vi.stubGlobal('fetch', …) で差し替える。今日（日本時間）は
 * vi.useFakeTimers({ toFake: ['Date'] }) で固定する。差分なしの日（HTTP 500 / 404）や
 * 失敗の日で取り直しの待ちが入らないよう HOUKI_EGOV_BULK_RETRY=1 にする。
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSchema } from '../../db/schema.js';
import { ingestZip } from '../../services/bulk/ingester.js';
import { createMemoryZip } from '../../services/bulk/zip-reader.js';

// ---------- fixture: 法令一覧 CSV と XML、zip ----------

const HEADER =
  '法令種別,法令番号,法令名,法令名読み,旧法令名,公布日,改正法令名,改正法令番号,改正法令公布日,施行日,施行日備考,法令ID,本文URL,未施行';
const CSV_YOKIN =
  '法律,昭和四十六年法律第三十四号,預金保険法,よきんほけんほう,,昭和四十六年四月一日,,,昭和四十六年四月一日,昭和四十六年四月一日,,346AC0000000034,https://laws.e-gov.go.jp/law/346AC0000000034/19710401_000000000000000,';
const REV_YOKIN = '346AC0000000034_19710401_000000000000000';
const XML_YOKIN = `<?xml version="1.0" encoding="UTF-8"?>
<Law Era="Showa" Year="46" Num="034" LawType="Act" Lang="ja" PromulgateMonth="04" PromulgateDay="01">
  <LawNum>昭和四十六年法律第三十四号</LawNum>
  <LawBody>
    <LawTitle Kana="よきんほけんほう" Abbrev="預保法">預金保険法</LawTitle>
    <MainProvision>
      <Chapter Num="1">
        <ChapterTitle>第一章　総則</ChapterTitle>
        <Article Num="1">
          <ArticleCaption>（目的）</ArticleCaption>
          <ArticleTitle>第一条</ArticleTitle>
          <Paragraph Num="1"><ParagraphSentence><Sentence>この法律は、預金者等の保護を目的とする。</Sentence></ParagraphSentence></Paragraph>
        </Article>
        <Article Num="2">
          <ArticleTitle>第二条</ArticleTitle>
          <Paragraph Num="1"><ParagraphSentence><Sentence>第二条の本文。</Sentence></ParagraphSentence></Paragraph>
        </Article>
      </Chapter>
    </MainProvision>
  </LawBody>
</Law>`;
const CSV_BROKEN =
  '法律,平成元年法律第一号,壊れた法,こわれたほう,,平成元年一月一日,,,,平成元年一月一日,,401AC0000000001,https://laws.e-gov.go.jp/law/401AC0000000001/19890101_000000000000000,';
const REV_BROKEN = '401AC0000000001_19890101_000000000000000';

function csvText(rows: string[]): string {
  return `﻿${[HEADER, ...rows].join('\r\n')}\r\n`;
}

/** 無圧縮（STORED）の zip を組み立てる */
function buildZip(entries: Array<{ name: string; content: string }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf-8');
    const data = Buffer.from(e.content, 'utf-8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

function xmlEntry(rev: string, xml: string): { name: string; content: string } {
  return { name: `${rev}/${rev}.xml`, content: xml };
}

/** 例の zip: 読める法令（条 2 つ）1 行と、壊れた XML 1 行 */
const FULL_ZIP = buildZip([
  { name: 'all_law_list.csv', content: csvText([CSV_YOKIN, CSV_BROKEN]) },
  xmlEntry(REV_YOKIN, XML_YOKIN),
  xmlEntry(REV_BROKEN, '<Law><broken'),
]);
/** 法令 1 件の zip */
const DAY_ZIP = buildZip([
  { name: 'all_law_list.csv', content: csvText([CSV_YOKIN]) },
  xmlEntry(REV_YOKIN, XML_YOKIN),
]);

const INDEX_URL = 'https://laws.e-gov.go.jp/bulkdownload/';
const dayUrl = (yyyymmdd: string): string =>
  `https://laws.e-gov.go.jp/bulkdownload?file_section=3&update_date=${yyyymmdd}&only_xml_flag=true`;

/** 日本時間 2026-09-19 の昼 */
const NOW_2026_09_19_JST = new Date('2026-09-19T03:00:00Z');

// ---------- 出力の取り込み ----------

let stdoutChunks: string[];
let stderrChunks: string[];

function lines(chunks: string[]): string[] {
  return chunks
    .join('')
    .split(/\r|\n/)
    .filter((l) => l.length > 0);
}

/** 期待する行（正規表現）が、この順で現れるか確かめる */
function expectInOrder(actual: string[], expected: RegExp[]): void {
  let from = 0;
  for (const re of expected) {
    const idx = actual.findIndex((l, i) => i >= from && re.test(l));
    expect(idx, `${re} が ${from} 行目以降に無い:\n${actual.join('\n')}`).toBeGreaterThanOrEqual(0);
    from = idx + 1;
  }
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- 環境・DB ----------

const REAL_TMP = tmpdir();
const ENV_KEYS = [
  'HOUKI_EGOV_DB_PATH',
  'XDG_CACHE_HOME',
  'TMPDIR',
  'HOUKI_EGOV_BULK_RETRY',
  'HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS',
] as const;
let savedEnv: Record<string, string | undefined>;
let root: string;
let dbPath: string;

/** 日付（YYYYMMDD）→ 応答。HEAD は既定で 200 */
type DayResponse = Buffer | { status: number; statusText?: string };
let fetchMock: ReturnType<typeof vi.fn>;

function stubEgov(opts: {
  days?: Record<string, DayResponse>;
  head?: () => Response | Promise<Response>;
}): void {
  fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === INDEX_URL) {
      return opts.head ? opts.head() : new Response(null, { status: 200 });
    }
    const m = /update_date=(\d{8})/.exec(url);
    const r = m ? opts.days?.[m[1] as string] : undefined;
    if (r === undefined)
      throw new Error(`テストで想定していない URL: ${url} ${init?.method ?? ''}`);
    if (Buffer.isBuffer(r)) return new Response(new Uint8Array(r), { status: 200 });
    return new Response('error page', { status: r.status, statusText: r.statusText ?? '' });
  });
  vi.stubGlobal('fetch', fetchMock);
}

function dayFetchCount(): number {
  return fetchMock.mock.calls.filter((c) => String(c[0]).includes('file_section=3')).length;
}

/** DB を用意する。preload の法令を取り込み済みにし、lastSyncDate があれば同期の状態を書く */
async function seedDb(opts: { lastSyncDate?: string; preloadYokin?: boolean }): Promise<void> {
  mkdirSync(join(root, 'db'), { recursive: true });
  const db = new Database(dbPath);
  try {
    initSchema(db);
    if (opts.preloadYokin) {
      await ingestZip({
        db,
        zip: createMemoryZip([
          { path: 'all_law_list.csv', content: csvText([CSV_YOKIN]) },
          { path: `${REV_YOKIN}/${REV_YOKIN}.xml`, content: XML_YOKIN },
        ]),
        source: 'all_xml',
        updateSyncState: false,
      });
    }
    if (opts.lastSyncDate) {
      db.prepare(
        `INSERT INTO sync_state (id, last_sync_date, last_full_dl_at, total_laws, bulk_source)
         VALUES (1, ?, '2026-05-01T03:00:00.000Z', 0, 'all_xml')`
      ).run(opts.lastSyncDate);
    }
  } finally {
    db.close();
  }
}

function readLastSyncDate(): string | null {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.prepare('SELECT last_sync_date FROM sync_state WHERE id = 1').get() as
      | { last_sync_date: string }
      | undefined;
    return row?.last_sync_date ?? null;
  } finally {
    db.close();
  }
}

async function runSyncCli(flag = '--sync'): Promise<number> {
  vi.resetModules();
  const { runCli } = await import('../../cli/index.js');
  const result = await runCli(['node', 'index.js', flag]);
  return result.exitCode;
}

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  root = mkdtempSync(join(REAL_TMP, 'td-cli-sync-'));
  mkdirSync(join(root, 'tmp'));
  process.env.TMPDIR = join(root, 'tmp');
  dbPath = join(root, 'db', 'laws.db');
  process.env.HOUKI_EGOV_DB_PATH = dbPath;
  process.env.HOUKI_EGOV_BULK_RETRY = '1';

  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW_2026_09_19_JST);

  stdoutChunks = [];
  stderrChunks = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdoutChunks.push(`${args.map(String).join(' ')}\n`);
  });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderrChunks.push(`${args.map(String).join(' ')}\n`);
  });
  vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    stderrChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
    return true;
  }) as typeof process.stderr.write);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(root, { recursive: true, force: true });
});

const HTTP500 = { status: 500, statusText: 'Internal Server Error' };
const HTTP404 = { status: 404, statusText: 'Not Found' };
const HTTP503 = { status: 503, statusText: 'Service Unavailable' };

// ---------- テスト ----------

describe('cli_sync（差分 20260928-untested-behaviors）', () => {
  it('SPEC-EGOV-CLI-SYNC-009 同期の状態が無ければ e-Gov へ接続せず、全件の取り込みを促して exit 1', async () => {
    await seedDb({});
    stubEgov({});
    const code = await runSyncCli();

    expect(code).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expectInOrder(lines(stderrChunks), [
      /^\[sync\] 差分同期$/,
      new RegExp(`^  DB: ${esc(dbPath)}$`),
      /^\[sync\] まだ全件取り込みが行われていません。先に --bulk-download-everything を実行してください$/,
    ]);
  });

  it('SPEC-EGOV-CLI-SYNC-010 上限（既定 90 日）を超えていたら全件の取り込みを促して exit 1', async () => {
    await seedDb({ lastSyncDate: '2026-05-01' });
    stubEgov({});
    const code = await runSyncCli();

    expect(code).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lines(stderrChunks)).toContain(
      '[sync] last_sync_date 2026-05-01 から 141 日空いています。日次差分の公開範囲 (90 日) を超えているので、--bulk-download-everything を実行してください'
    );
  });

  it('SPEC-EGOV-CLI-SYNC-010 上限は HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS の値', async () => {
    process.env.HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS = '1';
    await seedDb({ lastSyncDate: '2026-09-17' });
    stubEgov({});
    const code = await runSyncCli();

    expect(code).toBe(1);
    expect(lines(stderrChunks)).toContain(
      '[sync] last_sync_date 2026-09-17 から 2 日空いています。日次差分の公開範囲 (1 日) を超えているので、--bulk-download-everything を実行してください'
    );
  });

  it('SPEC-EGOV-CLI-SYNC-011 一括ダウンロードのページが HTTP 503 なら [ERROR] を出して exit 1、差分 zip は取得しない', async () => {
    await seedDb({ lastSyncDate: '2026-09-18' });
    stubEgov({
      head: () => new Response(null, { status: 503 }),
      days: { '20260918': DAY_ZIP, '20260919': DAY_ZIP },
    });
    const code = await runSyncCli();

    expect(code).toBe(1);
    expect(lines(stderrChunks)).toContain(
      '[ERROR] e-Gov に接続できません (HTTP 503 from https://laws.e-gov.go.jp/bulkdownload/)'
    );
    const head = fetchMock.mock.calls.find((c) => String(c[0]) === INDEX_URL);
    expect((head?.[1] as RequestInit | undefined)?.method).toBe('HEAD');
    expect(dayFetchCount()).toBe(0);
  });

  it('SPEC-EGOV-CLI-SYNC-011 HEAD が fetch failed で失敗したら [ERROR] fetch failed を出して exit 1', async () => {
    await seedDb({ lastSyncDate: '2026-09-18' });
    stubEgov({
      head: () => {
        throw new TypeError('fetch failed');
      },
      days: { '20260918': DAY_ZIP, '20260919': DAY_ZIP },
    });
    const code = await runSyncCli();

    expect(code).toBe(1);
    expect(lines(stderrChunks)).toContain('[ERROR] fetch failed');
    expect(dayFetchCount()).toBe(0);
  });

  it('SPEC-EGOV-CLI-SYNC-012 確認済みの日の後で止まったら、記録した日を出して exit 1', async () => {
    await seedDb({ lastSyncDate: '2026-09-16' });
    stubEgov({
      days: { '20260916': HTTP500, '20260917': DAY_ZIP, '20260918': HTTP503 },
    });
    const code = await runSyncCli();

    expect(code).toBe(1);
    const err = lines(stderrChunks);
    expectInOrder(err, [
      new RegExp(
        `^${esc(`[ERROR] 2026-09-18: HTTP 503 Service Unavailable from ${dayUrl('20260918')}`)}$`
      ),
      /^ {2}2026-09-17 までを last_sync_date に記録しました \(2 日分を確認、1 件 upsert\)。再実行すると続きから同期します$/,
    ]);
    expect(readLastSyncDate()).toBe('2026-09-17');
  });

  it('SPEC-EGOV-CLI-SYNC-013 最初の日で止まったら last_sync_date が変わらないことを出して exit 1', async () => {
    await seedDb({ lastSyncDate: '2026-09-18' });
    stubEgov({ days: { '20260918': HTTP503 } });
    const code = await runSyncCli();

    expect(code).toBe(1);
    expectInOrder(lines(stderrChunks), [
      /^\[ERROR\] 2026-09-18: HTTP 503 .+$/,
      /^ {2}last_sync_date は 2026-09-18 のままです$/,
    ]);
    expect(readLastSyncDate()).toBe('2026-09-18');
  });

  it('SPEC-EGOV-CLI-SYNC-014 差分を取り込んで終わったら件数をまとめて exit 0', async () => {
    await seedDb({ lastSyncDate: '2026-09-17' });
    stubEgov({ days: { '20260917': HTTP500, '20260918': DAY_ZIP, '20260919': HTTP500 } });
    const code = await runSyncCli();

    expect(code).toBe(0);
    expectInOrder(lines(stderrChunks), [
      /^\[完了\] 3 日分を確認 \(2026-09-17 〜 2026-09-19\)、1 日に差分あり: 1 件 upsert, 0 件 unchanged、2 日は差分なし。全体 .+$/,
      /^ {2}last_sync_date: 2026-09-19$/,
    ]);
    expect(readLastSyncDate()).toBe('2026-09-19');
  });

  it('SPEC-EGOV-CLI-SYNC-014 XML を読めず飛ばした法令があれば「<件数> 件は XML を読めず skip」を続ける', async () => {
    await seedDb({ lastSyncDate: '2026-09-19' });
    stubEgov({ days: { '20260919': FULL_ZIP } });
    const code = await runSyncCli();

    expect(code).toBe(0);
    expect(lines(stderrChunks)).toContainEqual(
      expect.stringMatching(
        /^\[完了\] 1 日分を確認 \(2026-09-19 〜 2026-09-19\)、1 日に差分あり: 1 件 upsert, 0 件 unchanged、1 件は XML を読めず skip。全体 .+$/
      )
    );
  });

  it('SPEC-EGOV-CLI-SYNC-015 2 日とも差分なし（HTTP 404）なら「新たに取り込んだ法令はありません、2 日は差分なし」', async () => {
    await seedDb({ lastSyncDate: '2026-09-18' });
    stubEgov({ days: { '20260918': HTTP404, '20260919': HTTP404 } });
    const code = await runSyncCli();

    expect(code).toBe(0);
    expect(lines(stderrChunks)).toContainEqual(
      expect.stringMatching(
        /^\[完了\] 2 日分を確認 \(2026-09-18 〜 2026-09-19\)、新たに取り込んだ法令はありません、2 日は差分なし。全体 .+$/
      )
    );
    expect(readLastSyncDate()).toBe('2026-09-19');
  });

  it('SPEC-EGOV-CLI-SYNC-015 取り込み済みの法令だけなら「確認した <n> 件はすべて取り込み済み」', async () => {
    await seedDb({ lastSyncDate: '2026-09-18', preloadYokin: true });
    stubEgov({ days: { '20260918': DAY_ZIP, '20260919': DAY_ZIP } });
    const code = await runSyncCli();

    expect(code).toBe(0);
    expect(lines(stderrChunks)).toContainEqual(
      expect.stringMatching(
        /^\[完了\] 2 日分を確認 \(2026-09-18 〜 2026-09-19\)、新たに取り込んだ法令はありません \(確認した 2 件はすべて取り込み済み\)。全体 .+$/
      )
    );
  });

  it('SPEC-EGOV-CLI-SYNC-015 取り込み済み 1 件と壊れた XML 1 件なら skip の件数を続ける', async () => {
    await seedDb({ lastSyncDate: '2026-09-19', preloadYokin: true });
    stubEgov({ days: { '20260919': FULL_ZIP } });
    const code = await runSyncCli();

    expect(code).toBe(0);
    expect(lines(stderrChunks)).toContainEqual(
      expect.stringMatching(
        /^\[完了\] 1 日分を確認 \(2026-09-19 〜 2026-09-19\)、新たに取り込んだ法令はありません \(確認した 1 件はすべて取り込み済み\)、1 件は XML を読めず skip。全体 .+$/
      )
    );
  });

  it('SPEC-EGOV-CLI-SYNC-016 1 日ごとの行: 差分なしの日と取り込んだ日', async () => {
    await seedDb({ lastSyncDate: '2026-09-17' });
    stubEgov({ days: { '20260917': HTTP500, '20260918': DAY_ZIP, '20260919': HTTP500 } });
    const code = await runSyncCli();

    expect(code).toBe(0);
    expectInOrder(lines(stderrChunks), [
      /^ {2}\[1\/3\] 2026-09-17: 差分なし$/,
      /^ {2}\[2\/3\] 2026-09-18: 1 件 upsert \(1\.8 KB, .+\)$/,
      /^ {2}\[3\/3\] 2026-09-19: 差分なし$/,
    ]);
  });

  it('SPEC-EGOV-CLI-SYNC-016 1 日ごとの行: upsert 0 件でも出し、unchanged と failed を続ける', async () => {
    await seedDb({ lastSyncDate: '2026-09-19', preloadYokin: true });
    stubEgov({ days: { '20260919': FULL_ZIP } });
    const code = await runSyncCli();

    expect(code).toBe(0);
    expect(lines(stderrChunks)).toContainEqual(
      expect.stringMatching(
        /^ {2}\[1\/1\] 2026-09-19: 0 件 upsert, 1 件 unchanged, 1 件 failed \(2\.2 KB, .+\)$/
      )
    );
  });

  it('SPEC-EGOV-CLI-SYNC-016 止まった日の行は出さない', async () => {
    await seedDb({ lastSyncDate: '2026-09-16' });
    stubEgov({
      days: { '20260916': HTTP500, '20260917': DAY_ZIP, '20260918': HTTP503 },
    });
    const code = await runSyncCli();

    expect(code).toBe(1);
    const err = lines(stderrChunks);
    expectInOrder(err, [
      /^ {2}\[1\/4\] 2026-09-16: 差分なし$/,
      /^ {2}\[2\/4\] 2026-09-17: 1 件 upsert \(.+\)$/,
    ]);
    expect(err.some((l) => /^ {2}\[\d+\/\d+\] 2026-09-18/.test(l))).toBe(false);
  });

  it('SPEC-EGOV-CLI-SYNC-017 --bulk-download-incremental は --sync と同じ表示・終了コード', async () => {
    await seedDb({ lastSyncDate: '2026-09-17' });
    stubEgov({ days: { '20260917': HTTP500, '20260918': DAY_ZIP, '20260919': HTTP500 } });
    const code = await runSyncCli('--bulk-download-incremental');

    expect(code).toBe(0);
    expectInOrder(lines(stderrChunks), [
      /^\[完了\] 3 日分を確認 \(2026-09-17 〜 2026-09-19\)、1 日に差分あり: 1 件 upsert, 0 件 unchanged、2 日は差分なし。全体 .+$/,
      /^ {2}last_sync_date: 2026-09-19$/,
    ]);
    expect(readLastSyncDate()).toBe('2026-09-19');
  });

  it('SPEC-EGOV-CLI-SYNC-018 last_sync_date が今日より後なら何も取得せず exit 0', async () => {
    await seedDb({ lastSyncDate: '2026-09-25' });
    stubEgov({});
    const code = await runSyncCli();

    expect(code).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expectInOrder(lines(stderrChunks), [
      /^\[完了\] 0 日分を確認 \(2026-09-25 〜 2026-09-19\)、新たに取り込んだ法令はありません。全体 .+$/,
      /^ {2}last_sync_date: 2026-09-25$/,
    ]);
    expect(readLastSyncDate()).toBe('2026-09-25');
  });
});
