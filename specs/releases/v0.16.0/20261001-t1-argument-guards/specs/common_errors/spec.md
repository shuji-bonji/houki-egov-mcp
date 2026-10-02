# 差分: common_errors（20261001-t1-argument-guards）

`specs/current/common_errors/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「エラー応答のフィールド」の表に `tool` の行を足す（下の MODIFIED）

## MODIFIED

### エラー応答のフィールド

エラーの本文は、次のフィールドを持つ JSON オブジェクトである。`error` と `code` は必ず付き、ほかは値があるときだけ付く（SPEC-EGOV-COMMON-ERRORS-008）。

| フィールド     | 内容                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `error`        | 1 文のエラーの説明（人も LLM も読む）                                                                                                                                                                                          |
| `code`         | 失敗の種類を表す文字列（下の表）                                                                                                                                                                                               |
| `tool`         | エラーを返したツールの名前。引数の検査の `INVALID_ARGUMENT` には必ず付く（SPEC-EGOV-COMMON-ERRORS-020・026）                                                                                                                   |
| `hint`         | 次に何を確かめるかの案内                                                                                                                                                                                                       |
| `next_actions` | 次に呼ぶツールや取る手段の候補の配列。要素は `action`（ツール名、または `list_tools` / `retry_later` / `visit_egov_site` / `delegate_to_mcp` のような手段の名前）・`reason`（どんなときに有効か）・`example`（引数の例。任意） |
| `retryable`    | `true` なら、時間をおいて同じ呼び出しをやり直すと結果が変わりうる                                                                                                                                                              |
| `detail`       | 調べるための詳細。`status`（HTTP ステータス）・`url`・`cause`（元の例外の文）・`issues`（引数の検査の問題の一覧。要素は `path` と `message`）                                                                                  |

### SPEC-EGOV-COMMON-ERRORS-003 inputSchema に合わない引数はエラー `INVALID_ARGUMENT`

引数の型が違う、必須の引数が無い、`enum` に無い値を渡した、数値が `minimum` / `maximum` の範囲の外にある、文字列が `pattern` / `minLength` に合わない、配列の件数が `minItems` / `maxItems` の範囲の外にある、のどれかのときは、エラー `INVALID_ARGUMENT` を返す（`isError: true`）。14 ツールすべてが、tools/list に出している inputSchema と同じものでこの検査を行う。

- `tool` に呼んだツールの名前を入れる（SPEC-EGOV-COMMON-ERRORS-020）
- `detail.issues` に問題の一覧を入れる。要素は `path`（問題のある引数名。入れ子なら `citations.0.paragraph` の形）と `message`（日本語の 1 文。SPEC-EGOV-COMMON-ERRORS-022）。違反 1 件ごとに要素を分ける（021）

例: `explain_law_type` に `name: 123` を渡すと、`code: "INVALID_ARGUMENT"`・`tool: "explain_law_type"` で、`detail.issues[0].path` は `name`。`search_law` に引数を 1 つも渡さない（必須の `keyword` が無い）とき、`keyword: "消費税", law_type: "Bogus"` を渡したとき、`keyword: "消費税", limit: 100` を渡したとき（SPEC-EGOV-SEARCH-LAW-013）、`get_article_references` に `law_name: "所得税法"` だけを渡した（必須の `article` が無い）ときも、`INVALID_ARGUMENT` を返す。

### SPEC-EGOV-COMMON-ERRORS-012 `arguments` を省いた呼び出しは空のオブジェクトとして検査し、エラー `INVALID_ARGUMENT` を返す

tools/call の `arguments` を省くと、空のオブジェクト `{}` を渡したものとして inputSchema で検査する。14 ツールはどれも必須の引数を 1 つ以上持つので、どのツールでもエラー `INVALID_ARGUMENT` を返す（`isError: true`）。ツールの処理には進まない。

例: `name: "search_law"` を `arguments` なしで呼ぶと、`isError: true`、`code: "INVALID_ARGUMENT"`、`tool: "search_law"`、`hint` は `tools/list の search_law の inputSchema を確認してください (型・必須・enum・範囲・形式・未知の引数)`、`detail.issues` は `[{ path: "keyword", message: "必須の引数です" }]`。`explain_law_type`・`get_law`・`resolve_abbreviation`・`verify_citations`・`list_attachments`・`get_law_file` を `arguments` なしで呼んでも、どれも `code: "INVALID_ARGUMENT"`。`arguments: {}` を渡したときと同じ本文になる。

### SPEC-EGOV-COMMON-ERRORS-013 inputSchema の検査で返す `INVALID_ARGUMENT` の `error` は、決まった前置きの後に問題を `<path>: <message>` の形で続ける

SPEC-EGOV-COMMON-ERRORS-003・004 のエラーの `error` は、`引数が tools/list の inputSchema に合いません: ` の後に、`detail.issues` の各要素を `<path>: <message>` の形にして `; ` 区切りで続けた文字列である。`path` は空にならない（SPEC-EGOV-COMMON-ERRORS-021）ので、`<message>` だけの要素は無い。`message` は SPEC-EGOV-COMMON-ERRORS-022 の文である。

例:

| 呼び出し                                               | `error`                                                                                                                              | `detail.issues`                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `explain_law_type` に `name: 123`                      | `引数が tools/list の inputSchema に合いません: name: 文字列で指定してください`                                                      | `[{ path: "name", message: "文字列で指定してください" }]`                                                        |
| `explain_law_type` に `name: "政令", typo: 1`          | `引数が tools/list の inputSchema に合いません: typo: inputSchema に無い引数です`                                                    | `[{ path: "typo", message: "inputSchema に無い引数です" }]`                                                      |
| `search_law` に `keyword: "消費税", law_type: "Bogus"` | `引数が tools/list の inputSchema に合いません: law_type: Act・CabinetOrder・ImperialOrdinance・MinisterialOrdinance・Rule のどれかで指定してください` | `[{ path: "law_type", message: "Act・CabinetOrder・ImperialOrdinance・MinisterialOrdinance・Rule のどれかで指定してください" }]` |
| `search_law` に `keyword: 1, limit: "x"`               | `引数が tools/list の inputSchema に合いません: keyword: 文字列で指定してください; limit: 整数で指定してください`                    | `[{ path: "keyword", message: "文字列で指定してください" }, { path: "limit", message: "整数で指定してください" }]` |

### SPEC-EGOV-COMMON-ERRORS-014 inputSchema の検査で返す `INVALID_ARGUMENT` の `hint` は、呼んだツールの名前を入れた決まった文

SPEC-EGOV-COMMON-ERRORS-003・004 のエラーの `hint` は `tools/list の <ツール名> の inputSchema を確認してください (型・必須・enum・範囲・形式・未知の引数)` で、`<ツール名>` は tools/call の `name` である。

例: `explain_law_type` に `name: 123` を渡すと、`hint` は `tools/list の explain_law_type の inputSchema を確認してください (型・必須・enum・範囲・形式・未知の引数)`。`search_law` に `keyword: "消費税", limit: 0` を渡すと、`hint` は `tools/list の search_law の inputSchema を確認してください (型・必須・enum・範囲・形式・未知の引数)`。

## ADDED

### SPEC-EGOV-COMMON-ERRORS-020 inputSchema の検査で返す `INVALID_ARGUMENT` は `tool` に呼んだツールの名前を持つ

SPEC-EGOV-COMMON-ERRORS-003・004・012 のエラーの本文は、`code` と並ぶ位置に `tool` を持ち、値は tools/call の `name` である。houki-nta-mcp の同じエラー（SPEC-NTA-COMMON-ERRORS-003）と同じ置き場で、`detail` の中ではない。

例: `explain_law_type` に `name: 123` を渡すと `tool: "explain_law_type"`。`get_related_laws` に `law_name: "所得税法", mcp: "houki-egov"` を渡すと `tool: "get_related_laws"`。`verify_citations` を `arguments` なしで呼ぶと `tool: "verify_citations"`。

### SPEC-EGOV-COMMON-ERRORS-021 `detail.issues` は違反 1 件ごとに要素を分け、`path` には引数名を入れる

SPEC-EGOV-COMMON-ERRORS-003・004 のエラーの `detail.issues` は、違反 1 件につき 1 要素である。`path` は、その違反のあった引数の名前で、空文字にならない。

- 必須の引数が無いときも、`path` はその引数の名前である（`""` ではない）。必須の引数が 2 つ無ければ、要素も 2 つ
- inputSchema に無い引数が 2 つ以上あるときも、1 つずつ別の要素にする（`typo, foo` のようにまとめない）
- 型の違反と inputSchema に無い引数が同時にあるときは、両方の要素を返す
- 配列の要素の中の引数は、`citations.0.paragraph` のように、引数名・添字・フィールド名を `.` でつなぐ

例: `explain_law_type` に `name: "政令", typo: 1, foo: 2` を渡すと、`detail.issues` は `[{ path: "typo", … }, { path: "foo", … }]` の 2 要素で、どちらの `message` も `inputSchema に無い引数です`。`get_article_references` に `{}` を渡すと `[{ path: "law_name", message: "必須の引数です" }, { path: "article", message: "必須の引数です" }]`。`search_law` に `keyword: "a", limit: "x", zz: 1` を渡すと `path` が `limit` と `zz` の 2 要素。`verify_citations` に `citations: [{ law_name: "民法", article: "1", paragraph: 0 }]` を渡すと `[{ path: "citations.0.paragraph", message: "1 以上で指定してください" }]`。

### SPEC-EGOV-COMMON-ERRORS-022 `detail.issues[].message` は違反の種類ごとに決まった日本語の 1 文

SPEC-EGOV-COMMON-ERRORS-003・004 のエラーの `message` は、次の表の文である。検査の部品が作る英文（`must be string` など）はそのまま返さない。

| 違反                                     | `message`                                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 型が `string` でない                     | `文字列で指定してください`                                                                           |
| 型が `integer` でない（小数を含む）      | `整数で指定してください`                                                                             |
| 型が `number` でない                     | `数値で指定してください`                                                                             |
| 型が `boolean` でない                    | `true か false で指定してください`                                                                   |
| 型が `array` でない                      | `配列で指定してください`                                                                             |
| 型が `object` でない                     | `オブジェクトで指定してください`                                                                     |
| 必須の引数が無い                         | `必須の引数です`                                                                                     |
| `enum` に無い値                          | `<値1>・<値2>・… のどれかで指定してください`（`enum` の値を `・` でつなぐ）                          |
| `minimum` を下回る                       | `<minimum> 以上で指定してください`（例: `1 以上で指定してください`）                                 |
| `maximum` を上回る                       | `<maximum> 以下で指定してください`（例: `50 以下で指定してください`）                                |
| `pattern` に合わない（`at`）             | `YYYY-MM-DD の形で指定してください`                                                                  |
| `minLength: 1` に合わない（空文字）      | `空文字は指定できません`                                                                             |
| `minItems` を下回る                      | `<minItems> 件以上で指定してください`                                                                |
| `maxItems` を上回る                      | `<maxItems> 件以下で指定してください`                                                                |
| inputSchema に無い引数                   | `inputSchema に無い引数です`                                                                         |

例: `get_law` に `law_name: "民法", paragraph: 1.5` を渡すと `message` は `整数で指定してください`。`paragraph: 0` なら `1 以上で指定してください`。`search_law` に `keyword: "民法", limit: 51` を渡すと `50 以下で指定してください`。`get_law` に `law_name: "民法", at: "2024/04/01"` を渡すと `YYYY-MM-DD の形で指定してください`。`get_law` に `law_name: ""` を渡すと `空文字は指定できません`。`get_law_file` に `law_name: "民法", file_type: "pdf"` を渡すと `xml・json・html・rtf・docx のどれかで指定してください`。`verify_citations` に `citations: []` を渡すと `1 件以上で指定してください`。

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
| `get_law_range`          | `max_chars`             | 2,000     | 120,000   | 30,000                        | SPEC-EGOV-GET-LAW-RANGE-023（既存）    |

`get_law` / `verify_citations` の `item` は文字列（`"8の2"`）も受け付けるので、この表に入れない（読めない形は `INVALID_ARTICLE_NUM`。SPEC-EGOV-GET-LAW-011）。

例: tools/list の `search_law` の inputSchema は `properties.limit` が `type: "integer"`、`minimum: 1`、`maximum: 50` を持つ。`get_toc` の `properties.depth` は `type: "integer"`、`minimum: 1` を持ち、`maximum` を持たない。

### SPEC-EGOV-COMMON-ERRORS-024 `at` は `YYYY-MM-DD` の形を inputSchema の `pattern` で確かめ、暦に無い日付はツールの処理で `INVALID_ARGUMENT` にする

時点の引数 `at` を持つ 8 ツール（`get_law` / `get_toc` / `get_law_range` / `get_article_references` / `verify_citations` / `list_attachments` / `get_attachment` / `get_law_file`）は、inputSchema の `at` に `pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"` を書く。形に合わない値（`2024/04/01`、`20240401`、`2024-4-1`、`2024-04-01T00:00:00Z`）は SPEC-EGOV-COMMON-ERRORS-003 の検査で `INVALID_ARGUMENT`（`path: "at"`、`message: "YYYY-MM-DD の形で指定してください"`）になり、ツールの処理に進まない。

形は合うが暦に無い日付（`2026-02-30`、`2026-13-01`、`2026-04-31`）は、ツールの処理が e-Gov に問い合わせる前に、SPEC-EGOV-COMMON-ERRORS-026 と同じ形の `INVALID_ARGUMENT`（`tool`・`detail.issues: [{ path: "at", message: "暦に無い日付です" }]`）を返す。`error` は `at が暦に無い日付です: <渡した値>`。

例: `get_law` に `law_name: "民法", at: "2024/04/01"` を渡すと `code: "INVALID_ARGUMENT"`、`tool: "get_law"`、`detail.issues` は `[{ path: "at", message: "YYYY-MM-DD の形で指定してください" }]` で、e-Gov への問い合わせは 0 回。`at: "2026-02-30"` を渡すと `detail.issues` は `[{ path: "at", message: "暦に無い日付です" }]` で、e-Gov への問い合わせは 0 回。`at: "2024-04-01"` は検査を通る。

### SPEC-EGOV-COMMON-ERRORS-025 必須の文字列の引数は inputSchema に `minLength: 1` を書き、空文字は `INVALID_ARGUMENT`

必須の文字列の引数（`search_law` / `search_fulltext` の `keyword`、`get_law` / `get_toc` / `get_law_range` / `get_law_revisions` / `get_related_laws` / `get_article_references` / `list_attachments` / `get_attachment` / `get_law_file` の `law_name`、`resolve_abbreviation` の `abbr`、`explain_law_type` の `name`、`get_article_references` の `article`、`verify_citations` の `citations[].article`）は、inputSchema に `minLength: 1` を書く。空文字は SPEC-EGOV-COMMON-ERRORS-003 の検査で `INVALID_ARGUMENT`（`message: "空文字は指定できません"`）になり、ツールの処理に進まない。`enum` を持つ必須の文字列（`get_law_file` の `file_type`）は `enum` で止まるので `minLength` は書かない。`verify_citations` の `law_name` / `law_id` は片方が必須なので `minLength` を書かず、SPEC-EGOV-VERIFY-CITATIONS-003・032 のままである。

例: `get_law` に `law_name: ""` を渡すと `code: "INVALID_ARGUMENT"`、`tool: "get_law"`、`detail.issues` は `[{ path: "law_name", message: "空文字は指定できません" }]` で、e-Gov への問い合わせは 0 回（v0.15.4 の `LAW_NOT_FOUND` ではない）。`resolve_abbreviation` に `abbr: ""` を渡しても `INVALID_ARGUMENT`（v0.15.4 の `resolved: null` ではない）。`search_fulltext` に `keyword: ""` を渡しても `INVALID_ARGUMENT`（v0.15.4 の `hits: []` ではない）。

### SPEC-EGOV-COMMON-ERRORS-026 空白だけの必須の文字列は、ツールの処理で同じ形の `INVALID_ARGUMENT` にする

必須の文字列の引数が空白（半角スペース・全角スペース・タブ・改行）だけのときは、inputSchema では止まらないので、各ツールの処理が、e-Gov・ローカル DB・略称辞書のどれにも問い合わせる前に `INVALID_ARGUMENT` を返す。本文は次の形で、inputSchema の検査のエラーと同じ `tool`・`detail.issues` を持つ。

- `tool`: 呼んだツールの名前
- `error`: `<引数名> が空です`
- `detail.issues`: `[{ path: "<引数名>", message: "空白だけは指定できません" }]`
- `hint`: 各ツールが決める（その引数に何を渡すかの案内）
- `next_actions`: 各ツールが決める（付けなくてもよい）

対象の引数は SPEC-EGOV-COMMON-ERRORS-025 と同じ。各ツールの仕様 ID は、`search_law` 007、`get_law` 003、`get_toc` 025、`search_fulltext` 034、`resolve_abbreviation` 010、`get_law_revisions` 013、`explain_law_type` 019、`get_related_laws` 016、`get_article_references` 039、`verify_citations` 042、`get_law_range` 029、`list_attachments` 020、`get_attachment` 023、`get_law_file` 018。

例: `get_law` に `law_name: "   "` を渡すと `code: "INVALID_ARGUMENT"`、`tool: "get_law"`、`error: "law_name が空です"`、`detail.issues` は `[{ path: "law_name", message: "空白だけは指定できません" }]` で、e-Gov への問い合わせは 0 回。`explain_law_type` に `name: "\t\n"` を渡しても `INVALID_ARGUMENT`（`found: false` の応答ではない）。
