# 差分: search_fulltext（20261001-t1-argument-guards）

`specs/current/search_fulltext/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- `REMOVED` の見出しは、current から外す。テストは取り込みと同じコミットで消す
- 「入力」の表の `limit` の行を「返す件数。既定 10。1 以上 30 以下の整数（SPEC-EGOV-SEARCH-FULLTEXT-033）」にする
- 「処理の流れ」の図に 025・026 への言及があれば 033 に置き換える

## MODIFIED

### SPEC-EGOV-SEARCH-FULLTEXT-005 空白で区切った語は AND で探し、記号と 1 文字の語は捨てる

`keyword` を空白で語に分け、すべての語を含む条を探す（AND）。`"` `*` `:` `(` `)` と改行・タブは空白として扱う。1 文字の語は捨てる。語が残らないとき（1 文字だけ・記号だけ）はエラーにせず、`hits` を空で返す。空文字と空白だけの `keyword` は語を分ける前に `INVALID_ARGUMENT` になる（SPEC-EGOV-SEARCH-FULLTEXT-034）。

例: `税`、`"*:()` はどちらも `hits: []`。

### SPEC-EGOV-SEARCH-FULLTEXT-029 search_law に切り替えたとき、law_type と limit を切り替え先に渡す

SPEC-EGOV-SEARCH-FULLTEXT-028 で e-Gov の法令検索（`/laws`）を引くときは、`law_title` に検索する法令名（略称なら正式名称）、`law_type` に渡した `law_type`（渡さなければ付けない）、`limit` に渡した `limit`（省いたときは SPEC-EGOV-SEARCH-FULLTEXT-024 の 10）を付ける。`limit` は inputSchema の検査を通った 1 以上 30 以下の整数なので、丸めは起きない（SPEC-EGOV-SEARCH-FULLTEXT-033）。

例: `{ keyword: "消法", law_type: "Act", limit: 3 }` では e-Gov の `/laws` を `law_title=消費税法`・`law_type=Act`・`limit=3` で引く。`{ keyword: "所得税", limit: 30 }` では `law_title=所得税法`・`limit=30` で引き、`law_type` は付けない。`{ keyword: "所得税2" }` では `law_title=所得税2`・`limit=10`。

## ADDED

### SPEC-EGOV-SEARCH-FULLTEXT-033 `limit` は 1 以上 30 以下の整数で、範囲の外は `INVALID_ARGUMENT` にして丸めない

tools/list の inputSchema の `limit` は `type: "integer"`、`minimum: 1`、`maximum: 30` を持つ（SPEC-EGOV-COMMON-ERRORS-023）。0・負の数・小数・31 以上・数値でない値を渡すと、inputSchema の検査で `INVALID_ARGUMENT`（`tool: "search_fulltext"`、`detail.issues[0].path: "limit"`）を返し、ローカル DB も e-Gov も引かない。1 件や 30 件に丸めない（v0.15.4 の SPEC-EGOV-SEARCH-FULLTEXT-025・026 をやめる）。

例: `{ keyword: "適格請求書", limit: 0 }` は `code: "INVALID_ARGUMENT"`、`detail.issues` は `[{ path: "limit", message: "1 以上で指定してください" }]`（v0.15.4 では 1 件返していた）。`limit: 31` と `limit: 100` は `[{ path: "limit", message: "30 以下で指定してください" }]`（v0.15.4 では 30 件）。`limit: 2.5` は `整数で指定してください`。`limit: 30` は検査を通り、最大 30 件を返す。DB の有無によらず同じ。

### SPEC-EGOV-SEARCH-FULLTEXT-034 keyword が空文字・空白だけのときは DB も e-Gov も引かずに `INVALID_ARGUMENT` を返す

空文字は inputSchema の検査（SPEC-EGOV-COMMON-ERRORS-025）、空白（半角スペース・全角スペース・タブ・改行）だけはツールの処理（SPEC-EGOV-COMMON-ERRORS-026。`error: "keyword が空です"`、`hint` に探したい語や法令名を渡すよう書く）で、どちらも `INVALID_ARGUMENT`（`tool: "search_fulltext"`、`detail.issues[0].path: "keyword"`）を返す。ローカル DB の有無によらず同じで、DB が無いときの `search_law` への切り替え（SPEC-EGOV-SEARCH-FULLTEXT-028）にも進まない。

例: `keyword: ""` は `detail.issues[0].message: "空文字は指定できません"`。`keyword: "　　"` と `keyword: " \t"` は `error: "keyword が空です"`。どれも `code: "INVALID_ARGUMENT"` で、DB の照会と e-Gov への問い合わせは 0 回（v0.15.4 では DB があれば `hits: []`、無ければ切り替え先の `search_law` が `INVALID_ARGUMENT` を返していた）。

## REMOVED

### SPEC-EGOV-SEARCH-FULLTEXT-025 limit が 1 未満なら 1 件にする

### SPEC-EGOV-SEARCH-FULLTEXT-026 limit が 30 を超えると 30 件にする
