# formulit

Lit で使える WYSIWYG エディタのリポジトリです（素の JavaScript・ビルド不要）。

| パッケージ | 要素 | 保存形式 | |
|---|---|---|---|
| [`@hidemikimura/formulit`](packages/formulit) | `<formulit-editor>` | HTML（手書きの HTML を欠落させない） | [![npm](https://img.shields.io/npm/v/@hidemikimura/formulit)](https://www.npmjs.com/package/@hidemikimura/formulit) |
| [`@hidemikimura/formulit-markdown`](packages/formulit-markdown) | `<formulit-markdown>` | Markdown（GFM。見たまま編集） | [![npm](https://img.shields.io/npm/v/@hidemikimura/formulit-markdown)](https://www.npmjs.com/package/@hidemikimura/formulit-markdown) |

- 📘 ドキュメント（ライブデモ付き）: https://hidemikimura.github.io/formulit/
- ✍️ Markdown 版: https://hidemikimura.github.io/formulit/markdown.html
- 📝 変更履歴: [formulit](packages/formulit/CHANGELOG.md) / [formulit-markdown](packages/formulit-markdown/CHANGELOG.md)

使い方は各パッケージの README（[formulit](packages/formulit/README.md) / [formulit-markdown](packages/formulit-markdown/README.md)）を見てください。

## 開発

### 動かし方

```bash
git clone https://github.com/hidemikimura/formulit.git
cd formulit
npm install               # 2 つのパッケージをまとめてインストール（npm workspaces）
npm start                 # demo/ をブラウザで開く（index.html: formulit / markdown.html: formulit-markdown）
npm test                  # formulit のテスト（Chromium）
npm run test:markdown     # formulit-markdown のテスト（Chromium）
BROWSER=firefox npm test  # Firefox で実行（webkit も指定可）
npm run test:all          # 2 つのパッケージを Chromium / Firefox / WebKit(Safari のエンジン) で実行
npm run perf              # 大きな文書（約 300 段落）での 1 文字入力あたりの処理時間を計測
npm run docs              # ドキュメントサイトをビルドして表示
npm run test:docs         # ドキュメントの全ページとライブデモの動作確認
```

> テストで Playwright のブラウザが見つからない場合は `npx playwright install chromium firefox webkit` を実行してください。

### 構成

```
packages/
  formulit/                 @hidemikimura/formulit（<formulit-editor>）
    src/                    本体（core/: HTML の保持・履歴・インライン書式、plugins/: 各機能）
    skills/formulit/        AI 用スキル（SKILL.md + references/）
  formulit-markdown/        @hidemikimura/formulit-markdown（<formulit-markdown>）
    src/parse.js            Markdown → HTML（markdown-it、ブロックごとの原文の対応）
    src/serialize.js        HTML → Markdown
    src/editor.js           要素（FormulitEditor を継承）
demo/                       開発用デモ
docs/                       ドキュメントサイト（docs/lib・docs/skills は npm run docs:build で生成）
scripts/                    ドキュメントのビルド・リリース用スクリプト
test/                       ブラウザテスト（run.mjs: formulit、markdown.mjs: formulit-markdown、docs.mjs: ドキュメント）
```

### ドキュメントサイト

`.github/workflows/pages.yml` が、main ブランチへの push のたびにドキュメントサイトを生成して GitHub Pages に公開します（`docs/lib/`・`docs/skills/`・スキルの zip はワークフロー内で作るのでコミット不要）。公開前に `npm run test:docs` を実行し、失敗したら公開しません。

### リリース

手順は [RELEASING.md](RELEASING.md) にあります。バージョンは `npm run release -- <formulit|markdown> <patch|minor|major>` で上げ、`npm publish -w packages/<名前>` で公開します。

## ライセンス

[MIT](LICENSE) © Hidemi Kimura
