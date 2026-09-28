// 公開前のチェック（npm publish の直前に自動で実行される。単独では npm run release:check -w packages/<名前>）
//  1. バージョン表記がそろっているか（package.json / package-lock.json / CHANGELOG.md / ドキュメントサイト）
//  2. パッケージに入るファイルが想定どおりか（npm pack --dry-run）
//  3. 同梱する src の import が、パッケージ内と dependencies / peerDependencies だけで解決できるか
//  4. 依存する formulit のバージョンが npm に公開済みか（formulit-markdown のみ）
//  5. ブラウザテスト（Chromium）が通るか   ※ SKIP_TESTS=1 で省略
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname, relative, normalize } from 'node:path';
import { pickPackage, PACKAGES, root } from './packages.mjs';

const p = pickPackage(process.argv[2]);
const { pkg, abs } = p;
const v = pkg.version;
const errors = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const ng = (msg) => { errors.push(msg); console.log(`  ✗ ${msg}`); };
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
console.log(`${pkg.name} v${v} の公開前チェック`);

// 1. バージョン表記
console.log('バージョン');
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
lock.packages?.[p.dir]?.version === v ? ok('package-lock.json') : ng(`package-lock.json の ${p.dir} が ${lock.packages?.[p.dir]?.version}（npm install で更新してください）`);
(await readFile(join(abs, 'CHANGELOG.md'), 'utf8')).includes(`## [${v}]`) ? ok('CHANGELOG.md') : ng(`${p.dir}/CHANGELOG.md に「## [${v}]」の項目がありません`);
(await readFile(join(root, 'docs/assets/site.js'), 'utf8')).includes(`'${p.key}': '${v}'`) ? ok('docs/assets/site.js') : ng(`docs/assets/site.js の VERSIONS['${p.key}'] が ${v} ではありません（node scripts/sync-version.mjs）`);
existsSync(join(abs, 'LICENSE')) ? ok('LICENSE') : ng(`${p.dir}/LICENSE がありません`);

// 2. パッケージの中身
console.log('パッケージの中身');
const [packed] = JSON.parse(execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: abs, encoding: 'utf8' }));
const files = packed.files.map((f) => f.path);
const unexpected = files.filter((f) => !p.files.test(f) && !['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md'].includes(f));
unexpected.length ? ng(`想定外のファイル: ${unexpected.join(', ')}`) : ok(`${files.length} ファイル、${(packed.size / 1024).toFixed(1)} KB（展開後 ${(packed.unpackedSize / 1024).toFixed(1)} KB）`);
for (const must of p.must) if (!files.includes(must)) ng(`${must} が含まれていません`);

// 3. import の解決
console.log('import の解決');
const deps = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})]);
const pkgNameOf = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
const walk = async (dir) => (await readdir(join(abs, dir), { withFileTypes: true }))
  .flatMap((e) => (e.isDirectory() ? [walk(join(dir, e.name))] : e.name.endsWith('.js') ? [join(dir, e.name)] : []));
const srcFiles = (await Promise.all(await walk('src'))).flat(Infinity);
let bad = 0;
for (const f of srcFiles) {
  const code = await readFile(join(abs, f), 'utf8');
  for (const [, a, b] of code.matchAll(/(?:import|export)\s[^'"]*?from\s*'([^']+)'|import\s*'([^']+)'/g)) {
    const spec = a ?? b;
    if (!spec.startsWith('.')) {
      if (!deps.has(pkgNameOf(spec))) { ng(`${f}: '${spec}' が dependencies / peerDependencies にありません`); bad++; }
      continue;
    }
    const target = relative(abs, normalize(join(abs, dirname(f), spec))).split('\\').join('/');
    if (!files.includes(target)) { ng(`${f}: '${spec}' がパッケージに含まれていません`); bad++; }
  }
}
if (!bad) ok(`src の ${srcFiles.length} ファイルすべて、パッケージ内と依存パッケージ（${[...deps].join(', ') || 'なし'}）で解決`);

// 4. 依存する formulit が公開済みか
for (const [key, other] of Object.entries(PACKAGES)) {
  const range = pkg.peerDependencies?.[other.name] ?? pkg.dependencies?.[other.name];
  if (!range || key === p.key) continue;
  console.log(`依存する ${other.name}`);
  const local = pickPackage(key).pkg.version;
  let published = '';
  try { published = execFileSync(npm, ['view', `${other.name}@${range}`, 'version', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* 未公開・オフライン */ }
  published
    ? ok(`${range} を満たす版が npm にある（${JSON.parse(published).toString()}）`)
    : ng(`${other.name}@${range} が npm にありません。先に ${other.name}（手元は ${local}）を公開してください`);
}

// 5. テスト
if (process.env.SKIP_TESTS) {
  console.log('テスト: SKIP_TESTS のため省略');
} else {
  console.log('テスト（Chromium）');
  const pick = (out) => (out ?? '').split('\n').filter((l) => /passed|✗/.test(l)).forEach((l) => console.log(`  ${l.trim()}`));
  try {
    pick(execFileSync(process.execPath, [join(root, p.test)], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }));
    ok('ブラウザテスト');
  } catch (e) {
    pick(e.stdout);
    ng('ブラウザテストが失敗しました');
  }
}

if (errors.length) {
  console.log(`\n${errors.length} 件の問題があります。公開を中止しました。`);
  process.exit(1);
}
console.log(`\n${pkg.name} v${v} を公開できます。`);
