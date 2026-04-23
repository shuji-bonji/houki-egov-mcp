/**
 * houki-hub-mcp Extension Template
 *
 * 通達・判例・省庁監督指針などの周辺情報ソースを
 * 独立した npm パッケージとして houki-hub-mcp に差し込むためのテンプレート。
 *
 * 使い方:
 * 1. このファイルをコピー
 * 2. namespace を自分のソース名に変更（例: 'nta', 'mhlw', 'court'）
 * 3. tools と handlers を実装
 * 4. npm publish（or ローカル開発なら npm link）
 * 5. 利用者の .mcp.json で
 *    "env": { "HOUKI_HUB_EXTENSIONS": "your-package-name" }
 */

import type { ExtensionFactory } from '@shuji-bonji/houki-hub-mcp/extensions';

const factory: ExtensionFactory = () => ({
  manifest: {
    namespace: 'template', // ← 'nta' / 'mhlw' / 'court' 等に変更
    label: 'テンプレート拡張',
    version: '0.0.1',
    source: {
      label: '情報源の名称',
      url: 'https://example.com/',
    },
  },
  tools: [
    {
      name: 'template_hello',
      description: 'テンプレート拡張の疎通確認用ツール。',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '挨拶相手の名前',
          },
        },
      },
    },
    // {
    //   name: 'template_search',
    //   description: '通達・判例をキーワードで検索する。',
    //   inputSchema: { ... },
    // },
  ],
  handlers: {
    template_hello: async (args: { name?: string }) => {
      return {
        message: `hello, ${args.name ?? 'world'} — houki-hub extension is alive`,
      };
    },
    // template_search: async (args) => {
    //   // あなたのソースからの取得・整形ロジック
    // },
  },
});

export default factory;
