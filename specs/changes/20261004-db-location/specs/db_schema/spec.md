# 差分: db_schema（20261004-db-location）

`specs/current/db_schema/spec.md` に対する差分です。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- `MODIFIED` は、見出しの行（題）も含めて、current の同じ ID の見出しと本文をこの差分の見出しと本文に置き換える
- 冒頭の「関連する Issue」に `houki-egov-mcp #108・#110（0.20.0）` を足す
- 「できないこと」に次の 1 行を足す: `既定のファイル名（laws.db）に DB の版を入れること（houki-hub DECISIONS.md 2026-10-04 の T6 の (f)。開発で版を上げるときは HOUKI_EGOV_DB_PATH で別のファイルを使う）`

## ADDED

### SPEC-EGOV-DB-SCHEMA-028 DB の場所を決めた設定を 3 つの名前で表し、表示と案内には DB の絶対パスを使う

DB の場所（SPEC-EGOV-DB-SCHEMA-012〜014）を決めた設定を、次の 3 つの名前で表す。CLI の `--status`（SPEC-EGOV-CLI-STATUS-013）、MCP サーバーの起動時のログ（SPEC-EGOV-CLI-ENTRY-012）、`search_fulltext` の `note`（SPEC-EGOV-SEARCH-FULLTEXT-044）、案内のコマンド（SPEC-EGOV-DB-SCHEMA-029）は、同じ名前と同じ判定を使う。

| 設定の名前 | 当てはまるとき |
| --- | --- |
| `HOUKI_EGOV_DB_PATH` | 環境変数 `HOUKI_EGOV_DB_PATH` に空でない値がある（012） |
| `XDG_CACHE_HOME` | `HOUKI_EGOV_DB_PATH` が無いか空文字で、`XDG_CACHE_HOME` に空でない値がある（013） |
| `既定` | 2 つの環境変数がどちらも無いか空文字（014） |

「DB の絶対パス」は、DB の場所を絶対パスにしたもの。`HOUKI_EGOV_DB_PATH` が相対パスのときは、その処理（CLI の実行、または MCP サーバー）を始めたときの作業フォルダーから絶対パスにする（SQLite がそのファイルを開くのと同じ場所）。`XDG_CACHE_HOME` が相対パスのときも同じ。MCP サーバーの起動時のログ、`search_fulltext` の `freshness.db_path` と `note`（ホームディレクトリの部分は `~`。SPEC-EGOV-SEARCH-FULLTEXT-042）、案内のコマンドの前に付ける値は、この絶対パスを元にする。`--status` などの CLI の `  DB: ` の行（SPEC-EGOV-CLI-STATUS-005 など）は今までどおり、`HOUKI_EGOV_DB_PATH` を指定していればその値のまま出す。

例: `HOUKI_EGOV_DB_PATH=dev/laws.db` を付けて `/Users/bonji/work` で MCP サーバーを起動すると、設定の名前は `HOUKI_EGOV_DB_PATH`、DB の絶対パスは `/Users/bonji/work/dev/laws.db`。同じ値で `--status` を実行すると 2 行目は `  DB: dev/laws.db`、3 行目は `  DB の場所の設定: HOUKI_EGOV_DB_PATH（…）`。`HOUKI_EGOV_DB_PATH` が空文字で `XDG_CACHE_HOME=/data/cache` なら、設定の名前は `XDG_CACHE_HOME`、DB の絶対パスは `/data/cache/houki-egov-mcp/laws.db`。

### SPEC-EGOV-DB-SCHEMA-029 案内のコマンドは `npx -y @shuji-bonji/houki-egov-mcp@latest <フラグ>` で、環境変数で DB の場所を決めたときは同じ変数を前に付ける

MCP の応答と CLI の出力で利用者に実行を勧めるコマンドは、次の形にする。当てはまるのは、`search_fulltext` の `next_actions[].example.command`、`note`（SPEC-EGOV-SEARCH-FULLTEXT-044）・`freshness.warning`（023）・`INTERNAL_ERROR` の `hint`（035、SPEC-EGOV-COMMON-ERRORS-031）の中のコマンド、CLI の `[ERROR]`・`[WARN]`・`(DB がまだありません — …)` の行の中のコマンド（SPEC-EGOV-DB-SCHEMA-025、SPEC-EGOV-CLI-STATUS-004・009・010・012、SPEC-EGOV-CLI-SYNC-021、SPEC-EGOV-CLI-BULK-DOWNLOAD-030）。

```
[<前に付ける変数>=<シェルに書くパス> ]npx -y @shuji-bonji/houki-egov-mcp@latest <フラグ>
```

前に付ける変数は、DB の場所の設定（SPEC-EGOV-DB-SCHEMA-028）で決める。

| DB の場所の設定 | 前に付けるもの |
| --- | --- |
| `既定` | 何も付けない |
| `HOUKI_EGOV_DB_PATH` | `HOUKI_EGOV_DB_PATH=<DB の絶対パスをシェルに書くパス>` |
| `XDG_CACHE_HOME` | `XDG_CACHE_HOME=<XDG_CACHE_HOME の値を絶対パスにしたものをシェルに書くパス>` |

シェルに書くパスは、bash・zsh・sh でそのまま動き、MCP の応答に利用者名を出さない形にする。

1. ホームディレクトリの下（SPEC-EGOV-SEARCH-FULLTEXT-042 の 2〜5 と同じ判定）なら `"$HOME/<残り>"`。`<残り>` に `"`・`$`・`` ` ``・`\`・`!` のどれかを含むときは `"$HOME"'/<残り>'` にし、`<残り>` の `'` は `'\''` にする
2. ホームディレクトリの下でないなら `'<絶対パス>'`。`'` は `'\''` にする

CLI の出力でも同じ形にする（CLI を `HOUKI_EGOV_DB_PATH=… npx …` のように 1 回だけ変数を付けて実行した人が、案内のコマンドをそのまま実行して同じ DB を開けるようにするため）。

次の箇所はこの形にしない: `--help` の使い方（SPEC-EGOV-CLI-ENTRY-002。npx の形は注記で示している）、CLI の行の中でフラグだけを書いている箇所（`--bulk-download-everything を実行してください`・`--sync を実行してください` など。SPEC-EGOV-CLI-STATUS-001・007、SPEC-EGOV-CLI-SYNC-009・010）、`freshness.warning` の括弧の中の `--bulk-download-everything`。

例（ホームディレクトリが `/Users/bonji`）:

| 起動・実行したときの設定 | `--bulk-download-everything` の案内のコマンド |
| --- | --- |
| 環境変数なし | `npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything` |
| `HOUKI_EGOV_DB_PATH=/Users/bonji/.cache/houki-egov-mcp/laws.dev.db` | `HOUKI_EGOV_DB_PATH="$HOME/.cache/houki-egov-mcp/laws.dev.db" npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything` |
| `HOUKI_EGOV_DB_PATH=/tmp/x/laws.db` | `HOUKI_EGOV_DB_PATH='/tmp/x/laws.db' npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything` |
| `XDG_CACHE_HOME=/Users/bonji/Library/Caches` | `XDG_CACHE_HOME="$HOME/Library/Caches" npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything` |
| `HOUKI_EGOV_DB_PATH=/Users/bonji/dev$1/laws.db` | `HOUKI_EGOV_DB_PATH="$HOME"'/dev$1/laws.db' npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything` |

v0.19.x のコマンドは、どの場合も `houki-egov-mcp --bulk-download-everything`（グローバルにインストールしていないと `command not found`、`npx houki-egov-mcp` は npm に無い名前なので 404。houki-egov-mcp #108 の 2）。

## MODIFIED

### SPEC-EGOV-DB-SCHEMA-025 DB の状態と入口ごとの扱い

DB を開く入口は、DB の状態によって次のように扱う。DB を作る・作り直すのは `--bulk-download-everything` だけで、`--status` と `search_fulltext` は DB のファイル・フォルダー・テーブル・`schema_meta` を作らず書き換えない（DB があるときに SQLite が `-wal` / `-shm` のファイルを置くことはある）。「版」は `schema_meta` の `schema_version` の値で、この版の houki-egov-mcp の版は 3。

| DB の状態 | `--bulk-download-everything` | `--sync` / `--bulk-download-by-date` | `--status` | `search_fulltext` |
| --- | --- | --- | --- | --- |
| ファイルが無い（置き場所のフォルダーも無いときを含む） | フォルダーとファイルを作り、版 3 を記録して取り込む（001・015） | 作らない。全件の取り込みを促して終了コード 1（SPEC-EGOV-CLI-SYNC-009、SPEC-EGOV-CLI-BULK-DOWNLOAD-030） | 作らない。DB が無いことを出して終了コード 0（SPEC-EGOV-CLI-STATUS-010） | 作らない。`search_law` に切り替える（SPEC-EGOV-SEARCH-FULLTEXT-039） |
| ファイルはあるが版の記録が無い（0 バイトのファイルなど） | テーブルを作り、版 3 を記録して取り込む | 書き込まない。ファイルが無いときと同じ | 書き込まない。ファイルが無いときと同じ | 書き込まない。`search_law` に切り替える（文はファイルが無いときと違う。SPEC-EGOV-SEARCH-FULLTEXT-044） |
| 版が同じ（3） | 取り込む | 取り込む | 表示する | 引く |
| 版が古い（1・2） | 取得に成功してから作り直して取り込む（016）。取得の前に `  DB の版 (<版>) が古いため、取得の後で作り直します（取り込んだ中身は消えます）` を出す | 書き込まない。古い版のエラーで終了コード 1 | 書き込まない。古い版のエラーで終了コード 1 | 使わない。`search_law` に切り替え、作り直しを案内する（SPEC-EGOV-SEARCH-FULLTEXT-040） |
| 版が新しい（4 以上の整数） | 取得の前に止める。新しい版のエラーで終了コード 1 | 書き込まない。新しい版のエラーで終了コード 1 | 書き込まない。新しい版のエラーで終了コード 1 | 使わない。`search_law` に切り替え、houki-egov-mcp の更新を案内する（040） |
| 版を読めない（整数でない値・空文字） | 取得の前に止める。読めない版のエラーで終了コード 1 | 書き込まない。読めない版のエラーで終了コード 1 | 書き込まない。読めない版のエラーで終了コード 1 | 使わない。`search_law` に切り替える（040） |
| 開けない（SQLite でないファイル、フォルダー、パスの途中が普通のファイル、権限が無い） | 取得の前に止める。`[ERROR] DB を開けません: <エラーの文>` で終了コード 1 | `[ERROR] DB を開けません: <エラーの文>` で終了コード 1 | SPEC-EGOV-CLI-STATUS-006 | SPEC-EGOV-SEARCH-FULLTEXT-027 |

CLI のエラーの文は、標準エラー出力に次のとおり出す（`<DB の版>` は `schema_version` の値、`<DB の場所>` は `  DB: ` の行と同じ、`<コマンド>` は `--bulk-download-everything` を付けた案内のコマンド。SPEC-EGOV-DB-SCHEMA-029）。

| 場面 | 文 |
| --- | --- |
| 古い版 | `[ERROR] DB の版 (<DB の版>) が古いため使えません。<コマンド> で作り直してください（取り込んだ中身は消え、全件の zip 約 290 MB を取り直します）` |
| 新しい版 | `[ERROR] DB の版 (<DB の版>) がこの houki-egov-mcp の版 (3) より新しいため、DB を変更しません。houki-egov-mcp を新しい版に更新するか、HOUKI_EGOV_DB_PATH で別のファイルを指定してください` |
| 読めない版 | `[ERROR] DB の版を読めないため (schema_version: <値>)、DB を変更しません。DB ファイル (<DB の場所>) を消してから <コマンド> を実行してください` |

例: `schema_version` を `4` に書き換えた DB で `--bulk-download-everything` を実行すると、zip を取得せずに新しい版の文を出して終了コード 1 で終わり、`schema_version` は `4` のまま、`laws` の行も残る（v0.18.x では全テーブルを消して作り直していた）。`schema_version` を `abc` に書き換えた DB で `--status` を実行すると、`[status] …`・`  DB: …`・`  DB の場所の設定: …` の 3 行の後に `[ERROR] DB の版を読めないため (schema_version: abc)、…` を出して終了コード 1（v0.18.x では `UNIQUE constraint failed: schema_meta.key` の例外）。環境変数を付けずに `schema_version` が `2` の DB で `--sync` を実行すると、古い版の文は `[ERROR] DB の版 (2) が古いため使えません。npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything で作り直してください（取り込んだ中身は消え、全件の zip 約 290 MB を取り直します）`（v0.19.x では `houki-egov-mcp --bulk-download-everything`）。DB ファイルの無い場所で `search_fulltext` を呼んでも `--status` を実行しても、ファイルはできない。
