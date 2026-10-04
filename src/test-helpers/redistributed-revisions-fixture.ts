/**
 * 差分 20261004-ingest-redistributed-revisions の受入テストの fixture。
 *
 * 医師法施行規則（`323M40000100047`）の 4 つの版（SPEC-EGOV-CLI-BULK-DOWNLOAD-031 の例の表）を、
 * e-Gov の配り方（houki-egov-mcp #107 の本文）に合わせて、差分 zip と全件 zip に組み立てる。
 *
 * - 2026-09-02 の差分: 4 版。`…_20260814_…` は未施行の欄が空、ほかの 3 版は `○`
 * - 2026-09-17 の差分: `…_20260917_…` を同じ XML のまま、未施行の欄を空にしてもう一度入れる
 * - 2026-10-01 の差分: `…_20261001_…` を同じ XML のまま、未施行の欄を空にしてもう一度入れる。
 *   `…_20270401_…` は同じ XML・欄 `○` のまま入れる
 * - 全件の zip（2026-10-02 以降）: `…_20261001_…`（欄が空）と `…_20270401_…`（`○`）だけ。
 *   施行済みで置き換わった `…_20260814_…`・`…_20260917_…` は入っていない
 *
 * XML は版ごとに条の本文を変え、`content_hash` が版ごとに違うようにする。
 * tsconfig の exclude 対象（dist には含めない）。
 */

import type DatabaseT from 'better-sqlite3';
import type { ZipReader } from '../services/bulk/zip-reader.js';
import { createMemoryZip } from '../services/bulk/zip-reader.js';
import { buildZip, csvText, xmlEntry } from './cli-db-harness.js';

export const ISHI_LAW_ID = '323M40000100047';

export const REV_0814 = '323M40000100047_20260814_508M60000100128';
export const REV_0917 = '323M40000100047_20260917_508M60000100132';
export const REV_1001 = '323M40000100047_20261001_508M60000100107';
export const REV_20270401 = '323M40000100047_20270401_508M60000100128';

/** 4 版。施行日の古い順 */
export const ISHI_REVISIONS = [REV_0814, REV_0917, REV_1001, REV_20270401] as const;

/** 医師法施行規則の CSV の 1 行。unenforced が true なら未施行の欄を `○` にする */
export function ishiCsv(rev: string, unenforced: boolean): string {
  const tail = rev.slice(ISHI_LAW_ID.length + 1); // `{YYYYMMDD}_{改正法令ID}`
  return [
    '府省令',
    '昭和二十三年厚生省令第四十七号',
    '医師法施行規則',
    'いしほうしこうきそく',
    '',
    '昭和二十三年十月二十七日',
    '',
    '',
    '',
    '令和八年',
    '',
    ISHI_LAW_ID,
    `https://laws.e-gov.go.jp/law/${ISHI_LAW_ID}/${tail}`,
    unenforced ? '○' : '',
  ].join(',');
}

/** 医師法施行規則の XML。版ごとに第一条の本文を変える */
export function ishiXml(rev: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Law Era="Showa" Year="23" Num="047" LawType="MinisterialOrdinance" Lang="ja" PromulgateMonth="10" PromulgateDay="27">
  <LawNum>昭和二十三年厚生省令第四十七号</LawNum>
  <LawBody>
    <LawTitle Kana="いしほうしこうきそく">医師法施行規則</LawTitle>
    <MainProvision>
      <Article Num="1">
        <ArticleTitle>第一条</ArticleTitle>
        <Paragraph Num="1"><ParagraphSentence><Sentence>版 ${rev} の第一条の本文。</Sentence></ParagraphSentence></Paragraph>
      </Article>
      <Article Num="2">
        <ArticleTitle>第二条</ArticleTitle>
        <Paragraph Num="1"><ParagraphSentence><Sentence>版 ${rev} の第二条の本文。</Sentence></ParagraphSentence></Paragraph>
      </Article>
    </MainProvision>
  </LawBody>
</Law>`;
}

/** zip の中身。entries は [版の ID, 未施行の欄が ○ か] */
export type IshiEntries = Array<[rev: string, unenforced: boolean]>;

/** 医師法施行規則の版を並べた zip のエントリ（CSV と XML） */
export function ishiEntries(entries: IshiEntries): Array<{ name: string; content: string }> {
  return [
    { name: 'all_law_list.csv', content: csvText(entries.map(([rev, u]) => ishiCsv(rev, u))) },
    ...entries.map(([rev]) => xmlEntry(rev, ishiXml(rev))),
  ];
}

/** 医師法施行規則の版を並べた zip（CLI の取得の応答に使う） */
export function ishiZip(entries: IshiEntries): Buffer {
  return buildZip(ishiEntries(entries));
}

/** 医師法施行規則の版を並べた、ingestZip に渡す zip */
export function ishiMemoryZip(entries: IshiEntries): ZipReader {
  return createMemoryZip(ishiEntries(entries).map((e) => ({ path: e.name, content: e.content })));
}

/** 2026-09-02 の差分 */
export const DAY_20260902: IshiEntries = [
  [REV_0814, false],
  [REV_0917, true],
  [REV_1001, true],
  [REV_20270401, true],
];

/** 2026-09-17 の差分（`…_20260917_…` を欄を空にして配り直す） */
export const DAY_20260917: IshiEntries = [[REV_0917, false]];

/** 2026-10-01 の差分（`…_20261001_…` を欄を空にして配り直す。`…_20270401_…` は `○` のまま） */
export const DAY_20261001: IshiEntries = [
  [REV_1001, false],
  [REV_20270401, true],
];

/** 2026-10-02 以降の全件（現行の版 1 つと未施行の版。置き換わった前の版は入っていない） */
export const FULL_20261002: IshiEntries = [
  [REV_1001, false],
  [REV_20270401, true],
];

/** 031 の例の表の「v0.19.0 の取り込み後の状態」 */
export const STATUS_V0190: Record<string, string> = {
  [REV_0814]: 'CurrentEnforced',
  [REV_0917]: 'UnEnforced',
  [REV_1001]: 'UnEnforced',
  [REV_20270401]: 'UnEnforced',
};

/** 031 の例の表の「この規則での状態」 */
export const STATUS_FIXED: Record<string, string> = {
  [REV_0814]: 'PreviousEnforced',
  [REV_0917]: 'PreviousEnforced',
  [REV_1001]: 'CurrentEnforced',
  [REV_20270401]: 'UnEnforced',
};

/** 版の ID → current_revision_status */
export function statusesOf(db: DatabaseT.Database, lawId = ISHI_LAW_ID): Record<string, string> {
  const rows = db
    .prepare('SELECT law_revision_id, current_revision_status FROM laws WHERE law_id = ?')
    .all(lawId) as Array<{ law_revision_id: string; current_revision_status: string }>;
  return Object.fromEntries(rows.map((r) => [r.law_revision_id, r.current_revision_status]));
}

/** 状態を直接書き換える（v0.19.0 で状態が残った DB を作る） */
export function forceStatuses(db: DatabaseT.Database, statuses: Record<string, string>): void {
  const upd = db.prepare('UPDATE laws SET current_revision_status = ? WHERE law_revision_id = ?');
  for (const [rev, s] of Object.entries(statuses)) upd.run(s, rev);
}

/** 状態だけの書き換えで変わってはいけない列と、条・索引の行 */
export interface RevisionFootprint {
  law: Record<string, unknown>;
  articles: Array<Record<string, unknown>>;
  lawsFts: Array<Record<string, unknown>>;
}

/** 1 つの版の、current_revision_status 以外の laws の列と、articles・laws_fts の行（rowid を含む） */
export function footprintOf(db: DatabaseT.Database, rev: string): RevisionFootprint {
  const law = {
    ...(db.prepare('SELECT * FROM laws WHERE law_revision_id = ?').get(rev) as Record<
      string,
      unknown
    >),
  };
  delete law.current_revision_status;
  const articles = db
    .prepare('SELECT id, article_num, ord, body, body_raw FROM articles WHERE law_revision_id = ?')
    .all(rev) as Array<Record<string, unknown>>;
  const lawsFts = db
    .prepare('SELECT rowid, * FROM laws_fts WHERE law_revision_id = ?')
    .all(rev) as Array<Record<string, unknown>>;
  return { law, articles, lawsFts };
}
