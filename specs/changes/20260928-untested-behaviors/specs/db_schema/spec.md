# 差分: db_schema（20260928-untested-behaviors）

`specs/current/db_schema/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-DB-SCHEMA-012 `HOUKI_EGOV_DB_PATH` があれば、その場所に DB を置く

環境変数 `HOUKI_EGOV_DB_PATH` に空でない値があれば、DB を開くとそのパスのファイルを DB として使う。`XDG_CACHE_HOME` があっても `HOUKI_EGOV_DB_PATH` を優先する。

例: `HOUKI_EGOV_DB_PATH=<一時ディレクトリ>/a/b/x.db`、`XDG_CACHE_HOME=<一時ディレクトリ>/xdg` で DB を開くと、`<一時ディレクトリ>/a/b/x.db` ができる。`<一時ディレクトリ>/xdg/houki-egov-mcp/laws.db` はできない。

### SPEC-EGOV-DB-SCHEMA-013 `HOUKI_EGOV_DB_PATH` が無ければ `$XDG_CACHE_HOME/houki-egov-mcp/laws.db` に置く

`HOUKI_EGOV_DB_PATH` が無いか空文字で、`XDG_CACHE_HOME` に空でない値があれば、DB を `$XDG_CACHE_HOME/houki-egov-mcp/laws.db` に置く。

例: `HOUKI_EGOV_DB_PATH` が空文字、`XDG_CACHE_HOME=<一時ディレクトリ>/xdg` で DB を開くと、`<一時ディレクトリ>/xdg/houki-egov-mcp/laws.db` ができる。

### SPEC-EGOV-DB-SCHEMA-014 どちらも無ければ `~/.cache/houki-egov-mcp/laws.db` に置く

`HOUKI_EGOV_DB_PATH` と `XDG_CACHE_HOME` がどちらも無いか空文字なら、DB をホームディレクトリの `.cache/houki-egov-mcp/laws.db` に置く。`XDG_CACHE_HOME` が空文字のときも、無いときと同じに扱う。

例: `HOME=<一時ディレクトリ>`、`HOUKI_EGOV_DB_PATH` と `XDG_CACHE_HOME` を空文字にして DB を開くと、`<一時ディレクトリ>/.cache/houki-egov-mcp/laws.db` ができる。2 つの環境変数を消したときも同じ場所になる。

### SPEC-EGOV-DB-SCHEMA-015 DB の置き場所のディレクトリが無ければ作る

DB を開くとき、置き場所のディレクトリが無ければ、途中のディレクトリも含めて作ってから DB のファイルを作る。

例: `<一時ディレクトリ>/a` が無い状態で `HOUKI_EGOV_DB_PATH=<一時ディレクトリ>/a/b/x.db` として DB を開くと、`<一時ディレクトリ>/a/b/` ができ、その中に `x.db` ができる。`HOME=<一時ディレクトリ>` で `.cache` が無い状態から SPEC-EGOV-DB-SCHEMA-014 の場所に開いたときも、`.cache/houki-egov-mcp/` を作る。

### SPEC-EGOV-DB-SCHEMA-016 スキーマの版が 1 の DB を開くと、中身を消して版 2 の空の DB にする

`schema_meta` の `schema_version` が `1`（v0.5.0 より前の版で作った DB）のファイルを開くと、`laws`・`articles`・`revisions_meta`・`sync_state`・`laws_fts`・`articles_fts` の行をすべて消した空の DB にし、`schema_version` を `2` にする。利用者は `--bulk-download-everything` をやり直して中身を入れ直す。

例: `laws` に 1 行、`articles` に 2 行、`sync_state` に 1 行、`laws_fts` に 1 行を入れた DB の `schema_version` を `1` に書き換えてから開き直すと、`laws`・`articles`・`sync_state`・`laws_fts` はどれも 0 行で、`schema_meta` は `schema_version = '2'` の 1 行だけになる。

### SPEC-EGOV-DB-SCHEMA-017 版 1 の DB から作り直した後も、7 つのテーブルと articles_fts への反映が使える

SPEC-EGOV-DB-SCHEMA-016 で作り直した DB は、SPEC-EGOV-DB-SCHEMA-002 の 7 つのテーブルを持ち、`articles` に入れた条は SPEC-EGOV-DB-SCHEMA-007 と同じく `articles_fts` で引ける。

例: 作り直した DB の `laws` に 1 行、`articles` に `body` が `再作成後の本文QWERTY` の行を入れると、`articles_fts MATCH 'QWERTY'` は 1 件。

### SPEC-EGOV-DB-SCHEMA-018 laws_fts テーブルの列（law_revision_id は索引に載せない）

`laws_fts` は `law_revision_id`・`law_title`・`law_title_kana`・`abbrev`・`law_num`・`category` の列を持つ。`law_revision_id` は `laws` の行を指すために持つだけで、全文検索の対象にしない。

例: `law_revision_id = 'L1_20200101_'`、`law_title = '消費税法'` の行を入れると、`laws_fts MATCH '消費税'` はその行（`law_revision_id` は `L1_20200101_`）を返し、`laws_fts MATCH '"L1_2020"'` は 0 件。

### SPEC-EGOV-DB-SCHEMA-019 revisions_meta テーブルの列

`revisions_meta` は `law_revision_id`・`law_id`・`mission`・`updated`・`raw_revision_info_json` の列を持つ。主キーは `law_revision_id`。

例: sqlite3 で `PRAGMA table_info(revisions_meta)` を見ると、この 5 列がこの順に並び、`law_revision_id` の `pk` が 1。

### SPEC-EGOV-DB-SCHEMA-020 sync_state テーブルの列

`sync_state` は `id`・`last_sync_date`・`last_full_dl_at`・`total_laws`・`bulk_source`・`schema_version` の列を持つ。

例: sqlite3 で `PRAGMA table_info(sync_state)` を見ると、この 6 列がこの順に並ぶ。

### SPEC-EGOV-DB-SCHEMA-021 articles の行を書き換えると、articles_fts も新しい本文と見出しに入れ替わる

`articles` の行の `body` や `caption` を書き換えると、`articles_fts` では古い本文・見出しでは当たらなくなり、新しい本文・見出しで当たる。

例: `id = 1`、`body` が `旧本文ABCDEF`、`caption` が `（目的）` の条を入れ、`body` を `新本文GHIJKL`、`caption` を `（趣旨）` に書き換えると、`articles_fts MATCH 'ABCDEF'` は 0 件、`articles_fts MATCH 'GHIJKL'` は `rowid = 1` の 1 件、`articles_fts MATCH '目的）'` は 0 件、`articles_fts MATCH '趣旨）'` は 1 件。

### SPEC-EGOV-DB-SCHEMA-022 DB は WAL で開く

DB を開くと、ジャーナルの形式を WAL にする。

例: DB を開いた後に `PRAGMA journal_mode` を読むと `wal`。

### SPEC-EGOV-DB-SCHEMA-023 書き込み中の DB も、別の接続から読める

1 つの接続が書き込みのトランザクションを開いたままでも、同じファイルを別の接続で開いて読める。読んだ側には、確定（COMMIT）した行だけが見え、確定する前の行は見えない。CLI が取り込んでいる間に `search_fulltext` で引けるのはこのため。

例: `articles` に 2 行ある DB で、接続 A が `BEGIN IMMEDIATE` の後に `articles` へ 1 行を入れ、まだ COMMIT していない間に、接続 B で同じファイルを開いて `SELECT count(*) FROM articles` を読むと、エラーにならず 2。接続 A が COMMIT した後に接続 B で読むと 3。
