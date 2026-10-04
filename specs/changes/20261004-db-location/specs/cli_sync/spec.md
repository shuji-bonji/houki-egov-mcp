# 差分: cli_sync（20261004-db-location）

`specs/current/cli_sync/spec.md` に対する差分です。

- `MODIFIED` は、見出しの行（題）も含めて、current の同じ ID の見出しと本文をこの差分の見出しと本文に置き換える
- 冒頭の「関連する Issue」に `houki-egov-mcp #108（0.20.0）` を足す
- SPEC-EGOV-CLI-SYNC-009・010 の文（`先に --bulk-download-everything を実行してください` など、フラグだけを書いた文）は変えない（SPEC-EGOV-DB-SCHEMA-029 の「この形にしない」箇所）

## MODIFIED

### SPEC-EGOV-CLI-SYNC-019 版が同じでない DB には書き込まずに exit 1

`--sync`（と `--bulk-download-incremental`）は、`[sync] 差分同期` と `  DB: …` の 2 行を出した後、e-Gov に届くかを確かめる前に DB の状態を確かめる。古い版・新しい版・読めない版の DB のときは SPEC-EGOV-DB-SCHEMA-025 のエラーの文を、開けない DB のときは `[ERROR] DB を開けません: <エラーの文>` を標準エラー出力に出し、DB を書き換えず、差分を取得せずに終了コード 1 で終わる。

例: 環境変数を付けずに、`schema_version` が `2` の DB（v0.18.x で作った DB）で `--sync` を実行すると、`[ERROR] DB の版 (2) が古いため使えません。npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything で作り直してください（取り込んだ中身は消え、全件の zip 約 290 MB を取り直します）` を出して終了コード 1（v0.19.x では `houki-egov-mcp --bulk-download-everything で作り直してください`）。`schema_version` は `2` のまま、`laws` の行も残る（0.19.0 に上げた直後の利用者の DB はこの状態になる）。

### SPEC-EGOV-CLI-SYNC-021 施行日を過ぎても未施行のままの版があれば `[WARN]` で全件の取り込みを案内する

すべての日を確認済みにして終わったとき（SPEC-EGOV-CLI-SYNC-014・015・018）、DB の `laws` のうち、`current_revision_status` が `UnEnforced` で、`amendment_enforcement_date` が終わった時点の `last_sync_date` より前（同じ日を含まない）の版を数える。1 件以上なら、最後の行（SPEC-EGOV-CLI-SYNC-020 の行があればその後、無ければ `  last_sync_date:` の行の後）に、標準エラー出力に次の 1 行を出す。0 件なら出さない。終了コードは 0 のまま変えない。途中で止まったとき（SPEC-EGOV-CLI-SYNC-012・013）と、DB を使えないとき（009・010・019）は数えず、出さない。`<コマンド>` は `--bulk-download-everything` を付けた案内のコマンド（SPEC-EGOV-DB-SCHEMA-029）。

```
[WARN] 施行日が last_sync_date (<last_sync_date>) より前なのに未施行 (UnEnforced) のままの版が <件数> 件あります。<コマンド> を 1 回実行すると直ります（全件の zip 約 290 MB を取得します。条の本文は入れ直しません）
```

比べる日は今日ではなく `last_sync_date` で、同じ日を含まない。e-Gov は施行日の当日の差分を当日の 15 時ごろに作るので、施行日の当日の午前の同期では、配り直しがまだ届いていない版を数えないため。`amendment_enforcement_date` が `NULL` の版は数えない。

v0.19.0 で、施行日の翌日以降の `--sync` まで進めた DB は、その施行日の差分を確かめ直さないので、0.19.1 に上げた後の `--sync` でもこの件数が残る。`--bulk-download-everything` で SPEC-EGOV-CLI-BULK-DOWNLOAD-031・033 により直る。

例: 2026-10-05 に施行日を迎える未施行の版が 5 つある DB を、v0.19.0 の `--sync` で 2026-10-06 まで進め（`last_sync_date: 2026-10-06`）、0.19.1 以降に上げて 2026-10-07 に環境変数を付けずに `--sync` を実行すると、10-06 と 10-07 の差分だけを確かめるので 5 版は `UnEnforced` のまま残り、`[WARN] 施行日が last_sync_date (2026-10-07) より前なのに未施行 (UnEnforced) のままの版が 5 件あります。npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything を 1 回実行すると直ります（…）` を出して終了コード 0（件数は 2026-10-04 JST に shuji の DB で数えた施行日 2026-10-05 の版の数を当てはめたもの。実行した値ではない。v0.19.1 ではコマンドが `houki-egov-mcp --bulk-download-everything`）。`HOUKI_EGOV_DB_PATH=/Users/bonji/.cache/houki-egov-mcp/laws.dev.db` を付けて実行したとき（ホームディレクトリが `/Users/bonji`）は、コマンドが `HOUKI_EGOV_DB_PATH="$HOME/.cache/houki-egov-mcp/laws.dev.db" npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything` になる。全件の zip から作った直後の DB（2026-10-03 作成）では、施行日が 2026-10-04 以前の `UnEnforced` の版は 0 件だった（houki-egov-mcp #107 の本文）ので、この行は出ない。
