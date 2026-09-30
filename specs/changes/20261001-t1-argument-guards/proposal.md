# 変更: 引数の検査を inputSchema に書き、丸めずに `INVALID_ARGUMENT` にする（T1）

- 対象: `specs/current/common_errors/spec.md` と、tools/call で呼べる 14 ツールすべての `specs/current/<tool>/spec.md`
- 実装の変更: 要
- 承認日: 2026-10-01（PR #84）
- 状態: 提案中
- 起こした日: 2026-10-01（JST）
- 起こした役: Spec Steward
- 対象 Issue: houki-egov-mcp #47（`at` の形）、#48（`paragraph` の 0・負・小数）、#53（必須の文字列の空文字・空白だけ）、#54（`limit` / `latest` / `depth` の上限と整数）、#57（`INVALID_ARGUMENT` の `detail` の形と返さない code）
- 決定の出典: houki-hub `docs/DECISIONS.md` 2026-09-29「T1 引数の検査」と「未決」、`docs/notes/2026-09-29-plan-spec-issues.md` 4 章「段階 4」・5.1・8 章、段階 1 で各 Issue に投稿したコメント（`docs/notes/issues-2026-09-29-decisions/egov-47.md` 〜 `egov-57.md`）
- 前提: main（v0.15.4、`8ba4603`）の上に積む。同じ版（0.16.0）に入れる T2（`spec/20261001-t2-error-codes`）と T3（`spec/20261001-t3-normalize`）は、この差分のマージ後にその上へ積む（`common_errors` と `get_law` などを 3 つの差分が触るので、採番はこの順）

## なぜ変えるか

v0.15.4 の引数の検査は、型・必須・enum・inputSchema に無い引数までを inputSchema で止め、値の範囲や形はツールごとに違う扱いをしている。`search_law` の `limit: 100` は 100 件返り（#54）、`get_law_revisions` の `latest: 0` は全件、`get_toc` の `depth: 1.5` は切り捨て、`search_fulltext` の `limit: 0` は 1 件に丸まる。`get_law` の `paragraph: 0` は法令を取ってから `ARTICLE_NOT_FOUND` になり（#48）、`at: "2024/04/01"` は e-Gov に渡ってから失敗する（#47）。必須の文字列の空文字は、`search_law` では `INVALID_ARGUMENT`、`get_law` では `LAW_NOT_FOUND`、`resolve_abbreviation` では `resolved: null` と空の `keyword` の案内、`search_fulltext` では `hits: []` と、ツールごとに違う（#53）。`INVALID_ARGUMENT` の `detail` は `tool` が無く、inputSchema に無い引数が 2 つあると `path` が `typo, foo` の 1 要素にまとまり、`message` は検査の部品の英文（`must be string`）のままである（#57）。

2026-09-29 の決定（T1）は、数値の引数は inputSchema に `type: "integer"` と `minimum` / `maximum` を、日付は `pattern` を、必須の文字列は `minLength: 1` を書き、`common_errors` の検査で一律に `INVALID_ARGUMENT` にして丸めない、空白だけの文字列は各ツールで `INVALID_ARGUMENT` にする、`detail.issues` は違反 1 件ごとに `{ path, message }` に分けて `path` に引数名を入れ、`tool` を付け、`message` は日本語にする、というものである。この差分はその規則を 14 ツールの spec.md に書く。inputSchema に書けば、tools/list を読む LLM にも上限と形が伝わる。

## 変わる振る舞い

| 場面                                                                                   | v0.15.4                                                                                                  | この差分                                                                                                              |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `search_law` の `limit` に 0・51・100・2.5                                             | 100 件返る。0 は e-Gov の既定、2.5 はそのまま渡る                                                        | `INVALID_ARGUMENT`（`path: "limit"`）。e-Gov に問い合わせない                                                         |
| `search_fulltext` の `limit` に 0・31・100・2.5                                        | 1 件・30 件に丸める（SPEC-EGOV-SEARCH-FULLTEXT-025・026）                                                | `INVALID_ARGUMENT`（`path: "limit"`）。丸めない（8 章の未決を「変える」側で提案。下の「人が判断すること」1）          |
| `get_law_revisions` の `latest` に 0・-1・2.5                                          | 0 以下は全件、2.5 は切り捨て                                                                             | `INVALID_ARGUMENT`（`path: "latest"`）                                                                                |
| `get_toc` の `depth` に 0・-1・1.5                                                     | 0 以下は全階層（SPEC-EGOV-GET-TOC-022）、1.5 は切り捨て                                                  | `INVALID_ARGUMENT`（`path: "depth"`）                                                                                 |
| `get_law` / `get_article_references` / `verify_citations` の `paragraph` に 0・-1・1.5 | 法令を取ってから `ARTICLE_NOT_FOUND`                                                                     | `INVALID_ARGUMENT`（`path: "paragraph"` / `"citations.0.paragraph"`）。e-Gov に問い合わせない                         |
| `get_law_range` の `suppl_index` に 0・-1・1.5                                         | 法令を取ってから `RANGE_NOT_FOUND`                                                                       | `INVALID_ARGUMENT`（`path: "suppl_index"`）                                                                           |
| `at` を持つ 8 ツールに `at: "2024/04/01"`・`"20240401"`・`"2024-4-1"`                  | e-Gov に渡してから失敗する（`SOURCE_API_ERROR` や `LAW_NOT_FOUND`）。`get_law_file` は URL に入れて返す  | `INVALID_ARGUMENT`（`path: "at"`）。e-Gov に問い合わせない                                                            |
| `at` を持つ 8 ツールに暦に無い日付 `"2026-02-30"`                                      | 同上                                                                                                     | `INVALID_ARGUMENT`（`path: "at"`、`message: "暦に無い日付です"`）。各ツールの処理で、e-Gov に問い合わせる前に確かめる |
| 必須の文字列（`keyword` / `law_name` / `abbr` / `name` / `article`）に空文字           | ツールごとに違う（`INVALID_ARGUMENT` / `LAW_NOT_FOUND` / `resolved: null` / `hits: []`）                 | どのツールでも inputSchema の検査で `INVALID_ARGUMENT`（`message: "空文字は指定できません"`）                         |
| 必須の文字列に空白だけ（半角・全角スペース、タブ、改行）                               | ツールごとに違う（`search_law` だけ `INVALID_ARGUMENT`）                                                 | どのツールでも、ツールの処理で `INVALID_ARGUMENT`（`message: "空白だけは指定できません"`）。e-Gov・DB・辞書を引かない |
| `get_attachment` の任意の `src` に空文字・空白だけ                                     | 空文字は zip、空白だけは `ATTACHMENT_NOT_FOUND`                                                          | どちらも `src` を省いたときと同じ（zip）。下の「人が判断すること」3                                                   |
| inputSchema の検査で返す `INVALID_ARGUMENT` の本文                                     | `tool` が無い。inputSchema に無い引数が 2 つ以上あると `path` が `typo, foo` の 1 要素。`message` は英文 | `tool` にツール名。違反 1 件ごとに `detail.issues` の要素を分け、`path` は引数名。`message` は日本語の決まった文      |
| inputSchema の検査で返す `INVALID_ARGUMENT` の `hint`                                  | `tools/list の <ツール名> の inputSchema を確認してください (型・必須・enum・未知の引数)`                | `tools/list の <ツール名> の inputSchema を確認してください (型・必須・enum・範囲・形式・未知の引数)`                 |

## 変わらない振る舞い

- inputSchema に合う引数を渡したときの応答（範囲内の `limit` / `latest` / `depth` / `paragraph` / `suppl_index`、`YYYY-MM-DD` の `at`、空でない文字列）
- `get_law` / `verify_citations` の `item` の扱い。`item` は数値でも文字列（`"8の2"`）でも受け付ける（SPEC-EGOV-GET-LAW-002）ので inputSchema では止められず、読めない形は `INVALID_ARTICLE_NUM` のまま（#48 の「決めること」の 2 つ目の答え）
- `get_law_range` の `part` / `chapter` / `section` / `subsection` / `division` / `path` / `from_article` の検査（SPEC-EGOV-GET-LAW-RANGE-020・021）と `max_chars` の範囲（023）。`max_chars` はすでに inputSchema の `minimum` / `maximum` で止めているので、この差分の規則の先例になる
- `verify_citations` の `citations` の件数（`minItems: 1` / `maxItems: 50`。SPEC-EGOV-VERIFY-CITATIONS-002）と、空白だけの `law_name` / `law_id` を「無いもの」として扱うこと（032）。`law_name` と `law_id` は片方が必須なので `minLength` は書かず、032 のまま
- `search_fulltext` で語が残らない入力（1 文字だけ・記号だけ）に `hits: []` を返すこと（SPEC-EGOV-SEARCH-FULLTEXT-005。空文字だけをこの差分で外す）
- `INVALID_ARGUMENT` の `error` の組み立て方（前置きの後に `<path>: <message>` を `; ` でつなぐ。SPEC-EGOV-COMMON-ERRORS-013）と `next_actions`（`list_tools` の 1 件。015）
- `get_law` の `article` に削除された条の範囲表記（`"534:535"`）を渡せること（`get_law` の未決 16、#54）。受け付ける入力としては約束せず、今のまま仕様に書かない（`verify_citations` の SPEC-EGOV-VERIFY-CITATIONS-037 は別の約束）
- `search_law` の `domain`（#55、段階 5）、`explain_law_type` の照合の範囲（#62、段階 5）

## Issue の「決めること」への答え

### #47（`at` の形）

| 決めること                                                | 答え                                                                                                                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `at` の形をサーバーで確かめて `INVALID_ARGUMENT` にするか | 確かめる。8 ツールの inputSchema に `pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"` を書く（SPEC-EGOV-COMMON-ERRORS-024 と各ツールの ID）。暦に無い日付は各ツールの処理で同じ形の `INVALID_ARGUMENT` にする |
| 形は正しいが、その時点に法令がまだ無いときに何を返すか    | この差分では決めない。T2（`spec/20261001-t2-error-codes`）で、e-Gov が返す応答ごとに code を決める                                                                                                    |
| `verify_citations` で `at` を法令名の検索にも使うか       | この差分では決めない（振る舞いを変えない）。T2 か段階 5 の #45 で扱う                                                                                                                                 |

### #48（`paragraph`）

| 決めること                                                                              | 答え                                                                                                |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| inputSchema で 1 以上の整数に限り、`common_errors` の検査で `INVALID_ARGUMENT` にするか | する（SPEC-EGOV-GET-LAW-036、SPEC-EGOV-GET-ARTICLE-REFERENCES-040、SPEC-EGOV-VERIFY-CITATIONS-041） |
| `item` と揃えて `INVALID_ARTICLE_NUM` にするか                                          | 揃えない。`item` は文字列も受け付けるので今のまま                                                   |

### #53（必須の文字列）

| 決めること                                                             | 答え                                                                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 空文字・空白だけを、どのツールでも `INVALID_ARGUMENT` にするか         | する。空文字は inputSchema の `minLength: 1`（SPEC-EGOV-COMMON-ERRORS-025）、空白だけは各ツールの処理（026）。14 ツールの必須の文字列すべて |
| `get_attachment` の任意の `src` で、空白だけを省いたときと同じに扱うか | 同じに扱う（SPEC-EGOV-GET-ATTACHMENT-025）。空文字もすでに省略と同じなので、空白だけも揃える                                                |

### #54（`limit` / `latest` / `depth`）

| 決めること                                                                     | 答え                                                                                                                                                                                               |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| inputSchema で整数と範囲に限り `INVALID_ARGUMENT` にするか、各ツールで丸めるか | inputSchema で止め、丸めない（SPEC-EGOV-COMMON-ERRORS-023 の表）。`limit` は 1〜50、`latest` と `depth` は 1 以上で上限なし（`latest` は件数より大きければ全件、`depth` は階層より深ければ条まで） |
| `search_fulltext` の `limit` の 1〜30 への丸めと揃えるか                       | 揃える（提案）。SPEC-EGOV-SEARCH-FULLTEXT-025・026 を外し、033 で `INVALID_ARGUMENT` にする。下の「人が判断すること」1                                                                             |
| `get_law` で範囲表記の `article` を受け付ける入力として約束するか              | 約束しない。今のまま仕様に書かない                                                                                                                                                                 |

### #57（`INVALID_ARGUMENT` の `detail`）

| 決めること                                                              | 答え                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool` を付けて houki-nta-mcp と揃えるか                                | 付ける。houki-nta-mcp（SPEC-NTA-COMMON-ERRORS-003）は本文の直下に `tool` を置いているので、同じ場所にする（SPEC-EGOV-COMMON-ERRORS-020）。段階 1 のコメントは `detail.tool` と書いたが、nta と揃える方を取る。下の「人が判断すること」2                                                                                                  |
| `path` に引数名を入れ、違反 1 件ごとに `detail.issues` の要素を分けるか | 分ける（021）                                                                                                                                                                                                                                                                                                                            |
| `message` を日本語に揃えるか                                            | 揃える。違反の種類ごとに決まった文にする（022 の表）                                                                                                                                                                                                                                                                                     |
| 返さない code を語彙から外すか                                          | `specs/current/common_errors/spec.md` の code の表にはもともと無い（`ABBREVIATION_NOT_FOUND`・`EGOV_API_ERROR`・`EGOV_TIMEOUT`・`EGOV_RATE_LIMITED` は `src/errors.ts` の型と README にだけ残っている）。仕様は変えず、実装 PR で型と README から消す。houki-research-skill の `docs/ERROR-CODES.md` にこれらが載っていれば段階 6 で消す |

## 足す仕様 ID（ADDED、36 件）

| 単位                   | 仕様 ID                              | 内容                                                                              |
| ---------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| common_errors          | SPEC-EGOV-COMMON-ERRORS-020          | inputSchema の検査の `INVALID_ARGUMENT` は `tool` に呼んだツール名を持つ          |
| common_errors          | SPEC-EGOV-COMMON-ERRORS-021          | `detail.issues` は違反 1 件ごとに分け、`path` は引数名                            |
| common_errors          | SPEC-EGOV-COMMON-ERRORS-022          | `message` は違反の種類ごとに決まった日本語の 1 文                                 |
| common_errors          | SPEC-EGOV-COMMON-ERRORS-023          | 数値の引数は inputSchema に整数と範囲を書き、違反は `INVALID_ARGUMENT` で丸めない |
| common_errors          | SPEC-EGOV-COMMON-ERRORS-024          | `at` は `YYYY-MM-DD` の形を inputSchema で、暦に無い日付をツールの処理で確かめる  |
| common_errors          | SPEC-EGOV-COMMON-ERRORS-025          | 必須の文字列は `minLength: 1`。空文字は `INVALID_ARGUMENT`                        |
| common_errors          | SPEC-EGOV-COMMON-ERRORS-026          | 空白だけの必須の文字列は、ツールの処理で同じ形の `INVALID_ARGUMENT`               |
| search_law             | SPEC-EGOV-SEARCH-LAW-013             | `limit` は 1 以上 50 以下の整数                                                   |
| get_law                | SPEC-EGOV-GET-LAW-036                | `paragraph` は 1 以上の整数                                                       |
| get_law                | SPEC-EGOV-GET-LAW-037                | `at` の形                                                                         |
| get_toc                | SPEC-EGOV-GET-TOC-023                | `depth` は 1 以上の整数                                                           |
| get_toc                | SPEC-EGOV-GET-TOC-024                | `at` の形                                                                         |
| get_toc                | SPEC-EGOV-GET-TOC-025                | 空の `law_name`                                                                   |
| search_fulltext        | SPEC-EGOV-SEARCH-FULLTEXT-033        | `limit` は 1 以上 30 以下の整数                                                   |
| search_fulltext        | SPEC-EGOV-SEARCH-FULLTEXT-034        | 空の `keyword`                                                                    |
| resolve_abbreviation   | SPEC-EGOV-RESOLVE-ABBREVIATION-010   | 空の `abbr`                                                                       |
| get_law_revisions      | SPEC-EGOV-GET-LAW-REVISIONS-012      | `latest` は 1 以上の整数                                                          |
| get_law_revisions      | SPEC-EGOV-GET-LAW-REVISIONS-013      | 空の `law_name`                                                                   |
| explain_law_type       | SPEC-EGOV-EXPLAIN-LAW-TYPE-019       | 空の `name`                                                                       |
| get_related_laws       | SPEC-EGOV-GET-RELATED-LAWS-016       | 空の `law_name`                                                                   |
| get_article_references | SPEC-EGOV-GET-ARTICLE-REFERENCES-039 | 空の `law_name` / `article`                                                       |
| get_article_references | SPEC-EGOV-GET-ARTICLE-REFERENCES-040 | `paragraph` は 1 以上の整数                                                       |
| get_article_references | SPEC-EGOV-GET-ARTICLE-REFERENCES-041 | `at` の形                                                                         |
| verify_citations       | SPEC-EGOV-VERIFY-CITATIONS-040       | `at` の形                                                                         |
| verify_citations       | SPEC-EGOV-VERIFY-CITATIONS-041       | `citations[].paragraph` は 1 以上の整数                                           |
| verify_citations       | SPEC-EGOV-VERIFY-CITATIONS-042       | 空の `citations[].article`                                                        |
| get_law_range          | SPEC-EGOV-GET-LAW-RANGE-029          | 空の `law_name`                                                                   |
| get_law_range          | SPEC-EGOV-GET-LAW-RANGE-030          | `suppl_index` は 1 以上の整数                                                     |
| get_law_range          | SPEC-EGOV-GET-LAW-RANGE-031          | `at` の形                                                                         |
| list_attachments       | SPEC-EGOV-LIST-ATTACHMENTS-020       | 空の `law_name`                                                                   |
| list_attachments       | SPEC-EGOV-LIST-ATTACHMENTS-021       | `at` の形                                                                         |
| get_attachment         | SPEC-EGOV-GET-ATTACHMENT-023         | 空の `law_name`                                                                   |
| get_attachment         | SPEC-EGOV-GET-ATTACHMENT-024         | `at` の形                                                                         |
| get_attachment         | SPEC-EGOV-GET-ATTACHMENT-025         | 空文字・空白だけの `src` は省略と同じ                                             |
| get_law_file           | SPEC-EGOV-GET-LAW-FILE-018           | 空の `law_name`                                                                   |
| get_law_file           | SPEC-EGOV-GET-LAW-FILE-019           | `at` の形                                                                         |

## 変える仕様 ID（MODIFIED、9 件）

| 単位            | 仕様 ID                       | 変わる点                                                                                                                  |
| --------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| common_errors   | SPEC-EGOV-COMMON-ERRORS-003   | 範囲（`minimum` / `maximum`）・形（`pattern` / `minLength` / `minItems` / `maxItems`）の違反も inputSchema の検査に含める |
| common_errors   | SPEC-EGOV-COMMON-ERRORS-012   | 例の `hint` の文（014 に合わせる）                                                                                        |
| common_errors   | SPEC-EGOV-COMMON-ERRORS-013   | `message` の文言を 022 で約束にする。例を日本語の文に差し替える                                                           |
| common_errors   | SPEC-EGOV-COMMON-ERRORS-014   | `hint` の括弧の中に「範囲・形式」を足す                                                                                   |
| search_law      | SPEC-EGOV-SEARCH-LAW-001      | 空文字は inputSchema の検査（025）で止める。本文の形が 013 の形になる                                                     |
| search_law      | SPEC-EGOV-SEARCH-LAW-007      | 空白だけは 026 の形（`tool`・`detail.issues`）を持つ                                                                      |
| get_law         | SPEC-EGOV-GET-LAW-003         | 空文字・空白だけは `INVALID_ARGUMENT`（`LAW_NOT_FOUND` をやめる）                                                         |
| search_fulltext | SPEC-EGOV-SEARCH-FULLTEXT-005 | 語が残らない入力の例から空文字を外す（空文字は 034）                                                                      |
| search_fulltext | SPEC-EGOV-SEARCH-FULLTEXT-029 | 「丸めた後の `limit`」を「渡した `limit`（省けば 10）」にする                                                             |

## 外す仕様 ID（REMOVED、3 件）

| 単位            | 仕様 ID                       | 理由                                             |
| --------------- | ----------------------------- | ------------------------------------------------ |
| get_toc         | SPEC-EGOV-GET-TOC-022         | 0 以下は全階層ではなく `INVALID_ARGUMENT`（023） |
| search_fulltext | SPEC-EGOV-SEARCH-FULLTEXT-025 | 1 未満は 1 件ではなく `INVALID_ARGUMENT`（033）  |
| search_fulltext | SPEC-EGOV-SEARCH-FULLTEXT-026 | 30 超は 30 件ではなく `INVALID_ARGUMENT`（033）  |

## 呼び出し例への影響（計画書 5.1 の事前確認）

2026-10-01 JST に houki-hub `scripts/reference-examples/houki-egov/ja/*.md`（24 例）と houki-research-skill の `examples/` `workflows/` `SKILL.md` を grep した。値は `limit` 2〜8、`latest` 2〜5、`depth` 1〜2、`paragraph` 1〜5、`at` は `2020-04-01` の形だけで、この差分の inputSchema で落ちる例は無い。先に直す例は無い。

## 取り込みのとき（Publisher）

- ADDED の見出しを、各 `specs/current/<dir>/spec.md` の「できること」の末尾に足す。MODIFIED は同じ見出しの本文を置き換える。REMOVED は見出しを外し、そのテスト（`src/spec-tests/` か `src/**/*.test.ts` の該当 `it`）を同じコミットで消す
- 各 spec.md の「入力」の表の `limit` / `latest` / `depth` / `paragraph` / `suppl_index` / `at` / `src` の行を、差分の各ファイルの冒頭の箇条書きのとおりに書き換える。`get_law` の「処理の流れ」の図も同じ箇条書きのとおりに直す
- 「未決」から次の項目を消す: common_errors 3・4・5・10、get_law 14・16・19・20、get_toc 8、search_fulltext 1、resolve_abbreviation 4、get_law_revisions 3、search_law 2、get_article_references 11、verify_citations 2（`at` の形の部分。e-Gov の 400 の文言は T2）・4、list_attachments 2、get_attachment 2・5、get_law_file 4
- 各 `specs/current/<dir>/spec.md` の承認日の行に「差分 `20261001-t1-argument-guards` は YYYY-MM-DD（PR #N）」を足す
- この差分のフォルダーを `specs/releases/<実装を出したタグ>/20261001-t1-argument-guards/` へ移し、この proposal.md の「状態」を取り込み済みにする

## 人が判断すること

1. **`search_fulltext` の `limit` の丸めをやめるか。** houki-hub `docs/DECISIONS.md` の「未決」。この差分は T1 の規則どおり「やめる」（025・026 を REMOVED、033 を ADDED）で書いた。丸めを残すなら 033 を「1〜30 の整数。範囲外は今のまま丸める」に書き換え、025・026 を残す。`search_law` の `limit`（013）は上限をかけていなかった動きを止めるだけなので、どちらにしても変わらない。
2. **`tool` の置き場。** houki-nta-mcp は本文の直下（`code` と並ぶ）に `tool` を置いている。段階 1 の #57 へのコメントは `detail.tool` と書いたが、揃える先の nta に合わせて本文の直下で書いた。`detail.tool` にするなら 020 と各ツールの例を書き換え、nta の T1 でも同じにする。
3. **`get_attachment` の空白だけの `src`。** 省略と同じ（zip）で書いた。`ATTACHMENT_NOT_FOUND` のままにするなら 025 を「空文字は省略と同じ、空白だけは一覧に無い `src` と同じ」に書き換える。
4. **`latest` と `depth` の上限。** 上限なしで書いた（`latest` は件数より大きければ全件、`depth` は階層より深ければ条まで。どちらも v0.15.4 の約束のまま）。上限を付けるなら 023 の表と SPEC-EGOV-GET-LAW-REVISIONS-012・SPEC-EGOV-GET-TOC-023 に値を書く。
5. **`message` の文（022 の表）。** 決まった文にすると受入テストがその文を確かめる。文言を約束にしたくなければ、022 を「日本語の 1 文で、検査の部品の英文を含まない」だけにする。
6. **承認日。** この proposal.md に承認日と PR 番号を書く。
