/**
 * 差分 20261004-db-location の受入テスト: search_fulltext
 *
 * 期待値の正本は specs/changes/20261004-db-location/specs/search_fulltext/spec.md。
 * - ADDED: SPEC-EGOV-SEARCH-FULLTEXT-042（応答のパスの ~）・043（freshness.db_path）・044（note と next_actions の表）
 * - MODIFIED: SPEC-EGOV-SEARCH-FULLTEXT-002・023・027・035・039・040
 *
 * DB の場所は環境変数（HOUKI_EGOV_DB_PATH・XDG_CACHE_HOME・HOME）で決め、vi.resetModules() の後にハンドラーを読み込む。
 * HOME は一時ディレクトリの下（<root>/home）にし、利用者の ~/.cache には触れない。
 * e-Gov の法令検索（search_law への切り替え先）は fetch を差し替えて 0 件を返す。
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSchema } from '../../db/schema.js';
import { ingestZip } from '../../services/bulk/ingester.js';
import { createMemoryZip } from '../../services/bulk/zip-reader.js';
import {
  CSV_YOKIN,
  captureOutput,
  csvText,
  REV_YOKIN,
  seedVersionedDb,
  setupEnv,
  snapshot,
  type TestEnv,
  XML_YOKIN,
} from '../../test-helpers/cli-db-harness.js';

// biome-ignore lint/suspicious/noExplicitAny: 応答の形をテストで自由に辿るため
type AnyObj = Record<string, any>;

const NPX = 'npx -y @shuji-bonji/houki-egov-mcp@latest';
const FALLBACK = '、search_law (法令名のタイトル一致) にフォールバックしています。';
const BULK_REASON =
  'CLI でローカル bulk DB を構築すると search_fulltext が SQLite FTS5 で動作します';
const NULL_FRESHNESS = {
  last_sync_date: null,
  last_full_dl_at: null,
  staleness: null,
  days_since_sync: null,
  db_path: null,
};

let env: TestEnv;
let home: string;

beforeEach(() => {
  env = setupEnv('td-db-location-sf-');
  home = join(env.root, 'home');
  captureOutput();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ total_count: 0, count: 0, laws: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    )
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  env.restore();
});

async function search(keyword: string): Promise<AnyObj> {
  vi.resetModules();
  const { handleSearchFulltext } = await import('../../tools/handlers.js');
  return (await handleSearchFulltext({ keyword })) as AnyObj;
}

/** 既定の場所（$HOME/.cache/houki-egov-mcp/laws.db）のフォルダーを作ってパスを返す */
function defaultDb(): string {
  const dir = join(home, '.cache', 'houki-egov-mcp');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'laws.db');
}

/** 版 3 の DB に預金保険法を取り込む。lastSyncDate を渡せば同期の記録も書く */
async function seedCurrent(dbPath: string, lastSyncDate?: string): Promise<void> {
  const db = new Database(dbPath);
  try {
    initSchema(db);
    await ingestZip({
      db,
      zip: createMemoryZip([
        { path: 'all_law_list.csv', content: csvText([CSV_YOKIN]) },
        { path: `${REV_YOKIN}/${REV_YOKIN}.xml`, content: XML_YOKIN },
      ]),
      source: 'all_xml',
      updateSyncState: false,
    });
    if (lastSyncDate) {
      db.prepare(
        `INSERT INTO sync_state (id, last_sync_date, last_full_dl_at, total_laws, bulk_source)
         VALUES (1, ?, '2026-10-03T19:19:36.391Z', 1, 'all_xml')`
      ).run(lastSyncDate);
    }
  } finally {
    db.close();
  }
}

/** 版 3 のテーブルだけを作る（条が 0 件） */
function seedEmptyCurrent(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    initSchema(db);
  } finally {
    db.close();
  }
}

describe('SPEC-EGOV-SEARCH-FULLTEXT-042 応答の DB のパスはホームディレクトリを ~ にする', () => {
  it('SPEC-EGOV-SEARCH-FULLTEXT-042 既定の場所の DB は ~/.cache/houki-egov-mcp/laws.db', async () => {
    await seedCurrent(defaultDb(), '2026-10-04');
    const r = await search('預金者等の保護');
    expect(r.source).toBe('bulk');
    expect(r.freshness.db_path).toBe('~/.cache/houki-egov-mcp/laws.db');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-042 ホームディレクトリの外はそのまま、区切りの位置で比べる（<ホーム>2/laws.db は置き換えない）', async () => {
    const outside = join(env.root, 'x', 'laws.db');
    mkdirSync(join(env.root, 'x'));
    await seedCurrent(outside, '2026-10-04');
    process.env.HOUKI_EGOV_DB_PATH = outside;
    expect((await search('預金者等の保護')).freshness.db_path).toBe(outside);

    const sibling = `${home}2/laws.db`;
    mkdirSync(`${home}2`);
    await seedCurrent(sibling, '2026-10-04');
    process.env.HOUKI_EGOV_DB_PATH = sibling;
    expect((await search('預金者等の保護')).freshness.db_path).toBe(sibling);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-042 ホームディレクトリの下の HOUKI_EGOV_DB_PATH も ~ に置き換える', async () => {
    const dbPath = join(home, 'dev', 'laws.dev.db');
    mkdirSync(join(home, 'dev'), { recursive: true });
    await seedCurrent(dbPath, '2026-10-04');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    expect((await search('預金者等の保護')).freshness.db_path).toBe('~/dev/laws.dev.db');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-042 ホームディレクトリが / なら置き換えない', async () => {
    const dbPath = join(env.root, 'laws.db');
    await seedCurrent(dbPath, '2026-10-04');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    process.env.HOME = '/';
    expect((await search('預金者等の保護')).freshness.db_path).toBe(dbPath);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-042 note の中のパスも ~ に置き換える', async () => {
    defaultDb();
    const r = await search('消費税法');
    expect(
      r.note.startsWith(`ローカル DB (~/.cache/houki-egov-mcp/laws.db) が無いため${FALLBACK}`)
    ).toBe(true);
  });
});

describe('SPEC-EGOV-SEARCH-FULLTEXT-043 freshness は常にオブジェクトで db_path を持つ', () => {
  it('SPEC-EGOV-SEARCH-FULLTEXT-043 同期の記録がある DB を引くと 5 つのキー（warning は outdated のときだけ）', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-04T03:00:00.000Z'));
    await seedCurrent(defaultDb(), '2026-10-04');
    const r = await search('預金者等の保護');
    expect(r.freshness).toEqual({
      last_sync_date: '2026-10-04',
      last_full_dl_at: '2026-10-03T19:19:36.391Z',
      staleness: 'fresh',
      days_since_sync: 0,
      db_path: '~/.cache/houki-egov-mcp/laws.db',
    });
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-043 HOUKI_EGOV_DB_PATH=/…/x/laws.db で同じ DB を引くと db_path はその絶対パス', async () => {
    const dbPath = join(env.root, 'x', 'laws.db');
    mkdirSync(join(env.root, 'x'));
    await seedCurrent(dbPath, '2026-10-04');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    expect((await search('預金者等の保護')).freshness.db_path).toBe(dbPath);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-043 sync_state に行が無い DB では鮮度の 4 つが null、db_path は DB のパス', async () => {
    await seedCurrent(defaultDb());
    const r = await search('預金者等の保護');
    expect(r.source).toBe('bulk');
    expect(r.freshness).toEqual({
      last_sync_date: null,
      last_full_dl_at: null,
      staleness: null,
      days_since_sync: null,
      db_path: '~/.cache/houki-egov-mcp/laws.db',
    });
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-043 DB が無いときの応答でも freshness を置き、5 つとも null', async () => {
    defaultDb();
    const r = await search('消費税法');
    expect(r.source).toBe('api-fallback');
    expect(r.freshness).toEqual(NULL_FRESHNESS);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-043 版が合わない・開けない DB の応答でも freshness の 5 つは null', async () => {
    const dbPath = defaultDb();
    seedVersionedDb(dbPath, '2');
    expect((await search('消費税法')).freshness).toEqual(NULL_FRESHNESS);
    process.env.HOUKI_EGOV_DB_PATH = env.root;
    expect((await search('消費税法')).freshness).toEqual(NULL_FRESHNESS);
  });
});

describe('SPEC-EGOV-SEARCH-FULLTEXT-044 search_law に切り替えたときの note と next_actions', () => {
  const buildRemedy = (cmd: string) =>
    `条文本文の全文検索を有効にするには \`${cmd}\` でローカル DB を構築してください`;
  const bulkAction = (cmd: string) => ({
    action: 'bulk_download_everything',
    reason: BULK_REASON,
    example: { command: cmd },
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-044 ファイルが無い（既定）: ローカル DB (<パス>) が無いため', async () => {
    defaultDb();
    const r = await search('消費税法');
    const cmd = `${NPX} --bulk-download-everything`;
    expect(r.note).toBe(
      `ローカル DB (~/.cache/houki-egov-mcp/laws.db) が無いため${FALLBACK}${buildRemedy(cmd)}`
    );
    expect(r.next_actions).toHaveLength(2);
    expect(r.next_actions[0]).toEqual(bulkAction(cmd));
    expect(r.next_actions[1].action).toBe('search_law');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-044 ファイルが無い（XDG_CACHE_HOME）: 既定と同じ文で、コマンドに XDG_CACHE_HOME を付ける', async () => {
    const xdg = join(env.root, 'xdg');
    process.env.XDG_CACHE_HOME = xdg;
    const r = await search('消費税法');
    const cmd = `XDG_CACHE_HOME='${xdg}' ${NPX} --bulk-download-everything`;
    expect(r.note).toBe(
      `ローカル DB (${xdg}/houki-egov-mcp/laws.db) が無いため${FALLBACK}${buildRemedy(cmd)}`
    );
    expect(r.next_actions[0]).toEqual(bulkAction(cmd));
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-044 ファイルが無い（HOUKI_EGOV_DB_PATH）: HOUKI_EGOV_DB_PATH が指すファイル (<パス>) が無いため', async () => {
    const dbPath = join(env.root, 'none', 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    const r = await search('消費税法');
    const cmd = `HOUKI_EGOV_DB_PATH='${dbPath}' ${NPX} --bulk-download-everything`;
    expect(r.note).toBe(
      `HOUKI_EGOV_DB_PATH が指すファイル (${dbPath}) が無いため${FALLBACK}条文本文の全文検索を有効にするには、HOUKI_EGOV_DB_PATH を作ってある DB のファイルに直すか、\`${cmd}\` でこのパスにローカル DB を構築してください`
    );
    expect(r.next_actions).toHaveLength(2);
    expect(r.next_actions[0]).toEqual(bulkAction(cmd));
    expect(r.next_actions[1].action).toBe('search_law');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-044 HOUKI_EGOV_DB_PATH が ~/.cache/houki-egov-mcp/laws.v3.db（無いファイル）を指すときの例', async () => {
    defaultDb();
    process.env.HOUKI_EGOV_DB_PATH = join(home, '.cache', 'houki-egov-mcp', 'laws.v3.db');
    const r = await search('消費税法');
    expect(
      r.note.startsWith(
        `HOUKI_EGOV_DB_PATH が指すファイル (~/.cache/houki-egov-mcp/laws.v3.db) が無いため${FALLBACK}`
      )
    ).toBe(true);
    expect(r.next_actions[0].example.command).toBe(
      `HOUKI_EGOV_DB_PATH="$HOME/.cache/houki-egov-mcp/laws.v3.db" ${NPX} --bulk-download-everything`
    );
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-044 版の記録が無い・条が 0 件: ローカル DB (<パス>) にまだ法令が取り込まれていないため', async () => {
    const cmd = `${NPX} --bulk-download-everything`;
    const dbPath = defaultDb();
    writeFileSync(dbPath, '');
    const noVersion = await search('消費税法');
    expect(noVersion.note).toBe(
      `ローカル DB (~/.cache/houki-egov-mcp/laws.db) にまだ法令が取り込まれていないため${FALLBACK}${buildRemedy(cmd)}`
    );
    expect(noVersion.next_actions[0]).toEqual(bulkAction(cmd));

    const empty = join(env.root, 'empty.db');
    seedEmptyCurrent(empty);
    process.env.HOUKI_EGOV_DB_PATH = empty;
    const noArticles = await search('消費税法');
    const houkiCmd = `HOUKI_EGOV_DB_PATH='${empty}' ${NPX} --bulk-download-everything`;
    expect(noArticles.note).toBe(
      `ローカル DB (${empty}) にまだ法令が取り込まれていないため${FALLBACK}${buildRemedy(houkiCmd)}`
    );
    expect(noArticles.next_actions[0]).toEqual(bulkAction(houkiCmd));
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-044 版が古い: ローカル DB (<パス>) の版 (<DB の版>) がこの houki-egov-mcp (3) より古いため', async () => {
    seedVersionedDb(defaultDb(), '2');
    const r = await search('消費税法');
    const cmd = `${NPX} --bulk-download-everything`;
    expect(r.note).toBe(
      `ローカル DB (~/.cache/houki-egov-mcp/laws.db) の版 (2) がこの houki-egov-mcp (3) より古いため${FALLBACK}条文本文の全文検索を有効にするには \`${cmd}\` でローカル DB を作り直してください（取り込んだ中身は消え、全件の zip 約 290 MB を取り直します）`
    );
    expect(r.next_actions[0]).toEqual(bulkAction(cmd));
    expect(r.next_actions[1].action).toBe('search_law');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-044 版が新しい: 更新を案内し、next_actions は search_law の 1 件だけ', async () => {
    seedVersionedDb(defaultDb(), '4');
    const r = await search('消費税法');
    expect(r.note).toBe(
      `ローカル DB (~/.cache/houki-egov-mcp/laws.db) の版 (4) がこの houki-egov-mcp (3) より新しいため${FALLBACK}条文本文の全文検索を有効にするには houki-egov-mcp を新しい版に更新してください（DB は変更していません）`
    );
    expect(r.next_actions.map((a: AnyObj) => a.action)).toEqual(['search_law']);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-044 版を読めない: DB ファイル (<パス>) を消してから <コマンド>、next_actions は search_law の 1 件だけ', async () => {
    seedVersionedDb(defaultDb(), 'abc');
    const r = await search('消費税法');
    expect(r.note).toBe(
      `ローカル DB (~/.cache/houki-egov-mcp/laws.db) の版を読めないため (schema_version: abc)${FALLBACK}条文本文の全文検索を有効にするには DB ファイル (~/.cache/houki-egov-mcp/laws.db) を消してから \`${NPX} --bulk-download-everything\` を実行してください（DB は変更していません）`
    );
    expect(r.next_actions.map((a: AnyObj) => a.action)).toEqual(['search_law']);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-044 開けない: DB を作るコマンドを案内せず、next_actions は search_law の 1 件だけ', async () => {
    const dir = join(env.root, 'd');
    mkdirSync(dir);
    process.env.HOUKI_EGOV_DB_PATH = dir;
    const r = await search('消費税法');
    expect(r.note).toBe(
      `ローカル DB (${dir}) を開けなかったため${FALLBACK}条文本文の全文検索を有効にするには、このパスがフォルダーを指していないか、途中に普通のファイルが無いか、読む権限があるかを確かめてください（HOUKI_EGOV_DB_PATH を設定しているときはその値を直します）`
    );
    expect(r.note).not.toContain('--bulk-download-everything');
    expect(r.next_actions.map((a: AnyObj) => a.action)).toEqual(['search_law']);
  });
});

describe('search_fulltext の MODIFIED（差分 20261004-db-location）', () => {
  it('SPEC-EGOV-SEARCH-FULLTEXT-002 条が無い DB では api-fallback、note にパス、example.command は npx の形、freshness.db_path は null', async () => {
    seedEmptyCurrent(defaultDb());
    const r = await search('消費税法');
    expect(r.source).toBe('api-fallback');
    expect(
      r.note.startsWith(
        `ローカル DB (~/.cache/houki-egov-mcp/laws.db) にまだ法令が取り込まれていないため、`
      )
    ).toBe(true);
    expect(r.note).toContain('--bulk-download-everything');
    expect(r.next_actions[0].action).toBe('bulk_download_everything');
    expect(r.next_actions[0].example.command).toBe(`${NPX} --bulk-download-everything`);
    expect(r.next_actions[1].action).toBe('search_law');
    expect(r.freshness.db_path).toBeNull();
    expect(r).toHaveProperty('fallback');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-023 outdated の warning のコマンドは --sync を付けた案内のコマンド', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-09T03:00:00.000Z'));
    await seedCurrent(defaultDb(), '2026-04-01');
    const r = await search('預金者等の保護');
    expect(r.freshness.staleness).toBe('outdated');
    expect(r.freshness.days_since_sync).toBe(38);
    expect(r.freshness.warning).toBe(
      `bulk DB が 38 日前のデータです。最新化するには \`${NPX} --sync\` (最終同期から 90 日を超えていれば \`--bulk-download-everything\`) を実行してください`
    );
    expect(r.freshness.db_path).toBe('~/.cache/houki-egov-mcp/laws.db');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-023 HOUKI_EGOV_DB_PATH で起動したときは warning のコマンドに同じ変数を付ける', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-09T03:00:00.000Z'));
    process.env.HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS = '60';
    const dbPath = join(env.root, 'laws.db');
    await seedCurrent(dbPath, '2026-04-01');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    const r = await search('預金者等の保護');
    expect(r.freshness.warning).toBe(
      `bulk DB が 38 日前のデータです。最新化するには \`HOUKI_EGOV_DB_PATH='${dbPath}' ${NPX} --sync\` (最終同期から 60 日を超えていれば \`--bulk-download-everything\`) を実行してください`
    );
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-027 普通のファイルの下のパスでは、開けなかったための note で --bulk-download-everything を含まず、next_actions は search_law の 1 件', async () => {
    writeFileSync(join(env.root, 'afile'), 'x');
    const dbPath = join(env.root, 'afile', 'x.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    const r = await search('消費税法');
    expect(r.source).toBe('api-fallback');
    expect(r.note.startsWith(`ローカル DB (${dbPath}) を開けなかったため${FALLBACK}`)).toBe(true);
    expect(r.note).not.toContain('--bulk-download-everything');
    expect(r.next_actions).toHaveLength(1);
    expect(r.next_actions[0].action).toBe('search_law');
    expect(r.freshness).toEqual(NULL_FRESHNESS);
    expect(r).toHaveProperty('fallback');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-035 sync_state に行が無い DB ではエラーにせず、鮮度の 4 つが null の freshness で hits を返す', async () => {
    await seedCurrent(defaultDb());
    const r = await search('預金者等の保護');
    expect(r.source).toBe('bulk');
    expect(Array.isArray(r.hits)).toBe(true);
    expect(r.freshness.last_sync_date).toBeNull();
    expect(r.freshness.db_path).toBe('~/.cache/houki-egov-mcp/laws.db');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-039 無いフォルダーの下の HOUKI_EGOV_DB_PATH では作らずに、HOUKI_EGOV_DB_PATH が指すファイルが無いための note', async () => {
    mkdirSync(join(env.root, 'empty'));
    const dbPath = join(env.root, 'empty', 'a', 'laws.db');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    const r = await search('消費税法');
    expect(r.source).toBe('api-fallback');
    expect(r.note.startsWith(`HOUKI_EGOV_DB_PATH が指すファイル (${dbPath}) が無いため`)).toBe(
      true
    );
    expect(r.next_actions[0].action).toBe('bulk_download_everything');
    expect(r.next_actions[0].example.command).toBe(
      `HOUKI_EGOV_DB_PATH='${dbPath}' ${NPX} --bulk-download-everything`
    );
    expect(existsSync(join(env.root, 'empty', 'a'))).toBe(false);
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-039 0 バイトのファイルでは、まだ法令が取り込まれていないための note で、ファイルに書き込まない', async () => {
    const dbPath = join(env.root, 'zero.db');
    writeFileSync(dbPath, '');
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    const r = await search('消費税法');
    expect(r.note.startsWith(`ローカル DB (${dbPath}) にまだ法令が取り込まれていないため`)).toBe(
      true
    );
    const db = new Database(dbPath, { readonly: true });
    try {
      expect(db.prepare('SELECT name FROM sqlite_master').all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-040 版 2 の DB は使わず、パスを含む古い版の note で作り直しを案内し、版は 2 のまま', async () => {
    const dbPath = defaultDb();
    seedVersionedDb(dbPath, '2');
    const r = await search('適格請求書');
    expect(r.source).toBe('api-fallback');
    expect(
      r.note.startsWith(
        'ローカル DB (~/.cache/houki-egov-mcp/laws.db) の版 (2) がこの houki-egov-mcp (3) より古いため、'
      )
    ).toBe(true);
    expect(r.note).toContain(`${NPX} --bulk-download-everything`);
    expect(r.next_actions[0].action).toBe('bulk_download_everything');
    expect(snapshot(dbPath).schemaVersion).toBe('2');
  });

  it('SPEC-EGOV-SEARCH-FULLTEXT-040 版 4 の DB はパスを含む新しい版の note で、next_actions は search_law の 1 件', async () => {
    seedVersionedDb(defaultDb(), '4');
    const r = await search('適格請求書');
    expect(
      r.note.startsWith(
        'ローカル DB (~/.cache/houki-egov-mcp/laws.db) の版 (4) がこの houki-egov-mcp (3) より新しいため、'
      )
    ).toBe(true);
    expect(r.next_actions.map((a: AnyObj) => a.action)).toEqual(['search_law']);
  });
});
