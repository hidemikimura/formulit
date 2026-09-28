# リリース手順

このリポジトリには 2 つのパッケージがあり、それぞれ別に npm へ公開します。公開は手元の Mac から行います。

| パッケージ | フォルダ | タグ |
|---|---|---|
| `@hidemikimura/formulit` | `packages/formulit` | `v0.2.0` など（v0.1.0 からの続き） |
| `@hidemikimura/formulit-markdown` | `packages/formulit-markdown` | `formulit-markdown-v0.1.0` など |

`@hidemikimura/formulit-markdown` は `@hidemikimura/formulit` に依存しています（peerDependency）。両方を出すときは、**先に formulit を公開**してください（公開前チェックが、必要な版の formulit が npm にあるかを確かめます）。

## 手順

### 1. 変更点を書く

公開するパッケージの `CHANGELOG.md` の先頭に、新しいバージョンの項目を書きます。

```markdown
## [0.2.1] - 2026-10-01

### 修正

- …
```

末尾のリンクも足します（`[0.2.1]: https://github.com/hidemikimura/formulit/releases/tag/v0.2.1`）。書いたらコミットします。

### 2. バージョンを上げる（コミットとタグを作る）

```bash
npm run release -- formulit patch        # 0.2.0 → 0.2.1（不具合修正）
npm run release -- formulit minor        # 0.2.0 → 0.3.0（機能追加・API の変更。1.0.0 までは API の変更もここ）
npm run release -- markdown patch        # formulit-markdown
npm run release -- formulit 0.3.0        # バージョンを直接指定
```

次のことを自動で行います。

- コミットしていない変更がないか、CHANGELOG に新しいバージョンの項目があるかを確認
- `package.json`・`package-lock.json`・ドキュメントサイトの表記（`docs/assets/site.js`）を更新
- コミット（`@hidemikimura/formulit@0.2.1`）とタグ（`v0.2.1`）を作成

> npm workspaces では `npm version` がタグを作らないため、このスクリプトを使います。

### 3. push して npm に公開する

```bash
git push origin main v0.2.1            # タグ名は手順 2 の表示どおり
npm publish -w packages/formulit       # formulit-markdown なら -w packages/formulit-markdown
```

`npm publish` の直前に公開前チェック（`scripts/release-check.mjs`）が自動で実行され、問題があれば中止されます。

- package.json・package-lock.json・CHANGELOG.md・ドキュメントサイトのバージョン表記がそろっているか
- パッケージに入るファイルが想定どおりか
- src の import がパッケージ内と依存パッケージだけで解決できるか
- 依存する formulit が npm に公開済みか（formulit-markdown のみ）
- ブラウザテスト（Chromium）が通るか

単独で実行するときは `npm run release:check -w packages/formulit` です（`SKIP_TESTS=1` でテストを省略）。
2 要素認証のワンタイムパスワードを求められたら入力します（`--otp=123456` でも可）。スコープ付きパッケージですが、`publishConfig.access` を `public` にしてあるので公開されます。

### 4. GitHub リリースを作る

手順 2 の最後に表示されるコマンドを実行します。

```bash
# formulit（AI 用スキルの zip を添付。先に npm run docs:build で作っておく）
gh release create v0.2.1 --title "@hidemikimura/formulit@0.2.1" \
  --notes "$(node scripts/release-notes.mjs formulit)" docs/assets/formulit-skill.zip

# formulit-markdown
gh release create formulit-markdown-v0.1.0 --title "@hidemikimura/formulit-markdown@0.1.0" \
  --notes "$(node scripts/release-notes.mjs formulit-markdown)"
```

ブラウザで作る場合は **Releases → Draft a new release** でタグを選び、本文に `node scripts/release-notes.mjs <パッケージ>` の出力を貼り付けます。

### 5. 確認

- `npm view @hidemikimura/formulit version`（formulit-markdown も同様）
- CDN: `https://cdn.jsdelivr.net/npm/@hidemikimura/formulit@0.2.1/src/index.js`（反映まで数分かかることがあります）
- ドキュメントサイト（main への push で自動更新）のヘッダーのバージョン

## 公開前にまとめて確かめる

```bash
npm install
npm run test:all          # 2 つのパッケージを Chromium / Firefox / WebKit で
npm run docs:build && npm run test:docs
npm publish --dry-run -w packages/formulit
```

## 公開を取り消したいとき

- 公開から 72 時間以内なら `npm unpublish @hidemikimura/formulit@0.2.1` で取り消せます（同じバージョン番号は二度と使えません）。
- それ以降や、使われている可能性がある場合は `npm deprecate @hidemikimura/formulit@0.2.1 "理由"` で非推奨にし、修正版を出します。
