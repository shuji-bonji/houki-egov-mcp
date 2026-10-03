/**
 * 差分 20261003-db-cli-followup の受入テスト: cli_entry（数値の環境変数の検査と使い方）
 *
 * 期待値の正本は specs/changes/20261003-db-cli-followup/specs/cli_entry/spec.md。
 * 環境変数は import 時に読まれるので、設定してから vi.resetModules() の後に読み込む。
 * 「何もしない」は、e-Gov に接続しないこと（fetch が呼ばれない）と DB のファイルができないことで確かめる。
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureOutput,
  lines,
  loadCli,
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
  env = setupEnv('td-db-cli-fu-entry-');
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

describe('使い方（差分 20261003-db-cli-followup）', () => {
  it('SPEC-EGOV-CLI-ENTRY-002 使い方に 4 つの環境変数が並び、数値の 3 つには 1 以上の整数と既定値を書く', async () => {
    expect((await runCliWith(['--help'])).exitCode).toBe(0);
    const text = lines(out.stdout).join('\n');
    for (const flag of [
      '--bulk-download-everything',
      '--sync',
      '--bulk-download-by-date YYYYMMDD',
      '--status',
      '--version',
      '--help',
    ]) {
      expect(text, flag).toContain(flag);
    }
    expect(text).toContain('HOUKI_EGOV_DB_PATH');
    // 環境変数の説明は ENVIRONMENT: の節から読む（USAGE: の行にも変数名が出ることがあるため）
    const env = text.slice(text.indexOf('ENVIRONMENT:'));
    expect(env).toContain('HOUKI_EGOV_DB_PATH');
    for (const [name, def] of [
      ['HOUKI_EGOV_BULK_RETRY', '3'],
      ['HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS', '90'],
      ['HOUKI_EGOV_CONCURRENCY', '4'],
    ] as const) {
      const block = env.slice(env.indexOf(name));
      expect(env, name).toContain(name);
      // 変数名の行から次の変数までに「1 以上の整数」と既定値がある
      const next = block.slice(1).search(/HOUKI_EGOV_|XDG_|DOCS:/);
      const own = next >= 0 ? block.slice(0, next + 1) : block;
      expect(own, name).toContain('1 以上の整数');
      expect(own, name).toMatch(new RegExp(`既定 ${def}\\b|${name}=${def}\\b`));
    }
  });
});

describe('CLI の数値の環境変数の検査（差分 20261003-db-cli-followup）', () => {
  const commands: string[][] = [
    ['--bulk-download-everything'],
    ['--bulk-download-by-date', '20260917'],
    ['--sync'],
    ['--bulk-download-incremental'],
    ['--status'],
  ];
  for (const args of commands) {
    it(`SPEC-EGOV-CLI-ENTRY-010 ${args[0]} は HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS=-5 で何もせずにエラーを出して exit 2`, async () => {
      process.env.HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS = '-5';
      const egov = stubEgov({});
      expect((await runCliWith(args)).exitCode).toBe(2);
      expect(lines(out.stderr)).toEqual([
        'ERROR: HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS は 1 以上の整数で指定してください: -5',
      ]);
      expect(egov.fn).not.toHaveBeenCalled();
      expect(existsSync(dbPath)).toBe(false);
      expect(existsSync(join(env.root, 'db'))).toBe(false);
    });
  }

  const invalidValues = ['0', '-1', '1.5', 'abc', '90days', ' 3', '3 '];
  for (const value of invalidValues) {
    it(`SPEC-EGOV-CLI-ENTRY-010 HOUKI_EGOV_BULK_RETRY=${JSON.stringify(value)} は --status でもエラーで exit 2`, async () => {
      process.env.HOUKI_EGOV_BULK_RETRY = value;
      const egov = stubEgov({});
      expect((await runCliWith(['--status'])).exitCode).toBe(2);
      expect(lines(out.stderr)).toEqual([
        `ERROR: HOUKI_EGOV_BULK_RETRY は 1 以上の整数で指定してください: ${value}`,
      ]);
      expect(lines(out.stdout)).toEqual([]);
      expect(egov.fn).not.toHaveBeenCalled();
    });
  }

  it('SPEC-EGOV-CLI-ENTRY-010 HOUKI_EGOV_CONCURRENCY も確かめる', async () => {
    process.env.HOUKI_EGOV_CONCURRENCY = '0';
    stubEgov({});
    expect((await runCliWith(['--sync'])).exitCode).toBe(2);
    expect(lines(out.stderr)).toEqual([
      'ERROR: HOUKI_EGOV_CONCURRENCY は 1 以上の整数で指定してください: 0',
    ]);
  });

  it('SPEC-EGOV-CLI-ENTRY-010 不正な変数が複数あれば BULK_RETRY・INCREMENTAL_LIMIT_DAYS・CONCURRENCY の順で最初の 1 つだけを出す', async () => {
    process.env.HOUKI_EGOV_CONCURRENCY = 'x';
    process.env.HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS = 'y';
    stubEgov({});
    expect((await runCliWith(['--sync'])).exitCode).toBe(2);
    expect(lines(out.stderr)).toEqual([
      'ERROR: HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS は 1 以上の整数で指定してください: y',
    ]);

    out.stderr.length = 0;
    process.env.HOUKI_EGOV_BULK_RETRY = 'z';
    expect((await runCliWith(['--sync'])).exitCode).toBe(2);
    expect(lines(out.stderr)).toEqual([
      'ERROR: HOUKI_EGOV_BULK_RETRY は 1 以上の整数で指定してください: z',
    ]);
  });

  it('SPEC-EGOV-CLI-ENTRY-010 空文字は既定値として扱い、1 以上の整数はその値を使う', async () => {
    process.env.HOUKI_EGOV_BULK_RETRY = '';
    process.env.HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS = '60';
    process.env.HOUKI_EGOV_CONCURRENCY = '12';
    stubEgov({});
    expect((await runCliWith(['--status'])).exitCode).toBe(0);
    expect(lines(out.stderr)).toEqual([]);
    const { BULK_CONFIG, HTTP_CONFIG } = await import('../../config.js');
    expect(BULK_CONFIG.bulkRetry).toBe(3);
    expect(BULK_CONFIG.incrementalLimitDays).toBe(60);
    expect(HTTP_CONFIG.concurrency).toBe(12);
  });

  it('SPEC-EGOV-CLI-ENTRY-010 引数の検査（余分な引数・日付）は環境変数の検査より先', async () => {
    process.env.HOUKI_EGOV_BULK_RETRY = 'abc';
    stubEgov({});
    expect((await runCliWith(['--status', 'extra'])).exitCode).toBe(2);
    expect(lines(out.stderr)).toEqual(['ERROR: 余分な引数: extra']);

    out.stderr.length = 0;
    expect((await runCliWith(['--bulk-download-by-date', '2026-09-17'])).exitCode).toBe(2);
    expect(lines(out.stderr)).toEqual([
      'ERROR: --bulk-download-by-date は YYYYMMDD 形式の日付を必要とします (例: 20260507)',
    ]);
  });

  for (const flag of ['--help', '-h', '--version', '-v']) {
    it(`SPEC-EGOV-CLI-ENTRY-010 ${flag} は環境変数を確かめずに exit 0`, async () => {
      process.env.HOUKI_EGOV_BULK_RETRY = 'abc';
      expect((await runCliWith([flag])).exitCode).toBe(0);
      expect(lines(out.stderr)).toEqual([]);
    });
  }
});

describe('MCP サーバーの起動での数値の環境変数（差分 20261003-db-cli-followup）', () => {
  it('SPEC-EGOV-CLI-ENTRY-011 HOUKI_EGOV_CONCURRENCY=-1 で起動すると警告を出し、同時リクエスト数の上限は 4 で起動を続ける', async () => {
    process.env.HOUKI_EGOV_CONCURRENCY = '-1';
    const { runCli, shouldFallbackToMcp } = await loadCli();
    const r = await runCli(['node', 'index.js']);
    expect(shouldFallbackToMcp(r)).toBe(true);
    expect(lines(out.stderr)).toEqual([
      '[server] 警告: HOUKI_EGOV_CONCURRENCY は 1 以上の整数で指定してください: -1（既定値 4 を使います）',
    ]);
    const { HTTP_CONFIG } = await import('../../config.js');
    expect(HTTP_CONFIG.concurrency).toBe(4);
    // ツールのモジュール（e-Gov への同時リクエスト数の上限を読み込み時に作る）も読み込める
    await expect(import('../../server.js')).resolves.toBeDefined();
  });

  it('SPEC-EGOV-CLI-ENTRY-011 HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS=abc では警告を出して 90 を使い、freshness.warning も 90 日', async () => {
    process.env.HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS = 'abc';
    const { runCli } = await loadCli();
    await runCli(['node', 'index.js']);
    expect(lines(out.stderr)).toEqual([
      '[server] 警告: HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS は 1 以上の整数で指定してください: abc（既定値 90 を使います）',
    ]);
    const { BULK_CONFIG } = await import('../../config.js');
    expect(BULK_CONFIG.incrementalLimitDays).toBe(90);
    const { buildWarning } = await import('../../services/freshness.js');
    expect(buildWarning('outdated', 38)).toContain('最終同期から 90 日を超えていれば');
  });

  it('SPEC-EGOV-CLI-ENTRY-011 不正な変数ごとに 1 行ずつ警告を出し、終了しない', async () => {
    process.env.HOUKI_EGOV_BULK_RETRY = '0';
    process.env.HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS = '1.5';
    process.env.HOUKI_EGOV_CONCURRENCY = 'x';
    const { runCli, shouldFallbackToMcp } = await loadCli();
    const r = await runCli(['node', 'index.js']);
    expect(shouldFallbackToMcp(r)).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(lines(out.stderr)).toEqual([
      '[server] 警告: HOUKI_EGOV_BULK_RETRY は 1 以上の整数で指定してください: 0（既定値 3 を使います）',
      '[server] 警告: HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS は 1 以上の整数で指定してください: 1.5（既定値 90 を使います）',
      '[server] 警告: HOUKI_EGOV_CONCURRENCY は 1 以上の整数で指定してください: x（既定値 4 を使います）',
    ]);
  });

  it('SPEC-EGOV-CLI-ENTRY-011 空文字と無いときは警告を出さない', async () => {
    process.env.HOUKI_EGOV_BULK_RETRY = '';
    const { runCli } = await loadCli();
    await runCli(['node', 'index.js']);
    expect(lines(out.stderr)).toEqual([]);
  });
});
