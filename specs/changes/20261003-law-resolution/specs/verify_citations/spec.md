# 差分: verify_citations（20261003-law-resolution）

`specs/current/verify_citations/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「入力」の `citations` の要素の表の `item` の行の後に、`suppl_index` の行「任意。附則の番号。1 以上の整数（SPEC-EGOV-VERIFY-CITATIONS-047）。`get_toc` の `suppl_provisions[].index` と同じ番号。渡すと `article` をその附則の中で確かめる。省くと本則の中だけで確かめる（SPEC-EGOV-VERIFY-CITATIONS-046）」を足す
- 「処理の流れ」の図の `L5{"e-Gov の法令名と完全一致するか"}` を `L5{"e-Gov の法令名の検索の全件に完全一致があるか。at があれば asof を付けて検索（045）"}` に、`L2 -- 無い --> NF1[…（015）]` を `L2 -- "404" --> NF1[…（015）]` にして `L2 -- "時点の 400" --> E4["ツール全体が INVALID_ARGUMENT（048）"]` を足す。`R2{"その条があるか"}` を `R2{"その条が本則にあるか。suppl_index があればその附則にあるか（046・047）"}` にする
- 「未決」の「判断が要る項目」の 1（→ #51）、2（→ #87）、5（→ #45）の行を消す。「判断が要る項目」の見出しの下が空になるので、見出しも消す

## MODIFIED

### SPEC-EGOV-VERIFY-CITATIONS-005 found の件に付くもの

`status` が `found` の件は次を持つ。`next_actions` は付かない。条文本文は返さない。

| フィールド    | 内容                                                                                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `law`         | `law_id`・`title`（正式名称）・`law_num`（法令番号）・`law_type`・`url`                                                                                                                                                    |
| `resolved_by` | 法令をどう引いたか。`law_id` / `abbreviation` / `exact_title`                                                                                                                                                              |
| `article`     | `num`（e-Gov の形の条番号。例: `"57_2"`）・`label`（例: `"第57条の2"`。附則の条は `"附則(27) 第100条"`）・`caption`（条見出し。例: `"（給与所得者の特定支出の控除の特例）"`）・`suppl_index`（附則の条なら附則の番号、本則の条なら `null`） |
| `paragraph`   | 実在を確かめた項番号（項を確かめたときだけ）                                                                                                                                                                               |
| `item`        | 実在を確かめた号番号（e-Gov の形。例: `"1"`。号を確かめたときだけ）                                                                                                                                                        |

例: `{ law_name: "所得税法", article: "57の2", paragraph: 2, item: 1, label: "所法57の2②一" }` は、`law.law_id: "340AC0000000033"`、`law.law_num: "昭和四十年法律第三十三号"`、`article.num: "57_2"`、`article.suppl_index: null`、`paragraph: 2`、`item: "1"` の `found` になり、`input.label` は `"所法57の2②一"` のまま返る。

### SPEC-EGOV-VERIFY-CITATIONS-015 e-Gov が「その法令が無い」と答えた件は LAW_NOT_FOUND にする

`law_id` を書いた件と、法令名で law_id を決めた件で、法令本文の取得に e-Gov が 404・`404004` を返したときは、ツール全体をエラーにせず、その件を `status: "not_found"`、`code: "LAW_NOT_FOUND"` にする。`reason` は、`at` を渡したときは `<law_id、または決めた法令名> は <at> の時点の e-Gov に収録されていません`、渡さないときは `e-Gov に law_id <law_id> の法令がありません`。`next_actions` は SPEC-EGOV-VERIFY-CITATIONS-027 の `search_law` の 1 件で、`at` を渡し法令名が分かっている件では、その前に `{ action: "get_law_revisions", example: { law_name: <law_name> } }` を置く。

400 は「その法令が無い」ではないので、この件の `LAW_NOT_FOUND` にしない（`400044` は SPEC-EGOV-VERIFY-CITATIONS-048 のツール全体の `INVALID_ARGUMENT`、そのほかの 400 はツール全体の `SOURCE_API_ERROR`）。

例（2026-10-03 10:12 JST に houki-egov-dev 0.17.0 と e-Gov で確かめた）: `{ citations: [{ law_id: "503AC0000000035", article: "1" }], at: "2018-01-01" }` は、e-Gov が `/law_data/503AC0000000035?asof=2018-01-01` に 404・`404004` を返すので、その件が `code: "LAW_NOT_FOUND"`、`reason: "503AC0000000035 は 2018-01-01 の時点の e-Gov に収録されていません"`（v0.17.0 では `reason: "e-Gov に law_id 503AC0000000035 の法令がありません"`）。`{ law_id: "999AC0000000999", article: "1" }`（`at` なし）は `reason: "e-Gov に law_id 999AC0000000999 の法令がありません"`。

## ADDED

### SPEC-EGOV-VERIFY-CITATIONS-045 法令名の完全一致は、部分一致の上位 50 件ではなく全件から探し、`at` を渡したときは法令名の検索にも使う

略称辞書に law_id が無い法令名の件（SPEC-EGOV-VERIFY-CITATIONS-039）は、SPEC-EGOV-COMMON-ERRORS-032 の 2・3 のとおり、e-Gov の法令名検索の全件（`total_count` の件数）の中から題名の完全一致を探す。`at` を渡したときは、その検索に `asof=<at>` を付け、その時点の題名で照合する。完全一致が無く部分一致があるときは、今までどおり件ごとの `ambiguous`（SPEC-EGOV-VERIFY-CITATIONS-013・030。候補は先頭 5 件、`reason` の件数は `total_count`）で、ツール全体のエラーにはしない。

例: `{ law_name: "保険法", article: "1" }`（辞書に無い）は、`/laws?law_title=保険法` の 114 件（2026-10-03 10:10 JST）の 78 件目の完全一致 `保険法`（`420AC0000000056`）で照合し、`resolved_by: "exact_title"` の `found` になる。v0.17.0 では上位 50 件の中に無いため、`reason: "「保険法」に完全一致する法令名が e-Gov に無く、部分一致が 50 件ありました"`、`candidates` の先頭が健康保険法の `ambiguous` だった（2026-10-03 10:10 JST に houki-egov-dev 0.17.0 で確かめた。件数も 114 ではなく 50 と書いていた）。

### SPEC-EGOV-VERIFY-CITATIONS-046 `suppl_index` の無い件は本則の中だけで条を確かめ、附則にだけある条番号は ARTICLE_NOT_FOUND にする

`suppl_index` を書かない件は、`article` の条を本則（`MainProvision`）の中だけで確かめる。本則に無ければ、附則に同じ番号の条があっても `found` にせず、`status: "not_found"`、`code: "ARTICLE_NOT_FOUND"` にする。同じ番号の条を持つ附則があるときは、`reason` を `<法令名>の本則に第<条>条はありません。附則に同じ番号の条があります: 附則(<n1>) <改正法の法令番号、または 制定時>、…` にし、`next_actions` を SPEC-EGOV-VERIFY-CITATIONS-025 の `get_toc` の前に、附則ごと（先頭の 5 件まで）の `{ action: "get_law", example: { law_name: <引用の law_name。無ければ法令の正式名称>, article: <渡した article>, suppl_index: <n> } }` にする。

例: `{ law_name: "消費税法", article: "100" }` は `code: "ARTICLE_NOT_FOUND"`、`reason` に `附則(27) 平成八年六月一四日法律第八二号` と `附則(168) 令和八年三月三一日法律第一二号` を含む（2026-10-03 の消費税法）。v0.17.0 では `article: { num: "100", label: "第100条", caption: "（消費税法の一部改正に伴う経過措置）" }` の `found` だった（2026-10-03 10:11 JST に houki-egov-dev 0.17.0 で確かめた）。

### SPEC-EGOV-VERIFY-CITATIONS-047 `suppl_index` を書いた件は、その附則の中で条・項・号を確かめる

`citations.items.properties.suppl_index` は inputSchema に `type: "integer"`、`minimum: 1` を持つ（SPEC-EGOV-COMMON-ERRORS-023。0・負の数・小数はツール全体の `INVALID_ARGUMENT`、`detail.issues[].path` は `citations.<添字>.suppl_index`）。`suppl_index` を書いた件は、その番号の附則の中だけで `article` の条を確かめ、項・号は本則の条と同じに確かめる（SPEC-EGOV-VERIFY-CITATIONS-008〜011・023）。

- `found` の件の `article.label` は `附則(<n>) 第<条>条`、`article.suppl_index` は `<n>`（SPEC-EGOV-VERIFY-CITATIONS-005）
- その番号の附則が無いときは、`status: "not_found"`、`code: "ARTICLE_NOT_FOUND"`、`reason: "<法令名>に附則(<n>)はありません（附則は <本数> 本）"`
- その附則にその条が無いときは、`status: "not_found"`、`code: "ARTICLE_NOT_FOUND"`、`reason: "<法令名>の附則(<n>)に第<条>条はありません"`

例: `{ law_name: "消費税法", article: "100", suppl_index: 27 }` は `article: { num: "100", label: "附則(27) 第100条", caption: "（消費税法の一部改正に伴う経過措置）", suppl_index: 27 }` の `found`。`{ law_name: "消費税法", article: "100", suppl_index: 999 }` は `reason: "消費税法に附則(999)はありません（附則は 168 本）"` の `not_found`（本数は 2026-10-03 の値）。

### SPEC-EGOV-VERIFY-CITATIONS-048 e-Gov が時点を受け付けないと答えたときはツール全体を `INVALID_ARGUMENT` にし、そのほかの 400 はツール全体を `SOURCE_API_ERROR` にする

法令本文の取得か法令名の検索に e-Gov が 400・`400044` を返したときは、`at` が全件に共通なので、件ごとの判定（`results`）を返さず、ツール全体のエラー `INVALID_ARGUMENT`（`tool: "verify_citations"`、`detail.issues: [{ path: "at", message: "e-Gov が受け付ける時点の範囲の外です" }]`、`hint` に e-Gov の `message`。SPEC-EGOV-COMMON-ERRORS-033）を返す。`400044` 以外の 400 は、ツール全体のエラー `SOURCE_API_ERROR`（`retryable: false`、`detail.status: 400`）を返す。どちらも、件を `LAW_NOT_FOUND` にしない。

例（2026-10-03 10:12 JST に houki-egov-dev 0.17.0 で確かめた）: `{ citations: [{ law_name: "所得税法", article: "9" }], at: "2000-01-01" }` は `code: "INVALID_ARGUMENT"`、`detail.issues[0].path: "at"` で、`results` を持たない。v0.17.0 では、その件が `code: "LAW_NOT_FOUND"`、`reason: "e-Gov に law_id 340AC0000000033 の法令がありません"` の `not_found` で、所得税法が e-Gov に無いと読める応答だった。
