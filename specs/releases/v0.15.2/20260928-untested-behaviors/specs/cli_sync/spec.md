# 差分: cli_sync（20260928-untested-behaviors）

`specs/current/cli_sync/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-CLI-SYNC-009 全件の取り込みがまだなら、それを促して exit 1

同期の状態が無いとき（SPEC-EGOV-CLI-SYNC-001）は、標準エラー出力に `[sync] 差分同期` と `  DB: <DB ファイルの場所>` を出した後、`[sync] まだ全件取り込みが行われていません。先に --bulk-download-everything を実行してください` を出し、終了コード 1 で終わる。

例: `--bulk-download-everything` をしていない空の DB で `--sync` を実行すると、e-Gov へ 1 度も接続せずに上の文を出して終了コード 1。

### SPEC-EGOV-CLI-SYNC-010 上限の日数を超えていたら、全件の取り込みを促して exit 1

`last_sync_date` から今日までの日数が上限を超えているとき（SPEC-EGOV-CLI-SYNC-003）は、標準エラー出力に `[sync] last_sync_date <last_sync_date> から <日数> 日空いています。日次差分の公開範囲 (<上限> 日) を超えているので、--bulk-download-everything を実行してください` を出し、終了コード 1 で終わる。`<上限>` は `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS` の値（既定 90）。

例: 日本時間 2026-09-19 に `last_sync_date` が `2026-05-01` の DB で実行すると `[sync] last_sync_date 2026-05-01 から 141 日空いています。日次差分の公開範囲 (90 日) を超えているので、--bulk-download-everything を実行してください` を出して終了コード 1。`HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS=1` で `last_sync_date` が `2026-09-17` なら `… から 2 日空いています。日次差分の公開範囲 (1 日) を超えているので …`。

### SPEC-EGOV-CLI-SYNC-011 e-Gov に届かなければ `[ERROR]` を出して exit 1

SPEC-EGOV-CLI-SYNC-004 で e-Gov の一括ダウンロードのページ（`https://laws.e-gov.go.jp/bulkdownload/`、HEAD）に届かないときは、標準エラー出力に `[ERROR] <エラーの文>` を出して終了コード 1 で終わる。ページが 2xx 以外を返したときの文は `e-Gov に接続できません (HTTP <status> from https://laws.e-gov.go.jp/bulkdownload/)`、通信そのものが失敗したときは通信の失敗の文になる。

例: HEAD に HTTP 503 が返ると `[ERROR] e-Gov に接続できません (HTTP 503 from https://laws.e-gov.go.jp/bulkdownload/)` を出して終了コード 1。HEAD が `TypeError('fetch failed')` で失敗すると `[ERROR] fetch failed` を出して終了コード 1。どちらも差分 zip は 1 つも取得しない。

### SPEC-EGOV-CLI-SYNC-012 確認済みの日の後で止まったら、記録した日を出して exit 1

SPEC-EGOV-CLI-SYNC-007 で止まったとき、それより前に確認済みにした日が 1 日以上あれば、標準エラー出力に次の 2 行を出して終了コード 1 で終わる。

```
[ERROR] <止まった日>: <エラーの文>
  <last_sync_date> までを last_sync_date に記録しました (<確認済みの日数> 日分を確認、<upsert の件数> 件 upsert)。再実行すると続きから同期します
```

例: 日本時間 2026-09-19 に `last_sync_date` が `2026-09-16` の DB で実行し、2026-09-16 は差分なし（HTTP 500）、2026-09-17 は法令 1 件の差分、2026-09-18 は HTTP 503 のとき、`[ERROR] 2026-09-18: HTTP 503 <statusText> from https://laws.e-gov.go.jp/bulkdownload?file_section=3&update_date=20260918&only_xml_flag=true` と `  2026-09-17 までを last_sync_date に記録しました (2 日分を確認、1 件 upsert)。再実行すると続きから同期します` を出して終了コード 1。

### SPEC-EGOV-CLI-SYNC-013 最初の日で止まったら、`last_sync_date` が変わらないことを出して exit 1

SPEC-EGOV-CLI-SYNC-007 で止まったのが最初の日（確認済みの日が 0 日）のときは、標準エラー出力に `[ERROR] <止まった日>: <エラーの文>` と `  last_sync_date は <last_sync_date> のままです` を出して終了コード 1 で終わる。

例: 日本時間 2026-09-19 に `last_sync_date` が `2026-09-18` の DB で実行し、2026-09-18 の取得に HTTP 503 が返ると、`[ERROR] 2026-09-18: HTTP 503 …` と `  last_sync_date は 2026-09-18 のままです` を出して終了コード 1。

### SPEC-EGOV-CLI-SYNC-014 差分を取り込んで終わったら、件数をまとめて exit 0

すべての日を確認済みにして終わったときは、標準エラー出力に次の 2 行を出して終了コード 0 で終わる。

```
[完了] <確認した日数> 日分を確認 (<最初の日> 〜 <今日>)、<まとめ>。全体 <時間>
  last_sync_date: <last_sync_date>
```

`<まとめ>` は、次を `、` でつないだもの。

- upsert が 1 件以上なら `<取り込んだ日数> 日に差分あり: <upsert の件数> 件 upsert, <unchanged の件数> 件 unchanged`（取り込んだ日数は、差分 zip を取得して取り込んだ日の数）
- 差分なしの日があれば `<差分なしの日数> 日は差分なし`
- XML を読めず飛ばした法令があれば `<件数> 件は XML を読めず skip`

例: 日本時間 2026-09-19 に `last_sync_date` が `2026-09-17` の DB で実行し、09-17 と 09-19 は差分なし、09-18 は法令 1 件の差分のとき、`[完了] 3 日分を確認 (2026-09-17 〜 2026-09-19)、1 日に差分あり: 1 件 upsert, 0 件 unchanged、2 日は差分なし。全体 <時間>` と `  last_sync_date: 2026-09-19` を出して終了コード 0。

### SPEC-EGOV-CLI-SYNC-015 新たに取り込んだ法令が無く終わったときのまとめ

すべての日を確認済みにして終わり、upsert が 0 件のときは、SPEC-EGOV-CLI-SYNC-014 の `<まとめ>` の最初を次にする（差分なしの日数と skip の件数は 014 と同じく続ける）。終了コードは 0。

- unchanged が 1 件以上: `新たに取り込んだ法令はありません (確認した <unchanged の件数> 件はすべて取り込み済み)`
- unchanged も 0 件: `新たに取り込んだ法令はありません`

例:
- 09-18 と 09-19 がどちらも差分なし（HTTP 404）なら `[完了] 2 日分を確認 (2026-09-18 〜 2026-09-19)、新たに取り込んだ法令はありません、2 日は差分なし。全体 <時間>`
- 取り込み済みの法令 1 件だけを含む差分が 09-18 と 09-19 にあれば `[完了] 2 日分を確認 (2026-09-18 〜 2026-09-19)、新たに取り込んだ法令はありません (確認した 2 件はすべて取り込み済み)。全体 <時間>`
- 09-19 の差分が、取り込み済みの法令 1 件と壊れた XML の法令 1 件なら `[完了] 1 日分を確認 (2026-09-19 〜 2026-09-19)、新たに取り込んだ法令はありません (確認した 1 件はすべて取り込み済み)、1 件は XML を読めず skip。全体 <時間>`

### SPEC-EGOV-CLI-SYNC-016 1 日ごとの行の形

SPEC-EGOV-CLI-SYNC-008 の 1 日ごとの行は、標準エラー出力に次の形で出す。`<n>` は何日目か（1 から）、`<N>` は確かめる日の数。

- 差分なしの日: `  [<n>/<N>] <日付>: 差分なし`
- 取り込んだ日: `  [<n>/<N>] <日付>: <n> 件 upsert[, <n> 件 unchanged][, <n> 件 failed] (<zip のサイズ>, <時間>)`（`unchanged` と `failed` は 0 件なら出さない。upsert は 0 件でも出す）

止まった日の行は出さない（SPEC-EGOV-CLI-SYNC-012・013 の `[ERROR]` の行を出す）。

例: 3 日を確かめ、2 日目に法令 1 件の差分（zip 1.8 KB）があると `  [1/3] 2026-09-17: 差分なし`、`  [2/3] 2026-09-18: 1 件 upsert (1.8 KB, <時間>)`、`  [3/3] 2026-09-19: 差分なし`。取り込み済みの法令 1 件と壊れた XML の法令 1 件の日は `  [1/1] 2026-09-19: 0 件 upsert, 1 件 unchanged, 1 件 failed (2.2 KB, <時間>)`。

### SPEC-EGOV-CLI-SYNC-017 `--bulk-download-incremental` は `--sync` と同じ

最初の引数が `--bulk-download-incremental` のときも、`--sync` と同じ処理をし、同じ表示・同じ終了コードで終わる。

例: SPEC-EGOV-CLI-SYNC-014 の例と同じ DB と応答で `--bulk-download-incremental` を実行すると、同じ `[完了] 3 日分を確認 (2026-09-17 〜 2026-09-19)、…` を出して終了コード 0 で終わり、`last_sync_date` は `2026-09-19` になる。

### SPEC-EGOV-CLI-SYNC-018 `last_sync_date` が今日より後なら、何も取得せず exit 0

`last_sync_date` が今日（日本時間）より後の日付のときは、確かめる日が 0 日になり、e-Gov へ接続せず（SPEC-EGOV-CLI-SYNC-004 の確認もしない）、`last_sync_date` を変えずに、`[完了] 0 日分を確認 (<last_sync_date> 〜 <今日>)、新たに取り込んだ法令はありません。全体 <時間>` と `  last_sync_date: <last_sync_date>` を出して終了コード 0 で終わる。

例: 日本時間 2026-09-19 に `last_sync_date` が `2026-09-25` の DB で実行すると、`[完了] 0 日分を確認 (2026-09-25 〜 2026-09-19)、新たに取り込んだ法令はありません。全体 <時間>` と `  last_sync_date: 2026-09-25` を出して終了コード 0。
