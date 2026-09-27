# AGENTS.md

エージェント（Claude Code / Cowork のセッション）がこのリポジトリで作業するときの目次です。手順の本文はここには書きません。仕様とコードを 2 本の PR で変える運用の全体は、[spec-ids の docs/operations.md](https://github.com/shuji-bonji/spec-ids/blob/main/docs/operations.md) にあります。

## 仕様の正本

- 意図の正本は `specs/current/` です。Wiki・Discussions・README・ツールの description は正本にしません。
- 変更は `specs/changes/<yyyymmdd>-<slug>/` に出し、人が承認するまで Coder を起動しません。
- 承認された差分は Spec Publisher が `specs/current/` に取り込み、差分のフォルダーを `specs/releases/<実装を出したタグ>/<yyyymmdd>-<slug>/` へ移します（`git mv`）。移すときに proposal.md の「状態」を取り込み済みにします。
- Coder は `specs/current/` の本文を書き換えません。実装から仕様へ戻したい発見は、新しい `specs/changes/` に書きます。
- 受入テストの `it` の名前には仕様 ID（例: `SPEC-EGOV-GET-LAW-001`）を含めます。`npx spec-ids check`（[@shuji-bonji/spec-ids](https://github.com/shuji-bonji/spec-ids)）が仕様とテストの ID を突き合わせ、CI（`spec-gate`）で走ります。

## 仕様 ID

- 形式は `SPEC-<領域>-<機能>-<3 桁>` です（例: `SPEC-EGOV-GET-LAW-001`）。領域 `EGOV` はこのリポジトリを表します。機能は `specs/current/<dir>/spec.md` のディレクトリ名を大文字にし、`_` を `-` にしたものです（`get_law` → `GET-LAW`）。番号は機能ごとに 001 からの通し番号です。
- ディレクトリ名は、MCP ツールならツール名そのもの（`get_law`）です。ツールでない外から見える単位は、`common_errors`（全ツールに共通するエラー応答と引数の検査）、`db_schema`（ローカル DB）、`cli_<コマンド>`（`cli_entry` / `cli_bulk_download` / `cli_sync` / `cli_status`）に置きます。spec.md の冒頭の「- 種類:」に `ツール` / `共通` / `DB` / `CLI` のどれかを書きます。
- 機能ごとに数列を分けるので、並行するブランチが衝突するのは同じ機能の仕様を同時に足したときだけです。`spec-ids check` は、見出しの ID の機能がディレクトリ名と一致することも検査します。
- 一度使った番号はその機能の中で再利用しません。仕様を外すときは `specs/changes/` の `REMOVED` に書き、テストからも ID を外します。
- 新しい ID は `npx spec-ids next specs/current/<dir>/spec.md`（またはディレクトリ名 `npx spec-ids next get_law`）で取ります。その機能の見出しの最大番号 +1 です。複数なら `--count 3`。番号の予約はしないので、同じ番号が 2 つの見出しに現れたら、マージ時に `spec-ids check` の重複検知で止まります。
- ID の形式（正規表現・機能の導き方・組み立て）は `@shuji-bonji/spec-ids` が決めています。このリポジトリで決めるのは `specs/spec-ids.json` の領域 `EGOV`、接頭辞なし、テストの glob `src/**/*.test.ts` だけです。

## PR の種類

仕様とコードを、同じリポジトリの別の資産として扱います。人が振る舞いを承認するのは仕様 PR と初版起こしだけです。実装 PR で問うのは「承認済みの文と、テストと、コードが同じか」で、振る舞いに何を許すかの判断は実装レビューへ戻しません。CI の `pr-scope`（`.github/scripts/check-pr-scope.mjs`）が、ブランチ名の接頭辞ごとに変えてよいパスを検査します。

| ブランチ | 種類 | 変えてよいもの | 変えないもの |
|---|---|---|---|
| `spec/<yyyymmdd>-<slug>` | 仕様 PR | `specs/changes/<id>/`（proposal.md と差分の spec.md） | `src/`、テスト、`specs/current/`（proposal.md が「- 実装の変更: 不要」のときだけ `specs/current/` も書いてよい） |
| `spec-init/<dir>` | 初版起こし | `specs/current/<dir>/spec.md`、テスト名に仕様 ID を足すこと | テストの期待値と本文、実装 |
| それ以外（`fix/` `feat/` `docs/` `ci/` など） | 実装 PR など | テスト、`src/`、版と CHANGELOG、`specs/current/` への取り込み（最終コミット）、`specs/changes/` から `specs/releases/<tag>/` への移動 | `specs/changes/` の書き換え（未承認の意図の追加、承認済み差分の変更） |

- 承認日は、人がマージの前にそのブランチで書きます。仕様 PR は proposal.md に「- 承認日: YYYY-MM-DD（PR #N）」、初版起こしと取り込みは `specs/current/<dir>/spec.md` に「- 承認日: YYYY-MM-DD」。日付は JST です。空欄なら `pr-scope` が止めます。
- 仕様 PR をマージした後、新しい ID が `specs/changes/` にだけある間は `spec-ids check` を通します（テストを求めるのは `specs/current/` の ID だけ）。
- `REMOVED` の差分では、テストを消すのは `specs/current/` から見出しを外す取り込みと同じコミットにします。
- main へのマージは手元の `git merge --ff-only` で行い、GitHub のマージボタンは使いません（テスト → 実装 → 取り込みのコミットの順と署名を main に残すため）。

## 役割

| 役割 | 書いてよいもの | 書いてはいけないもの |
|---|---|---|
| Spec Steward | `specs/changes/<id>/` の草案、初版起こしの `specs/current/` 草案 | 実装、テストの期待値、承認前の `specs/current/` の直接編集 |
| Test Designer | 仕様 ID 付きの受入テスト | 実装を見て期待値を足すこと、仕様本文 |
| Coder | 実装、版、CHANGELOG | `specs/current/`、テストを消して GREEN にすること |
| Spec Auditor | 食い違いの報告（ID 単位で GREEN / 意図が古い / 実装が古い / テストが古い / 判断できない） | 仕様・実装・テストのどれも |
| Spec Publisher | 承認済み差分の `specs/current/` への取り込み草案、`specs/releases/<tag>/` | 未承認の意図の追加 |

Steward と Coder と Auditor は同じ会話で起動しません。次の係には成果物のパスだけを渡し、要約して渡しません。

## 関連

- 出典: shuji-bonji/ai-design-advisor Discussion #21「仕様を担保するエージェントの導入と実践」
- family 全体の位置付け: houki-hub Issue #26 / #27
- 開発の手順とリリース手順: `CONTRIBUTING.md`
