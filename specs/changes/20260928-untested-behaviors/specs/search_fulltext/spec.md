# 差分: search_fulltext（20260928-untested-behaviors）

`specs/current/search_fulltext/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-SEARCH-FULLTEXT-024 limit を省くと 10 件で打ち切る

`limit` を渡さないときは、score の高い順に並べた先頭の 10 件までを返す。

例: `試験用条文` を本文に含む条が 200 件ある DB で `{ keyword: "試験用条文" }` を渡すと `count: 10`。

### SPEC-EGOV-SEARCH-FULLTEXT-025 limit が 1 未満なら 1 件にする

`limit` に 1 未満の整数（`0` や負の数）を渡しても、エラーにせず `limit: 1` として扱い、1 件を返す。丸めたことは応答に出さない（`filters` にも `limit` は入らない）。

例: 同じ DB で `{ keyword: "試験用条文", limit: 0 }` と `{ keyword: "試験用条文", limit: -5 }` は、どちらも `count: 1`。標準の fixture の DB で `{ keyword: "適格請求書", limit: 0 }` を `tools/call` から渡しても `source: "bulk"`、`count: 1`。

### SPEC-EGOV-SEARCH-FULLTEXT-026 limit が 30 を超えると 30 件にする

`limit` に 30 を超える整数を渡しても、エラーにせず `limit: 30` として扱う。丸めたことは応答に出さない。

例: 同じ DB で `{ keyword: "試験用条文", limit: 31 }` と `{ keyword: "試験用条文", limit: 100 }` は、どちらも `count: 30`（`limit: 30` と同じ）。

### SPEC-EGOV-SEARCH-FULLTEXT-027 DB を開けないときも search_law に切り替える

ローカル DB のファイルを開けない（パスの途中が普通のファイル、パスがディレクトリ、権限が無いなど）ときも、エラーにせず SPEC-EGOV-SEARCH-FULLTEXT-002 と同じ形で `search_law` に切り替えて返す。`note` の先頭は `bulk DB を開けなかったため` で、`bulk DL 未実行のため` ではない。`next_actions` と `fallback` は SPEC-EGOV-SEARCH-FULLTEXT-002 と同じ。

例: DB のパスに、普通のファイル `afile` の下の `afile/x.db`（または既存のディレクトリ）を指定して `{ keyword: "" }` を渡すと、`source: "api-fallback"`、`note` は `bulk DB を開けなかったため、search_law (法令名のタイトル一致) にフォールバックしています。` で始まり `--bulk-download-everything` を含む、`next_actions[0].action: "bulk_download_everything"`、`fallback.code: "INVALID_ARGUMENT"`。

### SPEC-EGOV-SEARCH-FULLTEXT-028 search_law に切り替えたとき、keyword があれば法令名の検索結果を fallback に入れる

SPEC-EGOV-SEARCH-FULLTEXT-002・027 で `search_law` に切り替え、`keyword` が空でないときは、e-Gov の法令検索を引き、`search_law` の応答（`query`・`total_count`・`results`）をそのまま `fallback` に入れる。`keyword` が略称辞書の略称なら、正式名称で e-Gov を引き、`fallback.query.resolved` に正式名称が入る。`next_actions[1]` は `action: "search_law"`、`example: { keyword: <前後の空白を除いた keyword> }`。

例: 条が無い DB で、e-Gov の法令検索が消費税法（`law_id: "363AC0000000108"`、`law_type: "Act"`、`law_num: "昭和六十三年法律第百八号"`）の 1 件を返すようにして `{ keyword: " 消法 ", law_type: "Act", limit: 3 }` を渡すと、`keyword: "消法"`、`source: "api-fallback"`、`fallback.query: { keyword: "消法", law_type: "Act", resolved: "消費税法" }`、`fallback.total_count: 1`、`fallback.results[0]` は `{ law_id: "363AC0000000108", title: "消費税法", law_num: "昭和六十三年法律第百八号", law_type: "Act", url: "https://laws.e-gov.go.jp/law/363AC0000000108", … }`、`next_actions[1].example: { keyword: "消法" }`。

### SPEC-EGOV-SEARCH-FULLTEXT-029 search_law に切り替えたとき、law_type と丸めた後の limit を切り替え先に渡す

SPEC-EGOV-SEARCH-FULLTEXT-028 で e-Gov の法令検索（`/laws`）を引くときは、`law_title` に検索する法令名（略称なら正式名称）、`law_type` に渡した `law_type`（渡さなければ付けない）、`limit` に SPEC-EGOV-SEARCH-FULLTEXT-024〜026 で丸めた後の件数を付ける。

例: `{ keyword: "消法", law_type: "Act", limit: 3 }` では e-Gov の `/laws` を `law_title=消費税法`・`law_type=Act`・`limit=3` で引く。`{ keyword: "所得税", limit: 99 }` では `law_title=所得税法`・`limit=30` で引き、`law_type` は付けない。`{ keyword: "所得税2" }` では `law_title=所得税2`・`limit=10`。

### SPEC-EGOV-SEARCH-FULLTEXT-030 scan_body: true の走査は 150 件で打ち切り、そのことを返す

SPEC-EGOV-SEARCH-FULLTEXT-019 の走査で、2 文字の語をすべて含む条が 150 件に達したときは、そこで走査を打ち切る。応答の `short_tokens.truncated` を `true` にし、`short_tokens.note` の末尾に `走査は 150 件で打ち切っており、該当する条をすべて数えたものではありません。` を足す。150 件に達しないときは `truncated: false` で、この文は付かない。

例: 本文に「保存」を含む条が 200 件ある DB で `{ keyword: "保存", scan_body: true, limit: 30 }` を渡すと、`count: 30`、`short_tokens.body_search: "like_all_articles"`、`short_tokens.truncated: true`、`short_tokens.note` に `走査は 150 件で打ち切っており` を含む。同じ条が 149 件の DB では `truncated: false` で、`note` に `打ち切って` を含まない。

### SPEC-EGOV-SEARCH-FULLTEXT-031 法令名で絞った 2 文字の語の検索も 150 件で打ち切り、そのことを返す

SPEC-EGOV-SEARCH-FULLTEXT-020 の検索（`short_tokens.body_search: "like_in_law_scope"`）でも、2 文字の語をすべて含む条が 150 件に達したときは打ち切り、`short_tokens.truncated: true` と、`note` の末尾の `走査は 150 件で打ち切っており、該当する条をすべて数えたものではありません。` を返す。

3 文字以上の語で索引を引いたとき（`body_search: "fts_then_filter"`、SPEC-EGOV-SEARCH-FULLTEXT-017）は、該当が 150 件を超えても `truncated: false` のまま。

例: 条を 200 件持ち、どの条の本文にも「保存」と「試験用条文」がある法令 `大量条文試験法` の DB で、`{ keyword: "大量条文試験法 保存" }` は `count: 10`、`short_tokens.body_search: "like_in_law_scope"`、`short_tokens.truncated: true`、`law_scope[0].token: "大量条文試験法"`。条が 149 件の DB では `truncated: false`。`{ keyword: "試験用条文 保存" }` は 200 件の DB でも `body_search: "fts_then_filter"`、`truncated: false`。

### SPEC-EGOV-SEARCH-FULLTEXT-032 応答の keyword は前後の空白を除いた値にする

応答の `keyword` には、渡した `keyword` の前後の空白（半角空白・全角空白・タブ・改行）を除いた値を入れる。検索も除いた値で行う。`source: "bulk"` と `source: "api-fallback"` のどちらの応答でも同じ。

例: 標準の fixture の DB で `{ keyword: "  適格請求書　 " }`（末尾に全角空白を含む）と `{ keyword: "\t適格請求書\n" }` は、どちらも `keyword: "適格請求書"`、`count: 2`。条が無い DB で `{ keyword: " 消法 " }` は `keyword: "消法"`（SPEC-EGOV-SEARCH-FULLTEXT-028）。
