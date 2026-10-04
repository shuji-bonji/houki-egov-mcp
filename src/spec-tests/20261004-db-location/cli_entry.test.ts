/**
 * 差分 20261004-db-location の受入テスト: cli_entry（MCP サーバーの起動時のログ）
 *
 * 期待値の正本は specs/changes/20261004-db-location/specs/cli_entry/spec.md の SPEC-EGOV-CLI-ENTRY-012。
 * bin エントリ（src/index.ts）は import した時点で main() が走るので、標準入出力の接続（serveStdio）・
 * process.exit・process.on を差し替えてから vi.resetModules() の後に動的 import する。
 * DB の場所は環境変数（HOUKI_EGOV_DB_PATH・XDG_CACHE_HOME・HOME）で決め、HOME は一時ディレクトリの下にする。
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureOutput,
  lines,
  type Output,
  setupEnv,
  type TestEnv,
} from '../../test-helpers/cli-db-harness.js';

const require = createRequire(import.meta.url);
const pkg = require('../../../package.json') as { name: string; version: string };
const STARTED = `[server] ${pkg.name} v${pkg.version} started`;

let env: TestEnv;
let out: Output;
let home: string;

beforeEach(() => {
  env = setupEnv('td-db-location-entry-');
  home = join(env.root, 'home');
  out = captureOutput();
  vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  const realOn = process.on.bind(process);
  vi.spyOn(process, 'on').mockImplementation(((event: string, handler: () => void) => {
    if (event === 'SIGINT' || event === 'SIGTERM') return process;
    return realOn(event as 'exit', handler);
  }) as typeof process.on);
});

afterEach(() => {
  vi.doUnmock('@modelcontextprotocol/server/stdio');
  vi.restoreAllMocks();
  vi.resetModules();
  env.restore();
});

/** serveStdio を差し替えて、引数なしで src/index.ts を起動し、started の次の行を返す */
async function startServer(): Promise<string[]> {
  vi.resetModules();
  vi.doMock('@modelcontextprotocol/server/stdio', () => ({
    serveStdio: vi.fn(() => ({ close: vi.fn(async () => {}) })),
  }));
  const savedArgv = process.argv;
  process.argv = ['node', 'index.js'];
  try {
    await import('../../index.js');
    await vi.waitFor(() => expect(lines(out.stderr)).toContain(STARTED));
  } finally {
    process.argv = savedArgv;
  }
  return lines(out.stderr);
}

describe('SPEC-EGOV-CLI-ENTRY-012 起動時のログの DB の行', () => {
  it('SPEC-EGOV-CLI-ENTRY-012 環境変数なしでは started の次に [server] DB: <絶対パス>（DB の場所の設定: 既定）', async () => {
    const err = await startServer();
    const i = err.indexOf(STARTED);
    expect(err[i + 1]).toBe(
      `[server] DB: ${home}/.cache/houki-egov-mcp/laws.db（DB の場所の設定: 既定）`
    );
    expect(lines(out.stdout)).toEqual([]);
  });

  it('SPEC-EGOV-CLI-ENTRY-012 HOUKI_EGOV_DB_PATH では設定の名前が HOUKI_EGOV_DB_PATH で、ホームを ~ に置き換えない', async () => {
    const dbPath = join(home, '.cache', 'houki-egov-mcp', 'laws.v3.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    const err = await startServer();
    expect(err[err.indexOf(STARTED) + 1]).toBe(
      `[server] DB: ${dbPath}（DB の場所の設定: HOUKI_EGOV_DB_PATH）`
    );
  });

  it('SPEC-EGOV-CLI-ENTRY-012 相対パスの HOUKI_EGOV_DB_PATH は起動したときの作業フォルダーから絶対パスにする', async () => {
    process.env.HOUKI_EGOV_DB_PATH = 'dev/laws.db';
    vi.spyOn(process, 'cwd').mockReturnValue('/srv/work');
    const err = await startServer();
    expect(err[err.indexOf(STARTED) + 1]).toBe(
      '[server] DB: /srv/work/dev/laws.db（DB の場所の設定: HOUKI_EGOV_DB_PATH）'
    );
  });

  it('SPEC-EGOV-CLI-ENTRY-012 XDG_CACHE_HOME では設定の名前が XDG_CACHE_HOME', async () => {
    const xdg = join(env.root, 'xdg');
    process.env.XDG_CACHE_HOME = xdg;
    const err = await startServer();
    expect(err[err.indexOf(STARTED) + 1]).toBe(
      `[server] DB: ${xdg}/houki-egov-mcp/laws.db（DB の場所の設定: XDG_CACHE_HOME）`
    );
  });

  it('SPEC-EGOV-CLI-ENTRY-012 この行のために DB を開かず、ファイルもフォルダーも作らない', async () => {
    const dbPath = join(env.root, 'none', 'a', 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    const err = await startServer();
    expect(err).toContain(`[server] DB: ${dbPath}（DB の場所の設定: HOUKI_EGOV_DB_PATH）`);
    expect(existsSync(join(env.root, 'none'))).toBe(false);
  });
});
