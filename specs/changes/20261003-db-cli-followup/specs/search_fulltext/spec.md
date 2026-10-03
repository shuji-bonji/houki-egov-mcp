# 差分: search_fulltext（20261003-db-cli-followup）

`specs/current/search_fulltext/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 差分 `20261003-db-cli` を取り込んだ後の current に当てる（あちらは 039・040 の ADDED。番号はその続き）
- SPEC-EGOV-SEARCH-FULLTEXT-004 の箇条書きの「附則」の行の後に、「条を持たず段落だけの附則: `附則(<n>)`（SPEC-EGOV-SEARCH-FULLTEXT-041）」の行を足す。004 の題と本文のほかの行は、差分 `20261003-db-cli` の 004 のまま（004 は `20261003-db-cli` が MODIFIED にしているので、同じ ID の見出しをこの差分に置かず、ID の無い変更として書く）

## ADDED

### SPEC-EGOV-SEARCH-FULLTEXT-041 段落だけの附則のヒットは `附則(<n>)` と返し、`caption` は `null`

条を持たず段落だけの附則の行（SPEC-EGOV-CLI-BULK-DOWNLOAD-012 の `Suppl<n>_intro`）に当たったヒットは、`article_num` を `附則(<法令の中での附則の通し番号>)`（条番号を付けない）、`caption` を `null`、`chapter_path` を附則の見出し（例: `附　則`）で返す。段落だけの本則の `本則`（SPEC-EGOV-SEARCH-FULLTEXT-004）と同じく、条番号の無い行には条番号を付けない。

例: `{ keyword: "獣医師法施行規則 昭和二十八年九月一日から施行する" }` は `article_num: "附則(2)"`、`caption: null`、`chapter_path: "附　則"` のヒットを返す。同じ法令の条のある附則は今までどおり `附則(7) 1`。v0.18.x では同じ呼び出しが `article_num: "附則(2) intro"`、`caption: "附　則"` を返した（2026-10-03 12:57 JST に houki-egov-dev 0.17.0 の手元の DB で確かめた。#101）。
