/**
 * 差分 20261003-db-cli / 20261003-db-cli-followup の受入テストの共通部品。
 *
 * - CLI の出力（console.log / console.error / process.stderr.write）を取り込む
 * - e-Gov への通信を vi.stubGlobal('fetch', …) で差し替える
 * - 環境変数（HOUKI_EGOV_DB_PATH など）は import 時に読まれるので、設定してから
 *   vi.resetModules() の後に CLI・ハンドラーを動的 import する
 * - DB は OS の一時ディレクトリの下だけに作る（利用者の ~/.cache の DB には触れない）
 *
 * tsconfig の exclude 対象（dist には含めない）。
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import type DatabaseT from 'better-sqlite3';
import Database from 'better-sqlite3';
import { vi } from 'vitest';

// ---------- 法令一覧 CSV と XML ----------

export const HEADER =
  '法令種別,法令番号,法令名,法令名読み,旧法令名,公布日,改正法令名,改正法令番号,改正法令公布日,施行日,施行日備考,法令ID,本文URL,未施行';

/** 預金保険法（条 2 つ） */
export const CSV_YOKIN =
  '法律,昭和四十六年法律第三十四号,預金保険法,よきんほけんほう,,昭和四十六年四月一日,,,昭和四十六年四月一日,昭和四十六年四月一日,,346AC0000000034,https://laws.e-gov.go.jp/law/346AC0000000034/19710401_000000000000000,';
export const REV_YOKIN = '346AC0000000034_19710401_000000000000000';
export const XML_YOKIN = `<?xml version="1.0" encoding="UTF-8"?>
<Law Era="Showa" Year="46" Num="034" LawType="Act" Lang="ja" PromulgateMonth="04" PromulgateDay="01">
  <LawNum>昭和四十六年法律第三十四号</LawNum>
  <LawBody>
    <LawTitle Kana="よきんほけんほう" Abbrev="預保法">預金保険法</LawTitle>
    <MainProvision>
      <Chapter Num="1">
        <ChapterTitle>第一章　総則</ChapterTitle>
        <Article Num="1">
          <ArticleCaption>（目的）</ArticleCaption>
          <ArticleTitle>第一条</ArticleTitle>
          <Paragraph Num="1"><ParagraphSentence><Sentence>この法律は、預金者等の保護を目的とする。</Sentence></ParagraphSentence></Paragraph>
        </Article>
        <Article Num="2">
          <ArticleTitle>第二条</ArticleTitle>
          <Paragraph Num="1"><ParagraphSentence><Sentence>第二条の本文。</Sentence></ParagraphSentence></Paragraph>
        </Article>
      </Chapter>
    </MainProvision>
  </LawBody>
</Law>`;

/** 改暦ノ布告（本則は段落 1 つだけ、別表「（別紙）」あり） */
export const CSV_KAIREKI =
  '政令,明治五年太政官布告第三百三十七号,明治五年太政官布告第三百三十七号（改暦ノ布告）,かいれきのふこく,,明治五年十一月九日,,,明治五年十一月九日,明治五年十一月九日,,105DF0000000337,https://laws.e-gov.go.jp/law/105DF0000000337/18721109_000000000000000,';
export const REV_KAIREKI = '105DF0000000337_18721109_000000000000000';
export const KAIREKI_SENTENCE = '今般改暦ノ儀別紙　詔書ノ通被　仰出候条此旨相達候事';
export const XML_KAIREKI = `<?xml version="1.0" encoding="UTF-8"?>
<Law Era="Meiji" Year="05" Num="337" LawType="CabinetOrder" Lang="ja" PromulgateMonth="11" PromulgateDay="09">
  <LawNum>明治五年太政官布告第三百三十七号</LawNum>
  <LawBody>
    <LawTitle Kana="かいれきのふこく" Abbrev="改暦の布告">明治五年太政官布告第三百三十七号（改暦ノ布告）</LawTitle>
    <MainProvision>
      <Paragraph Num="1"><ParagraphNum/><ParagraphSentence><Sentence>${KAIREKI_SENTENCE}</Sentence></ParagraphSentence></Paragraph>
    </MainProvision>
    <AppdxNote>
      <AppdxNoteTitle>（別紙）</AppdxNoteTitle>
      <Sentence>別紙の本文</Sentence>
    </AppdxNote>
  </LawBody>
</Law>`;

/** 公布日の欄（PromulgateDay）が無い法令 */
export const CSV_NODAY =
  '法律,平成二年法律第二号,公布日の無い法,こうふびのないほう,,平成二年二月二日,,,,平成二年二月二日,,402AC0000000002,https://laws.e-gov.go.jp/law/402AC0000000002/19900202_000000000000000,';
export const REV_NODAY = '402AC0000000002_19900202_000000000000000';
export const XML_NODAY = `<?xml version="1.0" encoding="UTF-8"?>
<Law Era="Heisei" Year="02" Num="002" LawType="Act" Lang="ja" PromulgateMonth="02">
  <LawNum>平成二年法律第二号</LawNum>
  <LawBody>
    <LawTitle Kana="こうふびのないほう">公布日の無い法</LawTitle>
    <MainProvision>
      <Article Num="1">
        <ArticleTitle>第一条</ArticleTitle>
        <Paragraph Num="1"><ParagraphSentence><Sentence>公布日の無い法の本文。</Sentence></ParagraphSentence></Paragraph>
      </Article>
    </MainProvision>
  </LawBody>
</Law>`;

export function csvText(rows: string[]): string {
  return `﻿${[HEADER, ...rows].join('\r\n')}\r\n`;
}

export function xmlEntry(rev: string, xml: string): { name: string; content: string } {
  return { name: `${rev}/${rev}.xml`, content: xml };
}

/** 無圧縮（STORED）の zip を組み立てる */
export function buildZip(entries: Array<{ name: string; content: string }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf-8');
    const data = Buffer.from(e.content, 'utf-8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

/** 預金保険法 1 件の zip */
export function zipOf(...laws: Array<[csv: string, rev: string, xml: string]>): Buffer {
  return buildZip([
    { name: 'all_law_list.csv', content: csvText(laws.map((l) => l[0])) },
    ...laws.map(([, rev, xml]) => xmlEntry(rev, xml)),
  ]);
}

export const ZIP_YOKIN = zipOf([CSV_YOKIN, REV_YOKIN, XML_YOKIN]);

export const INDEX_URL = 'https://laws.e-gov.go.jp/bulkdownload/';
export const FULL_URL = 'https://laws.e-gov.go.jp/bulkdownload?file_section=1&only_xml_flag=true';

// ---------- 出力の取り込み ----------

export interface Output {
  stdout: string[];
  stderr: string[];
}

export function captureOutput(): Output {
  const out: Output = { stdout: [], stderr: [] };
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    out.stdout.push(`${args.map(String).join(' ')}\n`);
  });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    out.stderr.push(`${args.map(String).join(' ')}\n`);
  });
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    out.stderr.push(`${args.map(String).join(' ')}\n`);
  });
  vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    out.stderr.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
    return true;
  }) as typeof process.stderr.write);
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    out.stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
    return true;
  }) as typeof process.stdout.write);
  return out;
}

export function lines(chunks: string[]): string[] {
  return chunks
    .join('')
    .split(/\r|\n/)
    .filter((l) => l.length > 0);
}

export function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- e-Gov の差し替え ----------

export type EgovResponse = Buffer | { status: number; statusText?: string } | Error;

export interface EgovStub {
  fn: ReturnType<typeof vi.fn>;
  /** 一括ダウンロードの zip の取得（GET）の URL */
  zipCalls(): string[];
  /** e-Gov に届くかの確認（HEAD）の回数 */
  headCalls(): number;
}

/**
 * full: 全件 zip の応答。days: 日付（YYYYMMDD）→ 差分 zip の応答。head: 索引ページの HEAD の応答（既定 200）
 */
export function stubEgov(opts: {
  full?: EgovResponse | (() => EgovResponse);
  days?: Record<string, EgovResponse>;
  head?: number | Error;
}): EgovStub {
  const toResponse = (r: EgovResponse): Response => {
    if (r instanceof Error) throw r;
    if (Buffer.isBuffer(r)) return new Response(new Uint8Array(r), { status: 200 });
    return new Response('error page', { status: r.status, statusText: r.statusText ?? '' });
  };
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === INDEX_URL) {
      const h = opts.head ?? 200;
      if (h instanceof Error) throw h;
      return new Response(null, { status: h });
    }
    if (url.includes('file_section=1') && opts.full !== undefined) {
      return toResponse(typeof opts.full === 'function' ? opts.full() : opts.full);
    }
    const m = /update_date=(\d{8})/.exec(url);
    const r = m ? opts.days?.[m[1] as string] : undefined;
    if (r === undefined) {
      throw new Error(`テストで想定していない URL: ${url} ${init?.method ?? ''}`);
    }
    return toResponse(r);
  });
  vi.stubGlobal('fetch', fn);
  return {
    fn,
    zipCalls: () =>
      fn.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('file_section=')),
    headCalls: () => fn.mock.calls.filter((c) => String(c[0]) === INDEX_URL).length,
  };
}

// ---------- 環境変数と一時ディレクトリ ----------

export const ENV_KEYS = [
  'HOUKI_EGOV_DB_PATH',
  'XDG_CACHE_HOME',
  'HOME',
  'TMPDIR',
  'HOUKI_EGOV_BULK_RETRY',
  'HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS',
  'HOUKI_EGOV_CONCURRENCY',
] as const;

export interface TestEnv {
  root: string;
  restore(): void;
}

/**
 * 環境変数を退避して消し、一時ディレクトリを作る。TMPDIR はその下の tmp にする。
 * HOME も一時ディレクトリにして、~/.cache の利用者の DB に届かないようにする。
 */
export function setupEnv(prefix: string): TestEnv {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  const root = mkdtempSync(join(tmpdir(), prefix));
  process.env.HOME = join(root, 'home');
  process.env.TMPDIR = root;
  return {
    root,
    restore() {
      for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export async function loadCli(): Promise<typeof import('../cli/index.js')> {
  vi.resetModules();
  return import('../cli/index.js');
}

export async function runCliWith(args: string[]): Promise<{ exitCode: number; command: string }> {
  const { runCli } = await loadCli();
  return runCli(['node', 'index.js', ...args]);
}

// ---------- DB を用意する ----------

/** v0.5.0〜v0.18.x の版 2 のテーブル定義（sync_state.schema_version 列あり、promulgation_date NOT NULL） */
const V2_SQL = `
PRAGMA journal_mode = WAL;
CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE laws (
  law_revision_id TEXT PRIMARY KEY,
  law_id TEXT NOT NULL, law_type TEXT NOT NULL, law_num TEXT NOT NULL, law_title TEXT NOT NULL,
  law_title_kana TEXT, abbrev TEXT, category TEXT,
  promulgation_date TEXT NOT NULL,
  amendment_promulgate_date TEXT, amendment_enforcement_date TEXT,
  amendment_scheduled_enforcement_date TEXT,
  current_revision_status TEXT NOT NULL, repeal_status TEXT NOT NULL, repeal_date TEXT,
  remain_in_force INTEGER NOT NULL DEFAULT 0, amendment_type TEXT,
  updated TEXT NOT NULL, fetched_at TEXT NOT NULL, content_hash TEXT NOT NULL
);
CREATE TABLE articles (
  id INTEGER PRIMARY KEY,
  law_revision_id TEXT NOT NULL REFERENCES laws(law_revision_id) ON DELETE CASCADE,
  article_num TEXT NOT NULL, caption TEXT, chapter_path TEXT, ord INTEGER NOT NULL,
  body TEXT NOT NULL, body_raw TEXT NOT NULL
);
CREATE TABLE revisions_meta (
  law_revision_id TEXT PRIMARY KEY, law_id TEXT NOT NULL, mission TEXT,
  updated TEXT NOT NULL, raw_revision_info_json TEXT NOT NULL
);
CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_sync_date TEXT NOT NULL, last_full_dl_at TEXT NOT NULL,
  total_laws INTEGER NOT NULL DEFAULT 0, bulk_source TEXT NOT NULL DEFAULT 'all_xml',
  schema_version INTEGER NOT NULL DEFAULT 2
);
CREATE VIRTUAL TABLE laws_fts USING fts5(
  law_revision_id UNINDEXED, law_title, law_title_kana, abbrev, law_num, category,
  tokenize = 'trigram'
);
CREATE VIRTUAL TABLE articles_fts USING fts5(
  body, caption, content='articles', content_rowid='id', tokenize = 'trigram'
);
CREATE TRIGGER articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, body, caption) VALUES (new.id, new.body, new.caption);
END;
`;

/**
 * 版の値（schema_meta の schema_version）を指定して DB を作る。
 * 中身は laws 1 行・articles 2 行・sync_state 1 行（last_sync_date 2026-09-19）。
 * version が '2' なら v0.18.x までの版 2 のテーブル定義で作る。
 */
export function seedVersionedDb(dbPath: string, version: string): void {
  const db = new Database(dbPath);
  try {
    db.exec(V2_SQL);
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?)").run(version);
    db.prepare(
      `INSERT INTO laws (law_revision_id, law_id, law_type, law_num, law_title,
        promulgation_date, current_revision_status, repeal_status, updated, fetched_at, content_hash)
       VALUES ('OLD_20200101_', 'OLD', 'Act', '令和二年法律第一号', '古い法', '2020-01-01',
        'CurrentEnforced', 'None', '2020-01-01', '2020-01-01', 'h')`
    ).run();
    const ins = db.prepare(
      `INSERT INTO articles (law_revision_id, article_num, ord, body, body_raw)
       VALUES ('OLD_20200101_', ?, ?, ?, ?)`
    );
    ins.run('1', 1, '古い法の第一条', '古い法の第一条');
    ins.run('2', 2, '古い法の第二条', '古い法の第二条');
    db.prepare(
      `INSERT INTO sync_state (id, last_sync_date, last_full_dl_at, total_laws, bulk_source)
       VALUES (1, '2026-09-19', '2026-09-07T04:53:21.112Z', 1, 'all_xml')`
    ).run();
  } finally {
    db.close();
  }
}

export interface DbSnapshot {
  schemaVersion: string | null;
  laws: number;
  articles: number;
  syncState: Array<Record<string, unknown>>;
}

/** DB の中身を読むだけで開いて数える */
export function snapshot(dbPath: string): DbSnapshot {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const v = db.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get() as
      | { value: string }
      | undefined;
    const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
    return {
      schemaVersion: v?.value ?? null,
      laws: count('SELECT count(*) AS c FROM laws'),
      articles: count('SELECT count(*) AS c FROM articles'),
      syncState: db.prepare('SELECT * FROM sync_state').all() as Array<Record<string, unknown>>,
    };
  } finally {
    db.close();
  }
}

export function withDb<T>(dbPath: string, fn: (db: DatabaseT.Database) => T): T {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
