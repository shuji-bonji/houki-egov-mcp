# 変更: 値の無いフィールドを null にし、meta の時点を常に返す（T4 応答の形）

- 対象: `get_law` / `get_toc` / `get_law_range` / `get_law_revisions` / `get_related_laws` / `get_article_references` / `list_attachments` / `get_attachment` / `get_law_file` / `verify_citations` の `specs/current/<tool>/spec.md`
- 実装の変更: 要（`get_law_revisions` の 017 は今の振る舞いを書くだけで、受入テストを足すだけ。下の「実装の変更」）
- 承認日: 2026-10-01（PR #91）
- 状態: 取り込み済み（v0.17.0）
- 起こした日: 2026-10-03（JST）
- 起こした役: Spec Steward
- 対象 Issue: houki-egov-mcp #64（目次の meta の at、補った項番号、続きの呼び出し例の max_chars）、#65（get_law_revisions の状態の値と latest の順）、#66（同じファイル名の添付、Content-Disposition が無いときの法令履歴 ID、`filename*`）
- 決定の出典: houki-hub `docs/DECISIONS.md` 2026-09-29「T4 応答の形」、`docs/notes/2026-09-29-plan-spec-issues.md` 4 章「段階 1」「段階 4」・5.1・末尾の「段階 1 の転記で見つかった、計画書との食い違い」、段階 1 で #64・#65・#66 に投稿したコメント（2026-09-29）
- 前提: main `7b22169`（0.16.0）の上に積む。同じ版（0.17.0）に入れる T5（`spec/20261003-t5-docs-mismatch`）は、この差分の上に積む。houki-nta-mcp の同じ差分（`spec/20261003-t4-response-shape`）は、この差分の後に書き、`null` と `meta` の文を同じにする

## なぜ変えるか

v0.16.0 は、同じツールの同じ種類の応答でも、場面によってフィールドが付いたり付かなかったりする。

- `meta.at` は、`at` を渡したときだけ付く（8 ツール）。`get_law` の目次の `meta` には、`at` を渡しても付かない（#64）
- `get_law` の json は、`paragraph` / `item` を渡さないと `data.paragraph_num` / `data.item_num` のキーが無い。`item` だけを渡して項を補ったときも、補った項番号を返さない（#64）
- `get_law_range` を打ち切ったときの続きの呼び出し例に、呼び出し側が渡した `max_chars` が入らず、例のとおりに呼び直すと既定の 30,000 文字で返る（#64）。同じ例に `at` も入らない（今回の確認で見つけた）
- `get_law_revisions` の `revisions[]` は、e-Gov の要素にキーが無ければキーが無い。並びは e-Gov の順に頼っていて、「最新」が何の順かを決めていない（#65）
- `get_law_file` は、Content-Disposition が無いと `saved.law_revision_id` に法令 ID を入れる。`get_attachment` は、同じファイル名の添付が 2 件以上あると先のものを黙って返す（#66）

LLM は「フィールドが無い」と「値が無い」を区別しにくい。2026-09-29 の決定（T4）は、値が無いフィールドは `null` を入れてフィールドを消さない、`meta` には `at` と `retrieved_at` を常に付ける、フィールドを消す変更・名前を付け替える変更は入れない（足すか `null` にするだけ）、というものである。

## T4 の規則をどこまで当てたか

| 規則                                          | この差分で当てた範囲                                                                                                                                                    | 当てなかった範囲（理由）                                                                                                                                                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta` に `at` と `retrieved_at` を常に付ける | `meta` を持つ 10 ツールすべて。`at` を受け取る 8 ツールは渡さないとき `null`、受け取らない `get_law_revisions` / `get_related_laws` は常に `null`                       | `meta` を持たない 4 ツール（`search_law` / `search_fulltext` / `resolve_abbreviation` / `explain_law_type`）。`meta` を新しく足すのは「応答の形を揃える」を超えるため。下の「人が判断すること」1                                  |
| 値が無いフィールドは `null`                   | Issue が名指しした `meta.at`・`data.paragraph_num`・`data.item_num`・`meta.paragraph`（`get_article_references`）・`revisions[]` の 8 つのキー・`saved.law_revision_id` | エラーの本文（SPEC-EGOV-COMMON-ERRORS-008 の「値を決めたときだけ付く」）、`saved`（`save` なし）、`next_actions` / `range.next_from_article`（続きが無いとき）など、Issue の外の「付かない」フィールド。下の「人が判断すること」2 |
| markdown                                      | 変えない。末尾の `時点:` の行は今までどおり `at` を渡したときだけ置く                                                                                                   | 文字列の行は「フィールドの有無」の問題に当たらないため                                                                                                                                                                            |

## 変わる振る舞い

| 場面                                                                                                                                                                         | v0.16.0                                                             | この差分                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8 ツールで `at` を省いた（`get_law` / `get_toc` / `get_law_range` / `get_article_references` / `list_attachments` / `get_attachment` / `get_law_file` / `verify_citations`） | `meta` に `at` のキーが無い                                         | `meta.at: null`                                                                                                                                          |
| `get_law` の目次（`format: "toc"`、または `article` 省略）                                                                                                                   | `at` を渡しても `meta` に `at` が無い                               | `meta.at` に渡した値、渡さないときは `null`（GET-LAW-020）                                                                                               |
| `get_law_revisions` / `get_related_laws`                                                                                                                                     | `meta` に `at` が無い                                               | `meta.at: null`（`at` を受け取らないツール）                                                                                                             |
| `get_law` の json で `paragraph` / `item` を省いた                                                                                                                           | `data` に `paragraph_num` / `item_num` のキーが無い                 | `null`（GET-LAW-024）                                                                                                                                    |
| `get_law` の json で `item` だけを渡し、項が 1 つの条の号を返した                                                                                                            | `data.paragraph_num` が無い                                         | `data.paragraph_num: 1`（GET-LAW-040）                                                                                                                   |
| `get_article_references` で `paragraph` を省いた                                                                                                                             | `meta.paragraph` が無い                                             | `meta.paragraph: null`（GET-ARTICLE-REFERENCES-022）                                                                                                     |
| `get_law_range` を打ち切った                                                                                                                                                 | 続きの例は `law_name`・`path`（`suppl_index`）・`from_article` だけ | 渡した `max_chars` と `at` も入れる（GET-LAW-RANGE-008）                                                                                                 |
| `get_law_revisions` の並び                                                                                                                                                   | e-Gov が返した順                                                    | ツールが施行日の新しい順に並べる（未施行を含む。同じ日は e-Gov の順）。2026-10-03 の e-Gov の順と同じなので、見た目は変わらない（GET-LAW-REVISIONS-016） |
| `get_law_revisions` で e-Gov の要素にキーが無い                                                                                                                              | キーが無い                                                          | 8 つのキーをすべて持ち、値が無ければ `null`（GET-LAW-REVISIONS-002）                                                                                     |
| `get_attachment` のファイル名だけの `src` が 2 件以上に当たる                                                                                                                | 一覧で先の添付を黙って返す                                          | `INVALID_ARGUMENT`。候補の `src` を `hint` と `next_actions` で示す（GET-ATTACHMENT-029）                                                                |
| `get_law_file` の `save: true` で Content-Disposition が無い                                                                                                                 | `saved.law_revision_id` に法令 ID                                   | `null`（GET-LAW-FILE-003）                                                                                                                               |
| `get_law_file` の Content-Disposition に `filename` と `filename*` の両方がある                                                                                              | ヘッダーの先に書かれたほう                                          | `filename*`（GET-LAW-FILE-004）                                                                                                                          |

## 変わらない振る舞い

- `meta` のほかのフィールド（`law_id`・`title`・`law_num`・`retrieved_at`・`url`）の値
- markdown の文字列（`時点:` の行は `at` を渡したときだけ）
- `revisions[].current_revision_status` の値（e-Gov の値のまま。GET-LAW-REVISIONS-017 は今の振る舞いを書くだけ）。tools/list の `description` の「状態（現行/旧法/未施行）」は、T5 の規則（文書を直す）で実装 PR が直す
- `latest` の検査（SPEC-EGOV-GET-LAW-REVISIONS-012）と `total` の意味
- `get_attachment` の `src` が一覧の `src` に一致するとき、ファイル名がどれにも一致しないとき（SPEC-EGOV-GET-ATTACHMENT-008）
- `get_law_file` の保存先のパス（Content-Disposition が無いときも `<law_id>/<law_id>.<file_type>` のまま）
- エラーの code。消すフィールド・名前を付け替えるフィールドは無い

## Issue の「決めること」への答え

### #64

| 決めること                                          | 答え                                                            |
| --------------------------------------------------- | --------------------------------------------------------------- |
| 目次の `meta` にも `at` を付けるか                  | 付ける。渡さないときは `null`（SPEC-EGOV-GET-LAW-020）          |
| 項を補ったときに `data.paragraph_num` を返すか      | 返す。値は補った項番号 `1`（SPEC-EGOV-GET-LAW-040）             |
| 続きの呼び出し例に、渡された `max_chars` を入れるか | 入れる。同じ理由で `at` も入れる（SPEC-EGOV-GET-LAW-RANGE-008） |

### #65

| 決めること                                                                    | 答え                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| description を e-Gov の値に合わせるか、日本語の説明を別のフィールドで付けるか | description を e-Gov の値（`CurrentEnforced` / `PreviousEnforced` / `UnEnforced`）に合わせる（T5 の文書の行。差分 `20261003-t5-docs-mismatch` の「実装 PR で直す文書」）。日本語のフィールドは足さない（SPEC-EGOV-GET-LAW-REVISIONS-017。下の「人が判断すること」3） |
| 「最新」の順と、ツールで並べ替えるか                                          | 施行日の新しい順（未施行を含む）。ツールで並べ替える（SPEC-EGOV-GET-LAW-REVISIONS-016・009）                                                                                                                                                                         |
| 値の無いフィールドを `null` に揃えるか                                        | `null` に揃える（SPEC-EGOV-GET-LAW-REVISIONS-002）                                                                                                                                                                                                                   |

### #66

| 決めること                                                                    | 答え                                                                                                |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| ファイル名だけで複数の添付に当たるときに、エラー（候補の `src` 付き）にするか | エラーにする。code は `INVALID_ARGUMENT`（SPEC-EGOV-GET-ATTACHMENT-029。下の「人が判断すること」4） |
| Content-Disposition が無いときに `saved.law_revision_id` を `null` にするか   | `null` にする（SPEC-EGOV-GET-LAW-FILE-003）。保存先のディレクトリは法令 ID のまま                   |
| `filename*` を優先するか                                                      | 優先する（SPEC-EGOV-GET-LAW-FILE-004）                                                              |

## 確かめた値

2026-10-03 01:43 JST（+09:00）に houki-egov-dev の `get_law_revisions` を `{ law_name: "消法" }` で呼んだ。

- `total: 65`。並びは施行日の新しい順で、先頭は施行日 `2030-06-19`（令和七年法律第七十四号、`amendment_enforcement_comment` は「公布の日から起算して五年を超えない範囲内において政令で定める日」）
- `current_revision_status` の値は `UnEnforced`（先頭の 8 件）・`CurrentEnforced`（9 件目の 1 件、施行日 `2026-10-01`、令和七年法律第七十号）・`PreviousEnforced`（残り 56 件）の 3 つ
- 施行日 `2026-10-01` の改正は 3 件で、e-Gov の順は `CurrentEnforced` → `PreviousEnforced` → `PreviousEnforced`
- 65 件のどれも 8 つのキーを持ち、値の無い `amendment_enforcement_comment` は `null` で返っていた（キーが無い要素は、この法令では見つからなかった）

## 足す仕様 ID（ADDED、4 件）

| 単位              | 仕様 ID                         | 内容                                                                       |
| ----------------- | ------------------------------- | -------------------------------------------------------------------------- |
| get_law           | SPEC-EGOV-GET-LAW-040           | `item` だけで項を補ったときは `data.paragraph_num: 1`                      |
| get_law_revisions | SPEC-EGOV-GET-LAW-REVISIONS-016 | 施行日の新しい順に並べ、未施行を含める。ツールで並べ替える                 |
| get_law_revisions | SPEC-EGOV-GET-LAW-REVISIONS-017 | `current_revision_status` は e-Gov の値のまま                              |
| get_attachment    | SPEC-EGOV-GET-ATTACHMENT-029    | ファイル名だけの `src` が 2 件以上に当たるときは `INVALID_ARGUMENT` と候補 |

## 変える仕様 ID（MODIFIED、17 件）

| 単位                   | 仕様 ID                              | 変わる点                                                                                |
| ---------------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| get_law                | SPEC-EGOV-GET-LAW-020                | `meta.at` を常に置く（目次を含む）。渡さないときは `null`                               |
| get_law                | SPEC-EGOV-GET-LAW-024                | `data.paragraph_num` / `data.item_num` を渡さないときは `null`                          |
| get_toc                | SPEC-EGOV-GET-TOC-015                | `meta.at` を省いたときは `null`（「付かない」から）                                     |
| get_law_range          | SPEC-EGOV-GET-LAW-RANGE-008          | 続きの例に渡した `max_chars` と `at` を入れる                                           |
| get_law_range          | SPEC-EGOV-GET-LAW-RANGE-025          | `meta.at` を省いたときは `null`                                                         |
| get_law_revisions      | SPEC-EGOV-GET-LAW-REVISIONS-002      | `meta.at: null`、`revisions[]` の 8 つのキーを常に置き、値が無ければ `null`、並びは 016 |
| get_law_revisions      | SPEC-EGOV-GET-LAW-REVISIONS-009      | 「先頭」を 016 の順の先頭にする                                                         |
| get_related_laws       | SPEC-EGOV-GET-RELATED-LAWS-010       | `meta` に `at: null` を足す                                                             |
| get_article_references | SPEC-EGOV-GET-ARTICLE-REFERENCES-022 | `meta.paragraph` を省いたときは `null`                                                  |
| get_article_references | SPEC-EGOV-GET-ARTICLE-REFERENCES-034 | `meta.at` を省いたときは `null`（「キーを持たない」から）                               |
| list_attachments       | SPEC-EGOV-LIST-ATTACHMENTS-015       | `meta.at` を渡さないときは `null`                                                       |
| get_attachment         | SPEC-EGOV-GET-ATTACHMENT-002         | ファイル名で 1 件に決まるときだけ引く                                                   |
| get_attachment         | SPEC-EGOV-GET-ATTACHMENT-014         | `meta.at` を渡さないときは `null`                                                       |
| get_law_file           | SPEC-EGOV-GET-LAW-FILE-001           | `meta.at` を渡さないときは `null`                                                       |
| get_law_file           | SPEC-EGOV-GET-LAW-FILE-003           | 法令履歴 ID が分からないときは `saved.law_revision_id: null`                            |
| get_law_file           | SPEC-EGOV-GET-LAW-FILE-004           | `filename*` を優先する                                                                  |
| verify_citations       | SPEC-EGOV-VERIFY-CITATIONS-021       | `meta.at` を渡さないときは `null`（「キーを置かない」から）                             |

## 消す仕様 ID（REMOVED）

無い。

## 互換性

code は変えない。消すフィールド・名前を付け替えるフィールドは無い（計画書 5.1）。

- `meta.at`・`data.paragraph_num`・`data.item_num`・`meta.paragraph`・`revisions[]` の各キーは、今まで「キーが無い」だった場面で `null` になる。JSON を `"at" in meta` のようにキーの有無で読む側は、値で読むように直す必要がある。利用側は houki-research-skill と houki-hub の呼び出し例だけ（計画書 5.1）
- `get_attachment` のファイル名だけの `src` が 2 件以上に当たる場面は、成功（先の添付）からエラー（`INVALID_ARGUMENT`）に変わる。CHANGELOG の「互換性」の節に書く
- `get_law_file` の `saved.law_revision_id` は、Content-Disposition が無い場面で法令 ID から `null` に変わる

## 呼び出し例への影響

2026-10-03 JST に houki-hub `scripts/reference-examples/houki-egov/ja/*.md` と houki-research-skill の `skills/houki-research/` を grep した。

- `meta` を載せている例（`get_law.md`・`get_law_range.md`・`get_law_file.md`・`get_attachment.md` など）は、段階 6 で実測をやり直すと `at` を省いた呼び出しの `meta` に `at: null` が足される。キーの有無を前提にした文は無い
- `get_law_revisions.md` の例（`{ law_name: "消費税法", latest: 2 }`）は、施行日 `2030-06-19` と `2028-04-01` の `UnEnforced` の 2 件を載せている。並べ替えた後も同じ 2 件になる
- `get_law_file.md` の `save: true` の例は Content-Disposition のあるもので、`saved.law_revision_id` は変わらない
- ファイル名だけの `src` を渡す例は無い

## 実装の変更

- `meta` を組み立てる 10 か所で、`at` を `opts.at ?? null` にする（`undefined` は JSON に出ないため）。`get_law` の目次の `meta` に `at` を足す。`get_law_revisions` と `get_related_laws` は `at: null`
- `get_law` の json の `data` に `paragraph_num` / `item_num` を常に置き、項を補ったときは `1`
- `get_article_references` の `meta.paragraph` を常に置く
- `get_law_range` の続きの例に `max_chars` / `at`（渡したときだけ）
- `get_law_revisions` で施行日の新しい順に並べ替え（安定ソート。`null` は先頭）、8 つのキーを `?? null` で埋める
- `get_attachment` のファイル名の照合で、当たった件数を数え、2 件以上なら 029 のエラー
- `get_law_file` の `law_revision_id` を Content-Disposition のファイル名からだけ読む。Content-Disposition の読み取りで `filename*` を先に探す
- SPEC-EGOV-GET-LAW-REVISIONS-017 は今の振る舞いなので、受入テストを足すだけ（値を変えない）
- tools/list の `get_law_revisions` の `description`（状態の値）は T5 の差分の「実装 PR で直す文書」で直す

## 取り込みのとき（Publisher）

- ADDED の見出しを、各 `specs/current/<dir>/spec.md` の「できること」の末尾に足す。MODIFIED は見出しの行（題）も含めて、差分の見出しと本文に置き換える
- 各差分の spec.md の冒頭に書いた図の変更（`get_law_revisions`・`get_attachment`）を行う
- `get_law_file` の「処理の流れ」の図の「saved（path・bytes・file_name・law_revision_id）を付けて返す（003）」はそのままでよい
- 「未決」から次の項目を消す: get_law 17・18、get_law_range 8、get_law_revisions 1・2・6、get_attachment 3、get_law_file 1・11
- `get_law_revisions` の「処理の流れ」の図の説明文「今の版でテストがある振る舞いは 001 だけで」は、取り込みの時点のテストに合わせて直す
- 各 `specs/current/<dir>/spec.md` の承認日の行に「差分 `20261003-t4-response-shape` は YYYY-MM-DD（PR #N）」を足す
- この差分のフォルダーを `specs/releases/<実装を出したタグ>/20261003-t4-response-shape/` へ移し、この proposal.md の「状態」を取り込み済みにする

## 人が判断すること

1. **`meta` を持たない 4 ツールに `meta` を足すか。** 足さない側で書いた。T4 の「`meta` に `at` と `retrieved_at` を常に付ける」は、`meta` を持つツールの中で揃える規則と読んだ。`search_law` / `search_fulltext` / `resolve_abbreviation` / `explain_law_type` は e-Gov の版を指さない（`search_fulltext` はローカル DB で、時点の代わりに `freshness` を返す）。足すなら別の差分にする。
2. **Issue の外の「付かない」フィールドを今回 `null` にするか。** しない側で書いた。エラーの本文（SPEC-EGOV-COMMON-ERRORS-008 は「値を決めたときだけ付く」と約束している）、`get_attachment` / `get_law_file` の `saved`（`save` なしのとき）、`range.next_from_article` / `range.next_actions`（打ち切っていないとき）、`get_law_file` の `next_actions`（`html`・`rtf`・`docx`）がこれに当たる。全部を `null` にすると 14 ツールのほぼすべての ID が MODIFIED になり、0.17.0 の範囲（#64・#65・#66）を超える。揃えるなら、family で一覧にしてから別の差分にする。
3. **`current_revision_status` に日本語の説明のフィールドを足さないこと（017）。** 足さない側で書いた。値は 3 つで、tools/list の `description` に意味を書けば LLM は読める。足すなら `current_revision_status_label`（`現行` / `旧法` / `未施行`）のような名前で、T4 の規則により常に付ける。
4. **ファイル名だけの `src` が 2 件以上に当たるときの code（029）。** `INVALID_ARGUMENT` にした。引数が 1 件に決まらない形だからで、新しい code（例: `AMBIGUOUS_ATTACHMENT`）を足すと houki-research-skill の `docs/ERROR-CODES.md` の表も増える。`ATTACHMENT_NOT_FOUND` は「無い」の意味なので使わない。
5. **施行日が `null` の改正を先頭に置くこと（016）。** 施行日が決まっていない改正を未施行とみなして先頭にした。2026-10-03 の `消法` では `null` の施行日は無く、「政令で定める日」の改正にも e-Gov は日付（上限の見込み）を入れていた。
6. **`at` を受け取らない `get_law_revisions` / `get_related_laws` の `meta.at: null`。** `meta` のキーをツールの間で揃える側で書いた。キーを足すだけなので 5.1 に反しない。
7. **承認日。** この proposal.md に承認日と PR 番号を書く。
