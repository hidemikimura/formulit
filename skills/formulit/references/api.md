# formulit API リファレンス

## 属性とプロパティ

属性で指定できるもの（プロパティでも可）:

| 属性 | プロパティ | 型 / 既定値 | 説明 |
|---|---|---|---|
| `name` | — | 文字列 | フォーム送信時の名前（Form-associated Custom Element） |
| `value` | `value` | 文字列 | HTML。属性は初期値のみ。以後はプロパティで読み書き（プロパティに設定した文字列は 1 文字も変えずに保持） |
| `placeholder` | `placeholder` | `''` | 空のときの表示 |
| `readonly` | `readonly` | `false` | 読み取り専用（フォームの `disabled` でも有効になる） |
| `toolbar` | `toolbar` | `null`（= `DEFAULT_TOOLBAR`） | 属性は空白区切りの項目名。グループはプロパティ（配列）で |
| `plugins` | `plugins` | `null`（= 登録済みすべて） | 有効にするプラグイン名（空白区切り / 配列） |
| `sanitize` | `sanitize` | `'strip'` | `'strip'`: script / on* / javascript: を除去。`'none'`: 除去せず編集中だけ無効化し出力に残す |
| `protect` | `protect` | `DEFAULT_PROTECT` | 編集中に `contenteditable=false` で丸ごと保護する要素の CSS セレクタ |
| `preserve-source` | `preserveSource` | `true` | 編集後も未変更部分を原文のまま返す。無効化は `"false"` |
| `autoformat` | `autoformat` | `true` | Markdown 風の入力変換。無効化は `"false"` |
| `word-count` | `wordCount` | `false` | ステータスバーに文字数・単語数 |
| `max-chars` | `maxChars` | `0` | 文字数の上限表示（超えると赤字。入力は止めない） |
| `autosave-delay` | `autosaveDelay` | `2000` | 自動保存までの待ち時間（ms） |
| `fullscreen` | `fullscreen` | `false` | 全画面表示 |

JS プロパティだけで渡すもの（`null` なら既定値）:

| プロパティ | 形式 |
|---|---|
| `fontFamilies` / `fontSizes` / `lineHeights` | `[{ value, label }]`（`value: ''` は「指定なし」） |
| `colors` | `[{ color, label }]`（文字色・背景色のパレット） |
| `formatStyles` | `[{ name, element, classes }]`。`element` がブロック要素（p, h1〜h6, div, blockquote, pre, li, ul, ol, table, figure, section）ならその要素にクラスを付け外し、それ以外（span, kbd, mark 等）は選択範囲をその要素で囲む。未設定ならボタン非表示 |
| `imageUploader` | `async (file) => url`。未設定なら data URL で埋め込む |
| `imageStyles` | `[{ name, label, style?, classes? }]`。`name` は `inline` / `alignLeft` / `alignCenter` / `alignRight`。既定は figure の style（float・margin） |
| `codeBlockLanguages` | `[{ value, label }]` → `<code class="language-{value}">` |
| `mediaProviders` | `[{ name, re, src(match), width, height }]`（既定 `MEDIA_PROVIDERS`: YouTube / Vimeo / Dailymotion / Spotify / Google マップ） |
| `autosave` | `async (html, editor) => {}`。失敗時は例外を投げる |
| `slashCommands` | `[{ label, keywords, item?, run?(editor), needs? }]` または `false`（無効）。既定 `SLASH_COMMANDS` |
| `variables` | `[{ type: 'group', label, variables: [{ label, value }] }]`（グループなしの `{ label, value }` も混在可）。未設定・空なら `variable` ボタンは非表示 |
| `variableFormat` | `{ open, close }` または `(variable) => string`。既定 `{ open: '{{ ', close: ' }}' }` → `{{ product_name }}` |
| `variableTrigger` | 本文で変数候補を開く文字列。`null`（既定）なら `variableFormat.open.trim()`（関数なら `{{`）。`false` で無効 |

読み取り専用:

| プロパティ | 説明 |
|---|---|
| `dirty` | 読み込み後に編集されたか |
| `mode` | `'wysiwyg'` / `'source'` |
| `editable` | 編集領域の要素（ライト DOM の `div.formulit-editable`）。直接書き換えないこと |
| `items` | 有効なプラグインから集めたツールバー項目 `{ name: 定義 }` |
| `selectedObject` | クリックで選択中の画像・埋め込み要素 |
| `history` | 履歴（`canUndo` / `canRedo`） |

## メソッド

利用側でよく使うもの:

| メソッド | 説明 |
|---|---|
| `getHTML()` / `setHTML(html)` | `value` と同じ |
| `focusEditor()` | 編集領域にフォーカス（最後の選択位置を復元） |
| `undo()` / `redo()` | 元に戻す / やり直し |
| `toggleSource(force?)` | HTML ソース表示の切り替え |
| `toggleFullscreen(force?)` | 全画面表示の切り替え |
| `insertHTML(html)` | カーソル位置に HTML を挿入（サニタイズ・保護を通す。ブロックは段落を分割） |
| `saveNow()` | 自動保存を今すぐ実行（`autosave` 設定時） |
| `getStats()` | `{ chars, charsNoSpace, words }` |
| `insertVariable(valueOrVariable)` | カーソル位置に変数を挿入。`'sku'`（variables から探す）または `{ label, value }` |
| `openDropdownItem(name)` | ドロップダウン項目を開く（グループ内ならグループごと） |

プラグイン作成で使うもの（詳細は plugins.md）:

| メソッド | 説明 |
|---|---|
| `transact(fn)` | DOM 変更を 1 つの履歴にまとめる。**変更は必ずこの中で** |
| `exec(command, value?)` | `document.execCommand` を実行して履歴に積む |
| `queryState(command)` | `document.queryCommandState` |
| `insertNodes(node \| fragment)` | ノードを挿入（transact 付き） |
| `insertNodesAtSelection(node \| fragment)` | 同上。transact の中から使う |
| `getRange(fallbackToEnd?)` | 編集領域内の選択範囲（無ければ最後の選択、`true` なら末尾） |
| `selectRange(range)` / `setCaretAt(node, offset)` / `setCaretAfter(node)` | 選択の設定 |
| `closestAtSelection(selector)` | カーソル位置の祖先要素（編集領域内） |
| `selectedBlocks()` | 選択範囲にかかる段落などのブロック |
| `applyInline(ops)` | インライン書式を適用（範囲なしなら次に入力する文字に適用） |
| `toggleInline({ tag, classes })` / `isInlineActive({ tag, classes })` | 要素で囲む書式の切り替え / 状態 |
| `inlineStyleAt(prop)` | カーソル位置のインラインスタイル値 |
| `setBlockStyle(prop, value)` | 選択中のブロックに style を設定（空なら解除） |
| `openDialog({ title, fields, submitLabel, message, content, wide, cancel })` | 入力ダイアログ。`Promise<値 \| null>` |
| `showPopup({ render, rect })` / `hidePopup()` | キャレット付近のポップアップ |
| `setHighlight(key, ranges, css)` | 本文を変えずに範囲を強調（CSS Custom Highlight API） |
| `closeDropdown()` | 開いているドロップダウンを閉じる |
| `loadOptions()` | `load()` に渡すオプション（サニタイズ設定と各プラグインの `prepare`） |

`openDialog` の `fields`: `{ name, label, type, value, placeholder, options, min, required, half }`。`type` は `text` / `url` / `number` / `checkbox` / `select`（`options: [{value,label}]`）/ `textarea` / `color`（空欄可のテキスト + カラーピッカー）/ `file`（値は `File`）。`half: true` が連続すると 2 列。

## イベント（すべてホスト要素から、bubbles・composed）

| イベント | タイミング / detail |
|---|---|
| `input` | 内容が変わるたび（入力・書式変更・元に戻す・ソース編集の反映） |
| `change` | フォーカスが外れたとき、フォーカス時から内容が変わっていれば |
| `formulit-mode` | ソース表示の切替。`{ mode }` |
| `formulit-fullscreen` | 全画面の切替。`{ fullscreen }` |
| `formulit-upload` / `formulit-upload-error` | 画像アップロードの完了 `{ file, url }` / 失敗 `{ file, error }` |
| `formulit-autosave` / `formulit-autosave-error` | 自動保存の成功 `{ value }` / 失敗 `{ error }` |
| `formulit-variable-insert` | 変数を挿入したとき。`{ variable, text }` |
| `formulit-selectionchange` | 選択が変わったとき（連続入力中は間引かれる） |

## 初期値の渡し方

優先順: 子の `<script type="text/html">`（原文そのまま）→ 子の `<template>`（ブラウザが整形）→ `value` 属性 → その他の子要素。
接続後は `value` プロパティで設定する。

## フォーム連携

- `name` を付けて `<form>` に入れると、`FormData` に `value` が入る。
- `form.reset()` で初期値（最初に読み込んだ HTML）に戻る。
- `<fieldset disabled>` などで無効になると `readonly` になる。

## 見た目の調整

CSS 変数（ホスト要素に指定）: `--formulit-min-height`（240px）、`--formulit-padding`（12px 16px）、`--formulit-border`、`--formulit-radius`、`--formulit-bg`、`--formulit-toolbar-bg`、`--formulit-fullscreen-width`（860px）。

`::part()`: `toolbar`、`body`、`source`（HTML ソースの textarea）、`status`（ステータスバー）。

本文の見た目はページの CSS で指定する（編集領域はライト DOM）:

```css
formulit-editor .formulit-editable { font-size: 16px; line-height: 1.8; }
formulit-editor .lead { font-size: 1.15em; }
```

## export（`import { … } from '@hidemikimura/formulit'`）

- 要素・定数: `FormulitEditor`, `DEFAULT_TOOLBAR`, `COMPACT_TOOLBAR`, `DEFAULT_PROTECT`, `DEFAULT_FONT_FAMILIES`, `DEFAULT_FONT_SIZES`, `DEFAULT_LINE_HEIGHTS`, `DEFAULT_COLORS`, `SPECIAL_CHARS`, `DEFAULT_IMAGE_STYLES`, `DEFAULT_CODE_LANGUAGES`, `MEDIA_PROVIDERS`, `SLASH_COMMANDS`, `SHORTCUTS`, `MARKDOWN_SHORTCUTS`, `DEFAULT_VARIABLE_FORMAT`, `icons`
- プラグイン: `registerPlugin`, `getPlugin`, `getPlugins`, `corePlugin`, `basicPlugin`, `formattingPlugin`, `typingPlugin`, `codeBlockPlugin`, `listsPlugin`, `linkPlugin`, `imagePlugin`, `embedPlugin`, `productivityPlugin`, `tablePlugin`, `variablesPlugin`
- HTML 処理: `load`, `parseHTML`, `sanitize`, `serialize`, `restore`, `setTemp`, `TMP_ATTR`, `cleanPastedHTML`, `stripCopiedStyles`, `serializeWithSource`, `equivalentHTML`
- インライン書式: `applyOps`, `splitBoundaries`, `textNodesInRange`, `closestBlock`, `selectedBlocks`, `inlineAncestors`, `isolate`, `unwrap`, `removeFormatting`, `changeCase` ほか
- 機能の関数: `insertImageFiles`, `uploadImage`, `matchMedia`, `toCodeBlock`, `toggleTodo`, `findMatches`, `getStats`, `saveNow`, `buildGrid`, `normalizeVariables`, `filterVariables`, `formatVariable`, `insertVariable(editor, v)`

組み込みプラグインの名前（`plugins` 属性用）: `core`, `basic`, `formatting`, `typing`, `codeBlock`, `lists`, `link`, `image`, `embed`, `productivity`, `table`, `variables`。
