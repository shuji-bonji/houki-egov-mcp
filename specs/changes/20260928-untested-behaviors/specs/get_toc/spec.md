# 差分: get_toc（20260928-untested-behaviors）

`specs/current/get_toc/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-GET-TOC-012 法令が見つからないときは LAW_NOT_FOUND を返す

略称辞書にも e-Gov の法令検索にも当たらない `law_name` では、エラー `LAW_NOT_FOUND` を返す。`error` は `法令が見つかりません: <law_name>`。`next_actions` は 2 件で、1 件目は `resolve_abbreviation`（`example.abbr` に `law_name`）、2 件目は `search_law`（`example.keyword` に `law_name`）。

例: `law_name: "存在しない法"`（法令検索の結果が 0 件）では、`code: "LAW_NOT_FOUND"`、`error: "法令が見つかりません: 存在しない法"`、`next_actions` の `action` は `["resolve_abbreviation", "search_law"]`、`next_actions[0].example` は `{ abbr: "存在しない法" }`、`next_actions[1].example` は `{ keyword: "存在しない法" }`。

### SPEC-EGOV-GET-TOC-013 houki-egov の管轄外の名前には OUT_OF_SCOPE を返す

略称辞書で houki-egov 以外の管轄と分かる `law_name`（通達名など）では、e-Gov に問い合わせずにエラー `OUT_OF_SCOPE` を返す。`error` に正式名称と管轄の MCP 名を書き、`next_actions[0]` は `action: "delegate_to_mcp"`、`example.mcp` に管轄の MCP 名を入れる。

例: `law_name: "消基通"` では、`code: "OUT_OF_SCOPE"`、`error` は `「消費税法基本通達」は houki-nta の管轄です` で始まり、`next_actions[0]` は `{ action: "delegate_to_mcp", example: { mcp: "houki-nta" } }`（`reason` も付く）、`detail.cause` は `source_mcp_hint=houki-nta`。

### SPEC-EGOV-GET-TOC-014 法令本文の取得で e-Gov が失敗したときのエラー

法令を引けた後、e-Gov から法令本文を取るところで失敗したときは、次のエラーを返す。

| e-Gov の失敗                                | `code`                | `retryable` | `next_actions` の `action`         |
| ------------------------------------------- | --------------------- | ----------- | ---------------------------------- |
| 429                                         | `SOURCE_RATE_LIMITED` | `true`      | `retry_later`                      |
| タイムアウト                                | `SOURCE_TIMEOUT`      | `true`      | `retry_later`、`visit_egov_site`   |
| 5xx                                         | `SOURCE_API_ERROR`    | `true`      | `retry_later`、`visit_egov_site`   |

429 と 5xx では `detail.status` に HTTP の状態コードを入れる。

例: 本文の取得が 503 で失敗すると、`code: "SOURCE_API_ERROR"`、`error: "e-Gov API がサーバーエラーを返しました（503）"`、`retryable: true`、`detail.status: 503`。429 では `code: "SOURCE_RATE_LIMITED"`、`error: "e-Gov API がレート制限を返しました（429）"`。タイムアウトでは `code: "SOURCE_TIMEOUT"`、`error: "e-Gov API がタイムアウトしました"`。

### SPEC-EGOV-GET-TOC-015 応答の `meta`

応答の `meta` は次のフィールドを持つ。

| フィールド     | 内容                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| `law_id`       | e-Gov の法令 ID                                                        |
| `title`        | 法令名                                                                 |
| `law_num`      | 法令番号                                                               |
| `retrieved_at` | 取得日時（ISO 8601 の UTC。例: `2026-09-27T20:31:59.713Z`）            |
| `url`          | e-Gov 法令検索の法令のページ。`https://laws.e-gov.go.jp/law/<law_id>` |
| `at`           | 渡した `at`。`at` を省いたときは付かない                               |

例: 法令 ID `999AC0000000001`・法令名 `テスト法`・法令番号 `令和七年法律第一号` の法令では、`meta` は `{ law_id: "999AC0000000001", title: "テスト法", law_num: "令和七年法律第一号", retrieved_at: <ISO 8601>, url: "https://laws.e-gov.go.jp/law/999AC0000000001" }` で、`at` を持たない。

### SPEC-EGOV-GET-TOC-016 `node_count` は返した本則の目次のノード数

応答の `node_count` は、返した `toc` のノード（編・章・節・款・目と条）を入れ子の中まで数えた数である。附則のノードは数えない。`depth` で刈ったときは、刈った後の `toc` のノード数になる。

例: 第一編 > 第一章（第1条・第2条）・第二章 > 第一節（第3条）の本則と附則 2 本を持つ法令では、`node_count: 7`（編 1・章 2・節 1・条 3）、`truncated: false`。同じ法令に `depth: 1` を渡すと、`node_count: 1`、`truncated: true`。

### SPEC-EGOV-GET-TOC-017 markdown の見出しと末尾の出典

`markdown` の 1 行目は `# <法令名> — 目次`。目次の後に `---` の行を置き、続けて `出典：e-Gov法令検索（デジタル庁）`、`URL: https://laws.e-gov.go.jp/law/<law_id>`、`at` を渡したときだけ `時点: <at>`、最後に `取得日時: <meta.retrieved_at と同じ値>` の行を書く。

例: `law_name: "テスト法"`（法令 ID `999AC0000000001`）を `at` なしで取ると、`markdown` は `# テスト法 — 目次` で始まり、末尾の 4 行は `---`、`出典：e-Gov法令検索（デジタル庁）`、`URL: https://laws.e-gov.go.jp/law/999AC0000000001`、`取得日時: <meta.retrieved_at>` で、`時点:` の行を含まない。

### SPEC-EGOV-GET-TOC-018 `at` で時点を指定する

`at` を渡したとき、その値を時点として e-Gov の法令本文の取得に渡し、その時点の目次を返す。`meta.at` に渡した値を入れ、`markdown` の末尾に `時点: <at>` の行を書く（`URL:` の行と `取得日時:` の行の間）。

例: `at: "2020-04-01"` を渡すと、e-Gov への本文の取得に時点 `2020-04-01` が渡り、`meta.at` は `"2020-04-01"`、`markdown` の末尾の 3 行は `URL: https://laws.e-gov.go.jp/law/<law_id>`、`時点: 2020-04-01`、`取得日時: <meta.retrieved_at>`。

### SPEC-EGOV-GET-TOC-019 `suppl: "full"` と `depth` を一緒に渡すと、附則の中の目次も打ち切る

`suppl: "full"` と `depth` を一緒に渡したとき、`suppl_provisions` の各要素の `children` にも本則と同じ打ち切りを当てる（構造階層を上から `depth` 階層までにし、それより下は `children` を空配列にする。条は階層として数えない）。`suppl: "list"` と `suppl: "none"` では附則の中身を返さないので、`depth` は附則に効かない。

例: 1 本目が条だけ（第1条）の附則、2 本目が第一章（第1条・第2条）を持つ附則の法令で、`suppl: "full", depth: 1` を渡すと、1 本目の `children` は第1条の 1 件のまま、2 本目の `children` は第一章の 1 件でその `children` は空配列。`depth: 2` では、2 本目の第一章の `children` の条番号は `["1", "2"]`。

### SPEC-EGOV-GET-TOC-020 改正履歴が取れなかったときは、題名なしの目次を返す

`with_amend_titles: true` で e-Gov の改正履歴の取得に失敗したときは、エラーにせず、附則に `amend_law_title` を付けない目次を返す。`suppl.amend_law_titles` は付けない。`suppl.note` の末尾に `。改正法の題名は付けられませんでした（改正履歴の取得に失敗: <失敗の理由>）` を足す。

例: 附則 2 本・条 3 件の法令で改正履歴の取得が 503（理由の文言 `svc down`）で失敗すると、目次は返り、`suppl_provisions` のどの要素にも `amend_law_title` が無く、`suppl.amend_law_titles` は無く、`suppl.note` は `附則 2 本の見出しと条数だけを返しました（条は合計 3 件）。中の条まで要るときは suppl: "full" を指定してください。改正法の題名は付けられませんでした（改正履歴の取得に失敗: svc down）`。

### SPEC-EGOV-GET-TOC-021 `suppl: "none"` のときは `with_amend_titles` を渡しても改正履歴を引かない

`suppl: "none"` と `with_amend_titles: true` を一緒に渡したときは、返す附則が無いので e-Gov の改正履歴を問い合わせない。`suppl.amend_law_titles` は付かず、`suppl.note` は `suppl: "none"` のときの文のまま。

例: 附則 2 本・条 3 件の法令に `suppl: "none", with_amend_titles: true` を渡すと、改正履歴の問い合わせは 0 回で、`suppl` は `{ mode: "none", count: 2, article_count: 3, note: "附則 2 本（条 3 件）は返していません（suppl: \"none\"）" }`。

### SPEC-EGOV-GET-TOC-022 `depth` に 0 以下を渡すと全階層を返す

`depth` に 0 または負の数を渡したときは、`depth` を省いたときと同じく本則の全階層を返し、`truncated` は `false`。

例: `node_count` が 7 の法令に `depth: 0` または `depth: -1` を渡すと、`toc` は `depth` を省いたときと同じで、`node_count: 7`、`truncated: false`。tools/call（`get_toc`）を通しても同じで、エラーにならない。
