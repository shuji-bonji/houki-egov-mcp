# 差分: cli_status（20260928-untested-behaviors）

`specs/current/cli_status/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-CLI-STATUS-005 版・DB の場所・件数と同期の欄を標準出力に出して exit 0

`--status` は、次の行を順に標準出力に出し、終了コード 0 で終わる。標準エラー出力には何も出さない。

1. `[status] <パッケージ名> v<版>`
2. `  DB: <DB ファイルの場所>`（`HOUKI_EGOV_DB_PATH` を指定していればその値）
3. `  laws:     <法令の行の件数>`
4. `  articles: <条の行の件数>`
5. 同期の欄（同期の状態が無ければ SPEC-EGOV-CLI-STATUS-001 の 1 行。あれば `  sync:` の行に続けて、`    last_sync_date:  <値>`・`    last_full_dl_at: <値>`・`    days_since_sync: <日数>`・`    staleness:       <古さ>` の 4 行）

例: `HOUKI_EGOV_DB_PATH=/tmp/x/laws.db` で、法令 1 件・条 2 件を取り込み、`last_sync_date` が `2026-05-08`、`last_full_dl_at` が `2026-05-01T03:00:00.000Z` の DB に、2026-05-09（日本時間）に実行すると、標準出力は次のとおりで終了コードは 0。

```
[status] @shuji-bonji/houki-egov-mcp v0.15.1
  DB: /tmp/x/laws.db
  laws:     1
  articles: 2
  sync:
    last_sync_date:  2026-05-08
    last_full_dl_at: 2026-05-01T03:00:00.000Z
    days_since_sync: 1
    staleness:       fresh
  差分を取り込むには --sync を実行してください
```

同期の状態が無く空の DB なら、`laws:     0`・`articles: 0` に続けて `  sync:     (まだ bulk DL されていません — --bulk-download-everything を実行)` を出して終了コード 0。

### SPEC-EGOV-CLI-STATUS-006 DB を開けないときは exit 1

`HOUKI_EGOV_DB_PATH` の場所の DB を開けないときは、1・2 行目（`[status] …` と `  DB: …`）を標準出力に出した後、標準エラー出力に `[ERROR] DB を開けません: <エラーの文>` を出し、件数と同期の欄を出さずに終了コード 1 で終わる。

例: `HOUKI_EGOV_DB_PATH` に SQLite でない中身のファイルを指定すると `[ERROR] DB を開けません: file is not a database`、フォルダーを指定すると `[ERROR] DB を開けません: unable to open database file` を出して終了コード 1。

### SPEC-EGOV-CLI-STATUS-007 `outdated` でなく 1 日以上たっていれば `--sync` を案内する

同期の状態があり、`staleness` が `outdated` でなく（SPEC-EGOV-CLI-STATUS-004 の警告を出さず）、`days_since_sync` が 1 以上のときは、同期の欄の後に `  差分を取り込むには --sync を実行してください` を出す。`days_since_sync` が 0 のときと、`outdated` のとき（警告を出すとき）はこの行を出さない。

例: 2026-05-09（日本時間）に実行したとき、`last_sync_date` が `2026-05-08`（`fresh`、1 日）と `2026-04-20`（`stale`、19 日）ではこの行を出す。`2026-05-09`（0 日）と `2026-04-01`（`outdated`、38 日）では出さない。
