# 差分: get_related_laws（20261003-law-resolution）

`specs/current/get_related_laws/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「処理の流れ」の図の `C -- "いいえ（法律として扱う）" --> D1[…]` を、`C -- いいえ --> C2{"法令の種別（law_type）が Act か（020）"}`、`C2 -- はい --> D1`、`C2 -- いいえ --> N["候補を作らず related・not_found を空にして返す（020）"]`、`N --> J` に置き換える。`B -- いいえ --> E1["LAW_NOT_FOUND を返す（006）"]` の文を `["LAW_NOT_FOUND を返す（006・019）"]` にする
- 「未決」の 6（→ #45）と 7（→ #63）の行を消す

## MODIFIED

### SPEC-EGOV-GET-RELATED-LAWS-004 施行令・施行規則として扱うのは、名前の末尾が「施行令」「施行規則」のものだけ

解決した法令名の末尾が「施行令」または「施行規則」で、その前に名前があるときだけ、施行令・施行規則として扱い、末尾を落とした名前を親の法律とする。名前の途中に「施行令」を含んでいても末尾でなければ、施行令・施行規則としては扱わない。そのとき、法令の種別が法律（`law_type` が `Act`）なら SPEC-EGOV-GET-RELATED-LAWS-001、法律でなければ SPEC-EGOV-GET-RELATED-LAWS-020 になる。

例: `租税条約等の実施に伴う所得税法、法人税法及び地方税法の特例等に関する法律施行令` の親は `租税条約等の実施に伴う所得税法、法人税法及び地方税法の特例等に関する法律`。`施行令` だけの名前は親を持たない。`国税関係法令に係る情報通信技術を活用した行政の推進等に関する省令`（`415M60000040071`、`law_type: "MinisterialOrdinance"`）は末尾が「施行令」「施行規則」でなく、法律でもないので、SPEC-EGOV-GET-RELATED-LAWS-020 の応答になる（v0.17.0 では法律と同じ扱いで、`…省令施行令`・`…省令施行規則` を `not_found` に入れていた）。

## ADDED

### SPEC-EGOV-GET-RELATED-LAWS-019 法令名が完全一致しないときは、関連法令を引かず候補を付けた `LAW_NOT_FOUND` を返す

`law_name` の法令は SPEC-EGOV-COMMON-ERRORS-032 の規則で決める（このツールは `at` を受け取らない）。略称辞書に law_id が無く、e-Gov の法令名検索の全件の中に題名の完全一致が無いときは、検索結果の先頭の法令を起点にせず、候補名も作らずに、032 の形の `LAW_NOT_FOUND`（`retryable: false`）を返す。`next_actions` の候補の要素は `{ action: "get_related_laws", example: { law_name: <候補の題名> } }`。

例: `{ law_name: "所得税法施行" }` は `code: "LAW_NOT_FOUND"`、`next_actions` は `[{ action: "get_related_laws", example: { law_name: "所得税法施行令" } }, { action: "get_related_laws", example: { law_name: "所得税法施行規則" } }, { action: "search_law", example: { keyword: "所得税法施行" } }]`。v0.17.0 では同じ引数に、所得税法施行令を起点にした `related`（所得税法・所得税法施行規則）を返していた（2026-10-03 10:10 JST に houki-egov-dev 0.17.0 で確かめた）。

### SPEC-EGOV-GET-RELATED-LAWS-020 法律でもなく、名前の末尾が「施行令」「施行規則」でもない法令からは候補を作らない

解決した法令の種別（略称辞書の `law_type`、または e-Gov の検索結果の `law_info.law_type`）が `Act` でなく、名前の末尾が「施行令」「施行規則」でもないとき（例: 末尾が「省令」「政令」「規則」の法令、`Constitution`）は、名前に「施行令」「施行規則」を付けた候補を作らず、e-Gov に関連法令を問い合わせない。エラーにはせず、`related: []`、`not_found: []`、`next_actions: []` の応答を返す。`note` の末尾に `<法令名> は法律でも施行令・施行規則でもないため、名前の規則で関連法令を作っていません` を足す。`law`・`method`・`meta` は SPEC-EGOV-GET-RELATED-LAWS-001・007・010 のとおり。

例: `{ law_name: "国税関係法令に係る情報通信技術を活用した行政の推進等に関する省令" }` は、`law.law_id: "415M60000040071"`、`related: []`、`not_found: []`、`note` の末尾が `国税関係法令に係る情報通信技術を活用した行政の推進等に関する省令 は法律でも施行令・施行規則でもないため、名前の規則で関連法令を作っていません`。e-Gov への関連法令の問い合わせは 0 回（v0.17.0 では `…省令施行令` と `…省令施行規則` を問い合わせ、2 件とも `not_found` に入れていた。2026-10-03 10:13 JST に houki-egov-dev 0.17.0 で確かめた）。
