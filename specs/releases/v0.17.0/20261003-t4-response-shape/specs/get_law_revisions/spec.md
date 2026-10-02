# 差分: get_law_revisions（20261003-t4-response-shape）

`specs/current/get_law_revisions/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- 「処理の流れ」の図の「先頭から latest 件にする（未決 11）」の前に「施行日の新しい順に並べる（016）」の箱を足す

## ADDED

### SPEC-EGOV-GET-LAW-REVISIONS-016 `revisions` は施行日の新しい順に並べ、まだ施行されていない改正も含める

`revisions` は、`amendment_enforcement_date`（施行日）の新しい順に並べる。まだ施行されていない改正（`current_revision_status: "UnEnforced"`）も除かず、施行日の順のとおり先頭の側に置く。施行日が同じ改正どうしは、e-Gov が返した順のまま並べる。`amendment_enforcement_date` が `null` の改正は、施行日が決まっていない改正として先頭に置く（`null` が複数あれば e-Gov が返した順）。

並べ替えはツールが行い、e-Gov が返す順には頼らない。2026-10-03 JST に `消法` で確かめた e-Gov の順は、すでに施行日の新しい順だった（下の例）ので、v0.16.0 と比べて並びは変わらない。

`latest`（SPEC-EGOV-GET-LAW-REVISIONS-009）の「最新」はこの順の先頭である。いま効力のある版だけを知りたいときは、`current_revision_status` が `CurrentEnforced` の要素を見る（SPEC-EGOV-GET-LAW-REVISIONS-017）。施行済みだけに絞る引数は無い。

例: 2026-10-03 JST に `{ law_name: "消法" }` を呼ぶと、`total: 65`、`revisions[0]` は施行日 `2030-06-19`・`UnEnforced` の改正（令和七年法律第七十四号）、`revisions[0]`〜`revisions[7]` の 8 件が `UnEnforced`、`revisions[8]` が施行日 `2026-10-01`・`CurrentEnforced` の改正（令和七年法律第七十号）で、それより後はすべて `PreviousEnforced`。`latest: 3` では施行日 `2030-06-19`・`2028-04-01`・`2027-10-01` の 3 件（どれも `UnEnforced`）を返す。施行日が `2026-10-01` の改正は 3 件あり、e-Gov が返した順（`CurrentEnforced` が先）のまま並ぶ。

### SPEC-EGOV-GET-LAW-REVISIONS-017 `current_revision_status` は e-Gov の値をそのまま返す

`revisions[].current_revision_status` には、e-Gov の改正履歴の値を変えずに入れる。日本語に置き換えたり、日本語の説明のフィールドを足したりはしない。2026-10-03 JST に `消法` で確かめた値は次の 3 つである。

| 値                 | 意味                                   |
| ------------------ | -------------------------------------- |
| `CurrentEnforced`  | 呼び出した時点で効力のある版           |
| `PreviousEnforced` | 施行済みで、後の改正で置き換わった版   |
| `UnEnforced`       | まだ施行されていない改正による版       |

e-Gov がこれ以外の値を返したときも、そのまま入れる。tools/list の `description` は、この 3 つの値を書く（差分 `20261003-t5-docs-mismatch` の「実装 PR で直す文書」）。

例: 2026-10-03 JST の `{ law_name: "消法", latest: 9 }` の `revisions[0].current_revision_status` は `"UnEnforced"`、`revisions[8].current_revision_status` は `"CurrentEnforced"`。

## MODIFIED

### SPEC-EGOV-GET-LAW-REVISIONS-002 meta・total・revisions の形で改正履歴を返し、値の無いフィールドは null にする

法令を 1 つに決められ、e-Gov の改正履歴を取れたときは、次のフィールドを持つ応答を返す。

| フィールド  | 内容                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta`      | `law_id`・`title`・`law_num`・`retrieved_at`（呼び出した日時。ISO 8601 の文字列）・`url`（`https://laws.e-gov.go.jp/law/<law_id>`）・`at`（このツールは `at` を受け取らないので常に `null`）                                                         |
| `total`     | e-Gov が返した改正の件数（`latest` で絞る前の件数）                                                                                                                                                                                                |
| `revisions` | 改正の配列。並びは SPEC-EGOV-GET-LAW-REVISIONS-016。要素は `law_revision_id`・`amendment_promulgate_date`・`amendment_enforcement_date`・`amendment_enforcement_comment`・`amendment_law_num`・`amendment_law_title`・`amendment_law_id`・`current_revision_status` の 8 つ |

`revisions` の要素は、e-Gov の改正の要素にその値が無いとき（キーが無いとき、`null` のとき）も 8 つのキーをすべて持ち、値の無いキーは `null` にする。e-Gov の改正の要素にこの 8 つ以外のフィールドがあっても、`revisions` の要素には入れない。

例: 改正履歴が `REVS` のとき `{ law_name: "消法" }` を渡すと、`meta.law_id: "363AC0000000108"`、`meta.url: "https://laws.e-gov.go.jp/law/363AC0000000108"`、`meta.at: null`、`total: 3`、`revisions` は 3 件で、`revisions[0]` は `{ law_revision_id: "363AC0000000108_20291001_505AC0000000003", amendment_promulgate_date: "2023-03-31", amendment_enforcement_date: "2029-10-01", amendment_enforcement_comment: null, amendment_law_num: "令和五年法律第三号", amendment_law_title: "所得税法等の一部を改正する法律", amendment_law_id: "505AC0000000003", current_revision_status: "UnEnforced" }`。e-Gov の 1 件目に `extra_field: "x"` があっても `revisions[0]` に `extra_field` は無い。e-Gov の 1 件目に `amendment_enforcement_comment` のキーが無いときも、`revisions[0].amendment_enforcement_comment` は `null`（v0.16.0 ではキーが無かった）。

### SPEC-EGOV-GET-LAW-REVISIONS-009 latest が 1 以上なら、施行日の新しい順の先頭から latest 件を返し、total は絞る前の件数のまま

`latest` に 1 以上の整数を渡したときは、`revisions` を SPEC-EGOV-GET-LAW-REVISIONS-016 の順（施行日の新しい順。まだ施行されていない改正を含む）の先頭から `latest` 件にする。`total` は絞る前の件数のまま。`latest` が件数より大きければ全件を返す。

例: 改正履歴が `REVS`（施行日 2029-10-01・2026-04-01・2025-04-01 の 3 件）のとき、`{ law_name: "消法", latest: 1 }` は `total: 3`、`revisions` が 1 件で `revisions[0].law_revision_id: "363AC0000000108_20291001_505AC0000000003"`。`latest: 2` は 2 件、`latest: 10` は 3 件（どれも `total: 3`）。e-Gov が施行日の古い順に返したときも、`latest: 1` は施行日 2029-10-01 の改正を返す。
