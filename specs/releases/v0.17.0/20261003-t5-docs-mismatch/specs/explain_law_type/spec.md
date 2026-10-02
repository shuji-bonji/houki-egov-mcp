# 差分: explain_law_type（20261003-t5-docs-mismatch）

`specs/current/explain_law_type/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- SPEC-EGOV-EXPLAIN-LAW-TYPE-011 と 014 の末尾の「（同じ応答の `see_also` は houki-egov-mcp #56 で扱うので、この ID では約束にしない。）」の行を消す

## ADDED

### SPEC-EGOV-EXPLAIN-LAW-TYPE-020 `see_also` は MCP クライアントから開ける GitHub の URL

`found: true` の応答（SPEC-EGOV-EXPLAIN-LAW-TYPE-001〜003）と `found: false` の応答（SPEC-EGOV-EXPLAIN-LAW-TYPE-005）は、どちらも `see_also` に `https://github.com/shuji-bonji/houki-egov-mcp/blob/main/docs/LAW-HIERARCHY.md` を入れる。リポジトリの中の相対パス（`docs/LAW-HIERARCHY.md`）は、npm のパッケージに入らず MCP クライアントからは開けないので使わない。キーは消さない。

例: `name: "政令"` の `see_also` も `name: "架空法令"` の `see_also` も `https://github.com/shuji-bonji/houki-egov-mcp/blob/main/docs/LAW-HIERARCHY.md`（v0.16.0 では `docs/LAW-HIERARCHY.md`）。
