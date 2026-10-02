# 差分: get_article_references（20261003-t4-response-shape）

`specs/current/get_article_references/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える

## MODIFIED

### SPEC-EGOV-GET-ARTICLE-REFERENCES-022 meta に対象の条を利用者向けの表記で返し、項を指定しないときは `meta.paragraph` を null にする

成功の応答の `meta.article` には対象の条番号を `get_law` に渡せる表記で入れる。`paragraph` を指定したときは `meta.paragraph` にその項番号を入れ、指定しないときは `meta.paragraph` を `null` にする。

例: `article: "57の2"` では `meta.article` は `"57の2"`。`paragraph: 1` を指定したときは `meta.paragraph` が `1`。`paragraph` を指定しないときは `meta.paragraph` が `null`（v0.16.0 では `paragraph` のキーが無かった）。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-034 meta に対象の法令の law_id・title・law_num・url・retrieved_at と、渡した at を入れる

成功の応答の `meta` は、SPEC-EGOV-GET-ARTICLE-REFERENCES-022 の `article`・`paragraph` に加えて次を持つ。`at` を省いたときもキーは無くならない。

| フィールド     | 内容                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| `law_id`       | 解決した法令の法令 ID                                                   |
| `title`        | 解決した法令の正式名称                                                  |
| `law_num`      | 解決した法令の法令番号                                                  |
| `url`          | e-Gov 法令の公開ページの URL（`https://laws.e-gov.go.jp/law/<law_id>`） |
| `retrieved_at` | 応答を作った日時の ISO 8601 形式の文字列（UTC）                         |
| `at`           | 渡した `at`。`at` を省いたときは `null`                                 |

例: `law_name: "所得税法"`、`article: "57の2"`、`at: "2024-04-01"` の `meta` は `{ law_id: "340AC0000000033", title: "所得税法", law_num: "昭和四十年法律第三十三号", url: "https://laws.e-gov.go.jp/law/340AC0000000033", retrieved_at: "<ISO 8601>", at: "2024-04-01", article: "57の2", paragraph: null }`。`law_name: "所法"`、`article: "57の2"`、`paragraph: 1`（`at` なし）では `at: null`、`title` は `所得税法`、`paragraph` は `1`（v0.16.0 では `at` のキーが無かった）。
