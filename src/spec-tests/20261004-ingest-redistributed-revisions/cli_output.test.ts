/**
 * 差分 20261004-ingest-redistributed-revisions の受入テスト: cli_bulk_download（取り込みの件数の表示）
 *
 * 期待値の正本は specs/changes/20261004-ingest-redistributed-revisions/specs/cli_bulk_download/spec.md の
 * SPEC-EGOV-CLI-BULK-DOWNLOAD-032。e-Gov への通信は vi.stubGlobal('fetch', …) で差し替える。
 */

import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureOutput,
  lines,
  type Output,
  runCliWith,
  setupEnv,
  stubEgov,
  type TestEnv,
} from '../../test-helpers/cli-db-harness.js';
import {
  indexesInOrder,
  seedDb,
  statusChangedLine,
} from '../../test-helpers/redistributed-revisions-cli.js';
import {
  DAY_20260902,
  DAY_20260917,
  DAY_20261001,
  FULL_20261002,
  forceStatuses,
  ishiZip,
  STATUS_V0190,
} from '../../test-helpers/redistributed-revisions-fixture.js';

let env: TestEnv;
let out: Output;
let dbPath: string;

beforeEach(() => {
  env = setupEnv('td-redistributed-out-');
  out = captureOutput();
  dbPath = join(env.root, 'db', 'laws.db');
  process.env.HOUKI_EGOV_DB_PATH = dbPath;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  env.restore();
});

describe('cli_bulk_download の件数の表示（差分 20261004-ingest-redistributed-revisions）', () => {
  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-032 --bulk-download-by-date で状態だけを書き換えた版があれば、ingest 完了の行のすぐ後に状態の更新の行を出す', async () => {
    await seedDb(dbPath, { days: [DAY_20260902, DAY_20260917] });
    stubEgov({ days: { '20261001': ishiZip(DAY_20261001) } });
    const r = await runCliWith(['--bulk-download-by-date', '20261001']);

    expect(r.exitCode).toBe(0);
    expect(lines(out.stdout)).toEqual([]);
    const err = lines(out.stderr);
    const [done, changed] = indexesInOrder(err, [
      /^ {2}ingest 完了: 0 件 upsert, 2 件 unchanged \(.+\)$/,
      statusChangedLine(1),
    ]);
    expect(changed).toBe((done as number) + 1);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-032 status_changed が 0 なら状態の更新の行を出さず、ingest 完了の行の形も変わらない', async () => {
    await seedDb(dbPath, {});
    stubEgov({ days: { '20260902': ishiZip(DAY_20260902) } });
    const r = await runCliWith(['--bulk-download-by-date', '20260902']);

    expect(r.exitCode).toBe(0);
    const err = lines(out.stderr);
    expect(err).toContainEqual(expect.stringMatching(/^ {2}ingest 完了: 4 件 upsert \(.+\)$/));
    expect(err.some((l) => l.includes('状態の更新'))).toBe(false);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-032 SPEC-EGOV-CLI-BULK-DOWNLOAD-033 --bulk-download-everything は 031 と 033 で書き換えた版の数を出し、[完了] の行が続く', async () => {
    await seedDb(dbPath, {
      days: [DAY_20260902, DAY_20260917, DAY_20261001],
      fill: (db) => forceStatuses(db, STATUS_V0190),
    });
    stubEgov({ full: ishiZip(FULL_20261002) });
    const r = await runCliWith(['--bulk-download-everything']);

    expect(r.exitCode).toBe(0);
    expect(lines(out.stdout)).toEqual([]);
    const err = lines(out.stderr);
    // `…_20261001_…`（031）と `…_20260917_…`（033）の 2 版。033 の版は unchanged に入らない
    const [done, changed, finished] = indexesInOrder(err, [
      /^ {2}ingest 完了: 0 件 upsert, 2 件 unchanged \(.+\)$/,
      statusChangedLine(2),
      /^\[完了\] 全体 .+$/,
    ]);
    expect(changed).toBe((done as number) + 1);
    expect(finished).toBe((changed as number) + 1);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-032 空の DB への全件の取り込みでは状態の更新の行を出さない', async () => {
    stubEgov({ full: ishiZip(DAY_20260902) });
    const r = await runCliWith(['--bulk-download-everything']);

    expect(r.exitCode).toBe(0);
    const err = lines(out.stderr);
    expect(err).toContainEqual(expect.stringMatching(/^ {2}ingest 完了: 4 件 upsert \(.+\)$/));
    expect(err.some((l) => l.includes('状態の更新'))).toBe(false);
  });
});
