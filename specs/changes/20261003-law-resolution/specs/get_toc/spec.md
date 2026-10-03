# 差分: get_toc（20261003-law-resolution）

`specs/current/get_toc/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- SPEC-EGOV-GET-TOC-014 の見出しの次に「429 以外の 4xx は SPEC-EGOV-GET-TOC-029。」の 1 文を足す（表は変えない）
- 「未決」の 9（→ #45）の行を消す

## ADDED

### SPEC-EGOV-GET-TOC-028 法令名が完全一致しないときは、目次を返さず候補を付けた `LAW_NOT_FOUND` を返す

`law_name` の法令は SPEC-EGOV-COMMON-ERRORS-032 の規則で決める。略称辞書に law_id が無く、e-Gov の法令名検索の全件の中に題名の完全一致が無いときは、検索結果の先頭の法令の目次を返さず、032 の形の `LAW_NOT_FOUND`（`retryable: false`）を返す。`next_actions` の候補の要素は `action: "get_toc"`、`example` は渡した引数（`depth`・`suppl`・`with_amend_titles`・`at` のうち渡したもの）の `law_name` だけを候補の題名に替えたもの。`at` を渡したときは、法令名の検索にも `asof=<at>` を付ける。

例: `{ law_name: "保険法", depth: 1 }`（辞書に無い）は、`/laws?law_title=保険法` の 114 件（2026-10-03 10:10 JST）の中の完全一致 `保険法`（`420AC0000000056`）の目次を返す（v0.17.0 では、同じ引数に `meta.title: "健康保険法"`・`meta.law_id: "211AC0000000070"` の目次を返した。2026-10-03 10:10 JST に houki-egov-dev 0.17.0 で確かめた）。`{ law_name: "所得税法施行" }` は、候補 `所得税法施行令`・`所得税法施行規則` の `get_toc` と `search_law` を `next_actions` に持つ `LAW_NOT_FOUND`。

### SPEC-EGOV-GET-TOC-029 法令本文の取得で e-Gov が 404・時点の 400 を返したときは `LAW_NOT_FOUND`・`INVALID_ARGUMENT`

法令を決めた後の法令本文の取得で e-Gov が 429 以外の 4xx を返したときは、SPEC-EGOV-COMMON-ERRORS-033 の表のとおりに返す。404・`404004` は `LAW_NOT_FOUND`（`retryable: false`、033 の `error`・`hint`・`next_actions`）、400・`400044` は `INVALID_ARGUMENT`（`tool: "get_toc"`、`detail.issues: [{ path: "at", message: "e-Gov が受け付ける時点の範囲の外です" }]`）、そのほかの 4xx は `SOURCE_API_ERROR`（`retryable: false`、`detail.status`）。

例: `{ law_name: "消費税法", at: "2000-01-01" }` は、2026-10-03 の e-Gov が 400・`400044` を返すので `code: "INVALID_ARGUMENT"`・`tool: "get_toc"`（v0.17.0 では `SOURCE_API_ERROR`・`retryable: false`）。法令本文の取得が 404・`404004` になる状態で `{ law_name: "消費税法" }` を呼ぶと `code: "LAW_NOT_FOUND"`。
