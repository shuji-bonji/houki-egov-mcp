# 差分: get_law_file（20261001-t2-error-codes）

`specs/current/get_law_file/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-GET-LAW-FILE-020 法令名の検索が通信の失敗で終わったときは `LAW_NOT_FOUND` ではなく `SOURCE_*` を返す

`law_name` が略称辞書に law_id 付きで無く、e-Gov の法令名検索で law_id を決めるとき、その検索が通信の失敗（接続できない・時間切れ・5xx・429・429 以外の 4xx）で終わったときは、SPEC-EGOV-COMMON-ERRORS-027 の表の code（`SOURCE_UNAVAILABLE` / `SOURCE_TIMEOUT` / `SOURCE_API_ERROR` / `SOURCE_RATE_LIMITED`）を、表の `retryable` と `detail` 付きで返す（SPEC-EGOV-COMMON-ERRORS-029）。`LAW_NOT_FOUND`（SPEC-EGOV-GET-LAW-FILE-012）は、検索が成功して 0 件だったときだけ返す。`SOURCE_*` のときの `next_actions` に `resolve_abbreviation` / `search_law` は入れない。

例: 法令名の検索が 503 を返す状態で `{ law_name: "架空の法律", file_type: "xml", save: true }` を渡すと、`code: "SOURCE_API_ERROR"`、`retryable: true`、`detail.status: 503`（v0.15.4 では `LAW_NOT_FOUND` だった）。検索が時間切れなら `SOURCE_TIMEOUT`、接続できなければ `SOURCE_UNAVAILABLE`（`detail.cause: "ENOTFOUND"` など）、400 なら `SOURCE_API_ERROR`・`retryable: false`。検索が 0 件で成功したときは `LAW_NOT_FOUND` のまま。

### SPEC-EGOV-GET-LAW-FILE-021 上限（50 MB）を超えるファイルは `FILE_TOO_LARGE` で断り、Content-Length で分かるときは本文を読まない

`save: true` の取得で、ファイルが 50 MB（52,428,800 バイト）を超えているときは、エラー `FILE_TOO_LARGE`（`retryable: false`）を返し、保存しない（SPEC-EGOV-COMMON-ERRORS-030）。`INVALID_ARGUMENT` にはしない。大きさは次の順で確かめる。

1. e-Gov の応答ヘッダーに Content-Length があり、その値が上限を超えていれば、本文を読まずにエラーにする（`detail.bytes` は Content-Length の値）
2. Content-Length が無いか上限以下のときは本文を読み、読み終えた大きさが上限を超えていればエラーにする（`detail.bytes` は読み終えた大きさ）。途中で打ち切らない

`error` は `ファイルが大きすぎます: <大きさ>（上限 50.0 MB）`、`hint` は `保存せず url をそのまま使ってください`、`detail.url` は取得した URL（`at` があれば `?asof=<at>` 付き）。

例: Content-Length が `52428801` のとき、`{ law_name: "民法", file_type: "xml", save: true }` は `code: "FILE_TOO_LARGE"`、`retryable: false`、`detail.bytes: 52428801` で、本文は読まず、ファイルは書かない（v0.15.4 では全部読んでから `INVALID_ARGUMENT` だった）。Content-Length が無く本文が 52,428,801 バイトのときも `FILE_TOO_LARGE`。Content-Length が `52428800`（ちょうど 50 MB）は保存する。
