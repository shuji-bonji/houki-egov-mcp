# 差分: get_law_revisions（20261003-law-resolution）

`specs/current/get_law_revisions/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「未決」の 4（→ #45）の行を消す

## MODIFIED

### SPEC-EGOV-GET-LAW-REVISIONS-008 改正履歴の取得で e-Gov が 404・`404001` を返したときは `LAW_NOT_FOUND`、そのほかの 429 と 500 番台以外の HTTP エラーは retryable: false の SOURCE_API_ERROR を返す

改正履歴の取得で e-Gov が 404 を返し、応答本文の `code` が `404001`（`取得結果が０件です。`）のときは、取り直さずにエラー `LAW_NOT_FOUND`（`retryable: false`）を返す。`error` は `e-Gov に law_id <law_id> の法令がありません`、`hint` と `next_actions` は SPEC-EGOV-COMMON-ERRORS-033 の `at` を渡さないときの文、`detail` は `status: 404`・`url`・`cause: "404001"`。

それ以外の 429 と 500 番台以外の HTTP エラー（400、`404001` 以外の 404 など）は、今までどおり取り直さずにエラー `code: "SOURCE_API_ERROR"`、`retryable: false` を返す。`next_actions` は付けず、`detail` に `status` と `url` が入る。

例: 2026-10-03 10:12 JST に e-Gov の `/law_revisions/999AC0000000999` は 404・`{"code":"404001","message":"取得結果が０件です。"}` を返した。改正履歴の取得がこの応答になる状態で `{ law_name: "消法" }` を渡すと、e-Gov を 1 回だけ呼んで `code: "LAW_NOT_FOUND"`、`retryable: false`、`detail.cause: "404001"`（v0.17.0 では `SOURCE_API_ERROR`）。400 は `SOURCE_API_ERROR`・`retryable: false`・`detail.status: 400` のまま。

## ADDED

### SPEC-EGOV-GET-LAW-REVISIONS-018 法令名が完全一致しないときは、改正履歴を返さず候補を付けた `LAW_NOT_FOUND` を返す

`law_name` の法令は SPEC-EGOV-COMMON-ERRORS-032 の規則で決める（このツールは `at` を受け取らないので、法令名の検索に `asof` を付けない）。略称辞書に law_id が無く、e-Gov の法令名検索の全件の中に題名の完全一致が無いときは、検索結果の先頭の法令の改正履歴を返さず、032 の形の `LAW_NOT_FOUND`（`retryable: false`）を返す。`next_actions` の候補の要素は `action: "get_law_revisions"`、`example` は渡した引数（`latest` を渡したときはそれも）の `law_name` だけを候補の題名に替えたもの。

例: `{ law_name: "所得税法施行", latest: 2 }` は `code: "LAW_NOT_FOUND"`、`next_actions` の先頭は `{ action: "get_law_revisions", example: { law_name: "所得税法施行令", latest: 2 } }`。
