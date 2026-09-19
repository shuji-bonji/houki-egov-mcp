/**
 * CLI ハンドラ — Phase 2-6
 *
 * `houki-egov-mcp` バイナリを引数なしで起動すると MCP server として常駐するが、
 * 以下のフラグ付きで起動すると bulk DL / status を実行して exit する。
 *
 *   --bulk-download-everything       file_section=1 で全件 DL + DB ingest
 *   --sync                            sync_state.last_sync_date から今日までの差分を日ごとに DL + ingest
 *   --bulk-download-by-date YYYYMMDD file_section=3 で 1 日分の差分 DL + ingest (デバッグ用)
 *   --status                          sync_state + DB 件数 + freshness を表示
 *   --help / -h                       使い方
 *
 * 設計詳細: docs/PHASE2-DESIGN.md §4
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BULK_CONFIG, EGOV_BULK, HTTP_CONFIG, PACKAGE_INFO } from '../config.js';
import { closeDb, defaultDbPath, openDb } from '../db/index.js';
import { type IngestResult, ingestZip } from '../services/bulk/ingester.js';
import {
  createSqliteSyncStore,
  runSync,
  type SyncDayResult,
  type SyncResult,
} from '../services/bulk/sync.js';
import {
  BulkFetchError,
  type BulkProgress,
  downloadFullZip,
  downloadIncrementalZip,
} from '../services/bulk/zip-fetcher.js';
import { openZipFile } from '../services/bulk/zip-reader.js';
import { summarizeFreshness } from '../services/freshness.js';

/** CLI ハンドラの戻り値 */
export interface CliResult {
  /** プロセス exit code */
  exitCode: number;
  /** どの command を処理したか (default = `'mcp-server'` で MCP fallback) */
  command: string;
}

/** 引数なし or 認識できないフラグなら MCP fallback として呼び出し元に委ねる */
const NOT_A_COMMAND = '__not_cli__';

/**
 * CLI を実行する。CLI コマンドにマッチしなかった場合は `'__not_cli__'` を返し、
 * 呼び出し側 (index.ts) が MCP server 起動にフォールバックする。
 */
export async function runCli(argv: string[]): Promise<CliResult> {
  // argv は process.argv をそのまま受ける想定 (argv[0] = node, argv[1] = script)
  const args = argv.slice(2);

  if (args.length === 0) {
    return { exitCode: 0, command: NOT_A_COMMAND };
  }

  const cmd = args[0];

  if (cmd === '--help' || cmd === '-h') {
    printHelp();
    return { exitCode: 0, command: 'help' };
  }

  if (cmd === '--version' || cmd === '-v') {
    console.log(`${PACKAGE_INFO.name} v${PACKAGE_INFO.version}`);
    return { exitCode: 0, command: 'version' };
  }

  if (cmd === '--bulk-download-everything') {
    return await runBulkDownloadEverything();
  }

  // --bulk-download-incremental は PHASE2-DESIGN.md で予定していた名前。同じ動作
  if (cmd === '--sync' || cmd === '--bulk-download-incremental') {
    return await runSyncCommand();
  }

  if (cmd === '--bulk-download-by-date') {
    const date = args[1];
    if (!date || !/^\d{8}$/.test(date)) {
      console.error(
        'ERROR: --bulk-download-by-date は YYYYMMDD 形式の日付を必要とします (例: 20260507)'
      );
      return { exitCode: 2, command: 'bulk-download-by-date' };
    }
    return await runBulkDownloadByDate(date);
  }

  if (cmd === '--status') {
    return await runStatus();
  }

  // 認識できないフラグ — MCP server に委ねる前にエラー (誤入力検知)
  if (cmd.startsWith('--') || cmd.startsWith('-')) {
    console.error(`ERROR: 未知のフラグ: ${cmd}`);
    printHelp();
    return { exitCode: 2, command: 'unknown' };
  }

  // それ以外 (位置引数のみ) は MCP fallback
  return { exitCode: 0, command: NOT_A_COMMAND };
}

/** `runCli` の結果が MCP fallback を意味するかを判定 */
export function shouldFallbackToMcp(result: CliResult): boolean {
  return result.command === NOT_A_COMMAND;
}

/** 全件 bulk DL + ingest */
async function runBulkDownloadEverything(): Promise<CliResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'houki-egov-bulk-'));
  const zipPath = join(tmpDir, 'all_xml.zip');
  const dbPath = defaultDbPath();
  const startedAt = Date.now();

  console.error(`[bulk-download-everything] 全件 zip を取得します`);
  console.error(`  保存先 zip: ${zipPath}`);
  console.error(`  DB:         ${dbPath}`);

  try {
    // 1) Download
    console.error(`[1/2] zip ダウンロード中...`);
    const dl = await downloadFullZip({
      dest: zipPath,
      onProgress: (p) => printProgress(p, 'DL'),
    });
    console.error(
      `\n  DL 完了: ${formatBytes(dl.bytes)} / ${formatDuration(dl.durationMs)} / attempts=${dl.attempts}`
    );

    // 2) Ingest
    console.error(`[2/2] DB に ingest 中...`);
    const db = openDb(dbPath);
    let result: IngestResult;
    try {
      const zip = await openZipFile(zipPath);
      result = await ingestZip({
        db,
        zip,
        source: 'all_xml',
        onProgress: (p) =>
          process.stderr.write(
            `\r  ingest: ${p.processed.toString().padStart(6)} / ${p.total} laws`
          ),
      });
    } finally {
      closeDb(db);
    }
    console.error('');
    console.error(`  ingest 完了: ${formatIngestResult(result)}`);

    const totalMs = Date.now() - startedAt;
    console.error(`[完了] 全体 ${formatDuration(totalMs)}`);
    return { exitCode: 0, command: 'bulk-download-everything' };
  } catch (err) {
    console.error(`[ERROR] ${(err as Error).message ?? err}`);
    return { exitCode: 1, command: 'bulk-download-everything' };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** 単日差分 bulk DL + ingest (デバッグ用) */
async function runBulkDownloadByDate(yyyymmdd: string): Promise<CliResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'houki-egov-diff-'));
  const zipPath = join(tmpDir, `R${yyyymmdd.slice(2)}.zip`);
  const dbPath = defaultDbPath();

  console.error(`[bulk-download-by-date] update_date=${yyyymmdd} の差分 zip を取得します`);
  console.error(`  保存先 zip: ${zipPath}`);
  console.error(`  DB:         ${dbPath}`);

  try {
    console.error(`[1/2] 差分 zip ダウンロード中...`);
    const dl = await downloadIncrementalZip(yyyymmdd, {
      dest: zipPath,
      // 差分は数 MB なので expectedBytes を小さく
      expectedBytes: 5_000_000,
      onProgress: (p) => printProgress(p, 'DL'),
    });
    console.error(`\n  DL 完了: ${formatBytes(dl.bytes)} / ${formatDuration(dl.durationMs)}`);

    console.error(`[2/2] DB に ingest 中...`);
    const db = openDb(dbPath);
    let result: IngestResult;
    try {
      const zip = await openZipFile(zipPath);
      result = await ingestZip({ db, zip, source: 'incremental' });
    } finally {
      closeDb(db);
    }
    console.error(`  ingest 完了: ${formatIngestResult(result)}`);
    return { exitCode: 0, command: 'bulk-download-by-date' };
  } catch (err) {
    console.error(`[ERROR] ${(err as Error).message ?? err}`);
    return { exitCode: 1, command: 'bulk-download-by-date' };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * 差分同期: last_sync_date 〜 今日 (JST) の差分 zip を日ごとに DL + ingest。
 * 計画と進行は services/bulk/sync.ts が持ち、ここは実 DL / ingest と表示だけ
 */
async function runSyncCommand(): Promise<CliResult> {
  const command = 'sync';
  const dbPath = defaultDbPath();
  const tmpDir = await mkdtemp(join(tmpdir(), 'houki-egov-sync-'));

  console.error(`[sync] 差分同期`);
  console.error(`  DB: ${dbPath}`);

  const db = openDb(dbPath);
  try {
    const store = createSqliteSyncStore(db);
    const result = await runSync({
      store,
      limitDays: BULK_CONFIG.incrementalLimitDays,
      checkReachable: async () => {
        const res = await fetch(EGOV_BULK.indexUrl, {
          method: 'HEAD',
          headers: { 'User-Agent': HTTP_CONFIG.userAgent },
        });
        if (!res.ok) {
          throw new BulkFetchError(
            `e-Gov に接続できません (HTTP ${res.status} from ${EGOV_BULK.indexUrl})`
          );
        }
      },
      downloadDay: async (yyyymmdd) => {
        const zipPath = join(tmpDir, `R${yyyymmdd.slice(2)}.zip`);
        const dl = await downloadIncrementalZip(yyyymmdd, {
          dest: zipPath,
          expectedBytes: 5_000_000,
        });
        return { zipPath, bytes: dl.bytes };
      },
      ingestDay: async (zipPath) => {
        const zip = await openZipFile(zipPath);
        return ingestZip({ db, zip, source: 'incremental', updateSyncState: false });
      },
      cleanupDay: (zipPath) => rm(zipPath, { force: true }),
      onDay: (r, i, total) => console.error(`  [${i + 1}/${total}] ${formatSyncDay(r)}`),
    });
    return { exitCode: printSyncResult(result), command };
  } catch (err) {
    console.error(`[ERROR] ${(err as Error).message ?? err}`);
    return { exitCode: 1, command };
  } finally {
    closeDb(db);
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** 同期結果を表示し、exit code を返す */
function printSyncResult(r: SyncResult): number {
  const { plan } = r;
  if (plan.kind === 'no-state') {
    console.error(
      `[sync] まだ全件取り込みが行われていません。先に --bulk-download-everything を実行してください`
    );
    return 1;
  }
  if (plan.kind === 'full-required') {
    console.error(
      `[sync] last_sync_date ${plan.lastSyncDate} から ${plan.daysSince} 日空いています。日次差分の公開範囲 (${plan.limitDays} 日) を超えているので、--bulk-download-everything を実行してください`
    );
    return 1;
  }

  const ingested = r.days.filter((d) => d.status === 'ingested');
  const empty = r.days.filter((d) => d.status === 'empty');
  const upserted = ingested.reduce((n, d) => n + (d.ingest?.upserted ?? 0), 0);
  const unchanged = ingested.reduce((n, d) => n + (d.ingest?.unchanged ?? 0), 0);
  const failedLaws = ingested.reduce((n, d) => n + (d.ingest?.failed ?? 0), 0);

  if (r.failed) {
    console.error(`[ERROR] ${r.failed.date}: ${r.failed.message}`);
    if (r.days.length > 0) {
      console.error(
        `  ${r.lastSyncDate} までを last_sync_date に記録しました (${r.days.length} 日分を確認、${upserted} 件 upsert)。再実行すると続きから同期します`
      );
    } else {
      console.error(`  last_sync_date は ${r.lastSyncDate} のままです`);
    }
    return 1;
  }

  const parts = [`${r.days.length} 日分を確認 (${plan.from} 〜 ${plan.to})`];
  if (upserted > 0) {
    parts.push(`${ingested.length} 日に差分あり: ${upserted} 件 upsert, ${unchanged} 件 unchanged`);
  } else if (unchanged > 0) {
    parts.push(`新たに取り込んだ法令はありません (確認した ${unchanged} 件はすべて取り込み済み)`);
  } else {
    parts.push('新たに取り込んだ法令はありません');
  }
  if (empty.length > 0) parts.push(`${empty.length} 日は差分なし`);
  if (failedLaws > 0) parts.push(`${failedLaws} 件は XML を読めず skip`);
  console.error(`[完了] ${parts.join('、')}。全体 ${formatDuration(r.durationMs)}`);
  console.error(`  last_sync_date: ${r.lastSyncDate}`);
  return 0;
}

function formatSyncDay(d: SyncDayResult): string {
  if (d.status === 'empty' || !d.ingest) return `${d.date}: 差分なし`;
  const size = d.bytes === undefined ? '' : `${formatBytes(d.bytes)}, `;
  return `${d.date}: ${formatIngestCounts(d.ingest)} (${size}${formatDuration(d.durationMs)})`;
}

/** sync_state + 件数 + freshness をターミナルに表示 */
async function runStatus(): Promise<CliResult> {
  const dbPath = defaultDbPath();
  console.log(`[status] ${PACKAGE_INFO.name} v${PACKAGE_INFO.version}`);
  console.log(`  DB: ${dbPath}`);

  let db: ReturnType<typeof openDb>;
  try {
    db = openDb(dbPath);
  } catch (err) {
    console.error(`[ERROR] DB を開けません: ${(err as Error).message}`);
    return { exitCode: 1, command: 'status' };
  }

  try {
    const lawsCount = (db.prepare('SELECT count(*) as c FROM laws').get() as { c: number }).c;
    const articlesCount = (db.prepare('SELECT count(*) as c FROM articles').get() as { c: number })
      .c;
    const fresh = summarizeFreshness(db);

    console.log(`  laws:     ${lawsCount.toLocaleString()}`);
    console.log(`  articles: ${articlesCount.toLocaleString()}`);
    if (!fresh) {
      console.log(`  sync:     (まだ bulk DL されていません — --bulk-download-everything を実行)`);
    } else {
      console.log(`  sync:`);
      console.log(`    last_sync_date:  ${fresh.last_sync_date}`);
      console.log(`    last_full_dl_at: ${fresh.last_full_dl_at}`);
      console.log(`    days_since_sync: ${fresh.days_since_sync}`);
      console.log(`    staleness:       ${fresh.staleness}`);
      if (fresh.warning) {
        console.log(`  ⚠ ${fresh.warning}`);
      } else if (fresh.days_since_sync > 0) {
        console.log(`  差分を取り込むには --sync を実行してください`);
      }
    }
    return { exitCode: 0, command: 'status' };
  } finally {
    closeDb(db);
  }
}

/** ヘルプ */
function printHelp(): void {
  console.log(`${PACKAGE_INFO.name} v${PACKAGE_INFO.version}

USAGE:
  houki-egov-mcp                                 MCP server を起動 (default)
  houki-egov-mcp --bulk-download-everything      全件 zip (約 290 MB) を DL + DB に ingest。初回と、
                                                  最終同期から 90 日を超えたとき
  houki-egov-mcp --sync                           最終同期日から今日までの日次差分を DL + ingest。
                                                  差分が無い日は飛ばし、途中で失敗しても
                                                  成功した日までを記録する
  houki-egov-mcp --bulk-download-by-date YYYYMMDD  単日差分を DL + ingest (デバッグ用)
  houki-egov-mcp --status                         同期状態と DB 件数を表示
  houki-egov-mcp --version                        バージョン表示
  houki-egov-mcp --help                           この使い方を表示

ENVIRONMENT:
  HOUKI_EGOV_DB_PATH=/path/to.db    DB ファイルパスを上書き
                                     (default: \${XDG_CACHE_HOME:-~/.cache}/houki-egov-mcp/laws.db)
  HOUKI_EGOV_BULK_RETRY=3           bulk DL 失敗時のリトライ回数
  HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS=90
                                    --sync が差分で追える最大日数 (超えたら全件取り込みを促す)

DOCS:
  docs/PHASE2-DESIGN.md             設計詳細
  docs/PHASE2-SPIKE.md              e-Gov bulk DL 仕様
`);
}

/** progress を 1 行に上書き表示 */
function printProgress(p: BulkProgress, prefix: string): void {
  const pct = (p.ratio * 100).toFixed(1).padStart(5);
  process.stderr.write(
    `\r  ${prefix}: ${formatBytes(p.bytesDownloaded)} / ~${formatBytes(p.totalEstimated)} (${pct}%)`
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}

function formatIngestResult(r: IngestResult): string {
  return `${formatIngestCounts(r)} (${formatDuration(r.durationMs)})`;
}

function formatIngestCounts(r: IngestResult): string {
  const parts: string[] = [`${r.upserted} 件 upsert`];
  if (r.unchanged > 0) parts.push(`${r.unchanged} 件 unchanged`);
  if (r.failed > 0) parts.push(`${r.failed} 件 failed`);
  return parts.join(', ');
}
