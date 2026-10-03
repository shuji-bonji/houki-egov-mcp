# 差分: explain_law_type（20261003-search-explain-attachment）

`specs/current/explain_law_type/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「入力」の表の `name` の行の「e-Gov の法令種別コード（`"Act"` など）も受け付ける」を「e-Gov の法令種別コード（`"Act"`・`"Constitution"`・`"Rule"` など。SPEC-EGOV-EXPLAIN-LAW-TYPE-022）も受け付ける」にする
- SPEC-EGOV-EXPLAIN-LAW-TYPE-017 の末尾の「（`通知` を `通達` の別名として扱うかは houki-egov-mcp #62 で扱うので、この ID では約束にしない。）」の行を消す（SPEC-EGOV-EXPLAIN-LAW-TYPE-021 で決める）
- 「未決」の 1・2（→ #62）の行を消す

## MODIFIED

### SPEC-EGOV-EXPLAIN-LAW-TYPE-012 `info` の任意のフィールド `aliases`・`law_type_code`・`notes`

`info` は、SPEC-EGOV-EXPLAIN-LAW-TYPE-006 のフィールドのほかに、種別によって次のフィールドを持つ。

| フィールド      | 内容                                                                             |
| --------------- | -------------------------------------------------------------------------------- |
| `aliases`       | 別名の配列（文字列）                                                             |
| `law_type_code` | e-Gov の法令種別コード（文字列）                                                 |
| `notes`         | 補足の注意の配列（文字列）。1 件以上                                             |

`憲法` の `law_type_code` は `Constitution`、`法律` は `Act`、`政令` は `CabinetOrder`、`省令` は `MinisterialOrdinance`、`規則` は `Rule`（SPEC-EGOV-EXPLAIN-LAW-TYPE-022）。

例: `name: "政令"` の `info` は `aliases: ["施行令", "CabinetOrder"]`・`law_type_code: "CabinetOrder"`・`notes`（1 件）を持つ。`name: "法律"` の `info` は `law_type_code: "Act"` を持ち、`aliases` と `notes` を持たない。`name: "憲法"` の `info` は `aliases: ["日本国憲法"]` と `law_type_code: "Constitution"` を持つ（v0.17.0 では `law_type_code` を持たなかった）。`name: "通達"` の `info.aliases` は `["基本通達", "取扱通達"]`（SPEC-EGOV-EXPLAIN-LAW-TYPE-021）。

## ADDED

### SPEC-EGOV-EXPLAIN-LAW-TYPE-021 `通知` は `通達` と別の種別として解説し、`通達` の別名に入れない

`通知` は、収録している種別の 1 つ（`info.name: "通知"`）として解説する。`通達` の `info.aliases` に `通知` を入れない。`name: "通知"` は、種別の名前の一致（SPEC-EGOV-EXPLAIN-LAW-TYPE-001）で `通知` の `info` を返す。

`通知` の `info` は、`enacting_body: "行政機関"`、`hierarchy_rank: 99`、`level: "agency-internal"`、`binds_citizens: false`、`can_set_penalties: false` を持つ。SPEC-EGOV-EXPLAIN-LAW-TYPE-005 の `hint` と SPEC-EGOV-EXPLAIN-LAW-TYPE-014 の `next_actions` に並べる名前に `通知` を含める（今までどおり）。

例: `name: "通知"` は `found: true`・`info.name: "通知"`・`info.binds_citizens: false`（今までどおり）。`name: "通達"` の `info.aliases` は `["基本通達", "取扱通達"]`（v0.17.0 では `["通知", "基本通達", "取扱通達"]` で、`通知` で引くと `通達` ではなく `通知` の解説が返るのに、`通達` の別名に `通知` が載っていた）。

### SPEC-EGOV-EXPLAIN-LAW-TYPE-022 e-Gov の法令種別コード `Constitution`・`Rule` から、憲法・規則の解説を返す

`name` が `Constitution` のときは `憲法` の `info`、`Rule` のときは `規則` の `info` を返す（`found: true`。SPEC-EGOV-EXPLAIN-LAW-TYPE-003 と同じ引き方）。e-Gov 法令 API v2 の `law_type` が返す値のうち、`ImperialOrder`（勅令）と `Misc` は、収録している種別に当たらないので今までどおり `found: false`（SPEC-EGOV-EXPLAIN-LAW-TYPE-005）。`ImperialOrdinance` も `found: false`。

e-Gov の `law_type` の値（2026-10-03 10:18 JST に `/laws?law_type=<値>&limit=1` で確かめた）: `Constitution`（1 件）・`Act`・`CabinetOrder`・`ImperialOrder`（74 件）・`MinisterialOrdinance`・`Rule`（453 件）は 200、`Misc` は 200 で 0 件、`ImperialOrdinance` は 400・`{"code":"400001","message":"法令種別（law_type、law_num_type）が誤っています。"}`。

例: `name: "Constitution"` は `found: true`・`info.name: "憲法"`。`name: "Rule"` は `found: true`・`info.name: "規則"`。v0.17.0 ではどちらも `found: false` だった。`name: "ImperialOrder"` は `found: false`（2026-10-03 10:19 JST に houki-egov-dev 0.17.0 でも `found: false`）。
