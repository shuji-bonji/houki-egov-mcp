# 変更: 全角・半角・ダッシュ類の揃え方を houki-abbreviations 0.7.0 に一本化する（T3）

- 対象: `resolve_abbreviation` / `search_law` / `search_fulltext` / `db_schema` と、`law_name` を略称辞書で引く 10 ツール（`get_law` / `get_toc` / `get_law_range` / `get_law_revisions` / `get_related_laws` / `get_article_references` / `list_attachments` / `get_attachment` / `get_law_file` / `verify_citations`）の `specs/current/<dir>/spec.md`
- 実装の変更: 要（`package.json` の `@shuji-bonji/houki-abbreviations` を `^0.7.0` に上げる変更を含む）
- 承認日: 2026-10-01（PR #86）
- 状態: 取り込み済み（v0.16.0）
- 起こした日: 2026-10-01（JST）
- 起こした役: Spec Steward
- 対象 Issue: houki-egov-mcp #52（略称の全角・半角を吸収せず、通達の略称への応答が違う）、houki-abbreviations 0.7.0 からの申し送り（`normalizeJpText` がダッシュ類を `-` に揃えるので、DB の検索用列と食い違う）
- 決定の出典: houki-hub `docs/DECISIONS.md` 2026-09-29「T3 正規化」、2026-10-01「段階 3 の申し送り 2 件の置き場」、`docs/notes/2026-09-29-plan-spec-issues.md` 3 章・4 章「段階 3」「段階 4」・8 章、段階 1 で #52 に投稿したコメント（`docs/notes/issues-2026-09-29-decisions/egov-52.md`）、houki-abbreviations 0.7.0 の `specs/current/resolve_abbreviation/spec.md`（007〜012）と `specs/current/normalize_jp_text/spec.md`（012・013）
- 前提: 差分 `20261001-t1-argument-guards`（PR #84）と `20261001-t2-error-codes`（PR #85）の上に積む。houki-nta-mcp の同じ差分（`spec/20261001-t3-normalize`）は、この差分の後に書き、「揃える範囲」の文を同じにする

## なぜ変えるか

v0.15.4 は、`law_name` / `abbr` / `keyword` を略称辞書で引くとき、`search_fulltext` だけが `normalize: true`（全角英数字・ダッシュ類・全角空白を半角に揃えてから照合）で引き、ほかの 12 ツールは渡された文字列のまま引く。`resolve_abbreviation` に `ＰＬ法` を渡すと `resolved: null`、`get_law` に `ＰＬ法` を渡すと e-Gov の法令名検索に進んで `LAW_NOT_FOUND` になる（#52）。通達の略称（`消基通`）を `get_law` に渡すと `OUT_OF_SCOPE` だが、`search_law` に渡すと正式名称 `消費税法基本通達` で e-Gov を検索して 0 件を返す（#52）。

houki-abbreviations 0.7.0 で `normalizeJpText` がダッシュ類（`‐` `‑` `–` `—` `―` `−`）も `-` に揃えるようになった。houki-egov-mcp は取り込みのとき `articles.body` と `laws_fts` の各列を `normalizeJpText` で揃え、検索語も同じ関数（`normalizeSearchQuery`）で揃えるので、0.16.0 で依存を `^0.7.0` に上げると、検索語のダッシュ類は `-` になるが、0.16.0 より前に取り込んだ行の本文は `―` のままになる。

2026-09-29 の決定（T3）は、揃える場所を houki-abbreviations の関数に一本化し、MCP は入口で `normalize: true` を使う、というものである。DB の検索用列の入れ直しは、Steward が影響を確かめてから、`schema_version` を上げない方法か 0.19.0 の再取り込みまで見送るかを proposal.md に書く（2026-10-01 の決定）。

## 変わる振る舞い

| 場面                                                                                                                                | v0.15.4                                                                         | この差分                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolve_abbreviation` / `search_law` / 10 ツールの `law_name` に全角英数字・ダッシュ類・全角空白を含む略称（`ＰＬ法`、`労基法　`） | 辞書に無い扱い（`resolved: null`、e-Gov を検索して 0 件、`LAW_NOT_FOUND`）      | 半角に揃えてから辞書と照合し、`PL法` と同じエントリに当たる。応答の `abbr` / `query.keyword` は渡した値のまま                                                                      |
| `search_law` に houki-egov の管轄でない略称（`消基通`）                                                                             | 正式名称で e-Gov を検索して 0 件                                                | `get_law` と同じ `OUT_OF_SCOPE`（e-Gov に問い合わせない。SPEC-EGOV-GET-LAW-032 と同じ案内）                                                                                        |
| `resolve_abbreviation` に houki-egov の管轄でない略称                                                                               | `resolved` にエントリを入れて返す（管轄の印は `resolved.source_mcp_hint` だけ） | `resolved` はそのまま、`in_scope: false` と `hint`（管轄先の MCP 名）を足す。管轄のエントリには `in_scope: true`。houki-nta-mcp の SPEC-NTA-RESOLVE-ABBREVIATION-002・003 と同じ形 |
| `search_fulltext` の `keyword` にダッシュ類（`第１８３条―２`）                                                                      | `―` のまま検索（DB の本文も `―` のまま）                                        | `-` に揃えて検索。0.16.0 以降に取り込んだ本文は `-` で入るので当たる。0.16.0 より前に取り込んだ本文は `―` のままで、0.19.0 の取り込みまで当たらない（下の「DB の検索用列」）       |

## 変わらない振る舞い

- 略称辞書に無い名前を e-Gov の法令名検索に渡す値。辞書で当たらなかったときは、前後の空白を除いた渡した値のまま `law_title` に渡す（全角のまま）。e-Gov 側の照合の規則は e-Gov が決めるので、MCP では揃えない
- 大文字と小文字の区別（houki-abbreviations の SPEC-ABBR-RESOLVE-ABBREVIATION-008。`pl法` は `PL法` に当たらない）
- 語の内側の全角空白（`消　法`）。`normalize: true` は全角空白を半角空白にするだけで取り除かないので、`消 法` は辞書に無い扱いのまま
- `resolve_abbreviation` の `resolved` の中身（SPEC-EGOV-RESOLVE-ABBREVIATION-009）と、辞書に無いときの `resolved: null`（003・004）
- `get_law` など 10 ツールの `OUT_OF_SCOPE`（SPEC-EGOV-GET-LAW-001・032 など）
- スキーマの版（2 のまま）と、取り込みのときの揃え方が `normalizeJpText` であること（SPEC-EGOV-DB-SCHEMA-004）。関数の中身が 0.7.0 で変わるだけ
- `search_fulltext` の全角英数字・全角空白・大文字の扱い（SPEC-EGOV-SEARCH-FULLTEXT-006）と略称の OR 展開（007）。既に `normalize: true` で引いている

## DB の検索用列（ダッシュ類）の扱い

0.16.0 では DB の検索用列を入れ直さず、0.19.0（段階 5。#59・#60・#71 でスキーマの版を上げ、利用者が全件を取り込み直す）で揃える。理由:

1. houki-egov-mcp のスキーマの版の上げ方は「中身を消して空の DB にする」（SPEC-EGOV-DB-SCHEMA-016）で、版を上げると約 290 MB の再取り込みになる。0.19.0 でも同じ再取り込みが要るので、0.16.0 で上げると利用者の再取り込みが 2 回になる（計画書 8 章の「どちらの順でも 1 回」に反する）
2. `schema_meta` にキーを足して起動時に `articles.body` を全件 UPDATE する方法は、MCP の起動（stdio の initialize の前）で全条文（e-Gov 全法令で数十万行）を書き換えることになり、初回の起動が長く止まる。houki-nta-mcp（SPEC-NTA-DB-SCHEMA-007）より行数が 1 桁以上多い
3. 食い違いが起きるのは、検索語にダッシュ類（`‐` `‑` `–` `—` `―` `−`）を含めたときだけで、法令の本文でダッシュ類が出るのは別表・附則の表の中などに限られる。当たらない場合も `hits: []` で、誤った条が当たるのではない

この扱いを SPEC-EGOV-SEARCH-FULLTEXT-036 と SPEC-EGOV-DB-SCHEMA-024 に書く。実データでの件数は確かめていない（下の「人が判断すること」3）。

## Issue の「決めること」への答え

### #52

| 決めること                                                                                                   | 答え                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolve_abbreviation` で全角・半角の違いを吸収するか。他のツールの略称の引き当ても揃えるか                  | 吸収する。13 ツール（`resolve_abbreviation`、`search_law`、`search_fulltext`、`law_name` を引く 10 ツール）すべてで `normalize: true`（SPEC-EGOV-RESOLVE-ABBREVIATION-011、SPEC-EGOV-SEARCH-LAW-014、10 ツールの ID）                                                                                             |
| 通達の略称を渡されたとき、`resolve_abbreviation` と `search_law` を `get_law` と同じ `OUT_OF_SCOPE` にするか | `search_law` は `OUT_OF_SCOPE`（SPEC-EGOV-SEARCH-LAW-015）。e-Gov に通達は無いので 0 件を返すのは正しくない。`resolve_abbreviation` は辞書を引くツールで、どの管轄のエントリも返すのが役目なので、エラーにせず `in_scope: false` と `hint` を付ける（012・013）。houki-nta-mcp の `resolve_abbreviation` と同じ形 |
| `resolve_abbreviation` の説明を、通達も返すことに合わせて直すか                                              | 直す。tools/list の `description` に「辞書のエントリはどの管轄でも返し、`in_scope` と `hint` で管轄を示す」の旨を足す（実装 PR）                                                                                                                                                                                  |

### houki-abbreviations 0.7.0 の申し送り（DB の検索用列）

| 決めること                                             | 答え                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `schema_version` を上げない方法か、0.19.0 まで見送るか | 0.19.0 まで見送る（上の「DB の検索用列」）。0.16.0 のスキーマの版は 2 のまま（SPEC-EGOV-DB-SCHEMA-024） |

## 足す仕様 ID（ADDED、17 件）

| 単位                   | 仕様 ID                              | 内容                                                                     |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| resolve_abbreviation   | SPEC-EGOV-RESOLVE-ABBREVIATION-011   | 全角英数字・ダッシュ類・全角空白を半角に揃えてから辞書と照合する         |
| resolve_abbreviation   | SPEC-EGOV-RESOLVE-ABBREVIATION-012   | houki-egov の管轄のエントリには `in_scope: true`                         |
| resolve_abbreviation   | SPEC-EGOV-RESOLVE-ABBREVIATION-013   | 管轄外のエントリには `in_scope: false` と `hint`                         |
| search_law             | SPEC-EGOV-SEARCH-LAW-014             | 略称の照合で全角・ダッシュ類・全角空白を吸収する                         |
| search_law             | SPEC-EGOV-SEARCH-LAW-015             | 管轄外の略称は `OUT_OF_SCOPE` で e-Gov を引かない                        |
| search_fulltext        | SPEC-EGOV-SEARCH-FULLTEXT-036        | 検索語のダッシュ類を `-` に揃える。DB の本文は取り込んだ版の揃え方のまま |
| db_schema              | SPEC-EGOV-DB-SCHEMA-024              | 0.16.0 はスキーマの版 2 のままで、既存の行の検索用列を入れ直さない       |
| get_law                | SPEC-EGOV-GET-LAW-039                | `law_name` の略称の照合で全角・ダッシュ類・全角空白を吸収する            |
| get_toc                | SPEC-EGOV-GET-TOC-027                | 同上                                                                     |
| get_law_range          | SPEC-EGOV-GET-LAW-RANGE-033          | 同上                                                                     |
| get_law_revisions      | SPEC-EGOV-GET-LAW-REVISIONS-015      | 同上                                                                     |
| get_related_laws       | SPEC-EGOV-GET-RELATED-LAWS-018       | 同上                                                                     |
| get_article_references | SPEC-EGOV-GET-ARTICLE-REFERENCES-043 | 同上                                                                     |
| list_attachments       | SPEC-EGOV-LIST-ATTACHMENTS-023       | 同上                                                                     |
| get_attachment         | SPEC-EGOV-GET-ATTACHMENT-028         | 同上                                                                     |
| get_law_file           | SPEC-EGOV-GET-LAW-FILE-022           | 同上                                                                     |
| verify_citations       | SPEC-EGOV-VERIFY-CITATIONS-044       | 同上（`law_name` を書いた件）                                            |

## 変える仕様 ID（MODIFIED）・消す仕様 ID（REMOVED）

無い。

## 互換性

code は変えない。応答に足すのは `resolve_abbreviation` の `in_scope` と `hint` だけで、消すフィールドは無い。`search_law` に管轄外の略称を渡したときが 0 件の成功から `OUT_OF_SCOPE` のエラーに変わるので、CHANGELOG に書く（T2 の「互換性」の節と同じ節）。houki-research-skill の `docs/ERROR-CODES.md` は変えない（`OUT_OF_SCOPE` は既にある）。

## 呼び出し例への影響

2026-10-01 JST に houki-hub `scripts/reference-examples/houki-egov/ja/*.md` と houki-research-skill の `skills/houki-research/` を grep した。`search_law` に通達の略称を渡す例、全角の略称を渡す例、`resolve_abbreviation` の応答の形を `in_scope` 無しで固定している例は無い。houki-hub `resolve_abbreviation.md` の呼び出し例は `消基通`（管轄外）なので、段階 6 で実測をやり直すと `in_scope: false` と `hint` が応答に足される。houki-research-skill の `examples/invoice-registration.md` は houki-nta-mcp の `in_scope: false` の形を既に載せており、egov も同じ形になる。

## 取り込みのとき（Publisher）

- ADDED の見出しを、各 `specs/current/<dir>/spec.md` の「できること」の末尾に足す
- `resolve_abbreviation` の「処理の流れ」の図に、`in_scope` の分岐（012・013）を足す。`search_law` の図に `OUT_OF_SCOPE` の分岐（015）を足す
- 「未決」から次の項目を消す: resolve_abbreviation 3・5、search_law 9
- 各 `specs/current/<dir>/spec.md` の承認日の行に「差分 `20261001-t3-normalize` は YYYY-MM-DD（PR #N）」を足す
- この差分のフォルダーを `specs/releases/<実装を出したタグ>/20261001-t3-normalize/` へ移し、この proposal.md の「状態」を取り込み済みにする

## 人が判断すること

1. **`search_law` の管轄外の略称を `OUT_OF_SCOPE` にするか（015）。** エラーにする側で書いた。今の「0 件の成功」を残して `note` で管轄を知らせる案もあるが、`get_law` 系 10 ツールと揃わない。
2. **`resolve_abbreviation` に `in_scope` / `hint` を足すか（012・013）。** houki-nta-mcp と同じ形にした。フィールドを足すだけなので T4（応答の形）の規則（足すか `null` にするだけ）に反しない。
3. **DB の検索用列を 0.19.0 まで見送るか（036・024）。** 見送る側で書いた。実データでダッシュ類を含む条の件数は確かめていない（VM から `~/.cache/houki-egov-mcp/laws.db` に届かない）。承認の前に、取り込み済みの DB で `SELECT COUNT(*) FROM articles WHERE body GLOB '*[‐‑–—―−]*'` を実行し、件数が多ければ（目安: 全条の 1% 超）0.16.0 で `schema_meta` のキーによる入れ直しを足す側に変える。
4. **`in_scope` の `hint` の文。** nta と同じ `このエントリは <管轄> の管轄です。<管轄>-mcp で取得してください。` にした。
5. **承認日。** この proposal.md に承認日と PR 番号を書く。
