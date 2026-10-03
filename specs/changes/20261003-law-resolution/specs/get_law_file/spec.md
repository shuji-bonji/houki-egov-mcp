# 差分: get_law_file（20261003-law-resolution）

`specs/current/get_law_file/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## MODIFIED

### SPEC-EGOV-GET-LAW-FILE-014 ファイルの取得に失敗したときの code

`save: true` の取得（`https://laws.e-gov.go.jp/api/2/law_file/<file_type>/<law_id>`）が失敗したときは、次のエラーを返す。どれも `detail.url` に取得した URL（`at` があれば `?asof=<at>` 付き）を入れる。

| e-Gov の応答                                        | `code`                | `retryable` | そのほか                                                                                     |
| --------------------------------------------------- | --------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| 429                                                 | `SOURCE_RATE_LIMITED` | `true`      | `detail.status: 429`                                                                         |
| 時間切れ                                            | `SOURCE_TIMEOUT`      | `true`      | `detail.status` は付かない                                                                   |
| 5xx（例: 502）                                      | `SOURCE_API_ERROR`    | `true`      | `detail.status` に HTTP ステータス                                                           |
| 404・本文の `code` が `404004`                      | `LAW_NOT_FOUND`       | `false`     | SPEC-EGOV-COMMON-ERRORS-033 の `error`・`hint`・`next_actions`。`detail.status: 404`・`detail.cause: "404004"` |
| 400・本文の `code` が `400044`（`at` を渡したとき） | `INVALID_ARGUMENT`    | `false`     | `tool: "get_law_file"`、`detail.issues: [{ path: "at", message: "e-Gov が受け付ける時点の範囲の外です" }]` |
| そのほかの 429 以外の 4xx（例: 403、`400042`）      | `SOURCE_API_ERROR`    | `false`     | `detail.status` に HTTP ステータス                                                           |

例: `{ law_name: "民法", file_type: "xml", at: "2000-01-01", save: true }` は、2026-10-03 10:13 JST の e-Gov が `/law_file/xml/…?asof=2000-01-01` に 400・`{"code":"400044", …}` を返すので `code: "INVALID_ARGUMENT"`（v0.17.0 では `SOURCE_API_ERROR`・`detail.status: 400`）。e-Gov が 404・`{"code":"404004"}` を返す（2026-10-03 の `/law_file/xml/503AC0000000035?asof=2018-01-01` がこの応答）→ `LAW_NOT_FOUND`、`detail.url` に `?asof=` 付きの URL。

## ADDED

### SPEC-EGOV-GET-LAW-FILE-023 法令名が完全一致しないときは、URL を返さず候補を付けた `LAW_NOT_FOUND` を返す

`law_name` の法令は SPEC-EGOV-COMMON-ERRORS-032 の規則で決める。略称辞書に law_id が無く、e-Gov の法令名検索の全件の中に題名の完全一致が無いときは、`save` の値にかかわらず、検索結果の先頭の法令の URL を返さず、ファイルも取らずに、032 の形の `LAW_NOT_FOUND`（`retryable: false`）を返す。`next_actions` の候補の要素は `action: "get_law_file"`、`example` は渡した引数（`file_type`・`save`・`at` のうち渡したもの）の `law_name` だけを候補の題名に替えたもの。`at` を渡したときは、法令名の検索にも `asof=<at>` を付ける。

例: `{ law_name: "所得税法施行", file_type: "xml" }` は `code: "LAW_NOT_FOUND"`、`next_actions` の先頭は `{ action: "get_law_file", example: { law_name: "所得税法施行令", file_type: "xml" } }`。
