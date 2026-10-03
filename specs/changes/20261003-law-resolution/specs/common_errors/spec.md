# 差分: common_errors（20261003-law-resolution）

`specs/current/common_errors/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「エラーの code」の表の `LAW_NOT_FOUND` の行を「法令が見つからない。法令名の検索が成功して題名の完全一致が無かった（0 件、または部分一致だけ。SPEC-EGOV-COMMON-ERRORS-032）か、law_id を決めた後に e-Gov が 404 を返した（SPEC-EGOV-COMMON-ERRORS-033）。検索が通信の失敗で終わったときは `SOURCE_*`」にする
- 「エラーの code」の表の `INVALID_ARGUMENT` の行の末尾に「。e-Gov が時点 `at` を受け付けないと答えたとき（SPEC-EGOV-COMMON-ERRORS-033）も含む」を足す

## MODIFIED

### SPEC-EGOV-COMMON-ERRORS-027 `SOURCE_*` は e-Gov との通信が失敗したときだけ返し、`*_NOT_FOUND` は問い合わせが成功して求めたものが無かったときと、e-Gov が「その法令が無い」と答えたときだけ返す

`SOURCE_API_ERROR` / `SOURCE_TIMEOUT` / `SOURCE_RATE_LIMITED` / `SOURCE_UNAVAILABLE` は、e-Gov への要求が次の表のどれかで終わったときだけ返す。`LAW_NOT_FOUND` / `ARTICLE_NOT_FOUND` / `RANGE_NOT_FOUND` / `ATTACHMENT_NOT_FOUND` は、e-Gov への要求（法令名の検索、法令本文の取得など）が成功し、その応答の中に求めたものが無かったときと、e-Gov が応答本文の `code` で「その法令（添付）が無い」と答えたとき（SPEC-EGOV-COMMON-ERRORS-033、SPEC-EGOV-GET-ATTACHMENT-010）だけ返す。通信の失敗を `*_NOT_FOUND` にしない。e-Gov と関係の無い処理中の例外は `SOURCE_*` にせず `INTERNAL_ERROR`（SPEC-EGOV-COMMON-ERRORS-007）にする。

| e-Gov への要求の終わり方                                           | `code`                | `retryable` | `detail`                                  |
| ------------------------------------------------------------------ | --------------------- | ----------- | ----------------------------------------- |
| HTTP 429                                                           | `SOURCE_RATE_LIMITED` | `true`      | `status: 429`、`url`                      |
| 応答を待ちきれなかった（時間切れ）                                 | `SOURCE_TIMEOUT`      | `true`      | `url`                                     |
| HTTP 5xx                                                           | `SOURCE_API_ERROR`    | `true`      | `status`、`url`                           |
| HTTP 4xx（429 と、SPEC-EGOV-COMMON-ERRORS-033 の表の応答を除く）   | `SOURCE_API_ERROR`    | `false`     | `status`、`url`                           |
| 接続できない（SPEC-EGOV-COMMON-ERRORS-028）                        | `SOURCE_UNAVAILABLE`  | `true`      | `cause`（`ENOTFOUND` などの code）        |
| そのほかのネットワークの失敗（例外の `cause.code` が表に無いもの） | `SOURCE_API_ERROR`    | `true`      | `cause`（例外の文）                       |

この表は、法令本文の取得（SPEC-EGOV-GET-LAW-028〜031 など）でも、法令名の検索（SPEC-EGOV-COMMON-ERRORS-029）でも、ファイルの取得（SPEC-EGOV-GET-ATTACHMENT-019、SPEC-EGOV-GET-LAW-FILE-014）でも同じである。4xx のうち別の code にするものは、SPEC-EGOV-COMMON-ERRORS-033（law_id を決めた後の 404 と、時点の 400）と、そのツールの spec.md（`get_attachment` の 404003 は `ATTACHMENT_NOT_FOUND`。SPEC-EGOV-GET-ATTACHMENT-010）に書く。

例: `get_law` に `{ law_name: "ほげほげ法", article: "1" }` を渡し、法令名の検索が 0 件で成功したときは `LAW_NOT_FOUND`。同じ引数で法令名の検索が 503 で終わったときは `SOURCE_API_ERROR`・`retryable: true` で、`LAW_NOT_FOUND` にはならない。法令名の検索が 400 で終わったときは `SOURCE_API_ERROR`・`retryable: false`（検索の 400 は 033 の対象ではない）。

### SPEC-EGOV-COMMON-ERRORS-029 法令名から law_id を決める e-Gov の検索が通信の失敗で終わったときは、`LAW_NOT_FOUND` ではなく `SOURCE_*` を返す

`law_name` を受け取り、略称辞書に law_id が無いときに e-Gov の法令名検索で law_id を決めるツールは、その検索が SPEC-EGOV-COMMON-ERRORS-027 の表のどれかで終わったとき、表の code を返す。`LAW_NOT_FOUND` は、検索が成功して題名の完全一致が無かったとき（0 件のときと、部分一致だけのとき。SPEC-EGOV-COMMON-ERRORS-032）だけ返す。`retryable` と `detail` は 027 の表のとおりで、`next_actions` には `LAW_NOT_FOUND` のときの `resolve_abbreviation` / `search_law` や候補の呼び直しを入れない（法令名を変えても通らないため）。

ただし、時点 `at` を付けた法令名の検索（SPEC-EGOV-COMMON-ERRORS-032）に e-Gov が応答本文の `code` `400044` の 400 を返したときは、通信の失敗ではなく時点の誤りとして、SPEC-EGOV-COMMON-ERRORS-033 の `INVALID_ARGUMENT` を返す。

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

例: 法令名の検索が 503 を返す状態で `get_toc` に `{ law_name: "架空の法律" }` を渡すと、`code: "SOURCE_API_ERROR"`、`retryable: true`、`detail.status: 503` で、`LAW_NOT_FOUND` ではない（v0.15.4 では `LAW_NOT_FOUND` だった）。検索が時間切れなら `SOURCE_TIMEOUT`、429 なら `SOURCE_RATE_LIMITED`、接続できなければ `SOURCE_UNAVAILABLE`、400 なら `SOURCE_API_ERROR`・`retryable: false`。検索が 0 件で成功したときと、部分一致だけのときは `LAW_NOT_FOUND`（032）。

### SPEC-EGOV-COMMON-ERRORS-023 数値の引数は inputSchema に整数と範囲を書き、範囲の外は `INVALID_ARGUMENT` にして丸めない

数値の引数は、tools/list の inputSchema に `type: "integer"` と `minimum`（上限があるものは `maximum` も）を書く。0・負の数・小数・上限を超える値・数値でない値は、SPEC-EGOV-COMMON-ERRORS-003 の検査で `INVALID_ARGUMENT` になり、ツールの処理に進まない。既定値に丸めたり、上限に切り詰めたり、切り捨てたりしない。

| ツール                   | 引数                    | `minimum` | `maximum` | 省いたとき                    | 仕様 ID                                |
| ------------------------ | ----------------------- | --------- | --------- | ----------------------------- | -------------------------------------- |
| `search_law`             | `limit`                 | 1         | 50        | 10                            | SPEC-EGOV-SEARCH-LAW-013               |
| `search_fulltext`        | `limit`                 | 1         | 30        | 10                            | SPEC-EGOV-SEARCH-FULLTEXT-033          |
| `get_law_revisions`      | `latest`                | 1         | なし      | 全件                          | SPEC-EGOV-GET-LAW-REVISIONS-012        |
| `get_toc`                | `depth`                 | 1         | なし      | 全階層                        | SPEC-EGOV-GET-TOC-023                  |
| `get_law`                | `paragraph`             | 1         | なし      | 条全体                        | SPEC-EGOV-GET-LAW-036                  |
| `get_article_references` | `paragraph`             | 1         | なし      | 条全体                        | SPEC-EGOV-GET-ARTICLE-REFERENCES-040   |
| `verify_citations`       | `citations[].paragraph` | 1         | なし      | 条まで                        | SPEC-EGOV-VERIFY-CITATIONS-041         |
| `get_law_range`          | `suppl_index`           | 1         | なし      | （附則を範囲にしない）        | SPEC-EGOV-GET-LAW-RANGE-030            |
| `get_law`                | `suppl_index`           | 1         | なし      | 本則の条を探す                | SPEC-EGOV-GET-LAW-043                  |
| `verify_citations`       | `citations[].suppl_index` | 1       | なし      | 本則の条を確かめる            | SPEC-EGOV-VERIFY-CITATIONS-047         |
| `get_law_range`          | `max_chars`             | 2,000     | 120,000   | 30,000                        | SPEC-EGOV-GET-LAW-RANGE-023（既存）    |

`get_law` / `verify_citations` の `item` は文字列（`"8の2"`）も受け付けるので、この表に入れない（読めない形は `INVALID_ARTICLE_NUM`。SPEC-EGOV-GET-LAW-011）。

例: tools/list の `search_law` の inputSchema は `properties.limit` が `type: "integer"`、`minimum: 1`、`maximum: 50` を持つ。`get_toc` の `properties.depth` は `type: "integer"`、`minimum: 1` を持ち、`maximum` を持たない。`get_law` に `law_name: "消費税法", article: "100", suppl_index: 0` を渡すと `detail.issues` は `[{ path: "suppl_index", message: "1 以上で指定してください" }]`。

## ADDED

### SPEC-EGOV-COMMON-ERRORS-032 法令名から law_id を決めるときは題名の完全一致だけを使い、完全一致が無ければ候補を付けた `LAW_NOT_FOUND` を返して法令を取らない

`law_name` を受け取るツールは、次の順で法令を 1 つに決める。どの段でも決まらなければ、その法令の本文・目次・改正履歴・添付を取らない。

1. 略称辞書（`resolveAbbreviation(name, { normalize: true })`）に houki-egov の管轄で `law_id` を持つエントリがあれば、その法令に決める（今までどおり。e-Gov の法令名検索は引かない）
2. 無ければ、照合する名前（辞書に正式名称だけがあればその正式名称、辞書に無ければ前後の空白を除いた `law_name`）で e-Gov の法令名検索（`/laws` の `law_title`。部分一致）を引く。`at` を受け取るツールで `at` を渡したときは、検索にも `asof=<at>` を付け、その時点の題名で照合する
3. 検索結果の全件（e-Gov の応答の `total_count` の件数。先頭の 5 件や 50 件で打ち切らない）の中に、`revision_info.law_title` が照合する名前と完全に一致する法令があれば、その法令に決める
4. 完全一致が無く、部分一致が 1 件以上あれば、エラー `LAW_NOT_FOUND`（`retryable: false`）を返す。検索結果の先頭の法令を使わない
5. 部分一致も 0 件なら、今までどおりのエラー `LAW_NOT_FOUND`（各ツールの spec.md の文）を返す

4 の `LAW_NOT_FOUND` の本文は次の形である。

| フィールド     | 内容                                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `error`        | `完全一致する法令名がありません: <照合した名前>（部分一致 <total_count> 件）`                                                                                                                                                                                              |
| `hint`         | `部分一致した法令（先頭 <n> 件）: <題名1>（<法令番号1>）、<題名2>（<法令番号2>）、…。求めた法令なら、その題名を law_name に渡して呼び直してください`。`<n>` は 5 と `total_count` の小さいほう                                                                                |
| `next_actions` | 候補の先頭 5 件まで、1 件ごとに `{ action: <呼んだツールの名前>, reason: "<題名>（<法令番号>）を指すなら、この名前で呼び直せます", example: <渡した引数のうち law_name だけを候補の題名に替えたもの> }`。その後に `{ action: "search_law", example: { keyword: <渡した law_name> } }` |
| `retryable`    | `false`                                                                                                                                                                                                                                                                   |

候補の並びは e-Gov の検索結果の順である。`example` には、渡さなかった引数を足さない。

当てはまるツールと仕様 ID:

| ツール                   | 仕様 ID                              | `at` を検索に使うか |
| ------------------------ | ------------------------------------ | ------------------- |
| `get_law`                | SPEC-EGOV-GET-LAW-041                | 使う                |
| `get_toc`                | SPEC-EGOV-GET-TOC-028                | 使う                |
| `get_law_range`          | SPEC-EGOV-GET-LAW-RANGE-034          | 使う                |
| `get_law_revisions`      | SPEC-EGOV-GET-LAW-REVISIONS-018      | `at` を受け取らない |
| `get_related_laws`       | SPEC-EGOV-GET-RELATED-LAWS-019       | `at` を受け取らない |
| `get_article_references` | SPEC-EGOV-GET-ARTICLE-REFERENCES-044 | 使う                |
| `list_attachments`       | SPEC-EGOV-LIST-ATTACHMENTS-024       | 使う                |
| `get_attachment`         | SPEC-EGOV-GET-ATTACHMENT-030         | 使う                |
| `get_law_file`           | SPEC-EGOV-GET-LAW-FILE-023           | 使う                |
| `verify_citations`       | SPEC-EGOV-VERIFY-CITATIONS-045       | 使う（4 は件ごとの `ambiguous` のまま。SPEC-EGOV-VERIFY-CITATIONS-013） |

例（2026-10-03 10:10 JST に e-Gov 法令 API v2 の `/laws` で確かめた値）:

- `get_law` に `{ law_name: "所得税法施行", article: "1" }`（辞書に無い）を渡すと、`/laws?law_title=所得税法施行` は `total_count: 2`（所得税法施行令・所得税法施行規則）で完全一致が無いので、`code: "LAW_NOT_FOUND"`、`error: "完全一致する法令名がありません: 所得税法施行（部分一致 2 件）"`、`next_actions` は `[{ action: "get_law", example: { law_name: "所得税法施行令", article: "1" } }, { action: "get_law", example: { law_name: "所得税法施行規則", article: "1" } }, { action: "search_law", example: { keyword: "所得税法施行" } }]`（各要素は `reason` 付き）。v0.17.0 では所得税法施行令の第 1 条を、所得税法施行令であることを `meta.title` だけで示して返していた
- `get_toc` に `{ law_name: "保険法" }`（辞書に無い）を渡すと、`/laws?law_title=保険法` は `total_count: 114` で、完全一致の `保険法`（`420AC0000000056`、平成二十年法律第五十六号）は 78 件目にある。全件から探すので保険法の目次を返す。v0.17.0 では先頭 5 件の中に完全一致が無いため、1 件目の健康保険法（`211AC0000000070`）の目次を返していた
- `get_law` に `{ law_name: "行政手続等における情報通信の技術の利用に関する法律", article: "1", at: "2018-01-01" }` を渡すと、`/laws?law_title=…&asof=2018-01-01` の 1 件目の題名がこの名前（`414AC0000000151`。2019 年に「情報通信技術を活用した行政の推進等に関する法律」へ改題）で完全一致するので、その時点の第 1 条を返す。`at` を付けない検索では今の題名が返り、完全一致しないので候補付きの `LAW_NOT_FOUND` になる

### SPEC-EGOV-COMMON-ERRORS-033 law_id を決めた後に e-Gov が「その法令が無い」と答えたときは `LAW_NOT_FOUND`、時点を受け付けないと答えたときは `INVALID_ARGUMENT` を返す

law_id を決めた後（略称辞書・法令名の検索・`verify_citations` の `law_id`）に、e-Gov の法令本文の取得（`/law_data/<law_id>`）、ファイルの取得（`/law_file/<file_type>/<law_id>`）、改正履歴の取得（`/law_revisions/<law_id>`）が 4xx を返したときは、応答本文の `code` を見て次のように返す。

| e-Gov の応答                                                    | 意味（e-Gov の `message`）                                         | 返す `code`         | `retryable` |
| --------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------- | ----------- |
| 404、`code: "404004"`（`/law_data`・`/law_file`）               | `指定のパラメータで取得できる法令本文ファイルは存在しません。`     | `LAW_NOT_FOUND`     | `false`     |
| 404、`code: "404001"`（`/law_revisions`）                       | `取得結果が０件です。`                                             | `LAW_NOT_FOUND`     | `false`     |
| 400、`code: "400044"`（`asof` を付けた要求）                    | `法令の時点（asof）には2017-04-01以降を指定してください。`         | `INVALID_ARGUMENT`  | `false`     |
| そのほかの 4xx（429 を除く。本文の `code` が読めないときを含む） | —                                                                  | `SOURCE_API_ERROR`（027 の表のまま） | `false`     |

`LAW_NOT_FOUND` の本文:

- `error`: `at` を渡したときは `<法令名> は <at> の時点の e-Gov に収録されていません`、渡さないときは `e-Gov に law_id <law_id> の法令がありません`。`<法令名>` は略称辞書・検索で決めた題名（`verify_citations` の `law_id` だけの件では law_id）
- `hint`: `at` を渡したときは `その時点にこの法令がまだ無いか、law_id が古い可能性があります。改正履歴で施行日を確かめるか、at を省いて呼び直してください`。渡さないときは `略称辞書の law_id が古い（廃止・統合された）か、law_id の書き間違いの可能性があります`
- `next_actions`: `search_law`（`example: { keyword: <渡した law_name。無ければ law_id> }`）。`at` を渡し、法令名が分かっているときは、その前に `get_law_revisions`（`example: { law_name: <渡した law_name> }`）を置く
- `detail`: `status: 404`、`url`、`cause`（e-Gov の `code`。例: `"404004"`）

`INVALID_ARGUMENT` の本文は SPEC-EGOV-COMMON-ERRORS-026 と同じ形で、`tool`、`error: "at の時点を e-Gov が受け付けません: <at>"`、`detail.issues: [{ path: "at", message: "e-Gov が受け付ける時点の範囲の外です" }]`、`hint` に e-Gov の `message` をそのまま含める（範囲の下限の日付をこのサーバーに書き込まないため）。`detail.status: 400`、`detail.url`、`detail.cause: "400044"` も付ける。

当てはまるツールと仕様 ID:

| ツール                   | 仕様 ID                                                   |
| ------------------------ | --------------------------------------------------------- |
| `get_law`                | SPEC-EGOV-GET-LAW-031（MODIFIED）                         |
| `get_toc`                | SPEC-EGOV-GET-TOC-029                                     |
| `get_law_range`          | SPEC-EGOV-GET-LAW-RANGE-035                               |
| `get_law_revisions`      | SPEC-EGOV-GET-LAW-REVISIONS-008（MODIFIED。404001 だけ）  |
| `get_article_references` | SPEC-EGOV-GET-ARTICLE-REFERENCES-051                      |
| `list_attachments`       | SPEC-EGOV-LIST-ATTACHMENTS-018（MODIFIED）                |
| `get_attachment`         | SPEC-EGOV-GET-ATTACHMENT-031（法令本文の取得の段だけ。`/attachment` の 4xx は SPEC-EGOV-GET-ATTACHMENT-010・018 のまま） |
| `get_law_file`           | SPEC-EGOV-GET-LAW-FILE-014（MODIFIED）                    |
| `verify_citations`       | SPEC-EGOV-VERIFY-CITATIONS-015（MODIFIED）・048           |

例（2026-10-03 10:10 JST に e-Gov 法令 API v2 で確かめた値）:

- `/law_data/999AC0000000999` は 404・`{"code":"404004", …}`。`/law_data/503AC0000000035?asof=2018-01-01`（デジタル社会形成基本法。令和三年法律第三十五号）も 404・`404004`。`/law_revisions/999AC0000000999` は 404・`404001`
- `/law_data/340AC0000000033?asof=2000-01-01`（所得税法）は 400・`{"code":"400044","message":"法令の時点（asof）には2017-04-01以降を指定してください。"}`。法令が 2017-04-01 より前からあっても同じ
- `get_law` に `{ law_name: "所得税法", article: "9", at: "2000-01-01" }` を渡すと、`code: "INVALID_ARGUMENT"`、`tool: "get_law"`、`detail.issues: [{ path: "at", message: "e-Gov が受け付ける時点の範囲の外です" }]`、`hint` に `2017-04-01以降` を含む（v0.17.0 では `SOURCE_API_ERROR`・`error: "e-Gov API error: e-Gov API returned 400"` で、理由が分からなかった）
- `verify_citations` に `{ citations: [{ law_id: "503AC0000000035", article: "1" }], at: "2018-01-01" }` を渡すと、その件は `status: "not_found"`、`code: "LAW_NOT_FOUND"`、`reason: "503AC0000000035 は 2018-01-01 の時点の e-Gov に収録されていません"`（SPEC-EGOV-VERIFY-CITATIONS-015）。法令名で渡したとき（`law_name: "デジタル社会形成基本法"`、辞書に無い）は、`asof=2018-01-01` を付けた法令名の検索が 0 件になり、032 の 5 の `LAW_NOT_FOUND` になる
