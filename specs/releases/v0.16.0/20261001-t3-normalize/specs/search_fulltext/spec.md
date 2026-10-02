# 差分: search_fulltext（20261001-t3-normalize）

`specs/current/search_fulltext/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-SEARCH-FULLTEXT-036 検索語のダッシュ類は `-` に揃えて探し、DB の本文は取り込んだときの版の揃え方のまま

`keyword` のダッシュ類 `－` `‐` `‑` `–` `—` `―` `−` は `-` に揃えてから探す（houki-abbreviations 0.7.0 の `normalizeJpText`。SPEC-ABBR-NORMALIZE-JP-TEXT-012）。取り込み（`--bulk-download-everything` / `--sync`）が `articles.body` と `laws_fts` に入れる文字列も同じ関数で揃えるので、0.16.0 以降に取り込んだ本文はダッシュ類が `-` で入る。0.16.0 より前に取り込んだ本文は `―` などのままで、0.16.0 では入れ直さない（SPEC-EGOV-DB-SCHEMA-024）。その行は、ダッシュ類を含む検索語では当たらない（`hits: []`。誤った条が当たるのではない）。全件を揃え直すのは、スキーマの版を上げる 0.19.0 の取り込みで行う。

例: 0.16.0 で取り込んだ DB で、本文に `１８３―２` とある条は、`keyword: "183-2"` でも `keyword: "１８３―２"` でも当たる。0.15.4 で取り込んだ DB では、その条の `body` は `183―2` のままなので、`keyword: "183-2"` は `183-2` を探して当たらない。
