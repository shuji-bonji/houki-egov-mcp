# 差分: resolve_abbreviation（20261001-t1-argument-guards）

`specs/current/resolve_abbreviation/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-RESOLVE-ABBREVIATION-010 abbr が空文字・空白だけのときは略称辞書を引かずに `INVALID_ARGUMENT` を返す

空文字は inputSchema の `minLength: 1` の検査（SPEC-EGOV-COMMON-ERRORS-025）で止まり、`INVALID_ARGUMENT`（`tool: "resolve_abbreviation"`、`detail.issues: [{ path: "abbr", message: "空文字は指定できません" }]`）を返す。空白（半角スペース・全角スペース・タブ・改行）だけのときは、ツールの処理が略称辞書を引く前に、SPEC-EGOV-COMMON-ERRORS-026 の形の `INVALID_ARGUMENT`（`tool: "resolve_abbreviation"`、`error: "abbr が空です"`、`detail.issues: [{ path: "abbr", message: "空白だけは指定できません" }]`、`hint` に略称・正式名称・別名を渡すよう書く）を返す。

例: `abbr: ""` は `code: "INVALID_ARGUMENT"`・`detail.issues[0].message: "空文字は指定できません"`。`abbr: "　"`（全角スペース）と `abbr: " \n"` は `code: "INVALID_ARGUMENT"`・`error: "abbr が空です"`。どれも略称辞書は引かない。

v0.15.4 では `abbr: ""` に `resolved: null` と `example: { keyword: "" }` の `search_law` の案内（SPEC-EGOV-RESOLVE-ABBREVIATION-003・004 の形）を返していたが、空の `abbr` は辞書に無い略称ではなく引数の誤りなので、003・004 の対象から外れる。
