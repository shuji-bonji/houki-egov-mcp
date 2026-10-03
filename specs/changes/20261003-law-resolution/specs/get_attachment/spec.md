# 差分: get_attachment（20261003-law-resolution）

`specs/current/get_attachment/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-GET-ATTACHMENT-030 法令名が完全一致しないときは、添付を取らず候補を付けた `LAW_NOT_FOUND` を返す

`law_name` の法令は SPEC-EGOV-COMMON-ERRORS-032 の規則で決める。略称辞書に law_id が無く、e-Gov の法令名検索の全件の中に題名の完全一致が無いときは、検索結果の先頭の法令の添付を選ばず、`save` の値にかかわらず e-Gov から法令本文も添付ファイルも取らずに、032 の形の `LAW_NOT_FOUND`（`retryable: false`）を返す。`next_actions` の候補の要素は `action: "get_attachment"`、`example` は渡した引数（`src`・`save`・`at` のうち渡したもの）の `law_name` だけを候補の題名に替えたもの。`at` を渡したときは、法令名の検索にも `asof=<at>` を付ける。SPEC-EGOV-GET-ATTACHMENT-016 の `next_actions`（`resolve_abbreviation`・`search_law`）は、法令名の検索が 0 件のときのもので、この場合は 032 の `next_actions` になる。

例: `{ law_name: "所得税法施行", src: "./pict/a.jpg" }` は `code: "LAW_NOT_FOUND"`、`next_actions` の先頭は `{ action: "get_attachment", example: { law_name: "所得税法施行令", src: "./pict/a.jpg" } }`。

### SPEC-EGOV-GET-ATTACHMENT-031 法令本文の取得で e-Gov が 404・時点の 400 を返したときは `LAW_NOT_FOUND`・`INVALID_ARGUMENT`

添付の一覧を作るための法令本文の取得（`/law_data/<law_id>`）で e-Gov が 429 以外の 4xx を返したときは、SPEC-EGOV-LIST-ATTACHMENTS-018 の表と同じに返す（404・`404004` は `LAW_NOT_FOUND`、400・`400044` は `INVALID_ARGUMENT`（`tool: "get_attachment"`、`detail.issues[0].path: "at"`）、そのほかの 4xx は `SOURCE_API_ERROR`・`retryable: false`）。添付ファイルの取得（`/attachment`）の 4xx は、今までどおり SPEC-EGOV-GET-ATTACHMENT-010・018。

例: `{ law_name: "民法", src: "./pict/a.jpg", at: "2000-01-01" }` は、法令本文の取得に e-Gov が 400・`400044` を返すので `code: "INVALID_ARGUMENT"`、`tool: "get_attachment"`。
