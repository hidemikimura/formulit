# AI 用スキル

formulit を組み込む・設定する・プラグインで拡張するコードを AI（Claude など）に正しく書かせるためのスキルです。
[Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) の形式（`SKILL.md` + `references/`）になっています。

```
skills/formulit/
  SKILL.md                         概要・必ず守ること・よくある間違い
  references/api.md                属性・プロパティ・メソッド・イベント・CSS 変数・export
  references/toolbar.md            ツールバー項目名とグループ
  references/plugins.md            独自プラグインの作り方
  references/recipes.md            実装例（Lit・フォーム・アップロード・自動保存・CDN など）
  references/html-preservation.md  HTML 保持の仕組みとトラブルシューティング
```

## 使い方

- **Claude Code**: 利用するプロジェクトの `.claude/skills/` にフォルダごとコピーします。

  ```bash
  mkdir -p .claude/skills
  cp -r node_modules/@hidemikimura/formulit/skills/formulit .claude/skills/
  ```

- **Claude（claude.ai / デスクトップアプリ）**: `skills/formulit` フォルダを zip にして、設定の「スキル」からアップロードします。

ライブラリの API を変えたときは、このスキルも合わせて更新してください。
