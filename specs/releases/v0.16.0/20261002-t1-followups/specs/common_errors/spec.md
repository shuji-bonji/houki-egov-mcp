# 差分: common_errors（20261002-t1-followups）

`specs/current/common_errors/spec.md` に対する差分です。差分 `20261001-t1-argument-guards`・`20261001-t2-error-codes`・`20261001-t3-normalize` の後に取り込みます。

- SPEC-EGOV-COMMON-ERRORS-022 は、差分 `20261001-t1-argument-guards` の `ADDED` にだけあり、まだ `specs/current/` に無い。この差分に `### SPEC-EGOV-COMMON-ERRORS-022` の見出しを置くと、`spec-ids check` が `specs/changes/` の中の同じ ID の見出し 2 つを採番の衝突として止めるので、見出しは置かない。扱いは `MODIFIED` と同じで、T1 の差分を取り込んだ後の SPEC-EGOV-COMMON-ERRORS-022 の本文（見出しの行を除く）を、下の「置き換える本文」で置き換える。見出しの行は変えない
- T1 の差分の本文から変わるのは、表の 1 行（型が `number` と `string` の和で、そのどちらでもない）と、「例:」の末尾の 1 文だけ

## MODIFIED（取り込みのときに置き換える本文）

#### 置き換える本文（SPEC-EGOV-COMMON-ERRORS-022 `detail.issues[].message` は違反の種類ごとに決まった日本語の 1 文）

SPEC-EGOV-COMMON-ERRORS-003・004 のエラーの `message` は、次の表の文である。検査の部品が作る英文（`must be string` など）はそのまま返さない。

| 違反                                     | `message`                                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 型が `string` でない                     | `文字列で指定してください`                                                                           |
| 型が `integer` でない（小数を含む）      | `整数で指定してください`                                                                             |
| 型が `number` でない                     | `数値で指定してください`                                                                             |
| 型が `number` と `string` の和（`type: ["number", "string"]` / `["string", "number"]`）で、そのどちらでもない（`null`・配列・`true` など） | `数値か文字列で指定してください`（`type` の並びによらずこの文） |
| 型が `boolean` でない                    | `true か false で指定してください`                                                                   |
| 型が `array` でない                      | `配列で指定してください`                                                                             |
| 型が `object` でない                     | `オブジェクトで指定してください`                                                                     |
| 必須の引数が無い                         | `必須の引数です`                                                                                     |
| `enum` に無い値                          | `<値1>・<値2>・… のどれかで指定してください`（`enum` の値を `・` でつなぐ）                          |
| `minimum` を下回る                       | `<minimum> 以上で指定してください`（例: `1 以上で指定してください`）                                 |
| `maximum` を上回る                       | `<maximum> 以下で指定してください`（例: `50 以下で指定してください`）                                |
| `pattern` に合わない（`at`）             | `YYYY-MM-DD の形で指定してください`                                                                  |
| `minLength: 1` に合わない（空文字）      | `空文字は指定できません`                                                                             |
| `minItems` を下回る                      | `<minItems> 件以上で指定してください`                                                                |
| `maxItems` を上回る                      | `<maxItems> 件以下で指定してください`                                                                |
| inputSchema に無い引数                   | `inputSchema に無い引数です`                                                                         |

例: `get_law` に `law_name: "民法", paragraph: 1.5` を渡すと `message` は `整数で指定してください`。`paragraph: 0` なら `1 以上で指定してください`。`search_law` に `keyword: "民法", limit: 51` を渡すと `50 以下で指定してください`。`get_law` に `law_name: "民法", at: "2024/04/01"` を渡すと `YYYY-MM-DD の形で指定してください`。`get_law` に `law_name: ""` を渡すと `空文字は指定できません`。`get_law_file` に `law_name: "民法", file_type: "pdf"` を渡すと `xml・json・html・rtf・docx のどれかで指定してください`。`verify_citations` に `citations: []` を渡すと `1 件以上で指定してください`。`get_law` に `law_name: "民法", article: "1", item: null` を渡すと `数値か文字列で指定してください`（`item` は `type: ["number", "string"]`）。
