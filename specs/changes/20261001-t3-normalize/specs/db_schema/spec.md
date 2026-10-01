# 差分: db_schema（20261001-t3-normalize）

`specs/current/db_schema/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-DB-SCHEMA-024 0.16.0 はスキーマの版 2 のままで、既存の行の検索用列を入れ直さない

0.16.0 で houki-abbreviations を 0.7.0 に上げ、取り込みの揃え方（`normalizeJpText`）がダッシュ類も `-` にするようになっても、スキーマの版は 2 のまま（SPEC-EGOV-DB-SCHEMA-001）で、0.15.4 以前に取り込んだ `articles.body` と `laws_fts` の行は書き換えない。版 2 の DB を 0.16.0 で開いても、中身は変わらず、取り込みもやり直さない。ダッシュ類を含む本文の揃え直しは、スキーマの版を上げる 0.19.0 の取り込みで行う（SPEC-EGOV-SEARCH-FULLTEXT-036）。

例: `articles.body` に `183―2` を含む版 2 の DB を 0.16.0 で開くと、`schema_meta` の `schema_version` は `2` のままで、その行の `body` も `183―2` のまま。`--sync` でその法令が更新されたときだけ、新しい本文が `183-2` で入る。
