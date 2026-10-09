---
approved: 2026-10-04
pr: 114
implementation: required
targets: [cli_bulk_download, cli_entry, cli_status, cli_sync, common_errors, db_schema, search_fulltext]
---
# 変更: ローカル DB の場所を、応答・起動時のログ・`--status` で確かめられるようにする（egov #108・#110、T6）

- 対象: `search_fulltext` / `db_schema` / `cli_status` / `cli_sync` / `cli_bulk_download` / `cli_entry` / `common_errors` の `specs/current/<dir>/spec.md`
- 実装の変更の補足: 下の「実装の変更」
- 状態: 取り込み済み（v0.20.0）
- 起こした日: 2026-10-04（JST）
- 起こした役: Spec Steward
- 対象 Issue: houki-egov-mcp #108（`api-fallback` の `note` と案内のコマンドが、DB が無い・別のファイルを開いているを区別せず、そのままでは動かないことがある。2026-10-04 の追記: 応答と起動時のログにも DB のパスを出す）、#110（開いている DB の場所と、同じフォルダーに残っている別の版の DB を確かめる手段が `--status` の 1 行しかない）
- 規則の正本: houki-hub `docs/DECISIONS.md` の 2026-10-04 の行「T6 ローカル DB の場所の見え方」の (a)〜(e)。(f)（既定のファイル名に版を入れない）は #111 で扱い、この差分では db_schema の「できないこと」に 1 行書くだけにする
- 決定の出典: houki-hub `docs/notes/2026-10-04-plan-stage6-and-followups.md` の 2.2、4 章の段階 3、5.1 の「応答にパスを足す」「`note`・`hint` の文を変える」「CLI の出力を変える」の行、8.2 の Q4。材料は `docs/notes/2026-10-04-handoff-egov-db-path.md`
- 前提: main の `3ca848e`（v0.19.1）から切った。2026-10-04 14:50 JST に `git ls-remote https://github.com/shuji-bonji/houki-egov-mcp.git refs/heads/main` で origin の main と同じことを確かめた。`specs/changes/` にほかの差分は無い
- 版: 0.20.0（minor。応答の `note` と `freshness` の形、CLI の出力の行が変わる）。DB のスキーマの版は 3 のまま、`INGEST_VERSION` も変えない
- 後に続く作業: houki-nta-mcp 0.25.0 の仕様 PR（指示 U）は、この差分の承認の後に、下の「houki-nta-mcp に写すとき」の表を写して書く

## なぜ変えるか

2026-10-04 JST に、shuji の環境で plugin（`env` を持たない）と手元のサーバー houki-egov-dev（`HOUKI_EGOV_DB_PATH` 付き）が別の DB を開いていた。どちらも `source: "bulk"` を返している間は、応答からどのファイルの結果かが分からなかった。`laws.v3.db` を `laws.db` に名前を変えた後は、houki-egov-dev の `note` が `bulk DL 未実行のため` で始まり、DB は作ってあるのに文が事実と違い、探したファイルも分からなかった（#108 の 1）。

案内のコマンド `houki-egov-mcp --bulk-download-everything` は、グローバルにインストールしていないと `command not found` になり、`npx houki-egov-mcp` は npm に無い名前なので 404 になる。`HOUKI_EGOV_DB_PATH` を付けて起動したサーバーの案内に従って変数を付けずに実行すると、別のファイル（既定の `laws.db`）に DB を作ってしまう（#108 の 2）。

`--status` は開いた 1 つのファイルの `DB:` の行しか出さず、同じフォルダーに別の版の DB が残っていることに気付けなかった（#110）。

## 今の動き（v0.19.1）

- `search_fulltext` の `source: "bulk"` の応答の `freshness` は、同期の鮮度の 4 つ（と `warning`）だけを持ち、DB のパスを持たない。同期の記録が無い DB では `freshness: null`。`source: "api-fallback"` の応答には `freshness` のキーが無い（`src/tools/handlers.ts` の `SearchFulltextFallbackResponse`）
- `api-fallback` の `note` の先頭は、DB の状態ごとに `bulk DL 未実行のため`（ファイルが無い・版の記録が無い・条が 0 件）、`bulk DB を開けなかったため`、`bulk DB の版 (<n>) が…古いため` / `…新しいため`、`bulk DB の版を読めないため (schema_version: <値>)` の 5 通り（`fallbackReason`）。読めない版の文だけが DB のパスを含む
- 案内のコマンドは、`next_actions[0].example.command`、`note`（`BUILD_DB_REMEDY` など）、`freshness.warning`、`INTERNAL_ERROR` の `hint`、CLI の `[ERROR]`・`[WARN]`・`(DB がまだありません — …)` の行のどれも `houki-egov-mcp --<フラグ>` の形
- DB を開けないとき（パスがフォルダーなど）も `note` と `next_actions` で `--bulk-download-everything` を案内するが、`--bulk-download-everything` もその DB では取得の前に止まる（SPEC-EGOV-CLI-BULK-DOWNLOAD-029）
- MCP サーバーの起動時のログは `[server] <パッケージ名> v<版> started` の 1 行で、DB のパスを出さない（`src/index.ts`）
- `--status` の 2 行目は `  DB: <パス>`（`HOUKI_EGOV_DB_PATH` の値はそのまま）。どの設定でその場所に決まったかと、同じフォルダーのほかのファイルは出さない

## 変えた後の動き

1. **`freshness` は常にオブジェクトで、`db_path` を持つ（a。SEARCH-FULLTEXT-042・043、023・035 を MODIFIED）。** `source: "bulk"` では引いた DB のパスを、ホームディレクトリの部分を `~` に置き換えて入れる。同期の記録が無い DB でも `freshness` を `null` にせず、鮮度の 4 つを `null` にする。`source: "api-fallback"` にも `freshness` を置き、5 つとも `null` にする
2. **`api-fallback` の `note` に開こうとしたパスを入れ、先頭を事実に合う文にする（b。SEARCH-FULLTEXT-044、002・027・039・040 を MODIFIED）。** 場面ごとの文の表を 044 に 1 つ置く。`HOUKI_EGOV_DB_PATH` が指すファイルが無いときは文を分ける。開けないときは `--bulk-download-everything` を案内しない
3. **案内のコマンドを `npx -y @shuji-bonji/houki-egov-mcp@latest <フラグ>` にし、環境変数で DB の場所を決めたときは同じ変数を前に付ける（c。DB-SCHEMA-028・029、025・CLI の 8 つの ID・COMMON-ERRORS-031 を MODIFIED）。** 前に付けるパスは、ホームディレクトリの下なら `"$HOME/…"` と書く（MCP の応答に利用者名を出さない。bash と sh でそのまま動くことを確かめた。zsh は publish の前に確かめる）
4. **MCP サーバーの起動時のログに、DB の絶対パスと DB の場所の設定を出す（d。CLI-ENTRY-012）。** `[server] … started` の次の行に `[server] DB: <絶対パス>（DB の場所の設定: <HOUKI_EGOV_DB_PATH / XDG_CACHE_HOME / 既定>）`
5. **`--status` に「DB の場所の設定」の行と、同じフォルダーの別の `laws*.db` の `[WARN]` を足す（e。CLI-STATUS-013・014、005・006・009・010・011 を MODIFIED）。** 既存の行の形と終了コードは変えない。1・2 行目の位置も変えない

## 変わる仕様 ID

| 種類     | 仕様 ID                                                                                                                                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADDED    | SPEC-EGOV-SEARCH-FULLTEXT-042・043・044、SPEC-EGOV-DB-SCHEMA-028・029、SPEC-EGOV-CLI-STATUS-013・014、SPEC-EGOV-CLI-ENTRY-012                                                                                                      |
| MODIFIED | SPEC-EGOV-SEARCH-FULLTEXT-002・023・027・035・039・040、SPEC-EGOV-CLI-STATUS-004・005・006・009・010・011・012、SPEC-EGOV-CLI-SYNC-019・021、SPEC-EGOV-CLI-BULK-DOWNLOAD-030、SPEC-EGOV-DB-SCHEMA-025、SPEC-EGOV-COMMON-ERRORS-031 |
| REMOVED  | なし                                                                                                                                                                                                                               |

ADDED 8、MODIFIED 18、REMOVED 0。触る dir は `search_fulltext`・`db_schema`・`cli_status`・`cli_sync`・`cli_bulk_download`・`cli_entry`・`common_errors` の 7 つ。ID は 2026-10-04 JST に `npx spec-ids next <dir>` で取った。

DECISIONS.md の a〜e との対応:

| 規則                | この差分の答え                                                                                                                  | 仕様 ID                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| a 応答のパス        | `freshness.db_path` を常に置く。DB を引いていないときは `null`。ホームを `~` に置き換える。CLI の出力と起動時のログは絶対パス   | SEARCH-FULLTEXT-042・043、023・035                                                                                                                           |
| b DB が無いときの文 | 先頭を `ローカル DB (<パス>) …ため` の形に揃え、場面を 7 行の表にする。`HOUKI_EGOV_DB_PATH` が指すファイルが無いときは別の文    | SEARCH-FULLTEXT-044、002・027・039・040                                                                                                                      |
| c 案内のコマンド    | `npx -y @shuji-bonji/houki-egov-mcp@latest <フラグ>`。`HOUKI_EGOV_DB_PATH`・`XDG_CACHE_HOME` で決めたときは同じ変数を前に付ける | DB-SCHEMA-028・029、025、SEARCH-FULLTEXT-002・023・035・044、CLI-STATUS-004・009・010・011・012、CLI-SYNC-019・021、CLI-BULK-DOWNLOAD-030、COMMON-ERRORS-031 |
| d 起動時のログ      | `[server] DB: <絶対パス>（DB の場所の設定: <名前>）`。cli_entry に置く                                                          | CLI-ENTRY-012                                                                                                                                                |
| e 確かめる手段      | `--status` の 3 行目に「DB の場所の設定」、その次に同じフォルダーの別の `laws*.db` の `[WARN]`                                  | CLI-STATUS-013・014、005・006・009・010・011                                                                                                                 |

Issue の「決めること」との対応:

| Issue の決めること                                             | この差分の答え                                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| #108 の 1（`note` にパスを入れるか、先頭の文を変えるか）       | 入れる。先頭の文を変える（044）                                                                                |
| #108 の 2（`HOUKI_EGOV_DB_PATH` のときに文を分けるか）         | 分ける（044 の 2 行目）                                                                                        |
| #108 の 3（`example.command` と各文のコマンドの形）            | 案 A（DB-SCHEMA-029）                                                                                          |
| #108 の 4（CLI のエラーの文もそろえるか）                      | そろえる。ただしフラグだけを書いた文は変えない（029 の「この形にしない」箇所。人が判断すること 7）             |
| #108 の 5（版）                                                | 0.20.0（minor）                                                                                                |
| #108 の追記（`freshness.db_path`、ホームの `~`、起動時のログ） | 043・042、CLI-ENTRY-012                                                                                        |
| #110 の 1（コマンドの名前）                                    | 既存の `--status` に足す（DECISIONS.md の (e)）                                                                |
| #110 の 2（一覧に出すファイルの範囲）                          | `laws` で始まり `.db` で終わる普通のファイル。`-wal`・`-shm` は出さない（CLI-STATUS-014。人が判断すること 14） |
| #110 の 3（退避したファイルも警告の対象にするか）              | する（014。人が判断すること 14）                                                                               |
| #110 の 4（houki-nta-mcp と同じ形にするか）                    | 同じ形にする。下の「houki-nta-mcp に写すとき」                                                                 |

## 変わらない振る舞い

- 応答のフィールドを消す・名前を変える変更は無い（T4）。`code` も変えない。足すのは `freshness.db_path` と、`api-fallback` の応答の `freshness` のキー
- `search_fulltext` が DB を引くか `search_law` に切り替えるかの判定（DB の状態の 7 通り）、`fallback` の中身、`next_actions[1]` の `search_law`（SPEC-EGOV-SEARCH-FULLTEXT-028・029）
- `freshness` の鮮度の 4 つの値の計算と、`warning` を付ける条件（`outdated` のときだけ）
- DB の場所の決まり方（SPEC-EGOV-DB-SCHEMA-012〜014）。既定のファイル名は `laws.db` のまま（T6 の (f)）
- CLI の終了コード、`--status` の 1・2 行目と `  laws:` 以降の行の形、`--sync`・`--bulk-download-*` の経過の行（` DB:` の行を含む）
- CLI の行の中でフラグだけを書いている文（`--bulk-download-everything を実行してください`・`--sync を実行してください` など。SPEC-EGOV-CLI-STATUS-001・007、SPEC-EGOV-CLI-SYNC-009・010）
- `--help` の使い方（`houki-egov-mcp <フラグ>` の形のまま。npx の形は既に注記にある）
- ほかの 13 ツールの応答。DB を使うのは `search_fulltext` だけ
- SPEC-EGOV-SEARCH-FULLTEXT-036 は変えない。Issue #108 は「関係する場所」に 036 を挙げたが、036 の本文には `note` の文も案内のコマンドも無く、040 の切り替えを参照しているだけ

## 互換性（0.20.0 の CHANGELOG の「互換性」の節に書くもの）

| 場面                                         | 0.19.x                                                                                                            | 0.20.0                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `search_fulltext` が DB を引いたとき         | `freshness` に `db_path` が無い                                                                                   | `freshness.db_path` に DB のパス（ホームは `~`）                                                                                                                                                                                                                                                                                                       |
| 同期の記録が無い DB を引いたとき             | `freshness: null`                                                                                                 | `freshness` はオブジェクトで、鮮度の 4 つが `null`、`db_path` は DB のパス                                                                                                                                                                                                                                                                             |
| `source: "api-fallback"`                     | `freshness` のキーが無い                                                                                          | `freshness` の 5 つのキーがすべて `null`                                                                                                                                                                                                                                                                                                               |
| `api-fallback` の `note` の先頭              | `bulk DL 未実行のため` / `bulk DB を開けなかったため` / `bulk DB の版 (<n>) が…` / `bulk DB の版を読めないため …` | `ローカル DB (<パス>) が無いため` / `HOUKI_EGOV_DB_PATH が指すファイル (<パス>) が無いため` / `ローカル DB (<パス>) にまだ法令が取り込まれていないため` / `ローカル DB (<パス>) を開けなかったため` / `ローカル DB (<パス>) の版 (<n>) が…` / `ローカル DB (<パス>) の版を読めないため …`。`note` の先頭で原因を見分けているスクリプトは直す必要がある |
| DB を開けないときの `next_actions`           | 1 件目 `bulk_download_everything`、2 件目 `search_law`                                                            | `search_law` の 1 件だけ                                                                                                                                                                                                                                                                                                                               |
| 案内のコマンド（応答と CLI の出力）          | `houki-egov-mcp --<フラグ>`                                                                                       | `npx -y @shuji-bonji/houki-egov-mcp@latest --<フラグ>`。`HOUKI_EGOV_DB_PATH` / `XDG_CACHE_HOME` で起動したときは `HOUKI_EGOV_DB_PATH="$HOME/…" npx -y …` のように前に付く                                                                                                                                                                              |
| MCP サーバーの起動時のログ（標準エラー出力） | `[server] … started` の 1 行                                                                                      | 次の行に `[server] DB: <絶対パス>（DB の場所の設定: <名前>）`                                                                                                                                                                                                                                                                                          |
| `--status` の標準出力                        | 2 行目の次が `  laws:` の行                                                                                       | 3 行目に `  DB の場所の設定: …`。同じフォルダーに別の `laws*.db` があれば、その次に `[WARN] 同じフォルダーに、…` の行。`  laws:` 以降の行は 1〜2 行ずれる。終了コードは変わらない                                                                                                                                                                      |

houki-research-skill で `api-fallback` と案内のコマンドを書いている箇所（2026-10-04 15:00 JST に `skills/houki-research-skill` を grep し直した。main `7e07f03`）:

| ファイル・行                                   | 書いていること                                                                                                                                                  | 0.20.0 で古くなるか                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `SKILL.md` 120 行目                            | `search_fulltext` はローカル DB（`houki-egov-mcp --bulk-download-everything` で構築）を引く。版が合わないときなどは `api-fallback`、`note` の文が場面ごとに違う | コマンドの形だけ古くなる。`note` の先頭は引用していない                                    |
| `SKILL.md` 339〜340 行目                       | 前提条件（bulk DL `--bulk-download-everything` が済んでいること）                                                                                               | フラグだけなので古くならない                                                               |
| `workflows/tax-research.md` 129 行目           | `api-fallback` の扱いと「つまり `houki-egov-mcp --bulk-download-everything` での作り直し」                                                                      | コマンドの形が古くなる                                                                     |
| `workflows/feasibility-check.md` 85・271 行目  | `api-fallback` なら「法令名の一致で探した」と書き、`note` の案内を伝える                                                                                        | 古くならない（文もコマンドも引用していない）                                               |
| `examples/invoice-registration.md` 38〜39 行目 | 実測のコメント（v0.15.1、v0.19.0 以上の版 2 の DB）                                                                                                             | 古くならない（版を書いた実測の記録）                                                       |
| `docs/ERROR-HANDLING.md` 168 行目              | houki-egov-mcp の `INTERNAL_ERROR` の `hint` は `houki-egov-mcp --bulk-download-everything`                                                                     | コマンドの形が古くなる                                                                     |
| `docs/ERROR-HANDLING.md` 77 行目               | houki-nta-mcp の DB が無いときの `hint` と DB のパスの例                                                                                                        | nta 0.25.0 で見直す（egov の変更では古くならない）                                         |
| `docs/ARCHITECTURE.md` 111 行目                | 応答契約の表の `freshness` の行（`staleness` + `oldest_fetched_at`、houki-nta-mcp で必須）                                                                      | 古くはならないが、egov の `freshness.db_path` が表に無い。足すかは段階 3 の作業 7 で決める |

## 呼び出し例への影響

houki-hub の段階 3 の作業 6（`docs/<作業日>-examples-db-location`）で、publish の後に取り直すもの。

- `scripts/reference-examples/houki-egov/ja/search_fulltext.md` の「民法で不法行為に関係する条は」の応答の `freshness` に `"db_path": "~/.cache/houki-egov-mcp/laws.db"` が入る（plugin で流したとき。houki-egov-dev で流すと、その `HOUKI_EGOV_DB_PATH` のパスになるので、plugin で流す）。鮮度の 4 つの値は取り直した日の値になる
- 同じファイルの冒頭の注意（`houki-egov-mcp --bulk-download-everything` で DB を作っていないと…）のコマンドを `npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything` にする
- 同じファイルに `api-fallback` の例は無い。足すかは段階 3 の作業 6 で決める
- `site/docs/reference/mcp/houki-egov.md` は tools/list から作るので、tools/list の `description` を変えたとき（人が判断すること 15）だけ作り直す

## houki-nta-mcp に写すとき

houki-nta-mcp 0.25.0 の仕様 PR（指示 U）は、次の表の文と規則を、`HOUKI_EGOV_DB_PATH` → `HOUKI_NTA_DB_PATH`、`houki-egov-mcp` → `houki-nta-mcp`、`note` → `hint` に置き換えて写す。

規則:

| 規則                    | egov の文・形                                                                                                                                                                                                | egov の仕様 ID      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| DB の場所の設定の名前   | `HOUKI_EGOV_DB_PATH` / `XDG_CACHE_HOME` / `既定`。空文字は無いものとして扱う                                                                                                                                 | DB-SCHEMA-028       |
| DB の絶対パス           | 相対パスは処理を始めた作業フォルダーから絶対パスにする。CLI の ` DB:` の行は環境変数の値のまま                                                                                                               | DB-SCHEMA-028       |
| 応答のパス              | ホームディレクトリと同じなら `~`、後ろに `/` が続けば前の部分を `~`。区切りの位置で比べ、ホームが空文字か `/` なら置き換えない                                                                               | SEARCH-FULLTEXT-042 |
| `freshness.db_path`     | 常にキーを置く。DB を引いていないときは `null`                                                                                                                                                               | SEARCH-FULLTEXT-043 |
| 案内のコマンド          | `[<変数>=<シェルに書くパス> ]npx -y @shuji-bonji/houki-egov-mcp@latest <フラグ>`。ホームの下は `"$HOME/<残り>"`（`"` `$` `` ` `` `\` `!` を含めば `"$HOME"'/<残り>'`）、外は `'<絶対パス>'`                  | DB-SCHEMA-029       |
| 起動時のログ            | `[server] DB: <絶対パス>（DB の場所の設定: <名前>）`。`… started` の次の行。DB を開かない                                                                                                                    | CLI-ENTRY-012       |
| `--status` の 3 行目    | `  DB の場所の設定: <名前>`。環境変数のときは `（MCP クライアントから起動したサーバーは、シェルの環境変数を受け継がないことがあります）` を付ける                                                            | CLI-STATUS-013      |
| 同じフォルダーの別の DB | `[WARN] 同じフォルダーに、この DB のほかに laws*.db のファイルがあります: <名前> (<大きさ>, <最終更新>)…。MCP サーバーと CLI が別のファイルを開いていないか確かめてください`。開かない、終了コードを変えない | CLI-STATUS-014      |

DB が無いときの文（egov の `note` の `<先頭>`）:

| 場面                                        | egov の `<先頭>`                                                                 | egov の仕様 ID      |
| ------------------------------------------- | -------------------------------------------------------------------------------- | ------------------- |
| ファイルが無い（`既定` / `XDG_CACHE_HOME`） | `ローカル DB (<パス>) が無いため`                                                | SEARCH-FULLTEXT-044 |
| ファイルが無い（`HOUKI_EGOV_DB_PATH`）      | `HOUKI_EGOV_DB_PATH が指すファイル (<パス>) が無いため`                          | SEARCH-FULLTEXT-044 |
| 版の記録が無い・中身が 0 件                 | `ローカル DB (<パス>) にまだ法令が取り込まれていないため`                        | SEARCH-FULLTEXT-044 |
| 版が古い                                    | `ローカル DB (<パス>) の版 (<DB の版>) がこの houki-egov-mcp (3) より古いため`   | SEARCH-FULLTEXT-044 |
| 版が新しい                                  | `ローカル DB (<パス>) の版 (<DB の版>) がこの houki-egov-mcp (3) より新しいため` | SEARCH-FULLTEXT-044 |
| 版を読めない                                | `ローカル DB (<パス>) の版を読めないため (schema_version: <値>)`                 | SEARCH-FULLTEXT-044 |
| 開けない                                    | `ローカル DB (<パス>) を開けなかったため`。DB を作るコマンドを案内しない         | SEARCH-FULLTEXT-044 |

写せない点（nta で決め直すこと）:

1. **`--db-path`。** nta の CLI には `--db-path`（CLI だけ）がある。DB の場所の設定の名前に `--db-path` を足し、優先の順（`--db-path` → `HOUKI_NTA_DB_PATH` → `XDG_CACHE_HOME` → 既定）を書く。案内のコマンドの前に付けるのは環境変数の形か、`--db-path=<パス>` をフラグの後に付ける形かを決める（MCP サーバーは `--db-path` を受け取らないので、MCP の応答では起こらない）
2. **既定のファイル名は `cache.db`。** 同じフォルダーの別の DB は `cache*.db` を探すか、`*.db` を探すかを決める（egov の `laws*.db` は、README の例のファイル名 `laws.v3.db`・`laws.dev.db`・`laws.v2.bak.db` がどれも当てはまることから決めた）
3. **`--status` が無い。** nta には `cli_status` の spec.md を ADDED で新しく置く。egov の `--status` の行のうち、`  laws:`・`  articles:`・`  sync:` の行は nta では種別ごとの件数と取得日時の範囲の行になる。DB が無くても終了コード 0、DB を作らず移行もしない（DECISIONS.md 2026-10-04 の nta 0.24.0 の (2)「どの入口でも移行する」との関係は nta の仕様 PR で決める）
4. **`hint` は既にパスを含む。** nta の「DB に 1 件も無い」ときの `hint` は DB のパスを含んでいる（houki-research-skill `docs/ERROR-HANDLING.md` 77 行目の例 `(DB: …/cache.db)`）。`~` への置き換えと先頭の文・コマンドの形を揃える
5. **`freshness` を付けない場面がある。** nta の検索 6 ツールは、範囲に文書が 1 件も無いと `freshness` を付けない（SPEC-NTA-SEARCH-RULES-017）。egov の 043 のように「常にオブジェクト」にするか、`freshness` が無い場面では `db_path` を出さないかを決める
6. **案内のフラグが種別ごと。** nta のコマンドは `--bulk-download-qa` などの種別ごとのフラグで、`freshness.warning` はフラグだけを書いている（SPEC-NTA-SEARCH-RULES-017）。フラグだけの文を変えない egov の扱い（人が判断すること 7）に合わせるかを決める
7. **DB を作るツールがある。** nta の `nta_get_tsutatsu`・`nta_get_qa`・`nta_get_tax_answer` は DB が無ければ作る（DECISIONS.md 2026-10-04 の nta 0.24.0 の (1)）。「ファイルが無い」場面の文が出るのは DB だけを引くツールと検索のツールになる

## 実装 PR で直す文書

動きを変えない文書で、仕様 ID を作らないもの。

| #   | 場所                                                                                                                                                                   | 直すこと                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | README「`search_fulltext` が `api-fallback` になるとき」の表（316〜319 行目）と、その下の段落（321 行目「`bulk DL 未実行のため` の文は、(a) と (b) を区別しません…」） | 表の 1 列目を SPEC-EGOV-SEARCH-FULLTEXT-044 の 7 つの `<先頭>` にする。`HOUKI_EGOV_DB_PATH が指すファイル … が無いため` の行の直し方は「`HOUKI_EGOV_DB_PATH` を直すか、そのパスに作る」。区別しない旨の段落は消し、`note` のパスと `--status` の 3 行目で確かめる手順にする |
| 2   | README 198 行目「`search_fulltext` の応答の `next_actions` と `--help` の使い方には `houki-egov-mcp --bulk-download-everything` の形で出ます…」                        | 応答と CLI の案内は npx の形（環境変数で起動したときは変数付き）になったこと、`--help` の使い方だけは `houki-egov-mcp <フラグ>` の形であることに直す                                                                                                                        |
| 3   | README 332 行目（「別のファイルで作った DB を `laws.db` に移す」の 6）の「`bulk DL 未実行のため` を返します」                                                          | `HOUKI_EGOV_DB_PATH が指すファイル (…) が無いため` に直す                                                                                                                                                                                                                   |
| 4   | README の `--status` の説明                                                                                                                                            | 3 行目の「DB の場所の設定」と、同じフォルダーの別の `laws*.db` の `[WARN]` を足す。MCP サーバーの起動時のログ（`[server] DB: …`）で plugin が開いているファイルを確かめられることも書く                                                                                     |
| 5   | CHANGELOG 0.20.0                                                                                                                                                       | 上の「互換性」の表。`Changed` に #108・#110。#111（ファイル名に版を入れない）は DECISIONS.md の決定で閉じることを 1 行                                                                                                                                                      |
| 6   | CONTRIBUTING.md「ローカル DB を使う開発」                                                                                                                              | 「2 行目の「DB:」が laws.dev.db であることを確かめる」の後に「3 行目が `HOUKI_EGOV_DB_PATH` であること」を足す（2 行目の位置は変わらないので、今の文は正しいまま）                                                                                                          |
| 7   | houki-hub `site/docs/guide/local-database.md` 88 行目（`note` が `bulk DL 未実行のため` で始まる、の説明）と `site/docs/mcp/houki-egov.md` の 151 行目からの節         | 新しい `note` の先頭と、`--status` の 3 行目・起動時のログで確かめる手順にする。houki-hub のブランチで行い、計画書 9 章に main に入ったかを書く（計画書 5.4）                                                                                                               |
| 8   | houki-research-skill（段階 3 の作業 7）                                                                                                                                | 上の「互換性」の Skill の表の箇所。Skill の文は `note` の先頭を引用していないので、文の差し替えはコマンドの形だけ                                                                                                                                                           |

## 実装の変更

- `src/db/index.ts`: DB の場所を決める関数を、パスだけでなく DB の場所の設定（`HOUKI_EGOV_DB_PATH` / `XDG_CACHE_HOME` / `既定`）と絶対パス（`path.resolve`）も返す形にする（例: `resolveDbLocation(): { path: string; absolutePath: string; setting: 'HOUKI_EGOV_DB_PATH' | 'XDG_CACHE_HOME' | '既定' }`）。`defaultDbPath()` はそのまま残し、中で使う。`dbStateErrorMessage` の古い版・読めない版の文のコマンドを 029 の形にする
- パスの書き方の関数を 2 つ足す: 応答用（042。`os.homedir()` との前方一致を区切りの位置で比べて `~` にする）、シェル用（029。`"$HOME/…"` / `"$HOME"'/…'` / `'…'`）。案内のコマンドを組み立てる関数（フラグを受け取り、設定に応じて変数を前に付ける）を 1 か所に置き、MCP と CLI の両方で使う
- `src/tools/handlers.ts`: `fallbackReason` が DB の場所の設定とパスを受け取り、044 の表の文を返す。`missing` を設定で 2 つに分け、`no-version` と条 0 件を「まだ法令が取り込まれていない」にする。`error` は `suggestBulkDownload: false` にする。`next_actions[0].example.command` と `syncDateError` の `hint` を 029 の形にする。`SearchFulltextFallbackResponse` に `freshness` を足す
- `src/services/freshness.ts`: `FreshnessInfo` に `db_path: string | null` を足し、鮮度の 4 つを `string | null` / `number | null` / `StalenessLevel | null` にする（同期の記録が無いとき）。`buildWarning` の既定の `bulkDownloadHint` を、029 の `--sync` のコマンドを使う形にする（呼び出し側から渡すか、関数の中で組み立てる）。`summarizeFreshness` が `null` を返していた場面は、呼び出し側で鮮度を `null` にしたオブジェクトにする（`--status` は今までどおり「同期の状態が無い」として扱う）
- `src/index.ts`: `logger.info('server', … started)` の次に ``logger.info('server', `DB: ${absolutePath}（DB の場所の設定: ${setting}）`)``
- `src/cli/index.ts`: `runStatus` で 2 行目の次に 013 の行、その次に 014 の `[WARN]`（`readdirSync` と `statSync`。フォルダーが無い・読めないときは何もしない）。`(DB がまだありません — …)`・`[ERROR] DB がまだありません。…`・`[ERROR] 同期の記録を読めません: …`・`overdueWarning` の文のコマンドを 029 の形にする。大きさは既存の `formatBytes` を使う
- `src/tools/definitions.ts` の `search_fulltext` の `description`（人が判断すること 15 の答えによる）
- 既存のテストで、案内のコマンドの文字列・`note` の先頭・`freshness: null` を確かめているもの（`src/tools/handlers.test.ts`、`src/spec-tests/20261001-t2-error-codes/internal_errors.test.ts`、`src/spec-tests/20261003-db-cli/{cli_sync,cli_status,db_schema,cli_bulk_download,search_fulltext}.test.ts`、`src/spec-tests/untested-20260928/search_fulltext.test.ts`、`src/test-helpers/redistributed-revisions-cli.ts` など）は、MODIFIED の ID の期待値に合わせて Test Designer が直す

## publish の前の確認

計画書 5.2 の契約の確認（変えたツールの例を流す）に加えて、shuji の Mac で次を確かめる。

1. 受入テスト（ADDED 8・MODIFIED 18）が `npm test` で通り、`npm run check` が通る
2. 作業コピーで `npm run build` し、環境変数を付けずに `node dist/index.js --status` を実行して、3 行目が `  DB の場所の設定: 既定` であること、`~/.cache/houki-egov-mcp/` に `laws.db` 以外の `laws*.db` があれば `[WARN]` が出ることを確かめる
3. `HOUKI_EGOV_DB_PATH=~/.cache/houki-egov-mcp/laws.none.db node dist/index.js --status` で、3 行目が `HOUKI_EGOV_DB_PATH（…）`、`(DB がまだありません — HOUKI_EGOV_DB_PATH="$HOME/.cache/houki-egov-mcp/laws.none.db" npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything で作ります)`、`laws.db` を挙げた `[WARN]` が出て、終了コード 0 で `laws.none.db` ができないことを確かめる
4. 3 の `(DB がまだありません — …)` の中のコマンドを zsh にそのまま貼って、`--status`（`--bulk-download-everything` の代わり）に変えて実行し、` DB:` の行が `/Users/bonji/.cache/houki-egov-mcp/laws.none.db` になることを確かめる（`"$HOME/…"` の形が zsh で動くことの確認。下の「確かめていない点」1）
5. houki-egov-dev（`HOUKI_EGOV_DB_PATH` 付き）を build した 0.20.0 に向けて起動し、Claude Desktop のログ（`~/Library/Logs/Claude/mcp-server-houki-egov-dev.log`。場所は確かめていない）に `[server] DB: …（DB の場所の設定: HOUKI_EGOV_DB_PATH）` が出ることと、`search_fulltext` の `freshness.db_path` が `~/…` の形であることを確かめる
6. 結果を実装 PR の本文に書く

## 取り込みのとき（Publisher）

- ADDED の見出しを、各 `specs/current/<dir>/spec.md` の「できること」の末尾に足す。MODIFIED は見出しの行（題）も含めて、差分の見出しと本文に置き換える
- 各差分の spec.md の冒頭に書いた、ID の無い節の変更（「関連する Issue」、「入力」の表、「処理の流れ」の図、「アクター」、db_schema の「できないこと」の 1 行）を行う
- 各 `specs/current/<dir>/spec.md` の承認日の行に「差分 `20261004-db-location` は YYYY-MM-DD（PR #N）」を足す
- この差分のフォルダーを `specs/releases/v0.20.0/20261004-db-location/` へ移し（`git mv`）、この proposal.md の「状態」を取り込み済みにする
- CHANGELOG の 0.20.0 に閉じる Issue（#108・#110）を書く。`Closes #108`・`Closes #110` は実装 PR の本文に書く
- 計画書 9 章の段階 3 の行に「済（日付・PR 番号・コミット）」を書く

## 人が判断すること

1. **`freshness` を常にオブジェクトにする（043）。** DECISIONS.md の (a)「`db_path` を常に置く（DB を使っていないときは `null`）」を、次の 2 つの場面にどう当てはめるかの判断が要る。(i) `source: "bulk"` で同期の記録が無い DB（取り込みを途中で止めた DB など。今は `freshness: null`）、(ii) `source: "api-fallback"`（今は `freshness` のキーが無い）。案は (A) 両方とも `freshness` をオブジェクトにし、値の無いキーを `null` にする / (B) (i) は `freshness: null` のまま（`db_path` は出ない）、(ii) は `freshness: null` を足す / (C) (i)・(ii) とも今のまま（`db_path` は `freshness` がオブジェクトのときだけ）。A は T4 の「値が無いフィールドは `null`、型を一定にする」に合い、`db_path` が要る場面（取り込みが途中の DB）で出せる。代わりに、`freshness === null` で「同期の記録が無い」を見分けていた利用者は `freshness.last_sync_date === null` に直す必要がある（Skill と hub の例は `freshness: null` を引用していない。2026-10-04 に grep）。SPEC-EGOV-SEARCH-FULLTEXT-035 のテスト（`freshness` が `null`）は MODIFIED に合わせて直す。**勧める: A**
2. **`~` の置き換えの細かい規則（042）。** ホームディレクトリは `os.homedir()`、区切りの位置で比べる、ホームが空文字か `/` なら置き換えない、大文字・小文字を区別する、シンボリックリンクをたどらない。Windows（区切りが `\`）では確かめていない。houki-egov-mcp が Windows で動くことを前提にしていないなら、この規則のまま（`\` の区切りでは置き換えが起きないだけで、絶対パスが出る）。**勧める: このまま**
3. **相対パスの `HOUKI_EGOV_DB_PATH`（028）。** MCP の応答・起動時のログ・案内のコマンドは、処理を始めた作業フォルダーから絶対パスにしたものを使い、`--status` の 2 行目は今までどおり値のまま出す。案内のコマンドに相対パスをそのまま入れると、別のフォルダーで実行したときに別のファイルを作る。2 行目を絶対パスに変えると「既存の行の形を変えない」に当たる。**勧める: このまま**
4. **案内のコマンドの前に付けるパスの書き方（029）。** 案は (A) ホームの下は `"$HOME/<残り>"`、外は `'<絶対パス>'` / (B) ホームの下は `~/<残り>`（引用符なし。空白などは `~/'a b'/c` のように残りだけ引用する） / (C) 絶対パスを `'…'` で囲む。A と B は MCP の応答に利用者名を出さない（DECISIONS.md の (a) の目的）。A は bash・dash で確かめ（下の「確かめた値」）、zsh・fish でも変数の展開は同じ規則のはず（確かめていない）。B も bash・dash では `X=~/a` の形で展開されることを確かめたが、fish では行頭以外の `~` を展開しない見込み（確かめていない）。C は利用者名が出る。A は (a) の「ホームを `~` に置き換える」と字面が違う（`~` ではなく `$HOME`）が、目的（利用者名を出さない）は同じで、コマンドとしてそのまま動く形を優先した。**勧める: A**
5. **`XDG_CACHE_HOME` で DB の場所を決めたときに前に付けるもの（029）。** 案は (A) `XDG_CACHE_HOME=<値>` を付ける / (B) どの設定でも `HOUKI_EGOV_DB_PATH=<DB の絶対パス>` を付ける / (C) 何も付けない。DECISIONS.md の (c) は「環境変数で DB を決めて起動したときは、同じ変数を前に付けた形」で、`XDG_CACHE_HOME` も DB を決める環境変数に当たる。#110 の「まだ起きていないが、起きうること」（`.zshrc` の `XDG_CACHE_HOME` を plugin が受け継がない）も、A なら同じ場所に作れる。B は 1 つの変数で済むが、(c) の「同じ変数」と違う。**勧める: A**
6. **CLI の出力にも同じ形（変数付き）を使う（029）。** CLI はシェルの環境変数で動くので、`export` した人には変数は要らない。ただ、`HOUKI_EGOV_DB_PATH=… npx … --status` のように 1 回だけ付けて実行した人が、案内をそのまま実行すると別のファイルに作る（handoff の 3 の場面）。付けても `export` した人に害は無い。**勧める: CLI も同じ形**
7. **フラグだけを書いた文は変えない（029）。** `--status` の `  sync:     (まだ bulk DL されていません — --bulk-download-everything を実行)`（001）と `  差分を取り込むには --sync を実行してください`（007）、`--sync` の `先に --bulk-download-everything を実行してください`（SYNC-009）と上限超えの文（SYNC-010）、`freshness.warning` の括弧の中の `--bulk-download-everything`。CLI の文は、利用者がそのとき実行した方法で同じプログラムを動かせば足りる。変えると行の形が変わる行が増える。**勧める: 変えない**
8. **`note` の先頭の形（044）。** 7 つの場面の先頭を `ローカル DB (<パス>) …ため` に揃えた（版の行も `bulk DB の版` から `ローカル DB (<パス>) の版` に変える）。DECISIONS.md の例は「ローカル DB（`<パス>`）がありません」だが、`note` は「<先頭>、search_law (…) にフォールバックしています。<続き>」の 1 文なので、`…ため` の形を保った。括弧は `note` の既存の書き方（`search_law (法令名のタイトル一致)`）に合わせて半角にした。「bulk DB」という語は `next_actions[0].reason` と `freshness.warning` に残る（文を変える範囲を案内のコマンドと先頭に絞った）。**勧める: このまま**
9. **版の記録が無い DB と、条が 0 件の DB を 1 つの行にする（044）。** どちらも「ファイルはある」ので「無い」は事実に合わない。0 バイトのファイルも、取り込みの前に止めた版 3 の DB も、`--bulk-download-everything` で直る点が同じなので、`まだ法令が取り込まれていないため` にまとめた。houki-egov-mcp でない SQLite のファイルを `HOUKI_EGOV_DB_PATH` に指定したときもこの文になる（版の記録が無いため）。**勧める: まとめる**
10. **開けない DB では `--bulk-download-everything` を案内しない（044・027）。** v0.19.x は `note` と `next_actions[0]` で案内しているが、`--bulk-download-everything` もその DB では `[ERROR] DB を開けません` で止まる（SPEC-EGOV-CLI-BULK-DOWNLOAD-029）。`next_actions` の要素が 1 つ減るが、フィールドは消えない（T4 に当たらない）。案内の文は README の表の「`HOUKI_EGOV_DB_PATH` の値を直します」に合わせた。案は (A) 案内しない / (B) 今のまま（先頭にパスを入れるだけ）。**勧める: A**
11. **`XDG_CACHE_HOME` で決めた場所のファイルが無いときは、既定と同じ文（044）。** DECISIONS.md の (b) が文を分けるのは `HOUKI_*_DB_PATH` のときだけ。`XDG_CACHE_HOME` のときは `<パス>` が `$XDG_CACHE_HOME/houki-egov-mcp/laws.db` になるので、パスで見分けられる。**勧める: 分けない**
12. **起動時のログを cli_entry に置く（CLI-ENTRY-012）。** 起動時の標準エラー出力の行は、`… started`（006）と不正な数値の環境変数の警告（011）が cli_entry にある。db_schema に置く案は、DB の場所の規則（012〜014・028）の近くに置ける。ログの位置は `… started` の次の行にし、DB を開かない（起動の後に CLI で DB を作っても `search_fulltext` は使えるので、起動時の有無を出すと古い情報になる）。**勧める: cli_entry、`… started` の次、DB を開かない**
13. **`--status` の 3 行目の文と位置（CLI-STATUS-013）。** 2 行目の位置を変えないため 3 行目に入れた（CONTRIBUTING.md が「2 行目の「DB:」」と書いている）。`  laws:` 以降の行は 1 行ずれるが、形は変えない。環境変数で決めたときの括弧の注意は #110 の「足したいこと」1 の 3 つ目から入れた。案は (A) このまま / (B) 注意を付けない / (C) 新しい行を件数と同期の欄の後（最後）に置く（行がずれないが、DB が無い・開けないときに出す位置が場合ごとに変わる）。**勧める: A**
14. **同じフォルダーの別の DB の `[WARN]` の範囲（CLI-STATUS-014。#110 の決めること 2・3）。** 範囲は (A) `laws` で始まり `.db` で終わる普通のファイル（`-wal`・`-shm` とフォルダーは数えない） / (B) `.db` で終わるファイルすべて / (C) A に `-wal`・`-shm` も含める。退避したファイル（`laws.v2.bak.db`）は (i) 数える / (ii) 名前に `.bak` を含むものは除く。A を勧めるのは、README の手順と例のファイル名（`laws.v3.db`・`laws.dev.db`・`laws.v2.bak.db`、0.19.1 の確認手順の `laws.0191check.db`）がどれも当てはまり、既定の添付ファイルの保存先 `files/` は外れるため。B は `HOUKI_EGOV_DB_PATH` で `~/data/` のようなほかの用途のフォルダーを指したときに関係の無いファイルを挙げる。C の `-wal`・`-shm` は DB 本体の付属で、本体と一緒に出しても判断は変わらない。(i) を勧めるのは、README の手順が退避したファイルを「確かめた後に消してかまいません」と書いており、7.6 GB のファイルを残したことに気付けるため（終了コードは変えないので、残したい人にも害は無い）。見つけたファイルは開かない（版を読まない）: 版を読むには各ファイルを SQLite で開くので、WAL の DB では `-shm` を作ることがあり、「`--status` は書き込まない」に当たるおそれがある。#110 は版の表示を挙げていたが、名前・大きさ・最終更新だけにした。DB が無い・開けないときも出す（2026-10-04 の場面はまさに「開いたファイルが無いが、同じフォルダーに別の DB がある」だった）。**勧める: A・(i)・開かない・どの場合も出す**
15. **tools/list の `search_fulltext` の `description` の `houki-egov-mcp --bulk-download-everything` で構築した bulk DB を引きます。** 案内ではなくツールの説明だが、LLM が利用者にそのまま伝えることがある。案は (A) `npx -y @shuji-bonji/houki-egov-mcp@latest --bulk-download-everything` に変える（変数は付けない。tools/list は起動ごとに変わらない文にする） / (B) 変えない。A は houki-hub の `site/docs/reference/mcp/houki-egov.md` の作り直しが要る。この差分は `description` に仕様 ID を置いていないので、A でも ID は増えない。**勧める: A**
16. **SPEC-EGOV-SEARCH-FULLTEXT-002・027 の例を `{ keyword: "" }` から `{ keyword: "消費税法" }` に変えた。** 0.16.0 の SPEC-EGOV-SEARCH-FULLTEXT-034 から、空の `keyword` は MCP 経由では DB も e-Gov も引かずに `INVALID_ARGUMENT` を返すので、v0.19.1 の 002・027 の例（`fallback.code: "INVALID_ARGUMENT"`）は MCP 経由の呼び出しでは起きない（ハンドラーを直接呼ぶテストでは起きる）。MODIFIED にするので例も直した。**勧める: このまま**
17. **承認日。** この proposal.md の「- 承認日:」に日付と PR 番号を書く（shuji がマージの前に）

## 確かめた値

| 何を                                     | 結果                                                                                                                                                                                                                                                                                                 | いつ・どうやって                                                                                                                                                                            | 使った仕様 ID                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 起点                                     | main `3ca848e`（v0.19.1）、origin の main と同じ。`specs/changes/` は空                                                                                                                                                                                                                              | 2026-10-04 14:50 JST、`git ls-remote https://github.com/shuji-bonji/houki-egov-mcp.git refs/heads/main`                                                                                     | —                                      |
| DB のパスの決め方                        | `HOUKI_EGOV_DB_PATH`（空文字は無いものとして扱う。値は `resolve` しない）→ `XDG_CACHE_HOME`（空文字は無いもの）→ `~/.cache`。後の 2 つは `resolve(cacheRoot, 'houki-egov-mcp', 'laws.db')`                                                                                                           | `src/db/index.ts` の `defaultDbPath`、`src/config.ts` の `BULK_CONFIG.dbPath` を読んだ                                                                                                      | DB-SCHEMA-028                          |
| `note` の組み立て                        | `${why}、search_law (法令名のタイトル一致) にフォールバックしています。${remedy}`。`why` は 5 通り、`missing`・`no-version`・条 0 件は同じ `bulk DL 未実行のため`。`error` も `suggestBulkDownload: true`                                                                                            | `src/tools/handlers.ts` の `fallbackReason`・`searchFulltextFallback`・`handleSearchFulltext` を読んだ                                                                                      | SEARCH-FULLTEXT-044                    |
| `api-fallback` の応答のキー              | `keyword`・`source`・`note`・`next_actions`・`fallback`（`freshness` は無い）                                                                                                                                                                                                                        | `SearchFulltextFallbackResponse` を読んだ                                                                                                                                                   | SEARCH-FULLTEXT-043                    |
| `freshness` が `null` になる条件         | `sync_state` に `id = 1` の行が無いとき                                                                                                                                                                                                                                                              | `src/services/freshness.ts` の `summarizeFreshness` を読んだ                                                                                                                                | SEARCH-FULLTEXT-023・043               |
| `houki-egov-mcp --` の形の案内が出る箇所 | `handlers.ts` 5 か所（`syncDateError`、`BUILD_DB_REMEDY`、古い版の `remedy`、読めない版の `remedy`、`example.command`）、`freshness.ts` 1 か所、`cli/index.ts` 4 か所（298・485・504・534 行目）、`db/index.ts` 2 か所（191・195 行目）、`definitions.ts` の `description` 1 か所、`--help` の使い方 | 2026-10-04 JST に `grep -rn "houki-egov-mcp --" src`（テストを除く）                                                                                                                        | DB-SCHEMA-029                          |
| specs/current の中の `houki-egov-mcp --` | cli_bulk_download 2・cli_entry 6・cli_status 8・cli_sync 3・common_errors 1・db_schema 2・search_fulltext 7 か所。cli_entry の 6 か所は実行例（入力）、cli_bulk_download・cli_sync・cli_status の「アクター」はコマンドの名前で、案内ではない                                                        | 2026-10-04 JST に `grep -c` と `grep -n`                                                                                                                                                    | MODIFIED の範囲                        |
| 起動時のログ                             | `serveStdio` の後に `logger.info('server', '<name> v<version> started')`。`logger.info` は `console.error` に `[server] …`                                                                                                                                                                           | `src/index.ts`、`src/utils/logger.ts` を読んだ                                                                                                                                              | CLI-ENTRY-012                          |
| `--status` の行                          | 1 行目 `[status] …`、2 行目 `  DB: <defaultDbPath() の値>`、版が同じなら `  laws:`・`  articles:`・同期の欄。DB が無いときは 3 行目に `  (DB がまだありません — houki-egov-mcp --bulk-download-everything で作ります)`                                                                               | `src/cli/index.ts` の `runStatus` を読んだ                                                                                                                                                  | CLI-STATUS-005・010・013               |
| 既定の添付ファイルの保存先               | `${XDG_CACHE_HOME:-~/.cache}/houki-egov-mcp/files`（DB と同じフォルダーの下のフォルダー）                                                                                                                                                                                                            | `--help` の `HOUKI_EGOV_FILES_DIR` の行を読んだ                                                                                                                                             | CLI-STATUS-014                         |
| README の例のファイル名                  | `laws.v3.db`・`laws.v2.bak.db`（「別のファイルで作った DB を `laws.db` に移す」）、`laws.dev.db`（CONTRIBUTING.md）、`laws.0191check.db`（0.19.1 の proposal.md の確認手順）                                                                                                                         | README・CONTRIBUTING.md・`specs/releases/v0.19.1/…/proposal.md` を読んだ                                                                                                                    | CLI-STATUS-014                         |
| シェルに書くパスの展開                   | `X="$HOME/.cache/houki-egov-mcp/laws.dev.db"`、`X="$HOME"'/it'\''s $x.db'`、`X="$HOME"'/dev$1/laws.db'`、`X=~/a/b.db`、`X=~/"a b"/c`、`X=~/'a b'/c` を `env` の前に置くと、どれも `HOME` を展開した値になった（`HOME` に空白を含めても同じ）                                                         | 2026-10-04 15:00 JST、Cowork の VM の bash 5.1.16 と dash（`/bin/sh`）                                                                                                                      | DB-SCHEMA-029                          |
| `npx spec-ids next`                      | search_fulltext 042、cli_status 013、db_schema 028、cli_entry 012（ほかの 3 つは ADDED が無い）                                                                                                                                                                                                      | 2026-10-04 JST、`npx --no-install spec-ids next <dir>`                                                                                                                                      | 変わる仕様 ID                          |
| houki-research-skill の該当箇所          | 「互換性」の Skill の表。`bulk DL 未実行` を引用している箇所は無い                                                                                                                                                                                                                                   | 2026-10-04 15:00 JST、`skills/houki-research-skill`（main `7e07f03`）で `grep -rn "api-fallback\|bulk DL 未実行\|bulk-download-everything\|houki-egov-mcp --\|db_path"`（CHANGELOG を除く） | 互換性                                 |
| houki-hub の該当箇所                     | `scripts/reference-examples/houki-egov/ja/search_fulltext.md`（冒頭の注意のコマンド、`freshness`）、`site/docs/guide/local-database.md` 88 行目、`site/docs/mcp/houki-egov.md` 151 行目からの節                                                                                                      | 2026-10-04 JST に grep                                                                                                                                                                      | 呼び出し例への影響、実装 PR で直す文書 |

## 確かめていない点

1. `"$HOME/…"` と `"$HOME"'/…'` の形が zsh（macOS の既定のシェル）と fish でそのまま動くこと。VM に zsh・fish が無く、bash と dash でだけ確かめた。publish の前の確認 4 で zsh を確かめる
2. Windows（cmd・PowerShell）。`VAR=値 コマンド` の形はどちらでも動かない。houki-egov-mcp を Windows で使う利用者がいるかは確かめていない
3. Claude Desktop が MCP サーバーを起動するときの作業フォルダー（相対パスの `HOUKI_EGOV_DB_PATH` がどこを指すか）
4. Claude Desktop の MCP サーバーのログの場所（publish の前の確認 5）
5. `os.homedir()` と環境変数 `HOME` が食い違う環境（`HOME` を消して起動した MCP サーバーなど）での `~` の置き換え
6. 実際の DB の大きさを `formatBytes` で表示した値（例は 2,048 バイトの作ったファイルで書いた。2026-10-04 の `laws.v3.db` は「5.0 GB」と記録されているが、何で測った値かは確かめていない）
7. `--status` を読んでいるスクリプトが利用者の手元にあるか（行がずれる影響）。houki-hub の `scripts/` に `--status` の出力を読むものは無い（`check-example-versions.mjs` は例のファイルの版を照合する）が、利用者の手元は分からない

## この差分の外で見つけたこと

- houki-hub `scripts/reference-examples/houki-egov/ja/search_fulltext.md` の最後の行「`freshness.staleness` が `fresh` 以外なら、`--bulk-download-everything` の再実行を検討してください」は、README の「日々の更新は `--sync`」と食い違う（`stale` なら `--sync`、最終同期から 90 日を超えたときだけ `--bulk-download-everything`）。段階 3 の作業 6 で例を取り直すときに直すとよい
- houki-research-skill `docs/ARCHITECTURE.md` 111 行目の応答契約の表は、`freshness` を houki-nta-mcp のフィールド（`oldest_fetched_at`）だけで書いている。egov の `freshness`（`last_sync_date` など、0.20.0 から `db_path`）が載っていない
- Issue #108 の「関係する場所」に SPEC-EGOV-SEARCH-FULLTEXT-036 が入っているが、036 は `note` の文も案内のコマンドも持たない（上の「変わらない振る舞い」）
