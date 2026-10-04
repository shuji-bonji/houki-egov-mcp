# 差分: cli_bulk_download（20261004-db-location）

`specs/current/cli_bulk_download/spec.md` に対する差分です。

- `MODIFIED` は、見出しの行（題）も含めて、current の同じ ID の見出しと本文をこの差分の見出しと本文に置き換える
- 冒頭の「関連する Issue」に `houki-egov-mcp #108（0.20.0）` を足す
- 「アクター」の `houki-egov-mcp --bulk-download-everything` は変えない（コマンドの名前を示す文で、案内のコマンドではない）

## MODIFIED

### SPEC-EGOV-CLI-BULK-DOWNLOAD-030 `--bulk-download-by-date` は版が同じ DB にだけ取り込む

`--bulk-download-by-date` は、経過の 1・2 行目（SPEC-EGOV-CLI-BULK-DOWNLOAD-021）を出した後、e-Gov に届くかを確かめる前に DB の状態を確かめる。DB を作らず、作り直さない（SPEC-EGOV-DB-SCHEMA-025）。

- ファイルが無い・版の記録が無いときは、`[ERROR] DB がまだありません。先に <コマンド> を実行してください` を出して終了コード 1。`<コマンド>` は `--bulk-download-everything` を付けた案内のコマンド（SPEC-EGOV-DB-SCHEMA-029）
- 古い版・新しい版・読めない版のときは、SPEC-EGOV-DB-SCHEMA-025 のエラーの文を出して終了コード 1
- 開けないときは `[ERROR] DB を開けません: <エラーの文>` で終了コード 1

どの場合も zip を取得しない。版が同じ DB のときだけ、SPEC-EGOV-CLI-BULK-DOWNLOAD-028 以降の処理に進む。

例: 環境変数を付けずに、DB ファイルの無い場所で `--bulk-download-by-date 20260917` を実行すると、`[ERROR] DB がまだありません。先に npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything を実行してください` を出して終了コード 1 で終わり、DB のファイルもフォルダーもできない（v0.19.x ではコマンドが `houki-egov-mcp --bulk-download-everything`。v0.18.x では DB を作って取り込み、`sync_state` に `last_sync_date` と `last_full_dl_at` がどちらも実行した日の UTC の日付（例: `2026-10-03`）の行を作ったので、その後の `--sync` は全件の取り込みが済んだものとして進んだ）。
