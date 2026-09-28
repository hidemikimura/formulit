# formulit

[![npm](https://img.shields.io/npm/v/@hidemikimura/formulit)](https://www.npmjs.com/package/@hidemikimura/formulit)
[![license](https://img.shields.io/npm/l/@hidemikimura/formulit)](LICENSE)

Lit で使える WYSIWYG エディタ `<formulit-editor>`（素の JavaScript・ビルド不要）。
CKEditor・Trumbowyg を参考に、**手書きの HTML を欠落させないこと**を最優先に設計しています。

- 📘 ドキュメント（ライブデモ付き）: https://hidemikimura.github.io/formulit/
- 🧪 プレイグラウンド: https://hidemikimura.github.io/formulit/playground.html
- 📝 変更履歴: [CHANGELOG.md](CHANGELOG.md)
- ✍️ Markdown で保存したい場合は [@hidemikimura/formulit-markdown](https://www.npmjs.com/package/@hidemikimura/formulit-markdown)（`<formulit-markdown>`）

## インストール

```bash
npm install @hidemikimura/formulit lit
```

`lit` 3 が必要です（peerDependency）。ES モジュールのまま配布しているので、Vite などのバンドラーでも、ビルドなしの import map でも使えます。

## 使い方

```html
<script type="module">
  import '@hidemikimura/formulit';            // <formulit-editor> が定義される
</script>

<form>
  <formulit-editor name="body" placeholder="本文を入力…">
    <template>
      <div class="note" data-type="info"><p>初期値の HTML</p></div>
    </template>
  </formulit-editor>
</form>
```

初期値の渡し方は 3 通りあります。

| 方法 | 原文の保持 |
|---|---|
| `<script type="text/html">…</script>` を子に置く | **1 文字も変えずに**読み込む（`</script>` は `<\/script>` と書く） |
| `value` プロパティに文字列を設定（サーバーから受け取った HTML、Lit の `.value=${…}` など） | 1 文字も変えずに読み込む。ページに付ける前に設定してもよく、その場合は子要素の初期値より優先 |
| `<template>…</template>` を子に置く / `value` 属性 | ブラウザが一度パースするため、引用符・大文字・文字参照などの書き方は整形される（内容は保持） |

Lit のテンプレートから使う場合:

```js
html`<formulit-editor .value=${this.body} @input=${(e) => (this.body = e.target.value)}></formulit-editor>`
```

ビルドなしで CDN から使う場合は import map で `lit` 一式を解決します（`lit@3/+esm` の 1 ファイルだけでは、formulit が使う `lit/directives/…` が別コピーになるため）:

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
  "@hidemikimura/formulit": "https://cdn.jsdelivr.net/npm/@hidemikimura/formulit@0.1/src/index.js"
} }
</script>
```

### 属性・プロパティ

| 名前 | 説明 |
|---|---|
| `value` | HTML 文字列（取得・設定） |
| `name` | フォーム送信時の名前（Form-associated Custom Element なので `<form>` にそのまま入る） |
| `toolbar` | ツールバー項目。属性なら空白区切り（`"bold italic \| link"`）、プロパティなら配列（グループも指定可、下記） |
| `plugins` | 有効にするプラグイン名（省略時は登録済みすべて） |
| `sanitize` | `"strip"`（既定：script / on* / javascript: を除去） / `"none"`（除去しない。編集中だけ無効化） |
| `protect` | 編集中に `contenteditable=false` で丸ごと保護する要素の CSS セレクタ |
| `placeholder` | 空のときの表示 |
| `preserve-source` | 編集後も未変更部分を原文のまま返す（既定 `true`。`preserve-source="false"` で無効） |
| `readonly` | 読み取り専用 |
| `word-count` | ステータスバーに文字数（空白を除く文字数）と単語数を表示 |
| `max-chars` | 文字数の上限。「123 / 2,000 文字」の形で表示し、超えると赤字 |
| `autosave-delay` | 自動保存までの待ち時間（ミリ秒、既定 2000） |
| `autoformat` | Markdown 風の入力変換（既定 `true`。`autoformat="false"` で無効） |
| `fullscreen` | 全画面表示（`toggleFullscreen()` でも切替） |

書式まわりの設定（JS プロパティで配列を渡す。省略時は既定値）:

| プロパティ | 形式 | 例 |
|---|---|---|
| `fontFamilies` | `[{ value, label }]` | `{ value: 'Georgia, serif', label: 'Georgia' }`（`value: ''` は「指定なし」） |
| `fontSizes` | `[{ value, label }]` | `{ value: '18px', label: '18px' }` |
| `lineHeights` | `[{ value, label }]` | `{ value: '1.75', label: '1.75' }` |
| `colors` | `[{ color, label }]` | `{ color: '#e64c4c', label: '赤' }`（文字色・背景色のパレット） |
| `formatStyles` | `[{ name, element, classes }]` | `{ name: 'リード文', element: 'p', classes: ['lead'] }`（CKEditor の「スタイル」。未設定ならボタン非表示） |
| `imageUploader` | `async (file) => url` | 画像のアップロード先。未設定なら data URL（Base64）で埋め込む |
| `imageStyles` | `[{ name, label, style?, classes? }]` | 画像の配置。`name` は `inline` / `alignLeft` / `alignCenter` / `alignRight`。既定は figure の style（float・margin）。クラス方式にする例: `{ name: 'alignLeft', label: '左寄せ', classes: ['image-style-align-left'] }` |
| `codeBlockLanguages` | `[{ value, label }]` | コードブロックの言語。`<code class="language-{value}">` になる |
| `mediaProviders` | `[{ name, re, src(m), width, height }]` | 埋め込みに対応する URL（既定: YouTube / Vimeo / Dailymotion / Spotify / Google マップ） |
| `autosave` | `async (html, editor) => {}` | 自動保存。入力が止まって `autosave-delay` 経過後に呼ばれる。保存中・保存済み・失敗をステータスバーに表示し、未保存のままページを離れようとすると確認を出す。Ctrl/⌘+S で即保存 |
| `slashCommands` | `[{ label, keywords, item? , run? }]` / `false` | スラッシュコマンドの一覧（既定は `SLASH_COMMANDS`）。`false` で無効 |
| `variables` | `[{ type: 'group', label, variables: [{ label, value }] }]` | 挿入できる差し込み変数。グループに入れない `{ label, value }` も並べられる。未設定なら「変数」ボタン非表示 |
| `variableFormat` | `{ open, close }` / `(variable) => string` | 変数を挿入するときの文字列（既定 `{ open: '{{ ', close: ' }}' }` → `{{ product_name }}`） |
| `variableTrigger` | string / `false` | 本文で変数の候補を出すきっかけの文字列（既定は `variableFormat.open` の前後の空白を除いたもの＝`{{`）。`false` で無効 |

イベント: `input`（変更のたび）、`change`（フォーカスが外れたとき）、`formulit-mode`（ソース表示の切替）、`formulit-upload` / `formulit-upload-error`（画像アップロードの完了・失敗。`detail.file` / `detail.url` / `detail.error`）、`formulit-autosave` / `formulit-autosave-error`、`formulit-fullscreen`、`formulit-variable-insert`（変数の挿入。`detail.variable` / `detail.text`）

CSS カスタムプロパティ: `--formulit-min-height` `--formulit-padding` `--formulit-border` `--formulit-radius` `--formulit-bg` `--formulit-toolbar-bg`、`::part(toolbar)` `::part(source)`

## 機能一覧

| 分類 | 機能 |
|---|---|
| 段落 | 本文 / 見出し1〜4 / 整形済み、スタイル（クラス適用）、行間、配置（左・中央・右）、インデント、引用、水平線 |
| 文字 | 太字、斜体、下線、取り消し線、上付き、下付き、インラインコード、フォント、文字サイズ、文字色、背景色（マーカー） |
| 入力補助 | 書式のコピー（書式ペインタ）、大文字・小文字の変換（Shift+F3 で切替）、特殊文字・絵文字、書式をクリア |
| 画像 | 挿入・編集（URL・alt・サイズ）、キャプション、配置（文中・左・中央・右）、ハンドルでリサイズ、ドラッグ＆ドロップ／貼り付け／ファイル選択でアップロード |
| 表 | 挿入、行・列の挿入（上下左右）と削除、セルの結合・分割（縦・横）、見出し行・見出し列、キャプション、表のプロパティ（枠線・背景・幅・高さ・配置）、セルのプロパティ（枠線・背景・余白・幅・配置）、Tab でセル移動。結合セル（rowspan / colspan）を考慮して処理 |
| 埋め込み | メディア（YouTube などの URL → iframe。URL を貼り付けるだけでも可）、HTML 埋め込み（ダブルクリックで HTML を編集） |
| コード | インラインコード、コードブロック（言語指定、Enter で改行・末尾で 3 回押すと抜ける、Tab でインデント、貼り付けはプレーンテキスト） |
| リンク | 挿入・編集（新しいタブで開く）、解除、画像へのリンク |
| リスト | 箇条書き、番号付き、ToDo リスト（クリックで完了）、記号・番号の種類、開始番号、逆順 |
| 文書 | 改ページ（CKEditor と同じ形式）、目次（見出しから生成し、見出しの編集に自動で追従） |
| 生産性 | 検索と置換（大文字小文字・単語単位、すべて置換）、文字数・単語数と上限、自動保存、全画面、ショートカット一覧（Alt+0） |
| 入力補助 | Markdown 風の入力変換（下表）、スラッシュコマンド（行頭で `/` → 見出し・表・画像などを絞り込んで挿入） |
| 差し込み変数 | ツールバーの「変数」（検索で絞り込めるコンボボックス）または本文で `{{` と入力して、`{{ product_name }}` などの変数を挿入。絞り込みはグループ名・変数名・変数値が対象（下記） |

Markdown 風の入力変換（入力した記号は 1 回の「元に戻す」で元に戻せます）:

| 入力 | 結果 | 入力 | 結果 |
|---|---|---|---|
| `# ` 〜 `###### ` | 見出し 1〜6 | `**文字**` / `__文字__` | 太字 |
| `- ` / `* ` | 箇条書き | `*文字*` / `_文字_` | 斜体 |
| `1. `（`3. ` なら 3 から） | 番号付きリスト | `` `文字` `` | インラインコード |
| `[] ` / `[x] ` | ToDo リスト | `~~文字~~` | 取り消し線 |
| `> ` | 引用 | `---` | 水平線 |
| ```` ``` ````（```` ```js ```` で言語指定）+ 空白 | コードブロック | | |

### 差し込み変数

```js
editor.variables = [
  { type: 'group', label: '商品', variables: [
    { label: '商品名', value: 'product_name' },
    { label: 'SKUコード', value: 'sku' },
  ] },
  { label: '今日の日付', value: 'today' },     // グループなしも可
];
editor.variableFormat = { open: '${', close: '}' }; // 省略時は {{ product_name }}。関数 (v) => string も可
editor.insertVariable('sku');                      // プログラムから挿入
```

- ツールバーに `variable` を入れる（`DEFAULT_TOOLBAR` / `COMPACT_TOOLBAR` には入っていて、`variables` を設定したときだけ表示）。押すと検索欄つきのリストが開き、↑↓ と Enter、またはクリックで挿入。
- 本文で `{{`（全角の `｛｛` も可）と入力するとキャレット位置に候補が出る。続けて入力で絞り込み、Enter / Tab で `{{…` を変数に置き換え、Esc で閉じる（`{{` は残る）。
- 絞り込みはグループ名・変数名・変数値が対象。空白区切りで AND、大文字小文字・全角半角・ひらがなカタカナを区別しない。
- 挿入されるのはただの文字列で、出力 HTML に特別な要素は入らない。

画像・表・埋め込みを選ぶと、その上に専用のツールバー（コンテキストツールバー）が表示されます。
| その他 | 元に戻す／やり直し、HTML ソース表示、フォーム連携 |

### ツールバーのグループ

`toolbar` 配列に `{ label, items }` を書くと、その項目を 1 つのドロップダウン（ボタンを押すと中の項目が並ぶ）にまとめます。

```js
ed.toolbar = [
  { label: '履歴', items: ['undo', 'redo', 'findReplace'] },
  '|',
  'format', 'styles', { label: '...', items: ['fontFamily', 'fontSize', 'lineHeight'] },
  '|',
  { label: '装飾', items: ['bold', 'italic', 'underline', 'strike', 'sup', 'sub', 'code'] },
];
// → 履歴▼ | [本文] [スタイル▼] ...▼ | 装飾▼
```

| キー | 説明 |
|---|---|
| `items` | 中に入れる項目名の配列。`'\|'` で区切り線。セレクト（フォントなど）や、文字色などのドロップダウンも入れられる（入れ子で開く） |
| `label` | ボタンに表示する文字 |
| `icon` | ボタンのアイコン。項目名（`'bold'` → 太字のアイコン）、HTML 文字列（`'<span style="…">M</span>'`）、Lit の `html` / `svg` テンプレート。`label` と併用可 |
| `title` | ツールチップ（省略時は `label`） |
| `keepOpen` | `true` なら、中の項目を実行してもパネルを閉じない（既定は閉じる） |
| `name` | グループの識別名（任意） |

- `label` と `icon` をどちらも省略すると `⋯` と表示します。
- 中のどれかが押下状態（太字の中にカーソルがあるなど）のときは、グループのボタンも押下表示になります。
- Ctrl/⌘+F などのショートカットでグループの中のパネル（検索など）を開く場合は、グループごと開きます。
- `icon` に渡した HTML 文字列はそのまま描画されます。利用者の入力など信頼できない値は渡さないでください。
- グループでまとめたプリセット `COMPACT_TOOLBAR` もあります（`import { COMPACT_TOOLBAR } from '@hidemikimura/formulit'`）。コンテキストツールバーの `items` にもグループを書けます。

ツールバー項目名（`toolbar` に指定）: `undo` `redo` `format` `styles` `fontFamily` `fontSize` `lineHeight` `bold` `italic` `underline` `strike` `sup` `sub` `code` `fontColor` `bgColor` `painter` `caseChange` `specialChars` `ul` `ol` `outdent` `indent` `alignLeft` `alignCenter` `alignRight` `link` `unlink` `image` `table` `mediaEmbed` `codeBlock` `htmlEmbed` `quote` `hr` `pageBreak` `toc` `todoList` `listStyle` `findReplace` `clear` `source` `fullscreen` `shortcuts`、区切りは `|`

コンテキストツールバー用の項目（メインのツールバーにも置けます）: 画像 `imgInline` `imgAlignLeft` `imgAlignCenter` `imgAlignRight` `imgCaption` `imgEdit` `imgDelete`、表 `tableRowAbove` `tableRowAdd` `tableColLeft` `tableColAdd` `tableRowDel` `tableColDel` `tableMerge` `tableSplitV` `tableSplitH` `tableHeaderRow` `tableHeaderCol` `tableCaption` `tableProps` `cellProps` `tableDel`、埋め込み `embedEdit` `embedDelete`、目次 `tocUpdate`

文字色・フォント・サイズなどは `<span style="color: …">` のように **style 属性付きの span** で出力します（`<font>` タグや 1〜7 段階のサイズは使いません）。範囲選択なしで指定すると、次に入力する文字（日本語入力の確定文字を含む）に適用されます。

## HTML を欠落させない仕組み

Quill や CKEditor 5 は HTML を内部モデルに変換するため、モデルで表現できないタグや属性が消えます。
このエディタはモデルを持たず、**DOM をそのまま編集対象**にしています（Trumbowyg / CKEditor 4 と同じ方式）。

1. **未編集なら原文をそのまま返す** — 読み込んだ文字列を保持しておき、WYSIWYG で何も変更していなければ `value` は 1 文字も変えずに返します（属性の引用符・大文字・空白・`<br/>` の書き方まで同じ）。ソース表示で書いた HTML も同様です。
2. **編集後も DOM にあるものはすべて出力** — class・style・data-*・独自要素・空要素（`<i class="icon"></i>`）・コメント・`details`・`iframe` などを保持します。
3. **編集用の一時変更は必ず元に戻す** — `<style>` の無効化（ページ全体への影響を防ぐ）、`iframe` などへの `contenteditable=false` 付与は元の値を記録し、書き出し時に復元します。
4. **既存要素の編集は変更した属性だけ書き換える** — リンク・画像の編集ダイアログは `href` / `src` などだけを更新し、他の属性は残します。
5. **サニタイズは最小限** — 実行されうるもの（`<script>`、`on*` 属性、`javascript:` URL）だけ除去。除去があった場合は安全のため「原文そのまま」扱いにしません。

6. **編集後も、変更していない部分は原文のまま（部分的な原文保持）** — 読み込み時に「原文のどの範囲がどのノードになったか」を記録し、変更を追跡します。書き出し時は次のように組み立てます。

   | ノードの状態 | 書き出し方 |
   |---|---|
   | 変更なし | 原文の文字列をそのまま（引用符・大文字・空白・`&copy;`・省略された終了タグも元のまま） |
   | 中身だけ変更 | 原文の開始タグ・終了タグ + 子を同じルールで処理 |
   | 属性を変更・新しく追加 | ブラウザのシリアライズ |

   例: `<div class='wrap'>` の中の段落を 1 つ編集しても、`<div class='wrap'>` や他の段落は 1 文字も変わらず、編集した段落も `<p class=a>` のような開始タグの書き方は保たれます。元に戻す／やり直しの後も有効です。

   **安全装置**: 対応づけは、各範囲をブラウザ自身のパーサで再パースして同じノードになることを確かめたものだけを使います。さらに組み立てた結果を再パースして DOM と等価かを確認し、等価でなければ文書全体を通常のシリアライズで返します（例: 終了タグを省略した `<p>x` の直後に段落外のテキストを追加した場合）。そのため出力が編集結果と食い違うことはありません。

> 注意: 属性を変えた要素や新しく作った要素は、ブラウザの書き方（属性は `"` で囲む、など）になります。また HTML として不正な入れ子（`<p>` の中の `<div>` など）はブラウザが読み込み時に直すため、原文のままにはなりません。
>
> 性能の目安（Chromium）: 約 200KB・2 万ノードの文書で、読み込み時の対応づけに約 0.1 秒。入力中のエディタ側の処理は 1 文字あたり約 1ms（約 300 段落の文書）。ツールバーの押下表示やコンテキストツールバーの位置は、連続入力中は一息ついたとき（最大 250ms ごと）にまとめて更新します。書き出しは、つなぎ目に不安がない限り文書全体の再パースを省きます。
>
> 利用側で `input` イベントのたびに `value` を読んで大きな DOM に表示するような処理は、それ自体が重くなるので間引いてください（デモでは 150ms まとめて更新）。

## プラグイン

組み込みの機能もすべてプラグインとして実装されています（`src/plugins/`）。

```js
import { registerPlugin } from '@hidemikimura/formulit';
import { html } from 'lit';

registerPlugin({
  name: 'mark',
  items: {
    mark: {
      title: 'マーカー',
      icon: html`<b>M</b>`,
      active: (ed) => !!ed.closestAtSelection('mark'),
      action: (ed) => ed.transact(() => {
        const range = ed.getRange(true);
        const mark = document.createElement('mark');
        mark.append(range.extractContents());
        range.insertNode(mark);
      }),
    },
  },
  keymap: { 'Mod-Shift-h': 'mark' },
  init(editor) { /* 要素ごとの初期化。関数を返すと破棄時に呼ばれる */ },
});
```

`type: 'select'` の項目（`options` / `value(ed)` / `action(ed, value)`）、`type: 'dropdown'` の項目（`panel(ed, close)` で Lit テンプレートを返す）も作れます。`contextToolbars: [{ name, match(ed), items }]` を定義すると、`match` が返した要素の上に浮動ツールバーを表示します。そのほか `status(ed)`（ステータスバーに出す内容を返す）、`prepare(root)`（読み込み時の編集用の下準備。`setTemp` で変えた属性は書き出し時に元へ戻る）も定義できます。

エディタ API（プラグインから利用）:

| メソッド | 説明 |
|---|---|
| `exec(command, value)` | `execCommand` を実行して履歴に積む |
| `transact(fn)` | DOM 変更をまとめて 1 つの履歴にする |
| `insertHTML(html)` / `insertNodes(node)` | カーソル位置に挿入（ブロック要素は段落を分割して挿入） |
| `getRange(fallbackToEnd)` / `selectRange(range)` | 選択範囲の取得・設定 |
| `closestAtSelection(selector)` | カーソル位置の祖先要素 |
| `selectedObject` | クリックで選択中の画像 |
| `openDialog({ title, fields })` | 入力ダイアログ（Promise で値を返す） |
| `undo()` / `redo()` / `toggleSource()` | 履歴・ソース表示 |
| `imageUploader` | `async (file) => url` を設定すると画像はそこへアップロードされる（未設定なら data URL） |
| `insertNodesAtSelection(node)` | `transact` の中でノードを挿入（ブロックは段落を分割） |
| `showPopup({ render, rect })` / `hidePopup()` | キャレット付近に候補メニューなどを表示 |
| `setHighlight(key, ranges, css)` | 本文を変えずに範囲を強調表示（CSS Custom Highlight API） |
| `saveNow()` | 自動保存を今すぐ実行（`autosave` 設定時） |
| `getStats()` | `{ chars, charsNoSpace, words }` を返す |
| `insertVariable(valueOrVariable)` | 変数を挿入（`'sku'` または `{ label, value }`） |
| `toggleFullscreen(force?)` | 全画面表示の切り替え |

## 開発

リポジトリの構成、テストの実行、リリースの手順は[リポジトリの README](https://github.com/hidemikimura/formulit#readme) を見てください。

## 現状の制限と今後の候補

- 編集領域はライト DOM（シャドウ DOM 内では Selection API のブラウザ差が大きいため）。サイトの本文 CSS がそのまま効く一方、ページ側の CSS の影響も受けます。完全に分離したい場合は iframe モードの追加が候補です。
- `execCommand` を利用（非推奨扱いだが全主要ブラウザで動作）。将来的に置き換える場合も API はプラグイン側から変わりません。
- 自動テストは Chromium 141 / Firefox 155 / WebKit 26.6 の 3 エンジンで全項目合格（Linux・macOS の両方で `npm run test:all` 合格）。macOS の Safari 実機で ⌘ キーのショートカット（⌘B / ⌘Z など）と日本語入力の変換確定（Enter で余計な改行が入らない）を手動確認済み。
- ブラウザ差異への対応済み項目: 空のエディタでの最初の入力を必ず `<p>` にする（Chrome/Safari）、日本語入力の変換中はショートカットを無視、Chrome/Safari がコピー時に書き込む計算済みスタイル（`orphans` / `widows` などを含む style）を貼り付け時に除去。
- ほかのページからコピーした要素の `style` は、ブラウザが計算済みスタイルと混ぜてしまうため区別できず一緒に除去されます（class・data-*・タグは残ります）。手書き HTML をそのまま持ち込むときはソース表示に貼り付けてください。
- 表のセル結合（colspan / rowspan）を含む行・列操作は未対応（結合セル自体は保持されます）。
- 部分的な原文保持で「等価でない」と判定されたときは、文書全体が通常のシリアライズになります（該当箇所だけ切り替える改良は今後の候補）。
- CKEditor 5 のオープンソース機能はおおむね網羅（書式 ✓ → 画像・表・メディア ✓ → 生産性 ✓）。共同編集（変更履歴・コメント・リアルタイム）、PDF/Word 変換、AI はサーバー側が必要なため対象外。
- 検索のハイライトは CSS Custom Highlight API を使うため、未対応の古いブラウザではハイライトなしで移動・置換のみ動作。
- 単語数の数え方（特に日本語の区切り）はブラウザの `Intl.Segmenter` の実装によって多少異なる。
- HTML 埋め込みの保護（クリックで選択・ダブルクリックで編集）は挿入したときのもの。保存後に読み込み直した HTML は通常の要素として編集できる（`data-protect` 属性を付けておけば読み込み時も保護される）。
- 画像のアップロード中（数秒）の `value` にはプレビュー用の `blob:` URL が入ります。完了後に本来の URL へ差し替わります。
- 画像・表・埋め込みを末尾に挿入すると、続けて入力できるよう空の段落（`<p><br></p>`）が後ろに入ります。
- メディア埋め込みは iframe で出力します（CKEditor 既定の `<oembed>` 方式ではないため、表示側での変換は不要）。

## ライセンス

[MIT](LICENSE) © Hidemi Kimura
