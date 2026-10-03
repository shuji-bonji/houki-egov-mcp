# 差分: cli_entry（20261003-db-cli-followup）

`specs/current/cli_entry/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 差分 `20261003-db-cli` を取り込んだ後の current に当てる（あちらは 008・009 の ADDED。番号はその続き）
- 冒頭の「関連する Issue」に `houki-egov-mcp #102（0.19.0）` を足す
- 「入力」の表の下に、環境変数の表を足す

| 環境変数 | 使う処理 | 既定 | 受け付ける値 |
| --- | --- | --- | --- |
| `HOUKI_EGOV_BULK_RETRY` | 一括ダウンロードの zip の取得（cli_bulk_download・cli_sync） | 3 | 1 以上の整数 |
| `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS` | `--sync` の上限の日数、`--status` と `search_fulltext` の警告の日数 | 90 | 1 以上の整数 |
| `HOUKI_EGOV_CONCURRENCY` | e-Gov 法令 API への同時リクエスト数の上限（MCP サーバーのツール） | 4 | 1 以上の整数 |

- 「処理の流れ」の図で、`C -- "--bulk-download-everything / …"` の先（009 の余分な引数の確認の後）に `Z{"数値の環境変数が 1 以上の整数か（010）"}`、`Z -- いいえ --> Z1["エラーを出し exit 2（010）"]`、`Z -- はい --> O` を挟む。`B -- ない --> S` を `B -- ない --> S0["不正な数値の環境変数は警告を出して既定値を使う（011）"] --> S` にする

## MODIFIED

### SPEC-EGOV-CLI-ENTRY-002 `--help` と `-h` は使い方を出して exit 0

最初の引数が `--help` または `-h` のときは、使い方を標準出力に出し、MCP サーバーを起動せずに終了コード 0 で終わる。使い方には、各フラグ（`--bulk-download-everything` / `--sync` / `--bulk-download-by-date YYYYMMDD` / `--status` / `--version` / `--help`）と環境変数 `HOUKI_EGOV_DB_PATH` / `HOUKI_EGOV_BULK_RETRY` / `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS` / `HOUKI_EGOV_CONCURRENCY` の説明が並ぶ。数値の 3 つには「1 以上の整数」と既定値を書く。`--help` は環境変数の値を検査しない（SPEC-EGOV-CLI-ENTRY-010）。

例: 使い方に `HOUKI_EGOV_CONCURRENCY` の行がある（v0.18.x の使い方には無かった。#102）。

## ADDED

### SPEC-EGOV-CLI-ENTRY-010 CLI は数値の環境変数が 1 以上の整数でなければ、何もせずに exit 2

最初の引数が `--bulk-download-everything`・`--bulk-download-by-date`・`--sync`・`--bulk-download-incremental`・`--status` のときは、引数の検査（SPEC-EGOV-CLI-ENTRY-009、SPEC-EGOV-CLI-BULK-DOWNLOAD-001）の後、DB を開く前・e-Gov に接続する前に、`HOUKI_EGOV_BULK_RETRY`・`HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS`・`HOUKI_EGOV_CONCURRENCY` の値を確かめる。どのコマンドでも 3 つとも確かめる（そのコマンドが使わない変数も）。

- 無い・空文字: 既定値を使う
- `1` 以上の整数を 10 進の数字だけで書いたもの（`^[1-9][0-9]*$`）: その値を使う
- それ以外（`0`・負の数・小数・`abc`・`90days`・前後の空白を含むもの）: 標準エラー出力に `ERROR: <変数名> は 1 以上の整数で指定してください: <値>` を出し、終了コード 2 で終わる。値が不正な変数が複数あるときは、上の順で最初の 1 つだけを出す

`--help`・`-h`・`--version`・`-v` は値を確かめない。

例: `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS=-5 houki-egov-mcp --sync` は `ERROR: HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS は 1 以上の整数で指定してください: -5` を出して終了コード 2 で、DB を開かず e-Gov にも接続しない（v0.18.x では上限 `-5` で計算し、毎回「日次差分の公開範囲 (-5 日) を超えている」で終了コード 1）。`HOUKI_EGOV_BULK_RETRY=0` は v0.18.x では既定の 3 として動いたが、0.19.0 では同じエラーで終了コード 2。`HOUKI_EGOV_BULK_RETRY=1.5 houki-egov-mcp --status` も終了コード 2（`--status` は取得しないが、3 つとも確かめる）。`HOUKI_EGOV_BULK_RETRY=abc houki-egov-mcp --help` は使い方を出して終了コード 0。

### SPEC-EGOV-CLI-ENTRY-011 MCP サーバーは不正な数値の環境変数に既定値を使い、警告を出して起動する

引数なしで MCP サーバーとして起動するときは、SPEC-EGOV-CLI-ENTRY-010 と同じ 3 つの環境変数を確かめる。1 以上の整数でない値（空文字と無いときは除く）は、その変数の既定値（`HOUKI_EGOV_BULK_RETRY` は 3、`HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS` は 90、`HOUKI_EGOV_CONCURRENCY` は 4）に置き換え、変数ごとに標準エラー出力へ `[server] 警告: <変数名> は 1 以上の整数で指定してください: <値>（既定値 <既定値> を使います）` を 1 行出して、起動を続ける（`[server] … started` の行より前）。終了しない。

例: `HOUKI_EGOV_CONCURRENCY=-1` で起動すると、`[server] 警告: HOUKI_EGOV_CONCURRENCY は 1 以上の整数で指定してください: -1（既定値 4 を使います）` を出して起動し、e-Gov への同時リクエスト数の上限は 4（v0.18.x では `createLimit: concurrency must be >= 1, got -1` の例外で、ツールを呼ぶ前に起動に失敗した。コードを読んで分かったことで、実行して確かめていない）。`HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS=abc` で起動すると警告を出して 90 を使い、`search_fulltext` の `freshness.warning` は `最終同期から 90 日を超えていれば`（SPEC-EGOV-SEARCH-FULLTEXT-023）。
