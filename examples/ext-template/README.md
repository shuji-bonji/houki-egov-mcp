# jp-houki-ext-template

[jp-houki-mcp](https://github.com/shuji-bonji/jp-houki-mcp) の**拡張パッケージを新しく作るための最小テンプレート**です。

通達・判例・省庁監督指針など、e-Gov 外の法情報ソースを独立した npm パッケージとして jp-houki-mcp に差し込むことができます。

## できること

- jp-houki-mcp のコア（条文取得・略称辞書）はそのまま使い
- 自分が実装した**通達・判例・その他のソース**のツールを追加
- 利用者は環境変数 `JP_HOUKI_EXTENSIONS` でロード対象を切替

## 使い方

```bash
# 1. このテンプレをコピー
cp -r examples/ext-template ~/workspace/jp-houki-ext-myext

# 2. package.json の name / description を書き換え
# 3. src/index.ts の namespace / tools / handlers を実装
# 4. 動作確認
cd ~/workspace/jp-houki-ext-myext
npm install
npm run build
npm link

# 5. jp-houki-mcp 側から利用
# .mcp.json:
#   "env": { "JP_HOUKI_EXTENSIONS": "jp-houki-ext-myext" }
```

## ツール名の規則

- `{namespace}_{verb}` 形式にする（例: `nta_get_tsutatsu`, `court_search_case`）
- コアの `search_law` / `get_law` 等と衝突しない名前を選ぶ

## 実装指針

- **事実情報の提供に徹する**（判断を返さない）
- 出典 URL を必ず返却
- 略称対応があると便利（jp-houki-mcp コアの `resolveAbbreviation` を利用可能）
- Markdown 整形で LLM に優しく

## 想定される拡張

| namespace | 対象ソース |
|---|---|
| `nta` | 国税庁 基本通達・措置法通達 |
| `mhlw` | 厚生労働省 通達 |
| `jaish` | 安全衛生情報センター |
| `saiketsu` | 国税不服審判所 裁決事例 |
| `court` | 裁判所 判例検索 |
| `fsa` | 金融庁 監督指針 |
| `pref_{県}` | 都道府県条例 |

## 参考実装

既存の個人開発 MCP がそのまま参考になります：

- [kentaroajisaka/tax-law-mcp](https://github.com/kentaroajisaka/tax-law-mcp) — 国税庁通達・裁決の参考実装
- [kentaroajisaka/labor-law-mcp](https://github.com/kentaroajisaka/labor-law-mcp) — 厚労省・JAISH通達の参考実装

## ライセンス

MIT（テンプレート）。あなたのパッケージは自由にライセンス選択可能です。
