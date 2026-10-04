/**
 * 差分 20261004-db-location の受入テスト: DB の場所の設定と案内のコマンド
 *
 * 期待値の正本は specs/changes/20261004-db-location/specs/{db_schema,common_errors}/spec.md。
 * - SPEC-EGOV-DB-SCHEMA-028（DB の場所の設定の名前と DB の絶対パス）
 * - SPEC-EGOV-DB-SCHEMA-029（案内のコマンドの形とシェルに書くパス）
 * - SPEC-EGOV-DB-SCHEMA-025（CLI のエラーの文のコマンド）
 * - SPEC-EGOV-COMMON-ERRORS-031（INTERNAL_ERROR の hint のコマンド）
 *
 * 環境変数（HOUKI_EGOV_DB_PATH・XDG_CACHE_HOME・HOME）は差し替え、vi.resetModules() の後に読み込む。
 * ホームディレクトリは一時ディレクトリの下か、ファイルを作らない場面では架空のパス（/home/example）にする。
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSchema } from '../../db/schema.js';
import {
  captureOutput,
  lines,
  type Output,
  runCliWith,
  seedVersionedDb,
  setupEnv,
  stubEgov,
  type TestEnv,
} from '../../test-helpers/cli-db-harness.js';
import { seedTestDb } from '../../test-helpers/law-db-fixture.js';

// biome-ignore lint/suspicious/noExplicitAny: 応答の形をテストで自由に辿るため
type AnyObj = Record<string, any>;

const NPX = 'npx -y @shuji-bonji/houki-egov-mcp@latest';
const FAKE_HOME = '/home/example';

let env: TestEnv;
let out: Output;

beforeEach(() => {
  env = setupEnv('td-db-location-');
  out = captureOutput();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  env.restore();
});

async function loadDb(): Promise<typeof import('../../db/index.js')> {
  vi.resetModules();
  return import('../../db/index.js');
}

/** 既定の場所（$HOME/.cache/houki-egov-mcp/laws.db）のフォルダーを作ってパスを返す */
function defaultLocation(): string {
  const dir = join(env.root, 'home', '.cache', 'houki-egov-mcp');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'laws.db');
}

describe('SPEC-EGOV-DB-SCHEMA-028 DB の場所の設定と DB の絶対パス', () => {
  it('SPEC-EGOV-DB-SCHEMA-028 HOUKI_EGOV_DB_PATH が相対パスなら、設定は HOUKI_EGOV_DB_PATH、絶対パスは作業フォルダーから決め、DB: の値はそのまま', async () => {
    process.env.HOUKI_EGOV_DB_PATH = 'dev/laws.db';
    vi.spyOn(process, 'cwd').mockReturnValue('/srv/work');
    const { resolveDbLocation } = await loadDb();
    const loc = resolveDbLocation();
    expect(loc.setting).toBe('HOUKI_EGOV_DB_PATH');
    expect(loc.absolutePath).toBe('/srv/work/dev/laws.db');
    expect(loc.path).toBe('dev/laws.db');
  });

  it('SPEC-EGOV-DB-SCHEMA-028 HOUKI_EGOV_DB_PATH が空文字で XDG_CACHE_HOME があれば、設定は XDG_CACHE_HOME', async () => {
    process.env.HOUKI_EGOV_DB_PATH = '';
    process.env.XDG_CACHE_HOME = '/data/cache';
    const { resolveDbLocation } = await loadDb();
    const loc = resolveDbLocation();
    expect(loc.setting).toBe('XDG_CACHE_HOME');
    expect(loc.absolutePath).toBe('/data/cache/houki-egov-mcp/laws.db');
  });

  it('SPEC-EGOV-DB-SCHEMA-028 XDG_CACHE_HOME が相対パスなら作業フォルダーから絶対パスにする', async () => {
    process.env.XDG_CACHE_HOME = 'cache';
    vi.spyOn(process, 'cwd').mockReturnValue('/srv/work');
    const { resolveDbLocation } = await loadDb();
    const loc = resolveDbLocation();
    expect(loc.setting).toBe('XDG_CACHE_HOME');
    expect(loc.absolutePath).toBe('/srv/work/cache/houki-egov-mcp/laws.db');
  });

  it('SPEC-EGOV-DB-SCHEMA-028 2 つの環境変数が無いか空文字なら、設定は「既定」で ~/.cache/houki-egov-mcp/laws.db', async () => {
    process.env.HOME = FAKE_HOME;
    for (const value of [undefined, '']) {
      if (value === undefined) {
        delete process.env.HOUKI_EGOV_DB_PATH;
        delete process.env.XDG_CACHE_HOME;
      } else {
        process.env.HOUKI_EGOV_DB_PATH = value;
        process.env.XDG_CACHE_HOME = value;
      }
      const { resolveDbLocation } = await loadDb();
      const loc = resolveDbLocation();
      expect(loc.setting, String(value)).toBe('既定');
      expect(loc.absolutePath, String(value)).toBe(`${FAKE_HOME}/.cache/houki-egov-mcp/laws.db`);
    }
  });
});

describe('SPEC-EGOV-DB-SCHEMA-029 案内のコマンド', () => {
  async function command(flag: string): Promise<string> {
    const { guideCommand } = await loadDb();
    return guideCommand(flag);
  }

  it('SPEC-EGOV-DB-SCHEMA-029 環境変数なしでは何も前に付けない', async () => {
    process.env.HOME = FAKE_HOME;
    expect(await command('--bulk-download-everything')).toBe(`${NPX} --bulk-download-everything`);
    expect(await command('--sync')).toBe(`${NPX} --sync`);
  });

  it('SPEC-EGOV-DB-SCHEMA-029 例の表のとおり（ホームの下は "$HOME/…"、外は \'…\'、特別な文字を含めば "$HOME"\'/…\'）', async () => {
    process.env.HOME = FAKE_HOME;
    const cases: Array<[Record<string, string>, string]> = [
      [
        { HOUKI_EGOV_DB_PATH: `${FAKE_HOME}/.cache/houki-egov-mcp/laws.dev.db` },
        `HOUKI_EGOV_DB_PATH="$HOME/.cache/houki-egov-mcp/laws.dev.db" ${NPX} --bulk-download-everything`,
      ],
      [
        { HOUKI_EGOV_DB_PATH: '/tmp/x/laws.db' },
        `HOUKI_EGOV_DB_PATH='/tmp/x/laws.db' ${NPX} --bulk-download-everything`,
      ],
      [
        { XDG_CACHE_HOME: `${FAKE_HOME}/Library/Caches` },
        `XDG_CACHE_HOME="$HOME/Library/Caches" ${NPX} --bulk-download-everything`,
      ],
      [
        { HOUKI_EGOV_DB_PATH: `${FAKE_HOME}/dev$1/laws.db` },
        `HOUKI_EGOV_DB_PATH="$HOME"'/dev$1/laws.db' ${NPX} --bulk-download-everything`,
      ],
    ];
    for (const [vars, expected] of cases) {
      delete process.env.HOUKI_EGOV_DB_PATH;
      delete process.env.XDG_CACHE_HOME;
      Object.assign(process.env, vars);
      expect(await command('--bulk-download-everything'), JSON.stringify(vars)).toBe(expected);
    }
  });

  it("SPEC-EGOV-DB-SCHEMA-029 残りの ' は '\\'' にし、ホームの外のパスの ' も同じ", async () => {
    process.env.HOME = FAKE_HOME;
    process.env.HOUKI_EGOV_DB_PATH = `${FAKE_HOME}/it's $x.db`;
    expect(await command('--sync')).toBe(
      `HOUKI_EGOV_DB_PATH="$HOME"'/it'\\''s $x.db' ${NPX} --sync`
    );
    process.env.HOUKI_EGOV_DB_PATH = "/tmp/it's/laws.db";
    expect(await command('--sync')).toBe(
      `HOUKI_EGOV_DB_PATH='/tmp/it'\\''s/laws.db' ${NPX} --sync`
    );
  });

  it('SPEC-EGOV-DB-SCHEMA-029 特別な文字（" $ ` \\ !）のどれかを含む残りは "$HOME"\'/…\' にする', async () => {
    process.env.HOME = FAKE_HOME;
    for (const ch of ['"', '$', '`', '\\', '!']) {
      process.env.HOUKI_EGOV_DB_PATH = `${FAKE_HOME}/a${ch}b/laws.db`;
      expect(await command('--sync'), ch).toBe(
        `HOUKI_EGOV_DB_PATH="$HOME"'/a${ch}b/laws.db' ${NPX} --sync`
      );
    }
  });

  it('SPEC-EGOV-DB-SCHEMA-029 ホームの判定は区切りの位置で比べ、ホームが / なら置き換えない', async () => {
    process.env.HOME = FAKE_HOME;
    process.env.HOUKI_EGOV_DB_PATH = `${FAKE_HOME}2/laws.db`;
    expect(await command('--sync')).toBe(
      `HOUKI_EGOV_DB_PATH='${FAKE_HOME}2/laws.db' ${NPX} --sync`
    );
    process.env.HOME = '/';
    process.env.HOUKI_EGOV_DB_PATH = '/x/laws.db';
    expect(await command('--sync')).toBe(`HOUKI_EGOV_DB_PATH='/x/laws.db' ${NPX} --sync`);
  });

  it('SPEC-EGOV-DB-SCHEMA-029 相対パスの HOUKI_EGOV_DB_PATH は DB の絶対パスを前に付ける', async () => {
    process.env.HOME = FAKE_HOME;
    process.env.HOUKI_EGOV_DB_PATH = 'dev/laws.db';
    vi.spyOn(process, 'cwd').mockReturnValue(`${FAKE_HOME}/work`);
    expect(await command('--sync')).toBe(
      `HOUKI_EGOV_DB_PATH="$HOME/work/dev/laws.db" ${NPX} --sync`
    );
  });

  it('SPEC-EGOV-DB-SCHEMA-029 前に付けた変数は sh でそのまま元の絶対パスに展開される', async () => {
    const home = join(env.root, 'h o m e');
    const paths = [
      `${home}/.cache/houki-egov-mcp/laws.dev.db`,
      `${home}/dev$1/laws.db`,
      `${home}/it's "q" \`b\` \\ !.db`,
      "/tmp/it's $x/laws.db",
    ];
    for (const p of paths) {
      process.env.HOME = home;
      process.env.HOUKI_EGOV_DB_PATH = p;
      const cmd = await command('--sync');
      const prefix = cmd.slice(0, cmd.indexOf(` ${NPX}`));
      const r = spawnSync('sh', ['-c', `${prefix} printenv HOUKI_EGOV_DB_PATH`], {
        env: { PATH: process.env.PATH, HOME: home },
        encoding: 'utf-8',
      });
      expect(r.stdout, p).toBe(`${p}\n`);
    }
  });
});

describe('SPEC-EGOV-DB-SCHEMA-025 CLI のエラーの文のコマンド', () => {
  it('SPEC-EGOV-DB-SCHEMA-025 環境変数なしで版 2 の DB に --sync を実行すると、古い版の文のコマンドは npx の形', async () => {
    const dbPath = defaultLocation();
    seedVersionedDb(dbPath, '2');
    stubEgov({ head: 200, days: {} });
    expect((await runCliWith(['--sync'])).exitCode).toBe(1);
    expect(lines(out.stderr).at(-1)).toBe(
      `[ERROR] DB の版 (2) が古いため使えません。${NPX} --bulk-download-everything で作り直してください（取り込んだ中身は消え、全件の zip 約 290 MB を取り直します）`
    );
  });

  it('SPEC-EGOV-DB-SCHEMA-025 HOUKI_EGOV_DB_PATH で決めた版 2 の DB では、コマンドの前に同じ変数を付ける', async () => {
    const dbPath = join(env.root, 'db', 'laws.db');
    mkdirSync(join(env.root, 'db'));
    seedVersionedDb(dbPath, '2');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    expect((await runCliWith(['--status'])).exitCode).toBe(1);
    expect(lines(out.stderr).at(-1)).toBe(
      `[ERROR] DB の版 (2) が古いため使えません。HOUKI_EGOV_DB_PATH='${dbPath}' ${NPX} --bulk-download-everything で作り直してください（取り込んだ中身は消え、全件の zip 約 290 MB を取り直します）`
    );
  });

  it('SPEC-EGOV-DB-SCHEMA-025 読めない版の文は DB ファイル (<DB: の行と同じ>) と npx の形のコマンド', async () => {
    const dbPath = join(env.root, 'db', 'laws.db');
    mkdirSync(join(env.root, 'db'));
    seedVersionedDb(dbPath, 'abc');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    expect((await runCliWith(['--status'])).exitCode).toBe(1);
    expect(lines(out.stderr).at(-1)).toBe(
      `[ERROR] DB の版を読めないため (schema_version: abc)、DB を変更しません。DB ファイル (${dbPath}) を消してから HOUKI_EGOV_DB_PATH='${dbPath}' ${NPX} --bulk-download-everything を実行してください`
    );
  });

  it('SPEC-EGOV-DB-SCHEMA-025 新しい版の文は今までどおり（コマンドを含まない）', async () => {
    const dbPath = defaultLocation();
    seedVersionedDb(dbPath, '4');
    expect((await runCliWith(['--status'])).exitCode).toBe(1);
    expect(lines(out.stderr).at(-1)).toBe(
      '[ERROR] DB の版 (4) がこの houki-egov-mcp の版 (3) より新しいため、DB を変更しません。houki-egov-mcp を新しい版に更新するか、HOUKI_EGOV_DB_PATH で別のファイルを指定してください'
    );
  });

  it('SPEC-EGOV-DB-SCHEMA-025 --bulk-download-everything の読めない版の文も npx の形で、zip を取得しない', async () => {
    const dbPath = defaultLocation();
    seedVersionedDb(dbPath, 'x1');
    const egov = stubEgov({ head: 200 });
    expect((await runCliWith(['--bulk-download-everything'])).exitCode).toBe(1);
    expect(lines(out.stderr)).toContain(
      `[ERROR] DB の版を読めないため (schema_version: x1)、DB を変更しません。DB ファイル (${dbPath}) を消してから ${NPX} --bulk-download-everything を実行してください`
    );
    expect(egov.zipCalls()).toEqual([]);
  });
});

describe('SPEC-EGOV-COMMON-ERRORS-031 同期の記録の日付を読めないときの hint', () => {
  async function seedBadSync(dbPath: string, value: string): Promise<void> {
    const db = new Database(dbPath);
    try {
      initSchema(db);
      await seedTestDb(db);
      db.prepare(
        `INSERT INTO sync_state (id, last_sync_date, last_full_dl_at, total_laws)
         VALUES (1, ?, '2026-05-01T03:00:00+09:00', 3)
         ON CONFLICT(id) DO UPDATE SET last_sync_date = excluded.last_sync_date`
      ).run(value);
    } finally {
      db.close();
    }
  }

  async function search(keyword: string): Promise<AnyObj> {
    vi.resetModules();
    const { handleSearchFulltext } = await import('../../tools/handlers.js');
    return (await handleSearchFulltext({ keyword })) as AnyObj;
  }

  it('SPEC-EGOV-COMMON-ERRORS-031 環境変数なしで起動した search_fulltext の hint は npx の形のコマンドを含む', async () => {
    await seedBadSync(defaultLocation(), '2026/05/08');
    const r = await search('軽減税率');
    expect(r.code).toBe('INTERNAL_ERROR');
    expect(r.retryable).toBe(false);
    expect(r.error).toContain('2026/05/08');
    expect(r.hint).toContain(`${NPX} --bulk-download-everything`);
    expect(r.hint).not.toContain('HOUKI_EGOV_DB_PATH');
    expect(r).not.toHaveProperty('hits');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-035 hint は `<コマンド>` で全件を取り込み直し、同期の記録を作り直してください', async () => {
    await seedBadSync(defaultLocation(), '2026/05/08');
    const r = await search('軽減税率');
    expect(r.hint).toBe(
      `\`${NPX} --bulk-download-everything\` で全件を取り込み直し、同期の記録を作り直してください`
    );
  });

  it('SPEC-EGOV-COMMON-ERRORS-031 HOUKI_EGOV_DB_PATH で起動したときは hint のコマンドに同じ変数を付ける', async () => {
    const dbPath = join(env.root, 'bad.db');
    await seedBadSync(dbPath, '2026/05/08');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    const r = await search('軽減税率');
    expect(r.hint).toContain(`HOUKI_EGOV_DB_PATH='${dbPath}' ${NPX} --bulk-download-everything`);
  });

  it('SPEC-EGOV-COMMON-ERRORS-031 --status の [ERROR] のコマンドも npx の形', async () => {
    await seedBadSync(defaultLocation(), '2026/05/08');
    expect((await runCliWith(['--status'])).exitCode).toBe(1);
    expect(lines(out.stderr)).toContain(
      `[ERROR] 同期の記録を読めません: 2026/05/08（${NPX} --bulk-download-everything で作り直してください）`
    );
  });
});
