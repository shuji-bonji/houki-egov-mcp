---
approved: 2026-10-12
pr: 122
implementation: required
targets: [get_toc]
---

# 変更: `get_toc` の `truncated` に、刈った理由を示す `truncated_by` を添える（egov #121）

- 対象: `get_toc` の `specs/current/get_toc/spec.md`
- 実装の変更の補足: 下の「実装の変更」
- 状態: 草案（承認待ち）
- 起こした日: 2026-10-12（JST）
- 起こした役: Spec Steward
- 対象 Issue: houki-egov-mcp #121（`get_toc` の `truncated: true` が `depth` で刈った意味で、`get_law_range` の `truncated`（文字数の上限）と取り違えやすい）
- 見つけた経緯: houki-hub `docs/reports/2026-10-12-integration-check.md` の Issue 候補 5
- 前提: main（`0faa502`、v0.20.1 の `04c3074` の上に docs・ci のコミットが 2 つ）から切った。`specs/changes/` にほかの差分は無い
- 版: 0.21.0（minor）。応答にフィールドを 1 つ足すため。DB のスキーマの版（3）と `INGEST_VERSION`（2）は変えない

## なぜ変えるか

`get_toc` に `depth` を渡して本則の階層を刈ると、応答の `truncated` が `true` になる（SPEC-EGOV-GET-TOC-010）。同じ名前の `truncated` を `get_law_range` の `range` も返すが、そちらは「`max_chars` の文字数の上限で条を打ち切った」という意味で、続きを取るための `next_from_article` と `next_actions` が付く（SPEC-EGOV-GET-LAW-RANGE-017・018）。

`get_toc` の `truncated: true` は「渡した `depth` で枝を刈った」という意味で、応答の大きさでは刈らず、続きを取る操作も無い。しかし応答には刈った理由を示すものが無いので、`get_toc` → `get_law_range` の順に使う読み手（houki-research-skill の feasibility-check のステップ ④）が、`get_toc` の `truncated` を「大きすぎて切れた」と取り違える余地がある。houki-hub の 2026-10-12 の試用記録でも、`truncated: true` の理由を応答だけからは決められなかった。

## 今の動き（v0.20.1）

- `depth` で本則の構造ノードを刈り、刈る前と後でノード数が違うときだけ `truncated: true`（`src/services/law-service.ts` の `getLawToc`。`countTocNodes(toc) !== fullCount`）
- `depth` を省いたとき、または `depth` が構造階層の深さ以上で何も刈らなかったときは `truncated: false`
- 刈った理由を示すフィールドは無い。`next_actions` も付かない
- tools/list の `get_toc` の `description` は「depth で階層を浅く打ち切れる」と書くだけで、`truncated` には触れていない。`get_law_range` の `description` は「入り切らなかったときは truncated と続きの条番号（next_from_article）を返す」と書いている
- 2026-10-12 03:25 JST に houki-egov-dev（0.20.1）で `{ law_name: "民法", depth: 1, suppl: "none" }` を呼ぶと、`node_count: 5`、`truncated: true` で、ほかに理由を示すものは無かった（下の「確かめた値」）

## 変えた後の動き

Issue の案 1（理由が分かる項目を足す）と案 3（仕様と説明文に書く）を合わせて採る。案 2（`depth_truncated` への改名）は、フィールドを消す変更になるので採らない（houki-hub `docs/DECISIONS.md` 2026-09-29 の T4「フィールドを消さない」）。

1. **`truncated_by` を足す（030）。** 応答の最上位に `truncated_by` を常に置く。`depth` で枝を刈って `truncated: true` のときは `"depth"`、刈らなかった（`truncated: false`）ときは `null`。値は今は `"depth"` と `null` の 2 つだけ
2. **`truncated` の意味を仕様に書く（010 の明記）。** `truncated` が `true` になるのは `depth` で刈ったときだけで、応答の大きさや文字数では刈らない。`get_law_range` の `range.truncated`（文字数の上限）とは意味が違い、続きを取る操作は無い（全階層が要るなら `depth` を省いて呼び直す）
3. **例に `truncated_by` を足す（016 の例）。** 振る舞いは変えない

## 変わる仕様 ID

| 種類     | 仕様 ID                                      |
| -------- | -------------------------------------------- |
| ADDED    | SPEC-EGOV-GET-TOC-030                        |
| MODIFIED | SPEC-EGOV-GET-TOC-010・SPEC-EGOV-GET-TOC-016 |
| REMOVED  | なし                                         |

ADDED 1、MODIFIED 2、REMOVED 0。触る dir は `get_toc` だけ。ID は `npx spec-ids next get_toc` で取った（2026-10-12 JST）。

## 変わらない振る舞い

- `truncated` の名前と値（`depth` で刈ったときだけ `true`）。既存のフィールドは消さず、名前も変えない
- `depth` の刈り方（010）、`node_count` の数え方（016）、`suppl: "full"` と `depth` を一緒に渡したときの附則の刈り方（019）、`depth` の検査（023）
- `markdown` の形（011・017）。刈ったことを markdown には書かない
- `get_law_range` の `range.truncated`・`next_from_article`・`next_actions`（SPEC-EGOV-GET-LAW-RANGE-017・018）と、`search_fulltext` の `short_tokens.truncated`（SPEC-EGOV-SEARCH-FULLTEXT-019・020）。名前も意味も変えない
- `get_toc` の `next_actions`。刈ったときにも付けない（下の「人が判断すること」2）

## 互換性（0.21.0 の CHANGELOG の「互換性」の節に書くもの）

| 場面                                         | 0.20.1             | 0.21.0                                     |
| -------------------------------------------- | ------------------ | ------------------------------------------ |
| `depth` で本則の枝を刈ったとき               | `truncated: true`  | `truncated: true`、`truncated_by: "depth"` |
| `depth` を省いた、または何も刈らなかったとき | `truncated: false` | `truncated: false`、`truncated_by: null`   |

応答のフィールドは消さず、名前も変えない。`truncated` だけを見ているスクリプトはそのまま動く。

## 実装 PR で直す文書

動きを変えない行で、仕様 ID を作らないもの。

| #   | 場所                                                                                   | 直すこと                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/tools/definitions.ts` の `get_toc` の `description`                               | 「depth で階層を浅く打ち切れる（…）」の後に、`打ち切ったときは truncated: true と truncated_by: "depth" を返す。truncated が true になるのは depth で刈ったときだけで、応答の大きさでは打ち切らない（get_law_range の truncated は文字数の上限の意味）` を足す |
| 2   | CHANGELOG 0.21.0                                                                       | 上の「互換性」の表。`Added` に `truncated_by`（#121）、`Changed` に `description` の文                                                                                                                                                                         |
| 3   | README の `get_toc` の段落（「本則と附則の分け方」の前）                               | `depth` で刈ったときは `truncated: true` と `truncated_by: "depth"` が返り、`get_law_range` の `truncated`（文字数の上限）とは意味が違うことを 1 文                                                                                                            |
| 4   | houki-research-skill `workflows/feasibility-check.md` のステップ ④                     | `get_toc` の `depth: 2` の例の次に、`get_toc` の `truncated: true` は `depth` で刈った印（`truncated_by: "depth"`）で、続きは無く、全階層が要るなら `depth` を省く、を 1 行。houki-research-skill のブランチで行い、egov 0.21.0 の追随と一緒に出す             |
| 5   | houki-hub `site/docs/reference/mcp/houki-egov.md`（tools/list から再生成）と呼び出し例 | `description` の変更を再生成で取り込む。`scripts/reference-examples/houki-egov/ja/get_toc.md` の応答に `truncated_by` を実測で足す                                                                                                                             |

## 実装の変更

- `src/services/law-service.ts` の `getLawToc`: 戻り値の型に `truncated_by: 'depth' | null` を足し、`truncated ? 'depth' : null` を返す。JSDoc に「`depth` で刈ったときだけ `true`。応答の大きさでは刈らない」を書く
- `src/tools/definitions.ts` の `get_toc` の `description`（上の表の 1）
- 受入テスト: `src/spec-tests/<yyyymmdd>-toc-truncated-by/get_toc.test.ts` に、030（刈ったとき `"depth"`、刈らなかったとき `null`、`depth` を省いたとき `null`、`depth` が構造階層の深さ以上のとき `null`）と、010・016 の例の `truncated_by` を書く。既存の 010・016 のテスト（`law-service.suppl-toc.test.ts`、`law-tree.test.ts`、`untested-20260928/get_toc.test.ts`）は期待値を変えない
- handlers と markdown の整形は変えない

## 取り込みのとき（Publisher）

- ADDED の 030 を `specs/current/get_toc/spec.md` の「できること」の末尾に足す。MODIFIED の 010・016 は見出しの行（題）も含めて、差分の見出しと本文に置き換える
- 差分の spec.md の冒頭に書いた、ID の無い節の変更（「関連する Issue」、「処理の流れ」の図、「できないこと」の 1 行）を行う
- この差分のフォルダーを `specs/releases/v0.21.0/20261012-toc-truncated-by/` へ移し（`git mv`）、この proposal.md の「状態」を取り込み済みにする
- CHANGELOG の 0.21.0 に閉じる Issue（#121）を書く。`Closes #121` は実装 PR の本文に書く

## 人が判断すること

1. **足すフィールドは `truncated_by`、値は `"depth"` か `null`。** Issue の例の `depth_applied: 2` は、渡した `depth` を返すだけで、刈ったかどうか（`depth` が構造階層の深さ以上なら刈らない）が分からない。`truncated_by` なら `truncated` と並べて読め、将来ほかの理由で刈るときも値を足すだけで済む。`null` にするのは T4（値が無いフィールドは `null` を入れ、フィールドを消さない）に合わせるため。**勧める: `truncated_by: "depth" | null`**
2. **刈ったときに `next_actions` を付けない。** `get_law_range` の `truncated` には続きを取る `next_actions` が付くので、`get_toc` にも「`depth` を省いて呼び直す」「`toc[].path` を `get_law_range` に渡す」を付ける案がある。しかし `depth` は読み手が自分で渡した引数で、続きが要るかは読み手が決めることなので、理由を示す `truncated_by` だけにする。付けるなら別の差分にする。**勧める: 付けない**
3. **版は 0.21.0（minor）。** 応答にフィールドを 1 つ足すだけなので patch（0.20.2）にする案もある。0.20.0 で `freshness.db_path` を足したときは minor にしたので、それに揃える。**勧める: 0.21.0**
4. **`markdown` には刈ったことを書かない。** `markdown` の末尾に「depth: 2 で刈りました」の行を足す案もあるが、構造化した応答で分かるので 011・017 は変えない。**勧める: 書かない**
5. **`search_fulltext` の `short_tokens.truncated`（走査を 150 件で打ち切った印）は触らない。** これも同じ名前で意味が違うが、`short_tokens` の中にあり、`get_law_range` と続けて使う場面が無い。**勧める: この差分の外**
6. **承認日。** この proposal.md の front matter の `approved` と `pr` を、shuji がマージの前に書く

## 確かめた値

| 何を                                            | 結果                                                                                                                                      | いつ・どうやって                                                                                    | 使った仕様 ID |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------- |
| `get_toc` を `depth` 付きで呼んだときの応答     | `{ law_name: "民法", depth: 1, suppl: "none" }` で `node_count: 5`、`truncated: true`。刈った理由を示すフィールドと `next_actions` は無い | 2026-10-12 03:25 JST、Cowork から houki-egov-dev（0.20.1）を呼んだ                                  | 010・016・030 |
| 同じ `get_toc` を `depth: 2` で呼んだときの応答 | `node_count: 44`、`truncated: true`                                                                                                       | houki-hub `docs/reports/2026-10-12-integration-check.md` の Issue 候補 5（2026-10-12 JST）          | 010・016      |
| `truncated` の決め方                            | `countTocNodes(toc) !== fullCount`。`depth` が構造階層の深さ以上なら刈らないので `false`                                                  | main `0faa502` の `src/services/law-service.ts` の `getLawToc` を読んだ                             | 010・030      |
| `get_law_range` の `truncated` の意味           | `range.truncated` は「文字数の上限で打ち切ったか」で、`next_from_article` と `next_actions` が付く                                        | main `0faa502` の `specs/current/get_law_range/spec.md`（SPEC-EGOV-GET-LAW-RANGE-017・018）を読んだ | —             |
| tools/list の `description`                     | `get_toc` は `truncated` に触れていない。`get_law_range` は「入り切らなかったときは truncated と続きの条番号（next_from_article）を返す」 | main `0faa502` の `src/tools/definitions.ts` を読んだ                                               | —             |
| 次の仕様 ID                                     | `SPEC-EGOV-GET-TOC-030`                                                                                                                   | 2026-10-12 JST、`npx spec-ids next get_toc`                                                         | 030           |

## 確かめていない点

- houki-hub の呼び出し例（`scripts/reference-examples/houki-egov/ja/get_toc.md`）が `truncated` を載せているか。載せていれば実装 PR の後の再生成で `truncated_by` が入る
- houki-research-skill の `examples/` に `get_toc` の `depth` 付きの応答を書いた箇所があるか（feasibility-check.md のステップ ④ 以外）

## この差分の外で見つけたこと

- family の中で `truncated` という名前のフィールドは 3 つ（`get_toc` の `truncated`、`get_law_range` の `range.truncated`、`search_fulltext` の `short_tokens.truncated`）あり、意味がそれぞれ違う。名前を揃える（例: `truncated_by` を 3 つに置く）かは、応答の形の横断テーマ（T4）の続きとして別に決める
