# 差分: get_toc（20261003-t4-response-shape）

`specs/current/get_toc/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える

## MODIFIED

### SPEC-EGOV-GET-TOC-015 応答の `meta`

応答の `meta` は次のフィールドを持つ。`at` を省いたときもキーは無くならない。

| フィールド     | 内容                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| `law_id`       | e-Gov の法令 ID                                                        |
| `title`        | 法令名                                                                 |
| `law_num`      | 法令番号                                                               |
| `retrieved_at` | 取得日時（ISO 8601 の UTC。例: `2026-09-27T20:31:59.713Z`）            |
| `url`          | e-Gov 法令検索の法令のページ。`https://laws.e-gov.go.jp/law/<law_id>` |
| `at`           | 渡した `at`。`at` を省いたときは `null`                                |

例: 法令 ID `999AC0000000001`・法令名 `テスト法`・法令番号 `令和七年法律第一号` の法令を `at` なしで取ると、`meta` は `{ law_id: "999AC0000000001", title: "テスト法", law_num: "令和七年法律第一号", retrieved_at: <ISO 8601>, url: "https://laws.e-gov.go.jp/law/999AC0000000001", at: null }`（v0.16.0 では `at` のキーが無かった）。`at: "2020-04-01"` を渡したときは `at: "2020-04-01"`（SPEC-EGOV-GET-TOC-018）。
