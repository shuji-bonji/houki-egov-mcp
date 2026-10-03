/**
 * 差分 20261003-db-cli の受入テスト: cli_entry（引数の検査）
 *
 * 期待値の正本は specs/changes/20261003-db-cli/specs/cli_entry/spec.md。
 * 「何もしない」は、e-Gov に接続しないこと（fetch が呼ばれない）と、DB のファイルができないことで確かめる。
 */

import { existsSync } from 'node:fs';
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

let env: TestEnv;
let out: Output;
let dbPath: string;

beforeEach(() => {
  env = setupEnv('td-db-cli-entry-');
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

describe('cli_entry（差分 20261003-db-cli）', () => {
  for (const arg of ['status', 'sync']) {
    it(`SPEC-EGOV-CLI-ENTRY-008 - で始まらない最初の引数 ${arg} は 未知の引数 のエラーと使い方を出し、MCP サーバーを起動せずに exit 2`, async () => {
      const egov = stubEgov({});
      const r = await runCliWith([arg]);
      expect(r.exitCode).toBe(2);
      expect(lines(out.stderr)).toEqual([`ERROR: 未知の引数: ${arg}`]);
      // 使い方は標準出力
      expect(lines(out.stdout).some((l) => l.includes('USAGE:'))).toBe(true);
      expect(egov.fn).not.toHaveBeenCalled();
      expect(existsSync(dbPath)).toBe(false);
    });
  }

  const extraCases: Array<{ args: string[]; err: string }> = [
    { args: ['--status', 'extra'], err: 'ERROR: 余分な引数: extra' },
    { args: ['--help', '--version'], err: 'ERROR: 余分な引数: --version' },
    { args: ['--sync', '--status'], err: 'ERROR: 余分な引数: --status' },
    { args: ['--bulk-download-by-date', '20260917', 'extra'], err: 'ERROR: 余分な引数: extra' },
    { args: ['--bulk-download-everything', 'x'], err: 'ERROR: 余分な引数: x' },
    { args: ['--version', '-v'], err: 'ERROR: 余分な引数: -v' },
    { args: ['--bulk-download-incremental', 'x', 'y'], err: 'ERROR: 余分な引数: x' },
  ];
  for (const c of extraCases) {
    it(`SPEC-EGOV-CLI-ENTRY-009 ${c.args.join(' ')} は「${c.err}」と使い方を出し、何もせずに exit 2`, async () => {
      const egov = stubEgov({});
      const r = await runCliWith(c.args);
      expect(r.exitCode).toBe(2);
      expect(lines(out.stderr)).toEqual([c.err]);
      expect(lines(out.stdout).some((l) => l.includes('USAGE:'))).toBe(true);
      expect(egov.fn).not.toHaveBeenCalled();
      expect(existsSync(dbPath)).toBe(false);
      expect(existsSync(join(env.root, 'db'))).toBe(false);
    });
  }

  it('SPEC-EGOV-CLI-ENTRY-009 --bulk-download-by-date の日付の形が違うときは、余分な引数より先に日付のエラーで exit 2', async () => {
    const egov = stubEgov({});
    const r = await runCliWith(['--bulk-download-by-date', '2026-09-17', 'extra']);
    expect(r.exitCode).toBe(2);
    expect(lines(out.stderr)).toEqual([
      'ERROR: --bulk-download-by-date は YYYYMMDD 形式の日付を必要とします (例: 20260507)',
    ]);
    expect(egov.fn).not.toHaveBeenCalled();
  });
});
