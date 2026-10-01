# 差分: resolve_abbreviation（20261001-t3-normalize）

`specs/current/resolve_abbreviation/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「処理の流れ」の図に、辞書に当たった後の「`source_mcp_hint` が houki-egov か → `in_scope: true`（012）/ `in_scope: false` と `hint`（013）」の分岐を足す
- 「入力」の表の `abbr` の行に「全角英数字・ダッシュ類・全角空白は半角に揃えて照合する（011）」を足す

## ADDED

### SPEC-EGOV-RESOLVE-ABBREVIATION-011 `abbr` の全角英数字・ダッシュ類・全角空白は半角に揃えてから辞書と照合する

`abbr` は、houki-abbreviations の `resolveAbbreviation(name, { normalize: true })` の規則（全角英数字を半角に、ダッシュ類 `－` `‐` `‑` `–` `—` `―` `−` を `-` に、全角チルダを `~` に、全角空白を半角空白にし、前後の空白を除く。大文字と小文字は区別する）で揃えてから、略称・正式名称・別名と照合する。応答の `abbr` は渡した値のまま（SPEC-EGOV-RESOLVE-ABBREVIATION-008）。

例: `abbr: "ＰＬ法"` は `resolved.formal: "製造物責任法"` で、応答の `abbr` は `"ＰＬ法"`（v0.15.4 では `resolved: null` だった）。`abbr: "pl法"` は大文字小文字が違うので `resolved: null` のまま。`abbr: "消　法"`（内側が全角空白）は `消 法` として引くので `resolved: null`。

### SPEC-EGOV-RESOLVE-ABBREVIATION-012 houki-egov の管轄のエントリには `in_scope: true` を付ける

解決したエントリの `source_mcp_hint` が `houki-egov` のとき、応答に `in_scope: true` を付ける。`hint` は付けない。

例: `abbr: "消法"` の応答は `resolved.source_mcp_hint: "houki-egov"`、`in_scope: true` で、`hint` は無い。

### SPEC-EGOV-RESOLVE-ABBREVIATION-013 管轄外のエントリには `in_scope: false` と管轄先を書いた `hint` を付ける

解決したエントリの `source_mcp_hint` が `houki-egov` でないとき（通達など）は、`resolved` にエントリを入れたうえで `in_scope: false` を付け、`hint` を `このエントリは <source_mcp_hint> の管轄です。<source_mcp_hint>-mcp で取得してください。` にする。エラー（`OUT_OF_SCOPE`）にはしない。houki-nta-mcp の SPEC-NTA-RESOLVE-ABBREVIATION-003 と同じ形である。

例: `abbr: "消基通"` の応答は `resolved.formal: "消費税法基本通達"`、`resolved.source_mcp_hint: "houki-nta"`、`in_scope: false`、`hint: "このエントリは houki-nta の管轄です。houki-nta-mcp で取得してください。"`（v0.15.4 では `in_scope` と `hint` が無かった）。
