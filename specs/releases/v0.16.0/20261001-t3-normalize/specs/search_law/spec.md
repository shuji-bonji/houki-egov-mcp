# 差分: search_law（20261001-t3-normalize）

`specs/current/search_law/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「処理の流れ」の図の略称の照合の後に「管轄外 → `OUT_OF_SCOPE`（015）」の分岐を足す

## ADDED

### SPEC-EGOV-SEARCH-LAW-014 `keyword` の略称の照合で全角英数字・ダッシュ類・全角空白を吸収する

`keyword` を略称辞書と照合するとき（SPEC-EGOV-SEARCH-LAW-002）は、houki-abbreviations の `resolveAbbreviation(name, { normalize: true })` の規則（全角英数字を半角に、ダッシュ類を `-` に、全角チルダを `~` に、全角空白を半角空白にし、前後の空白を除く。大文字と小文字は区別する）で揃えてから照合する。辞書に当たれば正式名称を e-Gov に渡し、当たらなければ前後の空白を除いた渡した値のまま `law_title` に渡す（揃えない）。応答の `query.keyword` は渡した値のまま。

例: `keyword: "ＰＬ法"` は e-Gov に `law_title=製造物責任法` で問い合わせ、`query.keyword: "ＰＬ法"`・`query.resolved: "製造物責任法"`（v0.15.4 では `law_title=ＰＬ法` で問い合わせて 0 件だった）。

### SPEC-EGOV-SEARCH-LAW-015 houki-egov の管轄でない略称は `OUT_OF_SCOPE` を返し、e-Gov を引かない

`keyword` が略称辞書で houki-egov 以外の管轄（通達は houki-nta など）と分かる名前のときは、エラー `OUT_OF_SCOPE` を返し、e-Gov には問い合わせない。本文は `get_law` の SPEC-EGOV-GET-LAW-001・032 と同じ（`error` に正式名称と管轄、`hint` に管轄先の MCP、`next_actions` に `delegate_to_mcp`）。

例: `keyword: "消基通"` は `code: "OUT_OF_SCOPE"` で、e-Gov への問い合わせは 0 回（v0.15.4 では `law_title=消費税法基本通達` で問い合わせて `results: []` だった）。`keyword: "消費税"`（辞書に無い）は今までどおり e-Gov を検索する。
