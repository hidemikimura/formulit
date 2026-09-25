// CHANGELOG.md から指定バージョン（省略時は package.json の version）の項目を取り出して表示する。
// GitHub リリースの本文に使う: gh release create v0.1.0 --notes "$(npm run -s release:notes)"
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const v = process.argv[2]?.replace(/^v/, '') ?? JSON.parse(await readFile(new URL('package.json', root), 'utf8')).version;
const log = await readFile(new URL('CHANGELOG.md', root), 'utf8');
const m = log.match(new RegExp(`^## \\[${v.replace(/\./g, '\\.')}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|^\\[[^\\]]+\\]:|(?![\\s\\S]))`, 'm'));
if (!m) { console.error(`CHANGELOG.md に ${v} の項目がありません`); process.exit(1); }
console.log(`${m[1].trim()}

---
- npm: https://www.npmjs.com/package/@hidemikimura/formulit/v/${v}
- ドキュメント: https://hidemikimura.github.io/formulit/
- AI 用スキル: 添付の formulit-skill.zip（Claude の設定の「スキル」からアップロード）`);
