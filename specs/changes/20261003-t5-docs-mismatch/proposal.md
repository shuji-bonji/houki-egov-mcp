# 変更: README・使い方・tool description と実際の動きの食い違いを、行ごとに直す（T5 文書と実装の食い違い）

- 対象: `specs/current/common_errors/spec.md`・`specs/current/explain_law_type/spec.md`（動きを変える行）と、README・CLI の使い方・tool description（文書だけを直す行。仕様 ID なし）
- 実装の変更: 要（`INTERNAL_ERROR` の `retryable` と `next_actions`、`UNKNOWN_TOOL` の `error` と `retryable`、`explain_law_type` の `see_also`。文書だけの行は「実装 PR で直す文書」）
- 承認日: 2026-10-01（PR #92）
- 状態: 提案中
- 起こした日: 2026-10-03（JST）
- 起こした役: Spec Steward
- 対象 Issue: houki-egov-mcp #56（README・CLI の使い方・tool description の記述が v0.15.1 の動きと合わない）。#65 の tool description の行（状態の値）も、T5 の規則で文書の行としてここに入れる
- 決定の出典: houki-hub `docs/DECISIONS.md` 2026-09-29「T5 文書と実装の食い違い」（`INTERNAL_ERROR` は `retryable: false`）、`docs/notes/2026-09-29-plan-spec-issues.md` 4 章「段階 1」「段階 4」、段階 1 で #56・#65 に投稿したコメント（2026-09-29）
- 前提: 差分 `20261003-t4-response-shape`（`spec/20261003-t4-response-shape`）の上に積む。マージも T4 → T5 の順。T4 と同じ仕様 ID はこの差分に置かない（T4 と T5 の両方に関わる ID は無かった）。houki-nta-mcp の同じ差分は、この差分の後に書き、`UNKNOWN_TOOL` と `INTERNAL_ERROR` の文を同じにする

## なぜ変えるか

#56 は、README・CLI の使い方・tool description に、v0.15.1 の動きと合わない記述が 7 行あるという Issue である。2026-09-29 の決定（T5）は、行ごとに振り分けて、動きを変える必要が無い行は文書を直し（仕様 PR に入れず、実装 PR で直す）、動きを変える行だけ仕様 PR に入れる、というものである。`INTERNAL_ERROR` は `retryable: false` に直す（`hint` の「報告してください」と合わせる）と決めている。

## 行ごとの振り分け（2026-10-03 JST の main `7b22169` で確かめた）

| #   | Issue の行                                                                               | 0.16.0 の状態                                                                                                                                           | 振り分け                                                        | 置き場所                                     |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| 1   | README のエラー表: `UNKNOWN_TOOL` は `retryable: false`                                  | 実装は `retryable` を付けず、`error` は英語の `Unknown tool: <name>`                                                                                    | 動きを変える（README の表のとおりにし、`error` を日本語にする） | SPEC-EGOV-COMMON-ERRORS-002（MODIFIED）      |
| 2   | README のエラー表: `INTERNAL_ERROR` は `retryable: false`                                | 実装は `retryable: true` と `retry_later`                                                                                                               | 動きを変える（決定のとおり）                                    | SPEC-EGOV-COMMON-ERRORS-007・018（MODIFIED） |
| 3   | README「まず試す」の「9 ツールのうち 8 つ」                                              | 37 行目は「14 ツールのうち 13」に直っている。174 行目の「それ以外の 6 ツールは DB が無くても動く」が残る                                                | 文書を直す                                                      | 実装 PR で直す文書 1                         |
| 4   | CLI の使い方の `DOCS:` 欄                                                                | 変わっていない（`docs/PHASE2-DESIGN.md`・`docs/PHASE2-SPIKE.md`）                                                                                       | 文書を直す                                                      | 実装 PR で直す文書 2                         |
| 5   | CLI の使い方に `--bulk-download-incremental` と `-v` が無い                              | 変わっていない                                                                                                                                          | 文書を直す（受け付ける動きは変えない）                          | 実装 PR で直す文書 3                         |
| 6   | `explain_law_type` の `see_also`                                                         | 変わっていない（`docs/LAW-HIERARCHY.md`）                                                                                                               | 動きを変える（応答の値）                                        | SPEC-EGOV-EXPLAIN-LAW-TYPE-020（ADDED）      |
| 7   | `get_toc` の `depth` の説明                                                              | tool description は「1=編まで、2=章まで、3=節まで」のまま。`specs/current/get_toc/spec.md` の入力の表と SPEC-EGOV-GET-TOC-010 はすでに「上から N 階層」 | 文書を直す                                                      | 実装 PR で直す文書 4                         |
| 8   | （#65）`get_law_revisions` の tool description の「状態（現行/旧法/未施行）」            | 変わっていない                                                                                                                                          | 文書を直す                                                      | 実装 PR で直す文書 5                         |
| 9   | （今回の確認で見つけた）CLI の使い方の `ENVIRONMENT:` 欄に `HOUKI_EGOV_FILES_DIR` が無い | `get_attachment` / `get_law_file` の保存先を変える環境変数で、README には載っている                                                                     | 文書を直す                                                      | 実装 PR で直す文書 6                         |

## 変わる振る舞い

| 場面                             | v0.16.0                                                            | この差分                                                                                                |
| -------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 存在しないツール名を呼ぶ         | `error: "Unknown tool: <name>"`、`retryable` 無し                  | `error: "存在しないツールです: <name>"`、`retryable: false`（COMMON-ERRORS-002）                        |
| 処理中の想定外の例外             | `INTERNAL_ERROR`、`retryable: true`、`next_actions: [retry_later]` | `INTERNAL_ERROR`、`retryable: false`、`next_actions` 無し（COMMON-ERRORS-007・018）                     |
| `explain_law_type` の `see_also` | `docs/LAW-HIERARCHY.md`                                            | `https://github.com/shuji-bonji/houki-egov-mcp/blob/main/docs/LAW-HIERARCHY.md`（EXPLAIN-LAW-TYPE-020） |

## 変わらない振る舞い

- `INTERNAL_ERROR` の `error` と `hint`（SPEC-EGOV-COMMON-ERRORS-016・017）、`detail.cause`
- 同期の記録の日付を読めないときの `INTERNAL_ERROR`（SPEC-EGOV-COMMON-ERRORS-031。すでに `retryable: false`）
- `UNKNOWN_TOOL` の `hint` と `next_actions`（`list_tools`）
- `get_toc` の `depth` の数え方（最上位の階層から数える。SPEC-EGOV-GET-TOC-010）
- CLI が受け付けるフラグ（`--bulk-download-incremental` と `-v` は今までどおり受け付ける。SPEC-EGOV-CLI-ENTRY-005、SPEC-EGOV-CLI-SYNC-017）
- `explain_law_type` の `see_also` のキー（値だけを変える）

## Issue の「決めること」への答え

### #56

| 決めること                                                | 答え                                                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INTERNAL_ERROR` の `retryable` と `hint`                 | `retryable: false`、`retry_later` を外す。`hint` は報告を求める今の文のまま（SPEC-EGOV-COMMON-ERRORS-007・018）                                   |
| `UNKNOWN_TOOL` の文面と `retryable`                       | `error` を日本語の `存在しないツールです: <name>` にし、`retryable: false` を付ける（SPEC-EGOV-COMMON-ERRORS-002）                                |
| `DOCS:` 欄と `see_also` を GitHub の URL にするか、外すか | どちらも GitHub の URL にする。`see_also` は応答のキーなので外さない（T4 の「フィールドを消さない」）。`DOCS:` 欄は使い方の文なので実装 PR で直す |
| `--bulk-download-incremental` と `-v` を使い方に載せるか  | 載せる（実装 PR で直す文書 3）                                                                                                                    |
| `depth` を「上から N 階層」と説明し直すか                 | 説明し直す。動きは変えない（実装 PR で直す文書 4）                                                                                                |

## 実装 PR で直す文書

仕様 ID を作らない行（動きを変えない行）。実装の会話は、この一覧を見て直す。公開文書の文は「〜します」「〜です」で書く。

| #   | 場所                                                                                    | 今の文                                                                             | 直した後の文（案）                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `README.md` 174 行目付近（「ローカル DB が要るのは `search_fulltext` だけです」の段落） | `それ以外の 6 ツールは DB が無くても動くので`                                      | `それ以外の 13 ツールは DB が無くても動くので`                                                                                                                                                                                                 |
| 2   | `src/cli/index.ts` の `printHelp()` の `DOCS:` 欄                                       | `docs/PHASE2-DESIGN.md 設計詳細` / `docs/PHASE2-SPIKE.md e-Gov bulk DL 仕様`       | `https://github.com/shuji-bonji/houki-egov-mcp#readme 使い方と各ツールの説明` / `https://github.com/shuji-bonji/houki-egov-mcp/blob/main/docs/PHASE2-DESIGN.md ローカル DB の設計` の 2 行。npm のパッケージに入っていない相対パスは書きません |
| 3   | 同じ `printHelp()` の `USAGE:` 欄                                                       | `--sync` と `--version` の行だけ                                                   | `--sync` の行に `（--bulk-download-incremental も同じです）`、`--version` の行に `-v` を足します（例: `houki-egov-mcp --version, -v`）                                                                                                         |
| 4   | `src/tools/definitions.ts` の `get_toc` の `depth` の `description`                     | `1=編まで、2=章まで、3=節まで。…民法を depth=1 で取得すると「第一編 総則」…`       | `本則の構造階層（編・章・節・款・目）を上から何階層まで返すか（1 以上の整数）。最上位の階層から数えるので、編を持つ法令（民法など）では 1 が編まで、章から始まる法令（消費税法など）では 1 が章までです。省略時は全階層`                       |
| 5   | `src/tools/definitions.ts` の `get_law_revisions` の `description`                      | `状態（現行/旧法/未施行）等を返す`                                                 | `状態（current_revision_status。CurrentEnforced=現行、PreviousEnforced=旧法、UnEnforced=未施行）等を返します。並びは施行日の新しい順で、まだ施行されていない改正も含みます`                                                                    |
| 6   | `src/cli/index.ts` の `printHelp()` の `ENVIRONMENT:` 欄                                | `HOUKI_EGOV_DB_PATH`・`HOUKI_EGOV_BULK_RETRY`・`HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS` | `HOUKI_EGOV_FILES_DIR=/path  get_attachment / get_law_file の save: true の保存先 (default: ${XDG_CACHE_HOME:-~/.cache}/houki-egov-mcp/files)` を足します                                                                                      |

#5 の並びの文は、T4 の差分（SPEC-EGOV-GET-LAW-REVISIONS-016）の実装と同じ PR で入れる。

README のエラー code の表（`UNKNOWN_TOOL` と `INTERNAL_ERROR` の `retryable` は `false`）は、この差分で実装が表に合うので変えない。

## 足す仕様 ID（ADDED、1 件）

| 単位             | 仕様 ID                        | 内容                        |
| ---------------- | ------------------------------ | --------------------------- |
| explain_law_type | SPEC-EGOV-EXPLAIN-LAW-TYPE-020 | `see_also` は GitHub の URL |

## 変える仕様 ID（MODIFIED、3 件）

| 単位          | 仕様 ID                     | 変わる点                                               |
| ------------- | --------------------------- | ------------------------------------------------------ |
| common_errors | SPEC-EGOV-COMMON-ERRORS-002 | `error` を日本語に、`retryable: false`                 |
| common_errors | SPEC-EGOV-COMMON-ERRORS-007 | `retryable: false`                                     |
| common_errors | SPEC-EGOV-COMMON-ERRORS-018 | `next_actions` を付けない（`retry_later` の 1 件から） |

T4 の差分の ID とは重ならない（T4 は `common_errors` と `explain_law_type` を変えていない）。

## 消す仕様 ID（REMOVED）

無い。

## 互換性

code は変えない。

- `INTERNAL_ERROR` の `retryable` が `true` から `false` に、`next_actions` が `[retry_later]` から無しに変わる。`next_actions` のキーが無くなるのは、SPEC-EGOV-COMMON-ERRORS-008（空なら付けない）による。2026-09-29 の決定で `retry_later` を外すと決めており、計画書 5.1 の「フィールドを消さない」の例外として CHANGELOG の「互換性」の節に書く
- houki-research-skill の `docs/ERROR-CODES.md` と `docs/ERROR-HANDLING.md` の `INTERNAL_ERROR` の行（再試行の案内）を、0.17.0 の publish と同じ日に直す（T2 の互換の扱いと同じ）
- `UNKNOWN_TOOL` の `error` の文が変わる。`error` の文で分岐している利用側は無い（Skill は `code` で分岐する）

## 実装の変更

- `src/server.ts` の `UNKNOWN_TOOL` の `makeError` の文を日本語にし、`retryable: false` を付ける
- 想定外の例外を `INTERNAL_ERROR` にする箇所で、`retryable: false` にし、`next_actions` を渡さない
- `src/tools/handlers.ts` の `explain_law_type` の `see_also` を GitHub の URL にする（2 か所）
- 上の「実装 PR で直す文書」の 6 行

## 取り込みのとき（Publisher）

- ADDED の見出しを `specs/current/explain_law_type/spec.md` の「できること」の末尾に足す。MODIFIED は見出しの行（題）も含めて、差分の見出しと本文に置き換える
- `common_errors` の「エラーの code」の表の `INTERNAL_ERROR` の行の説明に「再試行しても結果は変わらない（`retryable: false`）」を足す
- `explain_law_type` の 011・014 の末尾の括弧書きの行（`see_also` は #56 で扱う）を消す
- 「未決」を次のように直す
  - common_errors 6・7 → 「→ SPEC-EGOV-COMMON-ERRORS-002」「→ SPEC-EGOV-COMMON-ERRORS-007・SPEC-EGOV-COMMON-ERRORS-018」に書き換える
  - common_errors 11、cli_entry 4・5、get_toc 7 → 実装 PR で文書を直したので行を消す（番号は振り直さない）
  - explain_law_type 7 → 「→ SPEC-EGOV-EXPLAIN-LAW-TYPE-020」に書き換える。3・4 の「`see_also`」の語は 020 を指すように「→ … ・SPEC-EGOV-EXPLAIN-LAW-TYPE-020」を足す
- 各 `specs/current/<dir>/spec.md` の承認日の行に「差分 `20261003-t5-docs-mismatch` は YYYY-MM-DD（PR #N）」を足す
- この差分のフォルダーを `specs/releases/<実装を出したタグ>/20261003-t5-docs-mismatch/` へ移し、この proposal.md の「状態」を取り込み済みにする

## 人が判断すること

1. **`UNKNOWN_TOOL` の `error` の文。** `存在しないツールです: <name>` にした。houki-nta-mcp も同じ文にする。`tool` は付けない（呼ばれた名前は存在しないツールなので、`tool` に入れると「エラーを返したツール」の意味と合わない）。
2. **`INTERNAL_ERROR` の `next_actions` を無しにすること（018）。** 決定は「`retry_later` を外す」で、外すと空になるので付けない側で書いた。`retry_later` の代わりに Issue を開く案内（`action: "report_issue"`、`example.url` に Issues の URL）を入れる案もあるが、新しい `action` の名前を Skill の分岐に足すことになる。
3. **`DOCS:` 欄の 2 行（文書 2）。** GitHub の README と設計の文書の URL にした。設計の文書は開発者向けなので、README だけにして 1 行にする案もある。
4. **#65 の tool description の行をこの差分の文書の一覧に入れたこと。** #65 は T4 の Issue だが、description の行は T5 の規則（文書を直す）に当たるので、文書の一覧を 1 か所にするためにここへ置いた。`Closes #65` は T4 の実装と同じ実装 PR に書く。
5. **承認日。** この proposal.md に承認日と PR 番号を書く。
