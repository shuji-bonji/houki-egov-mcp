# Houki e-Gov MCP Server

[![CI](https://github.com/shuji-bonji/houki-egov-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/shuji-bonji/houki-egov-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@shuji-bonji/houki-egov-mcp.svg)](https://www.npmjs.com/package/@shuji-bonji/houki-egov-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-brightgreen)](https://nodejs.org/)

日本の法令（憲法・法律・政令・省令・規則）を **e-Gov 法令API v2** 経由で取得する MCP サーバ。

LLM が条文をキーワード・略称・分野で検索したり、特定の条項を Markdown / JSON で取得したり、改正履歴を引いたりできるようにする。

## 提供ツール

| Tool | 用途 |
|---|---|
| `search_law` | 法令タイトルでキーワード検索（略称→正式名解決済み） |
| `get_law` | 条/項/号レベルで本文取得（Markdown / JSON / TOC） |
| `get_toc` | 目次のみ取得（トークン節約） |
| `get_law_revisions` | 改正履歴を取得（公布日・施行日・状態） |
| `search_fulltext` | 全文検索（Phase 2 まで `search_law` にフォールバック） |
| `resolve_abbreviation` | 略称→正式名解決の診断 |
| `explain_law_type` | 法令種別（憲法・法律・政令・省令・通達 等）の解説 |

略称辞書（165エントリ・6分野）は [`@shuji-bonji/houki-abbreviations`](https://github.com/shuji-bonji/houki-abbreviations) を内部で利用しています。

## インストール

### Claude Desktop で使う

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "houki-egov": {
      "command": "npx",
      "args": ["-y", "@shuji-bonji/houki-egov-mcp"]
    }
  }
}
```

### ローカル開発

```bash
git clone git@github.com:shuji-bonji/houki-egov-mcp.git
cd houki-egov-mcp
npm install
npm run build
npm test
```

```json
// 開発中の動作確認 (.mcp.json)
{
  "mcpServers": {
    "houki-egov-local": {
      "command": "node",
      "args": ["/absolute/path/to/houki-egov-mcp/dist/index.js"]
    }
  }
}
```

## 使用例

```
# LLM への問いかけ → MCP ツール呼び出し

「消費税法30条1項を見せて」
  → get_law(law_name="消法", article="30", paragraph=1)

「労働基準法の目次を取得」
  → get_toc(law_name="労基法")

「個人情報保護法の改正履歴を最新5件」
  → get_law_revisions(law_name="個情法", latest=5)

「電帳法って正式名称なに？」
  → resolve_abbreviation(abbr="電帳法")
  → 電子計算機を使用して作成する国税関係帳簿書類の保存方法等の特例に関する法律

「政令と省令の違いは？」
  → explain_law_type(name="政令")
```

## 状態

**v0.2.0 (2026-04-27)**

- [x] e-Gov 法令API v2 クライアント（`searchLaws` / `getLawData` / `getLawRevisions`）
- [x] 法令ツリー走査（条/項/号、目次抽出）+ LRU cache
- [x] 7ツール本実装
- [x] 略称辞書を [`@shuji-bonji/houki-abbreviations`](https://github.com/shuji-bonji/houki-abbreviations) ^0.1.0 に分離
- [x] 法令階層ナレッジ（憲法・法律・政令・省令・規則・条例・告示・訓令・通達・通知 の10種別）
- [x] Trusted Publisher (OIDC) で publish
- [x] テストスイート（**50 tests**）

### 計画中

- [ ] Phase 2: `search_fulltext` 本実装（bulkDL + SQLite FTS5）
- [ ] 漢数字対応（「第三十条」を 30 に変換）
- [ ] 大規模法令の応答サイズ対策（民法・会社法）
- [ ] エラーメッセージの LLM 可読化向上

## houki-hub MCP family

houki-egov-mcp は **単体で利用可能**ですが、houki-hub MCP family の一員でもあります。同じ family 内の他 MCP（計画中）と組み合わせると、通達・判例等まで横断的に扱えます。

| パッケージ | 役割 | 状態 |
|---|---|---|
| `@shuji-bonji/houki-abbreviations` | 略称辞書（共有ライブラリ） | ✅ v0.1.0 |
| **`@shuji-bonji/houki-egov-mcp`** | **e-Gov 法令API クライアント（このリポジトリ）** | ✅ v0.2.0 |
| `@shuji-bonji/houki-nta-mcp` | 国税庁通達・Q&A・タックスアンサー | 計画中 |
| `@shuji-bonji/houki-mhlw-mcp` | 厚労省通達・通知 | 計画中 |
| `@shuji-bonji/houki-court-mcp` | 判例（裁判所サイト） | 構想中 |
| `@shuji-bonji/houki-saiketsu-mcp` | 国税不服審判所裁決 | 構想中 |
| `@shuji-bonji/houki-hub` | meta-package（一括 install） | 計画中 |

family 全体の設計思想・想定利用シーン・業法との関係は [`docs/DESIGN.md`](docs/DESIGN.md) を参照。

## ドキュメント

- [`docs/LAW-HIERARCHY.md`](docs/LAW-HIERARCHY.md) — 法令種別の階層リファレンス（専門家でない利用者向け）
- [`docs/USE-CASES.md`](docs/USE-CASES.md) — プロダクト開発の典型ユースケース（電帳法・電子契約・個情法・e-KYC）
- [`docs/DESIGN.md`](docs/DESIGN.md) — 設計原則・houki-hub family のロードマップ・業法との関係
- [`DISCLAIMER.md`](DISCLAIMER.md) — 利用上の注意（業法との関係）
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — 貢献方法
- [`CHANGELOG.md`](CHANGELOG.md) — リリースノート

## 業法との関係

本MCPは **一次情報の取得・提示のみ** を担います。分析は LLM、判断は利用者（または有資格者）の責任です。**業としての法律事務・税務業務への利用は想定外**です — 詳細は [DISCLAIMER.md](DISCLAIMER.md) 参照。

## デジタル庁公式 MCP との関係

デジタル庁は 2025年12月〜2026年3月の「法令×デジタル」ハッカソンで法令API / MCP のプロトタイプを試行提供した。将来一般公開された場合は、本 MCP のコアを公式 MCP に委譲し、houki-hub family 全体は **公式が手を出さないレイヤ（通達・裁決・判例の横断インデックス、業法対応 Skill 等）** に注力する方針。

## ライセンス

MIT — 個人利用・学習用途のフォーク・改変・再配布を自由に許可します。

ただし、**業としての使用（弁護士法72条・税理士法52条・社労士法27条が定める独占業務）** については想定外であり、作者は一切の責任を負いません。[DISCLAIMER.md](DISCLAIMER.md) を必ずご確認ください。
