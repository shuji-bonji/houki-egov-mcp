# 差分: get_law（20261003-t4-response-shape）

`specs/current/get_law/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える

## ADDED

### SPEC-EGOV-GET-LAW-040 `item` だけを指定して項を補ったときは、json の `data.paragraph_num` に補った項番号 `1` を入れる

`format` が `json` で、`paragraph` を省いて `item` を指定し、SPEC-EGOV-GET-LAW-011 のとおり項が 1 つの条のその項の号を返すときは、`data.paragraph_num` に補った項番号 `1`（数値）を入れる。`data.node` は号（`tag: "Item"`）のまま、`data.item_num` は渡した `item` のまま（SPEC-EGOV-GET-LAW-024）。

例: 項が 1 つの条（消費税法施行令第14条の3）に `{ law_name: "消費税法施行令", article: "14の3", item: 1, format: "json" }` を渡すと、`data.paragraph_num: 1`、`data.item_num: 1`、`data.node.tag: "Item"` を返す（v0.16.0 では `data` に `paragraph_num` が無かった）。

## MODIFIED

### SPEC-EGOV-GET-LAW-020 meta には法令の識別情報と取得日時と時点が常に入る

`meta` は、条文を返すとき（`format` が `markdown` か `json`）も目次を返すとき（SPEC-EGOV-GET-LAW-017）も、次のフィールドを持つ。

- `law_id`: e-Gov の法令 ID（例: `"363AC0000000108"`）
- `title`: 法令名（例: `"消費税法"`）
- `law_num`: 法令番号（例: `"昭和六十三年法律第百八号"`）
- `retrieved_at`: 応答を組み立てた日時（ISO 8601 の UTC。例: `"2026-09-27T20:31:34.158Z"`）
- `url`: e-Gov 法令検索の URL。`https://laws.e-gov.go.jp/law/<law_id>`（例: `"https://laws.e-gov.go.jp/law/363AC0000000108"`）
- `at`: 渡した `at`。`at` を渡さないときは `null`

`meta` にどのキーがあるかは、`format` と `at` の有無で変わらない。markdown の末尾の `時点:` の行（SPEC-EGOV-GET-LAW-021・022）は、今までどおり `at` を渡したときだけ置く。

例: `{ law_name: "消費税法", article: "30", at: "2020-04-01" }` の `meta.at` は `"2020-04-01"`。`{ law_name: "消費税法", article: "30" }` の `meta.at` は `null`。`{ law_name: "消費税法", format: "toc", at: "2020-04-01" }` の `meta.at` は `"2020-04-01"`、`{ law_name: "消費税法" }`（目次）の `meta.at` は `null`（v0.16.0 では、条文で `at` を省いたときと目次のときは `meta` に `at` のキーが無かった）。

### SPEC-EGOV-GET-LAW-024 json の paragraph_num と item_num は、渡した値をそのまま返し、渡さないときは null

`format` が `json` のとき、`paragraph` を渡すと `data.paragraph_num` にその値（数値）が入る。`item` を渡すと `data.item_num` に渡した値がそのまま入り、号番号として読み取った後の形（`"8_2"` など）にはしない。`paragraph` を渡さないときの `data.paragraph_num` は `null`（項を補ったときは SPEC-EGOV-GET-LAW-040 の `1`）、`item` を渡さないときの `data.item_num` は `null`。`data` にどのキーがあるかは、渡した引数で変わらない。

例: `{ law_name: "消費税法", article: "2", paragraph: 1, item: "八", format: "json" }` は `data.paragraph_num: 1`、`data.item_num: "八"` を返す（`8` にしない）。`{ law_name: "消費税法", article: "2", format: "json" }` の `data` は `paragraph_num: null`、`item_num: null` を持つ（v0.16.0 ではどちらのキーも無かった）。
