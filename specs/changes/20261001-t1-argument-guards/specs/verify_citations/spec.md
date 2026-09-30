# 差分: verify_citations（20261001-t1-argument-guards）

`specs/current/verify_citations/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「入力」の 1 つ目の表の `at` の行を「時点。`YYYY-MM-DD` の形（SPEC-EGOV-VERIFY-CITATIONS-040）。全件に同じ時点を使う」、2 つ目の表の `paragraph` の行を「項番号。1 以上の整数（SPEC-EGOV-VERIFY-CITATIONS-041）。省くと条までを確かめる」、`article` の行に「空文字は不可（042）」を足す

## ADDED

### SPEC-EGOV-VERIFY-CITATIONS-040 `at` は `YYYY-MM-DD` の形だけを受け付け、形に合わない値と暦に無い日付は `INVALID_ARGUMENT`

`at` は SPEC-EGOV-COMMON-ERRORS-024 に従う。tools/list の inputSchema の `at` は `pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"` を持ち、形に合わない値は inputSchema の検査で `INVALID_ARGUMENT`（`tool: "verify_citations"`、`detail.issues: [{ path: "at", message: "YYYY-MM-DD の形で指定してください" }]`）になる。形は合うが暦に無い日付は、ツールの処理が e-Gov に問い合わせる前に `INVALID_ARGUMENT`（`detail.issues: [{ path: "at", message: "暦に無い日付です" }]`）を返す。

例: `citations: [{ law_name: "民法", article: "709" }], at: "2024/04/01"` は `code: "INVALID_ARGUMENT"`・`detail.issues[0].path: "at"` で、e-Gov への問い合わせは 0 回。`at: "20240401"`・`at: "2024-4-1"` も同じ。`at: "2026-02-30"` は `detail.issues[0].message: "暦に無い日付です"` で、e-Gov への問い合わせは 0 回。`at: "2024-04-01"` は SPEC-EGOV-VERIFY-CITATIONS-022 のとおり。

`at` の形の誤りはツール全体のエラーで、`results[]` は返さない。

### SPEC-EGOV-VERIFY-CITATIONS-041 `citations[].paragraph` は 1 以上の整数で、0・負の数・小数はツール全体を `INVALID_ARGUMENT` にして法令を取らない

tools/list の inputSchema の `citations.items.properties.paragraph` は `type: "integer"`、`minimum: 1` を持つ（SPEC-EGOV-COMMON-ERRORS-023）。どれか 1 件の `paragraph` が 0・負の数・小数・数値でない値なら、inputSchema の検査でツール全体の `INVALID_ARGUMENT`（`tool: "verify_citations"`、`detail.issues[].path` は `citations.<添字>.paragraph`）を返し、件ごとの判定はせず e-Gov に問い合わせない。件ごとの `not_found` は、法令を取った後で項が無いときだけになる。

例: `citations: [{ law_name: "民法", article: "709" }, { law_name: "民法", article: "709", paragraph: 0 }]` は `code: "INVALID_ARGUMENT"`、`detail.issues` は `[{ path: "citations.1.paragraph", message: "1 以上で指定してください" }]` で、`results` は無く、e-Gov への問い合わせは 0 回（v0.15.4 では 2 件目が `not_found` になっていた）。`paragraph: 1.5` は `整数で指定してください`。

### SPEC-EGOV-VERIFY-CITATIONS-042 `citations[].article` が空文字・空白だけのときはツール全体を `INVALID_ARGUMENT` にする

`citations.items.properties.article` は inputSchema に `minLength: 1` を持つ（SPEC-EGOV-COMMON-ERRORS-025）。どれか 1 件の `article` が空文字なら、inputSchema の検査でツール全体の `INVALID_ARGUMENT`（`tool: "verify_citations"`、`detail.issues[].path` は `citations.<添字>.article`、`message: "空文字は指定できません"`）を返す。空白だけなら、ツールの処理が e-Gov に問い合わせる前に、SPEC-EGOV-COMMON-ERRORS-026 の形のツール全体の `INVALID_ARGUMENT`（`error: "citations[<添字>].article が空です"`、`detail.issues: [{ path: "citations.<添字>.article", message: "空白だけは指定できません" }]`）を返す。`law_name` / `law_id` の空白だけは SPEC-EGOV-VERIFY-CITATIONS-032 のままである。

例: `citations: [{ law_name: "民法", article: "" }]` は `detail.issues` が `[{ path: "citations.0.article", message: "空文字は指定できません" }]`。`citations: [{ law_name: "民法", article: "709" }, { law_name: "民法", article: " " }]` は `error: "citations[1].article が空です"`、`detail.issues[0].path: "citations.1.article"`。どちらも `code: "INVALID_ARGUMENT"` で `results` は無く、e-Gov への問い合わせは 0 回。
