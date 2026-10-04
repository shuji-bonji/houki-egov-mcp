# 差分: common_errors（20261004-db-location）

`specs/current/common_errors/spec.md` に対する差分です。

- `MODIFIED` は、見出しの行（題）も含めて、current の同じ ID の見出しと本文をこの差分の見出しと本文に置き換える
- 冒頭の「関連する Issue」に `houki-egov-mcp #108（0.20.0）` を足す

## MODIFIED

### SPEC-EGOV-COMMON-ERRORS-031 同期の記録の日付を解釈できないときは `INTERNAL_ERROR`（`retryable: false`）にし、全件の取り込みを案内する

ローカル DB の `sync_state.last_sync_date` が、日付（`YYYY-MM-DD`）または時差付きの時刻（`YYYY-MM-DDTHH:MM:SSZ` / `+09:00`）として解釈できないとき（空文字、`2026/05/08` のような別の書き方、`2026-02-30` のような暦に無い日付）、鮮度（`freshness`）を計算するツールは、想定外の例外として止まらず、エラー `INTERNAL_ERROR` を返す。

- `retryable`: `false`（時間をおいても DB の値は変わらない）
- `error`: `同期の記録の日付を読めません: <last_sync_date の値>`
- `hint`: `--bulk-download-everything` を付けた案内のコマンド（SPEC-EGOV-DB-SCHEMA-029）で同期の記録を作り直す案内（`next_actions` は付けない。CLI を案内する `action` の名前が houki-egov-mcp には無いため）
- `detail.cause`: 元の例外の文（houki-abbreviations の `computeDaysSince` が投げる `RangeError` の文）

当てはまるのは `search_fulltext`（SPEC-EGOV-SEARCH-FULLTEXT-035）と CLI の `--status`（SPEC-EGOV-CLI-STATUS-009。CLI なので JSON ではなく標準エラー出力）である。取り込みが書く `last_sync_date` は `YYYY-MM-DD` なので、取り込みを通した DB ではこのエラーは起きない。

例: `sync_state.last_sync_date` を `2026/05/08` に書き換えた DB で、環境変数を付けずに起動した MCP サーバーの `search_fulltext` に `{ keyword: "軽減税率" }` を渡すと、`code: "INTERNAL_ERROR"`、`retryable: false`、`error` に `2026/05/08` を含み、`hint` に `npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything` を含み（v0.19.x では `houki-egov-mcp --bulk-download-everything`）、`hits` は返さない。
