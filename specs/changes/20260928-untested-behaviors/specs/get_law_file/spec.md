# 差分: get_law_file（20260928-untested-behaviors）

`specs/current/get_law_file/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-GET-LAW-FILE-008 save なしでは、e-Gov への問い合わせは法令名の解決だけ

`save` を省くか `false` にしたときは、e-Gov には法令名の解決のための法令検索だけを問い合わせる。法令本文（`/law_data`）・改正履歴（`/law_revisions`）・法令本文のファイル（`/law_file`）は問い合わせない。`at` を渡したときも同じ。

例: `{ law_name: "民法", file_type: "xml", at: "2020-04-01" }` → e-Gov への問い合わせは法令検索（`law_title: "民法"`）の 1 回だけで、応答の `url` は `https://laws.e-gov.go.jp/api/2/law_file/xml/129AC0000000089?asof=2020-04-01`。

### SPEC-EGOV-GET-LAW-FILE-009 json でも get_law を案内し、html・rtf では案内しない

`file_type` が `xml` か `json` のときは、`next_actions` に `get_law` の 1 件を入れる。`example` は `{ law_name: <渡した law_name>, article: "1" }`。`html`・`rtf`・`docx` のときは `next_actions` を付けない。`save` の有無は問わない。

例:
- `{ law_name: "民法", file_type: "json" }` → `next_actions: [{ action: "get_law", reason: …, example: { law_name: "民法", article: "1" } }]`、`content_type: "application/json"`
- `{ law_name: "民法", file_type: "html" }` → `next_actions` は付かない（`content_type: "text/html"`）
- `{ law_name: "民法", file_type: "rtf", save: true }` → `next_actions` は付かない（`content_type: "application/rtf"`）

### SPEC-EGOV-GET-LAW-FILE-010 save なしの note は、どの時点の履歴かと保存先のディレクトリを書く

`save` を付けないときの `note` は、`<meta.title> の本文を <file_type> で取る URL です。認証なしで開けます（<時点の説明>）。ファイルをディスクに置くには save: true を付けてください（<保存先のディレクトリ> 以下に保存します）。` になる。

- `<時点の説明>` は、`at` を渡したとき `時点 <at> 以前で最新の履歴`、渡さないとき `現時点で最新の履歴`
- `<保存先のディレクトリ>` は、SPEC-EGOV-GET-LAW-FILE-003 の保存先のディレクトリ（法令履歴 ID のディレクトリより上）

例: `HOUKI_EGOV_FILES_DIR=/tmp/glf-files`、`{ law_name: "民法", file_type: "xml", at: "2020-04-01" }` → `民法 の本文を xml で取る URL です。認証なしで開けます（時点 2020-04-01 以前で最新の履歴）。ファイルをディスクに置くには save: true を付けてください（/tmp/glf-files 以下に保存します）。`

### SPEC-EGOV-GET-LAW-FILE-011 保存したときの note

`save: true` で保存したときの `note` は、`<saved.file_name>（<サイズ>）を <saved.path> に保存しました。` になる。`<サイズ>` は、1024 バイト未満なら `<バイト数> B`、1 MiB 未満なら KiB を小数 1 桁にした `<n> KB`、それ以上は MiB を小数 1 桁にした `<n> MB`。

例: Content-Disposition のファイル名が `129AC0000000089_20260624_508AC0000000045.docx` で 3 バイト → `129AC0000000089_20260624_508AC0000000045.docx（3 B）を <保存先のディレクトリ>/129AC0000000089_20260624_508AC0000000045/129AC0000000089_20260624_508AC0000000045.docx に保存しました。`

### SPEC-EGOV-GET-LAW-FILE-012 特定できない法令と管轄外の資料はエラーにする

- 法令名が略称辞書で別の MCP サーバーの管轄の資料（例: `所基通` = 所得税基本通達）に当たるときは、エラー `OUT_OF_SCOPE` を返す。`next_actions` は `delegate_to_mcp`（`example` は `{ mcp: "houki-nta" }`）
- 法令名から法令を特定できないときは、エラー `LAW_NOT_FOUND` を返す。`next_actions` は `resolve_abbreviation`（`example` は `{ abbr: <law_name> }`）と `search_law`（`example` は `{ keyword: <law_name> }`）

どちらも `save: true` でも、e-Gov から法令本文のファイルを取らない。

例: `{ law_name: "所基通", file_type: "xml" }` → `OUT_OF_SCOPE`。`{ law_name: "無い法", file_type: "xml", save: true }`（法令検索で 0 件）→ `LAW_NOT_FOUND`。

### SPEC-EGOV-GET-LAW-FILE-013 file_type の検査は、法令の特定より先に行う

`file_type` が 5 種のどれでもないときは、法令名が管轄外の資料でも特定できない法令でも、SPEC-EGOV-GET-LAW-FILE-007 の `INVALID_ARGUMENT` を返す。このとき e-Gov には何も問い合わせない（法令検索もしない）。

例: `{ law_name: "所基通", file_type: "txt" }` → `INVALID_ARGUMENT`（`OUT_OF_SCOPE` ではない）。`{ law_name: "無い法", file_type: "txt" }` → `INVALID_ARGUMENT`（`LAW_NOT_FOUND` ではない）で、e-Gov への問い合わせは 0 回。

### SPEC-EGOV-GET-LAW-FILE-014 ファイルの取得に失敗したときの code

`save: true` の取得（`https://laws.e-gov.go.jp/api/2/law_file/<file_type>/<law_id>`）が失敗したときは、次のエラーを返す。どれも `detail.url` に取得した URL（`at` があれば `?asof=<at>` 付き）を入れる。

| e-Gov の応答                        | `code`                | `retryable` | そのほか                           |
| ----------------------------------- | --------------------- | ----------- | ---------------------------------- |
| 429                                 | `SOURCE_RATE_LIMITED` | `true`      | `detail.status: 429`               |
| 時間切れ                            | `SOURCE_TIMEOUT`      | `true`      | `detail.status` は付かない         |
| 5xx（例: 502）                      | `SOURCE_API_ERROR`    | `true`      | `detail.status` に HTTP ステータス |
| 429 以外の 4xx（例: 400・404）      | `SOURCE_API_ERROR`    | `false`     | `detail.status` に HTTP ステータス |

例: `{ law_name: "民法", file_type: "xml", at: "2020-04-01", save: true }` で e-Gov が 404 を返す → `{ code: "SOURCE_API_ERROR", retryable: false, detail: { status: 404, url: "https://laws.e-gov.go.jp/api/2/law_file/xml/129AC0000000089?asof=2020-04-01" } }`。

### SPEC-EGOV-GET-LAW-FILE-015 429・5xx・ネットワークの失敗は取り直してから返す

`save: true` の取得で e-Gov が 429 か 5xx を返したとき、または応答が来ないネットワークの失敗のときは、最大 3 回取り直す（最初の 1 回と合わせて最大 4 回）。途中で成功すれば保存して成功応答を返す。4 回とも失敗したときは SPEC-EGOV-GET-LAW-FILE-014 の code を返す。

時間切れと、429 以外の 4xx は取り直さない（e-Gov への問い合わせは 1 回）。

例:
- 4 回とも 502 → e-Gov への問い合わせは 4 回で、`SOURCE_API_ERROR`（`retryable: true`、`detail.status: 502`）
- 400 → 問い合わせは 1 回

### SPEC-EGOV-GET-LAW-FILE-016 環境変数が無いときの保存先

`HOUKI_EGOV_FILES_DIR` が無いか空文字のときは、保存先のディレクトリを `<XDG_CACHE_HOME>/houki-egov-mcp/files` にする。`XDG_CACHE_HOME` も無いか空文字のときは `<ホームディレクトリ>/.cache/houki-egov-mcp/files` にする。SPEC-EGOV-GET-LAW-FILE-010 の `note` に書く保存先のディレクトリも同じ。

例:
- `HOUKI_EGOV_FILES_DIR` 無し、`XDG_CACHE_HOME=/tmp/xdg` → `saved.path` は `/tmp/xdg/houki-egov-mcp/files/129AC0000000089_20260624_508AC0000000045/129AC0000000089_20260624_508AC0000000045.docx`
- どちらも無く、ホームディレクトリが `/tmp/home` → `saved.path` は `/tmp/home/.cache/houki-egov-mcp/files/<law_revision_id>/<ファイル名>`、`save` なしの `note` は `（/tmp/home/.cache/houki-egov-mcp/files 以下に保存します）` を含む

### SPEC-EGOV-GET-LAW-FILE-017 同じファイルを保存すると上書きする

同じ名前のファイル（同じ `saved.law_revision_id` と `saved.file_name`）を `save: true` でもう一度保存すると、前のファイルを新しい中身で上書きし、エラーにしない。`saved.path` は前と同じで、`saved.bytes` は新しい中身のバイト数になる。

例: 中身 `ONE`（3 バイト）で `129AC0000000089_20260624_508AC0000000045.docx` を保存したあと、中身 `TWO!`（4 バイト）で同じファイル名を保存 → 2 回目の `saved.bytes` は `4`、ファイルの中身は `TWO!`。
