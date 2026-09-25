---
name: formulit
description: formulit（Lit 用 WYSIWYG エディタ <formulit-editor>）を組み込む・設定する・プラグインで拡張するときに使う。手書き HTML を欠落させない仕様、value と input イベント、ツールバー（グループ）、画像アップロード、自動保存、独自プラグインの正しい書き方を含む。
---

# formulit

`formulit` は Lit 製の WYSIWYG エディタ（カスタム要素 `<formulit-editor>`）。最大の特長は **手書き HTML を欠落させない** こと（class・style・data-*・独自要素・コメント・iframe などを保持し、編集していない部分は元の文字列のまま返す）。CKEditor 5 のオープンソース機能をおおむね備える。

このスキルは、formulit を**使う側のコード**（組み込み・設定・プラグイン作成）を書くときの手引き。詳細は必要に応じて references を読む。

| 知りたいこと | 読むファイル |
|---|---|
| 属性・プロパティ・メソッド・イベント・CSS 変数・export の一覧 | [references/api.md](references/api.md) |
| ツールバー項目名、グループ `{ label, items }`、コンテキストツールバー | [references/toolbar.md](references/toolbar.md) |
| 独自プラグイン（ボタン・セレクト・ドロップダウン・ショートカット等）の作り方 | [references/plugins.md](references/plugins.md) |
| よくある実装例（Lit での双方向バインド、フォーム、画像アップロード、自動保存、CDN 等） | [references/recipes.md](references/recipes.md) |
| HTML 保持の仕組みと、出力が変わるケース・トラブルシューティング | [references/html-preservation.md](references/html-preservation.md) |

## 最小の使い方

```bash
npm install @hidemikimura/formulit lit   # lit 3 は peerDependency
```

```js
import '@hidemikimura/formulit'; // <formulit-editor> が定義され、組み込みプラグインが登録される（副作用 import）
```

```html
<form>
  <formulit-editor name="body" placeholder="本文を入力…">
    <script type="text/html"><p class='lead'>初期値の HTML</p></script>
  </formulit-editor>
</form>
```

Lit から使う場合:

```js
html`<formulit-editor
  .value=${this.body}
  @input=${(e) => { this.body = e.target.value; }}
></formulit-editor>`
```

## 必ず守ること

1. **内容の読み書きは `value`（または `getHTML()` / `setHTML()`）で行う。** 内部の編集領域 `editor.editable` の `innerHTML` を直接書き換えない（原文との対応・履歴・サニタイズが壊れる）。
2. **原文を 1 文字も変えずに渡すなら、`value` プロパティに文字列を設定するか、子に `<script type="text/html">…</script>` を置く**（中に `</script>` を書くときは `<\/script>`）。子の `<template>` や `value` 属性でも渡せるが、ブラウザが一度パースするので引用符・大文字・文字参照などの書き方は整形される（内容は保持）。
3. **変更は `input` イベント（ホスト要素から、入力のたび）、確定は `change`（フォーカスが外れたとき）で受け取る。** `event.target` は `<formulit-editor>`。`input` のたびに大きな DOM へ `value` を描画する処理は重いので間引く。
4. **`value` は「未編集なら読み込んだ文字列をそのまま」返す。** 編集後も触っていない部分は元の文字列のまま。属性を変えた要素や新しい要素だけブラウザの書き方（属性は `"` 囲み等）になる。`<script>`・`on*` 属性・`javascript:` URL は既定（`sanitize="strip"`）で除去される。
5. **配列・関数の設定は JS プロパティで渡す**（`toolbar` のグループ、`fontSizes`、`colors`、`formatStyles`、`imageUploader`、`autosave` など）。属性で渡せるのは文字列・真偽値・数値だけ。`toolbar` 属性は空白区切りの項目名のみでグループは書けない。
6. **独自プラグインは `registerPlugin()` を要素が DOM に追加される前に呼ぶ。** ツールバー項目は後からでも反映されるが、`init()`・`prepare()` は接続時／読み込み時に登録済みのプラグインにしか適用されない。
7. **プラグインから DOM を変えるときは必ず `editor.transact(() => { ... })` の中で行う。** 1 回の「元に戻す」単位になり、変更検知・フォーム値・`input` イベントが正しく動く。`execCommand` だけなら `editor.exec(command, value)`。
8. **編集中だけの属性変更は `setTemp(el, name, value)` を使う**（書き出し時に値と並び順が元に戻る）。`data-formulit-` で始まる属性はエディタ内部用で、出力から自動的に取り除かれる。利用側でこの接頭辞を使わない。
9. **編集領域はライト DOM（シャドウ DOM の外）にある。** ページの CSS が本文に効く（本文の見た目をサイトと揃えられる）一方、ページ側の CSS の影響も受ける。ツールバー等の見た目は CSS 変数・`::part()` で変える。

## よく使う設定

```js
const ed = document.querySelector('formulit-editor');
ed.toolbar = [
  { label: '履歴', items: ['undo', 'redo', 'findReplace'] },
  '|', 'format', 'bold', 'italic', 'link', 'image', 'table',
  { label: '⋯', items: ['source', 'fullscreen', 'shortcuts'] },
];                                                   // グループは references/toolbar.md
ed.imageUploader = async (file) => (await upload(file)).url; // 未設定なら data URL で埋め込む
ed.autosave = async (html) => { await save(html); }; // 入力が止まって autosave-delay(ms) 後に呼ばれる
ed.wordCount = true;                                  // ステータスバーに文字数
ed.formatStyles = [{ name: 'リード文', element: 'p', classes: ['lead'] }];
ed.variables = [{ type: 'group', label: '商品', variables: [{ label: '商品名', value: 'product_name' }] }];
                                                      // 差し込み変数（{{ product_name }} を挿入。recipes.md）
```

コンパクトな既定値が欲しい場合は `import { COMPACT_TOOLBAR } from '@hidemikimura/formulit'` を `ed.toolbar` に渡す。

## ありがちな間違い

- `import { FormulitEditor } from '@hidemikimura/formulit'` だけで要素定義されると思い込む → `import '@hidemikimura/formulit'` の時点で定義・登録済み。二重定義はしない（`customElements.define` を自分で呼ばない）。
- `ed.value = html` の直後に `ed.dirty` が `true` だと期待する → `value` の設定は「新しい原文」として扱われ `dirty` は `false`（サニタイズで何か除去した場合だけ `true`）。
- 独自ボタンの `action` 内で `editor.editable` を直接いじり、`transact` を使わない → 元に戻せない・`input` が飛ばない。
- `toolbar` 属性にグループを書こうとする → プロパティで配列を渡す。
- 属性 `preserve-source="false"` や `autoformat="false"` 以外の書き方（`preserve-source` を外す等）で無効化しようとする → これらは既定 `true` で、無効化は `"false"` を指定するかプロパティに `false`。
- 画像アップロード中に `value` を保存する → 完了までは一時的な `blob:` URL が入る。`formulit-upload` イベントや保存前の確認で対処。

## ブラウザ・環境

- 対応: Chromium / Firefox / Safari（WebKit）の最新版。日本語入力（IME）に対応。
- 依存: `lit` 3（peerDependency）。ビルド不要の ES モジュールなので、import map で `lit` を解決すれば CDN からも使える（references/recipes.md）。
