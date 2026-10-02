# 差分: get_law_range（20261002-t1-followups）

`specs/current/get_law_range/spec.md` に対する差分です。見出しの単位で置き換えます。差分 `20261001-t1-argument-guards`・`20261001-t2-error-codes`・`20261001-t3-normalize` の後に取り込みます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える

## MODIFIED

### SPEC-EGOV-GET-LAW-RANGE-023 範囲外の `max_chars` は tools/call で INVALID_ARGUMENT にする

tools/call（`get_law_range`）で、`max_chars` に 2,000 未満または 120,000 を超える値を渡すと、inputSchema の検査でエラー `INVALID_ARGUMENT` を返す。`detail.issues[0].path` は `max_chars`。`detail.issues[0].message` は SPEC-EGOV-COMMON-ERRORS-022 の表の `minimum` / `maximum` の行の文で、検査の部品が作る英文（`must be >= 2000` など）は返さない。

例: `max_chars: 1999` では `code: "INVALID_ARGUMENT"`、`detail.issues` は `[{ path: "max_chars", message: "2000 以上で指定してください" }]`。`max_chars: 120001` では `detail.issues` は `[{ path: "max_chars", message: "120000 以下で指定してください" }]`。
