# 差分: get_article_references（20261001-t1-argument-guards）

`specs/current/get_article_references/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「入力」の表の `paragraph` の行を「項番号。1 以上の整数（SPEC-EGOV-GET-ARTICLE-REFERENCES-040）。指定するとその項の本文だけを対象にする。省略すると条全体」、`at` の行を「時点指定。`YYYY-MM-DD`（SPEC-EGOV-GET-ARTICLE-REFERENCES-041。`get_law` と同じ）」にする

## ADDED

### SPEC-EGOV-GET-ARTICLE-REFERENCES-039 law_name・article が空文字・空白だけのときは e-Gov に問い合わせずに `INVALID_ARGUMENT` を返す

`law_name` と `article` は必須の文字列で、空文字は inputSchema の `minLength: 1` の検査（SPEC-EGOV-COMMON-ERRORS-025）で止まり、`INVALID_ARGUMENT`（`tool: "get_article_references"`、`detail.issues[0].path` はその引数名、`message: "空文字は指定できません"`）を返す。空白（半角スペース・全角スペース・タブ・改行）だけのときは、ツールの処理が略称辞書と e-Gov に問い合わせる前に、SPEC-EGOV-COMMON-ERRORS-026 の形の `INVALID_ARGUMENT`（`error: "<引数名> が空です"`、`detail.issues: [{ path: "<引数名>", message: "空白だけは指定できません" }]`）を返す。空白だけの `article` は `INVALID_ARTICLE_NUM` ではない。

例: `law_name: "", article: "57の2"` は `detail.issues` が `[{ path: "law_name", message: "空文字は指定できません" }]`。`law_name: "所得税法", article: ""` は `[{ path: "article", message: "空文字は指定できません" }]`。`law_name: "所得税法", article: "  "` は `error: "article が空です"`。どれも `code: "INVALID_ARGUMENT"` で、e-Gov への問い合わせは 0 回。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-040 `paragraph` は 1 以上の整数で、0・負の数・小数は `INVALID_ARGUMENT` にして法令を取らない

tools/list の inputSchema の `paragraph` は `type: "integer"`、`minimum: 1` を持つ（SPEC-EGOV-COMMON-ERRORS-023）。0・負の数・小数・数値でない値を渡すと、inputSchema の検査で `INVALID_ARGUMENT`（`tool: "get_article_references"`、`detail.issues[0].path: "paragraph"`）を返し、e-Gov に問い合わせない。`ARTICLE_NOT_FOUND` は、法令を取った後で求めた項が無いときだけになる。

例: `law_name: "所得税法", article: "57の2", paragraph: 0` は `code: "INVALID_ARGUMENT"`、`detail.issues` は `[{ path: "paragraph", message: "1 以上で指定してください" }]` で、e-Gov への問い合わせは 0 回（v0.15.4 では法令を取ってから `ARTICLE_NOT_FOUND`）。`paragraph: 1.5` は `整数で指定してください`。`paragraph: 1` は SPEC-EGOV-GET-ARTICLE-REFERENCES-014 のとおり。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-041 `at` は `YYYY-MM-DD` の形だけを受け付け、形に合わない値と暦に無い日付は `INVALID_ARGUMENT`

`at` は SPEC-EGOV-COMMON-ERRORS-024 に従う。tools/list の inputSchema の `at` は `pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"` を持ち、形に合わない値は inputSchema の検査で `INVALID_ARGUMENT`（`tool: "get_article_references"`、`detail.issues: [{ path: "at", message: "YYYY-MM-DD の形で指定してください" }]`）になる。形は合うが暦に無い日付は、ツールの処理が e-Gov に問い合わせる前に `INVALID_ARGUMENT`（`detail.issues: [{ path: "at", message: "暦に無い日付です" }]`）を返す。

例: `law_name: "所得税法", article: "57の2", at: "2024/04/01"` は `code: "INVALID_ARGUMENT"`・`detail.issues[0].path: "at"` で、e-Gov への問い合わせは 0 回。`at: "20240401"`・`at: "2024-4-1"` も同じ。`at: "2026-02-30"` は `detail.issues[0].message: "暦に無い日付です"` で、e-Gov への問い合わせは 0 回。`at: "2024-04-01"` は SPEC-EGOV-GET-ARTICLE-REFERENCES-034 のとおり。
