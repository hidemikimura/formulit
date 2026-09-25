// package.json の version をドキュメントサイトの表示（docs/assets/site.js）に反映する。
// npm version <patch|minor|major> の実行時に自動で呼ばれる（package.json の "version" スクリプト）。
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const file = new URL('docs/assets/site.js', root);
const src = await readFile(file, 'utf8');
await writeFile(file, src.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`));
console.log(`docs/assets/site.js を ${version} にしました`);
