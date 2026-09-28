# プラグインの作り方

組み込み機能もすべてプラグインとして実装されている。独自プラグインは `registerPlugin()` で登録し、項目名を `toolbar` に書くと表示される。

```js
import '@hidemikimura/formulit';
import { registerPlugin } from '@hidemikimura/formulit';
import { html } from 'lit';

registerPlugin({
  name: 'mark',                       // 一意な名前（plugins 属性でも使う）
  items: {                            // ツールバー項目（項目名 → 定義）
    mark: {
      title: 'マーカー (Ctrl/⌘+Shift+H)',
      icon: html`<b style="background:#ffe58f;padding:0 3px">M</b>`,
      active: (ed) => ed.isInlineActive({ tag: 'mark' }),
      action: (ed) => ed.toggleInline({ tag: 'mark' }),
    },
  },
  keymap: { 'Mod-Shift-h': 'mark' },  // ショートカット → 項目名 または 関数
});

document.querySelector('formulit-editor').toolbar = ['bold', 'italic', 'mark'];
```

**登録のタイミング**: `registerPlugin()` はエディタ要素が DOM に追加される前に呼ぶ。`items` は後からでも反映されるが、`init()` は接続時、`prepare()` は内容の読み込み時に登録済みのものだけに適用される。

## プラグインの形

```js
{
  name: 'my-plugin',
  items: { itemName: 項目定義, ... },
  keymap: { 'Mod-k': 'itemName', 'Enter': (ed, event) => boolean },
  contextToolbars: [{ name, match: (ed) => Element | null, items: ['a', '|', 'b'] }],
  status: (ed) => テンプレート | テンプレートの配列 | nothing,  // ステータスバーに表示
  prepare: (root) => {},        // 内容を読み込むたびに（DocumentFragment）。setTemp で編集用の調整
  init: (ed) => () => {},       // エディタ接続時。戻り値の関数は切断時に呼ばれる
}
```

## 項目定義

| キー | 説明 |
|---|---|
| `type` | `'button'`（既定）/ `'select'` / `'dropdown'` |
| `icon` | Lit の `html` / `svg` テンプレート、または文字列 |
| `title` | ツールチップ・aria-label |
| `action(ed, value)` | クリック時（select は選んだ値が `value`） |
| `active(ed)` | 押下状態（`true` で `aria-pressed="true"`） |
| `enabled(ed)` | 有効状態（`false` で無効表示） |
| `visible(ed)` | 表示するか（`false` なら描画しない） |
| `toggle` | `true` なら `active` がなくても押下状態を持つボタンとして扱う |
| `availableInSource` | `true` なら HTML ソース表示中も使える |
| `options` / `value(ed)` / `formatUnknown(v)` | `select` 用。`options` は `[{ value, label }]` か関数 |
| `panel(ed, close)` / `label(ed)` / `onOpen(ed)` / `onClose(ed)` | `dropdown` 用。`panel` は Lit テンプレートを返す。`label` を返すとアイコンの代わりに表示 |

`active` / `enabled` / `value` / `label` はツールバー描画のたびに呼ばれる。**重い処理（文書全体の走査など）はしない**（連続入力中は描画が間引かれるが、軽く保つ）。

### セレクトの例

```js
registerPlugin({
  name: 'letterSpacing',
  items: {
    letterSpacing: {
      type: 'select', title: '文字間隔',
      options: [{ value: '', label: '字間' }, { value: '0.05em', label: '広め' }, { value: '0.1em', label: 'かなり広め' }],
      value: (ed) => ed.inlineStyleAt('letter-spacing'),
      action: (ed, v) => ed.applyInline([{ kind: 'style', prop: 'letter-spacing', value: v || null }]),
    },
  },
});
```

### ドロップダウンの例

```js
registerPlugin({
  name: 'snippets',
  items: {
    snippets: {
      type: 'dropdown', title: '定型文', icon: '定型文',
      panel: (ed, close) => html`<div class="menu">
        ${['お世話になっております。', 'よろしくお願いいたします。'].map((t) => html`
          <button @click=${() => { ed.transact(() => document.execCommand('insertText', false, t)); close(); }}>${t}</button>`)}
      </div>`,
    },
  },
});
```

パネル内で使える既定の class: `menu`（縦並びのメニュー）、`grid`、`row`、`swatch`。パネル内の `input` / `select` / `textarea` はフォーカスできる（それ以外のクリックでは編集領域の選択が保たれる）。

## 内容を変更する（必ず transact の中で）

```js
action: (ed) => ed.transact(() => {
  const p = ed.closestAtSelection('p');
  if (p) p.classList.toggle('note');
})
```

- `transact` の中の変更は 1 回の「元に戻す」単位になり、`input` イベント・フォーム値・変更検知（部分的な原文保持）が正しく働く。
- `execCommand` 1 回だけなら `ed.exec('bold')`。
- ノード挿入は `ed.insertNodes(node)`（transact 外から）/ `ed.insertNodesAtSelection(node)`（transact 内から）。ブロック要素は段落を分割して正しい位置に入る。HTML 文字列なら `ed.insertHTML(html)`（サニタイズされる）。
- 非同期処理の完了後に変更するときも `transact` を使う。フォーカスを奪いたくなければ `ed._withoutFocus(() => ed.transact(...))`。

## インライン書式（applyInline）

`<span style>` や任意の要素で選択範囲を囲む / 外す。範囲選択がないときは「次に入力する文字」（日本語入力の確定文字を含む）に適用される。

```js
ed.applyInline([{ kind: 'style', prop: 'color', value: '#c00' }]);   // value: null で解除
ed.applyInline([{ kind: 'wrap', tag: 'mark', classes: ['hl'] }]);
ed.applyInline([{ kind: 'wrap', tag: 'mark', classes: ['hl'], remove: true }]);
ed.toggleInline({ tag: 'kbd' });           // 状態を見て付ける／外す
ed.isInlineActive({ tag: 'kbd' });
ed.inlineStyleAt('color');                 // カーソル位置の値（'' なら指定なし）
ed.setBlockStyle('text-indent', '1em');    // 選択中の段落などに style（'' で解除）
```

## コンテキストツールバー

```js
registerPlugin({
  name: 'noteBox',
  items: {
    noteRemove: { title: 'ボックスを解除', icon: '解除', action: (ed) => ed.transact(() => {
      const box = ed.closestAtSelection('div.note');
      box?.replaceWith(...box.childNodes);
    }) },
  },
  contextToolbars: [{
    name: 'noteBox',
    match: (ed) => ed.closestAtSelection('div.note'),  // 返した要素の上に表示
    items: ['noteRemove'],
  }],
});
```

複数のプラグインが一致した場合は、登録順で最初のものが使われる。

## ショートカット（keymap）

キー表記は `Mod`（Mac は ⌘、それ以外は Ctrl）・`Alt`・`Shift` と `event.key`（1 文字は小文字）を `-` でつなぐ: `'Mod-b'`, `'Mod-Shift-z'`, `'Alt-0'`, `'Shift-F3'`, `'Enter'`, `'Tab'`, `'Escape'`。

値が関数の場合、`false` を返すと「処理しなかった」扱いになり、次のプラグインやブラウザ既定の動作に回る。**条件付きのキー（Enter や Tab）は、該当しないとき必ず `false` を返す。**

```js
keymap: {
  Enter: (ed) => {
    if (!ed.closestAtSelection('div.note')) return false;
    // … 独自の処理
    return true;
  },
}
```

日本語入力の変換中のキーは自動的に除外される。プラグインの登録順がキー処理の優先順。

## 読み込み時の調整（prepare）と setTemp

編集中だけ属性を変えたい（例: チェックボックスの `disabled` を外してクリック可能にする）場合、`prepare` で `setTemp` を使う。書き出し時に値と属性の並び順が元に戻る。

```js
import { setTemp } from '@hidemikimura/formulit';
registerPlugin({
  name: 'widgets',
  prepare(root) {
    root.querySelectorAll('.widget').forEach((el) => setTemp(el, 'contenteditable', 'false'));
  },
});
```

`data-formulit-` で始まる属性は内部用として出力から自動で除かれる（選択表示などに使ってよい）。

## ダイアログ

```js
const v = await ed.openDialog({
  title: 'ボタンを挿入', submitLabel: '挿入',
  fields: [
    { name: 'text', label: '文字', type: 'text', value: '詳しく見る' },
    { name: 'href', label: 'URL', type: 'url', value: 'https://' },
    { name: 'color', label: '色', type: 'color', value: '#0b57d0', half: true },
    { name: 'blank', label: '新しいタブ', type: 'checkbox', half: true },
  ],
});
if (v) {
  const a = document.createElement('a');
  a.className = 'btn'; a.href = v.href; a.textContent = v.text; a.style.background = v.color;
  if (v.blank) a.target = '_blank';
  ed.insertNodes(a);
}
```

ダイアログを閉じると、開く前の選択位置が復元される。

## ステータスバー

```js
status: (ed) => html`<span>段落 ${ed.editable.querySelectorAll('p').length}</span>`,
```

## やってはいけないこと

- `ed.editable.innerHTML = …` で丸ごと書き換える（`ed.value = …` を使う）。
- `transact` の外で DOM を変える。
- `active` などで文書全体を毎回走査する。
- 他のプラグインの内部関数（`_` で始まるメソッド）に依存する（`_withoutFocus` を除く）。
