# 変更: T1 の差分の書き残しを直す（和の型の message、max_chars の例、REMOVED を指す未決）

- 対象: `specs/current/common_errors/spec.md`（SPEC-EGOV-COMMON-ERRORS-022）、`specs/current/get_law_range/spec.md`（SPEC-EGOV-GET-LAW-RANGE-023）、`specs/current/get_toc/spec.md` と `specs/current/search_fulltext/spec.md`（「未決」の各 1 行）
- 実装の変更: 要（テストを 1 件足すだけ。実装は `feat/20261001-0.16.0` に入っている。下の「実装の変更」）
- 承認日: 2026-10-01（PR #89）
- 状態: 取り込み済み（v0.16.0）
- 起こした日: 2026-10-02（JST）
- 起こした役: Spec Steward
- 対象 Issue: なし（差分 `20261001-t1-argument-guards`、PR #84 の書き残し）
- 決定の出典: 差分 `20261001-t1-argument-guards` の SPEC-EGOV-COMMON-ERRORS-022（`message` は違反の種類ごとに決まった日本語の 1 文で、検査の部品の英文は返さない）。houki-egov-mcp 0.16.0 の実装（`feat/20261001-0.16.0`）で見つかった
- 前提: 差分 `20261001-t1-argument-guards`（PR #84）・`20261001-t2-error-codes`（PR #85）・`20261001-t3-normalize`（PR #86）の上に積む。取り込みは、この 4 つを 1 つの版（v0.16.0）で、T1 → T2 → T3 → この差分の順に行う

## なぜ変えるか

houki-egov-mcp 0.16.0 の実装（`feat/20261001-0.16.0`、まだマージしていない）で、T1 の差分に次の 3 つの書き残しが見つかった。どれも振る舞いを新しく決めるものではなく、T1 で決めた規則（SPEC-EGOV-COMMON-ERRORS-022 の「違反の種類ごとに決まった日本語の 1 文」と、REMOVED にした ID）を、ほかの本文に写すものである。

1. **和の型の行が無い。** SPEC-EGOV-COMMON-ERRORS-022 の表は、型の違反を `string` / `integer` / `number` / `boolean` / `array` / `object` の 1 つずつで書いた。tools/list の inputSchema には、`type: ["number", "string"]`（`get_law` と `verify_citations` の `item`）と `type: ["string", "number"]`（`get_law_range` の `part` / `chapter` / `section` / `subsection` / `division`）の、2 つの型の和の引数がある。ここに数値でも文字列でもない値（`null`、`[8]`、`true` など）が来たときの `message` が、表のどの行にも当たらない。実装は `数値か文字列で指定してください` を返している（`src/tools/input-validator.ts` の `NUMBER_OR_STRING_MESSAGE`。inputSchema の `type` の並びによらず、この文に固定）
2. **max_chars の例が英文のまま。** SPEC-EGOV-GET-LAW-RANGE-023（差分 `20260928-untested-behaviors` で入れた、`specs/current/` の ID）の例は、`detail.issues` の `message` を `must be >= 2000` / `must be <= 120000` と書いている。T1 で SPEC-EGOV-COMMON-ERRORS-022 を足したとき、この例を MODIFIED にしなかったので、022 の「英文はそのまま返さない」と食い違っている。実装は `2000 以上で指定してください` / `120000 以下で指定してください` を返している
3. **REMOVED にした ID を指す「未決」の行が残る。** T1 は SPEC-EGOV-GET-TOC-022（`depth` に 0 以下を渡すと全階層を返す）と SPEC-EGOV-SEARCH-FULLTEXT-025・026（`limit` を丸める）を REMOVED にしたが、その ID を指す「未決」の行（`get_toc` の未決 6「`depth` に 0 以下を渡したとき。→ SPEC-EGOV-GET-TOC-022」、`search_fulltext` の未決 5「`limit` の範囲。→ SPEC-EGOV-SEARCH-FULLTEXT-024・025・026」）の直し方が、T1 の proposal.md の「取り込みのとき」に書かれていない。`spec-ids check` は本文の参照を数えないので、取り込んだ後も止まらずに、無い ID を指す行が残る

## 書き方

- SPEC-EGOV-GET-LAW-RANGE-023 は `specs/current/` にあり、`specs/changes/` のどの差分にも無いので、ふつうの `MODIFIED` の見出しとして書く（`specs/get_law_range/spec.md`）
- SPEC-EGOV-COMMON-ERRORS-022 は差分 `20261001-t1-argument-guards` の `ADDED` にだけあり、まだ `specs/current/` に無い。この差分に `### SPEC-EGOV-COMMON-ERRORS-022` の見出しを置くと、`spec-ids check` が `specs/changes/` の中の同じ ID の見出し 2 つを採番の衝突として止める（houki-nta-mcp の T3 の `nta_get_tax_answer` と同じ事情）。T1 の差分そのものは書き換えないので、`specs/common_errors/spec.md` には見出しを置かず、「取り込みのときに置き換える本文」として全文を書く。扱いは `MODIFIED` と同じで、T1 の差分を取り込んだ後の 022 の本文（見出しの行を除く）を、その全文で置き換える
- 「未決」の 2 行は仕様 ID の本文ではないので、この proposal.md の「取り込みのとき」に書く

## 変わる振る舞い

無い。実装（`feat/20261001-0.16.0`）はすでに、和の型の違反に `数値か文字列で指定してください` を、`max_chars` の範囲の外に `2000 以上で指定してください` / `120000 以下で指定してください` を返している。この差分は、その文を仕様の本文に書く。

T1 の承認時の本文と比べて変わるのは次の 3 点である。

| 場所                                           | T1 の承認時（PR #84）とその前                                    | この差分の後                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| SPEC-EGOV-COMMON-ERRORS-022 の表               | 和の型の違反に当たる行が無い                                     | 「型が `number` と `string` の和で、そのどちらでもない」→ `数値か文字列で指定してください` の行  |
| SPEC-EGOV-GET-LAW-RANGE-023 の例               | `message: "must be >= 2000"` / `"must be <= 120000"`             | `message: "2000 以上で指定してください"` / `"120000 以下で指定してください"`。022 を参照する一文 |
| `get_toc` の未決 6・`search_fulltext` の未決 5 | REMOVED にした ID（GET-TOC-022、SEARCH-FULLTEXT-025・026）を指す | 「取り込みのとき」のとおり（下の「人が判断すること」2）                                          |

## 変わらない振る舞い

- SPEC-EGOV-COMMON-ERRORS-022 の表のほかの行と、ほかの「例:」の文
- `max_chars` の範囲（2,000〜120,000）と、範囲の外を inputSchema の検査で `INVALID_ARGUMENT` にすること（SPEC-EGOV-GET-LAW-RANGE-023 の本文の 1 段落目）
- `search_fulltext` に houki-egov の管轄でない略称を渡したときの扱い（houki-egov-mcp #88、段階 5 の候補）。この差分では変えない
- 新しい仕様 ID は作らない（ADDED・REMOVED は無い）

## 実装の変更

`feat/20261001-0.16.0` は、022 の和の型の文と 023 の日本語の文をすでに返していて、023 の文は `src/spec-tests/untested-20260928/get_law_range.test.ts` で確かめている。要るのは、和の型の `message` を確かめるテスト 1 件（`it` の名前に SPEC-EGOV-COMMON-ERRORS-022。例の `get_law` に `item: null`）だけである。

`feat/20261001-0.16.0` には、T1・T2・T3 を `specs/current/` に取り込むコミット（`e0113da`）が既にある。この差分をマージした後は、実装の会話でブランチを main に積み直し、取り込みのコミットに、この差分の取り込み（下の「取り込みのとき」）と `specs/releases/v0.16.0/` への移動を足す。

## 取り込みのとき（Publisher）

- T1 → T2 → T3 の取り込みの後に行う
- `common_errors`: T1 を取り込んだ後の SPEC-EGOV-COMMON-ERRORS-022 の本文（見出しの行を除く）を、`specs/common_errors/spec.md` の「置き換える本文」で置き換える。見出しの行は変えない
- `get_law_range`: SPEC-EGOV-GET-LAW-RANGE-023 の本文を、`specs/get_law_range/spec.md` の `MODIFIED` の本文で置き換える
- `get_toc` の「未決」6 を「6. **`depth` に 0 以下を渡したとき。** → SPEC-EGOV-GET-TOC-023」に書き換える（「人が判断すること」2 で消す側に決まったら、行を消し、後の番号は振り直さない）
- `search_fulltext` の「未決」5 を「5. **`limit` の範囲。** → SPEC-EGOV-SEARCH-FULLTEXT-024・SPEC-EGOV-SEARCH-FULLTEXT-033」に書き換える（SEARCH-FULLTEXT-024「limit を省くと 10 件で打ち切る」は残る ID。消す側に決まったら同上）
- `common_errors`・`get_law_range`・`get_toc`・`search_fulltext` の spec.md の承認日の行に「差分 `20261002-t1-followups` は YYYY-MM-DD（PR #N）」を足す
- この差分のフォルダーを、T1・T2・T3 と同じく `specs/releases/v0.16.0/20261002-t1-followups/` へ移し、この proposal.md の「状態」を取り込み済みにする

## 人が判断すること

1. **和の型の `message` の文。** `数値か文字列で指定してください` にし、inputSchema の `type` の並び（`["number", "string"]` か `["string", "number"]` か）によらずこの文に固定した（実装のまま）。並びに合わせて「文字列か数値で…」と変える案もあるが、同じ種類の違反で文が 2 通りになる。
2. **未決の 2 行を消すか、新しい ID への矢印に書き換えるか。** 書き換える側で書いた。「未決」の節は、決まった項目を消さずに「→ 仕様 ID」で残している（`get_toc` の未決 2〜5 など）ので、それに揃えた。消すなら、T1 の proposal.md の「未決から次の項目を消す」と同じ扱いになる。
3. **承認日。** この proposal.md に承認日と PR 番号を書く。
