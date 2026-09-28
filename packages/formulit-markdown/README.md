# formulit-markdown

[![npm](https://img.shields.io/npm/v/@hidemikimura/formulit-markdown)](https://www.npmjs.com/package/@hidemikimura/formulit-markdown)
[![license](https://img.shields.io/npm/l/@hidemikimura/formulit-markdown)](LICENSE)

Typora のように**見たまま編集して、Markdown（GFM）で保存する** WYSIWYG エディタ `<formulit-markdown>` です。
[formulit](https://www.npmjs.com/package/@hidemikimura/formulit) のツールバー・プラグイン・入力補助をそのまま使い、`value` だけが Markdown になります。

- 📘 ドキュメント（ライブデモ付き）: https://hidemikimura.github.io/formulit/markdown.html
- 📝 変更履歴: [CHANGELOG.md](CHANGELOG.md)

## 特長

- **編集していない部分は原文のまま**：未編集なら読み込んだ Markdown を 1 文字も変えずに返します。編集後も、触っていないブロック（段落・リスト・表など）は原文の書き方（`*` と `-`、`__` と `**`、setext 見出し、参照リンク、空行の数）をそのまま保ち、編集したブロックだけを書き直します。
- **GFM に対応**：表（配置つき）・取り消し線・ToDo リスト（クリックで完了）・URL の自動リンク。
- **Markdown で表せない内容は HTML のまま**：文字色・下線・結合セル・属性つきの要素・独自要素などは、Markdown の中に HTML として残ります（GitHub などでもそのまま表示されます）。読み込んだ生の HTML も欠落させません。
- **Markdown を書くように入力**：行頭の `# ` `- ` `1. ` `> ` `[] ` ```` ``` ````、`**太字**` `*斜体*` `` `コード` `` `~~取消~~` が、その場で見た目に変わります。
- **貼り付けとコピー**：Markdown の文字を貼り付けると書式付きで入り、コピーした文字（text/plain）は Markdown になります。
- **ソース表示は Markdown**：「&lt;/&gt;」で Markdown の原文を直接編集できます。
- formulit の機能：元に戻す・検索と置換・文字数・自動保存・全画面・差し込み変数・フォーム連携（`name` で送信）など。

## インストール

```bash
npm install @hidemikimura/formulit-markdown @hidemikimura/formulit lit
```

`@hidemikimura/formulit` と `lit` 3 は peerDependency です。Markdown の解析には [markdown-it](https://github.com/markdown-it/markdown-it) を使います（dependency として自動で入ります）。

## 使い方

```html
<script type="module">
  import '@hidemikimura/formulit-markdown'; // <formulit-markdown>（と <formulit-editor>）が定義される
</script>

<form>
  <formulit-markdown name="body" placeholder="本文を入力…">
    <script type="text/markdown">
      # 見出し

      本文です。**太字**や [リンク](https://example.com) が使えます。
    </script>
  </formulit-markdown>
</form>
```

- 初期値は `<script type="text/markdown">` に書きます（共通の字下げは取り除かれます）。`value` プロパティ・`value` 属性でも渡せます。
- 値は `editor.value`（Markdown の文字列）。変更のたびに `input` イベントが発生します。
- Lit のテンプレートでは `.value=${markdown}` と `@input=${(e) => (this.body = e.target.value)}`。

ビルドなし（import map）で使う場合は、`lit` 一式・`markdown-it`・formulit を解決します:

```html
<script type="importmap">
{ "imports": {
  "lit": "https://cdn.jsdelivr.net/npm/lit@3/index.js",
  "lit/": "https://cdn.jsdelivr.net/npm/lit@3/",
  "lit-html": "https://cdn.jsdelivr.net/npm/lit-html@3/lit-html.js",
  "lit-html/": "https://cdn.jsdelivr.net/npm/lit-html@3/",
  "lit-element/": "https://cdn.jsdelivr.net/npm/lit-element@4/",
  "@lit/reactive-element": "https://cdn.jsdelivr.net/npm/@lit/reactive-element@2/reactive-element.js",
  "@lit/reactive-element/": "https://cdn.jsdelivr.net/npm/@lit/reactive-element@2/",
  "markdown-it": "https://cdn.jsdelivr.net/npm/markdown-it@15/dist/browser/markdown-it.esm.min.mjs",
  "@hidemikimura/formulit": "https://cdn.jsdelivr.net/npm/@hidemikimura/formulit@0.2/src/index.js",
  "@hidemikimura/formulit-markdown": "https://cdn.jsdelivr.net/npm/@hidemikimura/formulit-markdown@0.1/src/index.js"
} }
</script>
```

## 設定

`<formulit-editor>` の属性・プロパティ（`toolbar`・`plugins`・`placeholder`・`readonly`・`word-count`・`autosave`・`variables` など）はすべて使えます。追加・変更点:

| 名前 | 説明 |
|---|---|
| `value` | Markdown（GFM）の文字列 |
| `toolbar` | 省略時は `MARKDOWN_TOOLBAR`（Markdown で表せる機能だけ） |
| `preserve-source` | 既定 `true`（触っていないブロックは原文のまま）。`"false"` にすると毎回全体を書き直す |
| `markdownOptions` | markdown-it のオプション（例: `{ linkify: false }`） |
| `plain` 属性 | 本文の既定の見た目（引用の線・コードの背景・表の罫線など）を付けない |

ツールバーに `fontColor` などを加えることもできます。その書式は HTML として Markdown に残ります。

## 関数

```js
import { markdownToHTML, htmlToMarkdown } from '@hidemikimura/formulit-markdown';

markdownToHTML('# 見出し');            // '<h1>見出し</h1>\n'
htmlToMarkdown('<p><b>太字</b></p>');  // '**太字**'（表せない要素は HTML のまま）
```

| export | 説明 |
|---|---|
| `FormulitMarkdown` | 要素のクラス（`FormulitEditor` を継承） |
| `MARKDOWN_TOOLBAR` | 既定のツールバー |
| `markdownToHTML(md)` / `htmlToMarkdown(html)` | 変換（エディタなしでも使える） |
| `createMarkdownIt(options)` | formulit-markdown と同じ設定の markdown-it |
| `parseBlocks(md)` | ブロックごとの HTML と原文の対応 |
| `nodesToMarkdown(nodes, style)` / `detectStyle(md)` | DOM ノードの書き出し / 原文の書き方（記号）の推定 |

## 書き出しの規則

| 内容 | Markdown |
|---|---|
| 見出し | `# 見出し`（ATX 形式） |
| 太字・斜体・取り消し線 | `**太字**` `*斜体*` `~~取消~~`（端が「」などの記号のときは Markdown では効かないため `<strong>` などの HTML） |
| 箇条書き・番号付き | 原文のリストはその記号（`-` `*` `+` / `.` `)`）、新しいリストは文書で多く使われている記号 |
| ToDo | `- [ ] 項目` / `- [x] 完了` |
| コード | フェンス（原文で `~~~` が多ければ `~~~`）＋ 言語名 |
| 表 | GFM の表（配置つき）。結合セル・セル内の段落・属性付きの表は HTML |
| 画像 | `![代替テキスト](URL)`。キャプション・配置・サイズ付きは HTML |
| リンク | `[文字](URL "タイトル")`、URL だけのものはそのまま。`target` などの属性付きは HTML |
| 改行（Shift+Enter） | 行末の `\` |
| それ以外 | HTML のまま（中の文字は Markdown で書く） |

隣り合う 2 つのリストは Markdown では 1 つにつながってしまうため、後ろのリストの記号を変えて別のリストとして書き出します。

## ライセンス

[MIT](LICENSE) © Hidemi Kimura
