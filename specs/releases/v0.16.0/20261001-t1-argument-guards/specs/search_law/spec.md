# 差分: search_law（20261001-t1-argument-guards）

`specs/current/search_law/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「入力」の表の `limit` の行を「取得件数。既定は 10。1 以上 50 以下の整数（SPEC-EGOV-SEARCH-LAW-013）」にする

## MODIFIED

### SPEC-EGOV-SEARCH-LAW-001 空の keyword は検索せずにエラー `INVALID_ARGUMENT` を返す

`keyword` が空文字のときは、inputSchema の `minLength: 1` の検査（SPEC-EGOV-COMMON-ERRORS-025）で止まり、e-Gov を検索せずにエラー `INVALID_ARGUMENT` を返す。本文は inputSchema の検査のエラーの形（SPEC-EGOV-COMMON-ERRORS-013・014・020・021・022）で、`tool: "search_law"`、`detail.issues` は `[{ path: "keyword", message: "空文字は指定できません" }]`。

例: `keyword: ""` は `isError: true`・`code: "INVALID_ARGUMENT"`・`tool: "search_law"`・`error: "引数が tools/list の inputSchema に合いません: keyword: 空文字は指定できません"` で、e-Gov への問い合わせは 0 回。

### SPEC-EGOV-SEARCH-LAW-007 空白だけの keyword も検索せずにエラー `INVALID_ARGUMENT` を返す

`keyword` が空白（半角スペース・全角スペース・タブ・改行）だけのときは、e-Gov に問い合わせずにエラー `INVALID_ARGUMENT` を返す。本文は SPEC-EGOV-COMMON-ERRORS-026 の形で、`tool: "search_law"`、`error: "keyword が空です"`、`detail.issues` は `[{ path: "keyword", message: "空白だけは指定できません" }]`、`hint` には検索したい法令名・略称・キーワードを指定するよう書く（例: `"消費税"`、`"労基"`）。

例: `keyword: "   "` と `keyword: "\t\n"` は、どちらも `isError: true`・`code: "INVALID_ARGUMENT"`・`tool: "search_law"`・`error: "keyword が空です"`・`detail.issues[0].path: "keyword"` で、e-Gov への問い合わせは 0 回。

## ADDED

### SPEC-EGOV-SEARCH-LAW-013 `limit` は 1 以上 50 以下の整数で、範囲の外は `INVALID_ARGUMENT` にして丸めない

tools/list の inputSchema の `limit` は `type: "integer"`、`minimum: 1`、`maximum: 50` を持つ（SPEC-EGOV-COMMON-ERRORS-023）。0・負の数・小数・51 以上・数値でない値を渡すと、inputSchema の検査で `INVALID_ARGUMENT`（`tool: "search_law"`、`detail.issues[0].path: "limit"`）を返し、e-Gov に問い合わせない。50 以下に切り詰めたり、既定の 10 に戻したりしない。1 以上 50 以下の整数は、その件数を e-Gov に渡す。

例: `keyword: "消費税", limit: 100` は `code: "INVALID_ARGUMENT"`、`detail.issues` は `[{ path: "limit", message: "50 以下で指定してください" }]` で、e-Gov への問い合わせは 0 回（v0.15.4 では 100 件返っていた）。`limit: 0` は `[{ path: "limit", message: "1 以上で指定してください" }]`、`limit: 2.5` は `[{ path: "limit", message: "整数で指定してください" }]`、`limit: "10"` も `整数で指定してください`。`limit: 50` は e-Gov の `/laws` を `limit=50` で引く。`limit: 1` は `limit=1` で引く。
