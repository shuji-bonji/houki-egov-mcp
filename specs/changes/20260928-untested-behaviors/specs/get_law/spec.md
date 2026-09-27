# 差分: get_law（20260928-untested-behaviors）

`specs/current/get_law/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-GET-LAW-019 応答の外形は format ごとに決まっている

成功の応答は JSON で、`format` によって次のキーを持つ。

- `format` が `markdown`（省略を含む）: `{ format: "markdown", markdown, meta }`
- 目次を返すとき（SPEC-EGOV-GET-LAW-017）: `{ format: "toc", markdown, meta }`
- `format` が `json`: `{ format: "json", data, meta }`（`markdown` は持たない）

例: `{ law_name: "消費税法", article: "30" }` は `format: "markdown"` と文字列の `markdown` と `meta` を返す。`{ law_name: "消費税法" }` は `format: "toc"` を返す。`{ law_name: "消費税法", article: "2", format: "json" }` は `format: "json"` と `data` と `meta` を返す。

### SPEC-EGOV-GET-LAW-020 meta には法令の識別情報と取得日時が入り、条文を返すときは at も入る

`meta` は次のフィールドを持つ。

- `law_id`: e-Gov の法令 ID（例: `"363AC0000000108"`）
- `title`: 法令名（例: `"消費税法"`）
- `law_num`: 法令番号（例: `"昭和六十三年法律第百八号"`）
- `retrieved_at`: 応答を組み立てた日時（ISO 8601 の UTC。例: `"2026-09-27T20:31:34.158Z"`）
- `url`: e-Gov 法令検索の URL。`https://laws.e-gov.go.jp/law/<law_id>`（例: `"https://laws.e-gov.go.jp/law/363AC0000000108"`）

条文を返すとき（`format` が `markdown` か `json`）に `at` を渡すと、`meta.at` に渡した値が入る。`at` を渡さないときは `meta` に `at` のキーが無い。

例: `{ law_name: "消費税法", article: "30", at: "2020-04-01" }` の `meta.at` は `"2020-04-01"`。`{ law_name: "消費税法", article: "30" }` の `meta` には `at` が無い。

### SPEC-EGOV-GET-LAW-021 markdown の条文の末尾に出典・URL・時点・取得日時の行を置く

`format` が `markdown` の応答では、本文の後に空行を 1 つ置き、次の行をこの順で置く。

1. `---`
2. `出典：e-Gov法令検索（デジタル庁）`
3. `URL: <meta.url と同じ URL>`
4. `時点: <at>`（`at` を渡したときだけ）
5. `取得日時: <meta.retrieved_at と同じ値>`

例: `{ law_name: "消費税法", article: "30", paragraph: 1, at: "2020-04-01" }` の `markdown` は次の行で終わる。

```
---
出典：e-Gov法令検索（デジタル庁）
URL: https://laws.e-gov.go.jp/law/363AC0000000108
時点: 2020-04-01
取得日時: 2026-09-27T20:31:38.887Z
```

`at` を渡さないときは `時点:` の行が無く、`URL:` の行の次が `取得日時:` の行になる。

### SPEC-EGOV-GET-LAW-022 目次の 1 行目は「<法令名> — 目次」で、末尾は条文と同じ行を置く

目次を返すとき（SPEC-EGOV-GET-LAW-017）、`markdown` の 1 行目は `# <法令名> — 目次` である。末尾には SPEC-EGOV-GET-LAW-021 と同じく `---`、`出典：e-Gov法令検索（デジタル庁）`、`URL: <e-Gov 法令検索の URL>`、`at` を渡したときだけ `時点: <at>`、`取得日時: <取得日時>` の行を置く。

例: `{ law_name: "消費税法" }` の `markdown` の 1 行目は `# 消費税法 — 目次`。`{ law_name: "消費税法", format: "toc", at: "2020-04-01" }` の `markdown` には `時点: 2020-04-01` の行がある。

### SPEC-EGOV-GET-LAW-023 json の data は e-Gov 形式の条番号と、指定した粒度の構造を返す

`format` が `json` のとき、`data` は次のフィールドを持つ。

- `article_num`: e-Gov 形式の条番号。枝番号は `_` でつなぐ（`article` の書き方に関わらず同じ値になる）
- `node`: e-Gov の法令本文の構造（`tag`・`attr`・`children`）のうち、指定した粒度のもの。`item` を指定したときは号（`tag: "Item"`）、`paragraph` だけのときは項（`tag: "Paragraph"`）、`article` だけのときは条（`tag: "Article"`）

例: `{ law_name: "消費税法", article: "第三十条の二", format: "json" }` は `data.article_num: "30_2"`、`data.node.tag: "Article"`、`data.node.attr.Num: "30_2"` を返す。`{ law_name: "消費税法", article: "30", paragraph: 2, format: "json" }` は `data.node.tag: "Paragraph"`、`data.node.attr.Num: "2"` を返す。`{ law_name: "消費税法", article: "2", paragraph: 1, item: 8, format: "json" }` は `data.node.tag: "Item"`、`data.node.attr.Num: "8"` を返す。

### SPEC-EGOV-GET-LAW-024 json の paragraph_num と item_num は、渡した値をそのまま返す

`format` が `json` のとき、`paragraph` を渡すと `data.paragraph_num` にその値（数値）が入る。`item` を渡すと `data.item_num` に渡した値がそのまま入り、号番号として読み取った後の形（`"8_2"` など）にはしない。`paragraph` を渡さないときは `data` に `paragraph_num` のキーが無く、`item` を渡さないときは `item_num` のキーが無い。

例: `{ law_name: "消費税法", article: "2", paragraph: 1, item: "八", format: "json" }` は `data.paragraph_num: 1`、`data.item_num: "八"` を返す（`8` にしない）。`{ law_name: "消費税法", article: "2", format: "json" }` の `data` には `paragraph_num` も `item_num` も無い。

### SPEC-EGOV-GET-LAW-025 format が json で article を省くと INVALID_ARGUMENT を返し、目次の取り方を案内する

`format` が `json` で `article` を省いたときは、目次も条文も返さず、エラー `INVALID_ARGUMENT` を返す。`hint` には `format: "toc"` か `get_toc` ツールを使うことを書き、`next_actions` に `action: "get_toc"`（`example.law_name` に渡した `law_name`）を入れる。

例: `{ law_name: "消費税法", format: "json" }` は `code: "INVALID_ARGUMENT"`、`hint` に `format: "toc"` と `get_toc` の文字列を含み、`next_actions` に `{ action: "get_toc", example: { law_name: "消費税法" } }` を含む。

### SPEC-EGOV-GET-LAW-026 法令が特定できないときは LAW_NOT_FOUND を返し、略称の確認と検索を案内する

`law_name` が略称辞書に無く、e-Gov の法令名の検索でも 1 件も当たらないときは、エラー `LAW_NOT_FOUND` を返す。`next_actions` には次の 2 つをこの順で入れる。

- `action: "resolve_abbreviation"`、`example: { abbr: <law_name> }`
- `action: "search_law"`、`example: { keyword: <law_name> }`

例: e-Gov の検索が 0 件を返す状態で `{ law_name: "ほげほげ法", article: "1" }` を呼ぶと、`code: "LAW_NOT_FOUND"`、`error` に `ほげほげ法` を含み、`next_actions` が `[{ action: "resolve_abbreviation", example: { abbr: "ほげほげ法" } }, { action: "search_law", example: { keyword: "ほげほげ法" } }]`（各要素はほかに `reason` を持つ）。

### SPEC-EGOV-GET-LAW-027 存在しない項は ARTICLE_NOT_FOUND を返し、項番号が 1 始まりであることを案内する

`paragraph` の項が条に無いときは、エラー `ARTICLE_NOT_FOUND` を返す。`error` に条と項（`第<条>条第<項>項`）を書き、`hint` に項番号は 1 始まりで指定すること、条全体なら `paragraph` を省くことを書く。

例: 項が 2 つの消費税法 第30条に `{ law_name: "消費税法", article: "30", paragraph: 3 }` を渡すと、`code: "ARTICLE_NOT_FOUND"`、`error: "項が見つかりません: 第30条第3項"`、`hint` に `1 始まり` を含む。

### SPEC-EGOV-GET-LAW-028 e-Gov が 429 を返したときは SOURCE_RATE_LIMITED を返す

法令本文の取得で e-Gov が HTTP 429 を返したとき（再試行を終えても 429 のとき）は、エラー `SOURCE_RATE_LIMITED`、`retryable: true` を返す。`next_actions` に `action: "retry_later"` を入れ、`detail.status` は `429`。

例: 法令本文の取得が 429 になる状態で `{ law_name: "消費税法", article: "30" }` を呼ぶと、`code: "SOURCE_RATE_LIMITED"`、`retryable: true`、`detail.status: 429`。

### SPEC-EGOV-GET-LAW-029 e-Gov の応答が時間切れのときは SOURCE_TIMEOUT を返す

法令本文の取得が時間切れになったときは、エラー `SOURCE_TIMEOUT`、`retryable: true` を返す。`next_actions` に `action: "retry_later"` と `action: "visit_egov_site"`（`example.url: "https://laws.e-gov.go.jp/"`）をこの順で入れる。

例: 法令本文の取得が時間切れになる状態で `{ law_name: "消費税法", article: "30" }` を呼ぶと、`code: "SOURCE_TIMEOUT"`、`retryable: true`。

### SPEC-EGOV-GET-LAW-030 e-Gov が 5xx を返したときは再試行できる SOURCE_API_ERROR を返す

法令本文の取得で e-Gov が HTTP 500 以上を返したとき（再試行を終えても 5xx のとき）は、エラー `SOURCE_API_ERROR`、`retryable: true` を返す。`error` に HTTP の状態番号を書き、`next_actions` に `action: "retry_later"` と `action: "visit_egov_site"` を入れ、`detail.status` にその状態番号を入れる。

例: 法令本文の取得が 503 になる状態で `{ law_name: "消費税法", article: "30" }` を呼ぶと、`code: "SOURCE_API_ERROR"`、`retryable: true`、`detail.status: 503`、`error` に `503` を含む。

### SPEC-EGOV-GET-LAW-031 e-Gov がそのほかの HTTP エラーを返したときは再試行できない SOURCE_API_ERROR を返す

法令本文の取得で e-Gov が 429 以外の 4xx を返したときは、エラー `SOURCE_API_ERROR`、`retryable: false` を返す。`detail.status` にその状態番号を入れる。

例: 法令本文の取得が 404 になる状態で `{ law_name: "消費税法", article: "30" }` を呼ぶと、`code: "SOURCE_API_ERROR"`、`retryable: false`、`detail.status: 404`。

### SPEC-EGOV-GET-LAW-032 OUT_OF_SCOPE の応答は、管轄の MCP への切り替えを案内する

SPEC-EGOV-GET-LAW-001 の `OUT_OF_SCOPE` の応答では、`error` に略称辞書の正式名称と管轄（`houki-nta` など）を書き、`next_actions` に `action: "delegate_to_mcp"` を入れて、その `example.mcp` に管轄の名前を入れる。

例: `{ law_name: "消基通", article: "1" }` は `code: "OUT_OF_SCOPE"`、`error` に `消費税法基本通達` と `houki-nta` を含み、`next_actions` が `[{ action: "delegate_to_mcp", example: { mcp: "houki-nta" } }]`（要素はほかに `reason` を持つ）。

### SPEC-EGOV-GET-LAW-033 format が toc のときは article を使わずに目次を返す

`format` が `toc` のときは、`article`（と `paragraph`・`item`）を渡しても使わず、目次を返す。`article` の条が法令に無くても、`article` が条番号として読めなくても、エラーにしない。

例: `{ law_name: "消費税法", format: "toc", article: "999" }` は `format: "toc"`、`markdown` の 1 行目 `# 消費税法 — 目次` を返し、`ARTICLE_NOT_FOUND` にしない。

### SPEC-EGOV-GET-LAW-034 at を渡すと、その時点の本文を e-Gov から取って返す

`at` を渡すと、e-Gov 法令 API v2 の法令本文の取得（`https://laws.e-gov.go.jp/api/2/law_data/<law_id>`）に `asof=<at>` を付けて問い合わせ、返ってきた本文から応答を組み立てる。`at` の値は変えずにそのまま渡す。`at` を渡さないときは `asof` を付けない。

例: `{ law_name: "消費税法", article: "30", paragraph: 1, at: "2020-04-01" }` は `law_data/363AC0000000108?asof=2020-04-01` に問い合わせ、その応答の第30条第1項の本文を `markdown` に入れる。

### SPEC-EGOV-GET-LAW-035 at が違えば、同じ法令でも別の本文として取る

同じ法令を `at` を変えて続けて呼ぶと、`at` ごとに e-Gov に問い合わせ、それぞれの時点の本文を返す。先に取った別の時点の本文や、`at` を渡さないときの本文を使い回さない。

例: e-Gov が時点ごとに違う本文を返す状態で、`{ law_name: "消費税法", article: "30", paragraph: 1, at: "2020-04-01" }`、`{ …, at: "2024-04-01" }`、`at` なしの順に呼ぶと、e-Gov への法令本文の問い合わせは 3 回（`asof=2020-04-01`、`asof=2024-04-01`、`asof` なし）で、3 つの `markdown` はそれぞれの時点の本文を持つ。
