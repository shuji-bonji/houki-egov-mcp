# 差分: search_fulltext（20261004-db-location）

`specs/current/search_fulltext/spec.md` に対する差分です。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- `MODIFIED` は、見出しの行（題）も含めて、current の同じ ID の見出しと本文をこの差分の見出しと本文に置き換える
- 冒頭の「関連する Issue」に `houki-egov-mcp #108・#110（0.20.0）` を足す
- 「アクター」の `ローカル DB（houki-egov-mcp --bulk-download-everything で作ったもの）` を `ローカル DB（--bulk-download-everything で作ったもの）` にする
- 「処理の流れ」の図の 2 つの箱を次のとおりにする
  - `FB2` を `DB を使わずに search_law に切り替え、DB の状態に合った note・next_actions を返す（040・044）`
  - `FB` を `search_law に切り替え、source: api-fallback と note・next_actions・freshness（db_path: null）を返す（002・043・044）`
  - `N` の末尾の `freshness を付けて source: bulk で返す（001・023）` を `freshness（db_path 付き）を付けて source: bulk で返す（001・023・043）` にする
- 「できないこと」は変えない

## ADDED

### SPEC-EGOV-SEARCH-FULLTEXT-042 応答に出す DB のパスは、ホームディレクトリの部分を `~` に置き換える

`search_fulltext` の応答に入れるローカル DB のパス（`freshness.db_path`（SPEC-EGOV-SEARCH-FULLTEXT-043）と、`note` の中の `<パス>`（SPEC-EGOV-SEARCH-FULLTEXT-044））は、次の規則で書く。案内のコマンドの中のパスはこの規則ではなく SPEC-EGOV-DB-SCHEMA-029 に従う。

1. 元にするのは DB の絶対パス（SPEC-EGOV-DB-SCHEMA-028）
2. MCP サーバーのホームディレクトリ（Node.js の `os.homedir()` の値。macOS と Linux では環境変数 `HOME`）と同じ文字列なら `~` にする。ホームディレクトリの後ろに `/` が続くときは、その前の部分を `~` に置き換える
3. 区切りの位置で比べる。ホームディレクトリが `/Users/bonji` のとき、`/Users/bonji2/laws.db` は置き換えない
4. ホームディレクトリが空文字か `/` のときは置き換えない
5. 文字列のまま比べる。大文字と小文字は区別し、シンボリックリンクはたどらない

CLI の出力（`--status` などの `  DB: ` の行）と MCP サーバーの起動時のログ（SPEC-EGOV-CLI-ENTRY-012）は、この規則を使わず絶対パスのまま出す（利用者の端末にしか出ないため）。

例: ホームディレクトリが `/Users/bonji` のとき、`/Users/bonji/.cache/houki-egov-mcp/laws.db` は `~/.cache/houki-egov-mcp/laws.db`、`/tmp/x/laws.db` と `/Users/bonji2/laws.db` はそのまま。

### SPEC-EGOV-SEARCH-FULLTEXT-043 `freshness` は常にオブジェクトで、`db_path` に引いた DB のパスを入れる

`source: "bulk"` の応答と `source: "api-fallback"` の応答のどちらにも `freshness` を置き、`freshness` は常に次の 5 つのキーを持つオブジェクトにする（`warning` は SPEC-EGOV-SEARCH-FULLTEXT-023 のとおり `outdated` のときだけ付く）。

| 応答 | `db_path` | `last_sync_date` / `last_full_dl_at` / `days_since_sync` / `staleness` |
| --- | --- | --- |
| `source: "bulk"`、同期の記録がある | 引いた DB のパス（SPEC-EGOV-SEARCH-FULLTEXT-042 の形） | SPEC-EGOV-SEARCH-FULLTEXT-023 の値 |
| `source: "bulk"`、同期の記録が無い | 引いた DB のパス | 4 つとも `null` |
| `source: "api-fallback"` | `null`（DB を引いていないため。開こうとしたパスは `note` に入る。SPEC-EGOV-SEARCH-FULLTEXT-044） | 4 つとも `null` |

例: ホームディレクトリが `/Users/bonji`、DB の場所の設定が `既定` で、最終同期が 0 日前の DB を引くと、`freshness` は `{ last_sync_date: "2026-10-04", last_full_dl_at: "2026-10-03T19:19:36.391Z", staleness: "fresh", days_since_sync: 0, db_path: "~/.cache/houki-egov-mcp/laws.db" }`。`HOUKI_EGOV_DB_PATH=/tmp/x/laws.db` で同じ DB を引くと `db_path: "/tmp/x/laws.db"`。`sync_state` に行が無い DB では `{ last_sync_date: null, last_full_dl_at: null, staleness: null, days_since_sync: null, db_path: "~/.cache/houki-egov-mcp/laws.db" }`（v0.19.x では `freshness: null`）。DB が無いときの応答では `{ last_sync_date: null, last_full_dl_at: null, staleness: null, days_since_sync: null, db_path: null }`（v0.19.x では `freshness` のキーが無かった）。

### SPEC-EGOV-SEARCH-FULLTEXT-044 `search_law` に切り替えたときの `note` と `next_actions` は、DB の状態ごとに決める

DB を引かずに `search_law` に切り替えたとき（SPEC-EGOV-SEARCH-FULLTEXT-002・027・039・040）の `note` は `<先頭>、search_law (法令名のタイトル一致) にフォールバックしています。<続き>` の 1 つの文字列で、`<先頭>`・`<続き>`・`next_actions` は次の表のとおり。`<パス>` は開こうとした DB のパス（SPEC-EGOV-SEARCH-FULLTEXT-042 の形）、`<コマンド>` は `--bulk-download-everything` を付けた案内のコマンド（SPEC-EGOV-DB-SCHEMA-029。`HOUKI_EGOV_DB_PATH` などで DB の場所を決めて起動したときは、その変数を前に付けた形）、DB の場所の設定は SPEC-EGOV-DB-SCHEMA-028。

| DB の状態 | `<先頭>` | `<続き>` | `next_actions` |
| --- | --- | --- | --- |
| ファイルが無い（DB の場所の設定が `既定` か `XDG_CACHE_HOME`） | `ローカル DB (<パス>) が無いため` | ``条文本文の全文検索を有効にするには `<コマンド>` でローカル DB を構築してください`` | 1 件目 `bulk_download_everything`（`example.command` は `<コマンド>`）、2 件目 `search_law` |
| ファイルが無い（DB の場所の設定が `HOUKI_EGOV_DB_PATH`） | `HOUKI_EGOV_DB_PATH が指すファイル (<パス>) が無いため` | ``条文本文の全文検索を有効にするには、HOUKI_EGOV_DB_PATH を作ってある DB のファイルに直すか、`<コマンド>` でこのパスにローカル DB を構築してください`` | 同上 |
| ファイルはあるが版の記録が無い、または版が同じで条が 1 件も無い | `ローカル DB (<パス>) にまだ法令が取り込まれていないため` | ``条文本文の全文検索を有効にするには `<コマンド>` でローカル DB を構築してください`` | 同上 |
| 版が古い（1・2） | `ローカル DB (<パス>) の版 (<DB の版>) がこの houki-egov-mcp (3) より古いため` | ``条文本文の全文検索を有効にするには `<コマンド>` でローカル DB を作り直してください（取り込んだ中身は消え、全件の zip 約 290 MB を取り直します）`` | 同上 |
| 版が新しい（4 以上の整数） | `ローカル DB (<パス>) の版 (<DB の版>) がこの houki-egov-mcp (3) より新しいため` | `条文本文の全文検索を有効にするには houki-egov-mcp を新しい版に更新してください（DB は変更していません）` | `search_law` の 1 件だけ |
| 版を読めない | `ローカル DB (<パス>) の版を読めないため (schema_version: <値>)` | ``条文本文の全文検索を有効にするには DB ファイル (<パス>) を消してから `<コマンド>` を実行してください（DB は変更していません）`` | `search_law` の 1 件だけ |
| 開けない（パスがフォルダー、途中が普通のファイル、権限が無い、SQLite でないファイル） | `ローカル DB (<パス>) を開けなかったため` | `条文本文の全文検索を有効にするには、このパスがフォルダーを指していないか、途中に普通のファイルが無いか、読む権限があるかを確かめてください（HOUKI_EGOV_DB_PATH を設定しているときはその値を直します）` | `search_law` の 1 件だけ |

`next_actions` の `bulk_download_everything` の `reason` は v0.19.x と同じ `CLI でローカル bulk DB を構築すると search_fulltext が SQLite FTS5 で動作します`。`search_law` の項目は SPEC-EGOV-SEARCH-FULLTEXT-028 のとおり。

例（ホームディレクトリが `/Users/bonji`）:

- 環境変数を付けずに起動し、`~/.cache/houki-egov-mcp/laws.db` が無いとき: `note` は ``ローカル DB (~/.cache/houki-egov-mcp/laws.db) が無いため、search_law (法令名のタイトル一致) にフォールバックしています。条文本文の全文検索を有効にするには `npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything` でローカル DB を構築してください``、`next_actions[0].example.command` は `npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything`
- `HOUKI_EGOV_DB_PATH=/Users/bonji/.cache/houki-egov-mcp/laws.v3.db` で起動し、そのファイルが無いとき（2026-10-04 に houki-egov-dev で起きた場面）: `note` は `HOUKI_EGOV_DB_PATH が指すファイル (~/.cache/houki-egov-mcp/laws.v3.db) が無いため、` で始まり、`next_actions[0].example.command` は `HOUKI_EGOV_DB_PATH="$HOME/.cache/houki-egov-mcp/laws.v3.db" npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything`（v0.19.x では `note` が `bulk DL 未実行のため` で始まり、コマンドは `houki-egov-mcp --bulk-download-everything`）
- 環境変数を付けずに起動し、`laws.db` の版が 2 のとき: `note` は `ローカル DB (~/.cache/houki-egov-mcp/laws.db) の版 (2) がこの houki-egov-mcp (3) より古いため、` で始まる
- `HOUKI_EGOV_DB_PATH` に既存のフォルダー `/tmp/d` を指定したとき: `note` は `ローカル DB (/tmp/d) を開けなかったため、` で始まり、`--bulk-download-everything` を含まず、`next_actions` は `search_law` の 1 件だけ（v0.19.x では `bulk DB を開けなかったため` で始まり、`--bulk-download-everything` を案内していた。`--bulk-download-everything` もこの DB では取得の前に止まる。SPEC-EGOV-CLI-BULK-DOWNLOAD-029）

## MODIFIED

### SPEC-EGOV-SEARCH-FULLTEXT-002 ローカル DB に条が無いときは search_law に切り替える

ローカル DB のファイルが無いとき、または DB に条が 1 件も無い（`--bulk-download-everything` を実行していない）ときは、条本文を検索せず、法令名のタイトル一致の検索（`search_law` と同じもの）に切り替えて次を返す。

- `source`: `api-fallback`
- `note`: SPEC-EGOV-SEARCH-FULLTEXT-044 の表の、ファイルが無い行、または法令がまだ取り込まれていない行の文。開こうとした DB のパスと、`--bulk-download-everything` で DB を作ると本文を検索できることを含む
- `next_actions`: 1 件目は `action: "bulk_download_everything"`（`example.command` は SPEC-EGOV-DB-SCHEMA-029 の形のコマンド。既定の場所なら `npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything`）、2 件目は `search_law` の案内
- `freshness`: `db_path` を含む 5 つのキーがすべて `null`（SPEC-EGOV-SEARCH-FULLTEXT-043）
- `fallback`: 切り替えた検索の応答そのもの。切り替えた検索がエラーを返したときはそのエラーの形（`code` など）が入る

例: 環境変数を付けずに起動し、条が無い DB で `{ keyword: "消費税法" }` を渡すと、`source: "api-fallback"`、`note` は `ローカル DB (~/.cache/houki-egov-mcp/laws.db) にまだ法令が取り込まれていないため、` で始まる、`next_actions[0].action: "bulk_download_everything"`、`next_actions[0].example.command: "npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything"`、`freshness.db_path: null`（v0.19.x では `note` が `bulk DL 未実行のため` で始まり、`example.command` は `houki-egov-mcp --bulk-download-everything`、`freshness` のキーは無かった）。

### SPEC-EGOV-SEARCH-FULLTEXT-023 DB の鮮度を freshness で返す

`source: "bulk"` の応答の `freshness` に、DB を最後に同期した日からの鮮度と、引いた DB のパスを入れる。DB に同期の記録が無いときは、鮮度の 4 つを `null` にし、`db_path` は入れる（SPEC-EGOV-SEARCH-FULLTEXT-043）。

| フィールド        | 内容 |
| ----------------- | ---- |
| `last_sync_date`  | 最後に同期を終えた日（`YYYY-MM-DD`） |
| `last_full_dl_at` | 最後に全件を取り込んだ日時 |
| `days_since_sync` | `last_sync_date` からの経過日数 |
| `staleness`       | 経過日数が 7 日未満なら `fresh`、30 日未満なら `stale`、30 日以上なら `outdated` |
| `db_path`         | 引いた DB のパス（SPEC-EGOV-SEARCH-FULLTEXT-042 の形） |
| `warning`         | `outdated` のときだけ付く。``bulk DB が <日数> 日前のデータです。最新化するには `<--sync のコマンド>` (最終同期から <上限> 日を超えていれば `--bulk-download-everything`) を実行してください``。`<--sync のコマンド>` は `--sync` を付けた案内のコマンド（SPEC-EGOV-DB-SCHEMA-029）、`<上限>` は `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS` の値（既定 90） |

鮮度が `outdated` でも DB を引いた結果を返す。

例: 最終同期が 1 日前なら `staleness: "fresh"`、`days_since_sync: 1`、`warning` なし。ちょうど 7 日前なら `stale`。38 日前なら `outdated` で、`warning` に `日前` と `bulk-download` を含む。環境変数を付けずに起動したときの `warning` は ``bulk DB が 38 日前のデータです。最新化するには `npx -y @shuji-bonji/houki-egov-mcp@latest --sync` (最終同期から 90 日を超えていれば `--bulk-download-everything`) を実行してください``（v0.19.x では `` `houki-egov-mcp --sync` ``）。MCP サーバーを `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS=60` で起動したときは、`warning` に `最終同期から 60 日を超えていれば` を含む（v0.18.x では 90 のまま。CLI の SPEC-EGOV-CLI-STATUS-004 と揃える。#61）。

### SPEC-EGOV-SEARCH-FULLTEXT-027 DB を開けないときも search_law に切り替える

ローカル DB のファイルを開けない（パスの途中が普通のファイル、パスがディレクトリ、権限が無いなど）ときも、エラーにせず `source: "api-fallback"` で `search_law` に切り替えて返す。`note` と `next_actions` は SPEC-EGOV-SEARCH-FULLTEXT-044 の表の開けない行（`note` の先頭は `ローカル DB (<パス>) を開けなかったため`、`next_actions` は `search_law` の 1 件だけで `bulk_download_everything` を含まない）。`freshness` と `fallback` は SPEC-EGOV-SEARCH-FULLTEXT-002 と同じ。

例: DB のパスに、普通のファイル `afile` の下の `afile/x.db`（または既存のディレクトリ）を指定して `{ keyword: "消費税法" }` を渡すと、`source: "api-fallback"`、`note` は `ローカル DB (<指定したパス>) を開けなかったため、search_law (法令名のタイトル一致) にフォールバックしています。` で始まり `--bulk-download-everything` を含まない、`next_actions` は `[{ action: "search_law", … }]` の 1 件（v0.19.x では `bulk DB を開けなかったため` で始まり、`next_actions[0].action: "bulk_download_everything"`）。

### SPEC-EGOV-SEARCH-FULLTEXT-035 同期の記録の日付を解釈できないときは `INTERNAL_ERROR`（`retryable: false`）を返し、全件の取り込みを案内する

`source: "bulk"` の検索で、`freshness`（SPEC-EGOV-SEARCH-FULLTEXT-023）を計算するときに `sync_state.last_sync_date` が日付・時刻として解釈できない（空文字、`2026/05/08`、`2026-02-30` など）ときは、想定外の例外として止まらず、SPEC-EGOV-COMMON-ERRORS-031 の形のエラー `INTERNAL_ERROR`（`retryable: false`、`error` にその値、`hint` に `` `<コマンド>` で全件を取り込み直し、同期の記録を作り直してください``（`<コマンド>` は `--bulk-download-everything` を付けた案内のコマンド。SPEC-EGOV-DB-SCHEMA-029）、`detail.cause` に例外の文）を返す。`hits` は返さない。同期の記録が無い（`sync_state` に行が無い）ときはエラーにせず、鮮度の 4 つを `null` にした `freshness`（SPEC-EGOV-SEARCH-FULLTEXT-043）で `hits` を返す。

例: `sync_state.last_sync_date` を `2026/05/08` に書き換えた DB で、環境変数を付けずに起動して `{ keyword: "軽減税率" }` を渡すと、`code: "INTERNAL_ERROR"`、`retryable: false`、`error` に `2026/05/08` を含み、`hint` は `` `npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything` で全件を取り込み直し、同期の記録を作り直してください``。`last_sync_date` が `2026-05-08` の DB では、今までどおり `hits` と `freshness` を返す。`sync_state` に行が無い DB では `freshness.last_sync_date: null`、`freshness.db_path` に DB のパス（v0.19.x では `freshness: null`）。

### SPEC-EGOV-SEARCH-FULLTEXT-039 DB のファイルを作らず、DB に書き込まない

`search_fulltext` は、ローカル DB のファイル・置き場所のフォルダー・テーブル・`schema_meta` を作らず、書き換えない（SPEC-EGOV-DB-SCHEMA-025）。DB のファイルが無いとき（置き場所のフォルダーも無いときを含む）と、ファイルはあるが版の記録が無いときは、SPEC-EGOV-SEARCH-FULLTEXT-002 と同じ形で `search_law` に切り替えて返す。`note` は SPEC-EGOV-SEARCH-FULLTEXT-044 の表のとおりで、ファイルが無いときは DB の場所の設定で文が分かれ、版の記録が無いときは `ローカル DB (<パス>) にまだ法令が取り込まれていないため` で始まる。パスの途中が普通のファイルで開けないときは、今までどおり SPEC-EGOV-SEARCH-FULLTEXT-027。

例: `HOUKI_EGOV_DB_PATH=<空のフォルダー>/a/laws.db`（`<空のフォルダー>` はホームディレクトリの外）で `{ keyword: "消費税法" }` を呼ぶと、`source: "api-fallback"`、`note` は `HOUKI_EGOV_DB_PATH が指すファイル (<空のフォルダー>/a/laws.db) が無いため` で始まり、`next_actions[0].action: "bulk_download_everything"`、`next_actions[0].example.command` は `HOUKI_EGOV_DB_PATH='<空のフォルダー>/a/laws.db' npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything`。呼んだ後も `<空のフォルダー>/a` は無い（v0.18.x ではフォルダーと空の DB を作り、スキーマを書いた。README の「書き込みは CLI だけが行い、MCP server は読むだけ」と違っていた。#60）。0 バイトのファイルを `HOUKI_EGOV_DB_PATH` に指定すると、`note` は `ローカル DB (<パス>) にまだ法令が取り込まれていないため` で始まる（v0.19.x ではどちらも `bulk DL 未実行のため`）。

### SPEC-EGOV-SEARCH-FULLTEXT-040 版が同じでない DB は使わずに search_law に切り替える

DB の版（`schema_meta` の `schema_version`）が 3 でないときは、DB を引かず、作り直さず、`source: "api-fallback"` で `search_law` に切り替えて返す。`note` と `next_actions` は SPEC-EGOV-SEARCH-FULLTEXT-044 の表の、版が古い・版が新しい・版を読めない行のとおり（版が古いときだけ `bulk_download_everything` を案内し、版が新しい・読めないときは `search_law` の 1 件だけ）。`freshness` と `fallback` は SPEC-EGOV-SEARCH-FULLTEXT-002 と同じ。

例: 環境変数を付けずに起動し、`schema_version` が `2` の DB（0.18.x 以前で作った DB）で `{ keyword: "適格請求書" }` を呼ぶと、`source: "api-fallback"`、`note` は `ローカル DB (~/.cache/houki-egov-mcp/laws.db) の版 (2) がこの houki-egov-mcp (3) より古いため、` で始まり `npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything` を含む、`next_actions[0].action: "bulk_download_everything"`。`schema_version` は `2` のまま（v0.18.x の「版が違えば作り直す」を 0.19.0 に残すと、MCP サーバーが全テーブルを消すことになる）。`schema_version` が `4` の DB では `note` が `ローカル DB (~/.cache/houki-egov-mcp/laws.db) の版 (4) がこの houki-egov-mcp (3) より新しいため、` で始まり、`next_actions` は `[{ action: "search_law", … }]` の 1 件（v0.19.x では `note` の先頭が `bulk DB の版 (2) が…` / `bulk DB の版 (4) が…` で、パスを含まなかった）。
