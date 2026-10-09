---
approved: 2026-09-28
pr: 68
implementation: none
targets: [cli_bulk_download, cli_entry, cli_status, cli_sync, common_errors, db_schema, explain_law_type, get_article_references, get_attachment, get_law, get_law_file, get_law_range, get_law_revisions, get_related_laws, get_toc, list_attachments, resolve_abbreviation, search_fulltext, search_law, verify_citations]
---
# 変更: 「未決」のうち判断が要る 85 件を Issue に移す

- 対象: `specs/current/` の下の 20 本の `spec.md`（`## 未決` の節）
- 状態: 取り込み済み。この仕様 PR（#68）の中で `specs/current/` に反映し、v0.15.2 の実装 PR の最終コミットで `specs/releases/v0.15.2/` へ移した
- 起こした日: 2026-09-28（JST）
- 起こした役: Spec Steward
- 関連する Issue: PR #50（初版起こし）、#45〜#49 と、この差分で移す先の 17 件（#51〜#67）

## なぜ変えるか

PR #50 の初版起こしで、「未決」に 198 件が残った。このうち 85 件は、意図か不具合かを人が決める必要がある項目で、利用者にとって問題になる箇所でもある。初版起こしは現状を把握するためのもので、ここで見つかった問題は Issue で扱う。同じ判断が複数のツールに出ているため、判断ごとに Issue にまとめた。ツールをまたぐ 5 件は先に #45〜#49 として起票してあり、残りの 59 件を 17 件の Issue にまとめる（振り分けは houki-hub `docs/notes/issues-2026-09-28-egov-cross-tool/` と `docs/notes/issues-2026-09-28-egov-undecided/`）。

## 変わる振る舞い

無い。`spec.md` の「未決」の書き方だけを変える。

## 何を変えるか

- 判断が要る 85 件は、項目の題（太字の部分）と Issue の番号（`→ houki-egov-mcp #N`）だけを残し、本文を消す。本文は Issue に移してある
- 既存の項目の番号は変えない（「処理の流れ」の図と、houki-hub の振り分けの表が番号で参照しているため）

| Issue | 判断                                                 | 移した未決                                                                                                                                               |
| ----- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #45   | 法令名が完全一致しないときの法令の決め方             | get_law 12、get_toc 9、get_law_range 9、get_law_revisions 4、get_related_laws 6、get_article_references 13・17、verify_citations 5                       |
| #46   | 法令名の検索の失敗の code                            | get_law 13、get_law_revisions 5、get_related_laws 5、get_article_references 12、list_attachments 1、get_attachment 4、get_law_file 3、verify_citations 3 |
| #47   | `at` の形                                            | get_law 20、get_article_references 11、list_attachments 2、get_attachment 5、get_law_file 4、verify_citations 2                                          |
| #48   | `paragraph` の値                                     | get_law 19、verify_citations 4                                                                                                                           |
| #49   | 50 MB を超えるファイルの code                        | get_attachment 1、get_law_file 2                                                                                                                         |
| #51   | 附則の条を本則の条として扱う                         | get_law 15、verify_citations 1、get_article_references 14                                                                                                |
| #52   | 略称の全角・半角と、通達の略称                       | resolve_abbreviation 3・5、search_law 9                                                                                                                  |
| #53   | 空の文字列の引数                                     | get_law 14、resolve_abbreviation 4、search_fulltext 1、get_attachment 2                                                                                  |
| #54   | 数値の引数の範囲と、範囲表記の `article`             | search_law 2、get_law_revisions 3、get_toc 8、get_law 16                                                                                                 |
| #55   | search_law の `domain`・`total_count`・0 件の応答    | search_law 1・3・10、search_fulltext 2                                                                                                                   |
| #56   | README・使い方・説明と実際の食い違い                 | common_errors 6・7・11、cli_entry 4・5、explain_law_type 7、get_toc 7                                                                                    |
| #57   | 引数の検査のエラーの `detail` と code の語彙         | common_errors 3・4・5・10                                                                                                                                |
| #58   | 日次差分の `last_sync_date` と差分の無い日           | cli_bulk_download 2・3・5、cli_sync 3                                                                                                                    |
| #59   | 段落だけの本則と、作れない公布日                     | cli_bulk_download 4・6                                                                                                                                   |
| #60   | DB を作る・作り直す・消す場面                        | db_schema 3・4・5・10、cli_status 3                                                                                                                      |
| #61   | CLI の引数の打ち間違いと `--status` の表示           | cli_entry 2、cli_status 4・5                                                                                                                             |
| #62   | explain_law_type の `通知` と法令種別コード          | explain_law_type 1・2                                                                                                                                    |
| #63   | 名前から関係法令・委任先を推定する規則               | get_related_laws 7、get_article_references 15・16                                                                                                        |
| #64   | 場合によって付かない応答のフィールド                 | get_law 17・18、get_law_range 8                                                                                                                          |
| #65   | get_law_revisions の状態の値・順・値の無いフィールド | get_law_revisions 1・2・6                                                                                                                                |
| #66   | 添付・本文ファイルの名前の決め方                     | get_attachment 3、get_law_file 1・11                                                                                                                     |
| #67   | search_fulltext の通称の展開と 2 文字の語の例        | search_fulltext 3・4                                                                                                                                     |

件数: 未決 198 件のうち、Issue に移すのは 85 件（#45〜#49 に 26 件、新しい 17 件に 59 件）。残るのは、今の振る舞いのままでよくテストが無いだけの 113 件。

## 変わらない振る舞い

- 仕様 ID と「できること」「できないこと」「処理の流れ」
- テストが無いだけの項目の本文（受入テストを書いてから ID を振る）
- `spec-ids check` の結果

## 対象外

- Issue の中身の判断と、それに伴う仕様の変更（Issue ごとに仕様 PR と実装 PR を出す）
- テストが無いだけの 113 件に受入テストを足す作業（仕様 PR で ADDED の差分を出し、Test Designer の実装 PR で扱う）

## 人が判断すること

1. **承認日。** この proposal.md に承認日と PR 番号を書く。`specs/current/` の 20 本の承認日の行にも、この差分（`20260928-undecided-to-issues`）の承認日を書き足す。
2. **Issue の番号。** 新しい 17 件の番号は、起票した後に houki-hub の `scripts/apply-issue-numbers-2026-09-28-egov.sh` で仮の番号 `#51`〜`#67` から置き換える。置き換えの前後で `spec-ids check` の結果は変わらない。
3. **振り分け。** 判断ごとのまとめ方（例: #56 に文書の食い違いを 7 件まとめたこと）でよいか。
