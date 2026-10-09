---
approved: 2026-10-01
pr: 85
implementation: required
targets: [cli_status, common_errors, get_article_references, get_attachment, get_law, get_law_file, get_law_range, get_law_revisions, get_related_laws, get_toc, list_attachments, search_fulltext, verify_citations]
---
# 変更: 「見つからない」と「取得元の失敗」の code を分ける（T2）

- 対象: `specs/current/common_errors/spec.md` と、`get_law` / `get_toc` / `get_law_range` / `get_law_revisions` / `get_related_laws` / `get_article_references` / `list_attachments` / `get_attachment` / `get_law_file` / `verify_citations` / `search_fulltext` / `cli_status` の `specs/current/<dir>/spec.md`
- 状態: 取り込み済み（v0.16.0）
- 起こした日: 2026-10-01（JST）
- 起こした役: Spec Steward
- 対象 Issue: houki-egov-mcp #46（法令名検索の失敗が `LAW_NOT_FOUND` になる）、#49（50 MB 超を `INVALID_ARGUMENT` で断る）、#69（接続できないとき `SOURCE_UNAVAILABLE` にならない）、houki-abbreviations 0.7.0 からの申し送り（`computeDaysSince` / `judgeStaleness` の例外）
- 決定の出典: houki-hub `docs/DECISIONS.md` 2026-09-29「T2 code」「T2 の互換の扱い」、2026-10-01「段階 3 の申し送り 2 件の置き場」、`docs/notes/2026-09-29-plan-spec-issues.md` 4 章「段階 4」・7 章・8 章、段階 1 で各 Issue に投稿したコメント（`docs/notes/issues-2026-09-29-decisions/egov-46.md` / `egov-49.md` / `egov-69.md`）
- 前提: 差分 `20261001-t1-argument-guards`（承認 2026-10-01、PR #84）の上に積む。T1 の `common_errors` の ID は 020〜026 まで使っているので、この差分は 027 から振る。同じ版（0.16.0）に入れる T3（`spec/20261001-t3-normalize`）は、この差分のマージ後にその上へ積む。houki-nta-mcp の同じ差分（`spec/20261001-t2-error-codes`）は、この差分の後に書き、code の規則の文を同じにする

## なぜ変えるか

v0.15.4 では、法令名から law_id を決める e-Gov の法令名検索が通信の失敗（接続できない・時間切れ・5xx・429）で終わっても、10 ツールが `LAW_NOT_FOUND` を返す（#46）。LLM は「法令名の書き間違い」と「e-Gov との通信の一時的な失敗」を code で見分けられず、`retryable` も付かないので、障害のときに別の法令名を試し続ける。接続できないとき（DNS の失敗・接続拒否）は、Node 22 の `fetch` が投げる例外の `message` が `fetch failed` で、`ENOTFOUND` などの文字列は `cause.code` にしか無いため、`SOURCE_UNAVAILABLE` ではなく `SOURCE_API_ERROR` になる（#69）。`get_attachment` / `get_law_file` の `save: true` で 50 MB を超えるファイルは、全部取得してから `INVALID_ARGUMENT` で断るが、引数の誤りではない（#49）。houki-abbreviations 0.7.0 の `computeDaysSince` は解釈できない日付に `RangeError` を投げるようになり、`sync_state.last_sync_date` が日付として解釈できない値のとき、`search_fulltext` と `--status` が想定外の例外で止まる。

2026-09-29 の決定（T2）は、`SOURCE_*` は取得元との通信が失敗したときだけ、`*_NOT_FOUND` は問い合わせが成功して 0 件のときだけにする、接続できないときは `err.cause.code` を見て `SOURCE_UNAVAILABLE` にする、50 MB 超は pdf-reader-mcp に既にある `FILE_TOO_LARGE` にする、というものである。

## 変わる振る舞い

| 場面                                                                                                      | v0.15.4                                                                                                          | この差分                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 法令名から law_id を決める e-Gov の法令名検索が、接続できない・時間切れ・5xx・429 で終わった（10 ツール） | `LAW_NOT_FOUND`（`retryable` 無し。`resolve_abbreviation` と `search_law` を案内）                               | `SOURCE_UNAVAILABLE` / `SOURCE_TIMEOUT` / `SOURCE_API_ERROR`（`retryable: true`）/ `SOURCE_RATE_LIMITED`。`LAW_NOT_FOUND` は検索が成功して 0 件のときだけ    |
| 法令名検索が 429 以外の 4xx で終わった（10 ツール）                                                       | `LAW_NOT_FOUND`                                                                                                  | `SOURCE_API_ERROR`（`retryable: false`、`detail.status`）。`search_law` の SPEC-EGOV-SEARCH-LAW-012 と同じ                                                   |
| e-Gov に接続できない（`ENOTFOUND` / `ECONNREFUSED` / `EAI_AGAIN`。e-Gov を呼ぶ 11 ツール）                | `SOURCE_API_ERROR`（`detail.cause: "fetch failed"`）                                                             | `SOURCE_UNAVAILABLE`（`retryable: true`、`detail.cause` にその code）                                                                                        |
| `verify_citations` で、e-Gov との通信と関係の無い例外が起きた                                             | `SOURCE_API_ERROR`（`retryable: true`）                                                                          | `INTERNAL_ERROR`（SPEC-EGOV-COMMON-ERRORS-007 の形）                                                                                                         |
| `get_attachment` / `get_law_file` の `save: true` で、ファイルが 50 MB を超える                           | 全部取得してから `INVALID_ARGUMENT`                                                                              | `FILE_TOO_LARGE`（`retryable: false`）。応答の Content-Length で分かるときは本文を取らずに返す                                                               |
| `sync_state.last_sync_date` が日付として解釈できない（`search_fulltext` の `source: "bulk"`、`--status`） | 想定外の例外（`INTERNAL_ERROR`、`retryable: true`）。`--status` は `[ERROR] 内部エラー` ではなく例外のまま終わる | `INTERNAL_ERROR`（`retryable: false`、`hint` に全件の取り込みで同期の記録を作り直す案内）。`--status` は `[ERROR] 同期の記録を読めません: …` を出して exit 1 |

## 変わらない振る舞い

- 法令名検索が成功して 0 件のときの `LAW_NOT_FOUND` の本文（`hint`、`next_actions` の `resolve_abbreviation` と `search_law`）
- 法令本文の取得（law_id が決まった後）で e-Gov が失敗したときの code（SPEC-EGOV-GET-LAW-028〜031、SPEC-EGOV-GET-TOC-014、SPEC-EGOV-GET-LAW-RANGE-019、SPEC-EGOV-GET-LAW-REVISIONS-005〜008、SPEC-EGOV-GET-ATTACHMENT-018・019、SPEC-EGOV-GET-LAW-FILE-014、SPEC-EGOV-VERIFY-CITATIONS-034〜036）。この差分は、law_id を決める前の法令名検索の失敗を同じ code にする
- `verify_citations` が e-Gov の失敗でツール全体をエラーにし、判定できた件を返さないこと（SPEC-EGOV-VERIFY-CITATIONS-034〜036）。段階 1 の #46 へのコメントで「仕様 PR で決める」とした点で、変えない（下の「人が判断すること」2）
- 接続できないときの取り直し。v0.15.4 の時点で、e-Gov への要求はネットワークの失敗でも 429・5xx と同じ回数（3 回）取り直してから失敗にしている。この差分は code だけを変え、取り直しの回数は変えない（#69 の「接続できないときも取り直すか」への答え）
- 50 MB の上限の値と、利用者が変えられないこと（#49 の「上限を変えられるようにするか」への答え。下の「人が判断すること」3）
- `INTERNAL_ERROR` の `retryable`（SPEC-EGOV-COMMON-ERRORS-007 の `true`）。#56 の T5 で `false` に直す。この差分で足す `INTERNAL_ERROR` の 2 場面（`verify_citations` の関係の無い例外、同期の記録の日付）は、007 の形で返す
- `LAW_NOT_FOUND` / `ARTICLE_NOT_FOUND` / `RANGE_NOT_FOUND` / `ATTACHMENT_NOT_FOUND` の意味（問い合わせが成功して求めたものが無い）。#45（完全一致が無いときの候補）は段階 5 で、この規則を前提にする

## Issue の「決めること」への答え

### #46

| 決めること                                                                                                               | 答え                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 法令名検索の失敗を、どのツールでも `SOURCE_*`（`retryable` 付き）にするか。`LAW_NOT_FOUND` は成功して 0 件のときに限るか | そのとおりにする（SPEC-EGOV-COMMON-ERRORS-027・029 と 10 ツールの ID）。code の対応は法令本文の取得の失敗と同じ表     |
| `verify_citations` で、e-Gov と関係の無い例外を `SOURCE_*` と別の code にするか                                          | `INTERNAL_ERROR` にする（SPEC-EGOV-VERIFY-CITATIONS-043）                                                             |
| `verify_citations` で、1 件の失敗のときにそれまでに判定できた件を返すか                                                  | 返さない（変えない）。SPEC-EGOV-VERIFY-CITATIONS-034〜036 のとおりツール全体をエラーにする。下の「人が判断すること」2 |
| 法令名検索が返した 4xx を `SOURCE_API_ERROR` のままにするか                                                              | そのまま（`retryable: false`）。`search_law` の SPEC-EGOV-SEARCH-LAW-012 と同じ                                       |

### #49

| 決めること                                         | 答え                                                                                                                                                                                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| code を何にするか                                  | `FILE_TOO_LARGE`（`retryable: false`）。`common_errors` の code の表に足す（SPEC-EGOV-COMMON-ERRORS-030）。実装 PR と同じ日に houki-research-skill の `docs/ERROR-CODES.md` に足す                                                  |
| 取得の前（Content-Length）か取得の途中で打ち切るか | 応答ヘッダーの Content-Length が上限を超えていれば本文を読まずに返す。Content-Length が無いか上限以下のときは本文を読み、読み終えた大きさで確かめる（途中で打ち切らない）。SPEC-EGOV-GET-ATTACHMENT-027、SPEC-EGOV-GET-LAW-FILE-021 |
| 上限（50 MB）を利用者が変えられるようにするか      | 変えられるようにしない（この差分では固定のまま）。下の「人が判断すること」3                                                                                                                                                         |

### #69

| 決めること                                            | 答え                                                                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `err.cause.code` も見て `SOURCE_UNAVAILABLE` にするか | 見る（SPEC-EGOV-COMMON-ERRORS-028）。`ENOTFOUND` / `ECONNREFUSED` / `EAI_AGAIN` に加えて `ECONNRESET` / `ETIMEDOUT`（接続の途中で切れた・接続の時間切れ）も同じ扱い |
| 接続できないときも取り直すか                          | 取り直す（v0.15.4 の時点で取り直している。変えない）                                                                                                                |

### houki-abbreviations 0.7.0 の申し送り（`computeDaysSince` / `judgeStaleness` の例外）

| 決めること                | 答え                                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 例外を捕まえたときの code | `INTERNAL_ERROR`、`retryable: false`（SPEC-EGOV-COMMON-ERRORS-031、SPEC-EGOV-SEARCH-FULLTEXT-035）。時間をおいても DB の値は変わらないので `retryable: false`。`hint` で全件の取り込みを案内する |
| `--status` の扱い         | `[ERROR] 同期の記録を読めません: <例外の文>` を標準エラー出力に出して exit 1（SPEC-EGOV-CLI-STATUS-009）。SPEC-EGOV-CLI-STATUS-006（DB を開けないとき）と同じ形                                  |

## 足す仕様 ID（ADDED、19 件）

| 単位                   | 仕様 ID                              | 内容                                                                                             |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| common_errors          | SPEC-EGOV-COMMON-ERRORS-027          | `SOURCE_*` は通信の失敗だけ、`*_NOT_FOUND` は問い合わせが成功して 0 件のときだけ（規則と対応表） |
| common_errors          | SPEC-EGOV-COMMON-ERRORS-028          | 接続できないときは `err.cause.code` を見て `SOURCE_UNAVAILABLE`                                  |
| common_errors          | SPEC-EGOV-COMMON-ERRORS-029          | 法令名検索の失敗は 10 ツールで `SOURCE_*`（ツールの一覧）                                        |
| common_errors          | SPEC-EGOV-COMMON-ERRORS-030          | 上限を超えるファイルは `FILE_TOO_LARGE`                                                          |
| common_errors          | SPEC-EGOV-COMMON-ERRORS-031          | 同期の記録の日付を解釈できないときは `INTERNAL_ERROR`（`retryable: false`）                      |
| get_law                | SPEC-EGOV-GET-LAW-038                | 法令名検索の失敗は `SOURCE_*`                                                                    |
| get_toc                | SPEC-EGOV-GET-TOC-026                | 同上                                                                                             |
| get_law_range          | SPEC-EGOV-GET-LAW-RANGE-032          | 同上                                                                                             |
| get_law_revisions      | SPEC-EGOV-GET-LAW-REVISIONS-014      | 同上                                                                                             |
| get_related_laws       | SPEC-EGOV-GET-RELATED-LAWS-017       | 同上                                                                                             |
| get_article_references | SPEC-EGOV-GET-ARTICLE-REFERENCES-042 | 同上                                                                                             |
| list_attachments       | SPEC-EGOV-LIST-ATTACHMENTS-022       | 同上                                                                                             |
| get_attachment         | SPEC-EGOV-GET-ATTACHMENT-026         | 同上                                                                                             |
| get_attachment         | SPEC-EGOV-GET-ATTACHMENT-027         | 50 MB 超は `FILE_TOO_LARGE`。Content-Length で分かれば本文を読まない                             |
| get_law_file           | SPEC-EGOV-GET-LAW-FILE-020           | 法令名検索の失敗は `SOURCE_*`                                                                    |
| get_law_file           | SPEC-EGOV-GET-LAW-FILE-021           | 50 MB 超は `FILE_TOO_LARGE`。Content-Length で分かれば本文を読まない                             |
| verify_citations       | SPEC-EGOV-VERIFY-CITATIONS-043       | e-Gov との通信と関係の無い例外は `INTERNAL_ERROR`                                                |
| search_fulltext        | SPEC-EGOV-SEARCH-FULLTEXT-035        | 同期の記録の日付を解釈できないときは `INTERNAL_ERROR`                                            |
| cli_status             | SPEC-EGOV-CLI-STATUS-009             | 同期の記録の日付を解釈できないときは `[ERROR]` と exit 1                                         |

## 変える仕様 ID（MODIFIED）・消す仕様 ID（REMOVED）

無い。仕様 ID の無い本文の変更は、`common_errors` の「エラーの code」の表（`LAW_NOT_FOUND` と `SOURCE_*` の説明、`FILE_TOO_LARGE` の行）だけである。

## 互換性（T2 の互換の扱い）

code が変わる場面は次の 3 つで、実装 PR の CHANGELOG に「互換性」の節で書き、同じ日に houki-research-skill の `docs/ERROR-CODES.md`（`FILE_TOO_LARGE` を足す）と `docs/ERROR-HANDLING.md`（`SOURCE_UNAVAILABLE` の分岐）を直す。旧 code を並行して返す期間は設けない。

| 場面                                                 | 旧 code            | 新 code                                                                              |
| ---------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------ |
| 法令名検索が通信の失敗で終わった（10 ツール）        | `LAW_NOT_FOUND`    | `SOURCE_UNAVAILABLE` / `SOURCE_TIMEOUT` / `SOURCE_API_ERROR` / `SOURCE_RATE_LIMITED` |
| e-Gov に接続できない（11 ツール）                    | `SOURCE_API_ERROR` | `SOURCE_UNAVAILABLE`                                                                 |
| `save: true` のファイルが 50 MB を超える（2 ツール） | `INVALID_ARGUMENT` | `FILE_TOO_LARGE`                                                                     |

## 呼び出し例への影響

2026-10-01 JST に houki-hub `scripts/reference-examples/houki-egov/ja/*.md` と houki-research-skill の `skills/houki-research/` を grep した。

- houki-hub `scripts/reference-examples/houki-egov/ja/get_law_file.md` の「1 ファイル 50 MB を超えるときは保存せず `INVALID_ARGUMENT` を返します」は、段階 6 で `FILE_TOO_LARGE` に直す
- houki-research-skill `docs/ERROR-CODES.md` の `FILE_TOO_LARGE` の行は pdf-reader-mcp の列だけに ○ があるので、実装 PR と同じ日に houki-egov-mcp の列にも ○ を付ける。`docs/ERROR-HANDLING.md` と `SKILL.md` の `SOURCE_TIMEOUT` / `SOURCE_UNAVAILABLE` の分岐は既にあるので、文は変えない（段階 6 で実際に `SOURCE_UNAVAILABLE` が返ることを確かめる）
- `LAW_NOT_FOUND` を通信の失敗の例として載せている呼び出し例は無い
- README の `INVALID_ARGUMENT` の行（「保存でファイルが 50 MB を超えた」）と `get_attachment` の注意書きは実装 PR で直す

## 取り込みのとき（Publisher）

- ADDED の見出しを、各 `specs/current/<dir>/spec.md` の「できること」の末尾に足す。MODIFIED は同じ見出しの本文を置き換える
- `common_errors` の「エラーの code」の表を、差分の `common_errors/spec.md` の冒頭の箇条書きのとおりに書き換える
- 「未決」から次の項目を消す: get_article_references 12、get_attachment 1・4、get_law 13、get_law_file 2・3、get_law_revisions 5、get_related_laws 5、list_attachments 1、verify_citations 3
- 各 `specs/current/<dir>/spec.md` の承認日の行に「差分 `20261001-t2-error-codes` は YYYY-MM-DD（PR #N）」を足す
- この差分のフォルダーを `specs/releases/<実装を出したタグ>/20261001-t2-error-codes/` へ移し、この proposal.md の「状態」を取り込み済みにする

## 人が判断すること

1. **`ECONNRESET` / `ETIMEDOUT` を `SOURCE_UNAVAILABLE` に含めるか（028）。** 決定は `ENOTFOUND` / `ECONNREFUSED` / `EAI_AGAIN` の 3 つを挙げている。接続の途中で切れた（`ECONNRESET`）と TCP の接続の時間切れ（`ETIMEDOUT`）も「接続できない」に当たるので含めた。含めないなら 028 の表から 2 行を消す。
2. **`verify_citations` の部分的な結果（034〜036）。** 変えずに書いた。判定できた件を返すなら、応答の形（`results` とエラーを同時に持つ）が T4 の話になるので、この差分には入れない。
3. **50 MB の上限を環境変数で変えられるようにするか（027・021）。** 固定のままにした。変えるなら `HOUKI_EGOV_FILES_MAX_BYTES` のような環境変数を SPEC-EGOV-GET-ATTACHMENT-020（環境変数が無いときの保存先）と同じ節に足す。
4. **同期の記録の日付を解釈できないときに検索を失敗させるか（031・035）。** `INTERNAL_ERROR` で止める側で書いた。検索の結果だけ返して `freshness` を `null` にする案もあるが、`null` は「同期の記録が無い」（SPEC-EGOV-SEARCH-FULLTEXT-023）の意味で使っているので、解釈できない記録と区別できなくなる。
5. **`INTERNAL_ERROR` の `retryable`。** 031・035・043 の `retryable` は、007 の `true` のままか（T5 の #56 で一括で `false` にする）、この差分で `false` と書くか。031・035 は時間をおいても変わらないので `false` と書いた。043 は 007 の形（`true`）で書き、#56 に委ねた。
6. **法令本文の取得で e-Gov が 404 を返したときの code。** SPEC-EGOV-GET-LAW-031 は `SOURCE_API_ERROR`（`retryable: false`）、SPEC-EGOV-VERIFY-CITATIONS-015 は `LAW_NOT_FOUND` で、v0.15.4 の時点でツールによって違う。T2 の規則（取得元の 404 は番号の誤りとして `*_NOT_FOUND`）を当てると 031 は `LAW_NOT_FOUND` になるが、#46・#49・#69 のどれにも無い場面なので、この差分では変えていない。変えるなら、法令本文の取得の 4xx を扱う ID（GET-LAW-031、GET-TOC-014、GET-LAW-RANGE-019、GET-LAW-REVISIONS-008、GET-ATTACHMENT-018、GET-LAW-FILE-014）を MODIFIED にする別の差分か、この差分に足す。
7. **承認日。** この proposal.md に承認日と PR 番号を書く。
