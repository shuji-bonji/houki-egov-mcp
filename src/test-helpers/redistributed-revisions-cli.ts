/**
 * 差分 20261004-ingest-redistributed-revisions の受入テストの共通部品（CLI の表示のテスト用）。
 * tsconfig の exclude 対象（dist には含めない）。
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type DatabaseT from 'better-sqlite3';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import { ingestZip } from '../services/bulk/ingester.js';
import { type IshiEntries, ishiMemoryZip } from './redistributed-revisions-fixture.js';

/** SPEC-EGOV-CLI-SYNC-020 と SPEC-EGOV-CLI-BULK-DOWNLOAD-032 の行 */
export function statusChangedLine(n: number): string {
  return `  状態の更新: ${n} 件 (条の本文はそのまま、未施行 (UnEnforced) だった版の状態だけを書き換え)`;
}

/** SPEC-EGOV-CLI-SYNC-021 と SPEC-EGOV-CLI-STATUS-012 の行 */
export function warnLine(lastSyncDate: string, n: number): string {
  return `[WARN] 施行日が last_sync_date (${lastSyncDate}) より前なのに未施行 (UnEnforced) のままの版が ${n} 件あります。houki-egov-mcp --bulk-download-everything を 1 回実行すると直ります（全件の zip 約 290 MB を取得します。条の本文は入れ直しません）`;
}

/** 施行日 2026-10-05 の UnEnforced の版の ID（proposal.md の「確かめた値」） */
export const REVS_20261005 = [
  '347M50000040026_20261005_508M60000002079',
  '348M50000040005_20261005_508M60000002079',
  '405M50000040014_20261005_508M60000002079',
  '405M50000040022_20261005_508M60000002079',
  '417M60000010018_20261005_508M60000010023',
];

/** laws に 1 行入れる（条は入れない） */
export function insertRevision(
  db: DatabaseT.Database,
  rev: string,
  status: string,
  enforcementDate: string | null
): void {
  db.prepare(
    `INSERT INTO laws (law_revision_id, law_id, law_type, law_num, law_title,
      promulgation_date, amendment_enforcement_date, current_revision_status, repeal_status,
      updated, fetched_at, content_hash)
     VALUES (?, ?, 'MinisterialOrdinance', 'n', 't', '2020-01-01', ?, ?, 'None', 'u', 'f', 'h')`
  ).run(rev, rev.split('_')[0], enforcementDate, status);
}

/** 版 3 の DB を作り、days の差分を順に取り込み、fill で行を足し、同期の状態を書く */
export async function seedDb(
  dbPath: string,
  opts: {
    days?: IshiEntries[];
    fill?: (db: DatabaseT.Database) => void;
    lastSyncDate?: string;
  }
): Promise<void> {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  try {
    initSchema(db);
    for (const day of opts.days ?? []) {
      await ingestZip({
        db,
        zip: ishiMemoryZip(day),
        source: 'incremental',
        updateSyncState: false,
      });
    }
    opts.fill?.(db);
    if (opts.lastSyncDate) {
      db.prepare(
        `INSERT INTO sync_state (id, last_sync_date, last_full_dl_at, total_laws, bulk_source)
         VALUES (1, ?, '2026-09-01T03:00:00.000Z', 1, 'incremental')`
      ).run(opts.lastSyncDate);
    }
  } finally {
    db.close();
  }
}

/** 期待する行（文字列は完全一致、正規表現は test）が、この順で現れる位置 */
export function indexesInOrder(actual: string[], expected: Array<string | RegExp>): number[] {
  const out: number[] = [];
  let from = 0;
  for (const e of expected) {
    const idx = actual.findIndex(
      (l, i) => i >= from && (typeof e === 'string' ? l === e : e.test(l))
    );
    if (idx < 0) {
      throw new Error(`${String(e)} が ${from} 行目以降に無い:\n${actual.join('\n')}`);
    }
    out.push(idx);
    from = idx + 1;
  }
  return out;
}
