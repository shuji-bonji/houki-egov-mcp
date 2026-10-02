# 差分: search_fulltext（20261001-t2-error-codes）

`specs/current/search_fulltext/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-SEARCH-FULLTEXT-035 同期の記録の日付を解釈できないときは `INTERNAL_ERROR`（`retryable: false`）を返し、全件の取り込みを案内する

`source: "bulk"` の検索で、`freshness`（SPEC-EGOV-SEARCH-FULLTEXT-023）を計算するときに `sync_state.last_sync_date` が日付・時刻として解釈できない（空文字、`2026/05/08`、`2026-02-30` など）ときは、想定外の例外として止まらず、SPEC-EGOV-COMMON-ERRORS-031 の形のエラー `INTERNAL_ERROR`（`retryable: false`、`error` にその値、`hint` に `houki-egov-mcp --bulk-download-everything` で作り直す案内、`detail.cause` に例外の文）を返す。`hits` は返さない。同期の記録が無い（`sync_state` に行が無い）ときは今までどおり `freshness: null` で、エラーにしない。

例: `sync_state.last_sync_date` を `2026/05/08` に書き換えた DB で `{ keyword: "軽減税率" }` を渡すと、`code: "INTERNAL_ERROR"`、`retryable: false`、`error` に `2026/05/08` を含む。`last_sync_date` が `2026-05-08` の DB では、今までどおり `hits` と `freshness` を返す。
