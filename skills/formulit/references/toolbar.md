# ツールバー

## 指定方法

`editor.toolbar` に配列を渡す（`null` なら `DEFAULT_TOOLBAR`）。要素は次のいずれか。

- 項目名の文字列（下表）
- `'|'`（区切り線。先頭・末尾・連続は自動で詰める）
- グループ `{ label, items, icon?, title?, keepOpen?, name? }`

属性 `toolbar="bold italic | link"` でも指定できるが、グループは書けない。

## グループ

```js
ed.toolbar = [
  { label: '履歴', items: ['undo', 'redo', 'findReplace'] },
  '|',
  'format', 'styles', { label: '...', items: ['fontFamily', 'fontSize', 'lineHeight'] },
  '|',
  { label: '装飾', items: ['bold', 'italic', 'underline', 'strike', 'sup', 'sub', 'code'] },
];
// 表示: 履歴▼ | [本文▾] [スタイル▼] ...▼ | 装飾▼
```

| キー | 説明 |
|---|---|
| `items` | 中の項目名の配列。`'|'` も可。セレクト（`fontSize` 等）やドロップダウン（`fontColor` 等）も入れられ、パネルの中で入れ子に開く |
| `label` | ボタンの文字 |
| `icon` | 項目名（`'bold'` → その項目のアイコン）/ HTML 文字列（そのまま描画。**信頼できる固定値のみ**）/ Lit の `html`・`svg` テンプレート。`label` と併用可 |
| `title` | ツールチップ（省略時 `label`） |
| `keepOpen` | `true` なら中の項目を実行してもパネルを閉じない（既定は閉じる） |
| `name` | 識別名（任意） |

- `label` も `icon` もなければ `⋯` と表示。
- 中の項目が押下状態ならグループのボタンも押下表示。
- 表示条件（`visible`）で中身が空になったグループは表示しない。
- Ctrl/⌘+F などでグループ内のパネルを開く場合はグループごと開く（`editor.openDropdownItem(name)`）。

プリセット: `import { COMPACT_TOOLBAR } from '@hidemikimura/formulit'`（主要ボタン + 「文字」「段落」「挿入」「⋯」のグループ）。

## 項目名

| 分類 | 項目名 |
|---|---|
| 履歴・検索 | `undo` `redo` `findReplace` |
| 段落 | `format`（本文・見出し1〜4・整形済み のセレクト）`styles`（`formatStyles` 設定時のみ表示）`lineHeight` `alignLeft` `alignCenter` `alignRight` `indent` `outdent` `quote` |
| 文字 | `bold` `italic` `underline` `strike` `sup` `sub` `code` `fontFamily` `fontSize` `fontColor` `bgColor` `painter`（書式のコピー）`caseChange` `specialChars` `clear` |
| リスト | `ul` `ol` `todoList` `listStyle` |
| 挿入 | `link` `unlink` `image` `table` `mediaEmbed` `codeBlock` `htmlEmbed` `hr` `pageBreak` `toc` `variable`（差し込み変数。`variables` 設定時のみ表示） |
| 表示・その他 | `source` `fullscreen` `shortcuts` |

コンテキストツールバー（要素を選ぶとその上に出る）用。メインのツールバーにも置ける:

| 対象 | 項目名 |
|---|---|
| 画像 | `imgInline` `imgAlignLeft` `imgAlignCenter` `imgAlignRight` `imgCaption` `imgEdit` `imgDelete` |
| 表 | `tableRowAbove` `tableRowAdd` `tableColLeft` `tableColAdd` `tableRowDel` `tableColDel` `tableMerge` `tableSplitV` `tableSplitH` `tableHeaderRow` `tableHeaderCol` `tableCaption` `tableProps` `cellProps` `tableDel` |
| 埋め込み | `embedEdit` `embedDelete` |
| 目次 | `tocUpdate` |

独自プラグインの項目名も同じように書ける（plugins.md）。存在しない項目名は無視される（エラーにはならない）。

## 機能を絞る

- ボタンを減らすだけなら `toolbar` から外す。**ショートカットやオートフォーマットは残る**（例: `bold` を外しても Ctrl+B は効く）。
- 機能ごと無効にするなら `plugins` で有効なプラグインを列挙する（例: `plugins="core basic link"`）。
- Markdown 風の入力変換だけ止めるなら `autoformat="false"`、スラッシュコマンドは `editor.slashCommands = false`。
