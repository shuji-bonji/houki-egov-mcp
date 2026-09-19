/**
 * 差分同期 (`--sync`) — Phase 2-8
 *
 * `sync_state.last_sync_date` から今日 (JST) までの日次差分 zip (file_section=3) を
 * 日付順に取得して ingest する。取得と ingest の実体は zip-fetcher / ingester にあり、
 * ここは「どの日を、どの順で、どこまで進めたか」だけを持つ。
 *
 * 設計判断:
 *  - 開始日は last_sync_date **を含める**。e-Gov の日次 zip はその日の 15 時ごろに
 *    生成される (PHASE2-SPIKE §5) ので、午前に同期した日の差分は次回に拾い直す必要がある。
 *    同じ zip を二度入れても content_hash で no-op になる
 *  - 差分が無い日は e-Gov が **HTTP 500** (HTML のエラーページ) を返す (2026-09-19 実測:
 *    日曜日・未来の日付・存在しない日付がすべて同じ応答)。障害と区別できないので、
 *    同期の前に bulkdownload の索引ページに届くことを確かめ、届くなら 500 を「差分なし」と扱う
 *  - 1 日ごとに `sync_state.last_sync_date` を進める。途中で失敗しても、成功した日までは残る
 *  - last_sync_date から `limitDays` (既定 90 日 = 公式の公開範囲) を超えて空いていたら
 *    何もせず、全件取り込みを促す
 *  - 日付は JST で扱う (e-Gov の update_date は日本時間の日付)
 */

import type DatabaseT from 'better-sqlite3';
import { countLaws, type IngestResult, upsertSyncState } from './ingester.js';
import { BulkHttpError } from './zip-fetcher.js';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 同期状態の読み書き (SQLite の sync_state を抽象化。テストでは in-memory 実装を渡す) */
export interface SyncStore {
  /** 最終同期日 (YYYY-MM-DD)。まだ全件取り込みが無ければ null */
  lastSyncDate(): string | null;
  /** その日までの確認が済んだことを記録する (YYYY-MM-DD) */
  markSynced(dateIso: string): void;
}

/** 同期計画 */
export type SyncPlan =
  | { kind: 'no-state' }
  | { kind: 'full-required'; lastSyncDate: string; daysSince: number; limitDays: number }
  | { kind: 'dates'; from: string; to: string; dates: string[] };

/** 1 日分の結果 */
export interface SyncDayResult {
  /** YYYY-MM-DD */
  date: string;
  /** ingested: 差分 zip を取り込んだ / empty: その日の差分 zip が無い (HTTP 404 / 500) */
  status: 'ingested' | 'empty';
  ingest?: IngestResult;
  bytes?: number;
  durationMs: number;
}

/** 同期全体の結果 */
export interface SyncResult {
  plan: SyncPlan;
  days: SyncDayResult[];
  /** 途中で止まった日とその理由 (無ければ undefined) */
  failed?: { date: string; message: string };
  /** 終了時点の last_sync_date */
  lastSyncDate: string | null;
  durationMs: number;
}

/** runSync の依存 (CLI は実 DL / ingest を、テストは差し替えを渡す) */
export interface SyncDeps {
  store: SyncStore;
  /** e-Gov に届くことを確かめる。届かなければ throw */
  checkReachable: () => Promise<void>;
  /** その日の差分 zip を取得してパスを返す。無い日は BulkHttpError(404 / 500) を throw */
  downloadDay: (yyyymmdd: string) => Promise<{ zipPath: string; bytes: number }>;
  /** zip を DB に取り込む (sync_state は触らない) */
  ingestDay: (zipPath: string) => Promise<IngestResult>;
  /** 取得した zip を消す (省略可) */
  cleanupDay?: (zipPath: string) => Promise<void>;
  /** 1 日終わるごとに呼ばれる (進捗表示用) */
  onDay?: (result: SyncDayResult, index: number, total: number) => void;
  /** 現在時刻 (テスト用。default Date.now()) */
  nowMs?: number;
  /** 差分の公開範囲 (日)。default BULK_CONFIG.incrementalLimitDays */
  limitDays?: number;
}

/** 現在時刻を JST の YYYY-MM-DD にする */
export function todayJst(nowMs: number = Date.now()): string {
  return new Date(nowMs + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD → YYYYMMDD (e-Gov の update_date 形式) */
export function toYyyymmdd(dateIso: string): string {
  return dateIso.replace(/-/g, '');
}

/** YYYYMMDD → YYYY-MM-DD */
export function fromYyyymmdd(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/** 2 つの YYYY-MM-DD の差 (日)。to が前なら負 */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / DAY_MS);
}

/** from 〜 to (両端を含む) の日付を YYYY-MM-DD で並べる。to が前なら空 */
export function dateRangeInclusive(fromIso: string, toIso: string): string[] {
  const n = daysBetween(fromIso, toIso);
  if (n < 0) return [];
  const start = Date.parse(`${fromIso}T00:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i <= n; i++) {
    out.push(new Date(start + i * DAY_MS).toISOString().slice(0, 10));
  }
  return out;
}

/** どの日を取りに行くかを決める (I/O なし) */
export function planSync(args: {
  lastSyncDate: string | null;
  nowMs: number;
  limitDays: number;
}): SyncPlan {
  const { lastSyncDate, nowMs, limitDays } = args;
  if (!lastSyncDate) return { kind: 'no-state' };
  const today = todayJst(nowMs);
  const daysSince = daysBetween(lastSyncDate, today);
  if (daysSince > limitDays) {
    return { kind: 'full-required', lastSyncDate, daysSince, limitDays };
  }
  return {
    kind: 'dates',
    from: lastSyncDate,
    to: today,
    dates: dateRangeInclusive(lastSyncDate, today),
  };
}

/** 差分 zip が無い日の応答か (2026-09-19 実測では 500。将来 404 に変わっても拾う) */
export function isNoDiffResponse(err: unknown): boolean {
  return err instanceof BulkHttpError && (err.status === 404 || err.status === 500);
}

/**
 * 計画に従って 1 日ずつ取得・取り込みし、日ごとに store を進める。
 *
 * `checkReachable` が throw したらそのまま投げる (何も進めない)。
 * 取得・取り込みで「差分なし」以外の失敗が起きたら、その日で止めて `failed` に入れる。
 */
export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const { store, nowMs = Date.now(), limitDays = 90 } = deps;
  const start = Date.now();
  const plan = planSync({ lastSyncDate: store.lastSyncDate(), nowMs, limitDays });
  const days: SyncDayResult[] = [];

  if (plan.kind !== 'dates' || plan.dates.length === 0) {
    return { plan, days, lastSyncDate: store.lastSyncDate(), durationMs: Date.now() - start };
  }

  await deps.checkReachable();

  let failed: SyncResult['failed'];
  for (const [i, date] of plan.dates.entries()) {
    const dayStart = Date.now();
    let zipPath: string | undefined;
    try {
      const dl = await deps.downloadDay(toYyyymmdd(date));
      zipPath = dl.zipPath;
      const ingest = await deps.ingestDay(zipPath);
      const r: SyncDayResult = {
        date,
        status: 'ingested',
        ingest,
        bytes: dl.bytes,
        durationMs: Date.now() - dayStart,
      };
      days.push(r);
      store.markSynced(date);
      deps.onDay?.(r, i, plan.dates.length);
    } catch (err) {
      if (isNoDiffResponse(err)) {
        const r: SyncDayResult = { date, status: 'empty', durationMs: Date.now() - dayStart };
        days.push(r);
        store.markSynced(date);
        deps.onDay?.(r, i, plan.dates.length);
        continue;
      }
      failed = { date, message: (err as Error).message ?? String(err) };
      break;
    } finally {
      if (zipPath && deps.cleanupDay) await deps.cleanupDay(zipPath).catch(() => {});
    }
  }

  return { plan, days, failed, lastSyncDate: store.lastSyncDate(), durationMs: Date.now() - start };
}

/** SQLite の sync_state を SyncStore として扱う */
export function createSqliteSyncStore(db: DatabaseT.Database): SyncStore {
  return {
    lastSyncDate() {
      const row = db.prepare('SELECT last_sync_date FROM sync_state WHERE id = 1').get() as
        | { last_sync_date: string }
        | undefined;
      return row?.last_sync_date ?? null;
    },
    markSynced(dateIso) {
      upsertSyncState(db, {
        last_sync_date: dateIso,
        last_full_dl_at: null, // 既存の値を保つ
        total_laws: countLaws(db),
        bulk_source: 'incremental',
      });
    },
  };
}
