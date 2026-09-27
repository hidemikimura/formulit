# 変更履歴

このプロジェクトの主な変更を記録します。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に、バージョンは [セマンティック バージョニング](https://semver.org/lang/ja/) に従います（1.0.0 までは、マイナーバージョンの更新で API が変わることがあります）。

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

[0.1.1]: https://github.com/hidemikimura/formulit/releases/tag/v0.1.1
[0.1.0]: https://github.com/hidemikimura/formulit/releases/tag/v0.1.0
