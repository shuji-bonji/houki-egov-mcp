# 差分: list_attachments（20261003-law-resolution）

`specs/current/list_attachments/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## MODIFIED

### SPEC-EGOV-LIST-ATTACHMENTS-018 法令本文の取得に失敗したときの code

e-Gov の法令本文の取得（`https://laws.e-gov.go.jp/api/2/law_data/<law_id>`）が失敗したときは、次のエラーを返す。どれも `detail.url` に法令本文の API の URL を入れる（`at` があれば `?asof=<at>` 付き）。

| e-Gov の応答                                        | `code`                | `retryable` | そのほか                                                                                     |
| --------------------------------------------------- | --------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| 429                                                 | `SOURCE_RATE_LIMITED` | `true`      | `detail.status: 429`                                                                         |
| 時間切れ                                            | `SOURCE_TIMEOUT`      | `true`      | `detail.status` は付かない                                                                   |
| 5xx（例: 500・503）                                 | `SOURCE_API_ERROR`    | `true`      | `detail.status` に HTTP ステータス                                                           |
| 404・本文の `code` が `404004`                      | `LAW_NOT_FOUND`       | `false`     | SPEC-EGOV-COMMON-ERRORS-033 の `error`・`hint`・`next_actions`。`detail.status: 404`・`detail.cause: "404004"` |
| 400・本文の `code` が `400044`（`at` を渡したとき） | `INVALID_ARGUMENT`    | `false`     | `tool: "list_attachments"`、`detail.issues: [{ path: "at", message: "e-Gov が受け付ける時点の範囲の外です" }]` |
| そのほかの 429 以外の 4xx（例: 403、本文の `code` が読めない 404） | `SOURCE_API_ERROR`    | `false`     | `detail.status` に HTTP ステータス                                                           |

例: e-Gov が 404・`{"code":"404004"}` を返す → `{ code: "LAW_NOT_FOUND", retryable: false, detail: { status: 404, url: "https://laws.e-gov.go.jp/api/2/law_data/LID1", cause: "404004" }, … }`（v0.17.0 では `SOURCE_API_ERROR`）。e-Gov が 404・本文 `Not Found`（JSON でない）を返す → `SOURCE_API_ERROR`・`retryable: false`・`detail.status: 404`（今までどおり）。

## ADDED

### SPEC-EGOV-LIST-ATTACHMENTS-024 法令名が完全一致しないときは、一覧を返さず候補を付けた `LAW_NOT_FOUND` を返す

`law_name` の法令は SPEC-EGOV-COMMON-ERRORS-032 の規則で決める。略称辞書に law_id が無く、e-Gov の法令名検索の全件の中に題名の完全一致が無いときは、検索結果の先頭の法令の添付の一覧を返さず、032 の形の `LAW_NOT_FOUND`（`retryable: false`）を返す。`next_actions` の候補の要素は `action: "list_attachments"`、`example` は渡した引数（`at` を渡したときはそれも）の `law_name` だけを候補の題名に替えたもの。`at` を渡したときは、法令名の検索にも `asof=<at>` を付ける。SPEC-EGOV-LIST-ATTACHMENTS-009 の「法令名から法令を特定できないとき」には、この場合も入る。

例: `{ law_name: "所得税法施行" }` は `code: "LAW_NOT_FOUND"`、`next_actions` の先頭 2 件は `{ action: "list_attachments", example: { law_name: "所得税法施行令" } }` と `{ action: "list_attachments", example: { law_name: "所得税法施行規則" } }`。
