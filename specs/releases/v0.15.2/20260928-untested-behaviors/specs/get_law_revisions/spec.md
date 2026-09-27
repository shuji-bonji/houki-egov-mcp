# 差分: get_law_revisions（20260928-untested-behaviors）

`specs/current/get_law_revisions/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

以下の例の e-Gov の応答は、e-Gov の改正履歴（`/law_revisions/<law_id>`）と法令検索（`/laws`）を差し替えて返したもの。例で使う改正履歴 `REVS` は、次の 3 件をこの順で返す。

| 順 | `law_revision_id`                         | `amendment_promulgate_date` | `amendment_enforcement_date` | `amendment_law_num` | `amendment_law_title`            | `amendment_law_id` | `current_revision_status` |
| -- | ----------------------------------------- | --------------------------- | ---------------------------- | ------------------- | -------------------------------- | ------------------ | ------------------------- |
| 1  | `363AC0000000108_20291001_505AC0000000003` | `2023-03-31`                | `2029-10-01`                 | `令和五年法律第三号` | `所得税法等の一部を改正する法律` | `505AC0000000003`  | `UnEnforced`              |
| 2  | `363AC0000000108_20260401_507AC0000000013` | `2025-03-31`                | `2026-04-01`                 | `令和七年法律第十三号` | `所得税法等の一部を改正する法律` | `507AC0000000013`  | `CurrentEnforced`         |
| 3  | `363AC0000000108_20250401_506AC0000000008` | `2024-03-30`                | `2025-04-01`                 | `令和六年法律第八号` | `所得税法等の一部を改正する法律` | `506AC0000000008`  | `PreviousEnforced`        |

どれも `amendment_enforcement_comment` は `null`。

## ADDED

### SPEC-EGOV-GET-LAW-REVISIONS-002 meta・total・revisions の形で改正履歴を返す

法令を 1 つに決められ、e-Gov の改正履歴を取れたときは、次のフィールドを持つ応答を返す。

| フィールド  | 内容                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta`      | `law_id`・`title`・`law_num`・`retrieved_at`（呼び出した日時。ISO 8601 の文字列）・`url`（`https://laws.e-gov.go.jp/law/<law_id>`）                                                                                                                |
| `total`     | e-Gov が返した改正の件数（`latest` で絞る前の件数）                                                                                                                                                                                                |
| `revisions` | e-Gov が返した順の改正の配列。要素は `law_revision_id`・`amendment_promulgate_date`・`amendment_enforcement_date`・`amendment_enforcement_comment`・`amendment_law_num`・`amendment_law_title`・`amendment_law_id`・`current_revision_status` の 8 つ |

e-Gov の改正の要素にこの 8 つ以外のフィールドがあっても、`revisions` の要素には入れない。

例: 改正履歴が `REVS` のとき `{ law_name: "消法" }` を渡すと、`meta.law_id: "363AC0000000108"`、`meta.url: "https://laws.e-gov.go.jp/law/363AC0000000108"`、`total: 3`、`revisions` は 3 件で、`revisions[0]` は `{ law_revision_id: "363AC0000000108_20291001_505AC0000000003", amendment_promulgate_date: "2023-03-31", amendment_enforcement_date: "2029-10-01", amendment_enforcement_comment: null, amendment_law_num: "令和五年法律第三号", amendment_law_title: "所得税法等の一部を改正する法律", amendment_law_id: "505AC0000000003", current_revision_status: "UnEnforced" }`。e-Gov の 1 件目に `extra_field: "x"` があっても `revisions[0]` に `extra_field` は無い。

### SPEC-EGOV-GET-LAW-REVISIONS-003 管轄外の名前は e-Gov を引かずに OUT_OF_SCOPE を返す

`law_name` が略称辞書で houki-egov-mcp 以外の管轄に当たるときは、e-Gov を一度も呼ばずにエラー `code: "OUT_OF_SCOPE"` を返す。`next_actions[0]` は `action: "delegate_to_mcp"`、`example: { mcp: <管轄の MCP> }`。

例: `{ law_name: "消基通" }` は e-Gov を呼ばず、`code: "OUT_OF_SCOPE"`、`error` に `消費税法基本通達` と `houki-nta` を含み、`next_actions[0]` は `{ action: "delegate_to_mcp", example: { mcp: "houki-nta" }, … }`、`detail.cause: "source_mcp_hint=houki-nta"`。

### SPEC-EGOV-GET-LAW-REVISIONS-004 法令が見つからないときは LAW_NOT_FOUND を返す

`law_name` が略称辞書に無く、e-Gov の法令検索も 0 件のときは、改正履歴を引かずにエラー `code: "LAW_NOT_FOUND"` を返す。`next_actions` は 2 件で、1 件目は `action: "resolve_abbreviation"`（`example: { abbr: <law_name> }`）、2 件目は `action: "search_law"`（`example: { keyword: <law_name> }`）。

例: e-Gov の法令検索が 0 件を返すようにして `{ law_name: "存在しない法律" }` を渡すと、`code: "LAW_NOT_FOUND"`、`error: "法令が見つかりません: 存在しない法律"`、`next_actions[0].example: { abbr: "存在しない法律" }`、`next_actions[1].example: { keyword: "存在しない法律" }`。e-Gov へは法令検索の 1 回だけで、改正履歴は呼ばない。

### SPEC-EGOV-GET-LAW-REVISIONS-005 e-Gov が 429 を返し続けたら SOURCE_RATE_LIMITED を返す

改正履歴の取得で e-Gov が 429 を返したときは、間隔を空けて最大 3 回まで取り直し、それでも 429 ならエラー `code: "SOURCE_RATE_LIMITED"`、`retryable: true` を返す。`next_actions[0].action` は `retry_later`、`detail` に `status: 429` と呼んだ `url` が入る。

例: 改正履歴が常に 429 を返すようにして `{ law_name: "消法" }` を渡すと、e-Gov を 4 回呼んだうえで `code: "SOURCE_RATE_LIMITED"`、`retryable: true`、`detail: { status: 429, url: "https://laws.e-gov.go.jp/api/2/law_revisions/363AC0000000108" }`。

### SPEC-EGOV-GET-LAW-REVISIONS-006 e-Gov の応答を待ちきれなかったら SOURCE_TIMEOUT を返す

改正履歴の取得が打ち切られた（応答を待つ時間の上限を超えた）ときは、取り直さずにエラー `code: "SOURCE_TIMEOUT"`、`retryable: true` を返す。`next_actions` は `retry_later` と `visit_egov_site`（`example: { url: "https://laws.e-gov.go.jp/" }`）。

例: 改正履歴の要求が `name: "AbortError"` の例外で終わるようにして `{ law_name: "消法" }` を渡すと、e-Gov を 1 回だけ呼んで `code: "SOURCE_TIMEOUT"`、`retryable: true`、`detail.url: "https://laws.e-gov.go.jp/api/2/law_revisions/363AC0000000108"`。

### SPEC-EGOV-GET-LAW-REVISIONS-007 e-Gov が 500 番台を返し続けたら retryable: true の SOURCE_API_ERROR を返す

改正履歴の取得で e-Gov が 500 番台を返したときは、間隔を空けて最大 3 回まで取り直し、それでも 500 番台ならエラー `code: "SOURCE_API_ERROR"`、`retryable: true` を返す。`next_actions` は `retry_later` と `visit_egov_site`、`detail` に `status` と `url` が入る。

例: 改正履歴が常に 503 を返すようにして `{ law_name: "消法" }` を渡すと、e-Gov を 4 回呼んだうえで `code: "SOURCE_API_ERROR"`、`retryable: true`、`detail.status: 503`、`error` に `503` を含む。

### SPEC-EGOV-GET-LAW-REVISIONS-008 429 と 500 番台以外の HTTP エラーは retryable: false の SOURCE_API_ERROR を返す

改正履歴の取得で e-Gov が 429 と 500 番台以外の HTTP エラー（400・404 など）を返したときは、取り直さずにエラー `code: "SOURCE_API_ERROR"`、`retryable: false` を返す。`next_actions` は付けず、`detail` に `status` と `url` が入る。

例: 改正履歴が 404 を返すようにして `{ law_name: "消法" }` を渡すと、e-Gov を 1 回だけ呼んで `code: "SOURCE_API_ERROR"`、`retryable: false`、`detail.status: 404`、`next_actions` は無い。400 でも同じ（`detail.status: 400`）。

### SPEC-EGOV-GET-LAW-REVISIONS-009 latest が 1 以上なら先頭から latest 件を返し、total は絞る前の件数のまま

`latest` に 1 以上の整数を渡したときは、`revisions` を e-Gov が返した順の先頭から `latest` 件にする。`total` は絞る前の件数のまま。`latest` が件数より大きければ全件を返す。

例: 改正履歴が `REVS` のとき、`{ law_name: "消法", latest: 1 }` は `total: 3`、`revisions` が 1 件で `revisions[0].law_revision_id: "363AC0000000108_20291001_505AC0000000003"`。`latest: 2` は 2 件、`latest: 10` は 3 件（どれも `total: 3`）。

### SPEC-EGOV-GET-LAW-REVISIONS-010 latest を省くと全件を返す

`latest` を渡さないときは、e-Gov が返した改正をすべて `revisions` に入れる。

例: 改正履歴が `REVS` のとき `{ law_name: "消法" }` は `total: 3`、`revisions` も 3 件。

### SPEC-EGOV-GET-LAW-REVISIONS-011 略称辞書に law_id がある名前は e-Gov の法令検索を引かない

`law_name` が略称辞書で `law_id` を持つ名前に当たるときは、e-Gov の法令検索を引かずに、その `law_id` の改正履歴だけを取る。`meta.title` は辞書の正式名称、`meta.law_num` は辞書の法令番号になる。

例: `{ law_name: "消法" }` では e-Gov へは `https://laws.e-gov.go.jp/api/2/law_revisions/363AC0000000108` の 1 回だけを呼び、`/laws` は呼ばない。応答の `meta.title: "消費税法"`、`meta.law_num: "昭和六十三年法律第百八号"`。
