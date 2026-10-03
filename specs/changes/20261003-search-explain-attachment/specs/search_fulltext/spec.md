# 差分: search_fulltext（20261003-search-explain-attachment）

`specs/current/search_fulltext/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「入力」の表から `domain` の行を消す（SPEC-EGOV-SEARCH-FULLTEXT-022）
- 「処理の流れ」の図の先頭を、`A["呼び出し（keyword・law_type・limit・scan_body）"] --> O{"keyword 全体が houki-egov 以外の管轄の略称か（037）"}`、`O -- はい --> E0["OUT_OF_SCOPE を返す。DB も e-Gov も引かない（037）"]`、`O -- いいえ --> B` にする。`E["keyword 全体が略称・通称なら正式名称に OR 展開し expanded_keywords を付ける（007）"]` を `E["keyword 全体が略称なら正式名称に OR 展開する。通称は元の語の条のヒットが 0 件のときだけ正式名称で探し直す（007）"]` にし、`N[…]` の文の `domain は絞らずに filters に記録（022）` を `filters.domain は requested: null・applied: false（022）` にする
- 「できないこと」の「`domain` で分野を絞ること（SPEC-EGOV-SEARCH-FULLTEXT-022）」を「分野で絞ること（`domain` の引数は無い。SPEC-EGOV-SEARCH-FULLTEXT-022）」にする
- 「未決」の 2・3・4（→ #55・#67）の行を消す

## MODIFIED

### SPEC-EGOV-SEARCH-FULLTEXT-007 略称は正式名称にも OR 展開して探し、通称は元の語の条のヒットが 0 件のときだけ正式名称で探し直す

`keyword` 全体が略称辞書で houki-egov-mcp の管轄の法令に当たるときは、当たり方で扱いを分ける。どちらも、展開したときだけ応答に `expanded_keywords: { from: <元の語>, to: <正式名称> }` を付ける。

- 略称（辞書のエントリの略称そのもの。例: `労基法`・`消法`）: 今までどおり、元の語に加えて正式名称でも探す（OR）。略称が 2 文字以下（例: `消法`）のときは正式名称だけで探す
- 通称（辞書のエントリの別名。例: `インボイス`・`適格請求書`）: まず元の語だけで探す。条のヒット（`match_type: "article"`）が 1 件以上あれば、正式名称では探さず、`expanded_keywords` も付けない。条のヒットが 0 件のときだけ、正式名称で探し直して、その結果を返す
- 正式名称そのもの（例: `消費税法`）と辞書に無い語（例: `課税仕入れ`）は展開しない

houki-nta-mcp の `nta_search_*`（houki-nta-mcp #21、v0.11.1）と同じ規則である。

例: `労基法` は `労基法` または `労働基準法` で探し、`expanded_keywords: { from: "労基法", to: "労働基準法" }`。`消法` は `消費税法` で探し、`expanded_keywords: { from: "消法", to: "消費税法" }`。標準の fixture の DB で、本文に `適格請求書` がある消費税法第30条・第30条の2があるとき、`適格請求書` は元の語だけで 2 件当たるので `expanded_keywords` を付けない（v0.17.0 では `expanded_keywords: { from: "適格請求書", to: "消費税法" }` を付け、本文に「消費税法」とある条も当たりうる）。本文にどの通称も無い DB で `インボイス` を渡すと、条のヒットが 0 件なので `消費税法` で探し直し、`expanded_keywords: { from: "インボイス", to: "消費税法" }` を付ける。

2026-10-03 10:16 JST に houki-egov-dev 0.17.0（手元の DB、`last_sync_date: "2026-09-19"`）で `{ keyword: "インボイス", limit: 5 }` を呼ぶと、1 件目は本文に「インボイス」がある `内国税の適正な課税の確保を図るための国外送金等に係る調書の提出等に関する法律施行規則` 第2条、2〜5 件目は本文に「消費税法」とある消費税法の附則の条（`附則(134) 48` など、`score_reasons` に `abbrev_match`）だった。この差分では、元の語で条のヒットがあるので 2〜5 件目は返らない（元の語だけでの件数は確かめていない）。

### SPEC-EGOV-SEARCH-FULLTEXT-018 2 文字の語だけのクエリは、既定では条本文を引かずにそのことを返す

法令名で絞っておらず 3 文字以上の語も無いクエリ（例: `控除`）で `scan_body` を渡さないときは、条本文を引かず、法令名・略称・番号の照合（SPEC-EGOV-SEARCH-FULLTEXT-009）の結果だけを返す。応答の `short_tokens` は次のとおり。

- `tokens`: 2 文字の語。`fts_min_token_length`: `3`
- `body_search`: `not_searched`
- `hits_by_match_type`: `{ article: 0, law_meta: <法令名で当たった件数> }`
- `note`: 語が 3 文字未満で索引に載らないことと、条の本文は引いていないこと（`trigram` の語と「条の本文は引いていません」を含む）
- `next_actions`: 2 件。1 件目は法令名を添える案内で、`action: "search_fulltext"`、`reason: "法令名を添えて keyword を「<法令名> <語を空白でつないだもの>」の形にすると、その法令の条本文を索引で引けます"`、`example` は付けない（語から法令名は決まらないため）。2 件目は `scan_body: true` で走査する形（`example: { keyword: <語を空白でつないだもの>, scan_body: true }`）

例: `控除` は `hits` がすべて `law_meta`、`short_tokens.next_actions[0]` は `{ action: "search_fulltext", reason: "法令名を添えて keyword を「<法令名> 控除」の形にすると、その法令の条本文を索引で引けます" }`（`example` のキーが無い）、`next_actions[1].example` は `{ keyword: "控除", scan_body: true }`。v0.17.0 では 1 件目の `example` が、語によらず `{ keyword: "民法 控除" }` だった（2026-10-03 10:16 JST に houki-egov-dev 0.17.0 で確かめた）。

### SPEC-EGOV-SEARCH-FULLTEXT-022 `domain` は引数に無く、`filters.domain` は絞り込みをしていないことを返す

tools/list の `search_fulltext` の inputSchema は `domain` を持たない（0.17.0 までは受け付けたが絞り込まなかった。`search_law` の SPEC-EGOV-SEARCH-LAW-016 と揃える）。`domain` を渡すと、inputSchema に無い引数として SPEC-EGOV-COMMON-ERRORS-004 の `INVALID_ARGUMENT`（`tool: "search_fulltext"`、`detail.issues: [{ path: "domain", message: "inputSchema に無い引数です" }]`）を返し、DB も e-Gov も引かない。

`source: "bulk"` の応答の `filters.domain` はキーを残し、`{ requested: null, applied: false, note: "分野での絞り込みはしていません（domain の引数は 0.18.0 で外しました）" }` を常に入れる。

例: `{ keyword: "適格請求書", domain: "tax" }` は `code: "INVALID_ARGUMENT"`、`detail.issues[0].path: "domain"`（v0.17.0 では `filters.domain.requested: "tax"`・`applied: false` の成功）。`{ keyword: "適格請求書" }` の `filters.domain` は `{ requested: null, applied: false, note: "分野での絞り込みはしていません（domain の引数は 0.18.0 で外しました）" }`（v0.17.0 の `note` は `domain 絞り込みは v0.5.0 では未実効です (…Phase 2-13…)`）。

## ADDED

### SPEC-EGOV-SEARCH-FULLTEXT-037 `keyword` 全体が houki-egov 以外の管轄の略称のときは、DB も e-Gov も引かずに `OUT_OF_SCOPE` を返す

`keyword` の前後の空白を除いた全体が、略称辞書（`resolveAbbreviation(name, { normalize: true })`）で houki-egov 以外の管轄（`source_mcp_hint` が `houki-egov` でない。通達は `houki-nta` など）のエントリに当たるときは、ローカル DB の有無によらず、DB も e-Gov も引かずにエラー `OUT_OF_SCOPE` を返す。本文は `search_law` の SPEC-EGOV-SEARCH-LAW-015 と同じ（`error` に正式名称と管轄、`hint` に管轄先の MCP、`next_actions` に `delegate_to_mcp`、`example.mcp` に管轄）。

`keyword` が管轄外の略称と別の語の組み合わせ（例: `消基通 仕入税額控除`）のときは、今までどおり本文を探す（管轄外の略称の語は法令名として扱わず、本文の語として探す）。

例: `{ keyword: "消基通" }` は、DB があってもなくても `code: "OUT_OF_SCOPE"`、`error` に `消費税法基本通達` と `houki-nta` を含み、`next_actions` は `[{ action: "delegate_to_mcp", example: { mcp: "houki-nta" } }]`（`reason` 付き）で、DB の照会と e-Gov への問い合わせは 0 回。v0.17.0 では、DB があると `source: "bulk"`・`count: 0`・`hits: []` の成功（2026-10-03 10:16 JST に houki-egov-dev 0.17.0 で確かめた）、DB が無いと `source: "api-fallback"` の成功で `fallback.code: "OUT_OF_SCOPE"`。`{ keyword: "消基通 仕入税額控除" }` は `OUT_OF_SCOPE` にしない。
