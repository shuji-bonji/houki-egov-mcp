# 差分: get_article_references（20261003-law-resolution）

`specs/current/get_article_references/spec.md` に対する差分です。見出しの単位で置き換えます。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 「入力」の表の `article` の行の末尾に「。本則の条だけを対象にする（SPEC-EGOV-GET-ARTICLE-REFERENCES-046）」を足す
- 「処理の流れ」の図の `B -- いいえ --> E0["LAW_NOT_FOUND を返す"]` を `["LAW_NOT_FOUND を返す（023・044）"]` に、`D{"その条があるか。…"}` を `D{"その条が本則にあるか。paragraph を指定したときはその項があるか（018・046）"}` にする。`H[…]` の文の `internal（005・006）` の後に `、附則の条 suppl（047）、施行規則の「令第N条」（048）` を足し、`J[…]` の文を `「政令で定める」「…省令で定める」を委任にまとめ、委任先が確かなときだけ施行令・施行規則を付ける（012・013・049）` にする
- 「できないこと」に「附則の中の条を対象にすること（本則の条だけ。附則の条は `get_law` の `suppl_index` で読む）」と「本文の「附則第N条」が、どの附則の条かを特定すること（`kind: "suppl"`・`resolved: false` で返す）」を足す
- 「未決」の 13・17（→ #45）、14（→ #51）、15・16（→ #63）の行を消す

## MODIFIED

### SPEC-EGOV-GET-ARTICLE-REFERENCES-012 「政令で定める」「…省令で定める」を委任として出現回数でまとめ、委任先が確かなときだけ施行令・施行規則を付ける

本文の「政令で定める」「…省令で定める」「内閣府令で定める」（例: `財務省令で定める`）は、`references` ではなく `delegations` に入れる。同じ文言は 1 件にまとめ、`count` に出現回数を入れる。要素は次のフィールドを持つ。

| フィールド   | 内容                                                                                                                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`       | `delegation`                                                                                                                                                                                                                                          |
| `raw`        | 文言（例: `政令で定める`・`財務省令で定める`）                                                                                                                                                                                                        |
| `count`      | 出現回数                                                                                                                                                                                                                                              |
| `target`     | 政令は `enforcement_order`、省令・府令は `enforcement_rule`                                                                                                                                                                                           |
| `target_law` | 委任先の法令。`relation`（`target` と同じ値）・`law_id`・`title`・`url`。法律の本文では、「政令で定める」はその法律の施行令、省令・府令は SPEC-EGOV-GET-ARTICLE-REFERENCES-049 で確かなときだけその法律の施行規則。確かでないときと実在しないときは `null`（031）。委任先の条は特定しない |

例: 所得税法 第57条の2 全体では、`財務省令で定める`（`target_law` は所得税法施行規則 `340M50000040011`、`relation: "enforcement_rule"`。施行規則の法令番号 `昭和四十年大蔵省令第十一号` の `大蔵省令` は 049 の表で `財務省令` に当たる）と `政令で定める`（`target_law` は所得税法施行令 `340CO0000000096`、`relation: "enforcement_order"`）の 2 件。「財務省令で定める」が 2 回、「政令で定める」が 1 回出る本文では、`財務省令で定める` の `count` が 2、`政令で定める` の `count` が 1。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-031 委任先の法令が e-Gov に無いとき・確かでないときは、`target_law: null` で delegations に入れ、search_fulltext を作らない

委任先の施行令・施行規則が e-Gov に実在しないとき、または省令・府令の委任先が SPEC-EGOV-GET-ARTICLE-REFERENCES-049 で確かでないときも、その委任は `delegations` に入れる。`target_law` は `null` にし（キーは消さない）、SPEC-EGOV-GET-ARTICLE-REFERENCES-016 の `search_fulltext` の `next_actions` も作らない。

例: `law_name: "民法"`（民法施行令が e-Gov に無い）で本文が「政令で定めるところによる。」の条では、`delegations` は `[{ kind: "delegation", raw: "政令で定める", count: 1, target: "enforcement_order", target_law: null }]`、`next_actions` は `[]`（v0.17.0 では `target_law` のキーが無かった）。

## ADDED

### SPEC-EGOV-GET-ARTICLE-REFERENCES-044 法令名が完全一致しないときは、参照を取り出さず候補を付けた `LAW_NOT_FOUND` を返す

`law_name` の法令は SPEC-EGOV-COMMON-ERRORS-032 の規則で決める。略称辞書に law_id が無く、e-Gov の法令名検索の全件の中に題名の完全一致が無いときは、検索結果の先頭の法令の条文を取らず、032 の形の `LAW_NOT_FOUND`（`retryable: false`）を返す。`next_actions` の候補の要素は `action: "get_article_references"`、`example` は渡した引数（`article`・`paragraph`・`at` のうち渡したもの）の `law_name` だけを候補の題名に替えたもの。`at` を渡したときは、法令名の検索にも `asof=<at>` を付ける。

例: `{ law_name: "所得税法施行", article: "1" }` は `code: "LAW_NOT_FOUND"`、`next_actions` の先頭は `{ action: "get_article_references", example: { law_name: "所得税法施行令", article: "1" } }`。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-045 本文の法令番号・法令名で他の法令を引くときも、完全一致だけを使い、検索結果の全件から探す

本文の参照から他の法令を引くとき（SPEC-EGOV-GET-ARTICLE-REFERENCES-001 の法令番号、003 の候補名、010 の親の法律、012 の委任先、048 の兄弟の施行令）は、e-Gov の検索結果の全件（`total_count` の件数）の中から、法令番号は `law_info.law_num`、法令名は `revision_info.law_title` が完全に一致する法令だけを使う。完全一致が無ければ、検索結果の先頭の法令を使わず、その参照は `resolved: false`（001・003・048）、親の法律は無いもの（010 の「親の法律が分からない本文」と同じ）、委任先は `target_law: null`（031）にする。`at` を渡したときは、これらの検索にも `asof=<at>` を付ける。

例: 本文の「法令名（法令番号）」の法令番号で e-Gov が返した検索結果に、`law_num` が一致する法令が無く別の法令番号の法令だけがあるときは、その参照を `resolved: false`・`law_id` 無しで返す（v0.17.0 では検索結果の先頭の法令の `law_id` を付けて `resolved: true` にしていた）。候補名 `保険法` は、`/laws?law_title=保険法` の 114 件（2026-10-03 10:10 JST）の 78 件目の完全一致 `保険法`（`420AC0000000056`）に解決する（v0.17.0 では上位 50 件の中に無いため `resolved: false`）。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-046 対象の条は本則の中だけで探し、附則にだけある条番号は `ARTICLE_NOT_FOUND` にする

`article` の条は、本則（`MainProvision`）の中だけで探す。本則に無ければ、附則に同じ番号の条があってもその条の参照を取り出さず、`ARTICLE_NOT_FOUND` を返す。同じ番号の条を持つ附則があるときは、`hint` に `本則に第<条>条はありません。附則に同じ番号の条があります: 附則(<n1>) <改正法の法令番号、または 制定時>、…。このツールは本則の条だけを対象にします。附則の条の本文は get_law の suppl_index で読めます` を書き、`next_actions` に附則ごと（先頭の 5 件まで）の `{ action: "get_law", example: { law_name: <渡した law_name>, article: <渡した article>, suppl_index: <n> } }` を入れる。

例: `{ law_name: "消費税法", article: "100" }` は `code: "ARTICLE_NOT_FOUND"`、`next_actions` は `get_law` の `suppl_index: 27` と `suppl_index: 168` の 2 件（2026-10-03 の消費税法。SPEC-EGOV-GET-LAW-042 と同じ附則）。v0.17.0 では附則(27)の第100条の本文から参照を取り出していた。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-047 本文の「附則第N条」は `kind: "suppl"`・`resolved: false` で返し、本則の条への internal にしない

本文の「附則第N条」（項・号が続いてもよい。例: `附則第三条`・`附則第三十二条第二項`）は、`{ kind: "suppl", raw, article, paragraph, item, resolved: false }`（条・項・号は本文にあるものだけ）で返す。どの附則（制定時か、どの改正法か）の条かは特定しない。`kind: "internal"` にしないので、本則の条を指す `get_law` の `next_actions` を作らない。法令名が前に付く「<法令名>附則第N条」も同じく `kind: "suppl"` にし、`law_name` を付ける。

例: 本文に「附則第三条の規定により」とある条では、`references` に `{ kind: "suppl", raw: "附則第三条", article: "3", resolved: false }` が入り、`next_actions` に `{ action: "get_law", example: { law_name: …, article: "3" } }` は入らない（v0.17.0 では `{ kind: "internal", raw: "第三条", article: "3" }` になり、本則の第3条を指す `get_law` を案内していた）。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-048 施行規則の本文の「令第N条」は、兄弟の施行令への external で返す

`law_name` が施行規則（名前の末尾が「施行規則」）に解決され、末尾を「施行令」に替えた兄弟の施行令が e-Gov に実在する（SPEC-EGOV-GET-ARTICLE-REFERENCES-045 の完全一致）ときは、本文の「令第N条…」（候補名 `令`）をその施行令への `external`（`resolved: true`、`law_id` 付き）として返し、SPEC-EGOV-GET-ARTICLE-REFERENCES-015 の `get_law` の `next_actions` を付ける。条・項・号と、つながった項・号の引き継ぎ（009）は「法第N条」（010）と同じ。施行規則以外の本文の「令第N条」と、兄弟の施行令が無いときは、今までどおり候補名 `令` の `resolved: false`。施行令の本文の「規則第N条」は解決しない（候補名 `規則` の `resolved: false` のまま）。

例: `{ law_name: "所得税法施行規則", article: "3" }` の「令第二十四条第一号」は、`{ kind: "external", raw: "令第二十四条第一号", law_name: "所得税法施行令", law_num: "昭和四十年政令第九十六号", law_id: "340CO0000000096", article: "24", item: "1", resolved: true }`。`next_actions` に `{ action: "get_law", example: { law_name: "所得税法施行令", article: "24", item: "1" } }` が入る（2026-10-03 10:14 JST に houki-egov-dev 0.17.0 で同じ引数を呼ぶと、`law_name: "令"`・`resolved: false` だった）。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-049 省令・府令の委任は、施行規則を定めた命令の名前が委任の文言と合うときだけ施行規則に結び付ける

「<命令の名前>で定める」（`財務省令で定める`・`厚生労働省令で定める`・`内閣府令で定める` など）の委任は、その法律の施行規則（名前の末尾に「施行規則」を付けた法令）が e-Gov に実在し、かつ施行規則の法令番号（例: `昭和四十年大蔵省令第十一号`）の命令の名前（`大蔵省令`）が、委任の文言の命令の名前と同じか、次の表で同じ省に当たるときだけ、`target_law` に施行規則を入れる。

| 施行規則の法令番号の命令の名前 | 委任の文言の命令の名前 |
| ------------------------------ | ---------------------- |
| `大蔵省令`                     | `財務省令`             |
| `厚生省令`・`労働省令`         | `厚生労働省令`         |
| `通商産業省令`                 | `経済産業省令`         |
| `運輸省令`・`建設省令`         | `国土交通省令`         |
| `郵政省令`・`自治省令`         | `総務省令`             |
| `文部省令`                     | `文部科学省令`         |
| `農林省令`                     | `農林水産省令`         |
| `総理府令`                     | `内閣府令`             |

次のときは `target_law: null`（SPEC-EGOV-GET-ARTICLE-REFERENCES-031）にする。`target` は `enforcement_rule` のまま。

- 命令の名前が合わない（例: 施行規則が `総理府令` で、委任の文言が `国土交通省令`）
- 委任の文言が `主務省令で定める`（どの省か本文からは決まらない）
- 施行規則の法令番号の命令の名前が複数の省の連名（例: `内閣府・総務省令`）で、委任の文言と同じでない

「政令で定める」は今までどおり施行令に結び付ける（施行令が実在しないときは `null`）。施行令・施行規則の本文で委任先が自身になるとき（013）も今までどおり。

例: 道路交通法 第2条（2026-10-03 10:13 JST に houki-egov-dev 0.17.0 で確かめた。道路交通法施行規則 `335M50000002060` の法令番号は `昭和三十五年総理府令第六十号`）では、`内閣府令で定める`（`count: 9`）は `総理府令` が `内閣府令` に当たるので `target_law` は道路交通法施行規則、`環境省令で定める` と `国土交通省令で定める`（本文は「内閣府令・環境省令で定める」「内閣府令・国土交通省令で定める」の連名）は `target_law: null` で、`search_fulltext` の `next_actions` を作らない（v0.17.0 では 3 件とも `target_law` が道路交通法施行規則だった）。労働基準法 第15条の `厚生労働省令で定める` は、労働基準法施行規則の法令番号 `昭和二十二年厚生省令第二十三号` の `厚生省令` が表で `厚生労働省令` に当たるので、`target_law` は労働基準法施行規則（`322M40000100023`）のまま。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-050 施行規則の条からは、施行令への委任の search_fulltext を作らない

`law_name` が施行規則のとき、本文の「政令で定める」の委任（`target_law` が施行令）からは、SPEC-EGOV-GET-ARTICLE-REFERENCES-016 の `search_fulltext` の `next_actions` を作らない。施行令の本文は施行規則の条を「規則第N条」と書かないため、呼び名 `規則` の `keyword`（例: `所得税法施行令 規則第一条`）で当たる見込みが低いからである。`delegations` の要素と `target_law` は今までどおり返す。

例: `law_name: "所得税法施行規則"` で本文が「政令で定める場合」の条では、`delegations` に `政令で定める`（`target_law` は所得税法施行令 `340CO0000000096`）が入り、`next_actions` に `{ action: "search_fulltext", example: { keyword: "所得税法施行令 規則第…条" } }` は入らない。

### SPEC-EGOV-GET-ARTICLE-REFERENCES-051 対象の法令本文の取得で e-Gov が 404・時点の 400 を返したときは `LAW_NOT_FOUND`・`INVALID_ARGUMENT`

`law_name` の法令を決めた後の法令本文の取得で e-Gov が 429 以外の 4xx を返したときは、SPEC-EGOV-COMMON-ERRORS-033 の表のとおりに返す。404・`404004` は `LAW_NOT_FOUND`（`retryable: false`）、400・`400044` は `INVALID_ARGUMENT`（`tool: "get_article_references"`、`detail.issues[0].path: "at"`）、そのほかの 4xx は `SOURCE_API_ERROR`（`retryable: false`、`detail.status`）。本文の参照から他の法令を引く検索（045）が 400・`400044` を返したときも、同じ `INVALID_ARGUMENT` にする。

例: `{ law_name: "所得税法", article: "57の2", at: "2000-01-01" }` は `code: "INVALID_ARGUMENT"`、`detail.issues: [{ path: "at", message: "e-Gov が受け付ける時点の範囲の外です" }]`。
