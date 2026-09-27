/**
 * 差分 20260928-untested-behaviors の受入テスト: cli_bulk_download
 *
 * 期待値の正本は specs/changes/20260928-untested-behaviors/specs/cli_bulk_download/spec.md。
 * e-Gov への通信は vi.stubGlobal('fetch', …) で差し替え、テストの中で組み立てた zip を返す。
 * 環境変数（HOUKI_EGOV_DB_PATH など）は import 時に読まれるので、設定してから
 * vi.resetModules() の後に CLI を動的 import する。
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- fixture: 法令一覧 CSV と XML、zip ----------

const HEADER =
  '法令種別,法令番号,法令名,法令名読み,旧法令名,公布日,改正法令名,改正法令番号,改正法令公布日,施行日,施行日備考,法令ID,本文URL,未施行';
const CSV_YOKIN =
  '法律,昭和四十六年法律第三十四号,預金保険法,よきんほけんほう,,昭和四十六年四月一日,,,昭和四十六年四月一日,昭和四十六年四月一日,,346AC0000000034,https://laws.e-gov.go.jp/law/346AC0000000034/19710401_000000000000000,';
const REV_YOKIN = '346AC0000000034_19710401_000000000000000';
const XML_YOKIN = `<?xml version="1.0" encoding="UTF-8"?>
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
const CSV_BROKEN =
  '法律,平成元年法律第一号,壊れた法,こわれたほう,,平成元年一月一日,,,,平成元年一月一日,,401AC0000000001,https://laws.e-gov.go.jp/law/401AC0000000001/19890101_000000000000000,';
const REV_BROKEN = '401AC0000000001_19890101_000000000000000';

function csvText(rows: string[]): string {
  return `﻿${[HEADER, ...rows].join('\r\n')}\r\n`;
}

/** 無圧縮（STORED）の zip を組み立てる */
function buildZip(entries: Array<{ name: string; content: string }>): Buffer {
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

function xmlEntry(rev: string, xml: string): { name: string; content: string } {
  return { name: `${rev}/${rev}.xml`, content: xml };
}

/** 例の zip: 読める法令（条 2 つ）1 行と、壊れた XML 1 行 */
const FULL_ZIP = buildZip([
  { name: 'all_law_list.csv', content: csvText([CSV_YOKIN, CSV_BROKEN]) },
  xmlEntry(REV_YOKIN, XML_YOKIN),
  xmlEntry(REV_BROKEN, '<Law><broken'),
]);
/** 法令 1 件の zip */
const DAY_ZIP = buildZip([
  { name: 'all_law_list.csv', content: csvText([CSV_YOKIN]) },
  xmlEntry(REV_YOKIN, XML_YOKIN),
]);

const FULL_URL = 'https://laws.e-gov.go.jp/bulkdownload?file_section=1&only_xml_flag=true';

// ---------- 出力の取り込み ----------

let stdoutChunks: string[];
let stderrChunks: string[];

function lines(chunks: string[]): string[] {
  return chunks
    .join('')
    .split(/\r|\n/)
    .filter((l) => l.length > 0);
}

/** 期待する行（正規表現）が、この順で現れるか確かめる */
function expectInOrder(actual: string[], expected: RegExp[]): void {
  let from = 0;
  for (const re of expected) {
    const idx = actual.findIndex((l, i) => i >= from && re.test(l));
    expect(idx, `${re} が ${from} 行目以降に無い:\n${actual.join('\n')}`).toBeGreaterThanOrEqual(0);
    from = idx + 1;
  }
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- 環境 ----------

const REAL_TMP = tmpdir();
const ENV_KEYS = [
  'HOUKI_EGOV_DB_PATH',
  'XDG_CACHE_HOME',
  'TMPDIR',
  'HOUKI_EGOV_BULK_RETRY',
  'HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS',
] as const;
let savedEnv: Record<string, string | undefined>;
let root: string;
let tmpDirForZip: string;

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(handler: FetchHandler): void {
  fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input instanceof Request ? input.url : input), init)
  );
  vi.stubGlobal('fetch', fetchMock);
}

function zipResponse(buf: Buffer): Response {
  return new Response(new Uint8Array(buf), { status: 200 });
}

async function loadCli(): Promise<typeof import('../../cli/index.js')> {
  vi.resetModules();
  return import('../../cli/index.js');
}

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  root = mkdtempSync(join(REAL_TMP, 'td-cli-bulk-'));
  tmpDirForZip = join(root, 'tmp');
  mkdirSync(tmpDirForZip);
  process.env.TMPDIR = tmpDirForZip;
  process.env.HOUKI_EGOV_DB_PATH = join(root, 'db', 'laws.db');

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
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    stdoutChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
    return true;
  }) as typeof process.stdout.write);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.doUnmock('node:os');
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(root, { recursive: true, force: true });
});

function readLawTypes(dbPath: string): Record<string, string> {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare('SELECT law_id, law_type FROM laws').all() as Array<{
      law_id: string;
      law_type: string;
    }>;
    return Object.fromEntries(rows.map((r) => [r.law_id, r.law_type]));
  } finally {
    db.close();
  }
}

// ---------- テスト ----------

describe('cli_bulk_download（差分 20260928-untested-behaviors）', () => {
  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-020 全件の取り込みが終わると経過を標準エラー出力に順に出し、標準出力は空で exit 0', async () => {
    stubFetch(() => zipResponse(FULL_ZIP));
    const { runCli } = await loadCli();
    const result = await runCli(['node', 'index.js', '--bulk-download-everything']);

    expect(result.exitCode).toBe(0);
    expect(lines(stdoutChunks)).toEqual([]);
    const err = lines(stderrChunks);
    const dbPath = process.env.HOUKI_EGOV_DB_PATH as string;
    expectInOrder(err, [
      /^\[bulk-download-everything\] 全件 zip を取得します$/,
      new RegExp(`^  保存先 zip: ${esc(tmpDirForZip)}/.+/all_xml\\.zip$`),
      new RegExp(`^  DB:         ${esc(dbPath)}$`),
      /^\[1\/2\] zip ダウンロード中\.\.\.$/,
      /^ {2}DL 完了: 2\.2 KB \/ .+ \/ attempts=1$/,
      /^\[2\/2\] DB に ingest 中\.\.\.$/,
      /^ {2}ingest 完了: 1 件 upsert, 1 件 failed \(.+\)$/,
      /^\[完了\] 全体 .+$/,
    ]);
    expect(err.some((l) => / 件 unchanged/.test(l))).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(FULL_URL);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-020 unchanged と failed は 0 件なら ingest 完了の行に出さない', async () => {
    stubFetch(() => zipResponse(DAY_ZIP));
    const { runCli } = await loadCli();
    const result = await runCli(['node', 'index.js', '--bulk-download-everything']);
    expect(result.exitCode).toBe(0);
    expect(lines(stderrChunks)).toContainEqual(
      expect.stringMatching(/^ {2}ingest 完了: 1 件 upsert \(.+\)$/)
    );
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-021 1 日分の差分の取り込みが終わると経過を順に出し、保存名は R<YYMMDD>.zip、exit 0', async () => {
    stubFetch(() => zipResponse(DAY_ZIP));
    const { runCli } = await loadCli();
    const result = await runCli(['node', 'index.js', '--bulk-download-by-date', '20260917']);

    expect(result.exitCode).toBe(0);
    expect(lines(stdoutChunks)).toEqual([]);
    const err = lines(stderrChunks);
    const dbPath = process.env.HOUKI_EGOV_DB_PATH as string;
    expectInOrder(err, [
      /^\[bulk-download-by-date\] update_date=20260917 の差分 zip を取得します$/,
      new RegExp(`^  保存先 zip: ${esc(tmpDirForZip)}/.+/R260917\\.zip$`),
      new RegExp(`^  DB:         ${esc(dbPath)}$`),
      /^\[1\/2\] 差分 zip ダウンロード中\.\.\.$/,
      /^ {2}DL 完了: [^/]+ \/ [^/]+$/,
      /^\[2\/2\] DB に ingest 中\.\.\.$/,
      /^ {2}ingest 完了: 1 件 upsert \(.+\)$/,
    ]);
    // 全件と違い、試した回数は出さない
    expect(err.some((l) => /attempts=/.test(l))).toBe(false);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('update_date=20260917');
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-022 全件の取得に HTTP 503 が返ってあきらめたら [ERROR] を出して exit 1', async () => {
    process.env.HOUKI_EGOV_BULK_RETRY = '1';
    stubFetch(
      () => new Response('unavailable', { status: 503, statusText: 'Service Unavailable' })
    );
    const { runCli } = await loadCli();
    const result = await runCli(['node', 'index.js', '--bulk-download-everything']);

    expect(result.exitCode).toBe(1);
    expect(lines(stderrChunks)).toContain(`[ERROR] HTTP 503 Service Unavailable from ${FULL_URL}`);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-022 statusText が空なら HTTP 503 と from の間は空白 2 つ', async () => {
    process.env.HOUKI_EGOV_BULK_RETRY = '1';
    stubFetch(() => new Response('unavailable', { status: 503, statusText: '' }));
    const { runCli } = await loadCli();
    const result = await runCli(['node', 'index.js', '--bulk-download-everything']);

    expect(result.exitCode).toBe(1);
    expect(lines(stderrChunks)).toContain(`[ERROR] HTTP 503  from ${FULL_URL}`);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-022 1 日分の差分の取り込みに失敗（zip に CSV が無い）したら [ERROR] を出して exit 1', async () => {
    stubFetch(() => zipResponse(buildZip([xmlEntry(REV_YOKIN, XML_YOKIN)])));
    const { runCli } = await loadCli();
    const result = await runCli(['node', 'index.js', '--bulk-download-by-date', '20260917']);

    expect(result.exitCode).toBe(1);
    expect(lines(stderrChunks)).toContainEqual(expect.stringMatching(/^\[ERROR\] .+/));
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-022 1 日分の差分の取得に HTTP 503 が返ってあきらめたら [ERROR] を出して exit 1', async () => {
    process.env.HOUKI_EGOV_BULK_RETRY = '1';
    stubFetch(
      () => new Response('unavailable', { status: 503, statusText: 'Service Unavailable' })
    );
    const { runCli } = await loadCli();
    const result = await runCli(['node', 'index.js', '--bulk-download-by-date', '20260917']);

    expect(result.exitCode).toBe(1);
    expect(lines(stderrChunks)).toContain(
      '[ERROR] HTTP 503 Service Unavailable from https://laws.e-gov.go.jp/bulkdownload?file_section=3&update_date=20260917&only_xml_flag=true'
    );
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-023 全件: 成功しても失敗しても、終わった後の TMPDIR は空', async () => {
    stubFetch(() => zipResponse(FULL_ZIP));
    let cli = await loadCli();
    expect((await cli.runCli(['node', 'index.js', '--bulk-download-everything'])).exitCode).toBe(0);
    expect(readdirSync(tmpDirForZip)).toEqual([]);
    // 実行中は houki-egov-bulk-… の下に保存していた
    expect(lines(stderrChunks)).toContainEqual(
      expect.stringMatching(
        new RegExp(`^  保存先 zip: ${esc(tmpDirForZip)}/houki-egov-bulk-[^/]+/all_xml\\.zip$`)
      )
    );

    process.env.HOUKI_EGOV_BULK_RETRY = '1';
    stubFetch(() => new Response('x', { status: 503, statusText: 'Service Unavailable' }));
    cli = await loadCli();
    expect((await cli.runCli(['node', 'index.js', '--bulk-download-everything'])).exitCode).toBe(1);
    expect(readdirSync(tmpDirForZip)).toEqual([]);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-023 1 日分: 成功しても失敗しても、終わった後の TMPDIR は空', async () => {
    stubFetch(() => zipResponse(DAY_ZIP));
    let cli = await loadCli();
    expect(
      (await cli.runCli(['node', 'index.js', '--bulk-download-by-date', '20260917'])).exitCode
    ).toBe(0);
    expect(readdirSync(tmpDirForZip)).toEqual([]);
    expect(lines(stderrChunks)).toContainEqual(
      expect.stringMatching(
        new RegExp(`^  保存先 zip: ${esc(tmpDirForZip)}/houki-egov-diff-[^/]+/R260917\\.zip$`)
      )
    );

    process.env.HOUKI_EGOV_BULK_RETRY = '1';
    stubFetch(() => new Response('x', { status: 503, statusText: 'Service Unavailable' }));
    cli = await loadCli();
    expect(
      (await cli.runCli(['node', 'index.js', '--bulk-download-by-date', '20260917'])).exitCode
    ).toBe(1);
    expect(readdirSync(tmpDirForZip)).toEqual([]);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-024 HOUKI_EGOV_DB_PATH の場所に DB を作り、無いフォルダーは作る', async () => {
    const dbPath = join(root, 'empty', 'a', 'b', 'laws.db');
    mkdirSync(join(root, 'empty'));
    process.env.HOUKI_EGOV_DB_PATH = dbPath;
    stubFetch(() => zipResponse(FULL_ZIP));
    const { runCli } = await loadCli();
    const result = await runCli(['node', 'index.js', '--bulk-download-everything']);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(root, 'empty', 'a', 'b'))).toBe(true);
    expect(existsSync(dbPath)).toBe(true);
    expect(lines(stderrChunks)).toContain(`  DB:         ${dbPath}`);
    expect(Object.keys(readLawTypes(dbPath))).toContain('346AC0000000034');
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-025 HOUKI_EGOV_DB_PATH が無ければ <XDG_CACHE_HOME>/houki-egov-mcp/laws.db に作る', async () => {
    delete process.env.HOUKI_EGOV_DB_PATH;
    const xdg = join(root, 'empty', 'xdg');
    mkdirSync(join(root, 'empty'));
    process.env.XDG_CACHE_HOME = xdg;
    stubFetch(() => zipResponse(FULL_ZIP));
    const { runCli } = await loadCli();
    const result = await runCli(['node', 'index.js', '--bulk-download-everything']);

    const expected = join(xdg, 'houki-egov-mcp', 'laws.db');
    expect(result.exitCode).toBe(0);
    expect(existsSync(expected)).toBe(true);
    expect(Object.keys(readLawTypes(expected))).toContain('346AC0000000034');
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-025 どちらも指定しないときは ~/.cache/houki-egov-mcp/laws.db に作る', async () => {
    delete process.env.HOUKI_EGOV_DB_PATH;
    delete process.env.XDG_CACHE_HOME;
    const home = join(root, 'home');
    mkdirSync(home);
    vi.doMock('node:os', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:os')>();
      return { ...actual, default: { ...actual, homedir: () => home }, homedir: () => home };
    });
    stubFetch(() => zipResponse(FULL_ZIP));
    const { runCli } = await loadCli();
    const result = await runCli(['node', 'index.js', '--bulk-download-everything']);

    const expected = join(home, '.cache', 'houki-egov-mcp', 'laws.db');
    expect(result.exitCode).toBe(0);
    expect(existsSync(expected)).toBe(true);
  });

  it('SPEC-EGOV-CLI-BULK-DOWNLOAD-026 XML に LawType が無いときは CSV の和文の種別から決め、あれば XML の値を使う', async () => {
    const cases: Array<{ label: string; lawType: string | null; expected: string }> = [
      { label: '法律', lawType: null, expected: 'Act' },
      { label: '政令', lawType: null, expected: 'CabinetOrder' },
      { label: '閣令', lawType: null, expected: 'CabinetOrder' },
      { label: '勅令', lawType: null, expected: 'ImperialOrder' },
      { label: '府省令', lawType: null, expected: 'MinisterialOrdinance' },
      { label: '省令', lawType: null, expected: 'MinisterialOrdinance' },
      { label: '規則', lawType: null, expected: 'Rule' },
      { label: '条約', lawType: null, expected: 'Act' },
      { label: '', lawType: null, expected: 'Act' },
      { label: '省令', lawType: '', expected: 'MinisterialOrdinance' },
      { label: '法律', lawType: 'Rule', expected: 'Rule' },
    ];
    const rows: string[] = [];
    const entries: Array<{ name: string; content: string }> = [];
    const expected: Record<string, string> = {};
    cases.forEach((c, i) => {
      const n = String(i + 1).padStart(2, '0');
      const lawId = `346AC00000001${n}`;
      const rev = `${lawId}_19710401_000000000000000`;
      const title = `種別テスト法${n}`;
      const num = `昭和四十六年法律第百${n}号`;
      rows.push(
        `${c.label},${num},${title},しゅべつてすとほう,,昭和四十六年四月一日,,,昭和四十六年四月一日,昭和四十六年四月一日,,${lawId},https://laws.e-gov.go.jp/law/${lawId}/19710401_000000000000000,`
      );
      const typeAttr = c.lawType === null ? '' : ` LawType="${c.lawType}"`;
      entries.push(
        xmlEntry(
          rev,
          `<?xml version="1.0" encoding="UTF-8"?>
<Law Era="Showa" Year="46" Num="1${n}"${typeAttr} Lang="ja" PromulgateMonth="04" PromulgateDay="01">
  <LawNum>${num}</LawNum>
  <LawBody>
    <LawTitle>${title}</LawTitle>
    <MainProvision>
      <Article Num="1">
        <ArticleTitle>第一条</ArticleTitle>
        <Paragraph Num="1"><ParagraphSentence><Sentence>本文${n}。</Sentence></ParagraphSentence></Paragraph>
      </Article>
    </MainProvision>
  </LawBody>
</Law>`
        )
      );
      expected[lawId] = c.expected;
    });
    const zip = buildZip([{ name: 'all_law_list.csv', content: csvText(rows) }, ...entries]);
    stubFetch(() => zipResponse(zip));
    const { runCli } = await loadCli();
    const result = await runCli(['node', 'index.js', '--bulk-download-everything']);

    expect(result.exitCode).toBe(0);
    expect(lines(stderrChunks)).toContainEqual(
      expect.stringMatching(new RegExp(`^  ingest 完了: ${cases.length} 件 upsert \\(.+\\)$`))
    );
    expect(readLawTypes(process.env.HOUKI_EGOV_DB_PATH as string)).toEqual(expected);
  });
});
