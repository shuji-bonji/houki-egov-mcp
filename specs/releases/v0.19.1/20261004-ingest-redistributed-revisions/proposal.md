---
approved: 2026-10-04
pr: 112
implementation: required
targets: [cli_bulk_download, cli_status, cli_sync]
---
# 変更: 施行日の当日に配り直される版の状態を取り込む（egov #107）

- 対象: `cli_bulk_download` / `cli_sync` / `cli_status` の `specs/current/<dir>/spec.md`
- 実装の変更の補足: 下の「実装の変更」
- 状態: 取り込み済み（v0.19.1）
- 起こした日: 2026-10-04（JST）
- 起こした役: Spec Steward
- 対象 Issue: houki-egov-mcp #107（施行日の当日に配り直される版を unchanged として飛ばし、施行後も未施行のまま・旧版が現行のまま残る）
- 決定の出典: houki-hub `docs/notes/2026-10-04-plan-stage6-and-followups.md` 4 章「段階 1」、5.1 の「取り込みの判定を変える」の行、5.3、8.2 の Q2・Q3
- 前提: main（`bc96b9a`。v0.19.0 の `f3b7fc1` の上に docs のコミットが 1 つ。2026-10-04 JST に `git ls-remote` で origin の main と同じことを確かめた）から切った。`specs/changes/` にほかの差分は無い
- 版: 0.19.1（patch）。DB のスキーマの版は 3 のまま、`INGEST_VERSION` は 2 のまま
- 期限: 0.19.1 の publish の目標は 2026-10-15（施行日 2026-10-16 の 7 版の前日）。施行日 2026-10-05 の 5 版は 0.19.1 の後から直す前提（下の「互換性」）

## なぜ変えるか

e-Gov は、改正が公布された日の差分に、施行日ごとの版を未施行の欄 `○` で入れ、施行日の当日の差分に同じ版（同じ `law_revision_id`、バイト単位で同じ XML）を未施行の欄を空にしてもう一度入れる。v0.19.0 の取り込みは、XML の `content_hash` が前回と同じ版を `unchanged` として飛ばすので、施行日を過ぎても版の `current_revision_status` が `UnEnforced` のまま残り、同じ法令の古い版が `CurrentEnforced` のまま残る。`search_fulltext` は `CurrentEnforced` の版だけを返す（SPEC-EGOV-SEARCH-FULLTEXT-008）ので、施行後も改正前の条文を返し続ける。`--sync` を続けても、`--bulk-download-everything` をやり直しても直らない（Issue #107 の本文）。

Issue は「次に起きるのは 2026-11-01」と書いたが、当たっていない。shuji の DB（0.19.0、2026-10-03 に全件から作成）で、施行日が 2026-10-04〜10-31 の `UnEnforced` の版が 21 あった（下の「確かめた値」）。

## 今の動き（v0.19.0）

- 同じ版の ID の XML が前回と同じなら、CSV の未施行の欄が変わっていても、`laws` の行を一切書き換えず `unchanged` と数える（`src/services/bulk/ingester.ts` 316〜320 行目。`buildLawRow` と SPEC-EGOV-CLI-BULK-DOWNLOAD-016 の処理より前で `continue`）
- 全件の zip には、施行済みで置き換わった前の版が入っていないので、DB に `UnEnforced` のまま残った前の版は、全件の取り込みでも触られない
- `--sync`・`--status` は、施行日を過ぎた `UnEnforced` の版があっても何も出さない

## 変えた後の動き

1. **同じ XML で、未施行の欄が空になって届いた未施行の版は、状態だけを現行にする（031）。** DB が `UnEnforced` で CSV の欄が空なら、`current_revision_status` だけを `CurrentEnforced` にし、016 の比較（古い現行の版を `PreviousEnforced` に下げる）を通す。条の本文・`content_hash`・`fetched_at` は書き換えない。`unchanged` に数えたまま、`status_changed` にも数える
2. **全件の取り込みでは、全件の CSV に無い未施行の版を前の版にする（033）。** 全件の CSV に無く、施行日が同じ法令の現行の版の施行日以前の `UnEnforced` の版を `PreviousEnforced` にする。v0.19.0 で残った中間の版（Issue の表の `…_20260917_…`）を直すため
3. **前日に未施行の欄が空で届く版は、e-Gov の CSV に従って現行にする（011 の明記）。** 今の動きと同じで、仕様に書くだけ
4. **件数の表示（032・SYNC-020）。** `status_changed` が 1 以上のときだけ、`  状態の更新: <n> 件 (…)` の行を足す。既存の行（`  ingest 完了: …`、`[完了] …`、1 日ごとの行）の形は変えない
5. **施行日を過ぎた未施行の版の警告（SYNC-021・STATUS-012）。** `--sync`（終わったとき）と `--status` で、`amendment_enforcement_date` が `last_sync_date` より前の `UnEnforced` の版を数え、1 件以上なら `[WARN]` の行で `--bulk-download-everything` を案内する。終了コードは変えない

## 変わる仕様 ID

| 種類     | 仕様 ID                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------ |
| ADDED    | SPEC-EGOV-CLI-BULK-DOWNLOAD-031・032・033、SPEC-EGOV-CLI-SYNC-020・021、SPEC-EGOV-CLI-STATUS-012 |
| MODIFIED | SPEC-EGOV-CLI-BULK-DOWNLOAD-011・014・016、SPEC-EGOV-CLI-SYNC-006                                |
| REMOVED  | なし                                                                                             |

ADDED 6、MODIFIED 4、REMOVED 0。触る dir は `cli_bulk_download`・`cli_sync`・`cli_status`。ID は `npx spec-ids next <dir>` で取った（2026-10-04 JST）。

Issue の「決めること」との対応:

| Issue の決めること             | この差分の答え                                                                                                                | 仕様 ID                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1 直し方                       | 案 A（状態だけを書き換え、016 を通す。条の本文は入れ直さない）。件数は `status_changed` を `unchanged` の内数として別に数える | 031・032、SYNC-020、014・016   |
| 2 前日に未施行の欄が空で届く版 | 案 A（e-Gov の CSV に従う。1 日早く現行になる）                                                                               | 011                            |
| 3 すでに状態が残った DB        | 0.19.1 の `--bulk-download-everything` 1 回で直る（031・033）。`--sync`・`--status` に `[WARN]`                               | 031・033、SYNC-021、STATUS-012 |
| 4 版                           | スキーマの版を上げず 0.19.1。`INGEST_VERSION` も上げない                                                                      | —（仕様 ID なし）              |

## 変わらない振る舞い

- MCP のツールの応答の形（フィールド・`code`・`note`・`next_actions`）は変えない。`search_fulltext` が返す版が、施行日を過ぎた法令で正しい現行の版になるだけ（SPEC-EGOV-SEARCH-FULLTEXT-008 の文は変えない）。計画書 5.2 の 47 例の契約の確認は要らない（代わりに下の「publish の前の確認」）
- DB のスキーマ（版 3）、`INGEST_VERSION`（2）。0.19.0 の DB をそのまま使う。全件の入れ直しは起きない
- XML の中身が変わった版の取り込み（`upsert`。014 の後半）、新しい版の取り込み、016 の比べ方
- 未施行の欄が `○` で届いた版は、DB が `CurrentEnforced`・`PreviousEnforced` でも `UnEnforced` に戻さない（031 の「書き換えない」の 2 つ目）
- CLI の既存の行の形と終了コード: `  ingest 完了: <n> 件 upsert[, <n> 件 unchanged][, <n> 件 failed] (<時間>)`（020・021 の 6）、`[完了] …` と `  last_sync_date: …`（SYNC-014・015・018）、1 日ごとの行（SYNC-016）、`--status` の行（STATUS-005 など）。新しい行は条件を満たすときだけ足す
- `unchanged` の数: 配り直された版は今までどおり `unchanged` に数える（`status_changed` はその内数。033 の版は `unchanged` に入らない）。Issue の実測の `upserted`・`unchanged` の数は 0.19.1 でも同じになる見込み（確かめていない）
- `--bulk-download-by-date` と `--sync` は 033 の処理をしない
- `sync_state` の書き方（017・018・SYNC-006 の同期の状態）

## 互換性（0.19.1 の CHANGELOG の「互換性」の節に書くもの）

| 場面                                                                                | 0.19.0                                                              | 0.19.1                                                                                                                           |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 施行日の当日の差分で、同じ XML の版が未施行の欄を空にして届く                       | `unchanged`。`UnEnforced` のまま、古い版が `CurrentEnforced` のまま | `unchanged` に数えたまま、状態だけ `CurrentEnforced` にし、古い版を `PreviousEnforced` にする                                    |
| 0.19.0 で状態が残った DB に `--bulk-download-everything`                            | 直らない（XML が同じなので全件 `unchanged`）                        | 直る（031・033）。条の本文は入れ直さない                                                                                         |
| 取り込みの表示                                                                      | —                                                                   | `status_changed` が 1 以上のとき `  状態の更新: <n> 件 (…)` の行が増える                                                         |
| `--sync`・`--status` で、施行日が `last_sync_date` より前の `UnEnforced` の版がある | 何も出さない                                                        | `[WARN] 施行日が last_sync_date (…) より前なのに未施行 (UnEnforced) のままの版が <n> 件あります。…` の行。終了コードは変わらない |

CHANGELOG と README に書く案内の文（計画書 4 章の段階 1 のとおり）:

> 0.19.0 で 2026-10-04 以降に `--sync` した DB は、0.19.1 に上げた後に `houki-egov-mcp --bulk-download-everything` を 1 回実行してください。施行日を過ぎても未施行のまま残った版の状態を直します（条の本文は入れ直しません。全件の zip 約 290 MB を取得します）。0.19.1 の `--sync` や `--status` が `[WARN] 施行日が last_sync_date …` を出したときも同じです。

補足（正確な範囲。案内の文に足すかは「人が判断すること」7）: `--sync` は `last_sync_date` の日を取得し直す（SPEC-EGOV-CLI-SYNC-002）ので、0.19.0 の最後の `--sync` の `last_sync_date` が施行日の当日以前なら、0.19.1 の `--sync` だけで直る。直らないのは、0.19.0 で施行日の翌日以降まで `--sync` を進めた DB で、これは 0.19.1 の `[WARN]` で分かる。

## 実装 PR で直す文書

動きを変えない行で、仕様 ID を作らないもの。

| #   | 場所                                                                               | 直すこと                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | CHANGELOG 0.19.1                                                                   | 上の「互換性」の表と案内の文。`Fixed` に #107。取り込みの件数の出力を例で書く（計画書 5.1 の (3)。`  ingest 完了: … 件 upsert, … 件 unchanged` と `  状態の更新: … 件 (…)` の 2 行）                                                                                           |
| 2   | README の DB の節                                                                  | 案内の文（0.19.0 で 2026-10-04 以降に `--sync` した DB は、0.19.1 で `--bulk-download-everything` を 1 回）。長くなるなら要約を README に残して `docs/NOTES.md` に分ける                                                                                                       |
| 3   | `src/services/bulk/ingester.ts` の先頭の JSDoc                                     | 「`current_revision_status` は CSV の `unenforced` フラグから簡易判定」に、031（同じ XML でも欄が空になれば状態だけ書き換える）と 033（全件の取り込みで CSV に無い未施行の版を前の版にする）を足す。`INGEST_VERSION` の JSDoc に「状態だけの変化では上げない（0.19.1）」を足す |
| 4   | houki-hub `site/docs/mcp/houki-egov.md` の「元データが変わったときに何が起きるか」 | 施行日の当日の配り直しで状態が変わることと、0.19.0 の DB の直し方。houki-hub のブランチで行い、計画書 9 章に main に入ったかを書く（計画書 5.4）                                                                                                                               |

`--help` の文と tools/list の `description` は変えない。

## 実装の変更

- `ingester.ts` 316〜320 行目: `content_hash` に加えて `current_revision_status` を読む。ハッシュが同じで、DB が `UnEnforced`、CSV の `unenforced` が `false` なら、状態だけの更新の項目としてバッチに積む（`unchanged++` と `statusChanged++`）。CSV の順を保つため、`upsert` の項目と同じバッチ・同じトランザクションで順に処理する
- 状態だけの更新: `UPDATE laws SET current_revision_status = 'CurrentEnforced' WHERE law_revision_id = ?` の後、`amendment_enforcement_date` があれば `demoteOlderRevisions` と `demoteIfNewerExists` を同じ引数で実行する。`articles`・`laws_fts` と、`content_hash`・`fetched_at`・`updated` は触らない（`amendment_enforcement_date` は DB の値を使う。版の ID が同じなので CSV の施行日と同じ）
- 033: `IngestZipOptions` に全件の取り込みであることを示すオプション（例: `fullSnapshot: boolean`、既定 `false`）を足し、`--bulk-download-everything` だけが `true` を渡す。`source` の既定値 `'all_xml'` を使う既存のテストが 033 の処理を通らないように、`source` とは分ける。CSV の全行の後、同期の状態を書く前に、CSV の版の ID の集合に無い `UnEnforced` の版のうち、同じ `law_id` の `CurrentEnforced` の版の `amendment_enforcement_date` 以前のものを `PreviousEnforced` にし、`statusChanged` に足す（版の ID の集合は一時テーブルに入れて 1 回の `UPDATE` にするか、`UnEnforced` の版を読んで JS で比べる。約 1,400 版）
- `IngestResult` に `status_changed: number`（`unchanged` の内数 + 033 の数）を足す
- `src/cli/index.ts`: `formatIngestCounts` は変えない。`--bulk-download-everything`・`--bulk-download-by-date` は `  ingest 完了:` の行の後に 032 の行。`printSyncResult` は成功の 3 経路（014・015・018）で、`  last_sync_date:` の後に SYNC-020 の行、最後に SYNC-021 の `[WARN]`。`runStatus` は同期の欄の後に STATUS-012 の `[WARN]`
- `[WARN]` の件数: `SELECT count(*) FROM laws WHERE current_revision_status = 'UnEnforced' AND amendment_enforcement_date < ?`（引数は `last_sync_date`）。`--status` は読むだけで開いた DB で数える。関数を 1 つにして `--sync` と `--status` で使う（文も 1 か所で作る）

## publish の前の確認

計画書 5.1 の「取り込みの判定を変える」の行と 5.2 のとおり、0.19.1 はツールの応答を変えないので、47 例の契約の確認の代わりに次を publish の条件にする。shuji の Mac で行う。

1. 受入テスト（031 の表の 4 版、032・033・SYNC-020・021・STATUS-012）が `npm test` で通る
2. DB のコピーを作る。`sqlite3 ~/.cache/houki-egov-mcp/laws.db 'PRAGMA wal_checkpoint(TRUNCATE);'` の後に `laws.db` を `laws.0191check.db` に複製する（MCP サーバーと CLI を止めてから）
3. 作業コピーで `npm run build` した 0.19.1 の `dist/index.js` を、コピーに向けて実行する: `HOUKI_EGOV_DB_PATH=~/.cache/houki-egov-mcp/laws.0191check.db node dist/index.js --bulk-download-everything`。出力の `  ingest 完了:` と `  状態の更新:` の行を記録する
4. 次の 2 つの SQL がどちらも 0 行・0 件であることを確かめる
   - `SELECT law_id FROM laws WHERE current_revision_status='CurrentEnforced' GROUP BY law_id HAVING count(*) > 1;`（現行の版が 1 法令に 1 つ）
   - `SELECT count(*) FROM laws WHERE current_revision_status='UnEnforced' AND amendment_enforcement_date < '<実行した日の日本時間の日付>';`（施行日を過ぎた未施行の版が残っていない。0 でなければ版の ID を出して実装 PR に書く）
5. 2026-10-05 以降に行うときは、施行日 2026-10-05 の 5 版（「確かめた値」の ID）が `CurrentEnforced` になり、同じ法令の施行日がより前の版に `CurrentEnforced` が残っていないことを確かめる: `SELECT law_id, law_revision_id, current_revision_status FROM laws WHERE law_id IN ('347M50000040026','348M50000040005','405M50000040014','405M50000040022','417M60000010018') AND current_revision_status <> 'UnEnforced' ORDER BY law_id, amendment_enforcement_date;`（法令ごとに `CurrentEnforced` は施行日 2026-10-05 の版の 1 行だけ）
6. 同じコピーで `HOUKI_EGOV_DB_PATH=… node dist/index.js --status` を実行し、`[WARN]` の行が出ないことを確かめる
7. 結果（日時・件数・SQL の結果）を実装 PR の本文と CHANGELOG の例に書く。確かめた後、コピーは消してよい

## 取り込みのとき（Publisher）

- ADDED の見出しを、各 `specs/current/<dir>/spec.md` の「できること」の末尾に足す。MODIFIED は見出しの行（題）も含めて、差分の見出しと本文に置き換える
- 各差分の spec.md の冒頭に書いた、ID の無い節の変更（「関連する Issue」、「処理の流れ」の図、cli_bulk_download の「できないこと」の 1 行）を行う
- 各 `specs/current/<dir>/spec.md` の承認日の行に「差分 `20261004-ingest-redistributed-revisions` は YYYY-MM-DD（PR #N）」を足す
- この差分のフォルダーを `specs/releases/v0.19.1/20261004-ingest-redistributed-revisions/` へ移し（`git mv`）、この proposal.md の「状態」を取り込み済みにする
- CHANGELOG の 0.19.1 に閉じる Issue（#107）を書く。`Closes #107` は実装 PR の本文に書く
- 計画書 9 章の段階 1 の行に「済（日付・PR 番号・コミット）」を書く

## 人が判断すること

1. **直し方は案 A（031）。** XML が同じでも、DB が `UnEnforced` で CSV の欄が空なら状態だけを書き換え、016 を通す。案 B（`content_hash` の入力に未施行の欄を混ぜる）は、施行日の当日の差分で数百件の条の本文を入れ直し、0.19.0 の DB の全件の入れ直しにもなるので採らない。**勧める: A**
2. **前日に欄が空で届く版は e-Gov の CSV に従う（011）。** 施行日の 1 日前から新しい条文を返す。案 B（施行日が今日より後なら空でも `UnEnforced`）は、配り直しが無い版のために日付で切り替える処理が別に要る。**勧める: A**
3. **全件の CSV に無い未施行の版を前の版にする（033）。指示の出発点に無かった項目。** 031 だけでは、0.19.0 で残った中間の版（Issue の表の `…_20260917_…`。施行済みで次の版に置き換わった版）が全件の zip に入っていないので `UnEnforced` のまま残り、`--bulk-download-everything` 1 回で直るという案内と、SYNC-021・STATUS-012 の `[WARN]` が消えないことが食い違う。10 月中の 21 版のうち、同じ法令に 10 月中の施行日が 2 つある法令は `419AC1000000051` の 1 つだけで、その 2 版はどちらも 2026-10-05 の版ではない（下の「確かめた値」）。施行日 2026-10-05 の 5 版は 5 つとも別の法令で、10 月中にその法令の次の版は無いので、`419AC1000000051` の 2 版の施行日は 2026-10-24 と 2026-10-31、5 法令のほかの未施行の版は `417M60000010018_21171231_…`（施行日 2117-12-31）だけである。したがって今の shuji の DB で 033 が要るのは、0.19.0 のまま 2026-10-31 の翌日以降まで `--sync` を進め、`419AC1000000051_20261024_…` が次の版に置き換わってから `--bulk-download-everything` を実行した場合だけで、0.19.1 が 2026-10-15 までに出れば要る版は無い。033 が要るのは、0.19.1 の publish が遅れたとき、または 0.19.0 のまま、同じ法令の次の版の施行日を過ぎるまで `--bulk-download-everything` をしなかった DB である。代わりの案は (B) 033 を入れず、案内を「`HOUKI_EGOV_DB_PATH` で別のファイルに空から作り直して名前を変える」にする（約 290 MB の取得と全件の入れ直し）、(C) 033 を `--sync` にも入れる（差分 zip は全件を含まないので、CSV に無いことが「置き換わった」ことを意味せず、採れない）。033 は全件の zip が「現行 1 つと未施行のすべて」を入れるという 1 回の実測（Issue #107）に頼っている。施行日が現行の版の施行日以前の版だけに限ったので、e-Gov が未施行の版を全件の zip に入れ忘れた場合でも、現行より後の未施行の版は触らない。今すぐ要る版が無い見込みなので、B（033 を入れず、遅れたときは作り直しを案内）も成り立つ。A を勧めるのは、`[WARN]` が出たら `--bulk-download-everything` 1 回で消える、という案内を 1 通りに保てるため。**勧める: 033 を入れる（A）。ただし今の DB での必要性は低い**
4. **`[WARN]` で比べる日は `last_sync_date`（同じ日を含まない）。計画書の「今日（日本時間）以前」から変えた。** 今日以前にすると、施行日の当日の午前に `--sync` した直後（配り直しの差分は 15 時ごろに作られる）に、直る前の版を数えて `--bulk-download-everything` を案内してしまう。`--status` では、同期していないだけの版（`--sync` で直る）まで数えてしまう。`--sync` が終わった時点では `last_sync_date` は今日なので、`--sync` では「今日より前」と同じになる。**勧める: `last_sync_date` より前**
5. **件数の名前は `status_changed`、`unchanged` の内数。表示は条件つきの新しい行（032・SYNC-020）。** 既存の行に `, <n> 件 status_changed` を足す案は、行の形を変えないという指示に当たるので採らなかった。`unchanged` の内数にしたので、`unchanged` の数と SYNC-015 の「確認した <n> 件はすべて取り込み済み」は 0.19.0 と同じ値になる。033 の版は `unchanged` に入らない（CSV に無い）ので、`status_changed` は厳密には内数でない（032 の文は「状態だけを書き換えた版の数」と書いた）。`--sync` の 1 日ごとの行（SYNC-016）には出さず、まとめの後の 1 行にした。表示の文 `状態の更新: <n> 件 (条の本文はそのまま、未施行 (UnEnforced) だった版の状態だけを書き換え)` も判断の対象。**勧める: このまま**
6. **欄が `○` で届いても、`CurrentEnforced`・`PreviousEnforced` を `UnEnforced` に戻さない。** e-Gov が施行を延期したときなどに起こりうるが、Issue の実測（2026-09-01〜10-02）には `空 → ○` の版が無く、戻すと同じ法令の現行の版が 0 になる（計画書 5.1 の「現行の版が 0」）。**勧める: 戻さない**
7. **案内の文の範囲。** 計画書の「0.19.0 で 2026-10-04 以降に `--sync` した DB は 1 回実行」をそのまま CHANGELOG と README に書く。正確には「0.19.0 で施行日の翌日以降まで `--sync` を進めた DB」だけが要る（上の「互換性」の補足）。広めに書いても `--bulk-download-everything` は害が無い（条の本文を入れ直さない）。補足も書くかを決める。**勧める: 計画書の文に、`[WARN]` が出たときも同じ、を足す（補足は README から `docs/NOTES.md` に回す）**
8. **状態だけを書き換えるとき、`fetched_at`・`updated` を変えない。** 014 の「取得日時も前回のまま」に揃えた。`updated` を書き換えて「状態を変えた日」を残す案もあるが、ツールの応答に出ない列で、残す用途が無い。**勧める: 変えない**
9. **`[WARN]` の文の案内のコマンドは `houki-egov-mcp --bulk-download-everything`。** 既存の文（SPEC-EGOV-CLI-SYNC-010 など）と同じ形にした。`npx -y @shuji-bonji/houki-egov-mcp@latest …` の形にするかは、計画書の T6-c（0.20.0）でほかの文とまとめて決める。**勧める: このまま**
10. **版は 0.19.1、スキーマの版 3、`INGEST_VERSION` 2 のまま。** `INGEST_VERSION` を上げると全利用者の全件の入れ直しになる。**勧める: このまま**
11. **承認日。** この proposal.md の「- 承認日:」に日付と PR 番号を書く（shuji がマージの前に）

## 確かめた値

| 何を                                                                               | 結果                                                                                                                                                                                                                                                         | いつ・どうやって                                                                                                                                                                                                                                           | 使った仕様 ID                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 施行日が 2026-10-04〜10-31 の `UnEnforced` の版の数                                | 21                                                                                                                                                                                                                                                           | 2026-10-04 JST、shuji が Mac の DB（`~/.cache/houki-egov-mcp/laws.db`、0.19.0 で 2026-10-03 に全件から作成）で `SELECT count(*) FROM laws WHERE current_revision_status='UnEnforced' AND amendment_enforcement_date BETWEEN '2026-10-04' AND '2026-10-31'` | 期限の根拠                                                           |
| 同じ版の施行日ごとの内訳                                                           | 2026-10-05: 5、10-16: 7、10-23: 1、10-24: 5、10-30: 2、10-31: 1                                                                                                                                                                                              | 同じ日、同じ DB で `GROUP BY amendment_enforcement_date`（shuji が実行）                                                                                                                                                                                   | 期限の根拠、SYNC-021・STATUS-012 の例の件数                          |
| e-Gov の配り方（施行日の当日の差分に、同じ版・同じ XML が欄を空にして入る）        | `○` から空に変わった版 48 件、48 件とも施行日の当日の差分、XML はバイト単位で同じ。前日の差分に欄が空で入る版 59 件（09-30 の差分に施行日 10-01 の版 34 件など）。全件の zip は 10,414 版、うち欄が `○` 1,410 版、施行済みで置き換わった前の版は入っていない | Issue #107 の本文（2026-10-04 JST、2026-09-01〜10-02 の日次差分 zip と全件 zip の CSV・XML を比べた）                                                                                                                                                      | 031・033・011                                                        |
| 医師法施行規則（`323M40000100047`）の 4 版の状態と件数                             | 031 の表のとおり。件数は 09-02 `upserted: 26`、09-17 `upserted: 14`・`unchanged: 5`、10-01 `upserted: 338`・`unchanged: 5`                                                                                                                                   | Issue #107 の本文（2026-10-04 JST、main `f3b7fc1` のクローンで、空の DB に 3 つの差分 zip を順に `ingestZip`）                                                                                                                                             | 031・033                                                             |
| 施行日 2026-10-05 の `UnEnforced` の版の ID                                        | `347M50000040026_20261005_508M60000002079`、`348M50000040005_20261005_508M60000002079`、`405M50000040014_20261005_508M60000002079`、`405M50000040022_20261005_508M60000002079`、`417M60000010018_20261005_508M60000010023` の 5 つ。法令ID は 5 つとも違う   | 2026-10-04 JST、shuji が Mac の同じ DB で `SELECT law_revision_id FROM laws WHERE current_revision_status='UnEnforced' AND amendment_enforcement_date='2026-10-05'`（施行日の前日に実行したので、e-Gov の配り直しより前の状態）                            | publish の前の確認の 5、判断 3                                       |
| 施行日が 2026-10-04〜10-31 の `UnEnforced` の版が 2 つ以上ある法令                 | `419AC1000000051` の 1 つ（2 版）                                                                                                                                                                                                                            | 同じ日、同じ DB で `GROUP BY law_id HAVING count(*) > 1`（shuji が実行）                                                                                                                                                                                   | 033、判断 3                                                          |
| 上の 6 法令（`419AC1000000051` と施行日 2026-10-05 の 5 法令）の `UnEnforced` の版 | 施行日 2026-10-05 の 5 版、`417M60000010018_21171231_423M60000010005`（2117-12-31）、`419AC1000000051_20261024_508AC0000000066`（2026-10-24）、`419AC1000000051_20261031_508AC1000000073`（2026-10-31）の 8 版                                               | 2026-10-04 JST、shuji が Mac の同じ DB で `law_id IN (…)` を施行日の順に取り出した                                                                                                                                                                         | 判断 3                                                               |
| 全件から作った直後の DB に、施行日を過ぎた `UnEnforced` の版が無いこと             | 施行日が 2026-10-04 以前の `UnEnforced` の版は 0 件                                                                                                                                                                                                          | Issue #107 の本文（shuji の DB、2026-10-03 に全件から作成）                                                                                                                                                                                                | SYNC-021・STATUS-012（全件の取り込みの直後に `[WARN]` が出ない根拠） |
| v0.19.0 の判定の位置                                                               | 316〜320 行目で `content_hash` が同じなら `continue`。016 の `demoteOlderRevisions`・`demoteIfNewerExists` は `ingestBatch` の中で、`upsert` の項目にだけ走る                                                                                                | main `bc96b9a` の `src/services/bulk/ingester.ts` を読んだ                                                                                                                                                                                                 | 014・016・031                                                        |
| `ingestZip` の呼び出し方                                                           | `--bulk-download-everything` は `source: 'all_xml'`、`--bulk-download-by-date` と `--sync` は `source: 'incremental'`・`updateSyncState: false`。`source` の既定値は `'all_xml'`                                                                             | main `bc96b9a` の `src/cli/index.ts` を読んだ                                                                                                                                                                                                              | 033（オプションを分ける理由）                                        |
| 件数の表示の作り方                                                                 | `formatIngestCounts` が `upsert`・`unchanged`・`failed` を `, ` でつなぐ。`printSyncResult` が `[完了]` と `  last_sync_date:` を出す。`runStatus` は標準出力                                                                                                | main `bc96b9a` の `src/cli/index.ts` を読んだ                                                                                                                                                                                                              | 032・SYNC-020・021・STATUS-012                                       |

## 確かめていない点

- e-Gov が 2026-10-05 の差分で、施行日 2026-10-05 の 5 版（上の「確かめた値」）を同じ XML のまま欄を空にして配り直すか。2026-10-05 の 15 時ごろより後に、`--bulk-download-by-date 20261005` を別のファイルの DB に向けて実行するか、e-Gov の差分 zip の CSV を見れば分かる。受入テストは医師法施行規則の形の fixture で書き、この 5 版は publish の前の確認（実データ）に使う
- 0.19.1 での `status_changed` の実際の数（031 の例の 09-17・10-01、032・SYNC-020 の例）。例の数は Issue の実測の `unchanged` を当てはめたもの
- 全件の zip が、医師法施行規則について 033 の例のとおりの版を持つこと（`…_20261001_…` が欄が空、`…_20270401_…` が `○`、`…_20260814_…`・`…_20260917_…` が無い）。Issue の「全件 zip の配り方」からの推定
- 全件の zip に、施行日を過ぎた `UnEnforced` の版（e-Gov 側で欄が `○` のまま残った版）が無いこと。2026-10-03 の 1 回だけの実測（0 件）。あれば全件の取り込みの後も `[WARN]` が出続ける
- e-Gov が欄を `空 → ○` に戻すことがあるか（人が判断すること 6）
- 施行日の当日の差分が 15 時ごろに作られること。SPEC-EGOV-CLI-SYNC-002 の文の根拠をそのまま使った。今回は取得していない
- 033 の処理の時間（全件の取り込みに足す `UPDATE` 1 回。`UnEnforced` は約 1,400 版）

## この差分の外で見つけたこと

- なし（cli_status の「できないこと」の「未施行・前の版の内訳を出すこと」は、STATUS-012 が件数を 1 つ出すだけなので変えない）
