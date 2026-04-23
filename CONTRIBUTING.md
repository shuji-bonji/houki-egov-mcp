# Contributing

jp-houki-mcp はノンベンダーの個人 OSS MCP です。辞書・拡張パッケージ・Skill のそれぞれに貢献の経路があります。

## 3つの貢献経路

```
貢献箇所                     誰が書くか          配布方法
──────────────────────────────────────────────────────────
① 略称辞書の追加 or 修正     誰でも              PR（このリポ）
② 拡張パッケージの作成       拡張作者            独自 npm
③ Skill の作成               各利用者            各自のプロジェクト
```

## ① 略称辞書への貢献

`src/abbreviations/*.json` に、業務で使っていて辞書にない略称・通称を追加してください。

### ファイル配置

| 分野 | ファイル |
|---|---|
| 税法 | `src/abbreviations/tax.json` |
| 労働・社会保険 | `src/abbreviations/labor.json` |
| 会計 | `src/abbreviations/accounting.json` |
| 商事 | `src/abbreviations/commercial.json` |
| 民事 | `src/abbreviations/civil.json` |
| 行政・刑事・その他 | `src/abbreviations/administrative.json` |

### エントリ書式

```json
{
  "abbr": "消法",
  "formal": "消費税法",
  "law_id": "363AC0000000108",
  "law_num": "昭和六十三年法律第百八号",
  "law_type": "Act",
  "domain": "tax",
  "aliases": ["消費税"],
  "note": "通称: ○○法"
}
```

- `abbr`: **主となる略称**。実務で最も使われるもの
- `formal`: **正式名称**（必須）
- `law_id`: e-Gov の law_id。**自分で e-Gov で検証済みのもののみ**記入。不明なら `null`
- `law_num`: 「昭和六十三年法律第百八号」形式。検証済みのもののみ
- `law_type`: `Act` / `CabinetOrder` / `ImperialOrdinance` / `MinisterialOrdinance` / `Rule`
- `domain`: そのファイルのドメインと一致させる
- `aliases`: 別表記（省略形・通称・英字略）。辞書ルックアップで全部ヒットするようになります
- `note`: 通称名の補足（「通称: 景品表示法」等）

### PR の前に

- [ ] JSON の構文が壊れていない（`node -e "JSON.parse(require('fs').readFileSync('...'))"` が通る）
- [ ] `law_id` を記入した場合、e-Gov で実際にその ID で条文が取れることを確認した
- [ ] 既存エントリとの重複がない（`abbr` / `formal` / `aliases` で grep する）

## ② 拡張パッケージの作成

通達・判例・省庁監督指針などを独立した npm パッケージとして公開できます。

### 命名規則

- パッケージ名: `@あなたのscope/jp-houki-ext-{namespace}` または `jp-houki-ext-{namespace}`
- ツール名: `{namespace}_{verb}` 形式（例: `nta_get_tsutatsu`）

### 最小実装

[`examples/ext-template/`](examples/ext-template/) を参考にしてください。`src/extensions/types.ts` の `ExtensionFactory` をデフォルトエクスポートする npm パッケージを作るだけです。

### 想定される拡張

- `@jp-houki/ext-nta` — 国税庁通達
- `@jp-houki/ext-mhlw` — 厚生労働省通達
- `@jp-houki/ext-jaish` — 安全衛生情報センター
- `@jp-houki/ext-saiketsu` — 国税不服審判所 公表裁決
- `@jp-houki/ext-court` — 裁判所 判例検索
- `@jp-houki/ext-fsa` — 金融庁 監督指針
- `@jp-houki/ext-pref-{県名}` — 都道府県条例
- `@jp-houki/ext-intl-{国名}` — 日本語訳付きの他国法令

既存の実装がある場合（例: `kentaroajisaka/tax-law-mcp`）を**ラップして拡張パッケージ化**する選択肢もあります。その場合はオリジナル作者への謝辞を README に必ず記載してください。

## ③ Skill の作成

Skill は利用者が自分のプロジェクトで書くものです。jp-houki-mcp のリポには入れません。

### 参考になる Skill の例

**個人事業主・士業系**
- **e-shiwake 消費税区分判定 Skill** — 消法 4/6/7/30 + 消基通 5-1-1 / 11-1-1 / 11-2-10 を組み合わせた判定ツリー
- **社労士実務 Skill** — 36協定・割増賃金・育介法運用
- **フリーランス青色申告 Skill** — 所法 / 措法の小規模事業者特例

**プロダクト開発系**
- **EC 事業ローンチ Skill** — 特商法・景表法・割販法・消契法の必要表示チェックツリー
- **プライバシーポリシー起草 Skill** — 個人情報保護法の条文マッピング（17条・18条・27条・32条 等）
- **UGC サービスリスク Skill** — プロ責法・著作権法・名誉毀損の論点整理
- **決済サービス業法 Skill** — 資金決済法・犯収法・金商法の対象判定
- **ヘルステック薬機法 Skill** — 医療機器該当性判定・広告規制
- **API ToS 起草 Skill** — 利用規約の条項リスクアセスメント

Skill の書き方は本プロジェクトのスコープ外ですが、作ったものを他人に共有する場合は **「本MCPが返す事実情報に基づく判断ツリー」** と明示することを推奨します（利用者が判断の根拠を追えるように）。

## コーディング規約

- TypeScript 5.x / ESM / Node.js >= 20
- インポートは `.js` 拡張子を明示（TS ファイル内でも）
- `console.log` 禁止（stdio MCP プロトコル保護のため）。ログは `src/utils/logger.ts` 経由
- テストは `vitest`
- フォーマットは `prettier`

## 質問・議論

- GitHub Discussions（将来）
- Issues にドラフト相談も歓迎

## 作者のスタンス

このプロジェクトは「完璧な一枚岩」ではなく「**育てる基盤**」として運用されます。辞書・拡張・Skill の三層で、それぞれのドメインを持つ人が自分の専門を持ち寄れる設計にしています。

完璧でないエントリでも、**PR で議論して磨く**方針です。気軽に投げてください。
