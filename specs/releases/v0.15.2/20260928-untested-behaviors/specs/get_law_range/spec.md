# 差分: get_law_range（20260928-untested-behaviors）

`specs/current/get_law_range/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-GET-LAW-RANGE-017 法令が見つからないときは LAW_NOT_FOUND を返す

略称辞書にも e-Gov の法令検索にも当たらない `law_name` では、エラー `LAW_NOT_FOUND` を返す。`error` は `法令が見つかりません: <law_name>`。`next_actions` は 2 件で、1 件目は `resolve_abbreviation`（`example.abbr` に `law_name`）、2 件目は `search_law`（`example.keyword` に `law_name`）。

例: `law_name: "存在しない法", chapter: 1`（法令検索の結果が 0 件）では、`code: "LAW_NOT_FOUND"`、`error: "法令が見つかりません: 存在しない法"`、`next_actions` の `action` は `["resolve_abbreviation", "search_law"]`、`next_actions[0].example` は `{ abbr: "存在しない法" }`、`next_actions[1].example` は `{ keyword: "存在しない法" }`。

### SPEC-EGOV-GET-LAW-RANGE-018 houki-egov の管轄外の名前には OUT_OF_SCOPE を返す

略称辞書で houki-egov 以外の管轄と分かる `law_name`（通達名など）では、範囲の指定を読む前に、e-Gov に問い合わせずにエラー `OUT_OF_SCOPE` を返す。`error` に正式名称と管轄の MCP 名を書き、`next_actions[0]` は `action: "delegate_to_mcp"`、`example.mcp` に管轄の MCP 名を入れる。

例: `law_name: "消基通", chapter: 1` では、`code: "OUT_OF_SCOPE"`、`error` は `「消費税法基本通達」は houki-nta の管轄です` で始まり、`next_actions[0]` は `{ action: "delegate_to_mcp", example: { mcp: "houki-nta" } }`（`reason` も付く）、`detail.cause` は `source_mcp_hint=houki-nta`。

### SPEC-EGOV-GET-LAW-RANGE-019 法令本文の取得で e-Gov が失敗したときのエラー

法令を引けた後、e-Gov から法令本文を取るところで失敗したときは、次のエラーを返す。

| e-Gov の失敗 | `code`                | `retryable` | `next_actions` の `action`       |
| ------------ | --------------------- | ----------- | -------------------------------- |
| 429          | `SOURCE_RATE_LIMITED` | `true`      | `retry_later`                    |
| タイムアウト | `SOURCE_TIMEOUT`      | `true`      | `retry_later`、`visit_egov_site` |
| 5xx          | `SOURCE_API_ERROR`    | `true`      | `retry_later`、`visit_egov_site` |

429 と 5xx では `detail.status` に HTTP の状態コードを入れる。

例: `chapter: 1` で本文の取得が 503 で失敗すると、`code: "SOURCE_API_ERROR"`、`error: "e-Gov API がサーバーエラーを返しました（503）"`、`retryable: true`、`detail.status: 503`。429 では `code: "SOURCE_RATE_LIMITED"`、`error: "e-Gov API がレート制限を返しました（429）"`。タイムアウトでは `code: "SOURCE_TIMEOUT"`、`error: "e-Gov API がタイムアウトしました"`。

### SPEC-EGOV-GET-LAW-RANGE-020 読めない編・章・節・款・目の番号は、e-Gov に問い合わせる前に INVALID_ARGUMENT を返す

`part` / `chapter` / `section` / `subsection` / `division` の値が番号として読めないとき（番号でない語、0 以下の数、整数でない数、`"三〇"` のような漢数字の書き方、空文字）は、法令検索も法令本文の取得もせずに、エラー `INVALID_ARGUMENT` を返す。`error` に渡した値を書き、`hint` は `<引数名> は "3"・"三"・"第三章"・"2の2" のいずれかの形式で指定してください`。

例: `chapter: "総則"` では `code: "INVALID_ARGUMENT"`、`error` は `編・章・節の番号の形式が不正です（例: "3", "三", "第三章", "2の2", "第二章の二"）: 総則`、`hint` は `chapter は "3"・"三"・"第三章"・"2の2" のいずれかの形式で指定してください` で、e-Gov への問い合わせは 0 回。`chapter: 0` では `error` は `編・章・節の番号は 1 以上の整数で指定してください: 0`。`chapter: "三〇"`、`chapter: ""`、`chapter: -1`、`chapter: 1.5` もどれも `INVALID_ARGUMENT`。`subsection: "総則"` では `hint` が `subsection は` で始まる。

### SPEC-EGOV-GET-LAW-RANGE-021 読めない `from_article` は INVALID_ARTICLE_NUM を返す

`from_article` が条番号として読めないとき（数字でも「第N条」の形でもない文字列、項の表記、空文字）は、エラー `INVALID_ARTICLE_NUM` を返す。`error` に渡した値を書き、`hint` は `from_article は "561"、"548の4"、"第五百六十一条" のいずれかの形式で指定してください`。

例: `chapter: 1, from_article: "abc"` では `code: "INVALID_ARTICLE_NUM"`、`error` は `条番号の形式が不正です（例: "30", "30の2", "第三十条", "第三十条の二"）: abc`。`from_article: "第一項"` と `from_article: ""` も `INVALID_ARTICLE_NUM`。

### SPEC-EGOV-GET-LAW-RANGE-022 `max_chars` を省くと 30,000 文字で、適用した上限を `range.max_chars` に入れる

`max_chars` を省いたときは、返す条本文の文字数の上限を 30,000 文字にする。応答の `range.max_chars` に適用した上限を入れる。

例: `max_chars` を省くと `range.max_chars: 30000`。tools/call（`get_law_range`）で `max_chars: 2000`・`50000`・`120000` を渡すと、`range.max_chars` はそれぞれ `2000`・`50000`・`120000`。

### SPEC-EGOV-GET-LAW-RANGE-023 範囲外の `max_chars` は tools/call で INVALID_ARGUMENT にする

tools/call（`get_law_range`）で、`max_chars` に 2,000 未満または 120,000 を超える値を渡すと、inputSchema の検査でエラー `INVALID_ARGUMENT` を返す。`detail.issues[0].path` は `max_chars`。

例: `max_chars: 1999` では `code: "INVALID_ARGUMENT"`、`detail.issues` は `[{ path: "max_chars", message: "must be >= 2000" }]`。`max_chars: 120001` では `detail.issues` は `[{ path: "max_chars", message: "must be <= 120000" }]`。

### SPEC-EGOV-GET-LAW-RANGE-024 款・目（`subsection` / `division`）で範囲を指す

`subsection`（款）と `division`（目）も、編・章・節と同じ書き方（数値、漢数字、`"第一款"` のような書き方、枝番号 `"2の2"`）で受け、同じ探し方で範囲を指す。上位の階層は省いてよい。款を範囲にしたときの `range.tag` は `Subsection`、目のときは `Division`。`range.titles` と `markdown` の見出しには上位の見出しから並べる。

例: 第二章 > 第一節 > 第一款（第一目に第3条、第二目に第4条・第5条）と第二款の二（第6条）を持つ法令で、

- `chapter: 2, section: 1, subsection: 1` は `range.path: "Chapter2/Section1/Subsection1"`、`range.tag: "Subsection"`、`articles` の条番号 `["3", "4", "5"]`、`range.titles: ["第二章　契約", "第一節　通則", "第一款　成立"]`
- `subsection: "第一款"` も同じ範囲を返す
- `division: "二"` は `range.path: "Chapter2/Section1/Subsection1/Division2"`、`range.tag: "Division"`、条番号 `["4", "5"]`、`markdown` の見出しは `# テスト法 第二章　契約 第一節　通則 第一款　成立 第二目　承諾`
- `subsection: "2の2"` は `range.path: "Chapter2/Section1/Subsection2_2"`、条番号 `["6"]`
- `division: 9` は `RANGE_NOT_FOUND`

### SPEC-EGOV-GET-LAW-RANGE-025 応答の `meta`

応答の `meta` は次のフィールドを持つ。

| フィールド     | 内容                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| `law_id`       | e-Gov の法令 ID                                                        |
| `title`        | 法令名                                                                 |
| `law_num`      | 法令番号                                                               |
| `retrieved_at` | 取得日時（ISO 8601 の UTC）                                            |
| `url`          | e-Gov 法令検索の法令のページ。`https://laws.e-gov.go.jp/law/<law_id>` |
| `at`           | 渡した `at`。`at` を省いたときは付かない                               |

例: 法令 ID `999AC0000000001`・法令名 `テスト法`・法令番号 `令和七年法律第一号` の法令で `chapter: 1` を取ると、`meta` は `{ law_id: "999AC0000000001", title: "テスト法", law_num: "令和七年法律第一号", retrieved_at: <ISO 8601>, url: "https://laws.e-gov.go.jp/law/999AC0000000001" }` で、`at` を持たない。

### SPEC-EGOV-GET-LAW-RANGE-026 markdown の末尾に `range.note` と出典を書く

`markdown` の条の節の後に `---` の行を置き、続けて `range.note` と同じ文の行、`出典：e-Gov法令検索（デジタル庁）`、`URL: https://laws.e-gov.go.jp/law/<law_id>`、`at` を渡したときだけ `時点: <at>`、最後に `取得日時: <meta.retrieved_at と同じ値>` の行を書く。

例: 本文 20 文字の第1条・第2条を持つ第一章を `chapter: 1` で取ると、`markdown` の末尾の 5 行は `---`、`範囲の条 2 件のうち 2 件を返しました（第1条〜第2条）。本文 68 文字（上限 30,000 文字）。`、`出典：e-Gov法令検索（デジタル庁）`、`URL: https://laws.e-gov.go.jp/law/999AC0000000001`、`取得日時: <meta.retrieved_at>` で、`時点:` の行を含まない。`range.note` は 2 行目と同じ文。

### SPEC-EGOV-GET-LAW-RANGE-027 `at` で時点を指定する

`at` を渡したとき、その値を時点として e-Gov の法令本文の取得に渡し、その時点の条文から範囲を返す。`meta.at` に渡した値を入れ、`markdown` の末尾に `時点: <at>` の行を書く（`URL:` の行と `取得日時:` の行の間）。

例: `chapter: 1, at: "2020-04-01"` を渡すと、e-Gov への本文の取得に時点 `2020-04-01` が渡り、`meta.at` は `"2020-04-01"`、`markdown` の末尾の 3 行は `URL: https://laws.e-gov.go.jp/law/<law_id>`、`時点: 2020-04-01`、`取得日時: <meta.retrieved_at>`。

### SPEC-EGOV-GET-LAW-RANGE-028 候補が 6 か所以上のとき、`hint` には全部、`next_actions` には先頭の 5 件を入れる

SPEC-EGOV-GET-LAW-RANGE-004 で指定が 6 か所以上の範囲に当たるとき、`hint` には当たった範囲のパスを全部書くが、`next_actions` には法令の中での出現順で先頭の 5 件だけを入れる。`error` の件数は当たった全部の数。

例: 第1編〜第6編のどれにも第一章がある法令で `chapter: 1` だけを渡すと、`code: "INVALID_ARGUMENT"`、`error` は `指定された範囲が 6 か所あります。上位の階層も指定してください`、`hint` に `Part1/Chapter1` から `Part6/Chapter1` までの 6 件を含み、`next_actions` は 5 件で `example.path` は `["Part1/Chapter1", "Part2/Chapter1", "Part3/Chapter1", "Part4/Chapter1", "Part5/Chapter1"]`（`Part6/Chapter1` は入らない）。
