# リリース手順

npm への公開は手元の Mac から行います。GitHub のタグとリリースもあわせて作ります。

## 初回（v0.1.0）

### 1. 公開前の確認

```bash
git status                # すべてコミット済みで、main が GitHub に push されていること
npm install               # package-lock.json を最新に
npm run test:all          # Chromium / Firefox / WebKit で全テスト
npm run docs:build        # docs/lib・docs/skills・スキルの zip を生成
npm run test:docs         # ドキュメントの全ページ
npm run release:check     # バージョン表記・パッケージの中身・import の解決・テスト
npm publish --dry-run     # 公開されるファイルの一覧を確認（src/・skills/・README.md・LICENSE・CHANGELOG.md・package.json のみ）
```

### 2. npm に公開する

```bash
npm login                 # 初回のみ。npm アカウントは 2 要素認証を有効にしておく
npm publish               # 直前に release:check が自動で実行され、問題があれば中止される
```

パッケージ名はスコープ付きの `@hidemikimura/formulit` です。スコープ付きは既定で非公開扱いになりますが、`package.json` の `publishConfig.access` を `public` にしてあるので、`--access public` を付けなくても公開されます。

2 要素認証のワンタイムパスワードを求められたら入力します（`npm publish --otp=123456` でも可）。
公開後、次の URL で確認します。

- https://www.npmjs.com/package/@hidemikimura/formulit
- https://cdn.jsdelivr.net/npm/@hidemikimura/formulit@0.1.0/src/index.js （CDN。反映まで数分かかることがあります）

### 3. タグと GitHub リリースを作る

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

GitHub CLI（`gh`）を使う場合:

```bash
gh release create v0.1.0 --title "v0.1.0" \
  --notes "$(npm run -s release:notes)" \
  docs/assets/formulit-skill.zip
```

ブラウザで作る場合は **Releases → Draft a new release** でタグ `v0.1.0` を選び、本文に `npm run -s release:notes` の出力を貼り付け、`docs/assets/formulit-skill.zip` を添付します。

### 4. 確認

- `npm view @hidemikimura/formulit` でバージョンが 0.1.0 になっている
- 別のフォルダで `npm install @hidemikimura/formulit lit` して `import '@hidemikimura/formulit'` が動く
- ドキュメントサイト（https://hidemikimura.github.io/formulit/）のヘッダーが v0.1.0 になっている

## 2 回目以降

1. `CHANGELOG.md` の先頭に新しいバージョンの項目（`## [0.1.1] - YYYY-MM-DD`）と、末尾にリンク（`[0.1.1]: https://github.com/hidemikimura/formulit/releases/tag/v0.1.1`）を書いてコミットする。
2. バージョンを上げる。`package.json`・`package-lock.json`・ドキュメントサイトの表記（`docs/assets/site.js`）が更新され、コミットとタグ（`v0.1.1`）が作られます。

   ```bash
   npm version patch        # 不具合修正（0.1.0 → 0.1.1）
   npm version minor        # 機能追加・API の変更（0.1.0 → 0.2.0。1.0.0 までは API の変更もここ）
   ```

3. `git push origin main --follow-tags` で push（ドキュメントサイトも更新されます）。
4. 上の「2. npm に公開する」「3. タグと GitHub リリースを作る」のうち、`npm publish` と `gh release create` を実行する（タグは作成済み）。

## 公開を取り消したいとき

- 公開から 72 時間以内なら `npm unpublish @hidemikimura/formulit@0.1.0` で取り消せます（同じバージョン番号は二度と使えません）。
- それ以降や、使われている可能性がある場合は `npm deprecate @hidemikimura/formulit@0.1.0 "理由"` で非推奨にし、修正版を出します。
