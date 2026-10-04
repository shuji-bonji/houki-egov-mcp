# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### In progress (Phase 2 — 残作業)

- Phase 2-13: API enrichment（`category` / `revisions_meta` / PreviousEnforced・Repeal の精緻化）

### Planned (Phase 1 磨き込み — 痛点ログ駆動 / Phase 2 着手前から残置)

- `search_fulltext` のキーワード中の漢数字の条番号（「民法 第七百九条」）を boost に使う（v0.7.0 は `get_law` の引数だけ）

## [0.19.1] - 2026-10-04

🐛 **patch リリース** — 段階 6 の段階 1（houki-hub `docs/notes/2026-10-04-plan-stage6-and-followups.md`）。仕様 PR [#112](https://github.com/shuji-bonji/houki-egov-mcp/pull/112)（`20261004-ingest-redistributed-revisions`）で承認した差分を実装し、`specs/current/` に取り込みました。閉じる Issue: #107。

> ⚠️ **0.19.0 で 2026-10-04 以降に `--sync` した DB は、0.19.1 に上げた後に `houki-egov-mcp --bulk-download-everything` を 1 回実行してください。** 施行日を過ぎても未施行のまま残った版の状態を直します（条の本文は入れ直しません。全件の zip 約 290 MB を取得します）。0.19.1 の `--sync` や `--status` が `[WARN] 施行日が last_sync_date …` を出したときも同じです。
>
> - DB のスキーマの版（3）と `INGEST_VERSION`（2）は変えていません。0.19.0 の DB をそのまま使えます。全件の入れ直しは起きません
> - このコマンドが要る DB の正確な範囲（`--sync` だけで直る場合）は [docs/NOTES.md](docs/NOTES.md) にあります

### 互換性

MCP のツールの応答（フィールド・`code`・`note`・`next_actions`）は変えていません。`search_fulltext` が返す版が、施行日を過ぎた法令で正しい現行の版になるだけです。CLI の既存の行の形と終了コードも変えず、新しい行は条件を満たすときだけ出します。

| 場面 | 0.19.0 | 0.19.1 | 仕様 ID |
| --- | --- | --- | --- |
| 施行日の当日の差分で、同じ XML の版が未施行の欄を空にして届く | `unchanged`。`UnEnforced` のまま、古い版が `CurrentEnforced` のまま | `unchanged` に数えたまま、状態だけを `CurrentEnforced` にし、古い版を `PreviousEnforced` にします | SPEC-EGOV-CLI-BULK-DOWNLOAD-014・016・031、SPEC-EGOV-CLI-SYNC-006 |
| 0.19.0 で状態が残った DB に `--bulk-download-everything` | 直りません（XML が同じなので全件 `unchanged`） | 直ります（031・033）。条の本文は入れ直しません | SPEC-EGOV-CLI-BULK-DOWNLOAD-031・033 |
| 取り込みの表示 | — | `status_changed` が 1 以上のとき `  状態の更新: <n> 件 (…)` の行が増えます | SPEC-EGOV-CLI-BULK-DOWNLOAD-032、SPEC-EGOV-CLI-SYNC-020 |
| `--sync`・`--status` で、施行日が `last_sync_date` より前の `UnEnforced` の版がある | 何も出しません | `[WARN] 施行日が last_sync_date (…) より前なのに未施行 (UnEnforced) のままの版が <n> 件あります。…` の行を出します。終了コードは変わりません | SPEC-EGOV-CLI-SYNC-021、SPEC-EGOV-CLI-STATUS-012 |

0.19.0 の DB に 0.19.1 の `--bulk-download-everything` を実行したときの取り込みの件数の出力の例です。

<!-- 仮の値。publish の前の確認の 3（shuji の Mac の DB のコピー）の実測の値に置き換える -->
```
  ingest 完了: 0 件 upsert, 10414 件 unchanged (2m10s)
  状態の更新: 5 件 (条の本文はそのまま、未施行 (UnEnforced) だった版の状態だけを書き換え)
```

### Fixed

- **施行日の当日に配り直される版の状態**（#107）: e-Gov は施行日の当日の差分に、公布の日に未施行として配った版を、同じ版の ID・同じ XML のまま未施行の欄を空にしてもう一度入れます。0.19.0 はこの版を `unchanged` として飛ばしていたので、施行日を過ぎても版が `UnEnforced` のまま、同じ法令の古い版が `CurrentEnforced` のまま残り、`search_fulltext` が改正前の条文を返し続けていました。0.19.1 は状態だけを `CurrentEnforced` にし、同じ法令の現行の版を 1 つにそろえます（SPEC-EGOV-CLI-BULK-DOWNLOAD-031・016）
- **全件の取り込みで、置き換わった未施行の版を前の版にする**（#107）: `--bulk-download-everything` は、全件の CSV に無い `UnEnforced` の版のうち、同じ法令の現行の版の施行日以前のものを `PreviousEnforced` にします（SPEC-EGOV-CLI-BULK-DOWNLOAD-033）。`--bulk-download-by-date` と `--sync` はこの処理をしません

### Added

- **状態の更新の行**: `--bulk-download-everything`・`--bulk-download-by-date`・`--sync` で状態だけを書き換えた版があれば、`  状態の更新: <n> 件 (条の本文はそのまま、未施行 (UnEnforced) だった版の状態だけを書き換え)` を出します（SPEC-EGOV-CLI-BULK-DOWNLOAD-032・SPEC-EGOV-CLI-SYNC-020）
- **施行日を過ぎた未施行の版の `[WARN]`**: `--sync`（終わったとき）と `--status` で、施行日が `last_sync_date` より前（同じ日を含まない）の `UnEnforced` の版を数え、1 件以上なら `--bulk-download-everything` を案内します（SPEC-EGOV-CLI-SYNC-021・SPEC-EGOV-CLI-STATUS-012）
- `IngestResult.status_changed`（状態だけを書き換えた版の数）と `IngestZipOptions.fullSnapshot`（全件の取り込みであることを示します。`--bulk-download-everything` だけが `true` を渡します）
- **受入テスト**: `src/spec-tests/20261004-ingest-redistributed-revisions/`（医師法施行規則の 4 版の fixture）

### Changed

- 仕様 ID では ADDED 6 件（SPEC-EGOV-CLI-BULK-DOWNLOAD-031・032・033、SPEC-EGOV-CLI-SYNC-020・021、SPEC-EGOV-CLI-STATUS-012）、MODIFIED 4 件（SPEC-EGOV-CLI-BULK-DOWNLOAD-011・014・016、SPEC-EGOV-CLI-SYNC-006）です。施行日の前日の差分に未施行の欄が空で届く版は、今までどおり e-Gov の CSV に従って現行にします（011 に明記しました）

### Documentation

- README: 「0.19.0 で 2026-10-04 以降に `--sync` した DB は、0.19.1 で 1 回取り込み直してください」の節と、「日々の更新と作り直し」の表に `[WARN]` の行を足した。正確な範囲は新しい `docs/NOTES.md` に書いた
- README: ローカル DB の節に、起動のしかた（plugin・MCP の設定ファイルに書いたサーバー・ターミナルの CLI）ごとに開く DB の表を足した。plugin は `env` を持たないので既定の `laws.db` を開き、`HOUKI_EGOV_DB_PATH` を付けずに実行した CLI は plugin と同じ `laws.db` を作る・更新する
- README: CLI の例を、どのフォルダーからでも動く `npx -y @shuji-bonji/houki-egov-mcp@latest <フラグ>` に直した（`houki-egov-mcp <フラグ>` はグローバルにインストールしたときだけ、`npx houki-egov-mcp` は 404）。MCP の設定ファイルの例も `@latest` にした
- README: 「日々の更新と作り直し」（`--sync` と `--bulk-download-everything` の使い分け）、「`search_fulltext` が `api-fallback` になるとき」（`note` の先頭ごとの原因と確かめ方）、「別のファイルで作った DB を `laws.db` に移す」（`PRAGMA wal_checkpoint(TRUNCATE)` の後に名前を変える。取り込み直しは不要）を足した
- CONTRIBUTING.md: 「ローカル DB を使う開発」を足した。古いコミットや DB の版を上げる変更を試すときは `HOUKI_EGOV_DB_PATH` を別のファイル（例: `laws.dev.db`）に向ける
- `--help`: どのフォルダーからでも動く `npx -y @shuji-bonji/houki-egov-mcp@latest <フラグ>` の形と、`HOUKI_EGOV_DB_PATH` を付けない CLI が plugin と同じ `laws.db` を扱うことを書いた。`--sync` の行に「ふだんの更新はこのコマンド」を足した

## [0.19.0] - 2026-10-04

✨ **minor リリース** — 段階 5 のうちローカル DB と CLI（houki-hub `docs/notes/2026-09-29-plan-spec-issues.md`）。仕様 PR [#100](https://github.com/shuji-bonji/houki-egov-mcp/pull/100)（`20261003-db-cli`）/ [#103](https://github.com/shuji-bonji/houki-egov-mcp/pull/103)（`20261003-db-cli-followup`）で承認した差分を実装し、`specs/current/` に取り込んだ。閉じる Issue: #58 #59 #60 #61 #71 #101 #102。

> ⚠️ **DB のスキーマの版を 3 に上げました。0.18.x 以前に作った DB は使えないので、`houki-egov-mcp --bulk-download-everything`（全件の zip 約 290 MB）で作り直してください。**
>
> - 作り直すまで、`search_fulltext` は条文本文を検索せずに `search_law` に切り替え、`note` で作り直しを案内します。`--sync`・`--status`・`--bulk-download-by-date` は DB に触れずに終了コード 1 で終わります
> - 作り直すのは zip の取得に成功した後です。取得に失敗したときは古い DB がそのまま残ります
> - **0.19.0 で作り直した DB（版 3）を 0.18.x 以前で開くと、版が違うため全テーブルが消えます**（0.18.x 以前の動きで、0.19.0 では直せません）。作り直した後は 0.18.x に戻さないでください。plugin などで版を固定している場合は CLI と同じ版にそろえてください
> - CLI の引数の誤り（`-` で始まらない引数、フラグの後の余分な引数、数値の環境変数の不正な値）は **終了コード 2** で、何もせずに終わります。スクリプトから呼んでいる場合は終了コードの扱いを確かめてください

### 互換性

応答の `code`（MCP のエラー）は変えない（T2 の互換の扱いは要らない）。応答のフィールドを消す・名前を付け替える変更は無い（T4）。`search_fulltext` の `api-fallback` の応答の `note`・`next_actions` の値が DB の状態で変わり、段落だけの本則・附則のヒットの `article_num`・`caption` が変わる。

**DB の版・作る入口・同期の記録・CLI の引数（`20261003-db-cli`）**

| 場面 | 0.18.x | 0.19.0 | Issue・仕様 ID |
| --- | --- | --- | --- |
| 0.18.x 以前に作った DB（版 2）を使う | そのまま使う | `search_fulltext` は `search_law` に切り替え（`note` に作り直しの案内）。`--sync`・`--status`・`--bulk-download-by-date` は終了コード 1。`--bulk-download-everything` で版 3 に作り直す | #60。SPEC-EGOV-DB-SCHEMA-016・025、SPEC-EGOV-SEARCH-FULLTEXT-036・040、SPEC-EGOV-CLI-SYNC-019、SPEC-EGOV-CLI-STATUS-011、SPEC-EGOV-CLI-BULK-DOWNLOAD-029・030 |
| 0.19.0 で作った DB（版 3）を 0.18.x 以前で開く | — | 0.18.x 以前は版が違うので全テーブルを消す（0.18.x 以前の動き。0.19.0 では直せない）。0.19.0 で作り直した後は 0.18.x に戻さない | #60 |
| 版が新しい・版を読めない DB | どの入口でも全テーブルを消して作り直す（読めない版は `UNIQUE constraint failed` の例外） | どの入口も書き換えない。CLI は終了コード 1、`search_fulltext` は `search_law` に切り替え | #60・#71。SPEC-EGOV-DB-SCHEMA-025・026 |
| DB の無い場所で `search_fulltext` / `--status` / `--sync` | フォルダーと空の DB を作る | 作らない。`--status` は `(DB がまだありません — …)` で終了コード 0 | #60。SPEC-EGOV-DB-SCHEMA-015・025、SPEC-EGOV-SEARCH-FULLTEXT-039、SPEC-EGOV-CLI-STATUS-010、SPEC-EGOV-CLI-SYNC-009 |
| `--bulk-download-by-date` で DB が無い | DB を作って取り込む | `[ERROR] DB がまだありません。…`、終了コード 1 | #60。SPEC-EGOV-CLI-BULK-DOWNLOAD-030 |
| `--status` の `laws:` | `  laws:     <版の数>` | `  laws:     <法令の数> (版: <版の数>)` | #61。SPEC-EGOV-CLI-STATUS-005・008 |
| `--status` / `freshness.warning` の日数 | 90 | `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS` の値（既定 90） | #61。SPEC-EGOV-CLI-STATUS-004、SPEC-EGOV-SEARCH-FULLTEXT-023 |
| `houki-egov-mcp status` などフラグでない引数 | MCP サーバーとして起動 | `ERROR: 未知の引数: …`、終了コード 2 | #61。SPEC-EGOV-CLI-ENTRY-008 |
| `--sync --status` などフラグの後の引数 | 最初のフラグだけ実行 | `ERROR: 余分な引数: …`、終了コード 2 | #61。SPEC-EGOV-CLI-ENTRY-009 |
| `--bulk-download-by-date` の後の `last_sync_date` | 実行した日（UTC） | 変わらない（同期の状態を作らず、書き換えない） | #58。SPEC-EGOV-CLI-BULK-DOWNLOAD-018 |
| `--bulk-download-by-date` で差分の無い日 | 取り直した後に `[ERROR] HTTP 500 …`、終了コード 1 | `  差分なし (HTTP 500)`、終了コード 0（先に e-Gov に届くかを HEAD で確かめる） | #58。SPEC-EGOV-CLI-BULK-DOWNLOAD-028 |
| `--bulk-download-everything` の `last_sync_date` | 取り込みを始めた時刻の UTC の日付 | 取得を始めた時刻の日本時間の日付（`last_full_dl_at` も取得を始めた時刻） | #58。SPEC-EGOV-CLI-BULK-DOWNLOAD-017 |
| `--sync` で差分の無い日 | 1 日 3 回取得 | 1 日 1 回 | #58。SPEC-EGOV-CLI-SYNC-005 |
| 本則が段落だけの法令（改暦ノ布告など） | 本文の行が無い | `article_num: "MainProvision"`（`search_fulltext` の表示は `本則`）の 1 行 | #59。SPEC-EGOV-CLI-BULK-DOWNLOAD-027、SPEC-EGOV-SEARCH-FULLTEXT-004 |
| 公布日を作れない法令の `promulgation_date` | `0001-01-01` | `NULL` | #59。SPEC-EGOV-CLI-BULK-DOWNLOAD-011、SPEC-EGOV-DB-SCHEMA-027 |

**段落だけの附則と数値の環境変数（`20261003-db-cli-followup`）**

| 場面 | 0.18.x | 0.19.0 | Issue・仕様 ID |
| --- | --- | --- | --- |
| `search_fulltext` の段落だけの附則のヒット | `article_num: "附則(<n>) intro"`、`caption: "附　則"` | `article_num: "附則(<n>)"`、`caption: null` | #101。SPEC-EGOV-CLI-BULK-DOWNLOAD-012、SPEC-EGOV-SEARCH-FULLTEXT-041 |
| CLI で数値の環境変数が `0`・`abc` | 既定値で動く | `ERROR: <変数名> は 1 以上の整数で指定してください: <値>`、終了コード 2 | #102。SPEC-EGOV-CLI-ENTRY-010 |
| CLI で数値の環境変数が負の数・小数 | その値（小数は整数部）で動く | 同上、終了コード 2 | #102。SPEC-EGOV-CLI-ENTRY-010 |
| MCP サーバーで数値の環境変数が不正 | `0`・`abc` は既定値。負の `HOUKI_EGOV_CONCURRENCY` は起動に失敗 | 既定値に置き換え、`[server] 警告: …` を出して起動 | #102。SPEC-EGOV-CLI-ENTRY-011 |

### Added

- **DB の状態ごとの扱い**（SPEC-EGOV-DB-SCHEMA-025）: DB を作る・作り直すのは `--bulk-download-everything` だけ。古い版は取得に成功した後でだけ作り直し、取得の前に `  DB の版 (<版>) が古いため、取得の後で作り直します（取り込んだ中身は消えます）` を出す（#60）
- **`--bulk-download-by-date` の e-Gov に届くかの確認**と「差分なし」（#58）
- **CLI の引数の検査**: 未知の引数・余分な引数（#61）、数値の環境変数（#102）
- **`--help` の `HOUKI_EGOV_CONCURRENCY`**（#102）
- **受入テスト**: `src/spec-tests/20261003-db-cli/`・`20261003-db-cli-followup/`

### Changed

- **スキーマの版 3**: `laws.law_revision_id` に `NOT NULL`（#71）、`laws.promulgation_date` の `NOT NULL` を外す（#59）、`sync_state.schema_version` 列を外す（#60）
- 「互換性」の節のとおり。仕様 ID では ADDED 17 件（db-cli 14、db-cli-followup 3）、MODIFIED 22 件（db-cli 20、db-cli-followup 2）、REMOVED 1 件（SPEC-EGOV-DB-SCHEMA-024）
- README: CLI の節に 0.19.0 の作り直しの案内・環境変数の表・引数の誤り、DB の節に版ごとの扱いの表を足した。tools/list の `search_fulltext` の description、`--help` の使い方、`docs/PHASE2-DESIGN.md` §3 を直した

### Removed

- テストにだけあった全データを消す関数 `clearAllData`。DB の中身を消したいときは DB のファイルを消す（場所は `--status` の `DB:` の行。#60）

## [0.18.0] - 2026-10-04

✨ **minor リリース** — 段階 5 のうち法令の引き当て・検索と解説と添付（houki-hub `docs/notes/2026-09-29-plan-spec-issues.md`）。仕様 PR [#95](https://github.com/shuji-bonji/houki-egov-mcp/pull/95)（`20261003-law-resolution`）/ [#96](https://github.com/shuji-bonji/houki-egov-mcp/pull/96)（`20261003-search-explain-attachment`）/ [#99](https://github.com/shuji-bonji/houki-egov-mcp/pull/99)（`20261003-law-type-and-reference-actions`）で承認した差分を実装し、`specs/current/` に取り込んだ。閉じる Issue: #45 #51 #63 #87 #55 #67 #88 #62 #72 #97 #98。

### 互換性

0.x の minor だが、応答の `code`、受け付ける引数、応答のフィールドが変わる。T2 の決め方（houki-hub `docs/DECISIONS.md` 2026-09-29「T2 code」）に従い、旧 code を並行して返す期間は設けない。同じ日に houki-research-skill の `docs/ERROR-CODES.md` を直す（`LAW_NOT_FOUND`・`INVALID_ARGUMENT` の場面の追加、`OUT_OF_SCOPE` を返すツールに `search_fulltext`、参照の `kind` に `suppl`）。応答のフィールドを消す・名前を付け替える変更は無い（消すのは引数 `domain` だけ）。

**法令名・条・委任先（`20261003-law-resolution`）**

| 場面 | 0.17.0 | 0.18.0 | Issue・仕様 ID |
| --- | --- | --- | --- |
| 辞書に無い法令名で、e-Gov に題名の完全一致が無い（9 ツール） | 成功（検索結果の先頭の法令） | `LAW_NOT_FOUND`（候補を `hint` と `next_actions` に入れる） | #45。SPEC-EGOV-COMMON-ERRORS-032、SPEC-EGOV-GET-LAW-041、SPEC-EGOV-GET-TOC-028、SPEC-EGOV-GET-LAW-RANGE-034、SPEC-EGOV-GET-LAW-REVISIONS-018、SPEC-EGOV-GET-RELATED-LAWS-019、SPEC-EGOV-GET-ARTICLE-REFERENCES-044、SPEC-EGOV-LIST-ATTACHMENTS-024、SPEC-EGOV-GET-ATTACHMENT-030、SPEC-EGOV-GET-LAW-FILE-023 |
| 法令名の検索で完全一致を探す範囲 | 先頭の 5 件（`verify_citations` は 50 件。`reason` の件数も 50 で頭打ち） | 検索結果の全件（`total_count`）。`at` を渡したときは検索にも `asof` を付ける | #45・#87。SPEC-EGOV-COMMON-ERRORS-032、SPEC-EGOV-VERIFY-CITATIONS-045、SPEC-EGOV-GET-ARTICLE-REFERENCES-045 |
| law_id を決めた後に e-Gov が 404・`404004`（改正履歴は `404001`） | `SOURCE_API_ERROR`（`retryable: false`） | `LAW_NOT_FOUND`（`detail.cause` に e-Gov の code） | #87。SPEC-EGOV-COMMON-ERRORS-033、SPEC-EGOV-GET-LAW-031、SPEC-EGOV-GET-TOC-029、SPEC-EGOV-GET-LAW-RANGE-035、SPEC-EGOV-GET-LAW-REVISIONS-008、SPEC-EGOV-GET-ARTICLE-REFERENCES-051、SPEC-EGOV-LIST-ATTACHMENTS-018、SPEC-EGOV-GET-ATTACHMENT-031、SPEC-EGOV-GET-LAW-FILE-014 |
| `at` が 2017-04-01 より前（e-Gov が 400・`400044`） | `SOURCE_API_ERROR`（`retryable: false`）。`verify_citations` は件ごとの `LAW_NOT_FOUND` | `INVALID_ARGUMENT`（`path: "at"`、`hint` に e-Gov の文）。`verify_citations` もツール全体 | #87。SPEC-EGOV-COMMON-ERRORS-029・033、SPEC-EGOV-VERIFY-CITATIONS-048 |
| `verify_citations` で `400044` 以外の 400 | 件ごとの `LAW_NOT_FOUND` | ツール全体の `SOURCE_API_ERROR`（`retryable: false`） | #87。SPEC-EGOV-VERIFY-CITATIONS-015・048 |
| `get_law` / `verify_citations` で、本則に無く附則にある条番号 | 附則の条を本則の条として返す（`found`） | `ARTICLE_NOT_FOUND`（附則の番号を案内） | #51。SPEC-EGOV-GET-LAW-008・042、SPEC-EGOV-VERIFY-CITATIONS-046 |
| `get_article_references` の対象の条 | 法令全体から探す（附則の条も対象） | 本則の条だけ。附則にだけある条番号は `ARTICLE_NOT_FOUND` | #51。SPEC-EGOV-GET-ARTICLE-REFERENCES-046 |
| `get_article_references` の本文の「附則第N条」 | `kind: "internal"`（本則の条を指す） | `kind: "suppl"`、`resolved: false`。`kind` の値が 1 つ増える | #51。SPEC-EGOV-GET-ARTICLE-REFERENCES-047 |
| `get_article_references` の `target_law` | 委任先が無いとキーが無い。省令は名前を問わず施行規則 | キーは常にあり、無い・確かでないときは `null`。省令・府令は施行規則を定めた命令の名前が合うときだけ | #63。SPEC-EGOV-GET-ARTICLE-REFERENCES-012・031・049 |
| `get_article_references` の施行規則の本文の「令第N条」 | 候補名 `令` の `resolved: false` | 兄弟の施行令への `external`（`get_law` を案内） | #63。SPEC-EGOV-GET-ARTICLE-REFERENCES-048 |
| `get_article_references` の施行規則の条からの `search_fulltext` | 施行令への委任から作る | 作らない | #63。SPEC-EGOV-GET-ARTICLE-REFERENCES-050 |
| `get_related_laws` に法律でない法令（末尾が「施行令」「施行規則」でない） | 名前を作って問い合わせ、`not_found` に入れる | `related: []`・`not_found: []`、`note` に理由 | #63。SPEC-EGOV-GET-RELATED-LAWS-004・020 |
| `get_law` の json の `data`、`verify_citations` の `article` | — | `suppl_index` を足す（本則の条は `null`） | #51。SPEC-EGOV-GET-LAW-043、SPEC-EGOV-VERIFY-CITATIONS-005・047 |

**検索・解説・添付（`20261003-search-explain-attachment`）**

| 場面 | 0.17.0 | 0.18.0 | Issue・仕様 ID |
| --- | --- | --- | --- |
| `search_law` / `search_fulltext` に `domain` を渡す | 受け付けて無視（成功） | `INVALID_ARGUMENT`（`path: "domain"`）。引数を外したので、渡している呼び出しは失敗する | #55。SPEC-EGOV-SEARCH-LAW-016、SPEC-EGOV-SEARCH-FULLTEXT-022 |
| `search_law` の `total_count` | `results` の件数 | e-Gov で一致した総数（`limit` を超えうる） | #55。SPEC-EGOV-SEARCH-LAW-006 |
| `search_law` の応答 | `query`・`total_count`・`results` | `hint`（1 件以上は `null`）・`next_actions`（1 件以上は `[]`）を足す。`search_fulltext` の `fallback` の中にも入る | #55。SPEC-EGOV-SEARCH-LAW-006・017 |
| `search_fulltext` の `filters.domain.note` | `domain 絞り込みは v0.5.0 では未実効です (…)` | `分野での絞り込みはしていません（domain の引数は 0.18.0 で外しました）`（`requested` は常に `null`） | #55。SPEC-EGOV-SEARCH-FULLTEXT-022 |
| `search_fulltext` の通称（`インボイス` など） | 常に正式名称にも展開 | 元の語で条が 0 件のときだけ展開。件数・並びが変わる | #67。SPEC-EGOV-SEARCH-FULLTEXT-007 |
| `search_fulltext` の 2 文字の語の `short_tokens.next_actions[0]` | `example: { keyword: "民法 <語>" }` | `example` 無し。`reason` に形を書く | #67。SPEC-EGOV-SEARCH-FULLTEXT-018 |
| `search_fulltext` に `keyword` 全体が管轄外の略称 | 成功（DB があれば 0 件、無ければ `fallback.code: "OUT_OF_SCOPE"`） | `OUT_OF_SCOPE`（`isError`） | #88。SPEC-EGOV-SEARCH-FULLTEXT-037 |
| `explain_law_type` の `通達` の `info.aliases` | `["通知", "基本通達", "取扱通達"]` | `["基本通達", "取扱通達"]` | #62。SPEC-EGOV-EXPLAIN-LAW-TYPE-012・021 |
| `explain_law_type` の `Constitution`・`Rule` | `found: false` | `found: true`（憲法・規則）。`憲法` の `info.law_type_code: "Constitution"`、`規則` は `"Rule"` | #62。SPEC-EGOV-EXPLAIN-LAW-TYPE-012・022 |
| `list_attachments` / `get_attachment` の附則の別表・様式・付録の中の図 | `{ tag: "SupplProvision", amend_law_num }` | `{ tag: "SupplProvisionAppdxTable" など, title, related_article, amend_law_num }` | #72。SPEC-EGOV-LIST-ATTACHMENTS-002・025 |

**law_type の勅令と、条の無い参照（`20261003-law-type-and-reference-actions`）**

| 場面 | 0.17.0 | 0.18.0 | Issue・仕様 ID |
| --- | --- | --- | --- |
| `search_law` / `search_fulltext` に `law_type: "ImperialOrdinance"` | `search_law` は `SOURCE_API_ERROR`、`search_fulltext` は 0 件の成功 | `INVALID_ARGUMENT`（`path: "law_type"`）。勅令は `ImperialOrder` で絞る | #97。SPEC-EGOV-SEARCH-LAW-018、SPEC-EGOV-SEARCH-FULLTEXT-038 |
| `law_type: "Constitution"` / `"ImperialOrder"` | `INVALID_ARGUMENT` | 受け付ける | #97。SPEC-EGOV-SEARCH-LAW-018、SPEC-EGOV-SEARCH-FULLTEXT-038 |
| `law_type` の `enum` の文（`INVALID_ARGUMENT` の `message`） | `Act・CabinetOrder・ImperialOrdinance・MinisterialOrdinance・Rule のどれかで指定してください` | `Constitution・Act・CabinetOrder・ImperialOrder・MinisterialOrdinance・Rule のどれかで指定してください` | #97。SPEC-EGOV-COMMON-ERRORS-013 |
| `get_article_references` の条を持たない external | `get_law`（呼んだ条の番号） | `get_toc`（参照先の法令名） | #98。SPEC-EGOV-GET-ARTICLE-REFERENCES-015・036・052 |

### Added

- **`get_law` の `suppl_index`** と、`verify_citations` の `citations[].suppl_index`: 附則の番号（`get_toc` の `suppl_provisions[].index` と同じ）で附則を指し、その附則の中の条を取る・確かめる（#51）
- **`search_law` の `hint` と `next_actions`**: 0 件のときに、題名だけを探したことと `search_fulltext`・`resolve_abbreviation` を案内する（#55）
- **`get_article_references` の `kind: "suppl"`**（#51）
- **受入テスト**: `src/spec-tests/20261003-law-resolution/`・`20261003-search-explain-attachment/`・`20261003-law-type-and-reference-actions/`

### Changed

- 「互換性」の節のとおり。仕様 ID では ADDED 37 件（law-resolution 28、search-explain-attachment 6、law-type-and-reference-actions 3）、MODIFIED 22 件（law-resolution 13、search-explain-attachment 6、law-type-and-reference-actions 3）
- tools/list の description: `get_law`・`verify_citations`・`get_article_references`・`get_related_laws`・`search_law`・`search_fulltext` と、`explain_law_type` の `name`・`law_type` の説明を 0.18.0 の振る舞いに合わせ、「〜します」の文にした
- README: 提供ツールの表、「エラー」の表（`LAW_NOT_FOUND`・`INVALID_ARGUMENT`・`ARTICLE_NOT_FOUND`・`OUT_OF_SCOPE`・`SOURCE_API_ERROR`）、施行令・施行規則と参照・引用の実在確認・2 文字の語の検索の節を直した

### Fixed

- `search_law` / `search_fulltext` の `law_type` の選択肢 `ImperialOrdinance` を e-Gov が受け付けず、勅令で絞れなかった（#97）
- `get_article_references` が、条番号の付かない他法令の参照から、呼んだ条の番号を参照先の法令の条として `get_law` を案内していた（#98）

## [0.17.0] - 2026-10-03

✨ **minor リリース** — 段階 4 の後半（houki-hub `docs/notes/2026-09-29-plan-spec-issues.md`）。仕様 PR [#91](https://github.com/shuji-bonji/houki-egov-mcp/pull/91)（T4 応答の形）/ [#92](https://github.com/shuji-bonji/houki-egov-mcp/pull/92)（T5 文書と実装の食い違い）で承認した差分を実装し、`specs/current/` に取り込んだ。対象 Issue: #56 #64 #65 #66。

### 互換性

0.x の minor で、応答の JSON の形が変わる場面がある。`code` は変えていない。消したフィールド・名前を付け替えたフィールドは無い（例外は T5 の `INTERNAL_ERROR` の `next_actions`）。

- **T4: 今まで「キーが無い」だった場面で `null` になるフィールド**
  - `meta.at`: `meta` を持つ 10 ツール（`get_law` / `get_toc` / `get_law_range` / `get_law_revisions` / `get_related_laws` / `get_article_references` / `list_attachments` / `get_attachment` / `get_law_file` / `verify_citations`）で、`at` を省いたときは `null`。`get_law` の目次の `meta` にも `at` を置く。`at` を受け取らない `get_law_revisions` / `get_related_laws` は常に `null`（#64。SPEC-EGOV-GET-LAW-020、SPEC-EGOV-GET-TOC-015、SPEC-EGOV-GET-LAW-RANGE-025、SPEC-EGOV-GET-LAW-REVISIONS-002、SPEC-EGOV-GET-RELATED-LAWS-010、SPEC-EGOV-GET-ARTICLE-REFERENCES-034、SPEC-EGOV-LIST-ATTACHMENTS-015、SPEC-EGOV-GET-ATTACHMENT-014、SPEC-EGOV-GET-LAW-FILE-001、SPEC-EGOV-VERIFY-CITATIONS-021）
  - `get_law` の json の `data.paragraph_num` / `data.item_num`: 渡さないときは `null`。`item` だけを渡して項を補ったときは `data.paragraph_num: 1`（#64。SPEC-EGOV-GET-LAW-024・040）
  - `get_article_references` の `meta.paragraph`: `paragraph` を指定しないときは `null`（#64。SPEC-EGOV-GET-ARTICLE-REFERENCES-022）
  - `get_law_revisions` の `revisions[]`: 8 つのキー（`law_revision_id`・`amendment_promulgate_date`・`amendment_enforcement_date`・`amendment_enforcement_comment`・`amendment_law_num`・`amendment_law_title`・`amendment_law_id`・`current_revision_status`）を常に持ち、e-Gov の要素に値が無いキーは `null`（#65。SPEC-EGOV-GET-LAW-REVISIONS-002）
  - `get_law_file` の `saved.law_revision_id`: 下の項目のとおり
  - JSON を `"at" in meta` のようにキーの有無で読んでいる側は、値（`null` かどうか）で読むように直す必要がある
- **T4: `get_law_revisions` の並び** — ツールが施行日の新しい順に並べる（まだ施行されていない改正を含む。施行日が同じ改正は e-Gov の順のまま、施行日が `null` の改正は先頭）。`latest` はこの順の先頭から数える。2026-10-03 の e-Gov の順と同じなので、見た目は変わらない。`current_revision_status` は e-Gov の値（`CurrentEnforced` / `PreviousEnforced` / `UnEnforced`）のまま（#65。SPEC-EGOV-GET-LAW-REVISIONS-009・016・017）
- **T4: `get_law_range` の続きの呼び出し例** — `range.next_actions[0].example` に、呼び出し側が渡した `max_chars` と `at` を入れる（省いた引数は入れない）。例のとおりに呼び直すと、最初の呼び出しと同じ上限と時点で続きを返す（#64。SPEC-EGOV-GET-LAW-RANGE-008）
- **T4: `get_attachment` のファイル名だけの `src`** — 一覧の 2 件以上の `file_name` に当たると、成功（一覧で先の添付）から `INVALID_ARGUMENT`（`tool: "get_attachment"`、`retryable: false`、`detail.issues`、候補の `src` ごとの `next_actions`）に変わる。ファイルは取らない。`src` を一覧の形で渡せば今までどおり（#66。SPEC-EGOV-GET-ATTACHMENT-002・029）
- **T4: `get_law_file` の `save: true`** — Content-Disposition が無いとき（または `filename` を含まないとき）の `saved.law_revision_id` が、法令 ID から `null` に変わる。保存先は `<law_id>/<law_id>.<file_type>` のまま。Content-Disposition に `filename` と `filename*` の両方があるときは、ヘッダーの中の順によらず `filename*` を使う（#66。SPEC-EGOV-GET-LAW-FILE-003・004）
- **T5: `INTERNAL_ERROR`** — 処理中の想定外の例外で返す `INTERNAL_ERROR` が `retryable: false` になり、`next_actions`（`retry_later`）が無くなる（キーごと付かない）。`hint` の「GitHub issue でご報告ください」と合わせるため。同期の記録の日付を読めないときの `INTERNAL_ERROR` は今までどおり（#56。SPEC-EGOV-COMMON-ERRORS-007・018）
- **T5: `UNKNOWN_TOOL`** — `error` が英語の `Unknown tool: <name>` から `存在しないツールです: <name>` になり、`retryable: false` が付く（#56。SPEC-EGOV-COMMON-ERRORS-002）
- **T5: `explain_law_type` の `see_also`** — `docs/LAW-HIERARCHY.md` から `https://github.com/shuji-bonji/houki-egov-mcp/blob/main/docs/LAW-HIERARCHY.md` になる。キーは変わらない（#56。SPEC-EGOV-EXPLAIN-LAW-TYPE-020）

### Added

- **受入テスト**: `src/spec-tests/20261003-t4-response-shape/`・`20261003-t5-docs-mismatch/`

### Changed

- 「互換性」の節のとおり。仕様 ID では ADDED 5 件（T4 4、T5 1）、MODIFIED 20 件（T4 17、T5 3）
- CLI の使い方（`--help`）: DOCS: 欄を GitHub の URL に、USAGE: 欄に `--bulk-download-incremental` と `-v`、ENVIRONMENT: 欄に `HOUKI_EGOV_FILES_DIR` を足した（#56）
- tools/list の description: `get_toc` の `depth` を「上から何階層まで返すか」の説明に、`get_law_revisions` に `current_revision_status` の 3 つの値と並びを書いた（#56 #65）
- README: ローカル DB が要らないツールの数を 13 に直した（#56）

## [0.16.0] - 2026-10-01

✨ **minor リリース** — 段階 4（houki-hub `docs/notes/2026-09-29-plan-spec-issues.md`）。仕様 PR [#84](https://github.com/shuji-bonji/houki-egov-mcp/pull/84)（T1 引数の検査）/ [#85](https://github.com/shuji-bonji/houki-egov-mcp/pull/85)（T2 code）/ [#86](https://github.com/shuji-bonji/houki-egov-mcp/pull/86)（T3 正規化）で承認した差分と、その書き残しを直した仕様 PR [#89](https://github.com/shuji-bonji/houki-egov-mcp/pull/89)（`20261002-t1-followups`）を実装し、`specs/current/` に取り込んだ。対象 Issue: #46 #47 #48 #49 #52 #53 #54 #57 #69。

### 互換性

0.x の minor だが、応答の `code` と、受け付ける引数の範囲が変わる。呼び出し側で `code` を見て分岐している場合は次を確かめること。旧 code を並行して返す期間は設けない。

- **T2: code が変わる 3 つの場面**
  - 法令名から law_id を決める e-Gov の検索が通信の失敗で終わったとき、`LAW_NOT_FOUND` ではなく `SOURCE_UNAVAILABLE` / `SOURCE_TIMEOUT` / `SOURCE_API_ERROR` / `SOURCE_RATE_LIMITED` を返す（`retryable` 付き）。`LAW_NOT_FOUND` は検索が成功して 0 件のときだけ。対象は `get_law` など 10 ツール（#46。SPEC-EGOV-COMMON-ERRORS-027・029、SPEC-EGOV-GET-LAW-038 ほか）
  - e-Gov に接続できないとき（`fetch failed` の `cause.code` が `ENOTFOUND` / `EAI_AGAIN` / `ECONNREFUSED` / `ECONNRESET` / `ETIMEDOUT`）、`SOURCE_API_ERROR` ではなく `SOURCE_UNAVAILABLE` を返し、`detail.cause` にその code を入れる（#69。SPEC-EGOV-COMMON-ERRORS-028）
  - `get_attachment` / `get_law_file` の `save: true` で 50 MB を超えるファイルは、`INVALID_ARGUMENT` ではなく `FILE_TOO_LARGE`（`retryable: false`、`detail.bytes`）。応答の Content-Length で分かるときは本文を読まない（#49。SPEC-EGOV-COMMON-ERRORS-030、SPEC-EGOV-GET-ATTACHMENT-027、SPEC-EGOV-GET-LAW-FILE-021）
  - あわせて、`verify_citations` で e-Gov との通信と関係の無い例外は `SOURCE_API_ERROR` ではなく `INTERNAL_ERROR`（SPEC-EGOV-VERIFY-CITATIONS-043）。ローカル DB の `sync_state.last_sync_date` を解釈できないときは、`search_fulltext` が `INTERNAL_ERROR`（`retryable: false`）、`--status` が `[ERROR] 同期の記録を読めません: …` を出して exit 1（SPEC-EGOV-COMMON-ERRORS-031、SPEC-EGOV-SEARCH-FULLTEXT-035、SPEC-EGOV-CLI-STATUS-009）
- **T1: 丸めずに `INVALID_ARGUMENT` にする引数**
  - `search_law` の `limit`（1〜50）、`search_fulltext` の `limit`（1〜30。今までは 1〜30 に丸めていた）、`get_law_revisions` の `latest`、`get_toc` の `depth`、`get_law` / `get_article_references` / `verify_citations` の `paragraph`、`get_law_range` の `suppl_index` は 1 以上の整数。0・負の数・小数・上限を超える値は丸めずに `INVALID_ARGUMENT` で、e-Gov に問い合わせない（#54 #48。SPEC-EGOV-COMMON-ERRORS-023、SPEC-EGOV-SEARCH-LAW-013、SPEC-EGOV-SEARCH-FULLTEXT-033 ほか）。`get_law_range` の `max_chars` も整数にした（2,000〜120,000 は変わらない）
  - 必須の文字列（`keyword` / `law_name` / `abbr` / `name` / `article` / `citations[].article`）の空文字と空白だけは、どのツールでも `INVALID_ARGUMENT`（#53。SPEC-EGOV-COMMON-ERRORS-025・026）。今まではツールによって `LAW_NOT_FOUND`・`resolved: null`・`hits: []` を返していた。`get_attachment` の空白だけの `src` は省いたときと同じ zip（SPEC-EGOV-GET-ATTACHMENT-025）
  - `at` は `YYYY-MM-DD` の形だけを受け付け、`2024/04/01` などの形と暦に無い日付（`2026-02-30`）は `INVALID_ARGUMENT`（#47。SPEC-EGOV-COMMON-ERRORS-024）
  - inputSchema の検査の `INVALID_ARGUMENT` は、`code` と並ぶ位置に `tool`（呼んだツール名）を持つ。`detail.issues` は違反 1 件ごとに分け、`path` に引数名（入れ子は `citations.0.paragraph`）、`message` に日本語の決まった文（`50 以下で指定してください` など。型が number と string の和の `item` / `part` などは `数値か文字列で指定してください`）を入れる。今までの `message` は英文（`must be <= 50`）で、inputSchema に無い引数が 2 つあると `path` が `typo, foo` の 1 要素だった。`hint` の括弧に「範囲・形式」を足した（#57。SPEC-EGOV-COMMON-ERRORS-013・014・020〜022、和の型の文と SPEC-EGOV-GET-LAW-RANGE-023 の例は #89）
- **T3: 管轄と全角・半角**
  - `search_law` に houki-egov の管轄でない略称（`消基通` など）を渡すと、0 件の成功ではなく `OUT_OF_SCOPE`（`get_law` と同じ本文）を返し、e-Gov に問い合わせない（#52。SPEC-EGOV-SEARCH-LAW-015）
  - `resolve_abbreviation` の応答に `in_scope`（管轄なら `true`）と、管轄外のときの `hint` を足した（フィールドを足しただけ。SPEC-EGOV-RESOLVE-ABBREVIATION-012・013）
  - 略称辞書の照合で全角英数字・ダッシュ類・全角空白を揃えるので、`ＰＬ法` が `PL法` と同じエントリに当たる（今までは辞書に無い扱いで `LAW_NOT_FOUND` などになっていた）
- **依存**: `@shuji-bonji/houki-abbreviations` を `^0.6.1` から `^0.7.0` に上げた。0.7.0 の `normalizeJpText` はダッシュ類（`‐` `‑` `–` `—` `―` `−`）も `-` にする。ローカル DB の検索用列（`articles.body` と `laws_fts`）のダッシュ類は 0.19.0 の取り込みまで入れ直さないので、0.15.4 以前に取り込んだ本文はダッシュ類を含む検索語では当たらない（SPEC-EGOV-DB-SCHEMA-024、SPEC-EGOV-SEARCH-FULLTEXT-036）。取り込み済みの DB でダッシュ類を含む条は 3,910 / 1,434,710 件（約 0.27%、2026-10-01 確認）

### Added

- **`FILE_TOO_LARGE`** の code（#49）
- **`resolve_abbreviation` の `in_scope` と `hint`**（#52）
- **inputSchema の範囲と形**: 数値の引数に `type: "integer"` と `minimum`（`limit` は `maximum` も）、`at` に `pattern`、必須の文字列に `minLength: 1`。tools/list を読む LLM にも上限と形が伝わる（#47 #48 #53 #54）
- **受入テスト**: `src/spec-tests/20261001-t1-argument-guards/`・`20261001-t2-error-codes/`・`20261001-t3-normalize/`・`20261002-t1-followups/` と、受入テスト用の `src/test-helpers/mcp-harness.ts`

### Changed

- 「互換性」の節のとおり。仕様 ID では ADDED 72 件（T1 36、T2 19、T3 17）、MODIFIED 10 件（T1 の 9 件と、#89 の SPEC-EGOV-GET-LAW-RANGE-023。#89 の SPEC-EGOV-COMMON-ERRORS-022 は T1 で足した本文の置き換え）、REMOVED 3 件（SPEC-EGOV-GET-TOC-022、SPEC-EGOV-SEARCH-FULLTEXT-025・026）
- 引数の検査を SDK の `fromJsonSchema`（ajv）から `src/tools/input-validator.ts` に置き換えた。ajv の結果は違反を 1 つの英文につないで返し、どの引数の違反かを持たないため。inputSchema に検査が対応していないキーワードがあればサーバーの起動時に止まる
- `get_toc` の `truncated` は、枝を刈ったときだけ `true`。`depth` が構造階層の深さ以上のときも `true` になっていた（SPEC-EGOV-GET-TOC-010 の本文と 023 の例に合わせた）

### Removed

- 返さない code（`ABBREVIATION_NOT_FOUND`・`EGOV_API_ERROR`・`EGOV_TIMEOUT`・`EGOV_RATE_LIMITED`）を `src/errors.ts` の型と README から外した（#57）

## [0.15.4] - 2026-09-30

**patch リリース** — 差分 `20260928-untested-behaviors`（PR #76）で見つかった、判断の要らない不具合 4 件を直した。仕様の差分は `20260930-bugfix-batch`（#73・#74 の 2 件に仕様 ID を足す。#70・#75 は既存の仕様 ID に合わせて実装を直す）。

### Fixed

- **`verify_citations`**（#70）: 同じ e-Gov が知らない `law_id` の件が 1 回の呼び出しに並ぶと、2 件目以降の `next_actions` の `search_law` の `keyword` が 1 件目の判定のままで、`law_name` を書いた件でも `law_id` になっていた。`law_id` で引いて `LAW_NOT_FOUND` のときは、件ごとの `law_name`（無ければ `law_id`）で `keyword` を決め直す（SPEC-EGOV-VERIFY-CITATIONS-027）
- **`explain_law_type`**（#73）: `name: "toString"` や `"constructor"` など `Object.prototype` のプロパティの名前で `found: true` を返し、`info` が無かった。自身のキーだけで引き、知らない名前と同じ `found: false`・`hint`・`next_actions` を返す（SPEC-EGOV-EXPLAIN-LAW-TYPE-018）
- **`--status`**（#74）: `laws:`・`articles:` の件数の 3 桁の区切りが環境の言語設定で変わっていた（`LANG=de_DE.UTF-8` で `1.234.567`）。環境によらず `1,234,567` にした（SPEC-EGOV-CLI-STATUS-008）
- **取得の進捗**（#75）: 推定の総バイト数より小さい zip では、取得が終わった時点の表示が 100% にならなかった。終わった時点の通知の割合を 1.0 にし、SPEC-EGOV-CLI-BULK-DOWNLOAD-006「取得が終わった時点の表示は 100%」に合わせた

### Changed

- **`@shuji-bonji/houki-abbreviations` の依存を `^0.4.1` から `^0.6.1` に上げた**: 0.x の `^` は minor を跨がないため、0.4.1 のまま取り込んでいた。このサーバーが使う関数（`resolveAbbreviation` / `normalizeJpText` / `normalizeSearchQuery` / `listBySourceMcpHint` / `judgeStaleness` / `STALENESS_THRESHOLDS`）の結果は 0.4.1 と 0.6.1 で同じで、実行されるコードは変えていない。houki-hub `docs/notes/2026-09-29-plan-spec-issues.md` の段階 0

### Added

- **受入テスト**: `src/spec-tests/bugfix-20260930/{explain_law_type,cli_status}.test.ts`（#73・#74）。#70 のテストは `src/spec-tests/untested-20260928/verify_citations.test.ts` に、#75 のテストは `src/services/bulk/zip-fetcher.test.ts` に足した

## [0.15.3] - 2026-09-29

**patch リリース** — 実行されるコードは変えていない。業務の名前（税法・労働法など）で探す人に見つかるよう、npm の説明と keywords、README の冒頭を直した。

### Changed

- **npm の `description`**（`package.json`）: 日本語の文に「税法・労働法・会社法・民法など全分野の条文を LLM から引けます。」を足した（合計 211 文字。npm の上限 255 文字以内）。英語の 1 文と `server.json` の `description` は変えていない
- **npm の `keywords`** と plugin の `keywords`: `japanese-law` `statute` `tax-law` `labor-law` `legal-research` `compliance` と、日本語の `法令` `条文` `法律` `税法` `労働法` `e-Gov法令検索` を足した
- **README**: 冒頭に「できること」と「相談の形の問いでの使い方」（所得税法第 121 条第 1 項の例）を置いた。「まず試す」の「9 ツールのうち 8 つ」を、今のツール数に合わせて「14 ツールのうち 13」に直した

## [0.15.2] - 2026-09-28

**patch リリース** — 実行されるコードは変えていない。仕様の正本 `specs/current/` に、テストが無かった振る舞い 200 件を仕様 ID 付きで足し、受入テストで固定した（houki-hub#26）。

### Added

- **受入テスト 20 本**（`src/spec-tests/untested-20260928/<単位>.test.ts`）: MCP ツール 14 本・common_errors・db_schema・CLI 4 単位の、今の振る舞いを確かめる。e-Gov への通信はすべて差し替える。`get_law` は、ツールを通したテストが無かった SPEC-EGOV-GET-LAW-004〜018 も tools/call で確かめる
- **仕様**: 差分 `20260928-untested-behaviors`（ADDED 200 件）と `20260928-undecided-to-issues`（判断が要る未決 85 件を Issue #45〜#49・#51〜#67 に移した）を `specs/current/` に取り込み、`specs/releases/v0.15.2/` に移した

## [0.15.1] - 2026-09-21

**patch リリース** — コードは変えていない。npm・公式 MCP Registry・GitHub の About に出る説明を揃えた（houki-hub#29 の続き）。

### Changed

- **npm の `description`**（`package.json`）: 日本語の 1 文のあとに英語の 1 文を付けた（日本語 → 英語の順）。npm レジストリは `description` を 255 文字で切り落とすため、0.15.0 では末尾の `houki-hub family.` が `houki-hu` で切れて表示されていた。今回は合計 177 文字
- **`server.json` の `description`**（公式 MCP Registry に出る英文）: "Check Japanese statutes before you build: …" から呼びかけを外し、npm と同じ英語の 1 文 "Japanese statutes from e-Gov Law API v2 — laws and ordinances per article, with law number and URL."（99 文字。Registry の上限は 100 文字）にした
- GitHub の About（description・topics）は、リポジトリの設定で同じ日本語 → 英語の文に直す（コードの変更ではないため、ここには記録だけ残す）

## [0.15.0] - 2026-09-20

**minor リリース** — 添付ファイル（別表・様式・別記の図。jpg / pdf）と、法令本文を 1 つのファイルにした xml / json / html / rtf / docx を取る道を足した（Issue #19、houki-hub#20 の機能 1）。e-Gov 法令API v2 の `GET /attachment/{law_revision_id}` と `GET /law_file/{file_type}/{law_id}` に対応する。ツールは 11 本 → 14 本。

### Added

- **`list_attachments`**: 法令の添付ファイルの一覧。e-Gov の `attached_files_info`（`src` / `updated`）と本文の `Fig` 要素を `src` で突き合わせ、各ファイルに認証なしで開ける `url` と `location`（別表・様式の見出しと関係条文、条の中なら条番号、附則の中なら改正法番号）を付ける。`zip_url`（全部まとめた zip）と、pdf があれば pdf-reader-mcp の `read_url` を勧める `next_actions` も返す。添付が無い法令は `count: 0` の成功応答
- **`get_attachment`**: 添付ファイル 1 件（`src`。ファイル名だけでも引ける）か zip（`src` 省略）。既定では e-Gov からファイルを取らず URL とメタ情報だけを返し、`save: true` のときだけ取得して保存する
- **`get_law_file`**: 法令本文ファイル。`file_type` は `xml` / `json` / `html` / `rtf` / `docx`、`at` は e-Gov の `asof`。既定は URL だけ、`save: true` で保存。保存すると e-Gov の `Content-Disposition` のファイル名（`<law_revision_id>.docx`）から `saved.law_revision_id` が分かる
- **保存先**: `${XDG_CACHE_HOME:-~/.cache}/houki-egov-mcp/files/<law_revision_id>/<ファイル名>`（環境変数 `HOUKI_EGOV_FILES_DIR` で変更）。ツールの引数にはパスを置かない。ファイル名は `basename` に丸め、1 ファイル 50 MB を超えたら保存せず `INVALID_ARGUMENT`
- **エラーコード `ATTACHMENT_NOT_FOUND`**: 指定の `src` がその履歴の添付に無い、添付が 1 件も無い、e-Gov の `/attachment` が code `404003` を返した、の 3 つ。houki-research-skill の `docs/ERROR-CODES.md` への追記は別途
- `egov-client`: `getAttachment()` / `getLawFile()`（バイナリ。retry の条件は JSON と同じ）、`EgovHttpError.body` と `egovErrorCode()`（4xx の応答本文の `code` を読む）、`attached_files_info` の型
- `law-tree`: `extractFigures()`（`Fig` 要素の `src` と置き場所）

### 決めたこと（設計）

- **中身は返さない**。base64 で応答に入れる形は採らず、URL と（求められたときだけ）保存先のパスを返す。URL は認証なしで開ける直リンクで、pdf-reader-mcp の `read_url` にそのまま渡せる
- **保存先は LLM に指定させない**。kannkyo/e-gov-law-mcp は OS の一時ディレクトリに書いてパスを返す。本 MCP はキャッシュディレクトリの下に法令履歴 ID ごとに置き、上書きは環境変数だけにした
- **`get_law` には足さない**。応答の形が条文と違うので、#22 と同じく別ツールにした
- 設計メモ: houki-hub `docs/notes/2026-09-20-design-egov-19-attachments.md`

### 実測（2026-09-20）

| 法令 | 添付 | 内訳 |
|---|---|---|
| 国旗及び国歌に関する法律 | 2 件 | jpg 2（別記第一・別記第二） |
| 戸籍法施行規則 | 42 件 | jpg 7・pdf 35（別表 7・様式 22・書式 13）。`attached_files_info` と本文の `Fig` は 42 件とも一致 |
| 民法 | 0 件 | — |

e-Gov は jpg を `image/jpeg`、pdf と法令ファイルを `application/octet-stream` で返す。法令ファイルの `Content-Disposition` は `<law_revision_id>.<拡張子>`。民法は xml 1.6 MB・docx 182 KB、消費税法の rtf は 1.8 MB。添付が無い履歴の `/attachment` は 400 または 404 で `{"code":"404003"}`。

## [0.14.1] - 2026-09-20

**patch リリース** — 削除された条をまとめた範囲表記（e-Gov の `Article@Num` = `"534:535"`）の表示を直し、その条で打ち切られたときに続きが取れるようにした。v0.14.0 の `get_law_range` を実データで使って見つかった。

### Fixed

- **表示**: `formatArticleLabel()` が `第534:535条` という表示を作っていた。e-Gov の `ArticleTitle` と同じ言い方（隣り合う 2 条は `第534条及び第535条`、3 条以上は `第170条から第174条まで`）にした。`get_toc` の目次と `get_law_range` の見出し・`range.first_article` / `last_article`、エラーメッセージのすべてに効く（目次の表示は v0.5.x から壊れていた）
- **`get_law_range` の続き**: 打ち切り位置がこの範囲表記の条に当たると、`next_from_article` に `"534:535"` が返るのに `from_article` がそれを受け付けず（`INVALID_ARTICLE_NUM`）、続きが取れなかった。`toEgovArticleNum()` が範囲表記をそのまま e-Gov 形式として返すようにした（漢数字の `"五百三十四:五百三十五"` も読む）

### 実測（2026-09-20）

主要 8 法令の範囲表記は 28 件。全件で本文は「削除」、`ArticleTitle` は番号の差が 1 のとき「及び」、2 以上のとき「から…まで」で例外はなかった。

| 法令 | 件数 | 例 |
|---|---|---|
| 民法 | 8 | `534:535`（第五百三十四条及び第五百三十五条）/ `170:174` |
| 商法 | 9 | `32:500`（第三十二条から第五百条まで）/ `813:814` |
| 刑法 | 3 | `73:76` / `90:91` |
| 法人税法 | 3 | `92:120` / `136:137` |
| 所得税法 | 2 | `96:101` / `234:236` |
| 労働基準法 | 2 | `29:31` / `43:55` |
| 会社法 | 1 | `930:932` |
| 消費税法 | 0 | — |

### 残っている制限

`get_law` に `article: "534"` を渡してこの条を引くことはできない（`Num` が `534:535` なので `ARTICLE_NOT_FOUND`）。個別の条番号を範囲表記に照合する話は別の Issue に分けた。

### Tests

- 436 件（新規 4 件）

## [0.14.0] - 2026-09-20

**minor リリース** — 編・章・節（または附則 1 本）を範囲にして条を本文ごと取得する `get_law_range` を追加した（Issue #22）。出典は houki-hub#20 の機能 6（大きな法令の分割取得）/ houki-hub#21。

### Added

- **`get_law_range`（11 本目のツール）**: 編・章・節・款・目のいずれか、または附則 1 本を範囲にして、その中の条を本文ごと返す。`get_law`（1 条ずつ）と `get_toc`（目次だけ）の間を埋める
- **範囲の指定は 3 通り**（同時に指定できるのは 1 つだけ）
  - `part` / `chapter` / `section` / `subsection` / `division` — 上位の階層は省略できる。`3` / `"3"` / `"三"` / `"第三編"` / 枝番号の `"2の2"` を受ける
  - `path` — `get_toc` が返す `toc[].path`（例 `"Part3/Chapter2"`）をそのまま渡せる
  - `suppl_index` — 附則の並び順（`get_toc` の `suppl_provisions[].index` と同じ番号）
- **文字数の上限で条の単位で打ち切る**: `max_chars`（既定 30,000 文字、2,000〜120,000）。条の途中では切らないため、1 条目だけは上限を超えても返す。打ち切ったときは `range.truncated` / `range.next_from_article` と `range.next_actions` を返し、`from_article` にその値を渡すと続きから返す
- **応答の `range`**: 返した範囲の内訳。`path` / `suppl_index` / `titles`（範囲の見出しの連なり）/ `tag` / `article_count`（範囲が持つ条の数）/ `returned_count` / `skipped_count` / `first_article` / `last_article` / `truncated` / `body_chars` / `max_chars` / `next_from_article` と、何をどこまで返したかを書いた `note`
- **応答の `articles`**: 返した条の番号・表示用ラベル・条見出しの一覧
- **`get_toc` の `toc[].path`**: 本則の構造ノードに範囲のパス（`Part3/Chapter2`）が付く。`get_law_range` の `path` にそのまま渡せる
- **`RANGE_NOT_FOUND`（エラーコード）**: 指定された編・章・節、または附則の番号が見つからないとき。範囲が複数の章に当たったとき（民法の `chapter: "2"` は 5 つの編にある）は候補のパスを付けた `INVALID_ARGUMENT` を返す
- **`toEgovStructureNum()`（`src/utils/article-num.ts`）**: 編・章・節の番号を e-Gov 形式にする（`"第二章の二"` → `"2_2"`）
- **`findRanges()` / `findRangeByPath()` / `collectArticlesInRange()` / `findSupplProvisionByIndex()` / `formatRangePath()` / `parseRangePath()`（`src/services/law-tree.ts`）**
- **`formatRangeMarkdown()` / `formatRangeArticleSection()` / `formatSupplProvisionLabel()`（`src/formatters/markdown.ts`）**

### Changed

- `get_law` の description に「章・節をまとめて取るときは `get_law_range`」を、`get_toc` の description に「`toc[].path` は `get_law_range` にそのまま渡せる」を足した
- `formatSupplProvisionHeading()` は附則の呼び名（`formatSupplProvisionLabel()`）と条数に分けた。目次の見出しの文字列は v0.13.0 と同じ

### なぜ新しいツールにしたか

`get_law` に範囲の引数を足す案と比べました。`get_law` は 1 条（項・号）を返すツールで、`article` 未指定のときは目次を返す振る舞いも持っています。ここに範囲の引数を足すと、`article` との排他、`format: "toc"` との関係、上限で打ち切ったときの応答が 1 つのツールの説明に混ざります。範囲取得は応答の形（`range` / `articles` / 打ち切り）も違うため、別のツールにしました。

### 実測（2026-09-20、e-Gov 法令API v2 の `law_full_text`）

条本文のバイト数（UTF-8 の日本語は 1 文字 3 バイト）。

| 法令 | 最上位 | 章（中央値 / 最大） | 節（中央値 / 最大） |
|---|---|---|---|
| 民法 | 編 5（54〜193 KB） | 6.2 KB / 98.2 KB | 3.7 KB / 34.3 KB |
| 会社法 | 編 8（最大 702 KB） | 17.9 KB / 207.6 KB | 5.5 KB / 55.0 KB |
| 所得税法 | 編 6（最大 434 KB） | 10.8 KB / 229.1 KB | 10.4 KB / 167.3 KB |
| 消費税法 | 章 6（階層は章のみ） | 59.5 KB / 102.4 KB | — |
| 労働基準法 | 章 14 | 4.9 KB / 44.7 KB | — |

`Chapter@Num` は編ごとに振り直されます（民法には `Chapter1` が 5 つ、`Section1` が 19 あります）。番号だけでは範囲が一つに決まらないため、上位の階層と組み合わせるか `path` で指定します。

### Tests

- 432 件（新規 34 件）。範囲の解決とパス（`law-tree`）、範囲取得と打ち切り・附則（`law-service.range`）、編・章・節の番号の正規化（`article-num`）

## [0.13.0] - 2026-09-20

**minor リリース** — `get_toc` が本則と附則を分けて返すようにし、附則を改正法ごとにまとめた（Issue #24）。出典は houki-hub#20 の機能 8 / houki-hub#21。

### Added

- **`suppl_provisions`**: 附則の目次を改正法ごとに 1 件ずつ返す。件ごとに `index`（LawBody の中での並び順。ローカル DB の条番号 `Suppl{index}_{条番号}` と同じ番号）、`label`、`amend_law_num`（どの改正法の附則か。制定時の附則には付かない）、`extract`（抄）、`article_count`、`paragraph_only`（条を立てず項だけで書かれた附則か）、`children`（附則の中の目次）が入る
- **`suppl`（引数、既定 `"list"`）**: 附則をどこまで返すか。`"list"` = 改正法ごとの見出しと条数だけ、`"full"` = 附則の中の条まで、`"none"` = 附則を返さない。既定を `"list"` にしたのは、附則の条が目次の大半を占めるため（所得税法は本則 388 ノードに対し附則 352 本・条 983 件）
- **`suppl`（応答）**: 附則について何を返したかの内訳。`mode` / `count` / `article_count` と、何をしたかを書いた `note`。`count` と `article_count` は `mode: "none"` でも数える
- **`with_amend_titles`（引数、既定 `false`）**: 附則に改正法の題名を付ける。改正履歴（`get_law_revisions` と同じ e-Gov の応答）を 1 回引き、法令番号で照合する。付いた本数と付かなかった本数は `suppl.amend_law_titles` に入る
- **`lawNumMatchKey()`（`src/utils/law-num.ts`）**: 法令番号の表記の違いを落として照合キーにする。附則の `AmendLawNum` は `令和七年六月二〇日法律第七四号`、改正履歴の `amendment_law_num` は `令和七年法律第七十四号` で、公布の月日の有無と漢数字の書き方（位ごとに並べる形と十・百・千を使う形）が違う
- **`extractSupplProvisions()` / `countTocArticles()`（`src/services/law-tree.ts`）**

### Changed

- **`extractToc()` は附則の条を含めない**。v0.12.1 までは附則の条が本則の章の後ろにフラットに並んでいた（消費税法で 425 件、所得税法で 983 件）ため、いま効いている規定と、ある改正法の施行日・経過措置の区別が目次から付かなかった
- **目次の Markdown**: 附則を返すときは「## 本則」と「## 附則（N 本・条 M 件）」の 2 節に分ける。附則が無い法令と `suppl: "none"` のときは見出しを付けず、v0.12.1 と同じ形で条の箇条書きだけを書く
- **`get_law` の `format: "toc"`** も本則と附則を分け、附則は見出しだけを返す
- `node_count` は本則の TOC ノード数になった。附則の本数と条数は `suppl.count` / `suppl.article_count` を見る

### 実測（2026-09-20）

`get_toc` の Markdown の大きさ。`"full"` が v0.12.1 までに返していた量に相当する。

| 法令 | `"list"`（既定） | `"full"` | `"none"` |
|---|---|---|---|
| 所得税法（本則 388 ノード・附則 352 本・条 983 件） | 752 行 / 54.5 KB | 1,735 行 / 114.4 KB | 395 行 / 24.6 KB |
| 消費税法（本則 91 ノード・附則 167 本・条 425 件） | 270 行 / 21.0 KB | 695 行 / 47.0 KB | 98 行 / 6.9 KB |
| 民法（本則 1,365 ノード・附則 67 本・条 201 件） | 1,444 行 / 79.1 KB | 1,645 行 / 88.4 KB | 1,372 行 / 73.5 KB |

- `with_amend_titles: true` で題名が付く割合は、e-Gov の改正履歴が持つ範囲で決まる。消費税法は附則 167 本・改正履歴 65 件で 28 本、所得税法は附則 352 本・改正履歴 84 件で 29 本、民法は附則 67 本・改正履歴 37 件で 16 本
- 附則の属性は `AmendLawNum` と `Extract` の 2 つだけで、改正法の題名は入っていない（消費税法・所得税法・民法・会社法・労働基準法・商法・電子帳簿保存法で確認）
- 附則の中は条（Article）か項（Paragraph）で、上に編・章・節を置く附則は上記 7 法令には無かった。`extractSupplProvisions()` は入れ子があっても走査する

## [0.12.1] - 2026-09-20

**patch リリース** — コードは変えていない。README の 1 行目と npm の `description`、plugin の `description` から「実装する前に」を外し、このサーバーができることだけの 1 行にした。

### Changed

- **README の 1 行目と npm の `description`、`.claude-plugin/plugin.json` の `description`**: 「実装する前に、その仕様が法令のどこに触れるかを条文で確かめる」を外し、「日本の法令（憲法・法律・政令・省令・規則）を e-Gov 法令API v2 から、条・項・号の単位で、法令番号と URL を添えて返す MCP サーバ」にした。「実装する前に」が入っていると、実装の前にしか使えない道具に読めるため
- `server.json` の `description`（公式 MCP Registry に出る英文）は今回は変えていない。次に Registry へ登録する版のときに合わせる

## [0.12.0] - 2026-09-20

**minor リリース** — 2 文字の法律用語（「相殺」「時効」「善意」）を渡されたときに何をして結果を出したかを `short_tokens` で明示し、全法令の条本文を走査する `scan_body` を足した（Issue #23）。出典は houki-hub#20 の機能 7 / houki-hub#21。

### Added

- **`short_tokens`**: クエリに 2 文字語が含まれるときだけ応答に付く。条本文の索引 `articles_fts` は trigram のため 3 文字以上の語しか載せず、2 文字語だけのクエリ（「相殺」）では条の本文が引かれない。v0.11.0 までは、そのことが応答から分からなかった
  - `body_search` に実際に走った経路の名前が入る。`fts_then_filter`（3 文字以上の語で索引を引き、その本文に 2 文字語が含まれるかで絞った）、`like_in_law_scope`（法令名で絞った範囲の本文を引いた）、`like_all_articles`（全法令の本文を走査した）、`not_searched`（条の本文は引いていない）
  - `hits_by_match_type` に `article`（条本文由来）と `law_meta`（法令名・略称・番号由来）の件数が入る
  - `not_searched` のときは `next_actions` に 2 つの形を入れる。`{ keyword: "民法 相殺" }`（法令名を添えて索引で引く）と `{ keyword: "相殺", scan_body: true }`（全走査）
- **`scan_body`（既定 `false`）**: 2 文字語だけのクエリで、索引を使わずに全法令の条本文を端から照合する。`ORDER BY` を付けずに `LIMIT`（150 件）で打ち切るため、SQLite は上限に達した時点で走査を止められる。並び順は関連度順にならず、打ち切ったときは `truncated: true` になる。3 文字以上の語を含むクエリでは索引を引くので、この引数は効かない

### Changed

- LIKE 経路の `snippet` を、本文の先頭 80 文字から **一致位置の手前 20 文字からの 80 文字** に変えた。「労基法 協定」のようなスコープ内の検索でも、一致した箇所が snippet に入る

### 実測（2026-09-20）

条 1,434,710 件・法令 10,810 件・本文 587,926,852 バイトの DB で計測した。

| 測り方 | 最悪値（該当ゼロ・全表走査） |
|---|---|
| `LIKE` + JOIN | 12.07 秒（キャッシュが温まった状態）／ 21.99 秒（冷えた状態） |
| `instr` + JOIN | 21.99 秒 |
| `GLOB` + JOIN | 22.20 秒 |
| `instr`、JOIN 無し | 21.79 秒 |

- 3 つとも 22 秒で並ぶので、費やしているのは `LIKE` のパターン解釈でも JOIN でもなく、588 MB を読んで照合する分そのもの。書き方では縮まない
- 打ち切りが効く語は安定して 5 秒前後（`LIKE` で「相殺」5.49 秒・「善意」4.08 秒、`instr` で「相殺」5.40 秒）
- この値のため、全走査は既定にせず `scan_body` でのオプトインにした
- trigram 索引から 2 文字語に届く道も確かめた。`MATCH '"相殺"'`・`MATCH '相殺*'`（前方一致）・`MATCH '"相殺" *'` はいずれも 0 件。クエリ側も同じ trigram で分割されるため、2 文字では分割結果が空になる
- Issue の選択肢 2（bigram トークナイザ）は、1 文字ごとに区切り文字を挟んだ列をもう 1 本作れば trigram で代用できるが、本文 588 MB が 1.18 GB になりその上に索引がもう 1 本載るため採らなかった

## [0.11.0] - 2026-09-20

**minor リリース** — LLM が組み立てた引用リストを 1 回でまとめて実在確認する `verify_citations` を足した（Issue #18）。出典は houki-hub#20 の機能 3 / houki-hub#21。設計メモは houki-hub `docs/notes/2026-09-20-design-egov-18-verify-citations.md`。

### Added

- **`verify_citations`**: 引用の配列（法令名または `law_id`、条番号、任意で項・号）を受け取り、件ごとに `found` / `not_found` / `ambiguous` を返す。リストに存在しない引用が混ざっていてもツール全体は `isError` にしない
  - `found` の件には `law`（`law_id` / 正式名称 / 法令番号 / 法令種別 / URL）、`article`（e-Gov 形式の条番号・表示ラベル・条見出し）、実在を確かめた `paragraph` / `item` が付く。条文本文は返さない
  - `not_found` の `code` は、法令名・`law_id` が引けないとき `LAW_NOT_FOUND`、条・項・号が無いとき `ARTICLE_NOT_FOUND`、条番号・号番号の書き方が不正なとき `INVALID_ARTICLE_NUM`、通達など houki-egov の管轄外のとき `OUT_OF_SCOPE`
  - `ambiguous` は 2 種類。法令名が e-Gov の法令名と完全一致せず部分一致の候補があるとき（`candidates[]` に最大 5 件、`code` は付かない）と、項が複数ある条で項を書かずに号だけを指定したとき（`code: "INVALID_ARGUMENT"`）
  - 略称は `houki-abbreviations` で正式名称に直してから照合する。辞書に `law_id` があればそれを使い（`resolved_by: "abbreviation"`）、無ければ e-Gov の法令名の完全一致で引く（`resolved_by: "exact_title"`）。`law_id` を直接書いた件は `resolved_by: "law_id"`
  - `summary` に `total` / `found` / `not_found` / `ambiguous` と、全件が found のときだけ true になる `all_found` を付ける
  - 1 回に渡せるのは 50 件まで（`inputSchema` の `maxItems`）。同じ法令が並んでも e-Gov への問い合わせは 1 回にまとめる
  - e-Gov に問い合わせられなかったとき（タイムアウト・接続不能・5xx）は、件ごとの判定を返さずツール全体を `SOURCE_*` エラーにする。「聞けなかった」を「存在しない」と書かないため

### 実測（2026-09-20）

- 12 件（実在 6 件・不存在 4 件・曖昧 2 件）を混ぜたリストで `summary` が `{ total: 12, found: 6, not_found: 4, ambiguous: 2, all_found: false }`
- 「所法 第9条第1項第1号」は `resolved_by: "abbreviation"`、条見出し「（非課税所得）」付きで `found`
- 「電子帳簿保存法 第7条」は辞書に `law_id` が無いため `resolved_by: "exact_title"` で `410AC0000000025`、条見出し「（電子取引の取引情報に係る電磁的記録の保存）」
- 「所得税法 第57条の2第99項」は条まで実在するので `article` を残したまま `ARTICLE_NOT_FOUND`（「項は 5 個」）
- 「所得税法 第57条の2第1号」（項を書かない）は `ambiguous` + `INVALID_ARGUMENT`、「所得税法施行」は `ambiguous` + 候補 2 件（所得税法施行令・所得税法施行規則）
- 「消基通」は `OUT_OF_SCOPE` で `next_actions` が `houki-nta` を指す

## [0.10.1] - 2026-09-19

**patch リリース** — `get_article_references` で、条を書かない項・号の参照が直前の参照の条を引き継ぐようにした。

### Fixed

- 「第二条第二項第二号及び第六項第五号」の後半（電帳法施行規則 4 条 1 項の実文）を、これまでは「この条の第六項第五号」として返し、`next_actions` の `get_law` が施行規則 4 条 6 項 5 号（存在しない）を指していた。直前の参照と「及び」「又は」「並びに」「若しくは」「、」「から」の 1 語だけでつながっている項・号は、直前の参照の条（項だけの参照なら項も、他法令なら法令も）を引き継ぎ、`article_from` に引き継ぎ元の `raw` を入れる。つながっていない「第三項」はこれまでどおり同じ条の項
- 実測（2026-09-19）: 電帳法施行規則 4 条 1 項で「第六項第五号」が `article: "2", paragraph: 6, item: "5", article_from: "第二条第二項第二号"` になり、`next_actions` が施行規則 2 条 6 項 5 号を指す

## [0.10.0] - 2026-09-19

**minor リリース** — 施行令・施行規則の関連付けと、条文本文からの参照抽出のツールを 2 つ足した（Issue #20、PR #30 の内容を main に載せ直したもの。0.9.0 / 0.9.1 はコードの変更なしの版だったため 0.10.0）。houki-hub#8（法令グラフ）と対象が重なるが、MCP は法令 XML と法令名の規則から決定論的に引ける参照だけを返す、という分担（houki-hub `docs/ROADMAP.md` 2026-09-14 決定）。設計メモは houki-hub `docs/notes/2026-09-19-design-egov-20-references.md`。

### Added

- **`get_related_laws`**: 法令名の末尾に「施行令」「施行規則」を付けた候補（施行令・施行規則からは親の法律と兄弟）を e-Gov `/laws?law_title=` に問い合わせ、`revision_info.law_title` が完全一致した 1 件だけを `related[]` に入れる（`law_id` / `law_num` / `law_type` / `abbr` / `url`）。無かった候補は `not_found[]`。「…の施行に関する省令」など別の名前の下位法令は対象外で、その旨を `note` に書く。成功時に `get_toc` への `next_actions`
- **`get_article_references`**: 条（または項）の `Sentence` の文字列から、次を取り出す
  - `external`: 「法令名（法令番号）第N条第N項第N号」は法令番号で e-Gov `/laws?law_num=` を引いて `law_id` を付ける。法令番号の無い名前（辞書の正式名称、同じ本文で解決済みの名前、施行令・施行規則の本文の「法」）と、知らない名前（末尾が法・令・規則・条例）は候補名の完全一致で解決を試み、無ければ `resolved: false` のまま返す
  - `internal`: 法令名の無い「第N条第N項第N号」。条も項も無い「第N号」には、その文が属する項の番号を付ける（`get_law` が項が複数ある条で `paragraph` を求めるため）
  - `relative`: 「前項」「次条」「同法第N条」「同条第N項」は解決しない（`resolved: false`）
  - `delegations[]`: 「政令で定める」「財務省令で定める」を出現回数でまとめ、`get_related_laws` と同じ規則で施行令・施行規則を `target_law` に付ける。施行令の本文の「政令で定める」は自身を指すので `target_law.self: true`。委任先の条は特定しない
  - `coverage.note` を常に付け、正規表現で取れた範囲だけであること、網羅性を保証しないことを書く
  - 解決できた参照ごとに `get_law` の引数を、委任ごとに `search_fulltext`（`"所得税法施行令 法第五十七条の二"`）を `next_actions` に入れる。`example` は `mcp` / `tool` を含まず、そのまま渡せる引数だけ
- `src/services/law-relations.ts`（名前の規則）と `src/services/reference-extractor.ts`（文字列処理。API を呼ばない）を追加

### 実測（2026-09-19）

- `get_related_laws({ law_name: "所得税法" })`: 所得税法施行令 `340CO0000000096`（所令）と所得税法施行規則 `340M50000040011`（所規）。`not_found` は空
- `get_article_references({ law_name: "所得税法", article: "57の2", paragraph: 2 })`: 雇用保険法 第10条第5項第1号（`349AC0000000116`）、母子及び父子並びに寡婦福祉法 第31条第1号（`339AC0000000129`）、職業能力開発促進法 第30条の3（法令番号なし。候補名の完全一致で `344AC0000000064`）、雇用保険法 第60条の2第1項、同一法令内の第28条第1項。「政令で定める」7 回 → 所得税法施行令、「財務省令で定める」7 回 → 所得税法施行規則
- `get_article_references({ law_name: "所得税法施行令", article: "167の3" })`: 「法第五十七条の二第二項第一号」が所得税法への `external`、「政令で定める」は `self: true`

## [0.9.1] - 2026-09-19

**patch リリース、コードの変更なし** — 0.9.0 で `server.json` が 0.8.0 のままだったため、npm・公式 MCP Registry・claude-plugins・タグの版を揃え直した版。内容は 0.8.0 と同じ。

## [0.9.0] - 2026-09-19

**コードの変更なし** — 0.8.0 の取り込み後に main の履歴を整理した際に版だけが上がり、npm に publish された。`server.json` は 0.8.0 のままだったので Registry には 0.9.1 で揃える。

## [0.8.0] - 2026-09-19

**minor リリース** — `--sync` を足し、全件取り込み済みの DB を日次差分で最新化できるようにした（Issue #21、Phase 2-8）。

### Added

- **`--sync`**: `sync_state.last_sync_date` から今日（JST）までの日次差分 zip（`file_section=3`）を日付順に取得して取り込む。差分が無い日は飛ばし、途中で失敗しても成功した日までを `last_sync_date` に記録して終わる。1 日ごとに `[n/N] 日付: 件数 (サイズ, 時間)` を出し、最後に日数・件数・所要時間をまとめる
  - 開始日は `last_sync_date` **を含める**。e-Gov の日次 zip はその日の 15 時ごろに生成されるので、午前に同期した日の差分を次回に拾い直すため。同じ zip を二度入れても `content_hash` で no-op になる
  - 差分が無い日は e-Gov が HTTP 500（HTML のエラーページ）を返す（2026-09-19 実測。日曜日・未来の日付・存在しない日付が同じ応答）。障害と区別するため、同期の前に `https://laws.e-gov.go.jp/bulkdownload/` に HEAD で届くことを確かめ、届かなければ何もせず終わる
  - `last_sync_date` から `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS`（既定 90 日）を超えて空いていたら何もせず、`--bulk-download-everything` を促して exit 1
  - `--bulk-download-incremental`（`docs/PHASE2-DESIGN.md` で予定していた名前）も同じ動作
- `src/services/bulk/sync.ts`: 計画（`planSync`）と進行（`runSync`）を DL / ingest から切り離した。CLI は実 DL / ingest と表示だけを持つ
- `BulkHttpError`（`BulkFetchError` の派生、`status` を持つ）: 差分 zip が無い日の 500 を呼び出し側が見分けるため

### Changed

- **同じ法令の現行の版を、施行日が最も新しい 1 つだけにする**。差分 zip で新しい版（別の `law_revision_id`）が現行として届いたら施行日がそれより前の版を `PreviousEnforced` に落とし、逆に施行日がより新しい現行の版がすでにあれば届いた版のほうを `PreviousEnforced` にする（1 つの zip に同じ法令の版が複数並ぶ場合の順序に依らない。施行日の無い行は比べない）。これまでは前の版も `CurrentEnforced` のまま残り、`search_fulltext` の revision 重複対策（`CurrentEnforced` に絞る）をすり抜けて同じ法令が 2 度ヒットする経路があった（`--bulk-download-by-date` でも同じ）
- `source: 'incremental'` の ingest で `sync_state.total_laws` に差分 CSV の行数を書いていたのを、DB の法令数に変えた
- `ingestZip` に `updateSyncState`（既定 true）を足した。`--sync` は日ごとに自分で `sync_state` を進めるので false を渡す
- `freshness.warning` と `--status` の案内を `--sync` に変えた（これまでは存在しない `--bulk-download-incremental` を案内していた）
- `--help` の並びを「全件 → 差分 → 単日（デバッグ用）→ 状態」にし、`HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS` を載せた

### 実測（2026-09-19、`last_sync_date` を 2026-09-13 にした DB で）

7 日分を確認し、5 日に差分あり（234 件 upsert、25 件 unchanged）、2 日（日曜日と当日）は差分なし。全体 1 分 11 秒（うち 9/14〜9/16 の zip が 14〜30 MB）。同じ日に 2 回目を実行すると当日 1 日だけを確認し直し「新たに取り込んだ法令はありません」で exit 0

## [0.7.0] - 2026-09-19

**minor リリース** — `get_law` の `article` と `item` で漢数字の条番号・号番号を受け付けるようにした（Issue #17）。受け付ける入力が広がるため minor。

### Added

- **漢数字の条番号・号番号**: `"第三十条"` / `"三十の二"` / `"第三十条の二"` を `article` に、`"八"` / `"八の二"` / `"第八号の二"` を `item` に渡せる。判決文・通達・書籍から引き写した番号をそのまま使える。`src/utils/article-num.ts` に `kanjiToNumber()` を足し、`toEgovArticleNum()` と `toEgovItemNum()` が "の" の区切りごとに算用数字へ直す
  - 受け付けるのは **位取り形式**（"三十" "百二十三" "千五十" "一千"）。「三〇」「一〇五〇」のような位ごとに並べる形式は `INVALID_ARTICLE_NUM`。位取りとして読めない並び（"三三" "十十"）も同じ
  - 条番号・号番号の範囲（千の位まで）だけを扱う。万以上は対象にしない
- **全角数字を半角に直す**: `"３０"` / `"第３０条の２"` を `"30"` / `"30_2"` にする。v0.6.1 までは `findArticle` に届いて `ARTICLE_NOT_FOUND` になっていた

### Changed

- `INVALID_ARTICLE_NUM` の `message` と `hint` を、受け付ける形式の例（"30" / "30の2" / "第三十条" / "第三十条の二"）に変えた。「漢数字には未対応です」の文言は無くなった
- `tools/list` の `article` / `item` の説明に、漢数字と全角数字を受け付けることを足した

### 対象外（この版では変えていない）

- `search_fulltext` のキーワード中の「第三十条」。`extractArticleNumFromQuery()` は算用数字だけを boost に使う。漢数字の「第三十条」はこれまでどおり本文のトークンとして MATCH に乗る（条文本文は他の条を漢数字で参照するため、ここを boost に回すと本文検索の意味が変わる。別に検討する）
- `formatArticleLabel()` / `formatItemLabel()` の出力は算用数字のまま

## [0.6.1] - 2026-09-19

**patch リリース** — コードは変えていない。README の冒頭と npm の説明を「実装する前に、その仕様が法令のどこに触れるかを条文で確かめる」に揃え、公式 MCP Registry に載せるための `mcpName` を足した。

### Docs

- **README の 1 行目と npm の `description` を、houki-hub family で決めた仕事の 1 行に揃えた**（houki-hub#22 の (c)）。「実装する前に、その仕様が法令のどこに触れるかを条文で確かめる」。通達・Q&A は houki-nta-mcp が担当し、「法律で決まっている」と「通達でそうなっている」を混ぜないことも冒頭に書いた。npm の `description` は英語を先にした（npm の検索は英語の語で当たることが多い）
- **README の冒頭に「まず試す（ローカル DB なし）」を置いた**: 7 ツールのうち 6 つは登録するだけで動き、ローカル DB が要るのは `search_fulltext` だけであることを、`claude_desktop_config.json` の例と DB あり / なしの対応表で先に示す。これまでは「CLI（ローカル DB の構築）」の約 290 MB の取り込みが、動かすための前提のように読めた。houki-hub#22 の (b) 導入の時間（nta 側は houki-nta-mcp#35 の `--quickstart`）

### Added

- **`package.json` に `mcpName: "io.github.shuji-bonji/houki-egov-mcp"`**: 公式 MCP Registry（registry.modelcontextprotocol.io）が npm パッケージの所有確認に使う印。Registry への登録そのものは `server.json` と `mcp-publisher` で行う（この版の publish 後）

## [0.6.0] - 2026-09-12

**minor リリース** — `get_law` の `item` で枝番号の号（第8号の2）を指定できるようにし、ツールの引数を inputSchema で厳密に扱うようにした。`item` の型が広がり、inputSchema に無い引数がエラーになるため minor。

### Added

- **`get_law` の `item` に文字列**: `8` / `"8"` / `"8の2"` / `"第8号の2"` を受け付ける（inputSchema は `type: ["number", "string"]`）。`toEgovItemNum()`（`src/utils/article-num.ts`）で e-Gov の `Num` 形式（`"8_2"`）にそろえて `findItem()` で探す。v0.5.4 までは `item` が数値だけで、`Num="8_2"` の号（消費税法 第2条第1項第8号の2 など）を指定できなかった。漢数字（`"八の二"`）は条番号と同じく未対応で `INVALID_ARTICLE_NUM`
- 号を指定したときの Markdown の見出しを `formatItemLabel()` で「# 消費税法 第2条第1項第8号の2」にする（これまでは「第8_2号」になりえた）。号が見つからないときのメッセージも同じ表示

### Changed

- **inputSchema に無い引数は `INVALID_ARGUMENT`**: すべてのツールの inputSchema に `additionalProperties: false` を付けた。これまでは受け取って捨てていた。`detail.issues[].path` にその引数名が入る（既定バリデータの message には引数名が入らないため、`listUnknownArgs()` で数える）
- **`get_law` で `item` だけを指定して `paragraph` が無いとき**: 項が 1 つだけの条はその項の号として探す（「消費税法施行令第14条の3第1号」のように、項が 1 つの条では第1項を書かないため。`findParagraphForItem()`）。項が複数ある条は、どの項か決まらないので `INVALID_ARGUMENT`。v0.5.4 までは `item` を黙って無視して条全体を返していた
- **ツールの引数の型を inputSchema から導く**: `src/tools/tool-args.ts` を追加。inputSchema を `as const` で書き、[json-schema-to-ts](https://github.com/ThomasAribart/json-schema-to-ts) の `FromSchema`（`keepDefaultedPropertiesOptional: true`）で引数の型を導く（`ArgsOf<typeof getLawTool.inputSchema>`）。`src/types/index.ts` の手書きの引数の interface はやめた
  - `toolHandlers` を `Record<string, (args: any) => …>` から `Record<string, ToolHandler>`（引数は `unknown`）にした。`bindTool()` が inputSchema で検証してから型付きで handler に渡す。検証は server.ts の `validateArgs()` から `bindTool()` に移した
  - biome の `noExplicitAny` の抑制コメントが無くなった
  - `json-schema-to-ts` は型だけを使うので devDependencies
- `format: "json"` の `item_num` は引数の値のまま（`number | string`）

### Tests

- 10 件追加（`toEgovItemNum` / `formatItemLabel` 4 件、`findItem` の枝番号 1 件、`findParagraphForItem` 1 件、見出し 1 件、server の `additionalProperties` / 未知の引数 / `item` の文字列 3 件）。合計 **287 tests**（見込み）

### 利用側への影響

- inputSchema に無い引数を送っていた場合は `INVALID_ARGUMENT` になる（`detail.issues[].path` で引数名が分かる）
- 項が複数ある条で `item` を送るときは `paragraph` も必要（これまでは `paragraph` が無いと `item` は効いていなかった）

## [0.5.4] - 2026-09-11

### Fixed

- **`get_law` の Markdown の条・号の表示**（#16）
  - 枝番号の条の見出しが「第70の6条」になっていた。`formatArticleLabel()`（`src/utils/article-num.ts`）で「第70条の6」「第42条の12の4」と組み立て、見出し・目次（`format: "toc"`）・`ARTICLE_NOT_FOUND` のメッセージで使う
  - 号の本文が `ItemTitle`・`Column`・`Subitem1`（イ・ロ・ハ）を区切りなしで連結していた（`八資産の譲渡等事業として…`）。`formatProvisionLines()` で構造どおりに組み立てる
    - 号: `ItemTitle` をそのまま行頭に置き、半角空白の後に本文（`八 資産の譲渡等　事業として…`）。Column の間は全角空白（e-Gov 法令検索の画面表示と同じ）
    - 号の下の `Subitem1`〜`Subitem10`: Markdown の箇条書き（深さ 1 は `- イ …`、深さ 2 は `  - （１） …`）
    - `List` など: 中身は従来どおり文字列の連結で、前後の本文とは改行で分ける
  - 項・条をまとめて取るときの号番号は算用数字（`8 `）への付け替えをやめ、`ItemTitle` の漢数字をそのまま出す。枝番号の号が `4_2 の二国外事業者…` になっていた崩れもこれで直る
  - **項の直下の表（`TableStruct`）が Markdown に出ていなかった**（所得税法 89 条 1 項の税率表など。v0.5.3 以前から）。`formatParagraph()` が `ParagraphSentence` と `Item` しか出していなかった。項の子を文書の順に出すようにし、表は `formatTableStructLines()` で Markdown の表にする
    - `TableHeaderRow` が無い表（法令の表の多く）は見出し行を空欄にし、1 行目もデータとして出す
    - `rowspan` / `colspan` で結合されたセルは結合先を空欄にして列をそろえる。セルの中の `|` は `\|`
    - `TableStructTitle` は表の前、`Remarks`（備考）は表の後に出す
    - 号・イロハの中の表も同じ形にする（箇条書きの中では字下げ）。v0.5.3 までは表の文字をすべて連結して本文につなげていた
  - 項・号が見つからないときのメッセージを `項が見つかりません: 第30条第9項` / `号が見つかりません: 第2条第1項第99号` の形にそろえた（従来は `(Article 30)` を併記）
- `format: "json"` の出力は変えていない
- テスト 19 件追加（`src/formatters/markdown.test.ts` 新規 15 件、`formatArticleLabel` 4 件。合計 **277 tests**）

### Known limitations

- `item` は number のため、枝番号の号（第2条第1項第8号の2）は指定できない。別 issue で扱う

## [0.5.3] - 2026-09-07

### Added

- **tools/call の引数検証** — 低レベル `Server` は `registerTool` と違って引数を検証しないため、`definitions.ts` の JSON Schema から SDK v2 の `fromJsonSchema` でバリデータを作り、handler を呼ぶ前に検証する。型違反・必須欠落・enum 違反は family error contract の `INVALID_ARGUMENT`（`detail.issues[]` に `path` / `message`）+ `isError: true` で返す。v0.5.2 までは型違反が handler に届き `INTERNAL_ERROR`（`name.trim is not a function` 等）になっていた
- `LawServiceError.detail.issues` を追加
- テスト 1 件追加（合計 **258 tests**）

## [0.5.2] - 2026-09-07

### Added

- `search_fulltext`: 「民法 第709条」「消費税法 第30条の2」のように **法令名 + 条番号だけ** のクエリは、本文検索をせずその条を直接返す（`lookupArticleInScope`）。v0.5.1 では条番号を取り除いた残りが法令名 1 語になり `law_meta`（法令名の一覧）しか返らなかった。応答には `law_scope` と `article_num_match` が付き、`snippet` は条文冒頭 120 文字
- テスト 1 件追加（合計 **257 tests**）

## [0.5.1] - 2026-09-07

**bug fix リリース — 編（Part）を持つ法令の本則が bulk DB に入っていなかった問題の修正**。v0.5.0 を plugin 経由で試用したところ、`search_fulltext("民法 不法行為")` が附則の条しか返さず、民法 709 条が出ませんでした。原因は XML パーサーが `MainProvision > Part > Chapter` の `Part`（編）を辿らず、民法・会社法・刑法・商法など編を持つ法令の本則の条をすべて落としていたことです。

**v0.5.0 で構築した DB は `houki-egov-mcp --bulk-download-everything` を再実行してください**（content_hash が変わるため全件が再 ingest されます。スキーマの初期化は不要）。

### Fixed

- `src/services/bulk/xml-parser.ts`: `Part` / `PartTitle` を階層走査に追加。`chapter_path` には `第三編　債権 第五章　不法行為` のように編から入る

### Changed

- `src/services/bulk/ingester.ts`: `content_hash` の入力に `INGEST_VERSION`（= 2）を混ぜる（`contentHashOf`）。パーサーや normalize を変えたときに定数を上げるだけで全件再 ingest を強制でき、`SCHEMA_VERSION` を上げて DROP する必要がなくなる
- テスト 2 件追加（合計 **256 tests**）
- README: 「SQLite と DB の置き場所（npx / plugin 経由で使う場合）」の節と Claude Code plugin の節を追加。family 表を現状（abbreviations v0.5.0 / nta v0.9.5 / research-skill）に更新、略称辞書の件数を 174 に修正、`search_fulltext` の使用例を追加

## [0.5.0] - 2026-09-07

**Phase 2-7 リリース — `search_fulltext` の FTS5 本実装**。`houki-egov-mcp --bulk-download-everything` で構築したローカル DB を引き、条文本文を横断検索します。bulk DB 未構築の環境では従来どおり `search_law` にフォールバックします（応答の `source` で区別できます）。

計画書: [docs/PHASE2-7-PLAN.md](docs/PHASE2-7-PLAN.md)

### Added

- **`search_fulltext` の bulk DB 経路** (`src/tools/handlers.ts`)
  - 応答: `{ keyword, expanded_keywords?, source: 'bulk', count, hits[], freshness, filters }`。各 hit は `match_type` (`article` / `law_meta`) / `law_id` / `law_revision_id` / `law_title` / `law_num` / `law_type` / `article_num`（`30の2` 表記）/ `caption` / `chapter_path` / `snippet`（`<b>` ハイライト）/ `rank` / `score` / `score_reasons` / `url`
  - `freshness` は `sync_state` 由来（`last_sync_date` / `staleness` / outdated 時の `warning`）。outdated でも DB の結果を返す（API に倒さない）
  - `law_type` で絞り込み可。`domain` は受け付けるが `filters.domain.applied: false` + note（`laws.category` が Phase 2-13 まで空のため）
  - `deps.dbPath` で DB パスを注入できる（テスト用）
- **新規 `src/services/law-search.ts`** — houki-nta-mcp `db-search.ts` の移植
  - `sanitizeFtsQuery`: `normalizeSearchQuery` → 条番号除去 → FTS5 メタ文字除去 → 3 文字未満トークン除去 → `"tok" AND "tok"`
  - `buildFtsQueryWithAbbreviation`: `resolveAbbreviation(kw, { normalize: true })` が `source_mcp_hint: 'houki-egov'` を返す語を `(main) OR (formal)` に展開。略称自体が 2 文字（`消法`）なら formal だけで検索
  - `searchArticleFts`（`articles_fts` + `snippet()`）と `searchLawMetaFts`（`laws_fts`）を `laws` と JOIN し、`current_revision_status = 'CurrentEnforced' OR remain_in_force = 1` で **同一法令の旧 revision の重複ヒットを排除**
  - `law_meta` 経路: 本文が `articles` に入らない法令（太政官布告 等）や法令名そのものを探すケースを捕捉。article 経路で捕捉済みの revision は捨てる
  - **2 文字トークンの補完**（trigram は 3 文字未満を索引しないため）: 3 文字以上の語と併用時は FTS ヒット本文の `includes` で AND 絞り込み、単独時は `laws.law_title` / `abbrev` の LIKE 照合（`searchLawMetaLike`）。1 文字は対象外
  - **法令スコープ**（`splitLawScope`）: 「民法 不法行為」「労基法 時間外」のように法令名・略称と語を並べたクエリは、法令名を検索対象の絞り込みに回し、残りの語で本文を検索する（応答の `law_scope` に解釈結果を返す）。辞書の `formal` / `abbr` と DB の `law_title` に一致するトークンだけが対象で、「インボイス」「適格請求書」のような通称（aliases）は従来どおり OR 展開に回す。スコープ内で 2 文字語だけのとき（「民法 契約」）は本文 LIKE で引く
  - 附則の条番号は `附則(137) 51の2`、別表は `別表(2)` の表示形式にする（`formatArticleNumForDisplay`）
  - `hasAnyArticle` / `hasAnyLaw`: bulk DL 未実行の判定
- **新規 `src/services/relevance-scoring.ts`** — nta 版から doc_type 重みを外した法令向け変種
  - `score = min(base(rank) + boosts, 1.0)`、`base = 1 / (1 + 10 / |rank|)`
  - boost: `title_exact_match` +0.3 / `abbrev_match` +0.2（XML Abbrev と辞書の abbr・aliases）/ `article_num_match` +0.3（クエリ中の「第N条」「第N条のM」。漢数字は未対応）/ `article_caption_match` +0.1 / `supplementary_provision` -0.15（附則の条。実データでは経過措置の条が本則より上に来やすいため）
  - FTS からは `min(limit×3, 150)` 件取って re-rank
- **新規 `src/test-helpers/law-db-fixture.ts`** — 消費税法（現行 + PreviousEnforced）/ 労働基準法（全角数字本文）/ 太政官布告（Article なし）を `:memory:` に投入する共通 fixture（dist には含めない）
- テスト 52 件追加（`law-search.test.ts` 33 / `relevance-scoring.test.ts` 14 / `handlers.test.ts` 4 / `ingester.test.ts` 1）。合計 **254 tests**

### Changed

- **ingester が `articles.body` と `laws_fts` の各列を `normalizeJpText` 済みで投入する**（Normalize-everywhere。`body_raw` / `laws.law_title` は原文のまま）。`articles_fts` は trigger 経由で normalize 済み本文を索引する
- **`SCHEMA_VERSION` を 1 → 2 に更新** — テーブル定義は同じだが、v1 の DB は content_hash が一致して再 ingest が no-op になるため、バージョン不一致で DROP & CREATE する。**v0.4.x 以前に構築した DB は次回起動時に初期化されるので `--bulk-download-everything` を再実行してください**
- `search_fulltext` の tool description と `keyword` / `domain` の説明を本実装に合わせて更新（`HOUKI_HUB_BULK_CACHE` への言及を削除）
- API フォールバック応答に `source: 'api-fallback'` と `next_actions`（`bulk_download_everything` / `search_law`）を追加。`note` / `fallback` キーは v0.3.x と同じ

### Removed

- `RUNTIME_FLAGS.bulkCache`（環境変数 `HOUKI_HUB_BULK_CACHE`）— フラグではなく「DB に条があるか」（`hasAnyArticle`）で経路を自動判定する。CLI の `--help` からも削除

## [0.4.0] - 2026-09-06

**MCP SDK v2 移行リリース** — MCP ツールの応答形式・ツール一覧は v0.3.1 から変わりません。`search_fulltext` は引き続き `search_law` へのフォールバックで、FTS5 バックエンドへの接続は次リリース（Phase 2-7、v0.5.0）で行います。

### Changed

- **MCP SDK を v2 に移行** — `@modelcontextprotocol/sdk ^1.29` → `@modelcontextprotocol/server ^2.0.0`（2026-07-28 公開、同日付の MCP 仕様改訂に対応）。
  - サーバー本体を `src/server.ts` の `createServer()`（factory）に切り出し、bin エントリ `src/index.ts` は `serveStdio(createServer)` で起動する。`serveStdio` が stdio transport を所有し、2025 系 / 2026-07-28 系クライアントの protocol version 交渉を行う
  - 低レベル `Server` を維持。`setRequestHandler` のキーは Zod スキーマからメソッド名文字列（`'tools/list'` / `'tools/call'`）に変更。tools/call の family error contract（`UNKNOWN_TOOL` / `INTERNAL_ERROR` の JSON 化 + `isError: true`）は変更なし
  - `Tool` 型の import 元を `@modelcontextprotocol/server` に変更（`inputSchema` は JSON Schema のまま）
  - SIGINT / SIGTERM で `handle.close()` を呼び、transport とサーバーを閉じてから終了する
- **Node.js の下限を 22 に引き上げ**（`engines.node >=22.0.0`。Node 20 は 2026-04-30 に EOL）。CI マトリクスは 22 / 24
- **TypeScript 7.0（tsgo）に更新** — `tsconfig.json` の変更なし。ビルドは従来どおり `tsc && chmod +x dist/index.js`
- **lint / フォーマットを ESLint + Prettier から Biome 2.5 に置き換え** — `eslint.config.js` / `.prettierrc` / `.prettierignore` を削除し `biome.json` を追加。フォーマット規則は従来の Prettier 設定（single quote / es5 / semi / width 100 / 2 space）と同一で、既存コードの再フォーマットは import 順の整列のみ。`complexity/useLiteralKeys` は日本語キー（`LAW_HIERARCHY['憲法']`）の可読性のため無効化
  - scripts: `lint` = `biome lint src`、`format` = `biome format --write src`、`format:check` = `biome format src`、`check` = `biome check --write src`
  - Biome 指摘の修正: `let db` / `let res` に型注釈（`noImplicitAnyLet`）、`import 'module'` → `'node:module'`、テストの文字列連結をテンプレートリテラルに
- `@types/node` を `^24` に更新

### Added

- **新規 `src/server.test.ts`**（9 ケース） — `@modelcontextprotocol/client` の `InMemoryTransport` で `createServer()` を in-process 起動し、initialize の name / version、`tools/list` の一覧と JSON Schema、`UNKNOWN_TOOL` / `LawServiceError` / handler 例外（`INTERNAL_ERROR`）の 3 経路が `isError: true` になることを MCP 経由で検証
- `docs/SDK-V2-MIGRATION-PLAN.md` — 移行計画と Phase 2-7 との順序判断

### Removed

- devDependencies: `eslint` / `@eslint/js` / `typescript-eslint` / `eslint-config-prettier` / `prettier`

## [0.3.1] - 2026-07-14

**Phase 2 基盤リリース** — bulk DL + SQLite FTS5 の取り込みパイプライン一式（schema / CSV parser / XML parser / zip fetcher / ingester / freshness / CLI）を実装。

MCP ツールの応答は本リリースでは変わりません（`search_fulltext` は引き続き `search_law` へのフォールバック）。FTS5 バックエンドへの接続は次リリース（Phase 2-7）で行います。ローカル DB は新 CLI `houki-egov-mcp --bulk-download-everything` で構築でき、`--status` で件数と鮮度を確認できます。

詳細は [docs/PHASE2-DESIGN.md](docs/PHASE2-DESIGN.md)。spike + follow-up 結果は [docs/PHASE2-SPIKE.md](docs/PHASE2-SPIKE.md) / [docs/PHASE2-SPIKE-FOLLOWUP.md](docs/PHASE2-SPIKE-FOLLOWUP.md)。

### Added

#### 2026-05-09 — Phase 2-1: schema migration v0→v1

- **新規 `src/db/schema.ts`** — Phase 2 の DB スキーマを構築する `initSchema()` を実装。
  - `laws` (1 行 = 1 revision、PK: `law_revision_id`) — `current_revision_status` × `repeal_status` 2 軸でステータス管理。`mission` は API 上常に `New` のため列にせず `revisions_meta.raw_revision_info_json` に保管
  - `articles` (1 行 = 1 条 or 別表) — `body` (normalized) と `body_raw` (original) を二重保存する Normalize-everywhere パターン
  - `revisions_meta` — 全履歴 (CurrentEnforced + UnEnforced + PreviousEnforced) の API レスポンスを raw JSON で保管
  - `sync_state` — single-row テーブル (`CHECK (id = 1)`) で bulk DL の同期状態を保持
  - `laws_fts` (standalone) — 法令名 / 略称 / 番号 / カテゴリの FTS5 検索
  - `articles_fts` (external content + triggers) — 条本文の FTS5 検索。articles_ai / articles_au / articles_ad で auto-sync
  - tokenizer は houki-nta-mcp と統一して **`trigram`** (SQLite ≥ 3.34 builtin)。日本語混在テキストの N-gram 部分一致を可能にする (`unicode61` は CJK を 1 トークンとして扱うため不可)
- **新規 `src/db/index.ts`** — `openDb()` / `closeDb()` / `defaultDbPath()`。デフォルトは `${XDG_CACHE_HOME:-~/.cache}/houki-egov-mcp/laws.db`
- **新規 `src/db/schema.test.ts`** (12 ケース) — テーブル / カラム / CHECK 制約 / trigger / CASCADE / sync_state single-row / 冪等性を検証
- **`src/config.ts`** に `BULK_CONFIG` を追加 (HOUKI_EGOV_DB_PATH / HOUKI_EGOV_BULK_RETRY / HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS)

#### 2026-05-09 — Phase 2-4: CSV parser (all_law_list.csv)

- **新規 `src/services/bulk/csv-parser.ts`** — bulk zip 同梱の `all_law_list.csv` (UTF-8 BOM, CRLF, 14 列) を `AllLawListRow[]` に変換。差分 zip 内の `R{YY}{MM}{DD}.csv` も同形式なので両方で利用される。
  - `parseCsv()` — RFC 4180 互換の state-machine CSV パーサ。BOM 除去 / CRLF・LF 両対応 / クォート内コンマ・改行・エスケープ `""` を扱う
  - `extractLawRevisionId()` — 列 13「本文 URL」末尾セグメント (`{YYYYMMDD}_{amendmentLawId}`) を抽出して `law_revision_id = {law_id}_{enforcement_date}_{amendment_law_id}` を構成 (PK 候補)
  - `parseAllLawList()` — 列数チェック / `skipMalformed` オプション / 派生フィールド計算
  - 和暦テキスト (列 6/9/10) は raw 文字列として保持 (API v2 ISO 形式を ingester で採用するため、ここではパースしない)
- **新規 `src/services/bulk/csv-parser.test.ts`** (21 ケース) — BOM / CRLF / クォート / エスケープ / 旧法令名の CSV-in-CSV / 未施行フラグ / 列数不一致 / skipMalformed / Buffer 入力 / revision_id 抽出 を網羅

#### 2026-05-09 — Phase 2-10: freshness 計算

- **新規 `src/services/freshness.ts`** — houki-nta-mcp v0.9.3 と同パターンで `@shuji-bonji/houki-abbreviations` v0.4.1+ の `StalenessLevel` / `STALENESS_THRESHOLDS` / `judgeStaleness` / `computeDaysSince` を import。
  - `FreshnessInfo` インタフェース — sync_state.last_sync_date / last_full_dl_at と staleness / days_since_sync / warning を保持
  - `summarizeFreshness(db, hint?, nowMs?)` — sync_state テーブル (single-row) から FreshnessInfo を構築。sync_state がない (初回 DL 前) は null を返す
  - `buildWarning(staleness, daysSince, hint?)` — outdated 時のみ「`bulk-download-incremental` を実行」案内メッセージを生成 (MCP 固有の文言は本ファイルに残す)
  - 判定の主軸は **`last_sync_date`** (全件 DL でも incremental でも、最後の同期完了日基準)
- **新規 `src/services/freshness.test.ts`** (12 ケース) — buildWarning の各 staleness レベル / hint 上書き、sync_state 未設定時の null、閾値境界 (`fresh_days` 前後)、outdated 警告付与、レスポンス整形の sanity check を網羅

#### 2026-05-09 — Phase 2-3: XML parser

- **新規 `src/services/bulk/xml-parser.ts`** — e-Gov 法令標準 XML を `ParsedLaw` 構造に変換。bulk DL zip 内の各法令 XML を ingester で読み込んで articles テーブルに格納するためのパーサ。
  - **`parseLawXml(xml)`** — Law 属性 (Era / Year / Num / LawType / PromulgateMonth / PromulgateDay) + LawTitle (Kana / Abbrev / AbbrevKana) + LawNum + EnactStatement を抽出
  - **本則 (MainProvision)** — Chapter / Section / Subsection / Division を再帰的に降りて Article を抽出。`chapter_path` を Title スタックで構築 (例: `第二章　預金保険機構 第一節　総則`)
  - **附則 (SupplProvision)** — `article_num=Suppl{idx}_{原 Num}` で本則と同じ articles 配列に格納 (例: `Suppl1_1`)
  - **別表 (AppdxTable / AppdxNote / AppdxFig / AppdxStyle)** — `article_num=Appendix{連番}` で種別跨ぎの通し番号
  - **本文抽出** — Article 配下の Paragraph / Item / Subitem / Sentence を再帰的に flatten し、Paragraph 境界で改行を入れる。ArticleCaption / ArticleTitle / TOC は body に含めない
  - **`extractInlineText(node)`** — 任意ノードから全テキストを再帰的に取り出す純関数 (export 済み、テストでも利用)
  - **`XmlParseError`** — ルート不一致 / LawBody 欠落 / LawNum 空 / 不正 XML を識別する独自エラー型
- **新規 `src/services/bulk/xml-parser.test.ts`** (18 ケース) — 改暦ノ布告レベルの最小 XML / Chapter > Section 階層 / Item + Subitem / 附則 / 別表 / TOC 除外 / caption 分離 / エラー系 / メタデータ null 等を網羅
- **fast-xml-parser** は package.json に既存 (^4.5.0)。`isArray` で繰り返し要素を array 強制するオプションを採用

#### 2026-05-09 — Phase 2-2: bulk-downloader (file_section=1)

- **新規 `src/services/bulk/zip-fetcher.ts`** — e-Gov bulk DL zip を取得する低レベル fetcher。全件 (file_section=1) と差分 (file_section=3) で共通利用。
  - **`downloadZip(opts)`** — URL / dest / expectedBytes / maxRetries / onProgress / fetchImpl / signal を受ける汎用関数。`{dest}.partial` に書いてから rename する atomic 書き込み。エラー時は確実に部分ファイルを掃除
  - **`downloadFullZip(opts)`** — `EGOV_BULK.fullDownloadUrl` を埋めるラッパ
  - **`downloadIncrementalZip(yyyymmdd, opts)`** — `EGOV_BULK.incrementalDownloadUrl(yyyymmdd)` を埋めるラッパ
  - **retry 戦略**: exponential backoff (1s, 2s, 4s, ...) で `BULK_CONFIG.bulkRetry` (env `HOUKI_EGOV_BULK_RETRY`、default 3) 回まで。spike §1-2 で確認した通り **HTTP Range / Accept-Ranges / ETag / Last-Modified が一切来ない**ため resume / 304 conditional GET は実装せず、失敗時は 0 から再取得
  - **進捗通知**: `Content-Length` が来ないため `expectedBytes` (default 290 MB、PHASE2-SPIKE 実測ベース) を使った線形 ETA。`progressIntervalBytes` (default 1 MB) ごとに onProgress 発火
  - **整合性**: 取得完了時に zip マジックバイト `PK\x03\x04` を先頭で確認、不一致なら `ZipFormatError`
  - **AbortSignal 対応** — backoff sleep 中も即座にキャンセル可能
  - エラー型: `BulkFetchError` (ベース) / `ZipFormatError` (zip 形式不正)
- **`src/config.ts`** の `EGOV_BULK` に URL builder を追加: `fullDownloadUrl` / `categoryDownloadUrl(cd)` / `incrementalDownloadUrl(yyyymmdd)`
- **新規 `src/services/bulk/zip-fetcher.test.ts`** (11 ケース) — mock fetch で正常系 / zip マジック不一致 / fetch error retry / HTTP 5xx retry / maxRetries 連続失敗 / progress 発火 / ratio 頭打ち / AbortSignal キャンセル / URL builder ラッパを網羅。実 I/O は `os.tmpdir()` 配下の一時ディレクトリで実施し afterEach で掃除

#### 2026-05-09 — Phase 2-5: ingester (zip → DB)

- **新規 `src/services/bulk/zip-reader.ts`** — zip 展開を ingester から分離する `ZipReader` 抽象。
  - `openZipFile(path)` — production 用、`unzipper.Open.file()` で streaming 展開
  - `createMemoryZip(entries)` — テスト用 in-memory ZipReader ファクトリ
- **新規 `src/services/bulk/ingester.ts`** — `ingestZip(opts)` で CSV + XML を 1 transaction にまとめて laws / articles / laws_fts に upsert。
  - **`law_revision_id` を PK** にして 1 法令 = 1 revision で upsert
  - **content_hash (SHA-256) で no-op 判定** — 同じ revision_id で本文未変更なら skip して unchanged カウント
  - **`db.transaction()` の batch 化** (default 200 件) — 10K 法令でも 50 transaction 程度で完了
  - **promulgation_date 計算** — XML 属性 (Era + Year + PromulgateMonth + PromulgateDay) → 西暦 ISO date 変換 (Meiji 1=1868 / Showa 1=1926 等の元号オフセットテーブル内蔵)
  - **CSV unenforced フラグ → `current_revision_status='UnEnforced'`** に簡易マッピング (PreviousEnforced / Repeal は API 経由で精緻化、Phase 2-13 範囲)
  - **articles の全置換** — INSERT 前に DELETE で前 revision の本文を消す (articles_fts は trigger で自動同期)
  - **laws_fts の手動同期** — standalone 設計のため DELETE → INSERT で全置換
  - **sync_state の upsert** — source='all_xml' の時のみ last_full_dl_at を更新 / incremental の時は既存値を維持
  - エラー型: `IngestError` (CSV 不在 / XML パース失敗で onXmlError=throw 時)
  - 進捗: `onProgress({ processed, total, lastLawRevisionId })` callback
- **新規 `src/services/bulk/ingester.test.ts`** (16 ケース) — in-memory zip + in-memory DB で正常 ingest / articles_fts trigger / laws_fts 手動同期 / 未施行フラグ / content_hash no-op / content 変化で UPDATE / 複数法令 / CSV外 zip エントリの無視 / XML 不在の failed カウント / 壊れた XML の skip / onXmlError=throw / CSV 不在エラー / sync_state upsert / source 切替 (all_xml / incremental) / progress 発火を網羅
- **依存追加**: `unzipper@^0.12.3` (本体) + `@types/unzipper@^0.10.10` (型) — 285 MB zip でも streaming 展開できる
- **設計判断 (PHASE2-DESIGN.md §5.1 / FOLLOWUP §2 反映)**:
  - PreviousEnforced / Repeal の精緻化は本フェーズ範囲外 (API enrichment へ)
  - `revisions_meta` テーブルへの履歴挿入は本フェーズ範囲外 (`/api/2/law_revisions/{lawId}` 経由で Phase 2-13 で対応)
  - `category` は CSV 列に無く、API レスポンスにのみあるので Phase 2-13 で埋める

#### 2026-05-09 — Phase 2-6: CLI (`--bulk-download-everything` / `--status`)

- **新規 `src/cli/index.ts`** — `houki-egov-mcp` バイナリの CLI モード。引数なしで起動した場合は MCP server (既存挙動) で常駐、フラグ付きで起動した場合は CLI ハンドラを実行して exit する。
  - **`--bulk-download-everything`** — `downloadFullZip` → `openZipFile` → `ingestZip` の一連を実行。所要時間 / DL バイト / ingest 件数を stderr に表示
  - **`--bulk-download-by-date YYYYMMDD`** — 単日差分 zip の DL + ingest (デバッグ用)
  - **`--status`** — `defaultDbPath()` の DB を開いて laws / articles 件数 + `summarizeFreshness()` の結果を表示。DB 未作成なら案内メッセージ
  - **`--version` / `--help` / `-h` / `-v`** — 標準フラグ
  - 進捗は stderr に上書き表示 (DL 中の bytes / ratio、ingest 中の処理済み法令数)
  - 未知のフラグは exitCode=2 + ヘルプ表示
  - 引数なしは `__not_cli__` を返し、`src/index.ts` が MCP server へフォールバック
- **`src/index.ts`** に `runCli` の dispatch を追加。CLI コマンドが命中した場合は MCP server を起動せず CLI exit code で終了
- **新規 `src/cli/index.test.ts`** (9 ケース) — 引数解析の早期 exit パスを網羅 (--help / --version / 不正な --bulk-download-by-date / 未知フラグ / MCP fallback の真偽)。実 bulk DL は走らせない
- **`package.json` の build script に `chmod +x dist/index.js` を追加** — houki-nta-mcp と統一。これがないと `./dist/index.js --status` 等の直接実行で `permission denied` になる

### Dependencies

- **追加: `better-sqlite3 ^12.9.0`** + `@types/better-sqlite3 ^7.6.13` — Phase 2 SQLite FTS5
- **アップグレード: `@shuji-bonji/houki-abbreviations` を `^0.3.0` → `^0.4.1`** — freshness モジュール (StalenessLevel / 閾値定数 / 純関数) を Phase 2-10 で利用するため
- **追加: `unzipper ^0.12.3`** + `@types/unzipper ^0.10.10` — 285 MB の bulk zip を streaming 展開するため
- **追加: `fast-xml-parser ^4.5.0`** — 法令標準 XML のパースに使用

### Tests

- **50 tests → 193 tests (14 files)** — Phase 2 の各モジュール (schema / csv-parser / xml-parser / zip-fetcher / ingester / freshness / cli) を網羅

## [0.3.0] - 2026-05-08

houki-hub family の error contract に完全準拠するための磨き込みリリース。`code` 語彙を family 全体で揃え、別 MCP の管轄リソース要求に対する `OUT_OF_SCOPE` 検知を導入。

### Added

- **family 共通エラーコード `SOURCE_*` を採用** — `LawErrorCode` に `SOURCE_API_ERROR` / `SOURCE_TIMEOUT` / `SOURCE_RATE_LIMITED` / `SOURCE_UNAVAILABLE` を追加。`SOURCE_UNAVAILABLE` は ECONNREFUSED / ENOTFOUND / EAI_AGAIN 等のネットワーク到達不能を検知する新コード。
- **`OUT_OF_SCOPE` エラーコードと scope ガード** — 略称解決の結果が houki-egov 以外の管轄 (例: 通達は `houki-nta`、判例は `houki-court`) と判明した場合、新規 `checkAbbreviationScope()` が `get_law` / `get_toc` / `get_law_revisions` の入口で `OUT_OF_SCOPE` エラーを返す。`next_actions[0].example.mcp` で正しい MCP を指示するため、Skill 層が透過的にルーティングできる。
- **`NEXT_ACTIONS.delegateTo(mcpHint)` プリセット** — `OUT_OF_SCOPE` 時に他 MCP への切替を勧める next_action。

### Changed

- **`egovHttpErrorToLawError` が SOURCE\_\* を発行するように移行** — 内部実装を `EGOV_RATE_LIMITED` → `SOURCE_RATE_LIMITED` / `EGOV_TIMEOUT` → `SOURCE_TIMEOUT` / `EGOV_API_ERROR` → `SOURCE_API_ERROR` に切替。`SOURCE_UNAVAILABLE` の検知ロジックも追加。
- **エラーコード分類のドキュメンテーション** — `src/errors.ts` の `LawErrorCode` を「引数・入力 / リソース未発見 / 外部ソース由来 / 旧コード / システム」のカテゴリ別に整理。

### Deprecated

- **`EGOV_RATE_LIMITED` / `EGOV_TIMEOUT` / `EGOV_API_ERROR`** — `LawErrorCode` の型としては残置 (v0.2.x 前提のクライアントが破綻しないため) が、内部実装からはもう発行しない。新規実装では `SOURCE_*` を使うこと。次のメジャー (v1.0.0) で削除予定。

### Migration (v0.2.1 → v0.3.0)

- 後方互換: 構造化エラーの形 (`{ error, code, hint?, next_actions?, retryable?, detail? }`) は変わらない
- ただし以前 `EGOV_*` で来ていた `code` が `SOURCE_*` に変わる。client/Skill 側で `code` 文字列の比較をしている場合は両方を受け付けるようにするか、houki-research-skill の最新 `docs/ERROR-CODES.md` に従う
- `OUT_OF_SCOPE` を新たに受け取る可能性がある (例: 通達名で `get_law` を呼んだとき)。Skill 側は `resolved.source_mcp_hint` または `next_actions[0].example.mcp` を見て該当 MCP に切替

## [0.2.1] - 2026-05-03

外部レビューを反映した磨き込みリリース。破壊的変更なし、すべて後方互換。

### Added

- **エラーレスポンスの LLM 可読化** — `src/errors.ts` を新設
  - 統一形式 `{ error, code, hint?, next_actions?, retryable?, detail? }` を定義
  - `LawErrorCode`: `LAW_NOT_FOUND` / `ARTICLE_NOT_FOUND` / `INVALID_ARTICLE_NUM` / `EGOV_API_ERROR` / `EGOV_TIMEOUT` / `EGOV_RATE_LIMITED` / `INVALID_ARGUMENT` / `UNKNOWN_TOOL` / `INTERNAL_ERROR`
  - `next_actions` で「次に呼ぶべき tool」をプリセット（`resolve_abbreviation`, `search_law`, `get_toc`, `retry_later`, `visit_egov_site`）
  - LLM が自律的に次手を選びやすくなる
- **同時リクエスト数の制限** — `src/utils/concurrency.ts` を新設
  - 軽量な FIFO ベース limit 関数（30行、外部依存なし）
  - 既定 4 並列。環境変数 `HOUKI_EGOV_CONCURRENCY` で上書き可
  - retry/backoff と二重に守ることで 429 (Rate Limited) を予防
- **`get_toc` に `depth` パラメータ追加** — 大規模法令対策
  - 構造階層を上位 N 階層で打ち切る（`depth=1`: 編まで、`depth=2`: 章まで、`depth=3`: 節まで）
  - 民法・会社法のような大規模法令の概観把握でトークン節約
  - レスポンスに `node_count` / `truncated` を追加
- **`package.json`** — 現代的 ESM 互換性
  - `"sideEffects": false`
  - `"exports"` フィールドを追加

### Changed

- **MCP server 内部のエラー処理（`src/index.ts`）**
  - tool handler が `LawServiceError` を返した場合、自動的に `isError: true` をセット
  - 想定外例外は `INTERNAL_ERROR` コードに正規化
- **`law-service.ts`** — エラー返却を `makeError(code, msg, { hint, next_actions, ... })` 形式に統一
  - 既存の `error` / `hint` フィールドは互換性を維持（後方互換）
- **`egov-client.ts`** — すべての fetch を `limit()` でラップ

### Migration Notes

すべて後方互換のため、設定変更は不要。

エラーレスポンスを既存コードでパースしている場合、`error` / `hint` フィールドは互換性が保たれているが、新しい `code` / `next_actions` / `retryable` を活用するとより堅牢になる。

```ts
// 旧
if ('error' in res) console.error(res.error);

// 新（推奨）
if (res.code === 'EGOV_RATE_LIMITED' && res.retryable) {
  // 30秒待って再試行
}
```

## [0.2.0] - 2026-04-27

**Architecture E への転換**。`@shuji-bonji/houki-hub-mcp` を **`@shuji-bonji/houki-egov-mcp`** にリネームし、責務を「e-Gov 法令API v2 のクライアント」に絞り込む。略称辞書は別パッケージ `@shuji-bonji/houki-abbreviations` v0.1.0 として独立。

### ⚠️ Breaking Changes

- **パッケージ名変更**: `@shuji-bonji/houki-hub-mcp` → **`@shuji-bonji/houki-egov-mcp`**
- **bin 名変更**: `houki-hub-mcp` → **`houki-egov-mcp`**
- **リポジトリ移動**: `shuji-bonji/houki-hub-mcp` → `shuji-bonji/houki-egov-mcp`
- **ツール削除**: `explain_business_law_restriction` を削除
  - 業法独占規定（弁護士法72条等）は egov-mcp の責務外（「使う側の注意」）と整理
  - 後日 `.claude/skills/houki-research/` に Skill として再構築予定
- **拡張レイヤ I/F 削除**: `src/extensions/` と `examples/ext-template/` を削除
  - Architecture E では拡張は独立 npm パッケージ（`houki-nta-mcp` 等）として実現するため、hub 側に I/F を持つ必要がなくなった

### Added

- **`@shuji-bonji/houki-abbreviations` ^0.1.0 を dependency 化**
  - 略称辞書の Single Source of Truth を独立パッケージへ移管
  - 165 エントリの略称・通称・正式名称解決はそちら経由
  - エントリに `category` / `source_mcp_hint` が追加されたことで、将来の houki-nta-mcp 等との連携準備完了
- **Trusted Publisher (OIDC) で publish**
  - `.github/workflows/publish.yml` を追加。tag push (`v*`) で自動 publish
  - publish ジョブは Node 24（npm 11+ 同梱）を使用
  - `--provenance` で attestation 付き publish

### Changed

- **`src/abbreviations/` を削除** — `@shuji-bonji/houki-abbreviations` から import
- **`src/types/index.ts` の `AbbreviationEntry`** — houki-abbreviations から re-export（後方互換）
- **`src/constants.ts` の `LAW_TYPE_CODES` / `Domain` / `DOMAINS` / `LawTypeCode`** — houki-abbreviations から re-export
- **`scripts/copy-assets.mjs` 不要化** — JSON は houki-abbreviations 同梱物
- **`package.json`**
  - `name` / `bin` / `repository.url` を houki-egov-mcp に
  - `files` から `src/abbreviations/*.json` を削除（dist のみ同梱）
  - `publishConfig.access: public` を追加
  - `build` スクリプトを `tsc` のみに簡素化

### Removed

- ツール `explain_business_law_restriction` と関連ナレッジ `src/knowledge/business-law-restrictions.ts`
- 拡張レイヤ I/F `src/extensions/` 一式
- 拡張パッケージ雛形 `examples/ext-template/`

### Migration Guide

旧 `@shuji-bonji/houki-hub-mcp@0.1.x` を使っていた場合:

```diff
{
  "mcpServers": {
-   "houki-hub": {
-     "command": "npx",
-     "args": ["-y", "@shuji-bonji/houki-hub-mcp"]
-   }
+   "houki-egov": {
+     "command": "npx",
+     "args": ["-y", "@shuji-bonji/houki-egov-mcp"]
+   }
  }
}
```

`explain_business_law_restriction` を使っていた場合は、後日リリース予定の `houki-research` Skill か、各士業の業法を直接 `get_law` で参照する形に切り替えてください。

### Status

**Phase 1（e-Gov 法令API v2 コア）** + **Architecture E への移行**完了。次は:

- **アクション3**: `houki-knowledge-mcp`（法令階層・業法独占）切り出し or Skill 化
- **アクション4**: `@shuji-bonji/houki-hub` meta-package 作成
- **アクション5**: `houki-nta-mcp` 新規開発

## [0.1.1] - 2026-04-26

**e-Gov コア完成**。v0.1.0 で抜けていた `/law_revisions` エンドポイント対応を追加し、e-Gov 法令API v2 の主要機能をすべてカバーする。

### Added

- **新ツール `get_law_revisions`** — 法令の改正履歴を取得
  - e-Gov v2 `/law_revisions/{lawId}` エンドポイントを叩く
  - 各リビジョンの **公布日 / 施行日 / 改正法令番号 / 改正法令タイトル / 状態（現行・旧法・未施行）**を返す
  - `latest=N` で最新N件のみに絞れる（デフォルトは全件）
  - 略称辞書経由で law_name 解決（消法・民法等）
- **`getLawRevisions(lawId)` 関数** を `egov-client.ts` に追加
- **`RevisionInfo` / `EgovLawRevisionsResponse` 型** を追加

### Status

**v0.1.x 系列で e-Gov 法令API v2 のカバー完了**：

- `/laws` → search_law ✓
- `/law_data/{lawId}` → get_law / get_toc ✓
- `/law_revisions/{lawId}` → get_law_revisions ✓ **(NEW)**

これで houki-hub-mcp 単体で **e-Gov の法令系機能を全カバー**。次は v0.2.0 以降で通達系拡張パッケージ（`@houki-hub/ext-nta` 等）に進む。

## [0.1.0] - 2026-04-26

**Phase 1（e-Gov 法令API v2 コア実装）完了リリース**。条文・目次取得が実 API ベースで動作する最初の実用バージョン。

### Added — Phase 1 コア実装

- **e-Gov 法令API v2 クライアント** (`src/services/egov-client.ts`)
  - `searchLaws` / `getLawData` — snake_case パラメータで叩く
  - 指数バックオフ・タイムアウト・AbortController 対応
  - `EgovHttpError` 型でステータス保持
- **法令ツリー走査** (`src/services/law-tree.ts`)
  - JSON 化された XML ツリー（`{tag, attr, children}`）を走査
  - `findArticle` / `findParagraph` / `findItem` / `extractToc` など
- **法令サービス層** (`src/services/law-service.ts`)
  - 略称解決 → law_id 解決 → 本文取得 → 整形のオーケストレーション
  - LRU cache で `/law_data` 応答を保持（時点 `at` もキー）
- **Markdown 整形** (`src/formatters/markdown.ts`)
  - 条文・項・号レベルの粒度に応じた見出し
  - 出典 URL・取得日時を必ず添付
- **条番号の表記揺れ吸収** (`src/utils/article-num.ts`) — `第30条の2` ↔ `30_2`
- **LRU Cache** (`src/utils/cache.ts`)
- **4ツールの本実装**:
  - `search_law` — タイトル検索（略称→正式名解決済み）
  - `get_law` — 条/項/号レベルの本文取得（Markdown / JSON / TOC）
  - `get_toc` — 法令の目次のみ取得
  - `search_fulltext` — Phase 2 までは search_law にフォールバック

### Added — Phase 0 同梱（v0.1.0 で正式化）

- **法令種別ナレッジ** (`src/knowledge/law-hierarchy.ts`) — 10 種別（憲法・法律・政令・省令・規則・条例・告示・訓令・通達・通知）の制定主体・階層・拘束力・実務上の注意点を構造化
- **業法独占規定ナレッジ** (`src/knowledge/business-law-restrictions.ts`) — 7職業（弁護士・税理士・社労士・公認会計士・司法書士・行政書士・弁理士）の業務独占規定・違反要件・規制外の典型例を構造化
- **新ツール `explain_law_type`** — 法令種別ナレッジを LLM から引けるツール
- **新ツール `explain_business_law_restriction`** — 業法独占規定ナレッジを LLM から引けるツール
- **`docs/LAW-HIERARCHY.md`** — 専門家でない利用者向けの法令階層リファレンス
- **`docs/USE-CASES.md`** — プロダクト開発のユースケース集（電帳法・電子契約・個情法・e-KYC）
- **拡張パッケージ計画拡充** — `@houki-hub/ext-meti` / `ext-soumu` / `ext-moj` / `ext-ppc` を Phase 3 計画に追加（合計9パッケージ）
- **拡張ツールの統一インターフェース設計** — `{namespace}_search` / `_get` / `_list` + `type` パラメータでの絞り込み

### Tests

- **74 tests passed**（v0.0.1: 49 → v0.1.0: 74、+25）
  - law-tree: 14 / cache: 6 / article-num: 6 / handlers: 15 / abbreviations: 13 / law-hierarchy: 11 / business-law-restrictions: 9
- E2E 動作確認: 消法30条1項取得・労基法目次取得・消費税法検索（実 e-Gov API 経由）

### Internal

- リポジトリリネーム: `jp-houki-mcp` → `houki-hub-mcp`
- `.gitignore` に Vite/Vitest の timestamp 一時ファイルを追加

### Known Limitations

- 漢数字の条番号（「第三十条の二」など）は未対応 — アラビア数字でご指定ください
- `search_fulltext` は Phase 2（bulkDL + SQLite FTS5）まで本実装ではない（タイトル一致 search_law にフォールバック）
- 大規模法令（民法・会社法等）の本文一括取得時にレスポンスサイズが大きい

---

## [Future planning — 0.1.0 以降]

### Planned (Phase 2)

- XML 一括ダウンロード + SQLite FTS5 による横断全文検索（`search_fulltext`）

### Planned (Phase 3)

- 拡張レイヤ I/F 確定
- 公式拡張パッケージ（`@houki-hub/ext-nta`, `@houki-hub/ext-mhlw`, `@houki-hub/ext-jaish`, `@houki-hub/ext-saiketsu` 等）リリース

### Planned (`@houki-hub/ext-court` 段階実装)

判決検索拡張は外部データ提供状況に応じて3段階で実装する：

- **Stage A**: 裁判所サイト（`courts.go.jp/app/hanrei_jp/`）の公開判決スクレイピング
- **Stage B**: **民事判決オープンデータAPI（2026年度提供開始予定）対応** — 年間約20万件公開予定。日弁連法務研究財団／最高裁による API 仕様公開を待って実装
- **Stage C**: bulk 取得 + ローカル SQLite FTS5（コアと同じ分散型 ground truth 思想を判例まで拡張、将来構想）

## [0.0.1] - 2026-04-23

Phase 0（スケルトン整備）完了リリース。

### Added

- プロジェクト骨格（`package.json` / `tsconfig.json` / ESLint / Prettier / Vitest）
- MCP サーバエントリ（`src/index.ts`）— stdio トランスポート
- 5つの MCP ツール定義：
  - `search_law` — 法令キーワード検索（スタブ）
  - `get_law` — 条/項/号単位の条文取得（スタブ、略称解決のみ動作）
  - `get_toc` — 目次取得（スタブ、略称解決のみ動作）
  - `search_fulltext` — 横断全文検索（スタブ）
  - `resolve_abbreviation` — 略称→正式名称の解決（**実装済み**）
- **略称辞書 162 エントリ**（6分野 JSON に分割）
  - 税法（26）/ 労働・社会保険（28）/ 会計（9）/ 商事（31）/ 民事（23）/ 行政・刑事・情報通信（45）
  - プロダクト開発系法令（電子署名法・資金決済法・犯収法・プロ責法・電波法・電気通信事業法 等）を網羅
- 拡張レイヤ I/F 暫定版（`src/extensions/types.ts` — `ExtensionFactory`）
- テストスイート（vitest）
  - `src/abbreviations/abbreviations.test.ts` — 辞書整合性（必須フィールド・law_id 形式・略称重複）
  - `src/tools/handlers.test.ts` — ハンドラ疎通確認
- GitHub Actions CI（Node.js 20 / 22 マトリクス、lint + test + build）
- ドキュメント：
  - `README.md` — 立ち位置・想定利用シーン・インストール
  - `DISCLAIMER.md` — 3層責任分離・業法との関係・想定利用範囲
  - `CONTRIBUTING.md` — 辞書・拡張・Skill の3経路の貢献手順
  - `docs/DESIGN.md` — 設計原則・業法との関係・利用シーン
  - `docs/PAIN-POINTS-TEMPLATE.md` — 2週間トライアル記録テンプレ
  - `examples/ext-template/` — 拡張パッケージ最小雛形
- GitHub Issue / PR テンプレート

### Status

**Phase 0 完了**。Phase 1 本実装の前に、**2週間の実運用痛点ログ**（`docs/PAIN-POINTS-TEMPLATE.md`）を経由して MVP スコープを確定する。

[Unreleased]: https://github.com/shuji-bonji/houki-egov-mcp/compare/v0.5.3...HEAD
[0.5.3]: https://github.com/shuji-bonji/houki-egov-mcp/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/shuji-bonji/houki-egov-mcp/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/shuji-bonji/houki-egov-mcp/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/shuji-bonji/houki-egov-mcp/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/shuji-bonji/houki-egov-mcp/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/shuji-bonji/houki-egov-mcp/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/shuji-bonji/houki-egov-mcp/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/shuji-bonji/houki-egov-mcp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/shuji-bonji/houki-egov-mcp/releases/tag/v0.2.0
[0.1.1]: https://github.com/shuji-bonji/houki-hub-mcp/releases/tag/v0.1.1
[0.1.0]: https://github.com/shuji-bonji/houki-hub-mcp/releases/tag/v0.1.0
[0.0.1]: https://github.com/shuji-bonji/houki-hub-mcp/releases/tag/v0.0.1
