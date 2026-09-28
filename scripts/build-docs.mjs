// ドキュメントサイト（docs/）用に、ライブラリ本体と lit を docs/lib/ へコピーする。
// docs/ をそのまま静的ホスティング（GitHub Pages など）に置けるようにするため。
// 使い方: npm run docs:build
import { cp, rm, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'docs', 'lib');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const pkgs = join(root, 'packages');
await cp(join(pkgs, 'formulit', 'src'), join(out, 'formulit', 'src'), { recursive: true });
await cp(join(pkgs, 'formulit-markdown', 'src'), join(out, 'formulit-markdown', 'src'), { recursive: true });
// markdown-it は依存を含んだ 1 ファイル版（ブラウザ用 ES モジュール）をそのまま使う
await mkdir(join(out, 'vendor', 'markdown-it'), { recursive: true });
await cp(join(root, 'node_modules', 'markdown-it', 'dist', 'browser', 'markdown-it.esm.min.mjs'), join(out, 'vendor', 'markdown-it', 'markdown-it.js'));

// 実行に必要な .js だけ（型定義・ソースマップ・開発用ビルドは除く）
const keep = (src) => !/\.(d\.ts|map|md)$/.test(src) && !/[\\/]development([\\/]|$)/.test(src) && !/[\\/]node_modules[\\/].+[\\/]node_modules/.test(src);
for (const pkg of ['lit', 'lit-html', 'lit-element', '@lit/reactive-element']) {
  await cp(join(root, 'node_modules', pkg), join(out, 'vendor', pkg), { recursive: true, filter: keep });
}
// AI 用スキル：閲覧用のコピーと、アップロード用の zip
await rm(join(root, 'docs', 'skills'), { recursive: true, force: true });
const skills = join(pkgs, 'formulit', 'skills');
await cp(join(skills, 'formulit'), join(root, 'docs', 'skills', 'formulit'), { recursive: true });
try {
  await rm(join(root, 'docs', 'assets', 'formulit-skill.zip'), { force: true });
  execFileSync('zip', ['-rq', join(root, 'docs', 'assets', 'formulit-skill.zip'), 'formulit'], { cwd: skills });
} catch {
  console.warn('zip コマンドが無いため formulit-skill.zip は作成しませんでした');
}
console.log('docs/lib・docs/skills を更新しました');
