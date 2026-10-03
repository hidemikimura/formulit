# 変更履歴

このパッケージ（`@hidemikimura/formulit-markdown`）の主な変更を記録します。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に、バージョンは [セマンティック バージョニング](https://semver.org/lang/ja/) に従います（1.0.0 までは、マイナーバージョンの更新で API が変わることがあります）。

## [Unreleased]

### 変更

- 差し込み変数をエディタの中では変数名（`{{ 商品名 }}`）で表示し、Markdown には変数値の文字列（`{{ product_name }}`）を書き出す（`@hidemikimura/formulit` の次の版が必要）。

## [0.1.0] - 2026-09-28

最初の公開版です。`@hidemikimura/formulit` 0.2.0 以降が必要です。

### 追加

- **`<formulit-markdown>`**：見たまま編集して、`value` は Markdown（GFM）。`FormulitEditor` を継承し、formulit のツールバー・プラグイン・入力補助・フォーム連携をそのまま使える。
- **原文の保持**：未編集なら読み込んだ Markdown を 1 文字も変えずに返す。編集後も、触っていないブロックは原文のまま（空行の数・参照定義を含む）で、編集したブロックだけ書き直す。元に戻すと原文に戻る。
- **GFM**：表（配置つき）・取り消し線・ToDo リスト（formulit の ToDo と同じ操作）・自動リンク。
- **表せない内容は HTML のまま**：文字色・下線・結合セル・属性付きの要素・独自要素など。読み込んだ生の HTML も保持。
- **入力**：Markdown の文字の貼り付け（書式付きで入る）、コピーした text/plain は Markdown、ソース表示は Markdown。
- **初期値**：`<script type="text/markdown">`（共通の字下げを除去）。
- **関数**：`markdownToHTML`・`htmlToMarkdown`・`createMarkdownIt`・`parseBlocks`・`nodesToMarkdown`・`detectStyle`。
- **既定の見た目**：引用の線・コードの背景・表の罫線など（`plain` 属性で無効）。

### 動作確認

- Chromium・Firefox・WebKit で自動テスト 46 項目に合格（原文の保持、Markdown への書き出しの往復 23 例、入力変換・ツールバー・ToDo・ソース表示・貼り付け・コピー・フォーム・Lit）。

[0.1.0]: https://github.com/hidemikimura/formulit/releases/tag/formulit-markdown-v0.1.0
