# 差分: search_fulltext（20261003-db-cli）

`specs/current/search_fulltext/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 差分 `20261003-search-explain-attachment`・`20261003-law-type-and-reference-actions`（0.18.0）を取り込んだ後の current に当てる。この差分の見出しは、あちらの差分の見出し（007・018・022・037・038）と重ならない
- 「処理の流れ」の図の `B{"ローカル DB に条が 1 件以上あるか"}` の前に `V{"DB の状態（039・040）"}` を挟み、`V -- "ファイルが無い・版の記録が無い" --> FB`、`V -- "版が古い・新しい・読めない" --> FB2["DB を使わずに search_law に切り替え、版に合った note・next_actions を返す（040）"]`、`V -- "版が同じ" --> B` にする。`FB` の文は今のまま
- 「できないこと」の「ローカル DB を作ること・更新すること（CLI の `--bulk-download-everything` / `--sync`）」を「ローカル DB を作ること・作り直すこと・更新すること（CLI の `--bulk-download-everything` / `--sync`。DB のファイルが無くても作らない。SPEC-EGOV-SEARCH-FULLTEXT-039）」にする

## MODIFIED

### SPEC-EGOV-SEARCH-FULLTEXT-004 条番号は本則・附則・別表を区別した表示形式で返す

`hits[].article_num` は次の形で返す。

- 本則: `30`、枝番号は `30の2`
- 条を持たず段落だけの本則（SPEC-EGOV-CLI-BULK-DOWNLOAD-027 の `MainProvision` の行）: `本則`
- 附則: `附則(<法令の中での附則の通し番号>) <条番号>`。例: `附則(3) 1`、`附則(137) 51の2`
- 別表: `別表(<番号>)`。例: `別表(2)`

例: 改暦ノ布告の本則の行に当たったヒットは `article_num: "本則"`、`caption: null`、`chapter_path: null`。

### SPEC-EGOV-SEARCH-FULLTEXT-023 DB の鮮度を freshness で返す

`source: "bulk"` の応答の `freshness` に、DB を最後に同期した日からの鮮度を入れる。DB に同期の記録が無いときは `null`。

| フィールド        | 内容                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `last_sync_date`  | 最後に同期を終えた日（`YYYY-MM-DD`）                                                                                                                                                                                                       |
| `last_full_dl_at` | 最後に全件を取り込んだ日時                                                                                                                                                                                                                 |
| `days_since_sync` | `last_sync_date` からの経過日数                                                                                                                                                                                                            |
| `staleness`       | 経過日数が 7 日未満なら `fresh`、30 日未満なら `stale`、30 日以上なら `outdated`                                                                                                                                                           |
| `warning`         | `outdated` のときだけ付く。`bulk DB が <日数> 日前のデータです` と、`houki-egov-mcp --sync`（最終同期から `<上限>` 日を超えていれば `--bulk-download-everything`）の実行の案内。`<上限>` は `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS` の値（既定 90） |

鮮度が `outdated` でも DB を引いた結果を返す。

例: 最終同期が 1 日前なら `staleness: "fresh"`、`days_since_sync: 1`、`warning` なし。ちょうど 7 日前なら `stale`。38 日前なら `outdated` で、`warning` に `日前` と `bulk-download` を含む。MCP サーバーを `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS=60` で起動したときは、`warning` に `最終同期から 60 日を超えていれば` を含む（v0.18.x では 90 のまま。CLI の SPEC-EGOV-CLI-STATUS-004 と揃える。#61）。

### SPEC-EGOV-SEARCH-FULLTEXT-036 検索語のダッシュ類は `-` に揃えて探し、版 3 の DB の本文も同じ揃え方で入っている

`keyword` のダッシュ類 `－` `‐` `‑` `–` `—` `―` `−` は `-` に揃えてから探す（houki-abbreviations 0.7.0 の `normalizeJpText`。SPEC-ABBR-NORMALIZE-JP-TEXT-012）。取り込み（`--bulk-download-everything` / `--sync`）が `articles.body` と `laws_fts` に入れる文字列も同じ関数で揃える。

0.19.0 はスキーマの版 3 の DB だけを引く（SPEC-EGOV-SEARCH-FULLTEXT-040）。版 3 の DB は 0.19.0 以降の `--bulk-download-everything` で作るので、どの行もダッシュ類が `-` で入っている。0.16.0 より前に取り込んだ `―` などの残る本文（版 2 の DB）は、0.19.0 では引かず、`--bulk-download-everything` で版 3 に作り直したときに揃え直す。

例: 版 3 の DB で、本文に `１８３―２` とある条は、`keyword: "183-2"` でも `keyword: "１８３―２"` でも当たる。0.15.4 で取り込んだ版 2 の DB では、0.19.0 の `search_fulltext` は DB を引かずに SPEC-EGOV-SEARCH-FULLTEXT-040 の `search_law` への切り替えを返す（v0.16.0〜v0.18.x では版 2 の DB を引き、その条は `183-2` で当たらなかった）。

## ADDED

### SPEC-EGOV-SEARCH-FULLTEXT-039 DB のファイルを作らず、DB に書き込まない

`search_fulltext` は、ローカル DB のファイル・置き場所のフォルダー・テーブル・`schema_meta` を作らず、書き換えない（SPEC-EGOV-DB-SCHEMA-025）。DB のファイルが無いとき（置き場所のフォルダーも無いときを含む）と、ファイルはあるが版の記録が無いときは、SPEC-EGOV-SEARCH-FULLTEXT-002 と同じ形（`note` の先頭は `bulk DL 未実行のため`）で `search_law` に切り替えて返す。パスの途中が普通のファイルで開けないときは、今までどおり SPEC-EGOV-SEARCH-FULLTEXT-027。

例: `HOUKI_EGOV_DB_PATH=<空のフォルダー>/a/laws.db` で `{ keyword: "消費税法" }` を呼ぶと、`source: "api-fallback"`、`note` は `bulk DL 未実行のため` で始まり、`next_actions[0].action: "bulk_download_everything"`。呼んだ後も `<空のフォルダー>/a` は無い（v0.18.x ではフォルダーと空の DB を作り、スキーマを書いた。README の「書き込みは CLI だけが行い、MCP server は読むだけ」と違っていた。#60）。

### SPEC-EGOV-SEARCH-FULLTEXT-040 版が同じでない DB は使わずに search_law に切り替える

DB の版（`schema_meta` の `schema_version`）が 3 でないときは、DB を引かず、作り直さず、SPEC-EGOV-SEARCH-FULLTEXT-002 と同じ形で `search_law` に切り替えて返す。`note` と `next_actions` は DB の状態で変える。

| DB の状態 | `note` の先頭 | `note` の続き | `next_actions` |
| --- | --- | --- | --- |
| 版が古い（1・2） | `bulk DB の版 (<DB の版>) がこの houki-egov-mcp (3) より古いため` | SPEC-EGOV-SEARCH-FULLTEXT-002 と同じく、`houki-egov-mcp --bulk-download-everything` で DB を作り直すと本文を検索できること | SPEC-EGOV-SEARCH-FULLTEXT-002 と同じ（1 件目 `bulk_download_everything`、2 件目 `search_law`） |
| 版が新しい（4 以上の整数） | `bulk DB の版 (<DB の版>) がこの houki-egov-mcp (3) より新しいため` | houki-egov-mcp を新しい版に更新すると本文を検索できること。`--bulk-download-everything` は案内しない | `search_law` の 1 件だけ |
| 版を読めない | `bulk DB の版を読めないため (schema_version: <値>)` | DB ファイルを消してから `houki-egov-mcp --bulk-download-everything` を実行すると本文を検索できること | `search_law` の 1 件だけ |

どの場合も `fallback` は切り替えた検索の応答そのもので、`source` は `api-fallback`。

例: `schema_version` が `2` の DB（0.18.x 以前で作った DB）で `{ keyword: "適格請求書" }` を呼ぶと、`source: "api-fallback"`、`note` は `bulk DB の版 (2) がこの houki-egov-mcp (3) より古いため、` で始まり `--bulk-download-everything` を含む、`next_actions[0].action: "bulk_download_everything"`。`schema_version` は `2` のまま（v0.18.x の「版が違えば作り直す」を 0.19.0 に残すと、MCP サーバーが全テーブルを消すことになる）。`schema_version` が `4` の DB では `note` が `bulk DB の版 (4) がこの houki-egov-mcp (3) より新しいため、` で始まり、`next_actions` は `[{ action: "search_law", … }]` の 1 件。
