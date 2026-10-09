---
approved: 2026-09-28
pr: 76
implementation: required
targets: [cli_bulk_download, cli_entry, cli_status, cli_sync, common_errors, db_schema, explain_law_type, get_article_references, get_attachment, get_law, get_law_file, get_law_range, get_law_revisions, get_related_laws, get_toc, list_attachments, resolve_abbreviation, search_fulltext, search_law, verify_citations]
---
# 変更: テストが無いだけの振る舞いに仕様 ID を振る

- 対象: `specs/current/` の下の 20 本の `spec.md`（「できること」への追加）
- 実装の変更の補足: 受入テストを足す。`src/` の実行されるコードは変えない
- 状態: 取り込み済み。実装（受入テスト）は v0.15.2、`specs/current/` への取り込みは 2026-09-28（JST、実装 PR の最終コミット）
- 起こした日: 2026-09-28（JST）
- 起こした役: Spec Steward
- 関連: PR #50（初版起こし）、PR #68（未決のうち判断が要るものを #45〜#49・#51〜#67 に移した仕様 PR）

## なぜ変えるか

PR #50 の初版起こしで、「未決」のうち 113 件は「今の振る舞いのままでよく、テストが無いだけ」の項目だった。これらは利用者（MCP クライアントの LLM、CLI を使う人、houki-research-skill）がすでに頼っている振る舞いで、テストが無いために、変わっても CI が気付かない。今の振る舞いを仕様 ID 付きの「できること」にし、受入テストで固定する。

## 変わる振る舞い

無い。今の v0.15.1 の振る舞いを、仕様 ID を付けて書き起こすだけ。差分の本文の例は、どれも v0.15.1 の `src/` を VM で動かして確かめた入力と出力である（e-Gov への問い合わせは差し替え、実際の e-Gov には問い合わせていない）。

## 足す仕様 ID（ADDED、200 件）

| 単位                   | 未決の番号 → 仕様 ID                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cli_bulk_download      | 1 → 020・021・022・023・024・025、7 → 026                                                                                                                       |
| cli_entry              | 1 → 005、3 → 006・007                                                                                                                                           |
| cli_status             | 1 → 005・006、2 → 007                                                                                                                                           |
| cli_sync               | 1 → 009・010・011・012・013・014・015・016、2 → 017、4 → 018                                                                                                    |
| common_errors          | 1 → 012、2 → 013・014・015、8 → 016・017・018、9 → 019                                                                                                          |
| db_schema              | 1 → 012・013・014・015、2 → 016・017、6 → 018・019・020、8 → 021、9 → 022・023                                                                                  |
| explain_law_type       | 3 → 011・012・013、4 → 014、5 → 015、6 → 016、8 → 017                                                                                                           |
| get_article_references | 1 → 023、2 → 024、3 → 025、4 → 026・027・028、5 → 029、6 → 030、7 → 031、8 → 032、9 → 033、10 → 034・035・036・037・038                                         |
| get_attachment         | 6 → 011・012・013、7 → 014・015、8 → 016、9 → 017、10 → 018・019、11 → 020・021、12 → 022                                                                       |
| get_law                | 2 → 019・020、3 → 021・022、4 → 023・024、5 → 025、6 → 026、7 → 027、8 → 028・029・030・031、9 → 032、10 → 033、11 → 034・035                                   |
| get_law_file           | 5 → 008、6 → 009、7 → 010・011、8 → 012・013、9 → 014・015、10 → 016・017                                                                                       |
| get_law_range          | 1 → 017・018・019、2 → 020、3 → 021、4 → 022・023、5 → 024、6 → 025・026・027、7 → 028                                                                          |
| get_law_revisions      | 7 → 002、8 → 003、9 → 004、10 → 005・006・007・008、11 → 009・010、12 → 011                                                                                     |
| get_related_laws       | 1 → 009・010・011・012、2 → 013、3 → 014、4 → 015                                                                                                               |
| get_toc                | 1 → 012・013・014、2 → 015・016・017、3 → 018、4 → 019、5 → 020・021、6 → 022                                                                                   |
| list_attachments       | 3 → 010・011、4 → 012・013・014、5 → 015、6 → 016、7 → 017、8 → 018・019                                                                                        |
| resolve_abbreviation   | 1 → 005・006、2 → 007・008、6 → 009                                                                                                                             |
| search_fulltext        | 5 → 024・025・026、6 → 027、7 → 028・029、8 → 030・031、9 → 032                                                                                                 |
| search_law             | 4 → 002・003・004・005、5 → 006、6 → 007、7 → 008、8 → 009・010・011・012                                                                                       |
| verify_citations       | 6 → 020・021、7 → 022、8 → 023、9 → 024、10 → 025・026・027・028・029、11 → 030、12 → 031、13 → 032、14 → 033、15 → 034・035・036、16 → 037、17 → 038、18 → 039 |

仕様 ID の接頭辞は `SPEC-EGOV-<機能>-`（例: get_law 2 → `SPEC-EGOV-GET-LAW-019`）。1 つの未決の項目を、1 つの受入テストで確かめられる単位に分けたものがある。

## ID を振らなかった項目

| 未決                                              | 理由                                                                                              | 扱い                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| get_law 1（ツールの呼び出しを通したテストが無い） | 振る舞いは current の SPEC-EGOV-GET-LAW-004〜018 に書いてあり、新しい ID は要らない               | 実装 PR で、e-Gov の応答を差し替えて get_law を呼ぶ受入テストを、004〜018 の既存 ID で足す |
| db_schema 7（laws の既定値と必須の列）            | 未決の本文は「law_revision_id は空にできない」と書くが、主キーに NOT NULL が無く、NULL の行が入る | Issue にする（下の「見つかった問題」1）。未決に残す                                        |

## 約束にしなかったこと

- **接続の失敗の code。** 未決は「名前解決や接続の失敗は `SOURCE_UNAVAILABLE`」と書くが、Node 22 の fetch はこれらの失敗を message が `fetch failed` の TypeError で投げ、`ENOTFOUND`・`ECONNREFUSED` は `cause` にしか入らない。code への変換は message だけを見るため、実際には `SOURCE_API_ERROR`（`retryable: true`、`detail.cause: "fetch failed"`）になり、`SOURCE_UNAVAILABLE` は実際の fetch では出ない。どちらの code も約束にせず、Issue にする（下の「見つかった問題」2）。search_law 8、get_law_revisions 10、get_law 8、get_related_laws 3、get_article_references 3、list_attachments 8、get_attachment 10、get_law_file 9 の該当部分
- **法令名の検索の失敗。** get*toc 1・get_law_range 1 の SOURCE*\* は、法令本文の取得の失敗に限った。法令名の検索の失敗は `LAW_NOT_FOUND` になり、#46 で扱う
- **件数の区切り。** cli_status 1 の「件数は 3 桁ごとにコンマ」。環境の言語設定で区切りが変わる（`LANG=de_DE.UTF-8` で `1.234.567`）。Issue にする（下の「見つかった問題」3）
- **附則の別表・様式の図の置き場所。** list_attachments 4 のうち「附則の中の別表・様式の図にも `amend_law_num` が付く」。e-Gov の XML は附則の別表・様式を `SupplProvisionAppdxTable` などのタグで返すが、このタグを置き場所の判定が知らない。Issue にする（下の「見つかった問題」4）
- **施行規則の条から `search_fulltext` を案内するときの呼び名 `規則`。** get_article_references 10 の一部。当たる見込みが低く、#63 に足す
- **Issue で扱う範囲。** 次の部分は、移した先の Issue で決めるので約束にしていない: search_law の `total_count` の意味（#55）、空の `law_name` の code（#53）、目次の `meta.at` と補った `paragraph_num`（#64）、explain_law_type の `see_also`（#56）と `通知`（#62）、DB の版がサーバーより新しいとき（#60）、common_errors の `message` の文言と必須の引数の `path`（#57）、`limit` などの小数（#54）

## 見つかった問題（Issue にする）

1. **db_schema（#71）:** `laws.law_revision_id` に NULL が入る。また `schema_meta.schema_version` が数字でない DB を開くと、作り直しに進まず `UNIQUE constraint failed: schema_meta.key` で開けない
2. **e-Gov を呼ぶ全ツール（#69）:** 名前解決・接続の失敗が `SOURCE_UNAVAILABLE` にならない
3. **cli_status（#74）:** 件数の区切りが環境の言語設定で変わる
4. **list_attachments / get_attachment（#72）:** 附則の別表・様式にある図の `location` が `{ tag: "SupplProvision" }` になり、見出しが付かない
5. **explain_law_type（#73）:** `name: "toString"` や `"constructor"` で `found: true` になり、`info` が無い
6. **cli_bulk_download（#75）:** current の SPEC-EGOV-CLI-BULK-DOWNLOAD-006「取得が終わった時点の表示は 100%」が実装と合わない。推定より小さい zip では、終わったときの表示が 100% にならない

受入テストで見つかった問題: verify_citations で同じ未知の law_id が並ぶと、2 件目以降の keyword が law_name にならない（#70。SPEC-EGOV-VERIFY-CITATIONS-027 のこの場合のテストは外した）。

既存の Issue に足すもの: search_fulltext の `limit` に小数を渡すと `SqliteError: datatype mismatch` で応答が返らない（#54）。引数の問題が 2 つ以上あるとき `detail.issues` が 1 件になり、2 つ目の `message` に `data` の前置きが残る（#57）。施行規則の条からの呼び名 `規則`（#63）。

## 変わらない振る舞い

- 既存の仕様 ID 216 件の本文
- `src/` の実行されるコード

## 対象外

- Issue に移した未決（#45〜#49・#51〜#67、PR #68）と、上の「見つかった問題」

## 取り込みのとき（Publisher）

- ADDED の見出しを、各 `specs/current/<dir>/spec.md` の「できること」の末尾に足す
- 「未決」の該当項目は消さずに、題と仕様 ID だけの 1 行（例: 「2. **応答の外形と meta。** → SPEC-EGOV-GET-LAW-019・020」）にする。項目の番号は変えない
- `specs/current/<dir>/spec.md` の承認日の行に「差分 `20260928-untested-behaviors` は YYYY-MM-DD（PR #N）」を足す。あわせて、差分 `20260928-undecided-to-issues`（PR #68）の承認も書き足し、その proposal.md の「状態」を取り込み済みにして `specs/releases/<tag>/` へ移す

## 人が判断すること

1. **承認日。** proposal.md に承認日と PR 番号を書く。
2. **接続の失敗の code を約束から外したこと。** 見つかった問題 2 の Issue で決めてから、該当する ID に書き足す。
