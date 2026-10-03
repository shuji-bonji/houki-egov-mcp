# 差分: get_law_range（20261003-law-resolution）

`specs/current/get_law_range/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- SPEC-EGOV-GET-LAW-RANGE-019 の見出しの次に「429 以外の 4xx は SPEC-EGOV-GET-LAW-RANGE-035。」の 1 文を足す（表は変えない）
- 「未決」の 9（→ #45）の行を消す

## ADDED

### SPEC-EGOV-GET-LAW-RANGE-034 法令名が完全一致しないときは、範囲の条を返さず候補を付けた `LAW_NOT_FOUND` を返す

`law_name` の法令は SPEC-EGOV-COMMON-ERRORS-032 の規則で決める。略称辞書に law_id が無く、e-Gov の法令名検索の全件の中に題名の完全一致が無いときは、検索結果の先頭の法令の範囲を返さず、032 の形の `LAW_NOT_FOUND`（`retryable: false`）を返す。`next_actions` の候補の要素は `action: "get_law_range"`、`example` は渡した引数（範囲の指定・`from_article`・`max_chars`・`at` のうち渡したもの）の `law_name` だけを候補の題名に替えたもの。`at` を渡したときは、法令名の検索にも `asof=<at>` を付ける。

例: `{ law_name: "所得税法施行", chapter: 1 }` は `code: "LAW_NOT_FOUND"`、`next_actions` の先頭 2 件は `{ action: "get_law_range", example: { law_name: "所得税法施行令", chapter: 1 } }` と `{ action: "get_law_range", example: { law_name: "所得税法施行規則", chapter: 1 } }`、3 件目は `search_law`。

### SPEC-EGOV-GET-LAW-RANGE-035 法令本文の取得で e-Gov が 404・時点の 400 を返したときは `LAW_NOT_FOUND`・`INVALID_ARGUMENT`

法令を決めた後の法令本文の取得で e-Gov が 429 以外の 4xx を返したときは、SPEC-EGOV-COMMON-ERRORS-033 の表のとおりに返す。404・`404004` は `LAW_NOT_FOUND`（`retryable: false`）、400・`400044` は `INVALID_ARGUMENT`（`tool: "get_law_range"`、`detail.issues[0].path: "at"`）、そのほかの 4xx は `SOURCE_API_ERROR`（`retryable: false`、`detail.status`）。

例: `{ law_name: "消費税法", chapter: 1, at: "2000-01-01" }` は `code: "INVALID_ARGUMENT"`、`detail.issues: [{ path: "at", message: "e-Gov が受け付ける時点の範囲の外です" }]`。
