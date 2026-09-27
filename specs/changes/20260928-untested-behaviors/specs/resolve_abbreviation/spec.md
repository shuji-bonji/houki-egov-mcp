# 差分: resolve_abbreviation（20260928-untested-behaviors）

`specs/current/resolve_abbreviation/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-RESOLVE-ABBREVIATION-005 正式名称からも、そのエントリを返す

`abbr` が略称辞書のエントリの正式名称（`formal`）と一致するときも、エラーにせず、そのエントリを `resolved` に入れて返す。`resolved.abbr` は辞書の略称で、応答の `abbr` とは違う値になる。

例: `abbr: "消費税法"` は `abbr: "消費税法"`・`resolved.abbr: "消法"`・`resolved.formal: "消費税法"`。`abbr: "所得税法"` は `resolved.abbr: "所法"`、`abbr: "労働基準法"` は `resolved.abbr: "労基法"`。

### SPEC-EGOV-RESOLVE-ABBREVIATION-006 別名からも、そのエントリを返す

`abbr` が略称辞書のエントリの別名（`aliases` の要素）と一致するときも、エラーにせず、そのエントリを `resolved` に入れて返す。

例: `abbr: "消費税"` と `abbr: "インボイス"` は、どちらも `resolved.abbr: "消法"`・`resolved.formal: "消費税法"`。

### SPEC-EGOV-RESOLVE-ABBREVIATION-007 前後の空白を除いてから辞書と照合する

`abbr` の前後にある空白（半角スペース・全角スペース・タブ・改行）を除いてから辞書と照合する。

例: `abbr: " 消法 "`・`abbr: "　消法　"`（前後が全角スペース）・`abbr: "\t消法\n"` は、どれも `resolved.abbr: "消法"`・`resolved.formal: "消費税法"`。

### SPEC-EGOV-RESOLVE-ABBREVIATION-008 応答の abbr は渡した値のまま返す

応答の `abbr` には、前後の空白を除く前の、渡した値をそのまま入れる。辞書にあるときも無いときも同じ。

例: `abbr: " 消法 "` は応答の `abbr` が `" 消法 "`（`resolved.abbr` は `"消法"`）。`abbr: " 存在しない法律 "` は応答の `abbr` が `" 存在しない法律 "` で、`resolved: null`。

### SPEC-EGOV-RESOLVE-ABBREVIATION-009 resolved は略称辞書のエントリをそのまま返す

`resolved` には、略称辞書（`@shuji-bonji/houki-abbreviations`）の `resolveAbbreviation` が返すエントリを、フィールドを足したり除いたりせずにそのまま入れる。SPEC-EGOV-RESOLVE-ABBREVIATION-001・002 のフィールドのほか、エントリが持っていれば `abbr`・`law_id`・`law_num`・`law_type`・`aliases`・`note` も付く。どのフィールドを持つかは辞書のパッケージの版で決まる。

例: `abbr: "消法"` の `resolved` は、`resolveAbbreviation("消法")` の戻り値と同じ内容（深く比べて等しい）。辞書 0.4.1 では `abbr: "消法"`・`formal: "消費税法"`・`law_id: "363AC0000000108"`・`law_num: "昭和六十三年法律第百八号"`・`law_type: "Act"`・`domain: "tax"`・`category: "law"`・`source_mcp_hint: "houki-egov"`・`aliases`（先頭は `消費税`、`インボイス` を含む 10 件）・`note` を持つ。
