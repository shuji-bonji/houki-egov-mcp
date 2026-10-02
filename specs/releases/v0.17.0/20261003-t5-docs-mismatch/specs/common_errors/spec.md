# 差分: common_errors（20261003-t5-docs-mismatch）

`specs/current/common_errors/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- 「エラーの code」の表の `INTERNAL_ERROR` の行の説明に「再試行しても結果は変わらない（`retryable: false`）」を足す

## MODIFIED

### SPEC-EGOV-COMMON-ERRORS-002 存在しないツール名はエラー `UNKNOWN_TOOL`（`retryable: false`）で、`error` は日本語

tools/call の `name` が 14 ツールのどれでもないときは、エラー `UNKNOWN_TOOL` を返す（`isError: true`）。

- `error` は `存在しないツールです: <name>`（ほかのエラーと同じく日本語の 1 文）
- `retryable` は `false`（同じ名前で呼び直しても結果は変わらない）
- `hint` に、呼べるツール名の一覧（`search_law` など）を書く
- `next_actions` の先頭は `action: "list_tools"`（MCP の tools/list で呼べるツールを確かめる案内）

例: `name: "no_such_tool"` を呼ぶと、`code: "UNKNOWN_TOOL"`、`error: "存在しないツールです: no_such_tool"`、`retryable: false` で、`hint` に `search_law` が含まれる（v0.16.0 では `error` が英語の `Unknown tool: no_such_tool` で、`retryable` が無かった。README のエラー code の表は `false` と書いていた）。

### SPEC-EGOV-COMMON-ERRORS-007 処理中の想定外の例外はエラー `INTERNAL_ERROR`（`retryable: false`）で返す

ツールの処理の途中で想定外の例外が起きたときは、プロトコルのエラーにせず、tools/call の結果としてエラー `INTERNAL_ERROR` を返す（`isError: true`）。

- `retryable` は `false`（不具合の可能性が高く、同じ呼び出しをやり直しても結果は変わらない。`hint` は不具合の報告を求める。SPEC-EGOV-COMMON-ERRORS-017）
- `detail.cause` に、元の例外の文を入れる（例: 例外の文が `boom` なら `detail.cause` は `boom`）

例: ツールの処理が `new Error("boom")` を投げると、`code: "INTERNAL_ERROR"`、`retryable: false`、`detail.cause: "boom"`（v0.16.0 では `retryable: true` で、README のエラー code の表の `false` と食い違っていた）。

### SPEC-EGOV-COMMON-ERRORS-018 処理中の想定外の例外で返す `INTERNAL_ERROR` には `next_actions` を付けない

SPEC-EGOV-COMMON-ERRORS-007 のエラーには `next_actions` を付けない。再試行を案内する `retry_later` は、`retryable: false` と `hint` の「再現手順を添えて GitHub issue でご報告ください」に合わないので入れない。次の 1 件が無くなると `next_actions` が空になるので、SPEC-EGOV-COMMON-ERRORS-008 のとおりキーごと付けない。

例: ツールの処理が `new Error("boom")` を投げると、エラーの本文に `next_actions` は無い（v0.16.0 では `[{ action: "retry_later", reason: "一時的な API エラーの可能性があります。30秒〜数分後に再試行してください" }]` だった）。
