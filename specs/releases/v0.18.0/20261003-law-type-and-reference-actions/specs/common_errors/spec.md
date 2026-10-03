# 差分: common_errors（20261003-law-type-and-reference-actions）

`specs/current/common_errors/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える

## MODIFIED

### SPEC-EGOV-COMMON-ERRORS-013 inputSchema の検査で返す `INVALID_ARGUMENT` の `error` は、決まった前置きの後に問題を `<path>: <message>` の形で続ける

SPEC-EGOV-COMMON-ERRORS-003・004 のエラーの `error` は、`引数が tools/list の inputSchema に合いません: ` の後に、`detail.issues` の各要素を `<path>: <message>` の形にして `; ` 区切りで続けた文字列である。`path` は空にならない（SPEC-EGOV-COMMON-ERRORS-021）ので、`<message>` だけの要素は無い。`message` は SPEC-EGOV-COMMON-ERRORS-022 の文である。

例:

| 呼び出し                                               | `error`                                                                                                                              | `detail.issues`                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `explain_law_type` に `name: 123`                      | `引数が tools/list の inputSchema に合いません: name: 文字列で指定してください`                                                      | `[{ path: "name", message: "文字列で指定してください" }]`                                                        |
| `explain_law_type` に `name: "政令", typo: 1`          | `引数が tools/list の inputSchema に合いません: typo: inputSchema に無い引数です`                                                    | `[{ path: "typo", message: "inputSchema に無い引数です" }]`                                                      |
| `search_law` に `keyword: "消費税", law_type: "Bogus"` | `引数が tools/list の inputSchema に合いません: law_type: Constitution・Act・CabinetOrder・ImperialOrder・MinisterialOrdinance・Rule のどれかで指定してください` | `[{ path: "law_type", message: "Constitution・Act・CabinetOrder・ImperialOrder・MinisterialOrdinance・Rule のどれかで指定してください" }]` |
| `search_law` に `keyword: 1, limit: "x"`               | `引数が tools/list の inputSchema に合いません: keyword: 文字列で指定してください; limit: 整数で指定してください`                    | `[{ path: "keyword", message: "文字列で指定してください" }, { path: "limit", message: "整数で指定してください" }]` |

（v0.17.0 の 3 行目の文は `Act・CabinetOrder・ImperialOrdinance・MinisterialOrdinance・Rule のどれかで指定してください`。`law_type` の選択肢を SPEC-EGOV-SEARCH-LAW-018 で変えたので、文も変わる。）
