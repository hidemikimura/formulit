// ドキュメントサイトの確認: 全ページを開いてエラーがないこと、ライブデモのエディタが動くことを確かめる
// 使い方: npm run docs:build && node test/docs.mjs   （BROWSER=firefox|webkit、SHOTS=1 でスクリーンショット）
import { chromium, firefox, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = fileURLToPath(new URL('../docs/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(docs, p));
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const name = process.env.BROWSER ?? 'chromium';
const engine = { chromium, firefox, webkit }[name];
const browser = await engine.launch(name === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const pages = (await readdir(docs)).filter((f) => f.endsWith('.html')).sort();
let fail = 0;
for (const file of pages) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(base)) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${base}/${file}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => ({
    editors: document.querySelectorAll('formulit-editor, formulit-markdown').length,
    ready: [...document.querySelectorAll('formulit-editor, formulit-markdown')].filter((e) => e.shadowRoot?.querySelector('.toolbar')).length,
    sidebar: !!document.querySelector('.sidebar a.on'),
    empty: [...document.querySelectorAll(':is(formulit-editor, formulit-markdown):not([data-empty])')].filter((e) => !e.editable?.textContent.trim() && !e.editable?.querySelector('img,table,hr')).map((e) => e.id || '(id なし)'),
    leftovers: document.querySelectorAll('script.code[type="text/plain"]').length,
  }));
  // 各エディタに 1 文字入力できるか
  let typed = 0;
  for (let i = 0; i < info.editors; i++) {
    const ok = await page.evaluate(async (i) => {
      const ed = document.querySelectorAll('formulit-editor, formulit-markdown')[i];
      if (ed.readonly) return true;
      const before = ed.value;
      ed.focusEditor();
      const r = document.createRange();
      r.selectNodeContents(ed.editable);
      r.collapse(false);
      ed.selectRange(r);
      ed.transact(() => ed.insertNodesAtSelection(document.createTextNode('Z')));
      const ok2 = ed.value !== before && ed.value.includes('Z');
      ed.undo();
      return ok2;
    }, i);
    if (ok) typed++;
  }
  const problems = [...errors];
  if (info.ready !== info.editors) problems.push(`エディタ ${info.editors} 個中 ${info.ready} 個しか初期化されていない`);
  if (typed !== info.editors) problems.push(`入力できたエディタ ${typed}/${info.editors}`);
  if (!info.sidebar) problems.push('サイドバーの現在ページ表示がない');
  if (info.leftovers) problems.push('未変換のコードブロックがある');
  if (info.empty.length) problems.push(`初期内容が空のエディタ: ${info.empty.join(', ')}`);
  if (process.env.SHOTS) await page.screenshot({ path: `/tmp/docs-${file.replace('.html', '')}.png`, fullPage: true });
  console.log(`${problems.length ? '✗' : '✓'} ${file}  （エディタ ${info.editors}）${problems.length ? `\n    ${problems.join('\n    ')}` : ''}`);
  if (problems.length) fail++;
  await page.close();
}
console.log(`\n[${name}] ${pages.length - fail}/${pages.length} ページ OK`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
