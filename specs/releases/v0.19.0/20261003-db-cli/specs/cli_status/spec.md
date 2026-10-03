# 差分: cli_status（20261003-db-cli）

`specs/current/cli_status/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 冒頭の「関連する Issue」に `houki-egov-mcp #60・#61（0.19.0）` を足す
- 「入力」の表に `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS`（任意。警告の文に出す日数。既定 90。SPEC-EGOV-CLI-STATUS-004）の行を足す
- 「処理の流れ」の図の先頭を `A["--status"] --> A1["版と DB の場所を出す"]`、`A1 --> V{"DB の状態（010・011）"}`、`V -- "ファイルが無い・版の記録が無い" --> N0["作らずに DB が無いことを出し exit 0（010）"]`、`V -- "版が古い・新しい・読めない" --> E0["書き込まずにエラーを出し exit 1（011）"]`、`V -- "開けない" --> E1["exit 1（006）"]`、`V -- "版が同じ" --> B["法令の数（と版の数）と条の件数を出す（005）"]` にする（`A --> B` と `B` の元の文を置き換える）
- 「できないこと」に「DB を作ること・作り直すこと（`--bulk-download-everything`。SPEC-EGOV-DB-SCHEMA-025）」を足す
- 「未決」の 3・4・5（→ #60・#61）の行を消す

## MODIFIED

### SPEC-EGOV-CLI-STATUS-004 `outdated` のときだけ最新化の警告を出す

`staleness` が `outdated` のときは、次の警告を出す。`<上限>` は `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS` の値（既定 90。`--sync` が差分で追える日数の上限。SPEC-EGOV-CLI-SYNC-003）。

```
  ⚠ bulk DB が <日数> 日前のデータです。最新化するには `houki-egov-mcp --sync` (最終同期から <上限> 日を超えていれば `--bulk-download-everything`) を実行してください
```

`fresh` と `stale` のときはこの警告を出さない。

例: `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS=60` で、`last_sync_date` が 38 日前の DB では、警告に `(最終同期から 60 日を超えていれば` が入る。環境変数が無いときは `(最終同期から 90 日を超えていれば`（v0.18.x では環境変数によらず 90。#61）。

### SPEC-EGOV-CLI-STATUS-005 版・DB の場所・件数と同期の欄を標準出力に出して exit 0

版が同じ DB（SPEC-EGOV-DB-SCHEMA-025）のとき、`--status` は次の行を順に標準出力に出し、終了コード 0 で終わる。標準エラー出力には何も出さない。

1. `[status] <パッケージ名> v<版>`
2. `  DB: <DB ファイルの場所>`（`HOUKI_EGOV_DB_PATH` を指定していればその値）
3. `  laws:     <法令の数> (版: <版の数>)`。法令の数は `laws` の `law_id` の種類の数、版の数は `laws` の行の数（前の版・未施行の版を含む）
4. `  articles: <条の行の件数>`
5. 同期の欄（同期の状態が無ければ SPEC-EGOV-CLI-STATUS-001 の 1 行。あれば `  sync:` の行に続けて、`    last_sync_date:  <値>`・`    last_full_dl_at: <値>`・`    days_since_sync: <日数>`・`    staleness:       <古さ>` の 4 行）

例: `HOUKI_EGOV_DB_PATH=/tmp/x/laws.db` で、法令 1 件（版 1 つ）・条 2 件を取り込み、`last_sync_date` が `2026-05-08`、`last_full_dl_at` が `2026-05-01T03:00:00.000Z` の DB に、2026-05-09（日本時間）に実行すると、標準出力は次のとおりで終了コードは 0。

```
[status] @shuji-bonji/houki-egov-mcp v0.19.0
  DB: /tmp/x/laws.db
  laws:     1 (版: 1)
  articles: 2
  sync:
    last_sync_date:  2026-05-08
    last_full_dl_at: 2026-05-01T03:00:00.000Z
    days_since_sync: 1
    staleness:       fresh
  差分を取り込むには --sync を実行してください
```

同じ法令の現行の版と前の版の 2 行がある DB では `  laws:     1 (版: 2)`（v0.18.x では `  laws:     2` と出し、版の数を法令の数のように見せていた。#61）。同期の状態が無く空の DB なら、`  laws:     0 (版: 0)`・`  articles: 0` に続けて `  sync:     (まだ bulk DL されていません — --bulk-download-everything を実行)` を出して終了コード 0。

### SPEC-EGOV-CLI-STATUS-008 件数の 3 桁の区切りは環境の言語設定によらず `,`

SPEC-EGOV-CLI-STATUS-005 の 3・4 行目に出す法令の数・版の数・条の件数は、1,000 以上のとき 3 桁ごとに `,` で区切る（`1,234,567`）。区切りの文字は、実行する環境の言語設定（`LANG`・`LC_ALL` など）によらず `,` で、小数点や桁の区切りにほかの文字を使う言語設定（`de_DE.UTF-8` など）でも変わらない。1,000 未満の件数は区切りなし（`0`・`1`・`999`）。

例: 法令 1,234 件（どれも版 1 つ）・条の行が 5 件の DB では、環境の言語設定が英語（`en_US`）でもドイツ語（`de_DE`）でも、`  laws:     1,234 (版: 1,234)` と `  articles: 5` を出す。

（v0.15.3 までは、環境の言語設定に従って区切っていたため、`LANG=de_DE.UTF-8` では `1.234.567` になった。houki-egov-mcp #74）

## ADDED

### SPEC-EGOV-CLI-STATUS-010 DB が無いときは作らずに、そのことを出して exit 0

DB のファイルが無いとき（置き場所のフォルダーも無いときを含む）と、ファイルはあるが版の記録が無いときは、1・2 行目（`[status] …` と `  DB: …`）の後に `  (DB がまだありません — houki-egov-mcp --bulk-download-everything で作ります)` を標準出力に出し、件数と同期の欄を出さずに終了コード 0 で終わる。DB のファイル・フォルダー・テーブルを作らない（SPEC-EGOV-DB-SCHEMA-025）。

例: `HOUKI_EGOV_DB_PATH=<空のフォルダー>/a/laws.db` で `--status` を実行すると、標準出力は `[status] …`・`  DB: <空のフォルダー>/a/laws.db`・`  (DB がまだありません — houki-egov-mcp --bulk-download-everything で作ります)` の 3 行で終了コード 0、終わった後も `<空のフォルダー>/a` は無い（v0.18.x では `a/laws.db` を作ってから `laws:     0` を出し、ファイルが残った。#60）。

### SPEC-EGOV-CLI-STATUS-011 版が同じでない DB には書き込まずに exit 1

古い版・新しい版・読めない版の DB のときは、1・2 行目を標準出力に出した後、SPEC-EGOV-DB-SCHEMA-025 のエラーの文を標準エラー出力に出し、件数と同期の欄を出さずに終了コード 1 で終わる。DB を作り直さず、書き換えない。

例: `schema_version` が `2` の DB で `--status` を実行すると、`[ERROR] DB の版 (2) が古いため使えません。houki-egov-mcp --bulk-download-everything で作り直してください（…）` を出して終了コード 1 で、`schema_version` は `2` のまま、`laws` の行も残る（0.19.0 に上げた直後の利用者の DB はこの状態になる。v0.18.x の「版が違えば作り直す」をそのまま使うと、`--status` を実行しただけで取り込んだ中身が消える）。
