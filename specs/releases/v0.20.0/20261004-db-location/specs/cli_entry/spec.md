# 差分: cli_entry（20261004-db-location）

`specs/current/cli_entry/spec.md` に対する差分です。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 冒頭の「関連する Issue」に `houki-egov-mcp #108（0.20.0）` を足す
- 「処理の流れ」の図で、MCP サーバーとして待ち受ける箱の後に `起動時のログに DB の場所と、DB の場所の設定を出す（012）` を足す

## ADDED

### SPEC-EGOV-CLI-ENTRY-012 MCP サーバーは起動時のログに、DB の絶対パスと DB の場所の設定を出す

引数なしで MCP サーバーとして起動すると、`[server] <パッケージ名> v<版> started` の行（SPEC-EGOV-CLI-ENTRY-006）の次に、標準エラー出力へ次の 1 行を出す。

```
[server] DB: <DB の絶対パス>（DB の場所の設定: <設定の名前>）
```

`<DB の絶対パス>` と `<設定の名前>` は SPEC-EGOV-DB-SCHEMA-028 のとおり（ホームディレクトリを `~` に置き換えない）。この行のために DB を開かず、ファイルがあるかも確かめない（`search_fulltext` は呼び出しごとに DB を開くので、起動した後に CLI で作った DB も使える。起動時の有無を出すと古い情報になる）。MCP の応答（tools/list とツールの応答）は変わらない。

例: 環境変数を付けずに、ホームディレクトリが `/Users/bonji` の環境で起動すると、標準エラー出力は `[server] @shuji-bonji/houki-egov-mcp v0.20.0 started` の次に `[server] DB: /Users/bonji/.cache/houki-egov-mcp/laws.db（DB の場所の設定: 既定）`。`HOUKI_EGOV_DB_PATH=/Users/bonji/.cache/houki-egov-mcp/laws.v3.db` を付けて起動すると `[server] DB: /Users/bonji/.cache/houki-egov-mcp/laws.v3.db（DB の場所の設定: HOUKI_EGOV_DB_PATH）`（v0.19.x では `… started` の 1 行だけで、どのファイルを開くかはログから分からなかった。houki-egov-mcp #108 の追記）。
