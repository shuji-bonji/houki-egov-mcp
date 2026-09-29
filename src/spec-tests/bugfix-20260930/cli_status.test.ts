/**
 * 受入テスト: cli_status（差分 20260930-bugfix-batch の ADDED、houki-egov-mcp #74）
 *
 * 期待値の正本は specs/changes/20260930-bugfix-batch/specs/cli_status/spec.md。
 * 環境の言語設定は、テストの中で変えられないので、Number.prototype.toLocaleString の
 * 既定の言語を de-DE（桁の区切りが `.`）に差し替えて、区切りが `,` のままであることを確かめる。
 * HOUKI_EGOV_DB_PATH は import 時に読まれるので、設定してから CLI を動的 import する。
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSchema } from '../../db/schema.js';

let stdoutChunks: string[];
let stderrChunks: string[];

function lines(chunks: string[]): string[] {
  return chunks
    .join('')
    .split(/\r|\n/)
    .filter((l) => l.length > 0);
}

let savedDbPath: string | undefined;
let savedXdg: string | undefined;
let root: string;

beforeEach(() => {
  savedDbPath = process.env.HOUKI_EGOV_DB_PATH;
  savedXdg = process.env.XDG_CACHE_HOME;
  root = mkdtempSync(join(tmpdir(), 'td-cli-status-sep-'));
  process.env.XDG_CACHE_HOME = join(root, 'xdg');
  stdoutChunks = [];
  stderrChunks = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdoutChunks.push(`${args.map(String).join(' ')}\n`);
  });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderrChunks.push(`${args.map(String).join(' ')}\n`);
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('--status は e-Gov に接続しない想定');
    })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (savedDbPath === undefined) delete process.env.HOUKI_EGOV_DB_PATH;
  else process.env.HOUKI_EGOV_DB_PATH = savedDbPath;
  if (savedXdg === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = savedXdg;
  rmSync(root, { recursive: true, force: true });
});

/** 法令の行を lawsCount 件、条の行を articlesCount 件入れた DB を作る（同期の状態は無し） */
function seedCounts(dbPath: string, lawsCount: number, articlesCount: number): void {
  const db = new Database(dbPath);
  try {
    initSchema(db);
    const insertLaw = db.prepare(
      `INSERT INTO laws (law_revision_id, law_id, law_type, law_num, law_title, promulgation_date,
         current_revision_status, repeal_status, updated, fetched_at, content_hash)
       VALUES (?, ?, 'Act', ?, ?, '2000-01-01', 'CurrentEnforced', 'None', '2000-01-01', '2000-01-01', ?)`
    );
    const insertArticle = db.prepare(
      `INSERT INTO articles (law_revision_id, article_num, ord, body, body_raw) VALUES (?, ?, ?, ?, ?)`
    );
    db.transaction(() => {
      for (let i = 0; i < lawsCount; i++) {
        const lawId = `500AC${String(i).padStart(10, '0')}`;
        insertLaw.run(`${lawId}_20000101_000000000000000`, lawId, `法律第${i}号`, `テスト法${i}`, `h${i}`);
      }
      const firstRev = '500AC0000000000_20000101_000000000000000';
      for (let i = 0; i < articlesCount; i++) {
        insertArticle.run(firstRev, String(i + 1), i + 1, `第${i + 1}条の本文`, `第${i + 1}条の本文`);
      }
    })();
  } finally {
    db.close();
  }
}

async function runStatus(dbPath: string): Promise<number> {
  process.env.HOUKI_EGOV_DB_PATH = dbPath;
  vi.resetModules();
  const { runCli } = await import('../../cli/index.js');
  const result = await runCli(['node', 'index.js', '--status']);
  return result.exitCode;
}

/** 既定の言語設定を locale に差し替える（引数で言語を渡した呼び出しはそのまま） */
function stubDefaultLocale(locale: string): void {
  const original = Number.prototype.toLocaleString;
  vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (
    this: number,
    locales?: Intl.LocalesArgument,
    options?: Intl.NumberFormatOptions
  ) {
    return original.call(this, locales ?? locale, options);
  });
}

describe('cli_status — 件数の区切り（差分 20260930-bugfix-batch）', () => {
  it('SPEC-EGOV-CLI-STATUS-008 既定の言語設定が de-DE でも laws: 1,234 と articles: 5 を出す', async () => {
    const dbPath = join(root, 'laws.db');
    seedCounts(dbPath, 1234, 5);
    stubDefaultLocale('de-DE');
    // 差し替えが効いていることの確認（既定の言語設定では 1.234 になる）
    expect((1234).toLocaleString()).toBe('1.234');

    const code = await runStatus(dbPath);

    expect(code).toBe(0);
    const out = lines(stdoutChunks);
    expect(out).toContain('  laws:     1,234');
    expect(out).toContain('  articles: 5');
    expect(lines(stderrChunks)).toEqual([]);
  });

  it('SPEC-EGOV-CLI-STATUS-008 既定の言語設定が en-US でも laws: 1,234 と articles: 5 を出す', async () => {
    const dbPath = join(root, 'laws.db');
    seedCounts(dbPath, 1234, 5);
    stubDefaultLocale('en-US');

    const code = await runStatus(dbPath);

    expect(code).toBe(0);
    const out = lines(stdoutChunks);
    expect(out).toContain('  laws:     1,234');
    expect(out).toContain('  articles: 5');
  });

  it('SPEC-EGOV-CLI-STATUS-008 1,000 未満の件数は区切りなし', async () => {
    const dbPath = join(root, 'laws.db');
    seedCounts(dbPath, 999, 3);
    stubDefaultLocale('de-DE');

    const code = await runStatus(dbPath);

    expect(code).toBe(0);
    const out = lines(stdoutChunks);
    expect(out).toContain('  laws:     999');
    expect(out).toContain('  articles: 3');
  });
});
