// 各パッケージの version をドキュメントサイトの表示（docs/assets/site.js の VERSIONS）に反映する。
// scripts/release.mjs から呼ばれる。単独では node scripts/sync-version.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PACKAGES, pickPackage, root } from './packages.mjs';

const file = join(root, 'docs/assets/site.js');
let src = await readFile(file, 'utf8');
for (const key of Object.keys(PACKAGES)) {
  const { pkg } = pickPackage(key);
  src = src.replace(new RegExp(`('${key}': )'[^']*'`), `$1'${pkg.version}'`);
  console.log(`docs/assets/site.js: ${key} = ${pkg.version}`);
}
await writeFile(file, src);
