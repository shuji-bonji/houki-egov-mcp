# 差分: cli_status（20261004-db-location）

`specs/current/cli_status/spec.md` に対する差分です。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- `MODIFIED` は、見出しの行（題）も含めて、current の同じ ID の見出しと本文をこの差分の見出しと本文に置き換える
- 冒頭の「関連する Issue」に `houki-egov-mcp #108・#110（0.20.0）` を足す
- 「入力」の表に `XDG_CACHE_HOME` の行（`任意`、`HOUKI_EGOV_DB_PATH` が無いときの DB の置き場所の元。SPEC-EGOV-DB-SCHEMA-013）を足す
- 「処理の流れ」の図の `A1["版と DB の場所を出す"]` を `A1["版と DB の場所と、DB の場所の設定を出す（013）"]` にし、その後に `A2["同じフォルダーに別の laws*.db があれば [WARN] を出す（014）"]` の箱を入れて `A1 --> A2 --> V` にする
- 「アクター」の `houki-egov-mcp --status` は変えない（コマンドの名前を示す文で、案内のコマンドではない）

## ADDED

### SPEC-EGOV-CLI-STATUS-013 3 行目に、DB の場所を決めた設定を出す

`  DB: ` の行（2 行目）の次に、DB の場所を決めた設定（SPEC-EGOV-DB-SCHEMA-028）を 1 行、標準出力に出す。DB の状態（版が同じ・無い・版が違う・開けない）によらず、どの場合も出す。

| DB の場所の設定 | 3 行目 |
| --- | --- |
| `HOUKI_EGOV_DB_PATH` | `  DB の場所の設定: HOUKI_EGOV_DB_PATH（MCP クライアントから起動したサーバーは、シェルの環境変数を受け継がないことがあります）` |
| `XDG_CACHE_HOME` | `  DB の場所の設定: XDG_CACHE_HOME（MCP クライアントから起動したサーバーは、シェルの環境変数を受け継がないことがあります）` |
| `既定` | `  DB の場所の設定: 既定` |

ネットワークには出ない。DB を開くかどうかは今までどおり（この行のために DB を開かない）。

例: 環境変数を付けずに実行すると、1〜3 行目は `[status] @shuji-bonji/houki-egov-mcp v0.20.0`・`  DB: /Users/bonji/.cache/houki-egov-mcp/laws.db`・`  DB の場所の設定: 既定`。`HOUKI_EGOV_DB_PATH=/tmp/x/laws.db` を付けると 3 行目は `  DB の場所の設定: HOUKI_EGOV_DB_PATH（MCP クライアントから起動したサーバーは、シェルの環境変数を受け継がないことがあります）`（v0.19.x では 3 行目が無く、2 行目の次は `  laws:` などの行だった）。

### SPEC-EGOV-CLI-STATUS-014 同じフォルダーに別の `laws*.db` があれば `[WARN]` で知らせる

3 行目（SPEC-EGOV-CLI-STATUS-013）の次に、DB の絶対パス（SPEC-EGOV-DB-SCHEMA-028）のフォルダーにある普通のファイルのうち、名前が `laws` で始まり `.db` で終わり、DB のファイルそのものでないものを探す。1 つ以上あれば、標準出力に次の 1 行を出す。無ければ出さない。

```
[WARN] 同じフォルダーに、この DB のほかに laws*.db のファイルがあります: <名前> (<大きさ>, <最終更新>)[, <名前> (<大きさ>, <最終更新>)…]。MCP サーバーと CLI が別のファイルを開いていないか確かめてください
```

- 並びはファイルの名前の順。`<大きさ>` は取り込みの経過の表示と同じ形（1,024 バイト未満は `<n> B`、次は小数 1 桁の `KB`・`MB`、1 GiB 以上は小数 2 桁の `GB`。1 KB = 1,024 バイト）、`<最終更新>` は実行した環境の時刻の `YYYY-MM-DD HH:MM`
- フォルダーは数えない（既定の添付ファイルの保存先 `files/` も同じ場所にある）。`-wal`・`-shm` のファイルは名前が `.db` で終わらないので数えない。退避したファイル（`laws.v2.bak.db` など）は数える
- 見つけたファイルは開かない（版を読まない。名前・大きさ・最終更新だけを出す）
- DB のファイルが無いとき（010）、開けないとき（006）、版が違うとき（011）、同期の記録を読めないとき（009）も、3 行目の次に同じように確かめて出す
- フォルダーが無い・読めないときは何も出さず、エラーにしない
- 終了コードは変えない。標準エラー出力には出さない

例: `~/.cache/houki-egov-mcp/` に `laws.db`（DB のファイル）と、`laws.v3.db`（2,048 バイト、最終更新 2026-10-04 12:00）・`laws.db-wal`・`files/` があるとき、環境変数を付けずに `--status` を実行すると、3 行目の次に `[WARN] 同じフォルダーに、この DB のほかに laws*.db のファイルがあります: laws.v3.db (2.0 KB, 2026-10-04 12:00)。MCP サーバーと CLI が別のファイルを開いていないか確かめてください` を出す。`HOUKI_EGOV_DB_PATH` が `~/.cache/houki-egov-mcp/laws.v3.db`（無いファイル）を指し、同じフォルダーに `laws.db` があるとき（2026-10-04 に `laws.v3.db` を `laws.db` に名前を変えた後の houki-egov-dev の場面）は、`  (DB がまだありません — …)` の行の前に、`laws.db` を挙げた `[WARN]` を出して終了コード 0。`laws.db` だけのフォルダーでは出さない（v0.19.x では、別のファイルがあっても何も出さなかった。houki-egov-mcp #110）。

## MODIFIED

### SPEC-EGOV-CLI-STATUS-004 `outdated` のときだけ最新化の警告を出す

`staleness` が `outdated` のときは、次の警告を出す。`<--sync のコマンド>` は `--sync` を付けた案内のコマンド（SPEC-EGOV-DB-SCHEMA-029）、`<上限>` は `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS` の値（既定 90。`--sync` が差分で追える日数の上限。SPEC-EGOV-CLI-SYNC-003）。

```
  ⚠ bulk DB が <日数> 日前のデータです。最新化するには `<--sync のコマンド>` (最終同期から <上限> 日を超えていれば `--bulk-download-everything`) を実行してください
```

`fresh` と `stale` のときはこの警告を出さない。

例: `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS=60` で、`last_sync_date` が 38 日前の DB では、警告に `(最終同期から 60 日を超えていれば` が入る。環境変数が無いときは `(最終同期から 90 日を超えていれば`（v0.18.x では環境変数によらず 90。#61）。環境変数を付けずに実行したときの警告は `` ⚠ bulk DB が 38 日前のデータです。最新化するには `npx -y @shuji-bonji/houki-egov-mcp@latest --sync` (最終同期から 90 日を超えていれば `--bulk-download-everything`) を実行してください ``（v0.19.x では `` `houki-egov-mcp --sync` ``）。

### SPEC-EGOV-CLI-STATUS-005 版・DB の場所・件数と同期の欄を標準出力に出して exit 0

版が同じ DB（SPEC-EGOV-DB-SCHEMA-025）のとき、`--status` は次の行を順に標準出力に出し、終了コード 0 で終わる。標準エラー出力には何も出さない。

1. `[status] <パッケージ名> v<版>`
2. `  DB: <DB ファイルの場所>`（`HOUKI_EGOV_DB_PATH` を指定していればその値）
3. `  DB の場所の設定: <設定の名前>…`（SPEC-EGOV-CLI-STATUS-013）
4. 同じフォルダーに別の `laws*.db` があれば `[WARN] 同じフォルダーに、…` の 1 行（SPEC-EGOV-CLI-STATUS-014）。無ければこの行は無く、次の行が 4 行目になる
5. `  laws:     <法令の数> (版: <版の数>)`。法令の数は `laws` の `law_id` の種類の数、版の数は `laws` の行の数（前の版・未施行の版を含む）
6. `  articles: <条の行の件数>`
7. 同期の欄（同期の状態が無ければ SPEC-EGOV-CLI-STATUS-001 の 1 行。あれば `  sync:` の行に続けて、`    last_sync_date:  <値>`・`    last_full_dl_at: <値>`・`    days_since_sync: <日数>`・`    staleness:       <古さ>` の 4 行）

1・2 行目と、`  laws:` 以降の行の形は v0.19.x と同じ。

例: `HOUKI_EGOV_DB_PATH=/tmp/x/laws.db` で、法令 1 件（版 1 つ）・条 2 件を取り込み、`last_sync_date` が `2026-05-08`、`last_full_dl_at` が `2026-05-01T03:00:00.000Z` の DB（`/tmp/x/` にほかの `laws*.db` は無い）に、2026-05-09（日本時間）に実行すると、標準出力は次のとおりで終了コードは 0。

```
[status] @shuji-bonji/houki-egov-mcp v0.20.0
  DB: /tmp/x/laws.db
  DB の場所の設定: HOUKI_EGOV_DB_PATH（MCP クライアントから起動したサーバーは、シェルの環境変数を受け継がないことがあります）
  laws:     1 (版: 1)
  articles: 2
  sync:
    last_sync_date:  2026-05-08
    last_full_dl_at: 2026-05-01T03:00:00.000Z
    days_since_sync: 1
    staleness:       fresh
  差分を取り込むには --sync を実行してください
```

同じ法令の現行の版と前の版の 2 行がある DB では `  laws:     1 (版: 2)`（v0.18.x では `  laws:     2` と出し、版の数を法令の数のように見せていた。#61）。同期の状態が無く空の DB なら、`  laws:     0 (版: 0)`・`  articles: 0` に続けて `  sync:     (まだ bulk DL されていません — --bulk-download-everything を実行)` を出して終了コード 0。v0.19.x では 3 行目（DB の場所の設定）が無く、2 行目の次が `  laws:` の行だった。

### SPEC-EGOV-CLI-STATUS-006 DB を開けないときは exit 1

`HOUKI_EGOV_DB_PATH` の場所の DB を開けないときは、1〜3 行目（`[status] …`・`  DB: …`・`  DB の場所の設定: …`）と、あれば SPEC-EGOV-CLI-STATUS-014 の `[WARN]` の行を標準出力に出した後、標準エラー出力に `[ERROR] DB を開けません: <エラーの文>` を出し、件数と同期の欄を出さずに終了コード 1 で終わる。

例: `HOUKI_EGOV_DB_PATH` に SQLite でない中身のファイルを指定すると `[ERROR] DB を開けません: file is not a database`、フォルダーを指定すると `[ERROR] DB を開けません: unable to open database file` を出して終了コード 1。

### SPEC-EGOV-CLI-STATUS-009 同期の記録の日付を解釈できないときは `[ERROR]` を出して exit 1

`sync_state.last_sync_date` が日付・時刻として解釈できない（空文字、`2026/05/08`、`2026-02-30` など）ときは、`[status] …` から `  articles: …` までの行（SPEC-EGOV-CLI-STATUS-005 の 1〜6）を標準出力に出した後、標準エラー出力に `[ERROR] 同期の記録を読めません: <last_sync_date の値>（<コマンド> で作り直してください）` を出し、同期の欄（SPEC-EGOV-CLI-STATUS-002〜004・007）を出さずに終了コード 1 で終わる（SPEC-EGOV-COMMON-ERRORS-031 の CLI での形）。`<コマンド>` は `--bulk-download-everything` を付けた案内のコマンド（SPEC-EGOV-DB-SCHEMA-029）。例外のまま終わらない。

例: `sync_state.last_sync_date` を `2026/05/08` に書き換えた DB で、環境変数を付けずに `--status` を実行すると、標準エラー出力に `[ERROR] 同期の記録を読めません: 2026/05/08（npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything で作り直してください）` を出して終了コード 1（v0.19.x では `houki-egov-mcp --bulk-download-everything`）。`2026-05-08` の DB では今までどおり同期の欄を出して終了コード 0。

### SPEC-EGOV-CLI-STATUS-010 DB が無いときは作らずに、そのことを出して exit 0

DB のファイルが無いとき（置き場所のフォルダーも無いときを含む）と、ファイルはあるが版の記録が無いときは、1〜3 行目（`[status] …`・`  DB: …`・`  DB の場所の設定: …`）と、あれば SPEC-EGOV-CLI-STATUS-014 の `[WARN]` の行の後に、`  (DB がまだありません — <コマンド> で作ります)` を標準出力に出し、件数と同期の欄を出さずに終了コード 0 で終わる。`<コマンド>` は `--bulk-download-everything` を付けた案内のコマンド（SPEC-EGOV-DB-SCHEMA-029）。DB のファイル・フォルダー・テーブルを作らない（SPEC-EGOV-DB-SCHEMA-025）。

例: `HOUKI_EGOV_DB_PATH=<空のフォルダー>/a/laws.db`（`<空のフォルダー>` はホームディレクトリの外）で `--status` を実行すると、標準出力は `[status] …`・`  DB: <空のフォルダー>/a/laws.db`・`  DB の場所の設定: HOUKI_EGOV_DB_PATH（…）`・`  (DB がまだありません — HOUKI_EGOV_DB_PATH='<空のフォルダー>/a/laws.db' npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything で作ります)` の 4 行で終了コード 0、終わった後も `<空のフォルダー>/a` は無い（v0.18.x では `a/laws.db` を作ってから `laws:     0` を出し、ファイルが残った。#60。v0.19.x では 3 行で、コマンドは `houki-egov-mcp --bulk-download-everything`）。

### SPEC-EGOV-CLI-STATUS-011 版が同じでない DB には書き込まずに exit 1

古い版・新しい版・読めない版の DB のときは、1〜3 行目と、あれば SPEC-EGOV-CLI-STATUS-014 の `[WARN]` の行を標準出力に出した後、SPEC-EGOV-DB-SCHEMA-025 のエラーの文を標準エラー出力に出し、件数と同期の欄を出さずに終了コード 1 で終わる。DB を作り直さず、書き換えない。

例: 環境変数を付けずに、`schema_version` が `2` の DB で `--status` を実行すると、`[ERROR] DB の版 (2) が古いため使えません。npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything で作り直してください（…）` を出して終了コード 1 で、`schema_version` は `2` のまま、`laws` の行も残る（0.19.0 に上げた直後の利用者の DB はこの状態になる。v0.18.x の「版が違えば作り直す」をそのまま使うと、`--status` を実行しただけで取り込んだ中身が消える）。

### SPEC-EGOV-CLI-STATUS-012 施行日を過ぎても未施行のままの版があれば `[WARN]` で全件の取り込みを案内する

同期の状態があり、同期の欄（SPEC-EGOV-CLI-STATUS-002・003）を出せたときは、DB の `laws` のうち、`current_revision_status` が `UnEnforced` で、`amendment_enforcement_date` が `last_sync_date` より前（同じ日を含まない）の版を数える。1 件以上なら、同期の欄と、その後の警告（SPEC-EGOV-CLI-STATUS-004）または `--sync` の案内（007）の行の後に、標準出力に次の 1 行を出す。0 件なら出さない。終了コードは 0 のまま変えない。標準エラー出力には出さない。`<コマンド>` は `--bulk-download-everything` を付けた案内のコマンド（SPEC-EGOV-DB-SCHEMA-029）。

```
[WARN] 施行日が last_sync_date (<last_sync_date>) より前なのに未施行 (UnEnforced) のままの版が <件数> 件あります。<コマンド> を 1 回実行すると直ります（全件の zip 約 290 MB を取得します。条の本文は入れ直しません）
```

文は SPEC-EGOV-CLI-SYNC-021 と同じ。数える条件も同じで、比べる日は今日ではなく `last_sync_date`（同期していない日の配り直しは `--sync` で取り込めるので、`--bulk-download-everything` を案内しない）。`amendment_enforcement_date` が `NULL` の版は数えない。同期の状態が無いとき（001）、DB が無いとき（010）、版が合わないとき（011）、DB を開けないとき（006）、同期の記録を読めないとき（009）は数えず、出さない。ネットワークには出ない。

例: `last_sync_date` が `2026-10-06` で、施行日 `2026-10-05` の `UnEnforced` の版が 5 つある DB に、2026-10-07（日本時間）に環境変数を付けずに `--status` を実行すると、同期の欄（`days_since_sync: 1`、`staleness: fresh`）と `  差分を取り込むには --sync を実行してください` の後に、`[WARN] 施行日が last_sync_date (2026-10-06) より前なのに未施行 (UnEnforced) のままの版が 5 件あります。npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything を 1 回実行すると直ります（…）` を出して終了コード 0（v0.19.1 では `houki-egov-mcp --bulk-download-everything を 1 回実行すると直ります`）。`last_sync_date` が `2026-10-05` なら、施行日 `2026-10-05` の版は数えない（同じ日を含まない）ので出さない。
