# 差分: common_errors（20261001-t2-error-codes）

`specs/current/common_errors/spec.md` に対する差分です。見出しの単位で置き換えます。差分 `20261001-t1-argument-guards` の 020〜026 の後に足します。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「エラーの code」の表を次のとおりに変える
  - `LAW_NOT_FOUND` の行の説明を「法令名の検索が成功して 0 件だった（法令が見つからない）。検索が通信の失敗で終わったときは `SOURCE_*`」にする
  - `SOURCE_API_ERROR` / `SOURCE_TIMEOUT` / `SOURCE_RATE_LIMITED` / `SOURCE_UNAVAILABLE` の行の説明を「e-Gov との通信が失敗した: HTTP エラー（5xx は再試行できる、429 以外の 4xx は再試行できない）/ 応答の時間切れ / 429 / 接続できない（DNS の失敗・接続拒否・接続の切断）」にする
  - `INTERNAL_ERROR` の行の前に `FILE_TOO_LARGE` の行「`save: true` で取るファイルが上限（50 MB）を超えている（`get_attachment` / `get_law_file`）。pdf-reader-mcp と同じ code」を足す

## ADDED

### SPEC-EGOV-COMMON-ERRORS-027 `SOURCE_*` は e-Gov との通信が失敗したときだけ返し、`*_NOT_FOUND` は問い合わせが成功して求めたものが無かったときだけ返す

`SOURCE_API_ERROR` / `SOURCE_TIMEOUT` / `SOURCE_RATE_LIMITED` / `SOURCE_UNAVAILABLE` は、e-Gov への要求が次の表のどれかで終わったときだけ返す。`LAW_NOT_FOUND` / `ARTICLE_NOT_FOUND` / `RANGE_NOT_FOUND` / `ATTACHMENT_NOT_FOUND` は、e-Gov への要求（法令名の検索、法令本文の取得など）が成功し、その応答の中に求めたものが無かったときだけ返す。通信の失敗を `*_NOT_FOUND` にしない。e-Gov と関係の無い処理中の例外は `SOURCE_*` にせず `INTERNAL_ERROR`（SPEC-EGOV-COMMON-ERRORS-007）にする。

| e-Gov への要求の終わり方                                           | `code`                | `retryable` | `detail`                                  |
| ------------------------------------------------------------------ | --------------------- | ----------- | ----------------------------------------- |
| HTTP 429                                                           | `SOURCE_RATE_LIMITED` | `true`      | `status: 429`、`url`                      |
| 応答を待ちきれなかった（時間切れ）                                 | `SOURCE_TIMEOUT`      | `true`      | `url`                                     |
| HTTP 5xx                                                           | `SOURCE_API_ERROR`    | `true`      | `status`、`url`                           |
| HTTP 4xx（429 を除く）                                             | `SOURCE_API_ERROR`    | `false`     | `status`、`url`                           |
| 接続できない（SPEC-EGOV-COMMON-ERRORS-028）                        | `SOURCE_UNAVAILABLE`  | `true`      | `cause`（`ENOTFOUND` などの code）        |
| そのほかのネットワークの失敗（例外の `cause.code` が表に無いもの） | `SOURCE_API_ERROR`    | `true`      | `cause`（例外の文）                       |

この表は、法令本文の取得（SPEC-EGOV-GET-LAW-028〜031 など）でも、法令名の検索（SPEC-EGOV-COMMON-ERRORS-029）でも、ファイルの取得（SPEC-EGOV-GET-ATTACHMENT-019、SPEC-EGOV-GET-LAW-FILE-014）でも同じである。4xx の一部を別の code にするツール（`get_attachment` の 404003 は `ATTACHMENT_NOT_FOUND`。SPEC-EGOV-GET-ATTACHMENT-010）は、そのツールの spec.md に書く。

例: `get_law` に `{ law_name: "ほげほげ法", article: "1" }` を渡し、法令名の検索が 0 件で成功したときは `LAW_NOT_FOUND`。同じ引数で法令名の検索が 503 で終わったときは `SOURCE_API_ERROR`・`retryable: true` で、`LAW_NOT_FOUND` にはならない。

### SPEC-EGOV-COMMON-ERRORS-028 e-Gov に接続できないときは、例外の `cause.code` を見て `SOURCE_UNAVAILABLE` を返す

e-Gov への要求で、HTTP の応答を受け取る前に接続の失敗で例外が起きたときは、例外の `message` だけでなく `cause.code`（Node の `fetch` が投げる `TypeError: fetch failed` の `cause` に入る、`ENOTFOUND` のような文字列）も見て、次の表の code のどれかなら `SOURCE_UNAVAILABLE`（`retryable: true`）を返す。`detail.cause` にその code を入れ、`hint` にネットワークか DNS を確かめる案内、`next_actions` に `retry_later` と `visit_egov_site` を入れる。e-Gov を呼ぶ 11 ツール（`search_law` / `get_law` / `get_toc` / `get_law_range` / `get_law_revisions` / `get_related_laws` / `get_article_references` / `verify_citations` / `list_attachments` / `get_attachment` / `get_law_file`）で同じである。取り直しの回数は、429・5xx のときと同じ（3 回）で、取り直しても接続できなかったときにこのエラーになる。

| `cause.code`   | 意味                       |
| -------------- | -------------------------- |
| `ENOTFOUND`    | ホスト名を解決できない     |
| `EAI_AGAIN`    | DNS が一時的に答えない     |
| `ECONNREFUSED` | 接続を拒否された           |
| `ECONNRESET`   | 接続が途中で切れた         |
| `ETIMEDOUT`    | TCP の接続が時間切れになった |

`cause.code` がこの表に無く、`message` にもこれらの文字列が無いネットワークの失敗は、SPEC-EGOV-COMMON-ERRORS-027 の表の最後の行（`SOURCE_API_ERROR`、`retryable: true`）のままである。

例: `fetch` が `TypeError("fetch failed")` を投げ、その `cause` が `{ code: "ENOTFOUND", hostname: "laws.e-gov.go.jp" }` のとき、`search_law` に `{ keyword: "消費税" }` を渡すと `code: "SOURCE_UNAVAILABLE"`、`retryable: true`、`detail.cause: "ENOTFOUND"`（v0.15.4 では `message` に `ENOTFOUND` が無いので `SOURCE_API_ERROR`・`detail.cause: "fetch failed"` だった）。`cause` が `{ code: "ECONNREFUSED" }` でも同じ。

### SPEC-EGOV-COMMON-ERRORS-029 法令名から law_id を決める e-Gov の検索が通信の失敗で終わったときは、`LAW_NOT_FOUND` ではなく `SOURCE_*` を返す

`law_name` を受け取り、略称辞書に law_id が無いときに e-Gov の法令名検索で law_id を決めるツールは、その検索が SPEC-EGOV-COMMON-ERRORS-027 の表のどれかで終わったとき、表の code を返す。`LAW_NOT_FOUND` は、検索が成功して 0 件だったときだけ返す。`retryable` と `detail` は 027 の表のとおりで、`next_actions` には `LAW_NOT_FOUND` のときの `resolve_abbreviation` / `search_law` を入れない（法令名を変えても通らないため）。

| ツール                   | 仕様 ID                              |
| ------------------------ | ------------------------------------ |
| `get_law`                | SPEC-EGOV-GET-LAW-038                |
| `get_toc`                | SPEC-EGOV-GET-TOC-026                |
| `get_law_range`          | SPEC-EGOV-GET-LAW-RANGE-032          |
| `get_law_revisions`      | SPEC-EGOV-GET-LAW-REVISIONS-014      |
| `get_related_laws`       | SPEC-EGOV-GET-RELATED-LAWS-017       |
| `get_article_references` | SPEC-EGOV-GET-ARTICLE-REFERENCES-042 |
| `list_attachments`       | SPEC-EGOV-LIST-ATTACHMENTS-022       |
| `get_attachment`         | SPEC-EGOV-GET-ATTACHMENT-026         |
| `get_law_file`           | SPEC-EGOV-GET-LAW-FILE-020           |
| `verify_citations`       | SPEC-EGOV-VERIFY-CITATIONS-034〜036（v0.15.4 の時点で既にこの規則） |

略称辞書に law_id がある名前（`消費税法` など）では法令名検索を引かないので（SPEC-EGOV-GET-LAW-REVISIONS-011 など）、このエラーは起きない。

例: 法令名の検索が 503 を返す状態で `get_toc` に `{ law_name: "架空の法律" }` を渡すと、`code: "SOURCE_API_ERROR"`、`retryable: true`、`detail.status: 503` で、`LAW_NOT_FOUND` ではない（v0.15.4 では `LAW_NOT_FOUND` だった）。検索が時間切れなら `SOURCE_TIMEOUT`、429 なら `SOURCE_RATE_LIMITED`、接続できなければ `SOURCE_UNAVAILABLE`、400 なら `SOURCE_API_ERROR`・`retryable: false`。検索が 0 件で成功したときは今までどおり `LAW_NOT_FOUND`。

### SPEC-EGOV-COMMON-ERRORS-030 上限を超える大きさのファイルは `FILE_TOO_LARGE` で断る

`get_attachment` / `get_law_file` の `save: true` で取るファイルが上限（50 MB）を超えているときは、エラー `FILE_TOO_LARGE`（`retryable: false`）を返す。`INVALID_ARGUMENT` にはしない（引数の誤りではないため）。`error` にファイルの大きさと上限、`hint` に「保存せず url をそのまま使ってください」、`detail.url` に取得した URL、`detail.bytes` にファイルの大きさ（Content-Length の値、または読み終えた大きさ）を入れる。code の名前は pdf-reader-mcp の `FILE_TOO_LARGE` と同じにし、houki-research-skill の `docs/ERROR-CODES.md` では houki-egov-mcp の列にも付ける。大きさの確かめ方は SPEC-EGOV-GET-ATTACHMENT-027、SPEC-EGOV-GET-LAW-FILE-021。

例: e-Gov の応答の Content-Length が `52428801`（50 MB + 1 バイト）のとき、`get_attachment` に `{ law_name: "民法", src: "./pict/big.pdf", save: true }` を渡すと `code: "FILE_TOO_LARGE"`、`retryable: false`、`detail.bytes: 52428801` で、ファイルは保存しない（v0.15.4 では `INVALID_ARGUMENT` だった）。

### SPEC-EGOV-COMMON-ERRORS-031 同期の記録の日付を解釈できないときは `INTERNAL_ERROR`（`retryable: false`）にし、全件の取り込みを案内する

ローカル DB の `sync_state.last_sync_date` が、日付（`YYYY-MM-DD`）または時差付きの時刻（`YYYY-MM-DDTHH:MM:SSZ` / `+09:00`）として解釈できないとき（空文字、`2026/05/08` のような別の書き方、`2026-02-30` のような暦に無い日付）、鮮度（`freshness`）を計算するツールは、想定外の例外として止まらず、エラー `INTERNAL_ERROR` を返す。

- `retryable`: `false`（時間をおいても DB の値は変わらない）
- `error`: `同期の記録の日付を読めません: <last_sync_date の値>`
- `hint`: `houki-egov-mcp --bulk-download-everything` で同期の記録を作り直す案内（`next_actions` は付けない。CLI を案内する `action` の名前が houki-egov-mcp には無いため）
- `detail.cause`: 元の例外の文（houki-abbreviations の `computeDaysSince` が投げる `RangeError` の文）

当てはまるのは `search_fulltext`（SPEC-EGOV-SEARCH-FULLTEXT-035）と CLI の `--status`（SPEC-EGOV-CLI-STATUS-009。CLI なので JSON ではなく標準エラー出力）である。取り込みが書く `last_sync_date` は `YYYY-MM-DD` なので、取り込みを通した DB ではこのエラーは起きない。

例: `sync_state.last_sync_date` を `2026/05/08` に書き換えた DB で `search_fulltext` に `{ keyword: "軽減税率" }` を渡すと、`code: "INTERNAL_ERROR"`、`retryable: false`、`error` に `2026/05/08` を含み、`hits` は返さない。
