# 差分: search_law（20261003-search-explain-attachment）

`specs/current/search_law/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「入力」の表から `domain` の行を消す（SPEC-EGOV-SEARCH-LAW-016）
- 「処理の流れ」の図の `A["呼び出し（keyword・law_type・domain・limit）"]` を `A["呼び出し（keyword・law_type・limit）。domain は inputSchema で止まる（016）"]` に、`H["query・total_count・results を返す（未決 5）"]` を `H{"一致が 0 件か"}`、`H -- いいえ --> H1["query・total_count（一致した総数）・results を返す（006）"]`、`H -- はい --> H2["hint と next_actions を付けて返す（017）"]` にする
- 「未決」の 1・3・10（→ #55）の行を消す

## MODIFIED

### SPEC-EGOV-SEARCH-LAW-006 成功時の応答の形

成功したときは、エラーにせず（`isError` を付けず）、`content[0].text` に次の形の JSON の文字列を返す。

| フィールド     | 内容                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `query`        | `keyword`（渡した値）。`law_type`（渡したときだけ）、`resolved`（SPEC-EGOV-SEARCH-LAW-002）            |
| `total_count`  | e-Gov で一致した法令の総数（e-Gov の応答の `total_count`。`limit` で切る前の件数）。`results` の件数とは限らない |
| `results`      | e-Gov が返した法令の配列。e-Gov が返した順。件数は `limit` 以下                                        |
| `hint`         | 一致が 0 件のときの案内の文（SPEC-EGOV-SEARCH-LAW-017）。1 件以上のときは `null`                      |
| `next_actions` | 一致が 0 件のときの次の手（SPEC-EGOV-SEARCH-LAW-017）。1 件以上のときは `[]`                            |

`results` の要素は次のフィールドを持つ。

| フィールド          | 内容                                                           |
| ------------------- | -------------------------------------------------------------- |
| `law_id`            | 法令 ID                                                        |
| `title`             | 法令名                                                         |
| `law_num`           | 法令番号                                                       |
| `law_type`          | 法令種別（`Act` など。e-Gov の値のまま）                       |
| `promulgation_date` | 公布日（`YYYY-MM-DD`）。e-Gov の応答に無ければ付かない         |
| `url`               | `https://laws.e-gov.go.jp/law/<law_id>`                        |

出力の形式を選ぶ引数（`format` など）は無い。`format` を渡すと、inputSchema に無い引数として `INVALID_ARGUMENT`（`detail.issues[0].path: "format"`）を返す。

例: `keyword: "消法"` で e-Gov が消費税法（法令 ID `363AC0000000108`、法令番号 `昭和六十三年法律第百八号`、公布日 `1988-12-30`）を返すと、`results[0]` は `law_id: "363AC0000000108"`・`title: "消費税法"`・`law_num: "昭和六十三年法律第百八号"`・`law_type: "Act"`・`promulgation_date: "1988-12-30"`・`url: "https://laws.e-gov.go.jp/law/363AC0000000108"`、`hint: null`、`next_actions: []`。`keyword: "保険", limit: 2`（辞書に無い）は、2026-10-03 10:20 JST の e-Gov が `/laws?law_title=保険` に `total_count: 278` を返すので、`total_count: 278`・`results` は 2 件（v0.17.0 では `total_count: 2`。同じ時刻に houki-egov-dev 0.17.0 で確かめた）。e-Gov が 0 件を返すと（`keyword: "存在しない"`）、`total_count: 0`・`results: []` で、エラーにせず SPEC-EGOV-SEARCH-LAW-017 の `hint` と `next_actions` を付ける。

## ADDED

### SPEC-EGOV-SEARCH-LAW-016 `domain` は引数に無く、渡すと `INVALID_ARGUMENT` にする

tools/list の `search_law` の inputSchema は `domain` を持たない（0.17.0 までは受け付けたが、e-Gov の検索にも結果の選別にも使っていなかった）。`domain` を渡すと、inputSchema に無い引数として SPEC-EGOV-COMMON-ERRORS-004 の `INVALID_ARGUMENT`（`tool: "search_law"`、`detail.issues: [{ path: "domain", message: "inputSchema に無い引数です" }]`）を返し、e-Gov に問い合わせない。

例: `{ keyword: "労働基準", domain: "tax", law_type: "Act" }` は `code: "INVALID_ARGUMENT"`、`detail.issues[0].path: "domain"`（v0.17.0 では `domain` を使わずに検索し、労働分野の `労働基準法` を返していた）。`{ keyword: "労働基準", law_type: "Act" }` は今までどおり検索する。

### SPEC-EGOV-SEARCH-LAW-017 一致が 0 件のときは、法令の題名だけを探したことと次の手を返す

e-Gov の検索が成功して 0 件だったときは、エラーにせず（`total_count: 0`・`results: []`）、次の `hint` と `next_actions` を付ける。

- `hint`: `「<検索した名前>」を題名に含む法令は e-Gov にありません。search_law は法令の題名だけを探します。条文の本文にある語なら search_fulltext、略称なら resolve_abbreviation を試してください`。`<検索した名前>` は e-Gov に渡した `law_title`（略称なら正式名称）
- `next_actions`（この順）:
  1. `law_type` を渡したときだけ、`{ action: "search_law", reason: "法令種別を外して探せます", example: { keyword: <渡した keyword>, limit: <渡した limit（渡したときだけ）> } }`
  2. `{ action: "search_fulltext", reason: "条文の本文から語を探せます（ローカル DB がある場合）", example: { keyword: <前後の空白を除いた keyword> } }`
  3. `{ action: "resolve_abbreviation", reason: "略称・通称かどうかを確かめられます", example: { abbr: <前後の空白を除いた keyword> } }`

例: `{ keyword: "存在しない" }` は `total_count: 0`、`results: []`、`hint` は `「存在しない」を題名に含む法令は e-Gov にありません。…` で始まり、`next_actions` の `action` は `["search_fulltext", "resolve_abbreviation"]`。`{ keyword: "存在しない", law_type: "Act" }` は `["search_law", "search_fulltext", "resolve_abbreviation"]` で、1 件目の `example` は `{ keyword: "存在しない" }`。v0.17.0 では `hint` も `next_actions` も無かった。
