# 差分: cli_sync（20261004-ingest-redistributed-revisions）

`specs/current/cli_sync/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 冒頭の「関連する Issue」に `houki-egov-mcp #107（0.19.1）` を足す
- 「処理の流れ」の図の `Q -- ない --> Z["終わる"]` を `Q -- ない --> Z["件数をまとめて出し、状態の更新（020）と施行日を過ぎた未施行の版（021）を出して終わる"]` にする

## MODIFIED

### SPEC-EGOV-CLI-SYNC-006 差分のある日は取り込み、1 日ごとに `last_sync_date` を進める

差分 zip を取得できた日は、その zip を DB に取り込み（取り込みのしかたは `--bulk-download-by-date` と同じ。cli_bulk_download の SPEC-EGOV-CLI-BULK-DOWNLOAD-007〜016 と 031。中身が前回と同じ未施行の版が、未施行の欄を空にして届いたときは状態だけを現行にする）、その日を確認済みにする。確認済みにするたびに、同期の状態を次にする。取り込んだ zip はその日のうちに消す。

- `last_sync_date`: 確認済みにした日
- `last_full_dl_at`: 前の全件の取り込みの時刻のまま
- 法令の総数: その時点の DB にある法令の数
- 取り込み元: `incremental`

例: `last_sync_date` が `2026-09-16` で、2026-09-16 と 2026-09-19 は差分なし、2026-09-17 と 2026-09-18 は差分ありのとき、4 日とも確認済みになり、`last_sync_date` は `2026-09-19` になる。消す zip は 09-17 と 09-18 の 2 つ。

例: `last_sync_date` が今日と同じ日のときも、その日の差分を取得し直す（SPEC-EGOV-CLI-SYNC-002）ので、施行日の当日の午前に同期して配り直しを取り込めなかった版も、次の `--sync` でその日の差分から状態が直る。

## ADDED

### SPEC-EGOV-CLI-SYNC-020 状態だけを書き換えた版があれば、まとめの後に 1 行出す

すべての日を確認済みにして終わったとき（SPEC-EGOV-CLI-SYNC-014・015）、取り込んだ日の `status_changed`（SPEC-EGOV-CLI-BULK-DOWNLOAD-031 で状態だけを書き換えた版の数）の合計が 1 以上なら、`  last_sync_date: <last_sync_date>` の行のすぐ後に、標準エラー出力に次の 1 行を出す。0 のときは出さない。`[完了]` の行・1 日ごとの行（SPEC-EGOV-CLI-SYNC-016）・`  last_sync_date:` の行の形は変えない。終了コードは 0 のまま。

```
  状態の更新: <status_changed の合計> 件 (条の本文はそのまま、未施行 (UnEnforced) だった版の状態だけを書き換え)
```

`status_changed` の版は `unchanged` にも数えるので、`[完了]` の行の `<n> 件 unchanged` と、SPEC-EGOV-CLI-SYNC-015 の `確認した <n> 件はすべて取り込み済み` の数に含まれる。

例: 2026-10-01 の 1 日だけを確かめ、その日の差分で法令 338 件を upsert し、配り直された 5 版の状態を書き換えたときは、`[完了] 1 日分を確認 (2026-10-01 〜 2026-10-01)、1 日に差分あり: 338 件 upsert, 5 件 unchanged。全体 <時間>`、`  last_sync_date: 2026-10-01`、`  状態の更新: 5 件 (条の本文はそのまま、未施行 (UnEnforced) だった版の状態だけを書き換え)` を出す（件数は houki-egov-mcp #107 の実測の 338・5 を当てはめたもの。0.19.1 で実行した値ではない）。

### SPEC-EGOV-CLI-SYNC-021 施行日を過ぎても未施行のままの版があれば `[WARN]` で全件の取り込みを案内する

すべての日を確認済みにして終わったとき（SPEC-EGOV-CLI-SYNC-014・015・018）、DB の `laws` のうち、`current_revision_status` が `UnEnforced` で、`amendment_enforcement_date` が終わった時点の `last_sync_date` より前（同じ日を含まない）の版を数える。1 件以上なら、最後の行（SPEC-EGOV-CLI-SYNC-020 の行があればその後、無ければ `  last_sync_date:` の行の後）に、標準エラー出力に次の 1 行を出す。0 件なら出さない。終了コードは 0 のまま変えない。途中で止まったとき（SPEC-EGOV-CLI-SYNC-012・013）と、DB を使えないとき（009・010・019）は数えず、出さない。

```
[WARN] 施行日が last_sync_date (<last_sync_date>) より前なのに未施行 (UnEnforced) のままの版が <件数> 件あります。houki-egov-mcp --bulk-download-everything を 1 回実行すると直ります（全件の zip 約 290 MB を取得します。条の本文は入れ直しません）
```

比べる日は今日ではなく `last_sync_date` で、同じ日を含まない。e-Gov は施行日の当日の差分を当日の 15 時ごろに作るので、施行日の当日の午前の同期では、配り直しがまだ届いていない版を数えないため。`amendment_enforcement_date` が `NULL` の版は数えない。

v0.19.0 で、施行日の翌日以降の `--sync` まで進めた DB は、その施行日の差分を確かめ直さないので、0.19.1 に上げた後の `--sync` でもこの件数が残る。`--bulk-download-everything` で SPEC-EGOV-CLI-BULK-DOWNLOAD-031・033 により直る。

例: 2026-10-05 に施行日を迎える未施行の版が 5 つある DB を、v0.19.0 の `--sync` で 2026-10-06 まで進め（`last_sync_date: 2026-10-06`）、0.19.1 に上げて 2026-10-07 に `--sync` を実行すると、10-06 と 10-07 の差分だけを確かめるので 5 版は `UnEnforced` のまま残り、`[WARN] 施行日が last_sync_date (2026-10-07) より前なのに未施行 (UnEnforced) のままの版が 5 件あります。…` を出して終了コード 0（件数は 2026-10-04 JST に shuji の DB で数えた施行日 2026-10-05 の版の数を当てはめたもの。0.19.1 で実行した値ではない）。全件の zip から作った直後の DB（2026-10-03 作成）では、施行日が 2026-10-04 以前の `UnEnforced` の版は 0 件だった（houki-egov-mcp #107 の本文）ので、この行は出ない。
