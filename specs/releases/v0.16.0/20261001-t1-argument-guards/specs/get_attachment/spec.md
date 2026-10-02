# 差分: get_attachment（20261001-t1-argument-guards）

`specs/current/get_attachment/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「入力」の表の `at` の行を「時点。`YYYY-MM-DD` 形式（SPEC-EGOV-GET-ATTACHMENT-024）。`list_attachments` と同じ時点を渡す」、`src` の行の末尾に「空文字・空白だけは省いたときと同じ（SPEC-EGOV-GET-ATTACHMENT-025）」を足す

## ADDED

### SPEC-EGOV-GET-ATTACHMENT-023 law_name が空文字・空白だけのときは略称辞書と e-Gov に問い合わせずに `INVALID_ARGUMENT` を返す

空文字は inputSchema の `minLength: 1` の検査（SPEC-EGOV-COMMON-ERRORS-025）で止まり、`INVALID_ARGUMENT`（`tool: "get_attachment"`、`detail.issues: [{ path: "law_name", message: "空文字は指定できません" }]`）を返す。空白（半角スペース・全角スペース・タブ・改行）だけのときは、ツールの処理が略称辞書と e-Gov に問い合わせる前に、SPEC-EGOV-COMMON-ERRORS-026 の形の `INVALID_ARGUMENT`（`tool: "get_attachment"`、`error: "law_name が空です"`、`detail.issues: [{ path: "law_name", message: "空白だけは指定できません" }]`、`hint` に法令名か略称を渡すよう書く）を返す。

例: `law_name: ""` は `code: "INVALID_ARGUMENT"`・`detail.issues[0].message: "空文字は指定できません"`。`law_name: "　"`（全角スペース）と `law_name: " \n"` は `code: "INVALID_ARGUMENT"`・`error: "law_name が空です"`。どれも略称辞書と e-Gov への問い合わせは 0 回。

### SPEC-EGOV-GET-ATTACHMENT-024 `at` は `YYYY-MM-DD` の形だけを受け付け、形に合わない値と暦に無い日付は `INVALID_ARGUMENT`

`at` は SPEC-EGOV-COMMON-ERRORS-024 に従う。tools/list の inputSchema の `at` は `pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"` を持ち、形に合わない値は inputSchema の検査で `INVALID_ARGUMENT`（`tool: "get_attachment"`、`detail.issues: [{ path: "at", message: "YYYY-MM-DD の形で指定してください" }]`）になる。形は合うが暦に無い日付は、ツールの処理が e-Gov に問い合わせる前に `INVALID_ARGUMENT`（`detail.issues: [{ path: "at", message: "暦に無い日付です" }]`）を返す。

例: `law_name: "戸籍法施行規則", src: "H11HO127-001.jpg", at: "2024/04/01"` は `code: "INVALID_ARGUMENT"`・`detail.issues[0].path: "at"` で、e-Gov への問い合わせは 0 回。`at: "20240401"`・`at: "2024-4-1"` も同じ。`at: "2026-02-30"` は `detail.issues[0].message: "暦に無い日付です"` で、e-Gov への問い合わせは 0 回。`at: "2024-04-01"` は SPEC-EGOV-GET-ATTACHMENT-014 のとおり。

### SPEC-EGOV-GET-ATTACHMENT-025 `src` が空文字・空白だけのときは `src` を省いたときと同じに扱う

任意の `src` が空文字、または空白（半角スペース・全角スペース・タブ・改行）だけのときは、`src` を渡さなかったときと同じく、その法令履歴の添付ファイル全部の zip を対象にする（`save` が `false` なら zip の URL とメタ情報、`true` なら zip の保存）。`ATTACHMENT_NOT_FOUND` にはしない。前後に空白の付いた `src`（`" H11HO127-001.jpg "`）は、空白を除いた名前で一覧と突き合わせる。

例: `law_name: "戸籍法施行規則", src: ""` と `src: "   "` は、どちらも `src` を省いたときと同じ zip の応答（v0.15.4 では空白だけは `ATTACHMENT_NOT_FOUND` だった）。
