// バージョンを上げて、コミットとタグを作る（npm workspaces では npm version がタグを作らないため）
//   npm run release -- formulit patch            # 0.2.0 → 0.2.1、タグ v0.2.1
//   npm run release -- markdown minor            # formulit-markdown 0.1.0 → 0.2.0、タグ formulit-markdown-v0.2.0
//   npm run release -- formulit 0.3.0            # バージョンを直接指定
// 先に packages/<名前>/CHANGELOG.md に新しいバージョンの項目（## [x.y.z] - 日付）を書いてコミットしておくこと。
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pickPackage, root } from './packages.mjs';

const [target, bump] = process.argv.slice(2);
if (!target || !bump) {
  console.error('使い方: npm run release -- <formulit|markdown> <patch|minor|major|x.y.z>');
  process.exit(1);
}
const p = pickPackage(target);
const run = (cmd, args, opts = {}) => (execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts }) ?? '').trim();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

// 1. 作業ツリーがきれいか
if (run('git', ['status', '--porcelain', '--untracked-files=no'])) fail('コミットしていない変更があります。先にコミットしてください');

// 2. 新しいバージョン
const cur = p.pkg.version.split('.').map(Number);
const next = /^\d+\.\d+\.\d+$/.test(bump) ? bump
  : bump === 'major' ? `${cur[0] + 1}.0.0`
    : bump === 'minor' ? `${cur[0]}.${cur[1] + 1}.0`
      : bump === 'patch' ? `${cur[0]}.${cur[1]}.${cur[2] + 1}`
        : fail(`不明な指定: ${bump}`);
const tag = `${p.tagPrefix}${next}`;
if (run('git', ['tag', '-l', tag])) fail(`タグ ${tag} はすでにあります`);
const log = await readFile(join(p.abs, 'CHANGELOG.md'), 'utf8');
if (!log.includes(`## [${next}]`)) fail(`${p.dir}/CHANGELOG.md に「## [${next}]」の項目を書いてから実行してください`);

// 3. package.json・package-lock.json・ドキュメントの表記を更新
console.log(`${p.pkg.name}: ${p.pkg.version} → ${next}`);
run(npm, ['version', next, '--no-git-tag-version', '-w', p.dir]);
run(process.execPath, [join(root, 'scripts/sync-version.mjs')], { stdio: 'inherit' });

// 4. コミットとタグ
run('git', ['add', join(p.dir, 'package.json'), 'package-lock.json', 'docs/assets/site.js']);
run('git', ['commit', '-m', `${p.pkg.name}@${next}`]);
run('git', ['tag', '-a', tag, '-m', `${p.pkg.name}@${next}`]);
console.log(`\nコミットとタグ ${tag} を作りました。続けて:
  git push origin main ${tag}
  npm publish -w ${p.dir}
  gh release create ${tag} --title "${p.pkg.name}@${next}" --notes "$(node scripts/release-notes.mjs ${p.key})"${p.assets.map((a) => ` ${a}`).join('')}`);
