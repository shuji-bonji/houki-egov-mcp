# 差分: explain_law_type（20261001-t1-argument-guards）

`specs/current/explain_law_type/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-EXPLAIN-LAW-TYPE-019 name が空文字・空白だけのときは収録している種別の表と照合せずに `INVALID_ARGUMENT` を返す

空文字は inputSchema の `minLength: 1` の検査（SPEC-EGOV-COMMON-ERRORS-025）で止まり、`INVALID_ARGUMENT`（`tool: "explain_law_type"`、`detail.issues: [{ path: "name", message: "空文字は指定できません" }]`）を返す。空白（半角スペース・全角スペース・タブ・改行）だけのときは、ツールの処理が収録している種別の表と照合する前に、SPEC-EGOV-COMMON-ERRORS-026 の形の `INVALID_ARGUMENT`（`tool: "explain_law_type"`、`error: "name が空です"`、`detail.issues: [{ path: "name", message: "空白だけは指定できません" }]`、`hint` に法令種別の名前・別名・法令種別コードを渡すよう書く）を返す。

例: `name: ""` は `code: "INVALID_ARGUMENT"`・`detail.issues[0].message: "空文字は指定できません"`。`name: "　"`（全角スペース）と `name: " \n"` は `code: "INVALID_ARGUMENT"`・`error: "name が空です"`。どれも収録している種別の表とは照合しない。

空白だけの `name` は、SPEC-EGOV-EXPLAIN-LAW-TYPE-004 の「前後の空白を除いてから照合する」の対象ではなく、照合の前に止まる。`found: false` の応答（SPEC-EGOV-EXPLAIN-LAW-TYPE-005）ではない。
