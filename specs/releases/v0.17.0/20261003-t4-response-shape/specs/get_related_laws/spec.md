# 差分: get_related_laws（20261003-t4-response-shape）

`specs/current/get_related_laws/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える

## MODIFIED

### SPEC-EGOV-GET-RELATED-LAWS-010 成功の応答の meta に、応答を作った日時と `at: null` を入れる

成功の応答には `meta: { retrieved_at, at }` を付ける。`retrieved_at` は応答を作った日時の ISO 8601 形式の文字列（UTC、例: `2026-09-27T20:31:35.697Z`）。このツールは `at` を受け取らないので、`at` は常に `null` である（`meta` を持つツールで `meta` のキーを揃えるため）。

例: `law_name: "所得税法"` の応答の `meta` は `{ retrieved_at: <ISO 8601>, at: null }` で、`retrieved_at` の値は `new Date(retrieved_at).toISOString()` と同じ文字列になる。`related` が空の応答（`law_name: "民法"`）にも同じ形で付く（v0.16.0 の `meta` は `retrieved_at` だけだった）。
