# 実装例（レシピ）

## Lit コンポーネントで双方向バインド

```js
import { LitElement, html } from 'lit';
import 'formulit';

class ArticleForm extends LitElement {
  static properties = { body: { type: String } };
  constructor() { super(); this.body = '<p>初期値</p>'; }
  render() {
    return html`
      <formulit-editor
        .value=${this.body}
        placeholder="本文"
        @input=${(e) => { this.body = e.target.value; }}
      ></formulit-editor>`;
  }
}
customElements.define('article-form', ArticleForm);
```

注意: `.value=${this.body}` は値が変わるたびにエディタへ設定される。`@input` で受け取った値をそのまま戻す分には、同じ文字列なので Lit は再設定しない。外部から別の文字列を入れると「新しい原文」として読み込み直され、履歴はリセットされる。

## フォーム送信

```html
<form method="post" action="/articles">
  <formulit-editor name="body"><template>…</template></formulit-editor>
  <button>保存</button>
</form>
```

`name` を付ければ `FormData` に HTML が入る。`form.reset()` で初期値に戻る。

## 画像をサーバーへアップロード

```js
ed.imageUploader = async (file) => {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch('/api/images', { method: 'POST', body });
  if (!res.ok) throw new Error('upload failed');   // 失敗すると挿入した画像は取り除かれる
  return (await res.json()).url;
};
ed.addEventListener('formulit-upload-error', (e) => alert(`アップロード失敗: ${e.detail.file.name}`));
```

ツールバーの画像ボタン（ファイル選択）、ドラッグ＆ドロップ、スクリーンショットの貼り付けのすべてで使われる。アップロード中は `blob:` のプレビューが入り、完了後に URL が差し替わる。未設定なら data URL（Base64）で埋め込む。

## 自動保存

```js
ed.autosaveDelay = 3000;
ed.autosave = async (html) => {
  const res = await fetch('/api/draft', { method: 'PUT', body: html });
  if (!res.ok) throw new Error('save failed');     // 「保存に失敗しました」と表示される
};
```

入力が止まってから `autosaveDelay` ms 後に呼ばれる。状態（未保存・保存中・保存済み・失敗）はステータスバーに表示され、未保存でページを離れようとすると確認が出る。Ctrl/⌘+S か `ed.saveNow()` で即保存。

## 文字数制限のあるフォーム

```html
<formulit-editor name="summary" max-chars="400"></formulit-editor>
```

`max-chars` は表示のみ（超えると赤字）。送信を止める場合は自分で判定する:

```js
form.addEventListener('submit', (e) => {
  if (ed.getStats().chars > 400) { e.preventDefault(); alert('400 文字以内にしてください'); }
});
```

## 読み取り専用のプレビュー

```html
<formulit-editor readonly toolbar=""></formulit-editor>
```

表示だけなら、保存した HTML をそのままページに出す方が軽い（エディタ固有のマークアップは出力に含まれない）。

## ツールバーを絞る・まとめる

```js
import { COMPACT_TOOLBAR } from 'formulit';
ed.toolbar = COMPACT_TOOLBAR;                         // まとめたプリセット
ed.toolbar = ['bold', 'italic', '|', 'link', { label: '⋯', items: ['source', 'fullscreen'] }];
```

詳しくは toolbar.md。

## 本文の見た目をサイトに合わせる

編集領域はライト DOM なので、サイトの本文用 CSS をそのまま当てられる。

```css
formulit-editor .formulit-editable { font-family: "Noto Sans JP", sans-serif; line-height: 1.9; }
formulit-editor .formulit-editable h2 { border-left: 4px solid #0b57d0; padding-left: .5em; }
formulit-editor { --formulit-min-height: 400px; --formulit-radius: 0; }
formulit-editor::part(toolbar) { background: #fff; }
```

## 「スタイル」でサイト独自のクラスを選べるようにする

```js
ed.formatStyles = [
  { name: 'リード文', element: 'p', classes: ['lead'] },
  { name: '注意ボックス', element: 'div', classes: ['note'] },
  { name: 'マーカー', element: 'span', classes: ['marker'] },
];
```

クラスの見た目はページ側の CSS で定義する（エディタ内でも同じ CSS が効く）。

## 画像の配置をクラスで出力する

```js
ed.imageStyles = [
  { name: 'inline', label: '文中' },
  { name: 'alignLeft', label: '左寄せ', classes: ['image-left'] },
  { name: 'alignCenter', label: '中央', classes: ['image-center'] },
  { name: 'alignRight', label: '右寄せ', classes: ['image-right'] },
];
```

既定は `style="float: left; …"` なので、表示側に CSS がなくても配置される。

## ビルドなし・CDN で使う

formulit は ES モジュールのまま配布している。import map で `lit` 一式（lit / lit-html / lit-element / @lit/reactive-element）を解決する。`lit` を `+esm` の 1 ファイルにすると、formulit が使う `lit/directives/…` が別コピーになるので避ける:

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
  "formulit": "/path/to/formulit/src/index.js"
} }
</script>
<script type="module">import 'formulit';</script>
```

## script を含む HTML をそのまま扱う（管理者向け CMS など）

```html
<formulit-editor sanitize="none"></formulit-editor>
```

`script`・`on*` 属性・`javascript:` URL を出力に残す（編集中だけ無効化して実行されないようにする）。**信頼できる利用者だけが使う画面で使う。** 表示側で XSS 対策が必要。

## 特定の要素を編集させない

```html
<formulit-editor protect="iframe, .widget, [data-protect]"></formulit-editor>
```

一致する要素は編集中 `contenteditable=false`（丸ごと選択・削除のみ）になる。出力には `contenteditable` は付かない。既定は `DEFAULT_PROTECT`（iframe, video, form, svg, figure.media, [data-protect] など）。

## 差し込み変数（メールテンプレートなど）

```js
ed.variables = [
  { type: 'group', label: '顧客', variables: [
    { label: '氏名', value: 'customer_name' },
    { label: 'メールアドレス', value: 'email' },
  ] },
  { type: 'group', label: '商品', variables: [{ label: '商品名', value: 'product_name' }] },
  { label: '今日の日付', value: 'today' },
];
ed.toolbar = ['undo', 'redo', '|', 'bold', 'italic', 'link', '|', 'variable'];
// 書式を変える場合（既定は {{ customer_name }}）
ed.variableFormat = { open: '${', close: '}' };  // 本文で "${" と打つと候補が出る
ed.addEventListener('formulit-variable-insert', (e) => console.log(e.detail.text));
```

Lit では `.variables=${list}` で渡す。ユーザーはツールバーの「変数」（検索つきリスト）か、本文で `{{` と入力して挿入する。絞り込みはグループ名・変数名・変数値が対象。挿入結果はただの文字列なので、置き換えは保存後にサーバー側のテンプレートエンジンで行う。変数を独自要素（チップ表示など）にしたい場合は、この機能ではなく独自プラグイン + `protect` で作る。

## 複数のエディタ

1 ページに複数置いてよい（検索のハイライト・履歴・設定はエディタごと）。プラグインの登録は全エディタ共通。エディタごとに機能を変えるなら `plugins` / `toolbar` をそれぞれに設定する。
