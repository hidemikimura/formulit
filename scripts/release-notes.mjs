// CHANGELOG.md から指定バージョン（省略時は package.json の version）の項目を取り出して表示する。
// GitHub リリースの本文に使う（パッケージのフォルダで実行するか、パッケージ名を指定）:
//   npm run -s release:notes -w packages/formulit
//   node scripts/release-notes.mjs formulit-markdown 0.1.0
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pickPackage } from './packages.mjs';

const args = process.argv.slice(2);
const p = pickPackage(args.find((a) => !/^v?\d/.test(a)));
const v = (args.find((a) => /^v?\d/.test(a)) ?? p.pkg.version).replace(/^v/, '');
const log = await readFile(join(p.abs, 'CHANGELOG.md'), 'utf8');
const m = log.match(new RegExp(`^## \\[${v.replace(/\./g, '\\.')}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|^\\[[^\\]]+\\]:|(?![\\s\\S]))`, 'm'));
if (!m) { console.error(`${p.dir}/CHANGELOG.md に ${v} の項目がありません`); process.exit(1); }
const lines = [
  `- npm: https://www.npmjs.com/package/${p.name}/v/${v}`,
  `- ドキュメント: ${p.docs}`,
];
if (p.key === 'formulit') lines.push('- AI 用スキル: 添付の formulit-skill.zip（Claude の設定の「スキル」からアップロード）');
console.log(`${m[1].trim()}\n\n---\n${lines.join('\n')}`);
