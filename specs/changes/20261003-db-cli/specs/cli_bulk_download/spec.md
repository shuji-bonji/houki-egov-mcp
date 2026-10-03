# 差分: cli_bulk_download（20261003-db-cli）

`specs/current/cli_bulk_download/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 冒頭の「関連する Issue」に `houki-egov-mcp #58・#59・#60（0.19.0）` を足す
- 「処理の流れ」の図で、`B -- "はい・everything" --> C` を `B -- "はい・everything" --> V{"DB の状態（029・030）"}`、`V -- "使える" --> P{"by-date か"}`、`P -- いいえ --> C`、`P -- はい --> P1{"e-Gov に届くか（028）"}`、`P1 -- 届く --> C`、`V -- "使えない" --> E0["取得せずにエラーを出し exit 1（029・030）"]` にする。`D -- "いいえ" --> R` の前に `D -- "by-date で HTTP 404・500" --> Z0["差分なしを出し exit 0（028）"]` を足す。`H` の文を `行ごとに版の ID を作る。作れない行・列の足りない行は飛ばす（008・009）。本則が段落だけの法令も 1 行の本文にする（027）` にし、`N` の文を `全件の取り込みでは同期の状態を書く（017）。by-date では書かない（018）。途中の件数を表示する（019）` にする
- 「できないこと」に「`--bulk-download-by-date` で同期の状態（`last_sync_date` など）を進めること（SPEC-EGOV-CLI-BULK-DOWNLOAD-018。最新化は `--sync`）」を足す
- 「未決」の 2・3・4・5・6（→ #58・#59）の行を消す

## MODIFIED

### SPEC-EGOV-CLI-BULK-DOWNLOAD-011 取り込む法令の情報

1 つの版について、XML から法令名・法令番号・法令名の読み・略称（XML にあれば。無ければ空）・法令種別（例: `CabinetOrder`）を、CSV から版の ID・法令ID・施行日（`YYYY-MM-DD`）・未施行かどうかを取り込む。公布日は XML の `Law` の元号（`Era`）・年（`Year`）・月（`PromulgateMonth`）・日（`PromulgateDay`）から西暦の `YYYY-MM-DD` にする（例: 明治 5 年 11 月 9 日 → `1872-11-09`）。次のときは公布日を作れないので `NULL` にする（SPEC-EGOV-DB-SCHEMA-027）。

- 元号・年・月・日のどれかが XML に無い
- 元号が `Meiji`・`Taisho`・`Showa`・`Heisei`・`Reiwa` のどれでもない
- 年が 1 以上の整数でない

未施行の欄が `○` の版は「未施行」（`UnEnforced`）、それ以外は「現行」（`CurrentEnforced`）として入る。CSV に複数の法令があれば全部を入れる。

例: `PromulgateDay` の無い XML の法令は `promulgation_date` が `NULL`（v0.18.x では `0001-01-01`）。`Era="Meiji" Year="05" PromulgateMonth="11" PromulgateDay="09"` は `1872-11-09`。

### SPEC-EGOV-CLI-BULK-DOWNLOAD-017 全件の取り込みの後の同期の状態

`--bulk-download-everything` の取り込みが終わると、同期の状態（`--status` と `--sync` が読むもの）を次にする。基準の時刻は、全件の zip の取得を始めた時刻である。

- `last_sync_date`: 取得を始めた時刻の日本時間の日付（`YYYY-MM-DD`）
- `last_full_dl_at`: 取得を始めた時刻（ISO 8601、UTC の `Z` 付き）
- 法令の総数: CSV の行数
- 取り込み元: `all_xml`

例: 日本時間 2026-10-03 08:30（UTC 2026-10-02 23:30）に取得を始めると、`last_sync_date` は `2026-10-03`、`last_full_dl_at` は `2026-10-02T23:30:00.000Z`（ミリ秒は取得を始めた時刻のまま）。v0.18.x では取り込みを始めた時刻の UTC の日付を使ったので、日本時間の 0 時〜9 時に実行すると `last_sync_date` が前日になり、次の `--sync` が 1 日余分に確かめていた（#58）。

### SPEC-EGOV-CLI-BULK-DOWNLOAD-018 1 日分の差分の取り込みでは、同期の状態を変えない

`--bulk-download-by-date` は、同期の状態（`sync_state` の行）を作らず、書き換えない。`last_sync_date`・`last_full_dl_at`・法令の総数・取り込み元は、実行する前の値のまま残る。指定した日の差分を取り込んでも、その前後の日の差分を取り込んだことにはならないので、最新化の起点（`last_sync_date`）を動かさない。

例: `last_sync_date` が `2026-09-19` の DB で、2026-10-03 に `--bulk-download-by-date 20260801` を実行して法令 1 件を取り込むと、`last_sync_date` は `2026-09-19` のまま（v0.18.x では実行した日の `2026-10-03` になり、次の `--sync` が 9 月 20 日から 10 月 2 日までの差分を取り込まないまま最新と扱っていた。#58）。同期の状態が無い DB で実行しても、`sync_state` は 0 行のまま。

## ADDED

### SPEC-EGOV-CLI-BULK-DOWNLOAD-027 本則が段落だけの法令は、本則の段落を 1 行の本文として取り込む

XML の本則（`MainProvision`）が条（`Article`）を持たず段落（`Paragraph`）だけのときは、本則のすべての段落の文を改行でつないで、1 行の本文として取り込む。条番号は `MainProvision`、条の見出しと編章節の見出しは `NULL`。本文は SPEC-EGOV-CLI-BULK-DOWNLOAD-013 と同じく、検索用にそろえたものと原文の両方を持つ。本則に条が 1 つでもあれば、今までどおり条ごとに取り込み、この行は作らない。

例: 改暦ノ布告（`105DF0000000337`）の本則は `<Paragraph>` 1 つ（`今般改暦ノ儀別紙　詔書ノ通被　仰出候条此旨相達候事`）だけで、`article_num: "MainProvision"`、`body_raw` がこの文の行が 1 つ入る。`search_fulltext { keyword: "今般改暦ノ儀" }` はこの行を返す（v0.18.x では本則の行を作らないので 0 件。2026-10-03 12:06 JST に houki-egov-dev 0.17.0 の手元の DB で `count: 0` を確かめた。#59）。別表（`AppdxNote` の「（別紙）」）は今までどおり `Appendix1` の行になる。

### SPEC-EGOV-CLI-BULK-DOWNLOAD-028 `--bulk-download-by-date` は差分の無い日を「差分なし」として exit 0

`--bulk-download-by-date YYYYMMDD` は、zip を取得する前に e-Gov の一括ダウンロードのページ（`https://laws.e-gov.go.jp/bulkdownload/`、HEAD）に届くことを確かめる（`--sync` の SPEC-EGOV-CLI-SYNC-004 と同じ）。届かないときは SPEC-EGOV-CLI-SYNC-011 と同じ `[ERROR] …` を出して終了コード 1 で終わり、zip を取得しない。

届くことを確かめた後、その日の差分 zip の取得に HTTP 404 または 500 が返ったときは、取り直さずに（`HOUKI_EGOV_BULK_RETRY` によらず 1 回目の応答で）「差分なし」として扱う。標準エラー出力に `  差分なし (HTTP <status>)` を出し、取り込み（`[2/2]` の行）に進まずに終了コード 0 で終わる。DB は書き換えない。HTTP 503 など 404・500 以外の応答と通信の失敗は、今までどおり取り直し（SPEC-EGOV-CLI-BULK-DOWNLOAD-003）、使い切ったら SPEC-EGOV-CLI-BULK-DOWNLOAD-022 の `[ERROR]` で終了コード 1。

例: 差分の無い日曜日を指定して HTTP 500 が返ると、`[1/2] 差分 zip ダウンロード中...` の後に `  差分なし (HTTP 500)` を出して終了コード 0。差分 zip の取得は 1 回だけ（v0.18.x では `HOUKI_EGOV_BULK_RETRY` 回取り直してから `[ERROR] HTTP 500 …` で終了コード 1。#58）。

### SPEC-EGOV-CLI-BULK-DOWNLOAD-029 `--bulk-download-everything` は、取得の前に DB の状態を確かめる

`--bulk-download-everything` は、経過の 1・2 行目（SPEC-EGOV-CLI-BULK-DOWNLOAD-020）を出した後、zip を取得する前に DB の状態を確かめ、SPEC-EGOV-DB-SCHEMA-025 の表の `--bulk-download-everything` の列のとおりに扱う。

- 新しい版・読めない版・開けない DB のときは、zip を取得せずにエラーの文を出して終了コード 1 で終わる。DB は書き換えない
- 古い版（1・2）の DB のときは、`  DB の版 (<版>) が古いため、取得の後で作り直します（取り込んだ中身は消えます）` を出してから取得し、取得に成功した後で作り直して取り込む（SPEC-EGOV-DB-SCHEMA-016）
- ファイルが無い・版の記録が無い・版が同じのときは、今までどおり取得して取り込む

例: `schema_version` を `4` に書き換えた DB では、`[1/2] zip ダウンロード中...` を出さず、e-Gov へ 1 度も接続しないで終了コード 1。

### SPEC-EGOV-CLI-BULK-DOWNLOAD-030 `--bulk-download-by-date` は版が同じ DB にだけ取り込む

`--bulk-download-by-date` は、経過の 1・2 行目（SPEC-EGOV-CLI-BULK-DOWNLOAD-021）を出した後、e-Gov に届くかを確かめる前に DB の状態を確かめる。DB を作らず、作り直さない（SPEC-EGOV-DB-SCHEMA-025）。

- ファイルが無い・版の記録が無いときは、`[ERROR] DB がまだありません。先に houki-egov-mcp --bulk-download-everything を実行してください` を出して終了コード 1
- 古い版・新しい版・読めない版のときは、SPEC-EGOV-DB-SCHEMA-025 のエラーの文を出して終了コード 1
- 開けないときは `[ERROR] DB を開けません: <エラーの文>` で終了コード 1

どの場合も zip を取得しない。版が同じ DB のときだけ、SPEC-EGOV-CLI-BULK-DOWNLOAD-028 以降の処理に進む。

例: DB ファイルの無い場所で `--bulk-download-by-date 20260917` を実行すると、`[ERROR] DB がまだありません。…` を出して終了コード 1 で終わり、DB のファイルもフォルダーもできない（v0.18.x では DB を作って取り込み、`sync_state` に `last_sync_date` と `last_full_dl_at` がどちらも実行した日の UTC の日付（例: `2026-10-03`）の行を作ったので、その後の `--sync` は全件の取り込みが済んだものとして進んだ）。
