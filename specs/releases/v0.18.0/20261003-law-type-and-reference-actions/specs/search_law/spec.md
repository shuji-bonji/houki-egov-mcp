# 差分: search_law（20261003-law-type-and-reference-actions）

`specs/current/search_law/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「入力」の表の `law_type` の行を「法令種別で絞り込む。`Constitution` / `Act` / `CabinetOrder` / `ImperialOrder` / `MinisterialOrdinance` / `Rule` のどれか（SPEC-EGOV-SEARCH-LAW-018。e-Gov の `law_type` の値と同じ）」にする
- 差分 `20261003-search-explain-attachment`（016・017）を取り込んだ後に、この差分を取り込む

## ADDED

### SPEC-EGOV-SEARCH-LAW-018 `law_type` の選択肢は e-Gov の `law_type` の値と同じで、勅令は `ImperialOrder`

tools/list の `search_law` の inputSchema の `law_type` は、`enum: ["Constitution", "Act", "CabinetOrder", "ImperialOrder", "MinisterialOrdinance", "Rule"]` を持つ。どれも e-Gov 法令 API v2 の `/laws` の `law_type` が受け付け、応答の `results[].law_type` に入る値である。`ImperialOrdinance` は選択肢に無く、渡すと inputSchema の検査で `INVALID_ARGUMENT`（`tool: "search_law"`、`detail.issues: [{ path: "law_type", message: "Constitution・Act・CabinetOrder・ImperialOrder・MinisterialOrdinance・Rule のどれかで指定してください" }]`）を返し、e-Gov に問い合わせない。

例: `{ keyword: "健康保険法", law_type: "ImperialOrder" }` は、e-Gov に `law_title=健康保険法&law_type=ImperialOrder` で問い合わせ、`results` に健康保険法施行令（`215IO0000000243`、大正十五年勅令第二百四十三号、`law_type: "ImperialOrder"`）が入る。`{ keyword: "健康保険法", law_type: "ImperialOrdinance" }` は `code: "INVALID_ARGUMENT"`・`detail.issues[0].path: "law_type"` で、e-Gov への問い合わせは 0 回（v0.17.0 では inputSchema を通り、e-Gov が 400・`400001` を返して `SOURCE_API_ERROR`・`retryable: false` だった。2026-10-03 10:19 JST に houki-egov-dev 0.17.0 で確かめた）。`{ keyword: "日本国憲法", law_type: "Constitution" }` は日本国憲法（`321CONSTITUTION`）を返す（v0.17.0 では `Constitution` が選択肢に無く `INVALID_ARGUMENT`）。

2026-10-03 10:18 JST に e-Gov の `/laws?law_type=<値>&limit=1` で確かめた値: `Constitution` 1 件、`ImperialOrder` 74 件、`Rule` 453 件（いずれも 200）、`ImperialOrdinance` は 400・`{"code":"400001","message":"法令種別（law_type、law_num_type）が誤っています。"}`。
