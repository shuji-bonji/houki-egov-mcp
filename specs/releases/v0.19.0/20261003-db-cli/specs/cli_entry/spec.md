# 差分: cli_entry（20261003-db-cli）

`specs/current/cli_entry/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 冒頭の「関連する Issue」を `houki-egov-mcp #61（0.19.0）` にする
- 「入力」の表の下の「見るのは最初の引数だけである。」を「フラグは 1 回の実行で 1 つだけ受け付ける。`--bulk-download-by-date` だけが値（日付）を 1 つ取る。それ以外の引数は SPEC-EGOV-CLI-ENTRY-004・008・009 のエラーにする。」にする
- 「処理の流れ」の図で、`C -- "- で始まらない引数" --> S` を `C -- "- で始まらない引数" --> P["未知の引数のエラーと使い方を出し exit 2（008）"]` にし、`C -- "--bulk-download-everything / …"` と `C -- "--help / -h"`・`C -- "--version / -v"` の先に `X{"そのフラグが受け取る数より後に引数があるか"}`、`X -- ある --> Y["余分な引数のエラーと使い方を出し exit 2（009）"]` を挟む
- 「できないこと」の「フラグを組み合わせること（見るのは最初の引数だけ。`--sync --status` は `--sync` だけを行う）」を「フラグを組み合わせること（`--sync --status` は余分な引数のエラー。SPEC-EGOV-CLI-ENTRY-009）」にする
- 「未決」の 2（→ #61）の行を消す

## ADDED

### SPEC-EGOV-CLI-ENTRY-008 `-` で始まらない最初の引数はエラーにして exit 2

最初の引数が `-` で始まらない（例: `status`・`sync`）ときは、標準エラー出力に `ERROR: 未知の引数: <引数>` を出し、続けて使い方を標準出力に出して、MCP サーバーを起動せずに終了コード 2 で終わる（SPEC-EGOV-CLI-ENTRY-004 の未知のフラグと同じ形）。

例: `houki-egov-mcp status` は `ERROR: 未知の引数: status` と使い方を出して終了コード 2（v0.18.x ではエラーを出さずに MCP サーバーとして起動し、入力を待ち続けた。#61）。

### SPEC-EGOV-CLI-ENTRY-009 フラグの後の余分な引数はエラーにして exit 2

最初の引数が入力の表のフラグで、そのフラグが受け取る数より後に引数があるときは、そのフラグの処理を何もせず（DB を開かず、e-Gov にも接続せず）、標準エラー出力に `ERROR: 余分な引数: <最初の余分な引数>` を出し、続けて使い方を標準出力に出して、終了コード 2 で終わる。フラグが受け取る数は、`--bulk-download-by-date` が 1 つ（日付）、ほかのフラグは 0。`--bulk-download-by-date` の日付が無い・形が違うときは、余分な引数より先に SPEC-EGOV-CLI-BULK-DOWNLOAD-001 のエラー（終了コード 2）にする。

例:

| 実行 | 標準エラー出力 | 終了コード |
| --- | --- | --- |
| `houki-egov-mcp --status extra` | `ERROR: 余分な引数: extra` | 2 |
| `houki-egov-mcp --help --version` | `ERROR: 余分な引数: --version` | 2 |
| `houki-egov-mcp --sync --status` | `ERROR: 余分な引数: --status` | 2 |
| `houki-egov-mcp --bulk-download-by-date 20260917 extra` | `ERROR: 余分な引数: extra` | 2 |
| `houki-egov-mcp --bulk-download-by-date 2026-09-17 extra` | `ERROR: --bulk-download-by-date は YYYYMMDD 形式の日付を必要とします (例: 20260507)` | 2 |

v0.18.x では 2 番目以降の引数を見なかったので、上の 4 行目までは最初のフラグの処理をして終わっていた（`--sync --status` は差分の同期をした。#61）。
