# 差分: get_law（20261003-law-resolution）

`specs/current/get_law/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「入力」の表の `at` の行の後に、`suppl_index` の行「任意。附則の番号。1 以上の整数（SPEC-EGOV-GET-LAW-043）。`get_toc` の `suppl_provisions[].index`、`get_law_range` の `suppl_index` と同じ番号。渡すと `article` をその附則の中で探す」を足す。`article` の行の末尾に「。`suppl_index` を渡さないときは本則の中だけを探す（SPEC-EGOV-GET-LAW-042）」を足す
- 「処理の流れ」の図の `C -- "できない" --> E2["エラーを返す（003）"]` を `C -- "できない（完全一致が無いときを含む）" --> E2["エラーを返す（003・026・041）"]` にし、`H{"その条があるか（008）"}` を `H{"その条が本則にあるか。suppl_index があればその附則にあるか（008・042・043）"}` にする
- 「できないこと」の「附則の中の条を指定して取ること、目次に附則の中の条を載せること（…）」を「目次に附則の中の条を載せること（目次の附則は見出しだけ。附則の条まで見るのは `get_toc` の `suppl: "full"`）」にする（附則の中の条は SPEC-EGOV-GET-LAW-043 で取れる）
- 「未決」の 12（→ #45）と 15（→ #51）の行を消す

## MODIFIED

### SPEC-EGOV-GET-LAW-008 条番号で、本則の条を取り出す（枝番号の条を含む）

`article` で指定した条を、法令本文の本則（`MainProvision`）の中から取り出して返す。枝番号の条（`"30の2"`）も取り出せる。`suppl_index` を渡さないときは附則の中を探さない（SPEC-EGOV-GET-LAW-042）。附則の中の条は `suppl_index` で附則を指して取る（SPEC-EGOV-GET-LAW-043）。

例: `{ law_name: "消費税法", article: "30" }` は本則の第30条を返す。

### SPEC-EGOV-GET-LAW-031 law_id を決めた後に e-Gov が 404・時点の 400・そのほかの 4xx を返したときのエラー

法令本文の取得で e-Gov が 429 以外の 4xx を返したときは、SPEC-EGOV-COMMON-ERRORS-033 の表のとおりに返す。

| e-Gov の応答                    | 返すもの                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 404・`404004`                   | `LAW_NOT_FOUND`（`retryable: false`）。`error`・`hint`・`next_actions` は 033 の文                                               |
| 400・`400044`（`at` を渡したとき） | `INVALID_ARGUMENT`（`tool: "get_law"`、`detail.issues: [{ path: "at", message: "e-Gov が受け付ける時点の範囲の外です" }]`）    |
| そのほかの 4xx                  | `SOURCE_API_ERROR`、`retryable: false`、`detail.status` にその状態番号（今までどおり）                                           |

例: 法令本文の取得が 404・`{"code":"404004"}` になる状態で `{ law_name: "消費税法", article: "30" }` を呼ぶと、`code: "LAW_NOT_FOUND"`、`retryable: false`、`error: "e-Gov に law_id 363AC0000000108 の法令がありません"`、`detail.cause: "404004"`（v0.17.0 では `SOURCE_API_ERROR`・`detail.status: 404`）。`{ law_name: "所得税法", article: "9", at: "2000-01-01" }` は、2026-10-03 の e-Gov が 400・`400044` を返すので `code: "INVALID_ARGUMENT"`、`detail.issues[0].path: "at"`。403 は `SOURCE_API_ERROR`・`retryable: false`・`detail.status: 403` のまま。

## ADDED

### SPEC-EGOV-GET-LAW-041 法令名が完全一致しないときは、条文を返さず候補を付けた `LAW_NOT_FOUND` を返す

`law_name` の法令は SPEC-EGOV-COMMON-ERRORS-032 の規則で決める。略称辞書に law_id が無く、e-Gov の法令名検索の全件の中に題名の完全一致が無いときは、検索結果の先頭の法令の条文を返さず、032 の形の `LAW_NOT_FOUND`（`retryable: false`）を返す。`next_actions` の候補の要素は `action: "get_law"`、`example` は渡した引数（`article`・`paragraph`・`item`・`format`・`at` のうち渡したもの）の `law_name` だけを候補の題名に替えたもの。`at` を渡したときは、法令名の検索にも `asof=<at>` を付ける。

例: `{ law_name: "所得税法施行", article: "1" }` は `code: "LAW_NOT_FOUND"`、`error: "完全一致する法令名がありません: 所得税法施行（部分一致 2 件）"`、`next_actions` は `[{ action: "get_law", example: { law_name: "所得税法施行令", article: "1" } }, { action: "get_law", example: { law_name: "所得税法施行規則", article: "1" } }, { action: "search_law", example: { keyword: "所得税法施行" } }]`（2026-10-03 10:10 JST に houki-egov-dev 0.17.0 で同じ引数を呼ぶと、所得税法施行令 第1条の `json` を `meta.title: "所得税法施行令"` で返した）。`{ law_name: "保険法", article: "1" }` は、`/laws?law_title=保険法` の 114 件の中の完全一致 `保険法`（`420AC0000000056`）の第1条を返す（v0.17.0 では健康保険法）。

### SPEC-EGOV-GET-LAW-042 `suppl_index` を渡さないときは本則の中だけで条を探し、附則にだけある条番号は `ARTICLE_NOT_FOUND` にして附則の番号を案内する

`suppl_index` を渡さないときは、`article` の条を本則（`MainProvision`）の中だけで探す。本則に無ければ、附則に同じ番号の条があっても、その条を返さず `ARTICLE_NOT_FOUND` を返す。このとき、同じ番号の条を持つ附則があれば次を付ける。

- `hint`: `本則に第<条>条はありません。附則に同じ番号の条があります: 附則(<n1>) <改正法の法令番号、または 制定時>、…。附則の条は suppl_index で附則を指して取ります`
- `next_actions`: その附則ごとに（先頭の 5 件まで、附則の出現順）`{ action: "get_law", reason: "附則(<n>) <改正法の法令番号、または 制定時> の第<条>条を取れます", example: <渡した引数に suppl_index: <n> を足したもの> }`

附則にも無いときは、今までどおりの `ARTICLE_NOT_FOUND`（SPEC-EGOV-GET-LAW-009）。

例（2026-10-03 10:11 JST に e-Gov の消費税法 `363AC0000000108` で確かめた。本則に第100条は無く、附則(27)（平成八年六月一四日法律第八二号）と附則(168)（令和八年三月三一日法律第一二号）に第100条がある）: `{ law_name: "消費税法", article: "100" }` は `code: "ARTICLE_NOT_FOUND"`、`hint` に `附則(27) 平成八年六月一四日法律第八二号` と `附則(168) 令和八年三月三一日法律第一二号` を含み、`next_actions` は `[{ action: "get_law", example: { law_name: "消費税法", article: "100", suppl_index: 27 } }, { action: "get_law", example: { law_name: "消費税法", article: "100", suppl_index: 168 } }]`（`reason` 付き）。v0.17.0 では附則(27)の第100条「（消費税法の一部改正に伴う経過措置）」を、見出し `# 消費税法 第100条` で本則の条と同じ形で返していた。

### SPEC-EGOV-GET-LAW-043 `suppl_index` で附則を指すと、その附則の中の条・項・号を返す

tools/list の inputSchema の `suppl_index` は `type: "integer"`、`minimum: 1` を持つ（SPEC-EGOV-COMMON-ERRORS-023。0・負の数・小数は `INVALID_ARGUMENT`）。番号は法令の附則を出現順に数えたもので、`get_toc` の `suppl_provisions[].index` と `get_law_range` の `suppl_index` と同じ。

- `article` と一緒に渡すと、その番号の附則の中だけで `article` の条を探す。`paragraph`・`item` の扱いは本則の条と同じ（SPEC-EGOV-GET-LAW-010〜012）
- markdown の 1 行目は `# <法令名> 附則(<n>) 第<条>条`（項・号まで指せば `第<条>条第<項>項第<号>号` を続ける）。2 行目に `附則(<n>) <改正法の法令番号、または 制定時><抄なら（抄）>`（SPEC-EGOV-GET-LAW-RANGE-012 の `range.titles` と同じ文）を置き、条見出しはその次の行
- json の `data` に `suppl_index: <n>` を入れる。`suppl_index` を渡さないときの `data.suppl_index` は `null`（キーは常に置く）
- その番号の附則が無い（附則の本数より大きい）ときは `RANGE_NOT_FOUND`。`hint` に `附則は <本数> 本` を書く（SPEC-EGOV-GET-LAW-RANGE-014 と同じ文）
- その附則にその条が無いときは `ARTICLE_NOT_FOUND`（`error: "条文が見つかりません: 附則(<n>) 第<条>条"`）。その附則が条を立てず項だけで書かれているときは、`hint` に `この附則は条を立てず項だけで書かれています`、`next_actions` に `{ action: "get_law_range", example: { law_name, suppl_index: <n> } }` を入れる
- `article` を渡さず `suppl_index` だけを渡したとき（`format` が `toc` のときを除く）は、`INVALID_ARGUMENT`（`error: "suppl_index を渡すときは article も渡してください"`、`next_actions` に `{ action: "get_law_range", example: { law_name, suppl_index: <n> } }`。附則 1 本をまとめて取るのは `get_law_range`）
- `format` が `toc` のときは、`article` と同じく `suppl_index` も使わない（SPEC-EGOV-GET-LAW-033）

例: `{ law_name: "消費税法", article: "100", suppl_index: 27 }` の `markdown` は `# 消費税法 附則(27) 第100条` で始まり、2 行目は `附則(27) 平成八年六月一四日法律第八二号（抄）`、3 行目は `（消費税法の一部改正に伴う経過措置）`。`{ law_name: "消費税法", article: "100", suppl_index: 27, format: "json" }` の `data.suppl_index` は `27`、`{ law_name: "消費税法", article: "30", format: "json" }` の `data.suppl_index` は `null`。`{ law_name: "消費税法", article: "100", suppl_index: 999 }` は `RANGE_NOT_FOUND`、`hint` に `附則は 168 本`（2026-10-03 の本数）。`{ law_name: "消費税法", suppl_index: 27 }` は `INVALID_ARGUMENT`。
