# 差分: verify_citations（20260928-untested-behaviors）

`specs/current/verify_citations/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-VERIFY-CITATIONS-020 応答の note に判定の範囲を書く

応答は `note`（文字列）を持つ。`note` には次の 3 つを書く。

- 各件で確かめるのは条（指定があれば項・号）が e-Gov の法令にあるかだけで、引用した条文が主張を支えるかどうかは判定していないこと（`主張を支えるかどうかは判定していません` を含む）
- 法令名が完全一致しなかった件は、部分一致の候補があれば `ambiguous` にして `candidates` に入れ、候補は最大 5 件で `code` を付けないこと（`最大 5 件` と `code は付きません` を含む）
- e-Gov に問い合わせられなかったときは、件ごとの判定ではなくツール全体のエラー（`SOURCE_*`）を返すこと（`SOURCE_*` を含む）

`note` は、件の判定の結果（found・not_found・ambiguous の内訳）によらず同じ文である。

### SPEC-EGOV-VERIFY-CITATIONS-021 応答の meta に取得日時と時点を付ける

応答は `meta` を持つ。`meta.retrieved_at` は応答を組み立てた日時で、ISO 8601 の UTC 表記（例: `"2026-09-27T20:31:49.938Z"`）である。`at` を渡したときは `meta.at` に渡した値をそのまま入れ、`at` を渡さなかったときは `meta` に `at` のキーを置かない。

例: `{ citations: [{ law_name: "所得税法", article: "9" }], at: "2024-04-01" }` の `meta` は `{ retrieved_at: "<ISO 8601>", at: "2024-04-01" }`。`at` を省くと `meta` は `{ retrieved_at: "<ISO 8601>" }` だけになる。

### SPEC-EGOV-VERIFY-CITATIONS-022 at を渡すと、その時点の本文で条・項・号を確かめる

`at` を渡すと、全件について e-Gov にその時点（e-Gov の時点指定に `at` の値）の法令本文を問い合わせ、その本文で条・項・号の有無を判定する。`at` を省くと、時点を指定せずに（現在の本文で）問い合わせる。

例: 所得税法の現在の本文に第57条の2があり、`at: "2000-01-01"` の時点の本文には第57条の2が無く第9条があるとき、`{ citations: [{ law_name: "所得税法", article: "57の2" }, { law_name: "所得税法", article: "9" }], at: "2000-01-01" }` は、1 件目が `status: "not_found"`・`code: "ARTICLE_NOT_FOUND"`・`reason: "所得税法に第57条の2はありません"`、2 件目が `found` になる。同じ 1 件目を `at` なしで渡すと `found` になる。

### SPEC-EGOV-VERIFY-CITATIONS-023 号が無い件は ARTICLE_NOT_FOUND にし、実在した条と項は残す

項（または項が 1 つだけの条）はあるが、指定した `item` の号が無いときは、`status: "not_found"`、`code: "ARTICLE_NOT_FOUND"` を返す。条と項は実在したので `article` と `paragraph` を付け、`item` は付けない。`reason` は `<法令名><条のラベル>第<項番号>項に第<号番号>号はありません（号は <その項の号の数> 個）` の形である。

例: 所得税法第57条の2第2項に号が 2 つあるとき、`{ law_name: "所得税法", article: "57の2", paragraph: 2, item: 3 }` は `article.num: "57_2"`、`paragraph: 2`、`reason: "所得税法第57条の2第2項に第3号はありません（号は 2 個）"` の `not_found` になる。項が 1 つだけで号が 2 つの第9条に `{ law_name: "所得税法", article: "9", item: 5 }` を渡すと、`paragraph: 1`、`reason: "所得税法第9条第1項に第5号はありません（号は 2 個）"` になる。

### SPEC-EGOV-VERIFY-CITATIONS-024 号番号の書き方が読めない件は INVALID_ARTICLE_NUM にする

`item` が号番号として読めないときは、ツール全体をエラーにせず、その件を `status: "not_found"`、`code: "INVALID_ARTICLE_NUM"` にする。読めないのは、数値の `0`・負の数・小数と、`"8"`・`"8の2"`・`"第8号の2"`・`"八の二"` のどの形でもない文字列である。この件は、実在した条の `article` と項の `paragraph` を付け、`item` は付けない。

例: 項が 1 つだけの所得税法第9条に対し、`item: 0` は `reason: "号番号は 1 以上の整数で指定してください: 0"`、`item: 1.5` は `reason: "号番号は 1 以上の整数で指定してください: 1.5"`、`item: "abc"` は `reason` に `号番号の形式が不正です` を含む `INVALID_ARTICLE_NUM` の `not_found` になる。どれも `article.num: "9"`、`paragraph: 1` を持つ。

### SPEC-EGOV-VERIFY-CITATIONS-025 条・項・号が無い件と条番号・号番号が読めない件の next_actions は get_toc

次の件の `next_actions` は `get_toc` の 1 件だけで、`example` は `{ law_name: <引用の law_name。無ければ法令の正式名称> }` である。

- 条が無い件・項が無い件・号が無い件（`code: "ARTICLE_NOT_FOUND"`）
- 条番号が読めない件・号番号が読めない件（`code: "INVALID_ARTICLE_NUM"`）

例: `{ law_name: "所得税法", article: "57の2", paragraph: 5 }`、`{ law_name: "所得税法", article: "57の2", paragraph: 2, item: 3 }`、`{ law_name: "所得税法", article: "三〇" }`、`{ law_name: "所得税法", article: "9", item: "abc" }` の `next_actions` は、どれも `[{ action: "get_toc", example: { law_name: "所得税法" } }]`（`reason` 付き）である。

### SPEC-EGOV-VERIFY-CITATIONS-026 法令名が引けない件の next_actions は resolve_abbreviation と search_law

法令名が引けない件（SPEC-EGOV-VERIFY-CITATIONS-012、`code: "LAW_NOT_FOUND"`）の `next_actions` は、`resolve_abbreviation`（`example: { abbr: <law_name> }`）、`search_law`（`example: { keyword: <law_name> }`）の順の 2 件である。

例: `{ law_name: "架空法", article: "1" }` の `next_actions` は `[{ action: "resolve_abbreviation", example: { abbr: "架空法" } }, { action: "search_law", example: { keyword: "架空法" } }]`（それぞれ `reason` 付き）。`reason` は `e-Gov に「架空法」という法令名はありません`。

### SPEC-EGOV-VERIFY-CITATIONS-027 部分一致の候補がある件と e-Gov が知らない law_id の件の next_actions は search_law

次の件の `next_actions` は `search_law` の 1 件だけである。

- 部分一致の候補がある件（SPEC-EGOV-VERIFY-CITATIONS-013）: `example` は `{ keyword: <law_name> }`
- e-Gov が知らない law_id の件（SPEC-EGOV-VERIFY-CITATIONS-015）: `example` は `{ keyword: <law_name> }`、`law_name` が無ければ `{ keyword: <law_id> }`。`reason` は `e-Gov に law_id <law_id> の法令がありません`

例: `{ law_name: "所得税法施行", article: "1" }` は `[{ action: "search_law", example: { keyword: "所得税法施行" } }]`、`{ law_id: "999AC0000000999", article: "1" }` は `[{ action: "search_law", example: { keyword: "999AC0000000999" } }]`（それぞれ `reason` 付き）。

### SPEC-EGOV-VERIFY-CITATIONS-028 管轄外の件の next_actions は delegate_to_mcp

管轄外の件（SPEC-EGOV-VERIFY-CITATIONS-014、`code: "OUT_OF_SCOPE"`）の `next_actions` は `delegate_to_mcp` の 1 件だけで、`example.mcp` に略称辞書が示す管轄の MCP を入れる。`reason`（件の）には管轄の MCP の名前を含める。

例: `{ law_name: "消基通", article: "1" }` の `next_actions` は `[{ action: "delegate_to_mcp", example: { mcp: "houki-nta" } }]`（`reason` 付き）。件の `reason` は `「消費税法基本通達」は houki-nta の管轄です（houki-egov-mcp は法律・政令・省令の本文のみを扱います）`。

### SPEC-EGOV-VERIFY-CITATIONS-029 項が複数ある条で号だけを指定した件の next_actions は add_paragraph

項が複数ある条で号だけを指定した件（SPEC-EGOV-VERIFY-CITATIONS-009）の `next_actions` は `add_paragraph` の 1 件だけで、`example` は `{ law_name: <引用の law_name。無ければ法令の正式名称>, article: <渡した article そのまま>, paragraph: 1 }` である。この件は実在した条の `article` を付け、`reason` は `<法令名><条のラベル>は項が <項の数> 個あるため、号だけではどの項の号か決まりません` の形である。

例: 項が 2 つある所得税法第57条の2に `{ law_name: "所得税法", article: "57の2", item: 1 }` を渡すと、`next_actions` は `[{ action: "add_paragraph", example: { law_name: "所得税法", article: "57の2", paragraph: 1 } }]`（`reason` 付き）、`reason` は `所得税法第57条の2は項が 2 個あるため、号だけではどの項の号か決まりません`。`{ law_id: "340AC0000000033", article: "57の2", item: 1 }` でも `example.law_name` は `"所得税法"` になる。

### SPEC-EGOV-VERIFY-CITATIONS-030 部分一致の候補は先頭の 5 件までで、reason には全件数を書く

法令名が完全一致せず部分一致がある件（SPEC-EGOV-VERIFY-CITATIONS-013）の `candidates` は、e-Gov の部分一致の結果の先頭から 5 件までである。`reason` は `「<照合した法令名>」に完全一致する法令名が e-Gov に無く、部分一致が <部分一致の全件数> 件ありました` の形で、6 件以上あっても全件数を書く。

例: e-Gov の部分一致が `検証用テスト法第1` 〜 `検証用テスト法第7` の 7 件を返すとき、`{ law_name: "検証用テスト法", article: "1" }` の `candidates` の `title` は `["検証用テスト法第1", "検証用テスト法第2", "検証用テスト法第3", "検証用テスト法第4", "検証用テスト法第5"]`、`reason` は `「検証用テスト法」に完全一致する法令名が e-Gov に無く、部分一致が 7 件ありました`。

### SPEC-EGOV-VERIFY-CITATIONS-031 law_name と law_id の両方を書いた件は law_id だけで法令を決める

`law_name` と `law_id` の両方を書いた件は、`law_id` の法令で照合し、`resolved_by` は `law_id` になる。`law_name` は法令を決めるのに使わず、e-Gov の法令名検索もしない。`law_name` と `law_id` が別の法令を指していても、判定・`reason`・`next_actions` でそのことを知らせない。

例: `{ law_name: "民法", law_id: "340AC0000000033", article: "9" }` は `law.title: "所得税法"`、`resolved_by: "law_id"` の `found` になり、食い違いを示すフィールドは付かない。

### SPEC-EGOV-VERIFY-CITATIONS-032 空白だけの law_name / law_id は無いものとして扱う

前後の空白を除くと空になる `law_name` / `law_id` は、書かなかったものとして扱う。

- `law_name` と `law_id` のどちらも空白だけ（または片方が空白だけでもう片方が無い）の件があれば、SPEC-EGOV-VERIFY-CITATIONS-003 と同じツール全体のエラー `INVALID_ARGUMENT` を返す
- `law_id` が空白だけで `law_name` に値があれば、`law_name` で法令を決める

例: `citations: [{ law_name: "   ", article: "9" }, { law_id: " ", article: "1" }, { law_name: " ", law_id: "  ", article: "1" }]` は、`error` が `law_name と law_id のどちらも無い引用があります: citations[0], citations[1], citations[2]` の `INVALID_ARGUMENT` になる。`{ law_name: "所得税法", law_id: "  ", article: "9" }` は `resolved_by: "abbreviation"` の `found` になる。

### SPEC-EGOV-VERIFY-CITATIONS-033 同じ law_id が並んでも e-Gov への法令本文の問い合わせは 1 回にまとめる

1 回の呼び出しの中で同じ `law_id`（同じ `at`）の件が複数あっても、その law_id の法令本文を e-Gov に問い合わせるのは 1 回だけで、法令を決めるのにも条・項・号を確かめるのにもその結果を使う。

例: `citations: [{ law_id: "340AC0000000033", article: "9" }, { law_id: "340AC0000000033", article: "30" }, { law_id: "340AC0000000033", article: "57の2" }]` は、e-Gov への法令本文の問い合わせが `340AC0000000033` の 1 回だけで、3 件とも判定される。

### SPEC-EGOV-VERIFY-CITATIONS-034 e-Gov がタイムアウトしたときはツール全体を SOURCE_TIMEOUT にする

e-Gov への問い合わせがタイムアウトしたときは、件ごとの判定（`results`）を返さず、ツール全体のエラー `SOURCE_TIMEOUT`（`retryable: true`）を返す。ほかの件が判定できていても同じである。

例: 法令本文の問い合わせがタイムアウトするとき、`citations: [{ law_name: "所得税法", article: "9" }, { law_name: "架空法", article: "1" }]` は `code: "SOURCE_TIMEOUT"`、`retryable: true` のエラーになり、`results` を持たない。

### SPEC-EGOV-VERIFY-CITATIONS-035 e-Gov が 5xx を返したときはツール全体を SOURCE_API_ERROR にする

e-Gov が 5xx（例: 500・503）を返したときは、件ごとの判定を返さず、ツール全体のエラー `SOURCE_API_ERROR`（`retryable: true`）を返す。法令本文の問い合わせでも、法令名の検索でも同じである。

例: 法令本文の問い合わせが 503 を返すとき、`citations: [{ law_name: "所得税法", article: "9" }]` は `code: "SOURCE_API_ERROR"`、`retryable: true`。法令名の検索が 503 を返すとき、`citations: [{ law_name: "架空法", article: "1" }]` も `code: "SOURCE_API_ERROR"` になる。

### SPEC-EGOV-VERIFY-CITATIONS-036 e-Gov が 429 を返したときはツール全体を SOURCE_RATE_LIMITED にする

e-Gov が 429 を返したときは、件ごとの判定を返さず、ツール全体のエラー `SOURCE_RATE_LIMITED`（`retryable: true`）を返す。

例: 法令本文の問い合わせが 429 を返すとき、`citations: [{ law_name: "所得税法", article: "9" }]` は `code: "SOURCE_RATE_LIMITED"`、`retryable: true` になる。

### SPEC-EGOV-VERIFY-CITATIONS-037 削除された条をまとめた範囲表記を照合できる

`article` に `"534:535"` の形（削除された条をまとめた e-Gov の条番号）を渡すと、e-Gov の条番号が同じ範囲の条として照合する。`found` の件の `article.num` は `"534:535"`、`article.label` は番号の差が 1 なら `"第534条及び第535条"` の形である。範囲の片側が読めない（例: `"534:"`）ときは、SPEC-EGOV-VERIFY-CITATIONS-018 と同じ `INVALID_ARTICLE_NUM` の `not_found` になる。

例: 民法に e-Gov の条番号 `534:535` の条があるとき、`{ law_name: "民法", article: "534:535" }` は `article: { num: "534:535", label: "第534条及び第535条" }` の `found` になる。`{ law_name: "民法", article: "534" }` は `code: "ARTICLE_NOT_FOUND"`、`reason: "民法に第534条はありません"` の `not_found` になる。`{ law_name: "民法", article: "534:" }` は `INVALID_ARTICLE_NUM` になる。

### SPEC-EGOV-VERIFY-CITATIONS-038 漢数字・全角数字・「第…条」の条番号を e-Gov の形に直して照合する

`article` は、半角数字（`"30"`・`"30の2"`）のほか、漢数字（`"三十"`・`"第三十条の二"`）、全角数字（`"３０"`）、「第…条」を付けた形（`"第30条"`）でも、e-Gov の形の条番号に直して照合する。`found` の件の `article.num` は e-Gov の形、`article.label` は `第<数字>条` の形になる。

例: 所得税法に第30条と第30条の2があるとき、`"第三十条の二"` と `"30の2"` は `article: { num: "30_2", label: "第30条の2" }`、`"３０"`・`"第30条"`・`"三十"` は `article.num: "30"`、`article.label: "第30条"` の `found` になる。

### SPEC-EGOV-VERIFY-CITATIONS-039 略称辞書に law_id が無い法令名は e-Gov の法令名との完全一致で照合する

`law_name` が略称辞書に無いとき、または辞書にあっても `law_id` を持たない（houki-egov の管轄の）ときは、照合する法令名（辞書にあれば辞書の正式名称、無ければ `law_name` そのもの）で e-Gov の法令名を検索し、法令名が完全一致した法令で照合する。`resolved_by` は `exact_title` で、`law` は e-Gov の検索結果の `law_id`・`title`・`law_num`・`law_type`・`url` を持つ。

例: `電子帳簿保存法` は略称辞書で正式名称 `電子計算機を使用して作成する国税関係帳簿書類の保存方法等の特例に関する法律`（`law_id` 無し）に直り、その名前で e-Gov を検索して、`{ law_name: "電子帳簿保存法", article: "1" }` は `resolved_by: "exact_title"`、`law.law_id: "410AC0000000025"`、`law.law_num: "平成十年法律第二十五号"` の `found` になる。辞書の正式名称そのままの `所得税法施行令`（`law_id` 無し）も `resolved_by: "exact_title"`、`law.law_id: "340CO0000000096"` になる。
