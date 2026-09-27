/**
 * 差分 20260928-untested-behaviors の受入テスト: cli_entry
 *
 * 期待値の正本は specs/changes/20260928-untested-behaviors/specs/cli_entry/spec.md。
 * bin エントリ（src/index.ts）は import した時点で main() が走るので、
 * 標準入出力の接続（serveStdio）・process.exit・process.on を差し替えてから
 * vi.resetModules() の後に動的 import する。
 */

import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const require = createRequire(import.meta.url);
const pkg = require('../../../package.json') as { name: string; version: string };
const VERSION_LINE = `${pkg.name} v${pkg.version}`;

interface Captured {
  stdout: string[];
  stderr: string[];
}

function splitLines(chunks: string[]): string[] {
  return chunks
    .join('')
    .split(/\r|\n/)
    .filter((l) => l.length > 0);
}

let captured: Captured;
let savedArgv: string[];
let savedDebug: string | undefined;
let exitSpy: MockInstance<typeof process.exit>;
let onSpy: MockInstance<typeof process.on>;
let signalHandlers: Map<string, Array<() => void>>;

beforeEach(() => {
  vi.resetModules();
  captured = { stdout: [], stderr: [] };
  savedArgv = process.argv;
  savedDebug = process.env.DEBUG;
  delete process.env.DEBUG;
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    captured.stdout.push(`${args.map(String).join(' ')}\n`);
  });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    captured.stderr.push(`${args.map(String).join(' ')}\n`);
  });
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  signalHandlers = new Map();
  const realOn = process.on.bind(process);
  onSpy = vi.spyOn(process, 'on').mockImplementation(((
    event: string,
    handler: () => void
  ): NodeJS.Process => {
    if (event === 'SIGINT' || event === 'SIGTERM') {
      const list = signalHandlers.get(event) ?? [];
      list.push(handler);
      signalHandlers.set(event, list);
      return process;
    }
    return realOn(event as 'exit', handler);
  }) as typeof process.on);
});

afterEach(() => {
  process.argv = savedArgv;
  if (savedDebug === undefined) delete process.env.DEBUG;
  else process.env.DEBUG = savedDebug;
  vi.doUnmock('@modelcontextprotocol/server/stdio');
  vi.restoreAllMocks();
  onSpy.mockRestore();
});

/** serveStdio を差し替えて src/index.ts を起動する */
async function startEntry(
  argv: string[],
  serveStdio: ((...args: unknown[]) => unknown) | ReturnType<typeof vi.fn>
): Promise<ReturnType<typeof vi.fn>> {
  const serveMock = vi.isMockFunction(serveStdio) ? serveStdio : vi.fn(serveStdio);
  vi.doMock('@modelcontextprotocol/server/stdio', () => ({ serveStdio: serveMock }));
  process.argv = ['node', 'index.js', ...argv];
  await import('../../index.js');
  return serveMock;
}

describe('cli_entry（差分 20260928-untested-behaviors）', () => {
  it('SPEC-EGOV-CLI-ENTRY-005 -v は --version と同じ 1 行を出して exit 0（runCli）', async () => {
    const { runCli, shouldFallbackToMcp } = await import('../../cli/index.js');
    const result = await runCli(['node', 'index.js', '-v']);
    expect(result.exitCode).toBe(0);
    expect(shouldFallbackToMcp(result)).toBe(false);
    expect(splitLines(captured.stdout)).toEqual([VERSION_LINE]);

    captured.stdout = [];
    const viaLong = await runCli(['node', 'index.js', '--version']);
    expect(viaLong.exitCode).toBe(0);
    expect(splitLines(captured.stdout)).toEqual([VERSION_LINE]);
  });

  it('SPEC-EGOV-CLI-ENTRY-005 -v はサーバーを起動せず標準出力 1 行だけで exit 0（bin エントリ）', async () => {
    // テストでは process.exit が戻ってくるので、exit の時点での様子を記録して確かめる
    let serveCallsAtExit = -1;
    let stdoutAtExit: string[] = [];
    let stderrAtExit: string[] = [];
    const serveMock = vi.fn(() => ({ close: vi.fn() }));
    exitSpy.mockImplementation(((code?: number) => {
      if (serveCallsAtExit === -1) {
        serveCallsAtExit = serveMock.mock.calls.length;
        stdoutAtExit = splitLines(captured.stdout);
        stderrAtExit = splitLines(captured.stderr);
      }
      return code as never;
    }) as never);
    await startEntry(['-v'], serveMock);
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled());
    expect(exitSpy.mock.calls[0]?.[0]).toBe(0);
    expect(serveCallsAtExit).toBe(0);
    expect(stdoutAtExit).toEqual([VERSION_LINE]);
    expect(stderrAtExit).not.toContain(`[server] ${VERSION_LINE} started`);
  });

  it('SPEC-EGOV-CLI-ENTRY-006 引数なしで起動すると started を出し、SIGINT / SIGTERM のたびに接続を 1 回閉じる', async () => {
    const close = vi.fn(async () => {});
    const serveMock = await startEntry([], () => ({ close }));
    await vi.waitFor(() =>
      expect(splitLines(captured.stderr)).toContain(`[server] ${VERSION_LINE} started`)
    );
    expect(serveMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();

    const sigint = signalHandlers.get('SIGINT') ?? [];
    const sigterm = signalHandlers.get('SIGTERM') ?? [];
    expect(sigint.length).toBeGreaterThan(0);
    expect(sigterm.length).toBeGreaterThan(0);

    for (const h of sigint) h();
    expect(close).toHaveBeenCalledTimes(1);
    for (const h of sigterm) h();
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('SPEC-EGOV-CLI-ENTRY-007 起動中の想定外の例外は [server] fatal error の 1 行だけ出して exit 1', async () => {
    await startEntry([], () => {
      throw new Error('boom');
    });
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled());
    expect(exitSpy).toHaveBeenCalledWith(1);
    const errLines = splitLines(captured.stderr);
    expect(errLines).toEqual(['[server] fatal error']);
    expect(captured.stderr.join('')).not.toContain('boom');
  });

  it('SPEC-EGOV-CLI-ENTRY-007 DEBUG=1 のときは fatal error に続けてスタックトレースを出す', async () => {
    process.env.DEBUG = '1';
    await startEntry([], () => {
      throw new Error('boom');
    });
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled());
    expect(exitSpy).toHaveBeenCalledWith(1);
    const errLines = splitLines(captured.stderr);
    expect(errLines[0]).toBe('[server] fatal error');
    expect(errLines.length).toBeGreaterThan(1);
    expect(errLines.slice(1).join('\n')).toMatch(/Error: boom[\s\S]*\bat\b/);
  });

  it('SPEC-EGOV-CLI-ENTRY-007 DEBUG=true のときもスタックトレースを出す', async () => {
    process.env.DEBUG = 'true';
    await startEntry([], () => {
      throw new Error('boom');
    });
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled());
    expect(exitSpy).toHaveBeenCalledWith(1);
    const errLines = splitLines(captured.stderr);
    expect(errLines[0]).toBe('[server] fatal error');
    expect(errLines.slice(1).join('\n')).toContain('Error: boom');
  });
});
