# 差分: verify_citations（20261001-t2-error-codes）

`specs/current/verify_citations/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-VERIFY-CITATIONS-043 e-Gov との通信と関係の無い例外は `SOURCE_*` にせず `INTERNAL_ERROR` にする

件ごとの判定の途中で、e-Gov への要求の失敗（SPEC-EGOV-COMMON-ERRORS-027 の表）ではない例外が起きたとき（条文の解析の失敗など）は、ツール全体のエラーを `SOURCE_API_ERROR` にせず、SPEC-EGOV-COMMON-ERRORS-007 の `INTERNAL_ERROR`（`error` は `内部エラーが発生しました: <例外の文>`、`detail.cause` に例外の文）にする。e-Gov への要求の失敗は今までどおり SPEC-EGOV-VERIFY-CITATIONS-034〜036 と SPEC-EGOV-COMMON-ERRORS-028（接続できないとき `SOURCE_UNAVAILABLE`）で、どちらの場合も件ごとの判定（`results`）は返さない。

例: 法令本文の応答を読む処理が `Error("boom")` を投げる状態で `citations: [{ law_name: "所得税法", article: "9" }]` を渡すと、`code: "INTERNAL_ERROR"`、`detail.cause: "boom"` で、`SOURCE_API_ERROR` ではない（v0.15.4 では `SOURCE_API_ERROR`・`retryable: true` だった）。法令本文の取得が 503 のときは今までどおり `SOURCE_API_ERROR`。
