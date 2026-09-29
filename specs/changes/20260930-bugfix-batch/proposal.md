# 変更: 判断の要らない不具合 3 件の仕様（#73・#74・#75 の一括修正）

- 対象: `specs/current/explain_law_type/spec.md`、`specs/current/cli_status/spec.md`（「できること」への追加）
- 実装の変更: 要
- 承認日: 2026-09-30（PR #81）
- 状態: 草案
- 起こした日: 2026-09-30（JST）
- 起こした役: Spec Steward
- 関連: Issue #73・#74・#75（差分 `20260928-untested-behaviors` の「見つかった問題」5・3・6）。Issue #70 は同じ実装 PR で直すが、仕様は変えないので、この差分には含めない（下の「仕様を変えない Issue」）

## なぜ変えるか

差分 `20260928-untested-behaviors`（PR #76）の Steward と Test Designer が見つけた問題のうち、意図の判断が要らない不具合 4 件（#70・#73・#74・#75）を、1 つの実装 PR で直す。そのうち #73 と #74 は、直した後の振る舞いが `specs/current/` に書かれていないので、この差分で仕様 ID を足す。#70 と #75 は、直した後の振る舞いがすでに current の仕様 ID に書かれているので、仕様は変えず実装だけを直す。

## 変わる振る舞い

### explain_law_type（#73）

`name` に `toString`・`constructor`・`hasOwnProperty` など、JavaScript の `Object.prototype` のプロパティの名前を渡すと、v0.15.3 までは `found: true` を返し、`info` の無い応答になる。これを、SPEC-EGOV-EXPLAIN-LAW-TYPE-005 の知らない名前と同じ `found: false` の応答（`hint` と `next_actions`）にする。

### cli_status（#74）

`--status` の `laws:` と `articles:` の件数は、v0.15.3 までは実行する環境の言語設定で 3 桁の区切りが変わる（既定では `1,234,567`、`LANG=de_DE.UTF-8` では `1.234.567`）。これを、環境の言語設定によらず `1,234,567` に固定する。

## 足す仕様 ID（ADDED、2 件）

| 単位             | 仕様 ID                        | 内容                                                                            |
| ---------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| explain_law_type | SPEC-EGOV-EXPLAIN-LAW-TYPE-018 | `Object.prototype` のプロパティの名前は知らない名前として `found: false` を返す |
| cli_status       | SPEC-EGOV-CLI-STATUS-008       | 件数の 3 桁の区切りは環境の言語設定によらず `,`                                 |

## 仕様を変えない Issue（この差分には含めない）

- **#70（verify_citations）:** 同じ未知の `law_id` の件が 1 回の呼び出しに並ぶと、2 件目以降の `next_actions` の `search_law` の `keyword` が `law_name` にならない。直した後の振る舞いは SPEC-EGOV-VERIFY-CITATIONS-027 にすでに書かれている。実装 PR で、Issue に書かれた受入テストを `src/spec-tests/untested-20260928/verify_citations.test.ts` に戻す
- **#75（cli_bulk_download）:** 取得が終わった時点の進捗の表示が 100% にならない。直した後の振る舞いは SPEC-EGOV-CLI-BULK-DOWNLOAD-006「取得が終わった時点の表示は 100% である」にすでに書かれている。実装 PR で、既存の受入テスト `src/services/bulk/zip-fetcher.test.ts` に「終わった時点は 100%」の確認を足す

## 変わらない振る舞い

- 既存の仕様 ID の本文
- `explain_law_type` の収録している種別・別名・法令種別コードでの照合（SPEC-EGOV-EXPLAIN-LAW-TYPE-001〜004・016・017）
- `--status` の件数以外の行（SPEC-EGOV-CLI-STATUS-005）

## 対象外

- `explain_law_type` の `see_also`（#56）と `通知`（#62）
- `--status` の `laws` の件数の意味（#61）

## 取り込みのとき（Publisher）

- ADDED の見出しを、`specs/current/explain_law_type/spec.md` と `specs/current/cli_status/spec.md` の「できること」の末尾に足す
- 2 本の `specs/current/<dir>/spec.md` の承認日の行に「差分 `20260930-bugfix-batch` は YYYY-MM-DD（PR #N）」を足す
- この差分のフォルダーを `specs/releases/<実装を出したタグ>/20260930-bugfix-batch/` へ移し、この proposal.md の「状態」を取り込み済みにする

## 人が判断すること

1. **承認日。** この proposal.md に承認日と PR 番号を書く。
