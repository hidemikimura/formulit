# 変更履歴

このパッケージ（`@hidemikimura/formulit`）の主な変更を記録します。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に、バージョンは [セマンティック バージョニング](https://semver.org/lang/ja/) に従います（1.0.0 までは、マイナーバージョンの更新で API が変わることがあります）。

## [Unreleased]

### 変更

- 差し込み変数を、エディタの中では**変数名**（`{{ 商品名 }}`）で表示するようにした。`value` / `getHTML()` / ソース表示 / フォームの値では、これまでどおり変数値の文字列（`{{ product_name }}`）になる。
  - 読み込んだ本文のうち、`variables` にある変数の書式に一致する部分も変数名で表示する（一覧に無い変数・コードの中・属性値はそのまま）。本文の後に `variables` を設定した場合も表示が切り替わり、変更扱いにはならない。
  - 表示は編集中だけの要素で、書き出し時は元の文字列に戻る（変数に触れていなければ原文のまま）。

### 追加

- `data-formulit-text` 属性（`TEXT_ATTR`）：この属性を持つ要素は、書き出し時に要素ごと属性値の文字列に置き換わる（独自プラグインで「編集中だけの表示」を作る用）。
- プラグインの `prepare(root, editor)` に editor を渡すようにした。プラグインに `updated(editor, changedProperties)` を追加（エディタのプロパティ変更時に呼ばれる）。

## [0.2.1] - 2026-09-28

### 修正

- エディタ（`<formulit-editor>` / `<formulit-markdown>`）を Lit コンポーネントなどの**シャドウ DOM の中**に置くと、選択範囲を使う機能が動かなかった不具合を修正。`document.getSelection()` は Chrome・Safari でシャドウ DOM の中の選択を返さないため、`ShadowRoot#getSelection()`（Chromium）と `Selection#getComposedRanges()`（Safari・Firefox）で取得するようにした。
  - 影響していた機能：選択範囲へのリンク・書式、カーソル位置の判定（スラッシュコマンド・差し込み変数・ツールバーの状態表示など）、ダイアログを開いたあとの選択の復元、元に戻したときのカーソル位置、画像のドロップ位置、Markdown 版の選択範囲のコピー（`getSelectionMarkdown()`）。
- 元に戻したとき、カーソルが編集した位置ではなく段落の先頭などに戻ることがあった不具合を修正（編集を始める直前のカーソル位置を覚えるようにした）。

### 追加

- `getSelectionRange(node)` / `setSelectionRange(range, node)` / `activeElementOf(node)` / `caretRangeAt(x, y, node)`：シャドウ DOM の中でも使える選択範囲の取得・設定（独自プラグイン用）。

### 動作確認

- Chromium・Firefox・WebKit で自動テスト 108 項目（シャドウ DOM の中での操作 5 項目・元に戻すの 1 項目を追加）と formulit-markdown の 47 項目に合格。

## [0.2.0] - 2026-09-28

### 追加

- 継承して別の形式のエディタを作るための口（`@hidemikimura/formulit-markdown` が使用）。
  - `defaultToolbar`：`toolbar` を設定しないときのツールバー。継承した要素で差し替えられる。
  - `setNodeData(node, data)` / `getNodeData(node)` / `isNodeUnchanged(node)`：ノードに付加情報を持たせ、読み込み後に変更されたかを調べる（元に戻す・やり直しでも引き継がれる）。
  - 読み込み処理 `_loadContent(text)` を差し替えられるようにした。
- 編集領域の既定のスタイルが `<formulit-markdown>` にも効くようにした。

### 修正

- 入力変換（`` `code` ``・`**太字**` など）の直後に Enter を押すと、次の行にも装飾が持ち越されていた不具合を修正。
- 箇条書きのすぐ後の段落で `[] ` と入力（または ToDo ボタン）すると、前の箇条書きとつながって全体が ToDo になっていた不具合を修正。カーソルのある段落だけが ToDo になる。

### その他

- リポジトリを npm workspaces に分けた（`packages/formulit`・`packages/formulit-markdown`）。パッケージの中身と使い方は変わらない。

### 動作確認

- Chromium・Firefox・WebKit で自動テスト 102 項目に合格（上の 2 件の修正のテストを追加）。

## [0.1.1] - 2026-09-27

### 修正

- ページに付ける前に設定した `value` が、接続時に空で上書きされていた不具合を修正しました。`document.createElement('formulit-editor')` の直後に `value` を設定した場合や、Lit のテンプレートで `.value=${…}` を渡した場合（初回の描画・条件付きの描画）に、内容が空になっていました。
- 要素の定義（`import`）より前に設定した `value` と `imageUploader` が無視されていた不具合を修正しました。
- 接続前に設定した `value` は、子要素（`<script type="text/html">` など）の初期値より優先するようにしました。`form.reset()` でもその値に戻ります。

### 動作確認

- Chromium・Firefox・WebKit で自動テスト 100 項目に合格（接続前の設定・Lit からの利用のテストを 5 項目追加）。

## [0.1.0] - 2026-09-25

最初の公開版です。npm のパッケージ名は `@hidemikimura/formulit`（`npm install @hidemikimura/formulit lit`、`import '@hidemikimura/formulit'`）です。

### 追加

- **`<formulit-editor>`**: Lit 3 製のカスタム要素。ビルド不要の ES モジュールで、フォームにそのまま入ります（Form-associated Custom Element、`name` で送信、`reset` で初期値に戻る）。
- **手書き HTML の保持**
  - class・style・data-*・独自要素・コメント・空要素・iframe などを削らずに編集。
  - 未編集なら読み込んだ文字列を 1 文字も変えずに返し、編集後も触っていない部分は原文のまま返す（部分的な原文保持）。
  - 危険な部分（script・on* 属性・javascript: URL）だけを除去（`sanitize="none"` で除去しない）。
  - 初期値は `<script type="text/html">` で原文そのまま渡せる。
- **書式**: 見出し・スタイル（クラス適用）・フォント・文字サイズ・行間・文字色・背景色・太字などのインライン書式・配置・インデント・引用・書式のコピー・大文字小文字の変換・特殊文字と絵文字・書式のクリア。
- **リスト**: 箇条書き・番号付き・ToDo リスト、記号と番号の種類・開始番号・逆順。
- **画像**: 挿入と編集、キャプション、配置、ハンドルでのリサイズ、ドラッグ＆ドロップ・貼り付け・ファイル選択でのアップロード（`imageUploader`）。
- **表**: 行・列の挿入と削除、セルの結合と分割、見出し行・列、キャプション、表とセルのプロパティ、Tab でのセル移動。
- **埋め込み・コード**: メディア埋め込み（YouTube など）、HTML 埋め込み、コードブロック（言語指定）、改ページ、目次、リンク。
- **入力補助**: Markdown 風の入力変換、スラッシュコマンド（行頭で `/`）、差し込み変数（`variables`。ツールバーの検索つきコンボボックスと、本文で `{{` と入力しての呼び出し）。
- **生産性**: 検索と置換、文字数・単語数と上限、自動保存（`autosave`）、全画面、ショートカット一覧。
- **ツールバー**: 項目の並び替え、`{ label, items, icon }` でドロップダウンにまとめるグループ、画像・表などを選んだときのコンテキストツールバー。既定の `DEFAULT_TOOLBAR` と、まとめ表示の `COMPACT_TOOLBAR`。
- **プラグイン**: 組み込み機能もすべてプラグイン。ボタン・セレクト・ドロップダウン・ショートカット・コンテキストツールバー・ステータス表示・読み込み時の調整を追加できる。
- **ドキュメントサイト**（日本語・ライブデモ付き）と、AI 用スキル（`skills/formulit/`、Agent Skills 形式）。

### 動作確認

- Chromium・Firefox・WebKit の 3 エンジンで自動テスト 95 項目に合格。
- macOS の Safari で ⌘ キーのショートカットと日本語入力の確定を手動で確認。

[0.2.1]: https://github.com/hidemikimura/formulit/releases/tag/v0.2.1
[0.2.0]: https://github.com/hidemikimura/formulit/releases/tag/v0.2.0
[0.1.1]: https://github.com/hidemikimura/formulit/releases/tag/v0.1.1
[0.1.0]: https://github.com/hidemikimura/formulit/releases/tag/v0.1.0
