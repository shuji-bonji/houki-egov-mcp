# 差分: get_law_file（20261003-t4-response-shape）

`specs/current/get_law_file/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える

## MODIFIED

### SPEC-EGOV-GET-LAW-FILE-001 save を付けないときは、ファイルを取らずに URL を返す

`save` を省くか `false` にしたときは、e-Gov からファイルを取らず、次のフィールドを持つ応答を返す。`saved` は付けない。

| フィールド     | 内容                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta`         | 法令の情報（`law_id`・`title`・`law_num`・`retrieved_at`・`url`・`at`）。`at` は渡した `at` で、渡さないときは `null`                                          |
| `file_type`    | 渡した `file_type`                                                                                                                                             |
| `content_type` | 種別から決めた Content-Type。`docx` は `application/vnd.openxmlformats-officedocument.wordprocessingml.document`                                               |
| `url`          | 認証なしで開ける取得 URL。`https://laws.e-gov.go.jp/api/2/law_file/<file_type>/<law_id>`（例: `https://laws.e-gov.go.jp/api/2/law_file/docx/129AC0000000089`） |
| `note`         | 説明                                                                                                                                                           |

`save: true` のとき（SPEC-EGOV-GET-LAW-FILE-003）も、`meta` は同じキーを持つ。

例: `{ law_name: "民法", file_type: "docx" }` の `meta.at` は `null`（v0.16.0 では `at` のキーが無かった）。`{ law_name: "民法", file_type: "html", at: "2020-04-01" }` の `meta.at` は `"2020-04-01"`。

### SPEC-EGOV-GET-LAW-FILE-003 save: true でファイルを取得し、法令履歴 ID の名前で保存する。法令履歴 ID が分からないときは null を返す

`save: true` のときは、e-Gov から法令本文のファイルを取得して保存し、応答に `saved` を付ける。保存するファイル名は、e-Gov の応答の Content-Disposition にあるファイル名（`<law_revision_id>.<拡張子>` の形。読み方は SPEC-EGOV-GET-LAW-FILE-004）である。

- `saved.file_name`: Content-Disposition のファイル名。例: `129AC0000000089_20260624_508AC0000000045.xml`。読めないときは `null`
- `saved.law_revision_id`: Content-Disposition のファイル名が `<英数字と _>.<英数字>` の形のとき、その拡張子より前。例: `129AC0000000089_20260624_508AC0000000045`。`saved.file_name` が `null` のとき、またはこの形でないときは `null`
- `saved.path`: 書いたファイルの絶対パス。`<保存先のディレクトリ>/<ディレクトリ名>/<ファイル名>`。環境変数 `HOUKI_EGOV_FILES_DIR` があれば、それを保存先のディレクトリにする
- `saved.bytes`: 書いたバイト数

ファイル名とディレクトリ名は次のとおり。

| Content-Disposition のファイル名 | ファイル名 | ディレクトリ名 | `saved.file_name` | `saved.law_revision_id` |
| --- | --- | --- | --- | --- |
| `<law_revision_id>.<拡張子>` の形で読める | そのファイル名 | `<law_revision_id>` | そのファイル名 | `<law_revision_id>` |
| 読めるが、その形でない | そのファイル名 | `<law_id>` | そのファイル名 | `null` |
| 読めない（ヘッダーが無い、`filename` を含まない） | `<law_id>.<file_type>` | `<law_id>` | `null` | `null` |

法令履歴 ID が分からないときに、法令 ID を `saved.law_revision_id` に入れない（inputSchema と応答の型の説明は `law_revision_id` を法令履歴 ID としているため）。e-Gov は `filename="<law_revision_id>.<拡張子>"` を返す（2026-09-20 の実測。houki-egov-mcp #66）ので、表の下の 2 行は e-Gov の応答が変わったときの備えである。

例: Content-Disposition が `attachment; filename="129AC0000000089_20260624_508AC0000000045.docx"` なら、`saved.file_name: "129AC0000000089_20260624_508AC0000000045.docx"`、`saved.law_revision_id: "129AC0000000089_20260624_508AC0000000045"`、`saved.path` は `<保存先>/129AC0000000089_20260624_508AC0000000045/129AC0000000089_20260624_508AC0000000045.docx`。Content-Disposition が無い応答で `{ law_name: "民法", file_type: "xml", save: true }` を渡すと、`saved.file_name: null`、`saved.law_revision_id: null`、`saved.path` は `<保存先>/129AC0000000089/129AC0000000089.xml`（v0.16.0 では `saved.law_revision_id` が `"129AC0000000089"` だった）。

### SPEC-EGOV-GET-LAW-FILE-004 Content-Disposition のファイル名の読み方。`filename*` があればそれを使う

`saved.file_name` は、Content-Disposition から次の順で読む。

1. `filename*=UTF-8''…` があれば、その中身を URL デコードしたもの（`a%20b.pdf` → `a b.pdf`）
2. 無ければ `filename="…"`（または引用符の無い `filename=…`）の中身（例: `attachment; filename="129AC0000000089_20260624_508AC0000000045.docx"` → `129AC0000000089_20260624_508AC0000000045.docx`）

`filename*` と `filename` の両方があるときは、ヘッダーの中の順によらず `filename*` を使う（RFC 6266 の 4.3 節が、両方を受け付ける側に `filename*` を選ぶよう勧めているため）。Content-Disposition が無いときや、どちらも含まないとき（例: `inline`）は `null` になる。2026-09-20 の実測では、e-Gov は `filename` だけを返す。

例: `attachment; filename="a.xml"; filename*=UTF-8''b%20c.xml` は `b c.xml`（v0.16.0 ではヘッダーの先に書かれた `a.xml`）。`attachment; filename*=UTF-8''b%20c.xml; filename="a.xml"` も `b c.xml`。`attachment; filename="a.xml"` は `a.xml`。`inline` は `null`。
