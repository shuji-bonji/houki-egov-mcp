# 差分: get_law_revisions（20261001-t1-argument-guards）

`specs/current/get_law_revisions/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「入力」の表の `latest` の行を「先頭から何件を返すか。1 以上の整数（SPEC-EGOV-GET-LAW-REVISIONS-012）。省略すると全件」にする

## ADDED

### SPEC-EGOV-GET-LAW-REVISIONS-012 `latest` は 1 以上の整数で、0・負の数・小数は `INVALID_ARGUMENT` にして改正履歴を取らない

tools/list の inputSchema の `latest` は `type: "integer"`、`minimum: 1` を持ち、`maximum` を持たない（SPEC-EGOV-COMMON-ERRORS-023）。0・負の数・小数・数値でない値を渡すと、inputSchema の検査で `INVALID_ARGUMENT`（`tool: "get_law_revisions"`、`detail.issues[0].path: "latest"`）を返し、e-Gov に問い合わせない。全件に読み替えたり切り捨てたりしない。件数より大きい値は今までどおり全件を返す（SPEC-EGOV-GET-LAW-REVISIONS-009）。

例: `law_name: "消法", latest: 0` は `code: "INVALID_ARGUMENT"`、`detail.issues` は `[{ path: "latest", message: "1 以上で指定してください" }]` で、e-Gov への問い合わせは 0 回（v0.15.4 では全件を返していた）。`latest: -1` も同じ。`latest: 2.5` は `[{ path: "latest", message: "整数で指定してください" }]`。`latest: 10` は検査を通り、改正履歴が 3 件なら 3 件を返す。

### SPEC-EGOV-GET-LAW-REVISIONS-013 law_name が空文字・空白だけのときは略称辞書と e-Gov に問い合わせずに `INVALID_ARGUMENT` を返す

空文字は inputSchema の `minLength: 1` の検査（SPEC-EGOV-COMMON-ERRORS-025）で止まり、`INVALID_ARGUMENT`（`tool: "get_law_revisions"`、`detail.issues: [{ path: "law_name", message: "空文字は指定できません" }]`）を返す。空白（半角スペース・全角スペース・タブ・改行）だけのときは、ツールの処理が略称辞書と e-Gov に問い合わせる前に、SPEC-EGOV-COMMON-ERRORS-026 の形の `INVALID_ARGUMENT`（`tool: "get_law_revisions"`、`error: "law_name が空です"`、`detail.issues: [{ path: "law_name", message: "空白だけは指定できません" }]`、`hint` に法令名か略称を渡すよう書く）を返す。

例: `law_name: ""` は `code: "INVALID_ARGUMENT"`・`detail.issues[0].message: "空文字は指定できません"`。`law_name: "　"`（全角スペース）と `law_name: " \n"` は `code: "INVALID_ARGUMENT"`・`error: "law_name が空です"`。どれも略称辞書と e-Gov への問い合わせは 0 回。
