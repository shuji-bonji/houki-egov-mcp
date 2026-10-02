# 差分: verify_citations（20261003-t4-response-shape）

`specs/current/verify_citations/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える

## MODIFIED

### SPEC-EGOV-VERIFY-CITATIONS-021 応答の meta に取得日時と時点を付ける

応答は `meta` を持つ。`meta.retrieved_at` は応答を組み立てた日時で、ISO 8601 の UTC 表記（例: `"2026-09-27T20:31:49.938Z"`）である。`meta.at` は、`at` を渡したときは渡した値をそのまま入れ、`at` を渡さなかったときは `null` にする。`meta` のキーは `at` の有無で変わらない。

例: `{ citations: [{ law_name: "所得税法", article: "9" }], at: "2024-04-01" }` の `meta` は `{ retrieved_at: "<ISO 8601>", at: "2024-04-01" }`。`at` を省くと `meta` は `{ retrieved_at: "<ISO 8601>", at: null }`（v0.16.0 では `{ retrieved_at }` だけだった）。
