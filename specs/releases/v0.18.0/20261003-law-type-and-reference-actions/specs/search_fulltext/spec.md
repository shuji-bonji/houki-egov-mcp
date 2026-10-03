# 差分: search_fulltext（20261003-law-type-and-reference-actions）

`specs/current/search_fulltext/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「入力」の表の `law_type` の行を「法令種別で絞る。`Constitution` / `Act` / `CabinetOrder` / `ImperialOrder` / `MinisterialOrdinance` / `Rule` のどれか（SPEC-EGOV-SEARCH-FULLTEXT-038。ローカル DB と e-Gov の `law_type` の値と同じ）」にする
- 差分 `20261003-search-explain-attachment`（007・018・022・037）を取り込んだ後に、この差分を取り込む

## ADDED

### SPEC-EGOV-SEARCH-FULLTEXT-038 `law_type` の選択肢は DB と e-Gov の `law_type` の値と同じで、勅令は `ImperialOrder`

tools/list の `search_fulltext` の inputSchema の `law_type` は、`enum: ["Constitution", "Act", "CabinetOrder", "ImperialOrder", "MinisterialOrdinance", "Rule"]` を持つ（`search_law` の SPEC-EGOV-SEARCH-LAW-018 と同じ）。ローカル DB の `laws.law_type` は取り込みが e-Gov の値（勅令は `ImperialOrder`。SPEC-EGOV-CLI-BULK-DOWNLOAD の法令種別の表）で入れるので、選択肢の値でそのまま絞れる。`ImperialOrdinance` は選択肢に無く、渡すと inputSchema の検査で `INVALID_ARGUMENT`（`tool: "search_fulltext"`、`detail.issues[0].path: "law_type"`）を返し、DB も e-Gov も引かない。DB が無いときの `search_law` への切り替え（SPEC-EGOV-SEARCH-FULLTEXT-029）にも同じ値を渡す。

例（2026-10-03 10:25 JST に houki-egov-dev 0.17.0 と手元の DB（`last_sync_date: "2026-09-19"`）で確かめた値を元にした）: `{ keyword: "健康保険法施行令", law_type: "ImperialOrder" }` は、`law_type: "ImperialOrder"` の健康保険法施行令（`215IO0000000243`）の条を返す（`law_type` を付けない同じ検索で 3 件当たり、3 件とも `law_type: "ImperialOrder"` だった）。`{ keyword: "健康保険法施行令", law_type: "ImperialOrdinance" }` は `code: "INVALID_ARGUMENT"`（v0.17.0 では `count: 0`・`hits: []` の成功で、勅令で絞れないことが分からなかった）。DB の日本国憲法の `law_type` は `Constitution`（`日本国憲法 第9条` の検索で確かめた）なので、`law_type: "Constitution"` で日本国憲法の条に絞れる。
