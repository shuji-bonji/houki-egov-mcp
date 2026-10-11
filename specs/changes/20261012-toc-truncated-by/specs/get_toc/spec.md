# 差分: get_toc（20261012-toc-truncated-by）

`specs/current/get_toc/spec.md` に対する差分です。

- `MODIFIED` の見出しは、current の同じ見出しの本文をこの本文で置き換える
- `ADDED` の `### SPEC-…` は、current の「できること」の末尾に足す
- 冒頭の「関連する Issue」に `#121（truncated_by。0.21.0）` を足す
- 「処理の流れ」の図の `F["本則を上から depth 階層で打ち切り、truncated: true（010）"]` を `F["本則を上から depth 階層で打ち切り、truncated: true・truncated_by: \"depth\"（010・030）"]` に替える
- 「できないこと」に次の 1 行を足す: 応答の大きさや文字数で目次を打ち切ること（`truncated` は `depth` で刈ったときだけ `true`。文字数の上限で打ち切るのは `get_law_range` の `range.truncated`）

## MODIFIED

### SPEC-EGOV-GET-TOC-010 `depth` で本則の階層を上から打ち切る

`depth` に 1 以上の数を渡したとき、本則の構造階層（編・章・節・款・目）を上から `depth` 階層までにし、それより下は `children` を空配列にする。条は階層として数えない（`depth` が構造階層の深さ以上なら条まで残る）。枝を刈ったときは応答の `truncated` を `true` にし、`truncated_by` を `"depth"` にする（SPEC-EGOV-GET-TOC-030）。附則の本数（`suppl_provisions` の件数）は `depth` で変わらない。

`truncated` が `true` になるのは `depth` で枝を刈ったときだけで、応答の大きさや文字数では打ち切らない。`get_law_range` の `range.truncated`（`max_chars` の文字数の上限で条を打ち切った印。SPEC-EGOV-GET-LAW-RANGE-017）とは意味が違い、続きを取る引数や `next_actions` は付かない。全階層が要るときは `depth` を省いて呼び直す。

例: 編 > 章 > 節 > 条の法令で、`depth: 1` は編だけ（編の `children` は空配列）、`depth: 2` は編と章、`depth: 3` は節まで（節の `children` は空配列）、`depth: 4` は条まで返す。章だけの法令に `depth: 1` を渡すと、章の `children` が空配列になり `truncated: true`、`truncated_by: "depth"`。`{ law_name: "民法", depth: 1, suppl: "none" }` は編 5 件だけを返し、`node_count: 5`、`truncated: true`、`truncated_by: "depth"` で、`next_actions` は無い（2026-10-12 JST に houki-egov-dev 0.20.1 で確かめたときは `truncated_by` が無かった）。

### SPEC-EGOV-GET-TOC-016 `node_count` は返した本則の目次のノード数

応答の `node_count` は、返した `toc` のノード（編・章・節・款・目と条）を入れ子の中まで数えた数である。附則のノードは数えない。`depth` で刈ったときは、刈った後の `toc` のノード数になる。

例: 第一編 > 第一章（第1条・第2条）・第二章 > 第一節（第3条）の本則と附則 2 本を持つ法令では、`node_count: 7`（編 1・章 2・節 1・条 3）、`truncated: false`、`truncated_by: null`。同じ法令に `depth: 1` を渡すと、`node_count: 1`、`truncated: true`、`truncated_by: "depth"`。

## ADDED

### SPEC-EGOV-GET-TOC-030 `truncated_by` で、`truncated` の理由を返す

応答の最上位に `truncated_by` を常に置く。`depth` で本則の枝を刈って `truncated` が `true` のときは `"depth"`、刈らなかった（`truncated` が `false`）ときは `null`。`depth` を省いたとき、および `depth` が構造階層の深さ以上で何も刈らなかったときは `null`（キーは無くならない）。値は `"depth"` と `null` の 2 つだけで、応答の大きさや文字数を理由にした値は無い。`markdown` には刈ったことを書かない。

例: 編 > 章 > 節 > 条の法令に `depth: 2` を渡すと `truncated: true`、`truncated_by: "depth"`。同じ法令に `depth: 99` を渡すと条まで返して `truncated: false`、`truncated_by: null`。`depth` を省いても `truncated: false`、`truncated_by: null`。`suppl: "full", depth: 1` のように附則の中の目次も刈ったとき（SPEC-EGOV-GET-TOC-019）も、本則を刈っていれば `truncated_by: "depth"`。
