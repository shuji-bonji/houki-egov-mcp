/**
 * 差分 20261004-ingest-redistributed-revisions の受入テスト: cli_status
 *
 * 期待値の正本は specs/changes/20261004-ingest-redistributed-revisions/specs/cli_status/spec.md。
 * 今日（日本時間）は vi.useFakeTimers({ toFake: ['Date'] }) で固定する。--status はネットワークに出ない。
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
  insertRevision,
  REVS_20261005,
  seedDb,
  warnLine,
} from '../../test-helpers/redistributed-revisions-cli.js';

let env: TestEnv;
let out: Output;
let dbPath: string;
let egov: ReturnType<typeof stubEgov>;

beforeEach(() => {
  env = setupEnv('td-redistributed-status-');
  out = captureOutput();
  dbPath = join(env.root, 'db', 'laws.db');
  process.env.HOUKI_EGOV_DB_PATH = dbPath;
  vi.useFakeTimers({ toFake: ['Date'] });
  egov = stubEgov({});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  env.restore();
});

function setTodayJst(yyyy_mm_dd: string): void {
  vi.setSystemTime(new Date(`${yyyy_mm_dd}T03:00:00.000Z`));
}

function add20261005(db: Parameters<typeof insertRevision>[0]): void {
  for (const rev of REVS_20261005) insertRevision(db, rev, 'UnEnforced', '2026-10-05');
}

describe('cli_status（差分 20261004-ingest-redistributed-revisions）', () => {
  it('SPEC-EGOV-CLI-STATUS-012 last_sync_date が 2026-10-06 で施行日 2026-10-05 の未施行の版が 5 つある DB では、--sync の案内の後に [WARN] を標準出力に出して exit 0', async () => {
    setTodayJst('2026-10-07');
    await seedDb(dbPath, { fill: add20261005, lastSyncDate: '2026-10-06' });
    const r = await runCliWith(['--status']);

    expect(r.exitCode).toBe(0);
    const stdout = lines(out.stdout);
    const [, , hint, warn] = indexesInOrder(stdout, [
      '    days_since_sync: 1',
      '    staleness:       fresh',
      '  差分を取り込むには --sync を実行してください',
      warnLine('2026-10-06', 5),
    ]);
    expect(warn).toBe((hint as number) + 1);
    expect(warn).toBe(stdout.length - 1);
    expect(lines(out.stderr)).toEqual([]);
    expect(egov.fn).not.toHaveBeenCalled();
  });

  it('SPEC-EGOV-CLI-STATUS-012 施行日が last_sync_date と同じ日の版と、施行日の無い版は数えず、[WARN] を出さない', async () => {
    setTodayJst('2026-10-07');
    await seedDb(dbPath, {
      fill: (db) => {
        add20261005(db);
        insertRevision(db, 'NODATE_X_A', 'UnEnforced', null);
      },
      lastSyncDate: '2026-10-05',
    });
    const r = await runCliWith(['--status']);

    expect(r.exitCode).toBe(0);
    expect(lines(out.stdout).some((l) => l.startsWith('[WARN]'))).toBe(false);
  });

  it('SPEC-EGOV-CLI-STATUS-012 outdated の警告（SPEC-EGOV-CLI-STATUS-004）があれば、その後に [WARN] を出す', async () => {
    setTodayJst('2026-10-07');
    await seedDb(dbPath, {
      fill: (db) => insertRevision(db, 'OLD_20260501_A', 'UnEnforced', '2026-05-01'),
      lastSyncDate: '2026-06-01',
    });
    const r = await runCliWith(['--status']);

    expect(r.exitCode).toBe(0);
    const stdout = lines(out.stdout);
    const [outdated, warn] = indexesInOrder(stdout, [
      /^ {2}⚠ bulk DB が \d+ 日前のデータです。/,
      warnLine('2026-06-01', 1),
    ]);
    expect(warn).toBe((outdated as number) + 1);
  });

  it('SPEC-EGOV-CLI-STATUS-012 同期の状態が無いとき（SPEC-EGOV-CLI-STATUS-001）は数えず、[WARN] を出さない', async () => {
    setTodayJst('2026-10-07');
    await seedDb(dbPath, { fill: add20261005 });
    const r = await runCliWith(['--status']);

    expect(r.exitCode).toBe(0);
    expect(lines(out.stdout).some((l) => l.startsWith('[WARN]'))).toBe(false);
  });
});
