# 機能: cli_sync（全件取り込み済みのローカル DB を日次差分で最新化する）

- 機能 ID: EGOV
- 種類: CLI
- 版: current
- 承認日: 2026-09-28（PR #50）。差分 `20260928-undecided-to-issues` は 2026-09-28（PR #68）。差分 `20260928-untested-behaviors` は 2026-09-28（PR #PR-SPEC）
- 起こした元: v0.15.1 の `src/cli/index.ts`、`src/config.ts`、`src/services/bulk/sync.ts`、`src/services/bulk/zip-fetcher.ts`、`src/services/bulk/ingester.ts`、`src/services/bulk/sync.test.ts`
- 関連する Issue: houki-egov-mcp #21（`--sync` の追加）

この文書は「このコマンドは何をするか」を書きます。どう実装しているか（関数名・テーブル名）は書きません。

## アクター

- 利用者（ターミナルから `houki-egov-mcp --sync` を実行する人。定期実行に組み込む人を含む）。`--bulk-download-everything` で作ったローカル DB に、最後に同期した日から今日までの e-Gov の日次差分を取り込む

## 入力

| フラグ・環境変数                         | 必須 | 内容                                                                                      |
| ---------------------------------------- | ---- | ----------------------------------------------------------------------------------------- |
| `--sync` / `--bulk-download-incremental` | 必須 | 差分での最新化を行う。2 つは同じ動作                                                      |
| `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS`      | 任意 | 最後に同期した日から差分で追える日数の上限（既定 90。e-Gov が日次差分を公開している範囲） |
| `HOUKI_EGOV_DB_PATH`                     | 任意 | DB ファイルの場所。既定は `${XDG_CACHE_HOME:-~/.cache}/houki-egov-mcp/laws.db`            |
| `HOUKI_EGOV_BULK_RETRY`                  | 任意 | 1 日分の zip の取得に失敗したときに試す回数（既定 3）                                     |

## 処理の流れ

実行してから終わるまでに、何をどの順で確かめるかを示します。図の中の番号は「できること」の仕様 ID の末尾 3 桁です。

```mermaid
flowchart TD
  A["--sync"] --> B{"同期の状態（last_sync_date）があるか"}
  B -- ない --> E1["何も取得せず、全件の取り込みを促して終わる（001）"]
  B -- ある --> C{"last_sync_date から今日（日本時間）まで上限の日数を超えているか"}
  C -- 超えている --> E2["何も取得せず、全件の取り込みを促して終わる（003）"]
  C -- 超えていない --> D["last_sync_date から今日までの日を古い順に並べる（002）"]
  D --> F{"e-Gov の一括ダウンロードのページに届くか"}
  F -- 届かない --> E3["何も進めずに終わる（004）"]
  F -- 届く --> G["その日の差分 zip を取得する"]
  G --> H{"結果"}
  H -- "HTTP 404 / 500" --> I["差分なしとして、その日を確認済みにする（005）"]
  H -- 取得できた --> J["取り込み、その日を確認済みにし、zip を消す（006）"]
  H -- "それ以外の失敗・取り込みの失敗" --> K["その日で止める。確認済みの日までを残す（007）"]
  I --> P["1 日ごとに進捗を出す（008）"]
  J --> P
  P --> Q{"次の日があるか"}
  Q -- ある --> G
  Q -- ない --> Z["終わる"]
```

## できること

### SPEC-EGOV-CLI-SYNC-001 全件の取り込みがまだなら何も取得しない

同期の状態が無い（`--bulk-download-everything` をまだ一度も終えていない）ときは、e-Gov への接続の確認も差分の取得もしない。

### SPEC-EGOV-CLI-SYNC-002 最後に同期した日を含めて、今日（日本時間）までを 1 日ずつ確かめる

確かめる日は、同期の状態の `last_sync_date` から今日までの両端を含むすべての日で、古い順に並べる。今日は日本時間の日付で決める（UTC ではまだ前日の時刻でも、日本時間で日付が変わっていれば新しい日付）。月をまたいでも日を飛ばさない。`last_sync_date` が今日と同じなら、今日 1 日だけを確かめ直す（e-Gov の日次差分はその日の 15 時ごろに作られるので、午前に同期した日の差分を拾い直すため）。各日の差分は `update_date=YYYYMMDD`（例: 2026-09-07 → `20260907`）で取得する。

例: 日本時間 2026-09-19 12 時に、`last_sync_date` が `2026-09-17` の DB で実行すると、`2026-09-17`・`2026-09-18`・`2026-09-19` の 3 日を確かめる。

### SPEC-EGOV-CLI-SYNC-003 差分で追える日数を超えていたら何も取得しない

`last_sync_date` から今日までの日数が `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS`（既定 90）を超えているときは、e-Gov への接続の確認も差分の取得もしない。ちょうど上限の日数のときは差分で追う（既定なら 91 日を確かめる）。

例: 日本時間 2026-09-19 に `last_sync_date` が `2026-05-01` の DB では 141 日空いているので、何も取得しない。`2026-06-21` なら 90 日なので差分で追う。

### SPEC-EGOV-CLI-SYNC-004 e-Gov に届かなければ何も進めない

差分を取得する前に、e-Gov の一括ダウンロードのページ（`https://laws.e-gov.go.jp/bulkdownload/`）に届くことを確かめる。届かないときは、1 日分も取得せず、`last_sync_date` も動かさずに失敗する。

### SPEC-EGOV-CLI-SYNC-005 差分 zip の無い日は「差分なし」として飛ばす

その日の差分 zip の取得に HTTP 404 または 500 が返ったときは、失敗とせず「差分なし」として扱い、その日を確認済みにして次の日へ進む（e-Gov は差分の無い日に HTTP 500 を返す。SPEC-EGOV-CLI-SYNC-004 で e-Gov に届くことを確かめてあるので、障害とは見なさない）。HTTP 503 など 404・500 以外の応答と、通信の失敗は「差分なし」にしない。

### SPEC-EGOV-CLI-SYNC-006 差分のある日は取り込み、1 日ごとに `last_sync_date` を進める

差分 zip を取得できた日は、その zip を DB に取り込み（取り込みのしかたは `--bulk-download-by-date` と同じ。cli_bulk_download の SPEC-EGOV-CLI-BULK-DOWNLOAD-007〜016）、その日を確認済みにする。確認済みにするたびに、同期の状態を次にする。取り込んだ zip はその日のうちに消す。

- `last_sync_date`: 確認済みにした日
- `last_full_dl_at`: 前の全件の取り込みの時刻のまま
- 法令の総数: その時点の DB にある法令の数
- 取り込み元: `incremental`

例: `last_sync_date` が `2026-09-16` で、2026-09-16 と 2026-09-19 は差分なし、2026-09-17 と 2026-09-18 は差分ありのとき、4 日とも確認済みになり、`last_sync_date` は `2026-09-19` になる。消す zip は 09-17 と 09-18 の 2 つ。

### SPEC-EGOV-CLI-SYNC-007 差分なし以外の失敗が起きたら、その日で止めて確認済みの日までを残す

ある日の取得が「差分なし」以外の理由で失敗したとき、または取り込みに失敗したときは、その日と後の日を確かめずに止める。`last_sync_date` は最後に確認済みにした日のまま残るので、もう一度 `--sync` を実行するとその失敗した日から続ける。取り込みに失敗した日の zip も消す。

例: `last_sync_date` が `2026-09-16` で、2026-09-18 の取得が `bulk DL に 3 回失敗しました: ECONNRESET` で失敗したとき、09-16 と 09-17 が確認済みになり、`last_sync_date` は `2026-09-17` になる。

### SPEC-EGOV-CLI-SYNC-008 1 日ごとに進捗を出す

1 日を確かめ終わるごとに（差分なしの日も）、何日目か・全部で何日かとその日の結果を 1 行出す。

### SPEC-EGOV-CLI-SYNC-009 全件の取り込みがまだなら、それを促して exit 1

同期の状態が無いとき（SPEC-EGOV-CLI-SYNC-001）は、標準エラー出力に `[sync] 差分同期` と `  DB: <DB ファイルの場所>` を出した後、`[sync] まだ全件取り込みが行われていません。先に --bulk-download-everything を実行してください` を出し、終了コード 1 で終わる。

例: `--bulk-download-everything` をしていない空の DB で `--sync` を実行すると、e-Gov へ 1 度も接続せずに上の文を出して終了コード 1。

### SPEC-EGOV-CLI-SYNC-010 上限の日数を超えていたら、全件の取り込みを促して exit 1

`last_sync_date` から今日までの日数が上限を超えているとき（SPEC-EGOV-CLI-SYNC-003）は、標準エラー出力に `[sync] last_sync_date <last_sync_date> から <日数> 日空いています。日次差分の公開範囲 (<上限> 日) を超えているので、--bulk-download-everything を実行してください` を出し、終了コード 1 で終わる。`<上限>` は `HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS` の値（既定 90）。

例: 日本時間 2026-09-19 に `last_sync_date` が `2026-05-01` の DB で実行すると `[sync] last_sync_date 2026-05-01 から 141 日空いています。日次差分の公開範囲 (90 日) を超えているので、--bulk-download-everything を実行してください` を出して終了コード 1。`HOUKI_EGOV_INCREMENTAL_LIMIT_DAYS=1` で `last_sync_date` が `2026-09-17` なら `… から 2 日空いています。日次差分の公開範囲 (1 日) を超えているので …`。

### SPEC-EGOV-CLI-SYNC-011 e-Gov に届かなければ `[ERROR]` を出して exit 1

SPEC-EGOV-CLI-SYNC-004 で e-Gov の一括ダウンロードのページ（`https://laws.e-gov.go.jp/bulkdownload/`、HEAD）に届かないときは、標準エラー出力に `[ERROR] <エラーの文>` を出して終了コード 1 で終わる。ページが 2xx 以外を返したときの文は `e-Gov に接続できません (HTTP <status> from https://laws.e-gov.go.jp/bulkdownload/)`、通信そのものが失敗したときは通信の失敗の文になる。

例: HEAD に HTTP 503 が返ると `[ERROR] e-Gov に接続できません (HTTP 503 from https://laws.e-gov.go.jp/bulkdownload/)` を出して終了コード 1。HEAD が `TypeError('fetch failed')` で失敗すると `[ERROR] fetch failed` を出して終了コード 1。どちらも差分 zip は 1 つも取得しない。

### SPEC-EGOV-CLI-SYNC-012 確認済みの日の後で止まったら、記録した日を出して exit 1

SPEC-EGOV-CLI-SYNC-007 で止まったとき、それより前に確認済みにした日が 1 日以上あれば、標準エラー出力に次の 2 行を出して終了コード 1 で終わる。

```
[ERROR] <止まった日>: <エラーの文>
  <last_sync_date> までを last_sync_date に記録しました (<確認済みの日数> 日分を確認、<upsert の件数> 件 upsert)。再実行すると続きから同期します
```

例: 日本時間 2026-09-19 に `last_sync_date` が `2026-09-16` の DB で実行し、2026-09-16 は差分なし（HTTP 500）、2026-09-17 は法令 1 件の差分、2026-09-18 は HTTP 503 のとき、`[ERROR] 2026-09-18: HTTP 503 <statusText> from https://laws.e-gov.go.jp/bulkdownload?file_section=3&update_date=20260918&only_xml_flag=true` と `  2026-09-17 までを last_sync_date に記録しました (2 日分を確認、1 件 upsert)。再実行すると続きから同期します` を出して終了コード 1。

### SPEC-EGOV-CLI-SYNC-013 最初の日で止まったら、`last_sync_date` が変わらないことを出して exit 1

SPEC-EGOV-CLI-SYNC-007 で止まったのが最初の日（確認済みの日が 0 日）のときは、標準エラー出力に `[ERROR] <止まった日>: <エラーの文>` と `  last_sync_date は <last_sync_date> のままです` を出して終了コード 1 で終わる。

例: 日本時間 2026-09-19 に `last_sync_date` が `2026-09-18` の DB で実行し、2026-09-18 の取得に HTTP 503 が返ると、`[ERROR] 2026-09-18: HTTP 503 …` と `  last_sync_date は 2026-09-18 のままです` を出して終了コード 1。

### SPEC-EGOV-CLI-SYNC-014 差分を取り込んで終わったら、件数をまとめて exit 0

すべての日を確認済みにして終わったときは、標準エラー出力に次の 2 行を出して終了コード 0 で終わる。

```
[完了] <確認した日数> 日分を確認 (<最初の日> 〜 <今日>)、<まとめ>。全体 <時間>
  last_sync_date: <last_sync_date>
```

`<まとめ>` は、次を `、` でつないだもの。

- upsert が 1 件以上なら `<取り込んだ日数> 日に差分あり: <upsert の件数> 件 upsert, <unchanged の件数> 件 unchanged`（取り込んだ日数は、差分 zip を取得して取り込んだ日の数）
- 差分なしの日があれば `<差分なしの日数> 日は差分なし`
- XML を読めず飛ばした法令があれば `<件数> 件は XML を読めず skip`

例: 日本時間 2026-09-19 に `last_sync_date` が `2026-09-17` の DB で実行し、09-17 と 09-19 は差分なし、09-18 は法令 1 件の差分のとき、`[完了] 3 日分を確認 (2026-09-17 〜 2026-09-19)、1 日に差分あり: 1 件 upsert, 0 件 unchanged、2 日は差分なし。全体 <時間>` と `  last_sync_date: 2026-09-19` を出して終了コード 0。

### SPEC-EGOV-CLI-SYNC-015 新たに取り込んだ法令が無く終わったときのまとめ

すべての日を確認済みにして終わり、upsert が 0 件のときは、SPEC-EGOV-CLI-SYNC-014 の `<まとめ>` の最初を次にする（差分なしの日数と skip の件数は 014 と同じく続ける）。終了コードは 0。

- unchanged が 1 件以上: `新たに取り込んだ法令はありません (確認した <unchanged の件数> 件はすべて取り込み済み)`
- unchanged も 0 件: `新たに取り込んだ法令はありません`

例:
- 09-18 と 09-19 がどちらも差分なし（HTTP 404）なら `[完了] 2 日分を確認 (2026-09-18 〜 2026-09-19)、新たに取り込んだ法令はありません、2 日は差分なし。全体 <時間>`
- 取り込み済みの法令 1 件だけを含む差分が 09-18 と 09-19 にあれば `[完了] 2 日分を確認 (2026-09-18 〜 2026-09-19)、新たに取り込んだ法令はありません (確認した 2 件はすべて取り込み済み)。全体 <時間>`
- 09-19 の差分が、取り込み済みの法令 1 件と壊れた XML の法令 1 件なら `[完了] 1 日分を確認 (2026-09-19 〜 2026-09-19)、新たに取り込んだ法令はありません (確認した 1 件はすべて取り込み済み)、1 件は XML を読めず skip。全体 <時間>`

### SPEC-EGOV-CLI-SYNC-016 1 日ごとの行の形

SPEC-EGOV-CLI-SYNC-008 の 1 日ごとの行は、標準エラー出力に次の形で出す。`<n>` は何日目か（1 から）、`<N>` は確かめる日の数。

- 差分なしの日: `  [<n>/<N>] <日付>: 差分なし`
- 取り込んだ日: `  [<n>/<N>] <日付>: <n> 件 upsert[, <n> 件 unchanged][, <n> 件 failed] (<zip のサイズ>, <時間>)`（`unchanged` と `failed` は 0 件なら出さない。upsert は 0 件でも出す）

止まった日の行は出さない（SPEC-EGOV-CLI-SYNC-012・013 の `[ERROR]` の行を出す）。

例: 3 日を確かめ、2 日目に法令 1 件の差分（zip 1.8 KB）があると `  [1/3] 2026-09-17: 差分なし`、`  [2/3] 2026-09-18: 1 件 upsert (1.8 KB, <時間>)`、`  [3/3] 2026-09-19: 差分なし`。取り込み済みの法令 1 件と壊れた XML の法令 1 件の日は `  [1/1] 2026-09-19: 0 件 upsert, 1 件 unchanged, 1 件 failed (2.2 KB, <時間>)`。

### SPEC-EGOV-CLI-SYNC-017 `--bulk-download-incremental` は `--sync` と同じ

最初の引数が `--bulk-download-incremental` のときも、`--sync` と同じ処理をし、同じ表示・同じ終了コードで終わる。

例: SPEC-EGOV-CLI-SYNC-014 の例と同じ DB と応答で `--bulk-download-incremental` を実行すると、同じ `[完了] 3 日分を確認 (2026-09-17 〜 2026-09-19)、…` を出して終了コード 0 で終わり、`last_sync_date` は `2026-09-19` になる。

### SPEC-EGOV-CLI-SYNC-018 `last_sync_date` が今日より後なら、何も取得せず exit 0

`last_sync_date` が今日（日本時間）より後の日付のときは、確かめる日が 0 日になり、e-Gov へ接続せず（SPEC-EGOV-CLI-SYNC-004 の確認もしない）、`last_sync_date` を変えずに、`[完了] 0 日分を確認 (<last_sync_date> 〜 <今日>)、新たに取り込んだ法令はありません。全体 <時間>` と `  last_sync_date: <last_sync_date>` を出して終了コード 0 で終わる。

例: 日本時間 2026-09-19 に `last_sync_date` が `2026-09-25` の DB で実行すると、`[完了] 0 日分を確認 (2026-09-25 〜 2026-09-19)、新たに取り込んだ法令はありません。全体 <時間>` と `  last_sync_date: 2026-09-25` を出して終了コード 0。

## できないこと

- 差分で追える日数を超えた DB を最新化すること（全件の取り込み `--bulk-download-everything` をやり直す）
- 全件の取り込みをしていない DB を差分だけで作ること
- 止まった日の続きを自動でやり直すこと（もう一度 `--sync` を実行する）

## 未決

初版起こしで見つけた、意図か不具合かを人が決める項目です。決まったら「できること」に ID を振るか、`specs/changes/` の差分にします。

意図か不具合かの判断が要る項目は houki-egov-mcp の Issue に移し、ここには題と Issue の番号だけを残します。今の振る舞いのままでよくテストが無いだけの項目は、受入テストを書いてから「できること」に ID を振ります。

1. **コマンドとしての表示と終了コード。** → SPEC-EGOV-CLI-SYNC-009・SPEC-EGOV-CLI-SYNC-010・SPEC-EGOV-CLI-SYNC-011・SPEC-EGOV-CLI-SYNC-012・SPEC-EGOV-CLI-SYNC-013・SPEC-EGOV-CLI-SYNC-014・SPEC-EGOV-CLI-SYNC-015・SPEC-EGOV-CLI-SYNC-016
   - 同期の状態が無いとき: `[sync] まだ全件取り込みが行われていません。先に --bulk-download-everything を実行してください` を出して終了コード 1
   - 上限の日数を超えたとき: `[sync] last_sync_date <日付> から <日数> 日空いています。日次差分の公開範囲 (<上限> 日) を超えているので、--bulk-download-everything を実行してください` を出して終了コード 1
   - e-Gov に届かないとき: `[ERROR] e-Gov に接続できません (HTTP <status> from https://laws.e-gov.go.jp/bulkdownload/)` などを出して終了コード 1
   - 途中で止まったとき: `[ERROR] <日付>: <エラーの文>` と、確認済みの日までを記録したこと（または `last_sync_date` が変わらないこと）を出して終了コード 1
   - 終わったとき: `[完了] <日数> 日分を確認 (<開始日> 〜 <今日>)、…` に差分のあった日数・upsert と unchanged の件数・差分なしの日数・XML を読めず飛ばした件数と所要時間を続け、`last_sync_date: <日付>` を出して終了コード 0
   - 1 日ごとの行の形: `[<n>/<N>] <日付>: <n> 件 upsert, … (<サイズ>, <時間>)`、差分なしの日は `[<n>/<N>] <日付>: 差分なし`
2. **`--bulk-download-incremental` も `--sync` と同じ。** → SPEC-EGOV-CLI-SYNC-017
3. **差分の無い日も、取得を何度も試してから「差分なし」にする。** → houki-egov-mcp #58
4. **`last_sync_date` が今日より後の日付のとき。** → SPEC-EGOV-CLI-SYNC-018
