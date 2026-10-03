# 差分: get_article_references（20261003-law-type-and-reference-actions）

`specs/current/get_article_references/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 差分 `20261003-law-resolution`（012・031・044〜051）を取り込んだ後に、この差分を取り込む
- 「処理の流れ」の図の `K[…]` の文の `next_actions を作る（015・016）` を `next_actions を作る（015・016・052）` にする

## MODIFIED

### SPEC-EGOV-GET-ARTICLE-REFERENCES-015 条の分かる参照ごとに get_law の引数を next_actions で付ける

`next_actions` には、`resolved: true` の `external` と `internal` の参照ごとに `action: "get_law"` を 1 件入れる。ただし、条を持たない `external`（本文が「法令名（法令番号）」だけで、条・項・号が続かない参照）からは `get_law` を作らず、SPEC-EGOV-GET-ARTICLE-REFERENCES-052 の `get_toc` を入れる。`example` はそのまま `get_law` の inputSchema を通る引数で、次のとおり。

- `law_name`: external は参照先の法令名、internal は `law_name` に指定した法令の正式名称
- `article`: 参照の条。条を持たない internal（「第三号」のように条を書かない同一法令内の参照）は、指定した条
- `paragraph` / `item`: 参照にあるときだけ

`relative` と `resolved: false` の参照からは `next_actions` を作らない。

例: 所得税法 第57条の2 全体では、`get_law` の `example` は順に `{ law_name: "所得税法", article: "28", paragraph: 2 }`・`{ law_name: "雇用保険法", article: "10", paragraph: 5, item: "1" }`・`{ law_name: "職業能力開発促進法", article: "30の3" }`・`{ law_name: "所得税法", article: "57の2", paragraph: 2, item: "3" }`。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-036 next_actions の reason は、案内の種類ごとに決まった文言にする

`next_actions` の各要素の `reason` は次のとおり。

| 案内                                            | `reason`                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `external` の参照からの `get_law`               | `引用先の条を読めます`                                                                                                           |
| `internal` の参照からの `get_law`               | `同一法令内の参照先を読めます`                                                                                                   |
| 条を持たない `external` の参照からの `get_toc`  | `引用先の法令の目次を見られます`（SPEC-EGOV-GET-ARTICLE-REFERENCES-052）                                                         |
| 委任からの `search_fulltext`                    | `<target_law.title>の中で<対象の条の表記>を受けている条を探せます（ローカル DB がある場合。無ければ get_toc で目次から探してください）`。対象の条の表記は `第57条の2` の形 |

例: `law_name: "所得税法"`、`article: "57の2"` では、`第二十八条第二項` からの `get_law` の `reason` は `同一法令内の参照先を読めます`、雇用保険法からの `get_law` は `引用先の条を読めます`、施行規則への `search_fulltext` は `所得税法施行規則の中で第57条の2を受けている条を探せます（ローカル DB がある場合。無ければ get_toc で目次から探してください）`。

## ADDED

### SPEC-EGOV-GET-ARTICLE-REFERENCES-052 条を持たない external の参照からは、呼んだ条の番号を使わず、参照先の法令の get_toc を案内する

`resolved: true` の `external` で、本文に条が続かない参照（`article` を持たない）からは、`get_law` を作らない。代わりに `{ action: "get_toc", reason: "引用先の法令の目次を見られます", example: { law_name: <参照先の法令名> } }` を、`references` の順の位置に 1 件入れる。呼び出しで指定した `article` を、参照先の法令の条として使わない。同じ法令の `get_toc` が 2 件になるときは、SPEC-EGOV-GET-ARTICLE-REFERENCES-032 のとおり 1 件にする。

例: `{ law_name: "所得税法施行規則", article: "3" }` の参照 `日本国との平和条約に基づき日本の国籍を離脱した者等の出入国管理に関する特例法（平成三年法律第七十一号）`（`law_id: "403AC0000000071"`、`article` 無し）からは、`{ action: "get_toc", reason: "引用先の法令の目次を見られます", example: { law_name: "日本国との平和条約に基づき日本の国籍を離脱した者等の出入国管理に関する特例法" } }` を入れる。v0.17.0 では `{ action: "get_law", example: { law_name: "日本国との平和条約…特例法", article: "3" } }` で、特例法の第3条を指していた（2026-10-03 10:14 JST に houki-egov-dev 0.17.0 で確かめた。houki-egov-mcp #98）。
