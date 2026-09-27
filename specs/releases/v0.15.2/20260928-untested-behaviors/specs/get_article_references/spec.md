# 差分: get_article_references（20260928-untested-behaviors）

`specs/current/get_article_references/spec.md` に対する差分です。見出しの単位で置き換えます。

- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す

## ADDED

### SPEC-EGOV-GET-ARTICLE-REFERENCES-023 法令に解決できない law_name はエラー `LAW_NOT_FOUND` で、resolve_abbreviation・search_law を案内する

`law_name` が略称辞書にも e-Gov の法令名検索にも当たらないときは、条文を取得せずにエラー `LAW_NOT_FOUND` を返す。`hint` は `略称辞書 / e-Gov 法令検索で該当なし。表記を確認してください`、`next_actions` は次の 2 件をこの順で持つ。

1. `action: "resolve_abbreviation"`、`example: { abbr: <渡した law_name> }`
2. `action: "search_law"`、`example: { keyword: <渡した law_name> }`

例: `law_name: "存在しない法"`、`article: "1"` は `{ code: "LAW_NOT_FOUND", error: "法令が見つかりません: 存在しない法", hint: "略称辞書 / e-Gov 法令検索で該当なし。表記を確認してください", next_actions: [{ action: "resolve_abbreviation", example: { abbr: "存在しない法" }, … }, { action: "search_law", example: { keyword: "存在しない法" }, … }] }`。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-024 houki-egov-mcp の管轄外の略称はエラー `OUT_OF_SCOPE` で、管轄の MCP を案内する

`law_name` が略称辞書で houki-egov-mcp 以外の管轄（`source_mcp_hint` が `houki-egov` でない）の名前のときは、e-Gov に問い合わせずにエラー `OUT_OF_SCOPE` を返す。`hint` は `<管轄>-mcp の対応 tool に切り替えてください`、`next_actions` は `action: "delegate_to_mcp"`、`example: { mcp: <管轄> }` の 1 件。

例: `law_name: "消基通"`、`article: "1"` は `{ code: "OUT_OF_SCOPE", hint: "houki-nta-mcp の対応 tool に切り替えてください", next_actions: [{ action: "delegate_to_mcp", example: { mcp: "houki-nta" }, … }] }`。e-Gov への問い合わせは 0 回。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-025 e-Gov からの取得に失敗したら、どの段階でも SOURCE_* のエラーを返し、取り出した参照は返さない

条文の取得、法令番号での問い合わせ（SPEC-EGOV-GET-ARTICLE-REFERENCES-001）、法令名での問い合わせ（SPEC-EGOV-GET-ARTICLE-REFERENCES-003・親の法律・委任先の法令）のどれで失敗しても、次のエラーを返す。応答はエラーだけで、`references`・`delegations`・`meta`・`coverage` は返さない。

| 失敗                                     | `code`                | `retryable` |
| ---------------------------------------- | --------------------- | ----------- |
| タイムアウト                             | `SOURCE_TIMEOUT`      | `true`      |
| HTTP 429                                 | `SOURCE_RATE_LIMITED` | `true`      |
| HTTP 5xx                                 | `SOURCE_API_ERROR`    | `true`      |

例: `law_name: "所得税法"`、`article: "57の2"` で、(a) 条文の取得がタイムアウトすると `code: "SOURCE_TIMEOUT"`、(b) 法令番号 `昭和四十九年法律第百十六号` の問い合わせが HTTP 429 を返すと `code: "SOURCE_RATE_LIMITED"`、(c) 法令名の問い合わせが HTTP 503 を返すと `code: "SOURCE_API_ERROR"`。どの場合も応答のキーは `error`・`code`・`hint`・`next_actions`・`retryable`・`detail` だけ。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-026 条が無いときの ARTICLE_NOT_FOUND は、渡した law_name で get_toc を案内する

SPEC-EGOV-GET-ARTICLE-REFERENCES-018 のうち条が無いときの `ARTICLE_NOT_FOUND` は、`hint: "法令名・条番号を確認してください。get_toc で目次を確認できます"` と、`next_actions` に `action: "get_toc"`、`example: { law_name: <渡した law_name のまま> }` の 1 件を持つ。略称を渡したときは略称のまま入れる。

例: `law_name: "所法"`、`article: "999"` は `{ code: "ARTICLE_NOT_FOUND", error: "条文が見つかりません: 第999条 in 所得税法", hint: "法令名・条番号を確認してください。get_toc で目次を確認できます", next_actions: [{ action: "get_toc", example: { law_name: "所法" }, … }] }`。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-027 項が無いときの ARTICLE_NOT_FOUND は next_actions を付けず、hint で項番号の数え方を書く

SPEC-EGOV-GET-ARTICLE-REFERENCES-018 のうち `paragraph` の項が条に無いときの `ARTICLE_NOT_FOUND` は、`next_actions` のキーを持たず、`hint: "項番号は 1 始まりで指定してください。条全体が必要なら paragraph を省略してください"` を持つ。

例: `law_name: "所得税法"`、`article: "57の2"`、`paragraph: 9` は `{ code: "ARTICLE_NOT_FOUND", error: "項が見つかりません: 第57条の2第9項", hint: "項番号は 1 始まりで指定してください。条全体が必要なら paragraph を省略してください" }`（`next_actions` のキーが無い）。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-028 INVALID_ARTICLE_NUM の hint に受け付ける条番号の形の例を書く

SPEC-EGOV-GET-ARTICLE-REFERENCES-019 の `INVALID_ARTICLE_NUM` は、`hint: "条番号は \"30\"、\"30の2\"、\"第三十条\"、\"第三十条の二\" のいずれかの形式で指定してください"` を持ち、`next_actions` のキーを持たない。

例: `law_name: "所得税法"`、`article: "三〇"` は `{ code: "INVALID_ARTICLE_NUM", hint: "条番号は \"30\"、\"30の2\"、\"第三十条\"、\"第三十条の二\" のいずれかの形式で指定してください", … }`。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-029 略称辞書の正式名称が本文に条を伴って出たら、e-Gov に問い合わせずに external で解決する

略称辞書のうち houki-egov-mcp 管轄で `law_id` を持つ法令の正式名称が、本文に法令番号なしで条を伴って出てきたときは、e-Gov に法令名で問い合わせずに、辞書の `law_id`・`law_num` を使った `external`（`resolved: true`）として返す。`next_actions` には SPEC-EGOV-GET-ARTICLE-REFERENCES-015 の `get_law` が付く。

例: 本文が「消費税法第三十条の規定を準用する。」の条では、`references` は `[{ kind: "external", raw: "消費税法第三十条", law_name: "消費税法", law_num: "昭和六十三年法律第百八号", law_id: "363AC0000000108", article: "30", resolved: true }]`。この呼び出しで e-Gov の法令名検索は 1 回も呼ばれない（e-Gov の検索の応答に消費税法が無くても `resolved: true` になる）。`next_actions` は `[{ action: "get_law", example: { law_name: "消費税法", article: "30" }, … }]`。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-030 名前だけの参照の候補名は、1 回の呼び出しで 20 種類までしか e-Gov に問い合わせない

SPEC-EGOV-GET-ARTICLE-REFERENCES-003 で e-Gov に問い合わせる候補名は、本文の出現順に数えて 20 種類まで。21 種類めからの候補名は問い合わせず、e-Gov に実在する法令名でも `resolved: false` のまま返す。上限に達したことは応答に書かない（`coverage` もほかのフィールドも変わらない）。

例: 本文が「架空一法第一条、架空二法第一条、…、架空二十一法第一条の規定。」（21 種類の候補名）の条で、e-Gov に `架空一法` と `架空二十一法` が実在するとき、`references` の 1 件めの `架空一法` は `resolved: true`（`law_id` 付き）、21 件めの `架空二十一法` は `resolved: false`（`law_id` 無し）。法令名での問い合わせは 20 回。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-031 委任先の法令が e-Gov に無ければ、target_law を付けずに delegations に入れ、search_fulltext を作らない

委任先の施行令・施行規則が e-Gov に実在しないときも、その委任は `delegations` に入れる。ただし `target_law` のキーを付けず、SPEC-EGOV-GET-ARTICLE-REFERENCES-016 の `search_fulltext` の `next_actions` も作らない。

例: `law_name: "民法"`（民法施行令が e-Gov に無い）で本文が「政令で定めるところによる。」の条では、`delegations` は `[{ kind: "delegation", raw: "政令で定める", count: 1, target: "enforcement_order" }]`（`target_law` のキーが無い）、`next_actions` は `[]`。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-032 next_actions は example が同じ案内を 1 回だけ入れる

`next_actions` に入れる案内のうち、`example` が同じものは最初の 1 件だけを残す。`references` の側は重複を除かない。

例: 本文が「第二十八条第二項の規定及び第二十八条第二項の規定による。」の条では、`references` は internal の 2 件、`next_actions` は `[{ action: "get_law", reason: "同一法令内の参照先を読めます", example: { law_name: "所得税法", article: "28", paragraph: 2 } }]` の 1 件。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-033 条全体を対象にしたとき、別の項に出た同じ委任の文言は 1 件にまとめて count を合算する

`paragraph` を省いて条全体を対象にしたとき、異なる項に同じ委任の文言が出てきたら、`delegations` では 1 件にまとめ、`count` に項をまたいだ出現回数の合計を入れる。

例: `law_name: "所得税法"` で、第 1 項が「政令で定める者は、次に掲げる。」、第 2 項が「前項の場合において政令で定める額とする。」の条では、`delegations` は `政令で定める`（`count: 2`、`target_law` は所得税法施行令 `340CO0000000096`）の 1 件。`search_fulltext` の `next_actions` も 1 件。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-034 meta に対象の法令の law_id・title・law_num・url・retrieved_at と、渡した at を入れる

成功の応答の `meta` は、SPEC-EGOV-GET-ARTICLE-REFERENCES-022 の `article`・`paragraph` に加えて次を持つ。

| フィールド     | 内容                                                                |
| -------------- | ------------------------------------------------------------------- |
| `law_id`       | 解決した法令の法令 ID                                               |
| `title`        | 解決した法令の正式名称                                              |
| `law_num`      | 解決した法令の法令番号                                              |
| `url`          | e-Gov 法令の公開ページの URL（`https://laws.e-gov.go.jp/law/<law_id>`） |
| `retrieved_at` | 応答を作った日時の ISO 8601 形式の文字列（UTC）                     |
| `at`           | 渡した `at`。`at` を省いたときはキーを持たない                      |

例: `law_name: "所得税法"`、`article: "57の2"`、`at: "2024-04-01"` の `meta` は `{ law_id: "340AC0000000033", title: "所得税法", law_num: "昭和四十年法律第三十三号", url: "https://laws.e-gov.go.jp/law/340AC0000000033", retrieved_at: "<ISO 8601>", at: "2024-04-01", article: "57の2" }`。`law_name: "所法"`、`article: "57の2"`、`paragraph: 1`（`at` なし）では `at` のキーが無く、`title` は `所得税法`、`paragraph` は `1`。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-035 target_law に委任先の法令の公開ページの URL を入れる

SPEC-EGOV-GET-ARTICLE-REFERENCES-012 の `target_law.url` は、委任先の法令の e-Gov 法令の公開ページの URL（`https://laws.e-gov.go.jp/law/<target_law.law_id>`）。

例: 所得税法 第57条の2 の `財務省令で定める` の `target_law.url` は `https://laws.e-gov.go.jp/law/340M50000040011`、`政令で定める` の `target_law.url` は `https://laws.e-gov.go.jp/law/340CO0000000096`。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-036 next_actions の reason は、案内の種類ごとに決まった文言にする

`next_actions` の各要素の `reason` は次のとおり。

| 案内                                            | `reason`                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `external` の参照からの `get_law`               | `引用先の条を読めます`                                                                                                           |
| `internal` の参照からの `get_law`               | `同一法令内の参照先を読めます`                                                                                                   |
| 委任からの `search_fulltext`                    | `<target_law.title>の中で<対象の条の表記>を受けている条を探せます（ローカル DB がある場合。無ければ get_toc で目次から探してください）`。対象の条の表記は `第57条の2` の形 |

例: `law_name: "所得税法"`、`article: "57の2"` では、`第二十八条第二項` からの `get_law` の `reason` は `同一法令内の参照先を読めます`、雇用保険法からの `get_law` は `引用先の条を読めます`、施行規則への `search_fulltext` は `所得税法施行規則の中で第57条の2を受けている条を探せます（ローカル DB がある場合。無ければ get_toc で目次から探してください）`。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-037 漢数字の条番号を渡しても、meta.article は get_law に渡せる表記で返す

`article` に `"第五十七条の二"` のような漢数字の条番号を渡しても、`meta.article` は `"57の2"` の形で返す。

例: `law_name: "所得税法"`、`article: "第五十七条の二"` の `meta.article` は `"57の2"`。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-038 施行令の条からの search_fulltext は、呼び名を「令」にする

`law_name` が施行令（名前の末尾が「施行令」）のときは、SPEC-EGOV-GET-ARTICLE-REFERENCES-016 の `search_fulltext` の `example.keyword` の呼び名を `令` にする（施行規則の本文が施行令を「令第N条」と書くため）。

例: `law_name: "所得税法施行令"`、`article: "1"` で本文が「財務省令で定める書類とする。」のとき、`delegations` は `財務省令で定める`（`target_law` は所得税法施行規則 `340M50000040011`）の 1 件、`next_actions` は `[{ action: "search_fulltext", example: { keyword: "所得税法施行規則 令第一条" }, … }]`。
