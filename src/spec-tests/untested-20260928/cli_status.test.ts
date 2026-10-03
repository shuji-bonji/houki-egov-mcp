/**
 * 差分 20260928-untested-behaviors の受入テスト: cli_status
 *
 * 期待値の正本は specs/changes/20260928-untested-behaviors/specs/cli_status/spec.md。
 * 今日（日本時間）は vi.useFakeTimers({ toFake: ['Date'] }) で固定する。
 * HOUKI_EGOV_DB_PATH は import 時に読まれるので、設定してから CLI を動的 import する。
 * 件数の 3 桁区切りは約束にしていないので、1 桁の件数だけで確かめる。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSchema } from '../../db/schema.js';
import { ingestZip } from '../../services/bulk/ingester.js';
import { createMemoryZip } from '../../services/bulk/zip-reader.js';

const require = createRequire(import.meta.url);
const pkg = require('../../../package.json') as { name: string; version: string };

const HEADER =
  '法令種別,法令番号,法令名,法令名読み,旧法令名,公布日,改正法令名,改正法令番号,改正法令公布日,施行日,施行日備考,法令ID,本文URL,未施行';
const CSV_YOKIN =
  '法律,昭和四十六年法律第三十四号,預金保険法,よきんほけんほう,,昭和四十六年四月一日,,,昭和四十六年四月一日,昭和四十六年四月一日,,346AC0000000034,https://laws.e-gov.go.jp/law/346AC0000000034/19710401_000000000000000,';
const REV_YOKIN = '346AC0000000034_19710401_000000000000000';
/** 条 2 つの法令 */
const XML_YOKIN = `<?xml version="1.0" encoding="UTF-8"?>
<Law Era="Showa" Year="46" Num="034" LawType="Act" Lang="ja" PromulgateMonth="04" PromulgateDay="01">
  <LawNum>昭和四十六年法律第三十四号</LawNum>
  <LawBody>
    <LawTitle Kana="よきんほけんほう" Abbrev="預保法">預金保険法</LawTitle>
    <MainProvision>
      <Article Num="1">
        <ArticleTitle>第一条</ArticleTitle>
        <Paragraph Num="1"><ParagraphSentence><Sentence>この法律は、預金者等の保護を目的とする。</Sentence></ParagraphSentence></Paragraph>
      </Article>
      <Article Num="2">
        <ArticleTitle>第二条</ArticleTitle>
        <Paragraph Num="1"><ParagraphSentence><Sentence>第二条の本文。</Sentence></ParagraphSentence></Paragraph>
      </Article>
    </MainProvision>
  </LawBody>
</Law>`;

/** 日本時間 2026-05-09 の昼 */
const NOW_2026_05_09_JST = new Date('2026-05-09T03:00:00Z');

let stdoutChunks: string[];
let stderrChunks: string[];

function lines(chunks: string[]): string[] {
  return chunks
    .join('')
    .split(/\r|\n/)
    .filter((l) => l.length > 0);
}

const REAL_TMP = tmpdir();
let savedDbPath: string | undefined;
let savedXdg: string | undefined;
let root: string;

beforeEach(() => {
  savedDbPath = process.env.HOUKI_EGOV_DB_PATH;
  savedXdg = process.env.XDG_CACHE_HOME;
  root = mkdtempSync(join(REAL_TMP, 'td-cli-status-'));
  process.env.XDG_CACHE_HOME = join(root, 'xdg');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW_2026_05_09_JST);
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
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('--status は e-Gov に接続しない想定');
    })
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (savedDbPath === undefined) delete process.env.HOUKI_EGOV_DB_PATH;
  else process.env.HOUKI_EGOV_DB_PATH = savedDbPath;
  if (savedXdg === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = savedXdg;
  rmSync(root, { recursive: true, force: true });
});

/** 法令 1 件・条 2 件を取り込み、同期の状態を書いた DB を作る */
async function seedDb(
  dbPath: string,
  sync?: { lastSyncDate: string; lastFullDlAt: string }
): Promise<void> {
  const db = new Database(dbPath);
  try {
    initSchema(db);
    await ingestZip({
      db,
      zip: createMemoryZip([
        { path: 'all_law_list.csv', content: `﻿${HEADER}\r\n${CSV_YOKIN}\r\n` },
        { path: `${REV_YOKIN}/${REV_YOKIN}.xml`, content: XML_YOKIN },
      ]),
      source: 'all_xml',
      updateSyncState: false,
    });
    if (sync) {
      db.prepare(
        `INSERT INTO sync_state (id, last_sync_date, last_full_dl_at, total_laws, bulk_source)
         VALUES (1, ?, ?, 1, 'all_xml')`
      ).run(sync.lastSyncDate, sync.lastFullDlAt);
    }
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

const SYNC_HINT = '  差分を取り込むには --sync を実行してください';

describe('cli_status（差分 20260928-untested-behaviors）', () => {
  it('SPEC-EGOV-CLI-STATUS-005 版・DB の場所・件数と同期の欄を標準出力に出して exit 0、標準エラー出力は空', async () => {
    mkdirSync(join(root, 'x'));
    const dbPath = join(root, 'x', 'laws.db');
    await seedDb(dbPath, {
      lastSyncDate: '2026-05-08',
      lastFullDlAt: '2026-05-01T03:00:00.000Z',
    });
    const code = await runStatus(dbPath);

    expect(code).toBe(0);
    expect(lines(stdoutChunks)).toEqual([
      `[status] ${pkg.name} v${pkg.version}`,
      `  DB: ${dbPath}`,
      '  laws:     1 (版: 1)',
      '  articles: 2',
      '  sync:',
      '    last_sync_date:  2026-05-08',
      '    last_full_dl_at: 2026-05-01T03:00:00.000Z',
      '    days_since_sync: 1',
      '    staleness:       fresh',
      SYNC_HINT,
    ]);
    expect(lines(stderrChunks)).toEqual([]);
  });

  it('SPEC-EGOV-CLI-STATUS-005 同期の状態が無い空の DB なら件数 0 と未取り込みの 1 行で exit 0', async () => {
    // 0.19.0 から --status は DB を作らない（SPEC-EGOV-CLI-STATUS-010）ので、空の DB を先に作る
    mkdirSync(join(root, 'empty'));
    const dbPath = join(root, 'empty', 'laws.db');
    const empty = new Database(dbPath);
    initSchema(empty);
    empty.close();
    const code = await runStatus(dbPath);

    expect(code).toBe(0);
    expect(lines(stdoutChunks)).toEqual([
      `[status] ${pkg.name} v${pkg.version}`,
      `  DB: ${dbPath}`,
      '  laws:     0 (版: 0)',
      '  articles: 0',
      '  sync:     (まだ bulk DL されていません — --bulk-download-everything を実行)',
    ]);
    expect(lines(stderrChunks)).toEqual([]);
  });

  it('SPEC-EGOV-CLI-STATUS-006 SQLite でない中身のファイルは [ERROR] DB を開けません: file is not a database で exit 1', async () => {
    const dbPath = join(root, 'not-a-db.db');
    writeFileSync(dbPath, 'this is not a sqlite database file, just plain text.\n'.repeat(20));
    const code = await runStatus(dbPath);

    expect(code).toBe(1);
    expect(lines(stdoutChunks)).toEqual([
      `[status] ${pkg.name} v${pkg.version}`,
      `  DB: ${dbPath}`,
    ]);
    expect(lines(stderrChunks)).toEqual(['[ERROR] DB を開けません: file is not a database']);
  });

  it('SPEC-EGOV-CLI-STATUS-006 フォルダーを指定すると [ERROR] DB を開けません: unable to open database file で exit 1', async () => {
    const dbPath = join(root, 'a-directory');
    mkdirSync(dbPath);
    const code = await runStatus(dbPath);

    expect(code).toBe(1);
    expect(lines(stdoutChunks)).toEqual([
      `[status] ${pkg.name} v${pkg.version}`,
      `  DB: ${dbPath}`,
    ]);
    expect(lines(stderrChunks)).toEqual(['[ERROR] DB を開けません: unable to open database file']);
  });

  const hintCases: Array<{ lastSyncDate: string; staleness: string; days: number; hint: boolean }> =
    [
      { lastSyncDate: '2026-05-08', staleness: 'fresh', days: 1, hint: true },
      { lastSyncDate: '2026-04-20', staleness: 'stale', days: 19, hint: true },
      { lastSyncDate: '2026-05-09', staleness: 'fresh', days: 0, hint: false },
      { lastSyncDate: '2026-04-01', staleness: 'outdated', days: 38, hint: false },
    ];
  for (const c of hintCases) {
    it(`SPEC-EGOV-CLI-STATUS-007 last_sync_date ${c.lastSyncDate}（${c.staleness}、${c.days} 日）では --sync の案内を${c.hint ? '出す' : '出さない'}`, async () => {
      const dbPath = join(root, `laws-${c.lastSyncDate}.db`);
      await seedDb(dbPath, {
        lastSyncDate: c.lastSyncDate,
        lastFullDlAt: '2026-04-01T03:00:00.000Z',
      });
      const code = await runStatus(dbPath);

      expect(code).toBe(0);
      const out = lines(stdoutChunks);
      expect(out).toContain(`    days_since_sync: ${c.days}`);
      expect(out).toContain(`    staleness:       ${c.staleness}`);
      expect(out.includes(SYNC_HINT)).toBe(c.hint);
      if (c.hint) {
        // 同期の欄の後に出す
        expect(out.indexOf(SYNC_HINT)).toBeGreaterThan(
          out.indexOf(`    staleness:       ${c.staleness}`)
        );
      }
    });
  }
});
