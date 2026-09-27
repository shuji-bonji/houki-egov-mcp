# 差分: common_errors（20260928-untested-behaviors）

`specs/current/common_errors/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-COMMON-ERRORS-012 `arguments` を省いた呼び出しは空のオブジェクトとして検査し、エラー `INVALID_ARGUMENT` を返す

tools/call の `arguments` を省くと、空のオブジェクト `{}` を渡したものとして inputSchema で検査する。14 ツールはどれも必須の引数を 1 つ以上持つので、どのツールでもエラー `INVALID_ARGUMENT` を返す（`isError: true`）。ツールの処理には進まない。

例: `name: "search_law"` を `arguments` なしで呼ぶと、`isError: true`、`code: "INVALID_ARGUMENT"`、`hint` は `tools/list の search_law の inputSchema を確認してください (型・必須・enum・未知の引数)`。`explain_law_type`・`get_law`・`resolve_abbreviation`・`verify_citations`・`list_attachments`・`get_law_file` を `arguments` なしで呼んでも、どれも `code: "INVALID_ARGUMENT"`。`arguments: {}` を渡したときと同じ本文になる。

### SPEC-EGOV-COMMON-ERRORS-013 inputSchema の検査で返す `INVALID_ARGUMENT` の `error` は、決まった前置きの後に問題を `<path>: <message>` の形で続ける

SPEC-EGOV-COMMON-ERRORS-003・004 のエラーの `error` は、`引数が tools/list の inputSchema に合いません: ` の後に、`detail.issues` の各要素を `<path>: <message>` の形にして `; ` 区切りで続けた文字列である。`path` が空の要素は `<message>` だけを書く。

`message` の文言（英語の検査の文を含む）そのものは約束にしない（言語と必須の引数の `path` は houki-egov-mcp #57 で決める）。`error` が、同じ応答の `detail.issues` から上の規則で組み立てた文字列と一致することを約束する。

例:

| 呼び出し                                                            | `error`                                                                                     | `detail.issues`                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `explain_law_type` に `name: 123`                                   | `引数が tools/list の inputSchema に合いません: name: must be string`                       | `[{ path: "name", message: "must be string" }]`                               |
| `explain_law_type` に `name: "政令", typo: 1`                       | `引数が tools/list の inputSchema に合いません: typo: inputSchema に無い引数です`           | `[{ path: "typo", message: "inputSchema に無い引数です" }]`                   |
| `search_law` に `keyword: "消費税", law_type: "Bogus"`              | `引数が tools/list の inputSchema に合いません: law_type: must be equal to one of the allowed values` | `[{ path: "law_type", message: "must be equal to one of the allowed values" }]` |

### SPEC-EGOV-COMMON-ERRORS-014 inputSchema の検査で返す `INVALID_ARGUMENT` の `hint` は、呼んだツールの名前を入れた決まった文

SPEC-EGOV-COMMON-ERRORS-003・004 のエラーの `hint` は `tools/list の <ツール名> の inputSchema を確認してください (型・必須・enum・未知の引数)` で、`<ツール名>` は tools/call の `name` である。

例: `explain_law_type` に `name: 123` を渡すと、`hint` は `tools/list の explain_law_type の inputSchema を確認してください (型・必須・enum・未知の引数)`。`search_law` に `keyword: "消費税", law_type: "Bogus"` を渡すと、`hint` は `tools/list の search_law の inputSchema を確認してください (型・必須・enum・未知の引数)`。

### SPEC-EGOV-COMMON-ERRORS-015 inputSchema の検査で返す `INVALID_ARGUMENT` の `next_actions` は `list_tools` の 1 件

SPEC-EGOV-COMMON-ERRORS-003・004 のエラーの `next_actions` は、`{ action: "list_tools", reason: "inputSchema で引数の型と必須項目を確認できます" }` の 1 件だけである。`example` は付かない。`retryable` も付かない。

例: `explain_law_type` に `name: "政令", typo: 1` を渡すと、`next_actions` は `[{ action: "list_tools", reason: "inputSchema で引数の型と必須項目を確認できます" }]` で、本文に `retryable` のキーは無い。

### SPEC-EGOV-COMMON-ERRORS-016 処理中の想定外の例外で返す `INTERNAL_ERROR` の `error` は `内部エラーが発生しました: <例外の文>`

SPEC-EGOV-COMMON-ERRORS-007 のエラーの `error` は、`内部エラーが発生しました: ` の後に元の例外の文を続けた文字列である。例外が Error でない値（文字列など）のときは、その値を文字列にしたものを続ける。`detail.cause` も同じ文になる。

例: ツールの処理が `new Error("boom")` を投げると、`error` は `内部エラーが発生しました: boom`、`detail.cause` は `boom`。文字列 `"strboom"` を投げると、`error` は `内部エラーが発生しました: strboom`、`detail.cause` は `strboom`。

### SPEC-EGOV-COMMON-ERRORS-017 処理中の想定外の例外で返す `INTERNAL_ERROR` の `hint` は不具合の報告を促す決まった文

SPEC-EGOV-COMMON-ERRORS-007 のエラーの `hint` は `バグの可能性があります。再現手順を添えて GitHub issue でご報告ください` である。例外の文によって変わらない。

例: ツールの処理が `new Error("boom")` を投げたときも、文字列 `"strboom"` を投げたときも、`hint` は `バグの可能性があります。再現手順を添えて GitHub issue でご報告ください`。

### SPEC-EGOV-COMMON-ERRORS-018 処理中の想定外の例外で返す `INTERNAL_ERROR` の `next_actions` は `retry_later` の 1 件

SPEC-EGOV-COMMON-ERRORS-007 のエラーの `next_actions` は、`{ action: "retry_later", reason: "一時的な API エラーの可能性があります。30秒〜数分後に再試行してください" }` の 1 件だけである。`example` は付かない。

例: ツールの処理が `new Error("boom")` を投げると、`next_actions` は `[{ action: "retry_later", reason: "一時的な API エラーの可能性があります。30秒〜数分後に再試行してください" }]`。

### SPEC-EGOV-COMMON-ERRORS-019 `hint` が空文字のエラーには `hint` を付けない

ツールの処理が `hint` を空文字にしたエラーを返したときは、本文に `hint` のキーを付けない。SPEC-EGOV-COMMON-ERRORS-008 の「値を決めていないとき」と同じに扱う。

例: ツールの処理が `code: "LAW_NOT_FOUND"`・`error: "x"`・`hint: ""` のエラーを返すと、結果は `isError: true` で、本文は `{ "error": "x", "code": "LAW_NOT_FOUND" }` だけを持つ（`hint` のキーは無い）。
