// リリース用スクリプトで共通に使う、パッケージの一覧と情報
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

export const root = fileURLToPath(new URL('..', import.meta.url));

export const PACKAGES = {
  formulit: {
    dir: 'packages/formulit',
    name: '@hidemikimura/formulit',
    tagPrefix: 'v', // v0.1.0 からの続き
    test: 'test/run.mjs',
    files: /^(src|skills)\//,
    must: ['src/index.js', 'skills/formulit/SKILL.md', 'README.md', 'LICENSE'],
    docs: 'https://hidemikimura.github.io/formulit/',
    assets: ['docs/assets/formulit-skill.zip'],
  },
  'formulit-markdown': {
    dir: 'packages/formulit-markdown',
    name: '@hidemikimura/formulit-markdown',
    tagPrefix: 'formulit-markdown-v',
    test: 'test/markdown.mjs',
    files: /^src\//,
    must: ['src/index.js', 'README.md', 'LICENSE'],
    docs: 'https://hidemikimura.github.io/formulit/markdown.html',
    assets: [],
  },
};

/** 引数（formulit / formulit-markdown / markdown）か、実行中のフォルダからパッケージを決める */
export function pickPackage(arg) {
  const key = arg === 'markdown' ? 'formulit-markdown' : arg;
  if (key && PACKAGES[key]) return { key, ...PACKAGES[key], ...readPkg(PACKAGES[key].dir) };
  const cwd = resolve(process.cwd());
  for (const [k, p] of Object.entries(PACKAGES)) {
    if (cwd === resolve(root, p.dir)) return { key: k, ...p, ...readPkg(p.dir) };
  }
  throw new Error(`パッケージを指定してください: ${Object.keys(PACKAGES).join(' / ')}`);
}

function readPkg(dir) {
  const file = join(root, dir, 'package.json');
  if (!existsSync(file)) throw new Error(`${file} がありません`);
  return { pkg: JSON.parse(readFileSync(file, 'utf8')), abs: join(root, dir) };
}
