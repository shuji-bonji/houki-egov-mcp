/**
 * 差分 20261004-ingest-redistributed-revisions の受入テスト: cli_sync
 *
 * 期待値の正本は specs/changes/20261004-ingest-redistributed-revisions/specs/cli_sync/spec.md。
 * e-Gov への通信は vi.stubGlobal('fetch', …) で差し替え、今日（日本時間）は
 * vi.useFakeTimers({ toFake: ['Date'] }) で固定する。差分なしの日（HTTP 500）で取り直しの待ちが入らないよう
 * HOUKI_EGOV_BULK_RETRY=1 にする。
 */

import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildZip,
  CSV_YOKIN,
  captureOutput,
  csvText,
  lines,
  type Output,
  REV_YOKIN,
  runCliWith,
  setupEnv,
  stubEgov,
  type TestEnv,
  withDb,
  XML_YOKIN,
  xmlEntry,
} from '../../test-helpers/cli-db-harness.js';
import {
  indexesInOrder,
  insertRevision,
  REVS_20261005,
  seedDb,
  statusChangedLine,
  warnLine,
} from '../../test-helpers/redistributed-revisions-cli.js';
import {
  DAY_20260902,
  DAY_20260917,
  DAY_20261001,
  ishiCsv,
  ishiXml,
  ishiZip,
  REV_0917,
  REV_1001,
  REV_20270401,
  statusesOf,
} from '../../test-helpers/redistributed-revisions-fixture.js';

let env: TestEnv;
let out: Output;
let dbPath: string;

beforeEach(() => {
  env = setupEnv('td-redistributed-sync-');
  out = captureOutput();
  dbPath = join(env.root, 'db', 'laws.db');
  process.env.HOUKI_EGOV_DB_PATH = dbPath;
  process.env.HOUKI_EGOV_BULK_RETRY = '1';
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  env.restore();
});

const HTTP500 = { status: 500, statusText: 'Internal Server Error' };
const HTTP503 = { status: 503, statusText: 'Service Unavailable' };

/** 日本時間のその日の昼 */
function setTodayJst(yyyy_mm_dd: string): void {
  vi.setSystemTime(new Date(`${yyyy_mm_dd}T03:00:00.000Z`));
}

/** 2026-10-01 の差分に、預金保険法（新しく取り込む法令）を 1 つ足した zip */
const ZIP_20261001_WITH_YOKIN = buildZip([
  {
    name: 'all_law_list.csv',
    content: csvText([...DAY_20261001.map(([rev, u]) => ishiCsv(rev, u)), CSV_YOKIN]),
  },
  ...DAY_20261001.map(([rev]) => xmlEntry(rev, ishiXml(rev))),
  xmlEntry(REV_YOKIN, XML_YOKIN),
]);

/** 施行日 2026-10-05 の UnEnforced の版 5 つを足す */
function add20261005(db: Parameters<typeof insertRevision>[0]): void {
  for (const rev of REVS_20261005) insertRevision(db, rev, 'UnEnforced', '2026-10-05');
}

describe('cli_sync（差分 20261004-ingest-redistributed-revisions）', () => {
  it('SPEC-EGOV-CLI-SYNC-006 SPEC-EGOV-CLI-SYNC-020 差分の日に配り直された版の状態を現行にし、last_sync_date の行のすぐ後に状態の更新の行を出す', async () => {
    setTodayJst('2026-10-01');
    await seedDb(dbPath, { days: [DAY_20260902, DAY_20260917], lastSyncDate: '2026-10-01' });
    stubEgov({ days: { '20261001': ZIP_20261001_WITH_YOKIN } });
    const r = await runCliWith(['--sync']);

    expect(r.exitCode).toBe(0);
    const err = lines(out.stderr);
    const [, day, last, changed] = indexesInOrder(err, [
      /^ {2}\[1\/1\] 2026-10-01: 1 件 upsert, 2 件 unchanged \(.+\)$/,
      /^\[完了\] 1 日分を確認 \(2026-10-01 〜 2026-10-01\)、1 日に差分あり: 1 件 upsert, 2 件 unchanged。全体 .+$/,
      '  last_sync_date: 2026-10-01',
      statusChangedLine(1),
    ]);
    expect(last).toBeGreaterThan(day as number);
    expect(changed).toBe((last as number) + 1);
    expect(withDb(dbPath, (db) => statusesOf(db))[REV_1001]).toBe('CurrentEnforced');
    expect(withDb(dbPath, (db) => statusesOf(db))[REV_0917]).toBe('PreviousEnforced');
    // 施行日を過ぎた未施行の版は残っていないので [WARN] は出ない
    expect(err.some((l) => l.startsWith('[WARN]'))).toBe(false);
  });

  it('SPEC-EGOV-CLI-SYNC-020 新たに取り込んだ法令が無いまとめ（SPEC-EGOV-CLI-SYNC-015）でも、状態の更新の行を出す。数は unchanged に含まれる', async () => {
    setTodayJst('2026-10-01');
    await seedDb(dbPath, { days: [DAY_20260902, DAY_20260917], lastSyncDate: '2026-09-30' });
    stubEgov({ days: { '20260930': HTTP500, '20261001': ishiZip(DAY_20261001) } });
    const r = await runCliWith(['--sync']);

    expect(r.exitCode).toBe(0);
    const err = lines(out.stderr);
    const [, last, changed] = indexesInOrder(err, [
      /^\[完了\] 2 日分を確認 \(2026-09-30 〜 2026-10-01\)、新たに取り込んだ法令はありません \(確認した 2 件はすべて取り込み済み\)、1 日は差分なし。全体 .+$/,
      '  last_sync_date: 2026-10-01',
      statusChangedLine(1),
    ]);
    expect(changed).toBe((last as number) + 1);
  });

  it('SPEC-EGOV-CLI-SYNC-020 状態だけを書き換えた版が無ければ状態の更新の行を出さない', async () => {
    setTodayJst('2026-10-01');
    await seedDb(dbPath, { days: [DAY_20260902], lastSyncDate: '2026-10-01' });
    // `…_20270401_…` は DB も CSV も未施行
    stubEgov({ days: { '20261001': ishiZip([[REV_20270401, true]]) } });
    const r = await runCliWith(['--sync']);

    expect(r.exitCode).toBe(0);
    const err = lines(out.stderr);
    expect(err).toContain('  last_sync_date: 2026-10-01');
    expect(err.some((l) => l.includes('状態の更新'))).toBe(false);
  });

  it('SPEC-EGOV-CLI-SYNC-021 v0.19.0 で 10-06 まで進めた DB を 10-07 に同期すると、施行日 10-05 の未施行の版 5 件で [WARN] を出して exit 0', async () => {
    setTodayJst('2026-10-07');
    await seedDb(dbPath, { fill: add20261005, lastSyncDate: '2026-10-06' });
    stubEgov({ days: { '20261006': HTTP500, '20261007': HTTP500 } });
    const r = await runCliWith(['--sync']);

    expect(r.exitCode).toBe(0);
    const err = lines(out.stderr);
    const [last, warn] = indexesInOrder(err, [
      '  last_sync_date: 2026-10-07',
      warnLine('2026-10-07', 5),
    ]);
    expect(warn).toBe((last as number) + 1);
    expect(warn).toBe(err.length - 1);
    expect(lines(out.stdout)).toEqual([]);
  });

  it('SPEC-EGOV-CLI-SYNC-021 SPEC-EGOV-CLI-SYNC-020 状態の更新の行があれば [WARN] はその後の最後の行', async () => {
    setTodayJst('2026-10-07');
    await seedDb(dbPath, {
      days: [DAY_20260902, DAY_20260917],
      fill: add20261005,
      lastSyncDate: '2026-10-06',
    });
    stubEgov({ days: { '20261006': ishiZip(DAY_20261001), '20261007': HTTP500 } });
    const r = await runCliWith(['--sync']);

    expect(r.exitCode).toBe(0);
    const err = lines(out.stderr);
    const [last, changed, warn] = indexesInOrder(err, [
      '  last_sync_date: 2026-10-07',
      statusChangedLine(1),
      warnLine('2026-10-07', 5),
    ]);
    expect(changed).toBe((last as number) + 1);
    expect(warn).toBe((changed as number) + 1);
    expect(warn).toBe(err.length - 1);
  });

  it('SPEC-EGOV-CLI-SYNC-021 施行日が last_sync_date と同じ日の版と、施行日の無い版は数えない', async () => {
    setTodayJst('2026-10-05');
    await seedDb(dbPath, {
      fill: (db) => {
        add20261005(db);
        insertRevision(db, 'NODATE_X_A', 'UnEnforced', null);
      },
      lastSyncDate: '2026-10-05',
    });
    stubEgov({ days: { '20261005': HTTP500 } });
    const r = await runCliWith(['--sync']);

    expect(r.exitCode).toBe(0);
    const err = lines(out.stderr);
    expect(err).toContain('  last_sync_date: 2026-10-05');
    expect(err.some((l) => l.startsWith('[WARN]'))).toBe(false);
  });

  it('SPEC-EGOV-CLI-SYNC-021 last_sync_date が今日より後で何も取得しないとき（SPEC-EGOV-CLI-SYNC-018）も、その last_sync_date と比べて [WARN] を出す', async () => {
    setTodayJst('2026-10-07');
    await seedDb(dbPath, { fill: add20261005, lastSyncDate: '2026-10-25' });
    stubEgov({});
    const r = await runCliWith(['--sync']);

    expect(r.exitCode).toBe(0);
    const err = lines(out.stderr);
    const [last, warn] = indexesInOrder(err, [
      '  last_sync_date: 2026-10-25',
      warnLine('2026-10-25', 5),
    ]);
    expect(warn).toBe((last as number) + 1);
  });

  it('SPEC-EGOV-CLI-SYNC-021 途中で止まったとき（SPEC-EGOV-CLI-SYNC-012・013）は数えず、[WARN] を出さない', async () => {
    setTodayJst('2026-10-07');
    await seedDb(dbPath, { fill: add20261005, lastSyncDate: '2026-10-06' });
    stubEgov({ days: { '20261006': HTTP503 } });
    const r = await runCliWith(['--sync']);

    expect(r.exitCode).toBe(1);
    const err = lines(out.stderr);
    expect(err).toContain('  last_sync_date は 2026-10-06 のままです');
    expect(err.some((l) => l.startsWith('[WARN]'))).toBe(false);
  });

  it('SPEC-EGOV-CLI-SYNC-021 同期の状態が無い DB（SPEC-EGOV-CLI-SYNC-009）では数えず、[WARN] を出さない', async () => {
    setTodayJst('2026-10-07');
    await seedDb(dbPath, { fill: add20261005 });
    stubEgov({});
    const r = await runCliWith(['--sync']);

    expect(r.exitCode).toBe(1);
    expect(lines(out.stderr).some((l) => l.startsWith('[WARN]'))).toBe(false);
  });
});
