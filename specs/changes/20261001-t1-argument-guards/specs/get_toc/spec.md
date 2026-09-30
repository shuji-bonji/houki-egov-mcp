# 差分: get_toc（20261001-t1-argument-guards）

`specs/current/get_toc/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- `REMOVED` の見出しは、current から外す。テストは取り込みと同じコミットで消す
- 「入力」の表の `depth` の行を「本則の構造階層（編・章・節・款・目）を上から何階層まで返すか。1 以上の整数（SPEC-EGOV-GET-TOC-023）。省くと全階層」、`at` の行を「時点指定（`YYYY-MM-DD`。SPEC-EGOV-GET-TOC-024）」にする
- 「処理の流れ」の図に 022 への言及があれば 023 に置き換える

## ADDED

### SPEC-EGOV-GET-TOC-023 `depth` は 1 以上の整数で、0・負の数・小数は `INVALID_ARGUMENT` にして法令を取らない

tools/list の inputSchema の `depth` は `type: "integer"`、`minimum: 1` を持ち、`maximum` を持たない（SPEC-EGOV-COMMON-ERRORS-023）。0・負の数・小数・数値でない値を渡すと、inputSchema の検査で `INVALID_ARGUMENT`（`tool: "get_toc"`、`detail.issues[0].path: "depth"`）を返し、e-Gov に問い合わせない。全階層に読み替えたり切り捨てたりしない。構造階層の深さより大きい値は今までどおり条まで返す（SPEC-EGOV-GET-TOC-010）。

例: `law_name: "民法", depth: 0` は `code: "INVALID_ARGUMENT"`、`detail.issues` は `[{ path: "depth", message: "1 以上で指定してください" }]` で、e-Gov への問い合わせは 0 回（v0.15.4 では全階層を返していた）。`depth: -1` も同じ。`depth: 1.5` は `[{ path: "depth", message: "整数で指定してください" }]`。`depth: 99` は検査を通り、条まで返して `truncated: false`。

### SPEC-EGOV-GET-TOC-024 `at` は `YYYY-MM-DD` の形だけを受け付け、形に合わない値と暦に無い日付は `INVALID_ARGUMENT`

`at` は SPEC-EGOV-COMMON-ERRORS-024 に従う。形に合わない値は inputSchema の検査で `INVALID_ARGUMENT`（`tool: "get_toc"`、`detail.issues: [{ path: "at", message: "YYYY-MM-DD の形で指定してください" }]`）、暦に無い日付はツールの処理で `INVALID_ARGUMENT`（`detail.issues: [{ path: "at", message: "暦に無い日付です" }]`）になり、どちらも e-Gov に問い合わせない。

例: `law_name: "民法", at: "2024/04/01"` は `code: "INVALID_ARGUMENT"`・`detail.issues[0].path: "at"`。`at: "2026-02-30"` は `detail.issues[0].message: "暦に無い日付です"`。どちらも e-Gov への問い合わせは 0 回。`at: "2024-04-01"` は SPEC-EGOV-GET-TOC-018 のとおり。

### SPEC-EGOV-GET-TOC-025 law_name が空文字・空白だけのときは e-Gov に問い合わせずに `INVALID_ARGUMENT` を返す

空文字は inputSchema の検査（SPEC-EGOV-COMMON-ERRORS-025）、空白だけはツールの処理（SPEC-EGOV-COMMON-ERRORS-026。`error: "law_name が空です"`）で、どちらも `INVALID_ARGUMENT`（`tool: "get_toc"`、`detail.issues[0].path: "law_name"`）を返し、略称辞書と e-Gov に問い合わせない。

例: `law_name: ""` は `detail.issues[0].message: "空文字は指定できません"`、`law_name: "  "` は `error: "law_name が空です"`。どちらも `code: "INVALID_ARGUMENT"` で e-Gov への問い合わせは 0 回。

## REMOVED

### SPEC-EGOV-GET-TOC-022 `depth` に 0 以下を渡すと全階層を返す
