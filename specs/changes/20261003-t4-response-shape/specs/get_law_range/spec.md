# 差分: get_law_range（20261003-t4-response-shape）

`specs/current/get_law_range/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える

## MODIFIED

### SPEC-EGOV-GET-LAW-RANGE-008 文字数の上限を超える範囲は条の単位で打ち切り、続きの条番号と、同じ条件で呼び直す例を返す

返す条本文の文字数（条ごとの見出しを含む）が `max_chars` を超える手前で、条の単位で打ち切る。条の途中では切らない。打ち切ったときは次を返す。

| フィールド                                   | 内容                                                                                                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `range.truncated`                            | `true`                                                                                                                                                                                                                                     |
| `range.next_from_article`                    | 続きの最初の条番号。`from_article` にそのまま渡せる                                                                                                                                                                                        |
| `range.first_article` / `range.last_article` | 返した最初と最後の条（例: `第5条` / `第6条`）                                                                                                                                                                                              |
| `range.body_chars`                           | 返した条本文の文字数（`max_chars` 以下）                                                                                                                                                                                                   |
| `range.note`                                 | 何件のうち何件を返したかと、`from_article: "<続きの条番号>"` を付けて呼び直す案内                                                                                                                                                          |
| `range.next_actions`                         | `get_law_range` の呼び出し例。`reason` は `同じ範囲の続きの条から取れます`、`example` は `law_name`・範囲の `path`（附則なら `suppl_index`）・`from_article` に、呼び出し側が渡した `max_chars` と `at` を加えたもの（渡さなかった引数は入れない） |

`example` のとおりに呼び直したときに、文字数の上限と時点が最初の呼び出しと変わらないようにするため、渡された `max_chars` と `at` は値を変えずにそのまま写す。`markdown` の末尾にも同じ `note`（`上限で打ち切りました` を含む）を書く。

例: 本文 900・900・2,500 文字の 3 条を持つ節を `max_chars: 2000` で取ると、2 条を返して `truncated: true`、`next_from_article: "7"`、`next_actions[0].example` は `{ law_name, path: "Part2/Chapter2/Section1", from_article: "7", max_chars: 2000 }`（v0.16.0 では `max_chars` が入らず、例のとおりに呼び直すと既定の 30,000 文字で返っていた）。同じ節を `max_chars: 2000, at: "2020-04-01"` で取ると `example` は `{ law_name, path: "Part2/Chapter2/Section1", from_article: "7", max_chars: 2000, at: "2020-04-01" }`。`max_chars` を省いて既定の 30,000 文字で打ち切ったときは、`example` に `max_chars` を入れない。

### SPEC-EGOV-GET-LAW-RANGE-025 応答の `meta`

応答の `meta` は次のフィールドを持つ。`at` を省いたときもキーは無くならない。

| フィールド     | 内容                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| `law_id`       | e-Gov の法令 ID                                                        |
| `title`        | 法令名                                                                 |
| `law_num`      | 法令番号                                                               |
| `retrieved_at` | 取得日時（ISO 8601 の UTC）                                            |
| `url`          | e-Gov 法令検索の法令のページ。`https://laws.e-gov.go.jp/law/<law_id>` |
| `at`           | 渡した `at`。`at` を省いたときは `null`                                |

例: 法令 ID `999AC0000000001`・法令名 `テスト法`・法令番号 `令和七年法律第一号` の法令で `chapter: 1` を取ると、`meta` は `{ law_id: "999AC0000000001", title: "テスト法", law_num: "令和七年法律第一号", retrieved_at: <ISO 8601>, url: "https://laws.e-gov.go.jp/law/999AC0000000001", at: null }`（v0.16.0 では `at` のキーが無かった）。
