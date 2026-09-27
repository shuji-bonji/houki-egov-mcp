# 差分: get_attachment（20260928-untested-behaviors）

`specs/current/get_attachment/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-GET-ATTACHMENT-011 save なしで pdf を指したときは pdf-reader-mcp の read_url を案内する

`save` を省くか `false` にして、`file_type` が `pdf` のファイルを指したときは、`next_actions` に `pdf-reader-mcp:read_url` の 1 件だけを入れる。`example` は `{ url: <応答の url> }`。`attached_files_info` に無く本文にだけある pdf でも同じ。pdf 以外のファイル（例: jpg）と zip では `next_actions` を付けない。

例: `src: "./pict/b.pdf"` → `next_actions: [{ action: "pdf-reader-mcp:read_url", reason: …, example: { url: "https://laws.e-gov.go.jp/api/2/attachment/<law_revision_id>?src=.%2Fpict%2Fb.pdf" } }]`。

### SPEC-EGOV-GET-ATTACHMENT-012 save なしの zip の note

`src` を省き `save` を付けないときの `note` は、`添付ファイル <件数> 件をまとめた zip の URL です。` で始まり、保存するには `save: true` を付けるよう書く。`<件数>` は `list_attachments` の `count` と同じ（`attached_files_info` と本文の図を合わせ、重複を除いた件数）。

例: `attached_files_info` に 2 件、本文にだけある図が 1 件の法令 → `添付ファイル 3 件をまとめた zip の URL です。ファイルをディスクに置くには save: true を付けてください。`

### SPEC-EGOV-GET-ATTACHMENT-013 save なしの 1 件の note には保存先のディレクトリを書く

`src` を指定し `save` を付けないときの `note` は、`<file_name> の URL です。認証なしで開けます。ファイルをディスクに置くには save: true を付けてください（<保存先のディレクトリ> 以下に保存します）。` になる。`<保存先のディレクトリ>` は SPEC-EGOV-GET-ATTACHMENT-004 の保存先のディレクトリ（法令履歴 ID のディレクトリより上）。

例: `HOUKI_EGOV_FILES_DIR=/tmp/xx-files`、`src: "./pict/a.jpg"` → `a.jpg の URL です。認証なしで開けます。ファイルをディスクに置くには save: true を付けてください（/tmp/xx-files 以下に保存します）。`

### SPEC-EGOV-GET-ATTACHMENT-014 時点（at）を渡すと、その時点の法令履歴の添付を対象にする

`at` を渡したときは、その時点の法令履歴の本文と添付の一覧から対象のファイルを選ぶ。`meta.law_revision_id` はその時点の履歴 ID、`url` と `saved.path` にもその履歴 ID を使い、`meta.at` に渡した `at` を入れる。`at` を渡さないときは `meta.at` は付かない。

例: `at: "2019-04-01"` で e-Gov がその時点の履歴 ID `LID1_20190401_X` を返す → `meta.law_revision_id: "LID1_20190401_X"`、`meta.at: "2019-04-01"`、`url: "https://laws.e-gov.go.jp/api/2/attachment/LID1_20190401_X?src=.%2Fpict%2Fa.jpg"`。

### SPEC-EGOV-GET-ATTACHMENT-015 一覧に無い src のエラーで案内する list_attachments にも at を入れる

SPEC-EGOV-GET-ATTACHMENT-008 のエラーの `next_actions` の `list_attachments` の `example` は `{ law_name: <渡した law_name> }` で、`at` を渡したときは `at` も入れる。

例: `law_name: "テスト法"`、`src: "./pict/zz.jpg"`、`at: "2019-04-01"` → `example: { law_name: "テスト法", at: "2019-04-01" }`。`at` を渡さないときは `{ law_name: "テスト法" }`。

### SPEC-EGOV-GET-ATTACHMENT-016 特定できない法令と管轄外の資料はエラーにする

- 法令名が略称辞書で別の MCP サーバーの管轄の資料（例: `所基通` = 所得税基本通達）に当たるときは、エラー `OUT_OF_SCOPE` を返す。`next_actions` は `delegate_to_mcp`（`example` は `{ mcp: "houki-nta" }`）
- 法令名から法令を特定できないときは、エラー `LAW_NOT_FOUND` を返す。`next_actions` は `resolve_abbreviation`（`example` は `{ abbr: <law_name> }`）と `search_law`（`example` は `{ keyword: <law_name> }`）

どちらも `save` の値にかかわらず、e-Gov から法令本文も添付ファイルも取らない。

### SPEC-EGOV-GET-ATTACHMENT-017 添付が無いときのエラーの hint と next_actions

SPEC-EGOV-GET-ATTACHMENT-009 のエラーは、`hint` に別の時点（`at`）の履歴には添付が付いていることがある旨を書き、`next_actions` に `get_law_revisions` の 1 件を入れる。`example` は `{ law_name: <渡した law_name> }`（`at` を渡していても `at` は入れない）。

例: `law_name: "テスト法"`、`at: "2019-04-01"` で、その履歴に添付が無い → `hint: "attached_files_info が空で、本文に Fig 要素もありません。別の時点（at）の履歴には付いていることがあります"`、`next_actions: [{ action: "get_law_revisions", reason: …, example: { law_name: "テスト法" } }]`。

### SPEC-EGOV-GET-ATTACHMENT-018 e-Gov が 404003 以外の 4xx を返したときは SOURCE_API_ERROR

`save: true` の取得で e-Gov が 4xx（429 を除く）を返し、SPEC-EGOV-GET-ATTACHMENT-010 に当たらないときは、エラー `SOURCE_API_ERROR`（`retryable: false`）を返す。`detail.status` に HTTP ステータス、`detail.url` に取得した URL を入れる。400 と 404 のときは、`detail.cause` に e-Gov の応答本文も入れる。

例:
- 400 で本文 `{"code":"400039","message":"m"}` → `{ code: "SOURCE_API_ERROR", retryable: false, detail: { status: 400, url: "https://laws.e-gov.go.jp/api/2/attachment/REV1?src=.%2Fpict%2Fa.jpg", cause: "{\"code\":\"400039\",\"message\":\"m\"}" } }`
- 404 で本文 `Not Found`（JSON でない）→ `SOURCE_API_ERROR`、`retryable: false`、`detail.cause: "Not Found"`
- 403 → `SOURCE_API_ERROR`、`retryable: false`、`detail.status: 403`（`detail.cause` は付かない）

### SPEC-EGOV-GET-ATTACHMENT-019 e-Gov の 429・5xx・時間切れ・ネットワークの失敗

`save: true` の取得で次のときは、それぞれのエラーを返す。`detail.url` には取得した URL を入れる。

| e-Gov の応答        | `code`                | `retryable` |
| ------------------- | --------------------- | ----------- |
| 429                 | `SOURCE_RATE_LIMITED` | `true`      |
| 時間切れ            | `SOURCE_TIMEOUT`      | `true`      |
| 5xx（例: 500）      | `SOURCE_API_ERROR`    | `true`      |

429・5xx・応答が来ないネットワークの失敗のときは、最大 3 回取り直す（最初の 1 回と合わせて最大 4 回）。途中で成功すれば保存して成功応答を返す。時間切れと、429 以外の 4xx は取り直さない。

例:
- 4 回とも 429 → e-Gov への問い合わせは 4 回で、`SOURCE_RATE_LIMITED`（`detail.status: 429`）
- 1 回目が 500、2 回目が 200 → `saved` 付きの成功応答

### SPEC-EGOV-GET-ATTACHMENT-020 環境変数が無いときの保存先

`HOUKI_EGOV_FILES_DIR` が無いか空文字のときは、保存先のディレクトリを `<XDG_CACHE_HOME>/houki-egov-mcp/files` にする。`XDG_CACHE_HOME` も無いか空文字のときは `<ホームディレクトリ>/.cache/houki-egov-mcp/files` にする。

例:
- `HOUKI_EGOV_FILES_DIR` 無し、`XDG_CACHE_HOME=/tmp/xdg` → `saved.path` は `/tmp/xdg/houki-egov-mcp/files/<law_revision_id>/a.jpg`
- どちらも無く、ホームディレクトリが `/tmp/home` → `saved.path` は `/tmp/home/.cache/houki-egov-mcp/files/<law_revision_id>/a.jpg`

### SPEC-EGOV-GET-ATTACHMENT-021 同じ法令履歴の同じファイル名を保存すると上書きする

同じ法令履歴の同じファイル名を `save: true` でもう一度保存すると、前のファイルを新しい中身で上書きし、エラーにしない。`saved.path` は前と同じで、`saved.bytes` は新しい中身のバイト数になる。

例: 中身 `ONE`（3 バイト）で保存したあと、同じ `src` を中身 `TWO!`（4 バイト）で保存 → 2 回目の `saved.bytes` は `4`、ファイルの中身は `TWO!`。

### SPEC-EGOV-GET-ATTACHMENT-022 一覧に updated があるファイルでは、応答にも updated を付ける

対象のファイルが `attached_files_info` に載っていて `updated` を持つときは、応答に `updated` を付ける（値は `attached_files_info` の `updated`）。本文にだけあるファイルと zip では `updated` を付けない。`save` の有無は問わない。

例: `attached_files_info` の `./pict/a.jpg` の `updated` が `2024-07-25T00:20:13+09:00` → 応答の `updated: "2024-07-25T00:20:13+09:00"`。本文にだけある `./pict/body-only.pdf` → `updated` は付かない。
