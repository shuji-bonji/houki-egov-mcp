# 差分: search_law（20260928-untested-behaviors）

`specs/current/search_law/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

受入テストでは e-Gov への問い合わせ（`fetch`）を差し替え、`https://laws.e-gov.go.jp/api/2/laws` に付けた問い合わせの値（`law_title`・`law_type`）と、差し替えた応答から作られたツールの応答を確かめる。下の例は、`fetch` を差し替えて v0.15.1 で確かめた入力と出力である。同じ検索語・`law_type`・`limit` の組での 2 回目の呼び出しは e-Gov に問い合わせずに前の結果を返すことがある（略称・別名を正式名称に置き換えた後の検索語で同じ組になるときも同じ）。問い合わせの値を確かめるテストは、置き換え後の検索語が重ならない例を選ぶか、例ごとにモジュールを読み込み直す。

## ADDED

### SPEC-EGOV-SEARCH-LAW-002 略称は正式名称に置き換えて検索し、`query.resolved` に正式名称を入れる

`keyword` が略称辞書の略称と一致するときは、その正式名称を e-Gov の `/laws` の `law_title` に渡して検索し、応答の `query.resolved` に正式名称を入れる。

例: `keyword: "消法"` は、e-Gov に `law_title=消費税法` で問い合わせ、応答は `query.keyword: "消法"`・`query.resolved: "消費税法"`。e-Gov が `消費税法`・`消費税法施行令` の 2 件を返せば、`results` の先頭は `title: "消費税法"`。

### SPEC-EGOV-SEARCH-LAW-003 辞書に無い keyword はそのまま検索し、`query.resolved` を付けない

`keyword` が略称辞書の略称・正式名称・別名のどれとも一致しないときは、`keyword` をそのまま `law_title` に渡して検索し、応答の `query` に `resolved` のキーを付けない。

例: `keyword: "消費税法施行"` は、e-Gov に `law_title=消費税法施行` で問い合わせ、応答の `query` は `{ "keyword": "消費税法施行" }`（`resolved` のキーが無い）。

### SPEC-EGOV-SEARCH-LAW-004 正式名称・別名も、辞書の正式名称に置き換えて検索する

`keyword` が略称辞書のエントリの正式名称や別名と一致するときも、SPEC-EGOV-SEARCH-LAW-002 と同じく、そのエントリの正式名称で検索し、`query.resolved` に正式名称を入れる。

例: `keyword: "消費税"`（`消法` の別名）と `keyword: "インボイス"`（`消法` の別名）は、どちらも e-Gov に `law_title=消費税法` で問い合わせ、`query.resolved: "消費税法"`。`query.keyword` は渡した `"消費税"`・`"インボイス"` のまま。

### SPEC-EGOV-SEARCH-LAW-005 前後の空白を除いてから略称辞書と照合し、`query.keyword` は渡した値のまま返す

`keyword` の前後の空白を除いてから略称辞書と照合し、除いた後の文字列で検索する。応答の `query.keyword` には、除く前の渡した値をそのまま入れる。

例: `keyword: " 消法 "` は `query.keyword: " 消法 "`・`query.resolved: "消費税法"` で、e-Gov への問い合わせは `law_title=消費税法`。

### SPEC-EGOV-SEARCH-LAW-006 成功時の応答の形

成功したときは、エラーにせず（`isError` を付けず）、`content[0].text` に次の形の JSON の文字列を返す。

| フィールド       | 内容                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `query`          | `keyword`（渡した値）。`law_type`（渡したときだけ）、`resolved`（SPEC-EGOV-SEARCH-LAW-002） |
| `total_count`    | 数値（何を数えるかは houki-egov-mcp #55 で扱うので、この ID では約束にしない）             |
| `results`        | e-Gov が返した法令の配列。e-Gov が返した順                                                |

`results` の要素は次のフィールドを持つ。

| フィールド          | 内容                                                           |
| ------------------- | -------------------------------------------------------------- |
| `law_id`            | 法令 ID                                                        |
| `title`             | 法令名                                                         |
| `law_num`           | 法令番号                                                       |
| `law_type`          | 法令種別（`Act` など）                                         |
| `promulgation_date` | 公布日（`YYYY-MM-DD`）。e-Gov の応答に無ければ付かない         |
| `url`               | `https://laws.e-gov.go.jp/law/<law_id>`                        |

出力の形式を選ぶ引数（`format` など）は無い。`format` を渡すと、inputSchema に無い引数として `INVALID_ARGUMENT`（`detail.issues[0].path: "format"`）を返す。

例: `keyword: "消法"` で e-Gov が消費税法（法令 ID `363AC0000000108`、法令番号 `昭和六十三年法律第百八号`、公布日 `1988-12-30`）を返すと、`results[0]` は `law_id: "363AC0000000108"`・`title: "消費税法"`・`law_num: "昭和六十三年法律第百八号"`・`law_type: "Act"`・`promulgation_date: "1988-12-30"`・`url: "https://laws.e-gov.go.jp/law/363AC0000000108"`。e-Gov が 0 件を返すと（`keyword: "存在しない"`）、`total_count: 0`・`results: []` で、エラーにしない。

### SPEC-EGOV-SEARCH-LAW-007 空白だけの keyword も検索せずにエラー `INVALID_ARGUMENT` を返す

`keyword` が空白（半角スペース・全角スペース・タブ・改行）だけのときも、SPEC-EGOV-SEARCH-LAW-001 と同じく、e-Gov に問い合わせずにエラー `INVALID_ARGUMENT`（`error: "keyword が空です"`・`hint`）を返す。

例: `keyword: "   "` と `keyword: "\t\n"` は、どちらも `isError: true`・`code: "INVALID_ARGUMENT"`・`error: "keyword が空です"` で、e-Gov への問い合わせは 0 回。

### SPEC-EGOV-SEARCH-LAW-008 law_type を e-Gov の検索に渡し、`query.law_type` に入れる

`law_type` を渡すと、e-Gov の `/laws` の `law_type` に同じ値を渡して問い合わせ、応答の `query.law_type` に渡した値を入れる。種別での絞り込みは e-Gov が行う。`law_type` を渡さないときは、問い合わせに `law_type` を付けず、応答の `query` に `law_type` のキーを付けない。

例: `keyword: "労働基準", law_type: "Act"` は、e-Gov に `law_title=労働基準&law_type=Act` で問い合わせ、`query.law_type: "Act"`。e-Gov が `労働基準法` の 1 件を返せば、`results` は `title: "労働基準法"`・`law_type: "Act"` の 1 件。`keyword: "消法"`（`law_type` なし）の応答の `query` には `law_type` のキーが無い。

### SPEC-EGOV-SEARCH-LAW-009 e-Gov が 429 を返したら `SOURCE_RATE_LIMITED` を返す

e-Gov が 429 を返し続けたときは、エラー `SOURCE_RATE_LIMITED` を返す。`retryable: true`、`detail` は `status: 429` と `url`（問い合わせた URL）、`next_actions[0].action` は `retry_later`。

例: `keyword: "err429"` で e-Gov が常に 429 を返すと、`isError: true`・`code: "SOURCE_RATE_LIMITED"`・`retryable: true`・`detail.status: 429`・`detail.url: "https://laws.e-gov.go.jp/api/2/laws?law_title=err429&limit=10"`。

### SPEC-EGOV-SEARCH-LAW-010 e-Gov への問い合わせがタイムアウトしたら `SOURCE_TIMEOUT` を返す

e-Gov への問い合わせが時間切れで打ち切られたときは、エラー `SOURCE_TIMEOUT` を返す。`retryable: true`、`detail` は `url`（問い合わせた URL）だけを持ち `status` を持たない。`next_actions` は `retry_later` と `visit_egov_site` の順。

例: `keyword: "errabort"` で問い合わせが打ち切られる（`fetch` が `name: "AbortError"` の例外で失敗する）と、`isError: true`・`code: "SOURCE_TIMEOUT"`・`retryable: true`・`detail.url: "https://laws.e-gov.go.jp/api/2/laws?law_title=errabort&limit=10"`。

### SPEC-EGOV-SEARCH-LAW-011 e-Gov が 5xx を返したら `retryable: true` の `SOURCE_API_ERROR` を返す

e-Gov が 500 以上の status を返し続けたときは、エラー `SOURCE_API_ERROR` を `retryable: true` で返す。`detail` は `status` と `url`、`next_actions` は `retry_later` と `visit_egov_site` の順。

例: `keyword: "err503"` で e-Gov が常に 503 を返すと、`isError: true`・`code: "SOURCE_API_ERROR"`・`retryable: true`・`detail.status: 503`・`error: "e-Gov API がサーバーエラーを返しました（503）"`。

### SPEC-EGOV-SEARCH-LAW-012 e-Gov が 429 以外の 4xx を返したら `retryable: false` の `SOURCE_API_ERROR` を返す

e-Gov が 429 以外の 400〜499 の status を返したときは、エラー `SOURCE_API_ERROR` を `retryable: false` で返す。`detail` は `status` と `url`。

例: `keyword: "err400"` で e-Gov が 400 を返すと、`isError: true`・`code: "SOURCE_API_ERROR"`・`retryable: false`・`detail.status: 400`・`detail.url: "https://laws.e-gov.go.jp/api/2/laws?law_title=err400&limit=10"`。404 でも同じく `retryable: false`（`detail.status: 404`）。
