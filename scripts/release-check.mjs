// 公開前のチェック（npm publish の直前に自動で実行される。単独では npm run release:check）
//  1. バージョン表記がそろっているか（package.json / package-lock.json / CHANGELOG.md / ドキュメントサイト）
//  2. パッケージに入るファイルが想定どおりか（npm pack --dry-run）
//  3. 同梱する src の import がパッケージ内と lit だけで解決できるか
//  4. ブラウザテスト（Chromium）が通るか   ※ SKIP_TESTS=1 で省略
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, relative, normalize } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFile(join(root, p), 'utf8');
const errors = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const ng = (msg) => { errors.push(msg); console.log(`  ✗ ${msg}`); };

const pkg = JSON.parse(await read('package.json'));
const v = pkg.version;
console.log(`formulit v${v} の公開前チェック`);

// 1. バージョン表記
console.log('バージョン');
const lock = JSON.parse(await read('package-lock.json'));
lock.version === v && lock.packages?.['']?.version === v ? ok('package-lock.json') : ng(`package-lock.json のバージョンが ${lock.version}（npm install で更新してください）`);
(await read('CHANGELOG.md')).includes(`## [${v}]`) ? ok('CHANGELOG.md') : ng(`CHANGELOG.md に「## [${v}]」の項目がありません`);
(await read('docs/assets/site.js')).includes(`const VERSION = '${v}'`) ? ok('docs/assets/site.js') : ng(`docs/assets/site.js の VERSION が ${v} ではありません`);
existsSync(join(root, 'LICENSE')) ? ok('LICENSE') : ng('LICENSE がありません');

// 2. パッケージの中身
console.log('パッケージの中身');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const [packed] = JSON.parse(execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' }));
const files = packed.files.map((f) => f.path);
const unexpected = files.filter((f) => !/^(src|skills)\//.test(f) && !['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md'].includes(f));
unexpected.length ? ng(`想定外のファイル: ${unexpected.join(', ')}`) : ok(`${files.length} ファイル、${(packed.size / 1024).toFixed(1)} KB（展開後 ${(packed.unpackedSize / 1024).toFixed(1)} KB）`);
for (const must of ['src/index.js', 'skills/formulit/SKILL.md', 'README.md', 'LICENSE']) {
  if (!files.includes(must)) ng(`${must} が含まれていません`);
}

// 3. import の解決
console.log('import の解決');
const walk = async (dir) => (await readdir(join(root, dir), { withFileTypes: true }))
  .flatMap((e) => (e.isDirectory() ? [walk(join(dir, e.name))] : e.name.endsWith('.js') ? [join(dir, e.name)] : []));
const flat = async (dir) => (await Promise.all(await walk(dir))).flat(Infinity);
const srcFiles = await flat('src');
let bad = 0;
for (const f of srcFiles) {
  const code = await read(f);
  for (const [, spec] of code.matchAll(/(?:import|export)\s[^'"]*?from\s*'([^']+)'|import\s*'([^']+)'/g)) {
    if (!spec) continue;
    if (spec === 'lit' || spec.startsWith('lit/')) continue;
    if (!spec.startsWith('.')) { ng(`${f}: パッケージ外の import '${spec}'`); bad++; continue; }
    const target = relative(root, normalize(join(root, dirname(f), spec))).split('\\').join('/');
    if (!files.includes(target)) { ng(`${f}: '${spec}' がパッケージに含まれていません`); bad++; }
  }
}
if (!bad) ok(`src の ${srcFiles.length} ファイルすべて、パッケージ内と lit で解決`);

// 4. テスト
if (process.env.SKIP_TESTS) {
  console.log('テスト: SKIP_TESTS のため省略');
} else {
  console.log('テスト（Chromium）');
  try {
    execFileSync(process.execPath, [join(root, 'test/run.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' })
      .split('\n').filter((l) => /passed|✗/.test(l)).forEach((l) => console.log(`  ${l.trim()}`));
    ok('ブラウザテスト');
  } catch (e) {
    (e.stdout ?? '').split('\n').filter((l) => /passed|✗/.test(l)).forEach((l) => console.log(`  ${l.trim()}`));
    ng('ブラウザテストが失敗しました');
  }
}

if (errors.length) {
  console.log(`\n${errors.length} 件の問題があります。公開を中止しました。`);
  process.exit(1);
}
console.log(`\nv${v} を公開できます。`);
