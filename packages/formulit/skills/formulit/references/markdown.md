# Markdown 版（formulit-markdown）

`@hidemikimura/formulit-markdown` の `<formulit-markdown>` は、見たまま編集して **value が Markdown（GFM）** になる要素。`FormulitEditor` を継承しているので、属性・プロパティ・メソッド・イベント・プラグイン・ツールバーの指定方法は `<formulit-editor>` と同じ（api.md / toolbar.md / plugins.md がそのまま当てはまる）。

## 使い分け

- 保存形式が HTML → `<formulit-editor>`（`@hidemikimura/formulit`）
- 保存形式が Markdown（README・ドキュメント・ブログ・Git 管理の文章）→ `<formulit-markdown>`
- HTML エディタの内容を Markdown に変換したいだけ → `htmlToMarkdown(html)`（エディタ不要）

## 組み込み

```bash
npm install @hidemikimura/formulit-markdown @hidemikimura/formulit lit   # formulit と lit は peerDependency
```

```js
import '@hidemikimura/formulit-markdown'; // <formulit-markdown> と <formulit-editor> が定義される
```

```html
<formulit-markdown name="body">
  <script type="text/markdown">
    # 見出し

    本文
  </script>
</formulit-markdown>
```

- 初期値は `<script type="text/markdown">`（**共通の字下げを除去して**読み込む）か `value` プロパティ（1 文字も変えない）。`<script type="text/html">` ではない。
- Lit: `html\`<formulit-markdown .value=${md} @input=${(e) => (this.md = e.target.value)}></formulit-markdown>\``
- import map で使う場合は `markdown-it` も必要: `"markdown-it": "https://cdn.jsdelivr.net/npm/markdown-it@15/dist/browser/markdown-it.esm.min.mjs"`（1 ファイル版を指定する。`dist/markdown-it.mjs` は依存を別に解決する必要がある）。

## 原文の保持

- 未編集なら読み込んだ Markdown をそのまま返す。
- 編集後も、触っていないトップレベルのブロックは原文のまま（`*` リスト、`__`、setext 見出し、参照定義、空行の数など）。編集したブロックだけ書き直す。
- 全体を書き直したいときは `preserve-source="false"`。

## 書き出し（HTML → Markdown）の注意

- Markdown で表せないもの（文字色・下線・結合セル・属性付きの要素・`target` 付きリンク・サイズ指定した画像など）は **HTML のまま** Markdown に入る。純粋な Markdown だけにしたいなら、ツールバーにその機能を入れない（既定の `MARKDOWN_TOOLBAR` は表せる機能だけ）。
- 強調の中身の端が「」などの記号だと Markdown の規則で強調にならないため、`<strong>` などの HTML で書き出す（日本語で起きやすい）。
- 隣り合う同じ種類のリストは Markdown では 1 つにつながるので、後ろのリストの記号を変える（`-` → `*`）。

## よく使う export

`FormulitMarkdown`, `MARKDOWN_TOOLBAR`, `markdownToHTML(md)`, `htmlToMarkdown(html)`, `createMarkdownIt(options)`, `parseBlocks(md)`, `nodesToMarkdown(nodes, style)`, `detectStyle(md)`。

プロパティ: `markdownOptions`（markdown-it のオプション）。属性: `plain`（既定の本文スタイルを付けない）。メソッド: `getSelectionMarkdown()`。

## ありがちな間違い

- `import '@hidemikimura/formulit-markdown'` だけで良いのに、`@hidemikimura/formulit` を別に `customElements.define` しようとする（両方とも import 時に定義済み）。
- `editable.innerHTML` を直接書き換える（`transact` を使う。原文の対応も壊れる）。
- 初期値の Markdown を `<template>` の中に HTML として書く（`<script type="text/markdown">` に文字として書く）。
