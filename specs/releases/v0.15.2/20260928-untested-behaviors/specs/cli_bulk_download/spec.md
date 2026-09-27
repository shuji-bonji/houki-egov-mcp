# 差分: cli_bulk_download（20260928-untested-behaviors）

`specs/current/cli_bulk_download/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-CLI-BULK-DOWNLOAD-020 全件の取り込みが終わると、経過を標準エラー出力に出して exit 0

`--bulk-download-everything` の取得と取り込みが終わると、終了コード 0 で終わる。経過は標準エラー出力に次の順で出し、標準出力には何も出さない。

1. `[bulk-download-everything] 全件 zip を取得します`
2. `  保存先 zip: <一時フォルダーの中の all_xml.zip>`、`  DB:         <DB ファイルの場所>`
3. `[1/2] zip ダウンロード中...`
4. `  DL 完了: <サイズ> / <時間> / attempts=<試した回数>`
5. `[2/2] DB に ingest 中...`
6. `  ingest 完了: <n> 件 upsert[, <n> 件 unchanged][, <n> 件 failed] (<時間>)`（`unchanged` と `failed` は 0 件なら出さない）
7. `[完了] 全体 <時間>`

例: 法令一覧 CSV に 2 行あり、1 行は XML を読める法令（条 2 つ）、1 行は壊れた XML（`<Law><broken`）の zip を取得したとき、`  DL 完了: 2.2 KB / <時間> / attempts=1`、`  ingest 完了: 1 件 upsert, 1 件 failed (<時間>)`、`[完了] 全体 <時間>` を出して終了コード 0。

### SPEC-EGOV-CLI-BULK-DOWNLOAD-021 1 日分の差分の取り込みが終わると、経過を標準エラー出力に出して exit 0

`--bulk-download-by-date YYYYMMDD` の取得と取り込みが終わると、終了コード 0 で終わる。経過は標準エラー出力に次の順で出し、標準出力には何も出さない。

1. `[bulk-download-by-date] update_date=<YYYYMMDD> の差分 zip を取得します`
2. `  保存先 zip: <一時フォルダーの中の R<YYMMDD>.zip>`、`  DB:         <DB ファイルの場所>`
3. `[1/2] 差分 zip ダウンロード中...`
4. `  DL 完了: <サイズ> / <時間>`（全件と違い、試した回数は出さない）
5. `[2/2] DB に ingest 中...`
6. `  ingest 完了: <n> 件 upsert[, <n> 件 unchanged][, <n> 件 failed] (<時間>)`

例: `--bulk-download-by-date 20260917` で、法令 1 件の zip を取得すると、保存先 zip の名前は `R260917.zip`、`  ingest 完了: 1 件 upsert (<時間>)` を出して終了コード 0。

### SPEC-EGOV-CLI-BULK-DOWNLOAD-022 取得か取り込みに失敗したら `[ERROR]` を出して exit 1

`--bulk-download-everything` と `--bulk-download-by-date` は、取得（SPEC-EGOV-CLI-BULK-DOWNLOAD-004 であきらめたとき）または取り込み（SPEC-EGOV-CLI-BULK-DOWNLOAD-010 など）に失敗したとき、標準エラー出力に `[ERROR] <エラーの文>` を出して終了コード 1 で終わる。

例: `HOUKI_EGOV_BULK_RETRY=1` で、`--bulk-download-everything` の取得に HTTP 503 が返ると、`[ERROR] HTTP 503 <応答の statusText> from https://laws.e-gov.go.jp/bulkdownload?file_section=1&only_xml_flag=true` を出して終了コード 1（statusText が空なら `HTTP 503` と `from` の間は空白 2 つ）。

### SPEC-EGOV-CLI-BULK-DOWNLOAD-023 成功しても失敗しても、一時フォルダーの zip を消す

`--bulk-download-everything` と `--bulk-download-by-date` は、zip を OS の一時フォルダー（`TMPDIR` など）の下に作ったフォルダー（`houki-egov-bulk-…` / `houki-egov-diff-…`）に保存し、終わるときに、成功（終了コード 0）でも失敗（終了コード 1）でもそのフォルダーごと消す。

例: `TMPDIR` を空のフォルダーにして `--bulk-download-everything` を実行すると、取得と取り込みが成功したときも、取得に HTTP 503 が返って終了コード 1 で終わったときも、終わった後の `TMPDIR` は空のまま。

### SPEC-EGOV-CLI-BULK-DOWNLOAD-024 `HOUKI_EGOV_DB_PATH` の場所に DB を作り、無いフォルダーは作る

`HOUKI_EGOV_DB_PATH` を指定したときは、その場所の DB に取り込む。途中のフォルダーが無ければ作る。

例: `HOUKI_EGOV_DB_PATH=<空のフォルダー>/a/b/laws.db` で `--bulk-download-everything` が成功すると、`a/b` のフォルダーと `laws.db` ができ、経過の `  DB:         ` の行にその場所が出る。

### SPEC-EGOV-CLI-BULK-DOWNLOAD-025 `HOUKI_EGOV_DB_PATH` が無ければ `XDG_CACHE_HOME` の下に DB を作る

`HOUKI_EGOV_DB_PATH` を指定せず `XDG_CACHE_HOME` を指定したときは、`<XDG_CACHE_HOME>/houki-egov-mcp/laws.db` に取り込む。`houki-egov-mcp` のフォルダーが無ければ作る。どちらも指定しないときは `~/.cache/houki-egov-mcp/laws.db` に取り込む。

例: `XDG_CACHE_HOME=<空のフォルダー>/xdg` で `--bulk-download-everything` が成功すると、`<空のフォルダー>/xdg/houki-egov-mcp/laws.db` ができる。

### SPEC-EGOV-CLI-BULK-DOWNLOAD-026 XML に法令種別が無いときは CSV の和文の種別から決める

XML の `Law` に `LawType` が無い（または空の）ときは、法令一覧 CSV の法令種別の欄から法令種別を決める。

| CSV の法令種別 | 法令種別               |
| -------------- | ---------------------- |
| `法律`         | `Act`                  |
| `政令`         | `CabinetOrder`         |
| `閣令`         | `CabinetOrder`         |
| `勅令`         | `ImperialOrder`        |
| `府省令`       | `MinisterialOrdinance` |
| `省令`         | `MinisterialOrdinance` |
| `規則`         | `Rule`                 |
| 上のどれでもない（空を含む） | `Act`    |

XML に `LawType` があるときは、CSV の欄によらず XML の値を使う。

例: `LawType` の無い XML で、CSV の法令種別が `勅令` なら `ImperialOrder`、`条約` なら `Act`。XML に `LawType="Rule"` があれば、CSV が `法律` でも `Rule`。
