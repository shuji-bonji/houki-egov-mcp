# 差分: cli_status（20261001-t2-error-codes）

`specs/current/cli_status/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-CLI-STATUS-009 同期の記録の日付を解釈できないときは `[ERROR]` を出して exit 1

`sync_state.last_sync_date` が日付・時刻として解釈できない（空文字、`2026/05/08`、`2026-02-30` など）ときは、1〜4 行目（`[status] …`・`  DB: …`・`  laws: …`・`  articles: …`）を標準出力に出した後、標準エラー出力に `[ERROR] 同期の記録を読めません: <last_sync_date の値>（houki-egov-mcp --bulk-download-everything で作り直してください）` を出し、同期の欄（SPEC-EGOV-CLI-STATUS-002〜004・007）を出さずに終了コード 1 で終わる（SPEC-EGOV-COMMON-ERRORS-031 の CLI での形）。例外のまま終わらない。

例: `sync_state.last_sync_date` を `2026/05/08` に書き換えた DB で `houki-egov-mcp --status` を実行すると、標準エラー出力に `[ERROR] 同期の記録を読めません: 2026/05/08（houki-egov-mcp --bulk-download-everything で作り直してください）` を出して終了コード 1。`2026-05-08` の DB では今までどおり同期の欄を出して終了コード 0。
