---
approved: 2026-10-03
pr: 99
implementation: required
targets: [common_errors, get_article_references, search_fulltext, search_law]
---
# 変更: law_type の勅令の値を e-Gov に揃え、条の無い参照から get_toc を案内する（段階 5 追加分）

- 対象: `search_law` / `search_fulltext` / `common_errors` / `get_article_references` の `specs/current/<dir>/spec.md`
- 実装の変更の補足: 下の「実装の変更」
- 状態: 取り込み済み（v0.18.0）
- 起こした日: 2026-10-03（JST）
- 起こした役: Spec Steward
- 対象 Issue: houki-egov-mcp #97（`law_type` の `ImperialOrdinance` を e-Gov が受け付けない）、#98（条番号の付かない他法令の参照に、呼んだ条の番号で `get_law` を案内する）
- 決定の出典: 2026-10-03 JST の shuji の決定（#97・#98 を 0.18.0 に含める）。#97・#98 の本文（houki-hub `docs/notes/issues-2026-10-03-egov-0.18.0-spec/`）
- 前提: main `80ce271`（0.18.0 の仕様 PR 2 本 `20261003-law-resolution`・`20261003-search-explain-attachment` をマージした後）から切る。この差分が触る見出し（SEARCH-LAW-018・SEARCH-FULLTEXT-038・COMMON-ERRORS-013・GET-ARTICLE-REFERENCES-015・036・052）は、2 本の差分のどの見出しとも重ならない。取り込みは 2 本の後

## なぜ変えるか

どちらも 0.18.0 の仕様 PR を書く途中で見つけた不具合で、0.18.0 で仕様を変える `search_law`・`search_fulltext`・`get_article_references` に当たる。

- #97: `law_type` の選択肢 `ImperialOrdinance` は e-Gov の値ではない（e-Gov は `ImperialOrder`）。勅令で絞ると、`search_law` は必ず `SOURCE_API_ERROR`、`search_fulltext` は黙って 0 件になり、勅令で絞り込む方法が無い。応答の `law_type` には `ImperialOrder` が入るので、応答で見た値を引数に渡すと `INVALID_ARGUMENT` になる
- #98: 条を持たない他法令の参照から、呼んだ条の番号を参照先の法令の条として `get_law` を案内する。仕様（SPEC-EGOV-GET-ARTICLE-REFERENCES-015）は条を持たない internal の規則しか書いておらず、external の動きは実装だけが決めていた

## 確かめた値（2026-10-03 JST）

| 呼び出し                                                                                                        | 結果                                                                                                                                                  | 仕様 ID                    |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| e-Gov `/laws?law_type=<値>&limit=1`（10:18）                                                                    | `Constitution` 1 件・`ImperialOrder` 74 件・`Rule` 453 件・`Act`・`CabinetOrder`・`MinisterialOrdinance` は 200。`ImperialOrdinance` は 400・`400001` | SEARCH-LAW-018             |
| houki-egov-dev 0.17.0 `search_law { keyword: "健康保険法", law_type: "ImperialOrdinance" }`（10:19）            | `SOURCE_API_ERROR`・`retryable: false`・`detail.status: 400`                                                                                          | 018                        |
| houki-egov-dev 0.17.0 `search_fulltext { keyword: "健康保険法施行令", law_type: "ImperialOrdinance" }`（10:25） | `count: 0` の成功。`law_type` を外すと 3 件で、どれも `law_type: "ImperialOrder"`                                                                     | SEARCH-FULLTEXT-038        |
| houki-egov-dev 0.17.0 `search_fulltext { keyword: "日本国憲法 第9条" }`（11:57 ごろ）                           | DB の日本国憲法の `law_type` は `Constitution`                                                                                                        | 038                        |
| houki-egov-dev 0.17.0 `get_article_references { law_name: "所得税法施行規則", article: "3" }`（10:14）          | 条の無い external（特例法、`403AC0000000071`）から `get_law { …, article: "3" }`                                                                      | GET-ARTICLE-REFERENCES-052 |

## 確かめていない点

- `search_law` に `law_type: "ImperialOrder"` を渡したときの実際の応答（e-Gov が `law_type=ImperialOrder` を受け付けることだけを確かめた）
- 条を持たない external が 1 つの条に 2 回出るときの `get_toc` の重複の除き方の実例（032 の規則で 1 件になる前提）

## Issue ごとの変更

### #97 `law_type` の勅令の値

**今の動き（v0.17.0）**: inputSchema の `enum` は `Act`・`CabinetOrder`・`ImperialOrdinance`・`MinisterialOrdinance`・`Rule`。`ImperialOrdinance` で絞ると上の表のとおり。`Constitution` は選択肢に無い。

**変えた後の動き**: `enum` を e-Gov の値（`Constitution`・`Act`・`CabinetOrder`・`ImperialOrder`・`MinisterialOrdinance`・`Rule`）にする。`ImperialOrdinance` は `INVALID_ARGUMENT`。

| 種類     | 仕様 ID                                                 |
| -------- | ------------------------------------------------------- |
| ADDED    | SPEC-EGOV-SEARCH-LAW-018、SPEC-EGOV-SEARCH-FULLTEXT-038 |
| MODIFIED | SPEC-EGOV-COMMON-ERRORS-013（`enum` の文の例）          |

| 決めること                                                                     | 答え                                                                                                                                |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1. inputSchema の値（案 A: `ImperialOrder` に替える / 案 B: 両方を受けて直す） | 案 A。`ImperialOrdinance` は今まで一度も正しく動いていないので、替えて失うものは無い                                                |
| 2. `Constitution` を足すか                                                     | 足す。e-Gov も DB も `Constitution` で、`explain_law_type` も 0.18.0 で `Constitution` を解決する（SPEC-EGOV-EXPLAIN-LAW-TYPE-022） |
| 3. どの版で入れるか                                                            | 0.18.0                                                                                                                              |

### #98 条の無い external の参照の `next_actions`

**今の動き（v0.17.0）**: 条の無い external から、呼んだ条の番号で `get_law` を作る。

**変えた後の動き**: `get_law` を作らず、参照先の法令名で `get_toc` を案内する（案 A）。

| 種類     | 仕様 ID                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| ADDED    | SPEC-EGOV-GET-ARTICLE-REFERENCES-052                                                                                |
| MODIFIED | SPEC-EGOV-GET-ARTICLE-REFERENCES-015（条を持たない external の扱いを書く）、036（`get_toc` の `reason` の行を足す） |

| 決めること                                                                                               | 答え                                                                                                                |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 条を持たない external から何を入れるか（A: `get_toc` / B: `article` 無しの `get_law` / C: 何も入れない） | A。B は `get_law` が目次を返すので結果は同じだが、`action` の名前と返るものが合わない。C は参照先を読む道がなくなる |

## 変わらない振る舞い

- `search_law` / `search_fulltext` の `law_type` の絞り込み方（e-Gov の `law_type`、DB の `laws.law_type` と同じ値で絞る）と、`Act`・`CabinetOrder`・`MinisterialOrdinance`・`Rule` の呼び出し
- `get_article_references` の `references` の中身。条を持つ external・internal からの `get_law`、委任からの `search_fulltext`

## 実装 PR で直す文書

| #   | 場所                                                  | 直すこと                                                                                                        |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | README の `search_law` / `search_fulltext` の引数の表 | `law_type` の値を `Constitution`・`Act`・`CabinetOrder`・`ImperialOrder`・`MinisterialOrdinance`・`Rule` にする |

## 互換性（0.18.0 の CHANGELOG の「互換性」の節に書くもの）

| 場面                                                                | 0.17.0                                                                                        | 0.18.0                                                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `search_law` / `search_fulltext` に `law_type: "ImperialOrdinance"` | `search_law` は `SOURCE_API_ERROR`、`search_fulltext` は 0 件の成功                           | `INVALID_ARGUMENT`（`path: "law_type"`）。勅令は `ImperialOrder` で絞る                                 |
| `law_type: "Constitution"` / `"ImperialOrder"`                      | `INVALID_ARGUMENT`                                                                            | 受け付ける                                                                                              |
| `law_type` の `enum` の文（`INVALID_ARGUMENT` の `message`）        | `Act・CabinetOrder・ImperialOrdinance・MinisterialOrdinance・Rule のどれかで指定してください` | `Constitution・Act・CabinetOrder・ImperialOrder・MinisterialOrdinance・Rule のどれかで指定してください` |
| `get_article_references` の条を持たない external                    | `get_law`（呼んだ条の番号）                                                                   | `get_toc`（参照先の法令名）                                                                             |

## 呼び出し例への影響

2026-10-03 JST に houki-hub `scripts/reference-examples/houki-egov/ja/*.md` と houki-research-skill の `skills/houki-research/` を grep した。`ImperialOrdinance` を書いた箇所は無い（実装 PR の前に grep し直す）。hub の `get_article_references.md`（所得税法第57条の2）には条を持たない external が無いので、`next_actions` は変わらない。

## 実装の変更

- `src/tools/definitions.ts` の `search_law`・`search_fulltext` の `law_type` の `enum` を替える
- `buildReferenceNextActions()` で、`external` かつ `article` の無い参照からは `get_toc` を作る

## 取り込みのとき（Publisher）

- 差分 `20261003-law-resolution`・`20261003-search-explain-attachment` を先に取り込む
- ADDED の見出しを各 `specs/current/<dir>/spec.md` の「できること」の末尾に足し、MODIFIED は見出しの行も含めて置き換える。各差分の冒頭に書いた「入力」の表と「処理の流れ」の図の変更を行う
- 各 `specs/current/<dir>/spec.md` の承認日の行に「差分 `20261003-law-type-and-reference-actions` は YYYY-MM-DD（PR #N）」を足す
- この差分のフォルダーを `specs/releases/<実装を出したタグ>/20261003-law-type-and-reference-actions/` へ移し、「状態」を取り込み済みにする
- CHANGELOG の 0.18.0 に閉じる Issue（#97・#98）を足す。`Closes` は実装 PR の本文に書く

## 人が判断すること

1. **（#97）`Constitution` を選択肢に足すこと。** 足す側で書いた。足さないなら、日本国憲法（1 件）だけを種別で絞る方法が無いままになる。
2. **（#97）`ImperialOrdinance` を受け付けて直す案（B）を採らないこと。** 受け付ける値が 2 つになると、仕様と inputSchema の説明も 2 通りになる。
3. **承認日。** この proposal.md に承認日と PR 番号を書く。
