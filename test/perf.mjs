// 入力性能の計測: node test/perf.mjs [small|large]
// 1 文字入力あたりのメインスレッド処理時間を、主要な処理ごとに内訳表示する
import { chromium, firefox, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = createServer(async (req, res) => {
  try {
    const p = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': extname(p) === '.html' ? 'text/html' : 'text/javascript' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);

const browserName = process.env.BROWSER ?? 'chromium';
const engine = { chromium, firefox, webkit }[browserName];
const browser = await engine.launch(browserName === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto(`http://localhost:${server.address().port}/demo/index.html`);
await page.waitForFunction(() => window.ed?.shadowRoot?.querySelector('.toolbar button'));

const size = process.argv[2] ?? 'small';
await page.evaluate((size) => {
  let body = ed.value;
  if (size === 'large') {
    body = '';
    for (let i = 0; i < 300; i++) {
      body += `<h2 id=s${i}>見出し ${i}</h2>\n<p class=p${i}>段落 ${i} の <b>本文</b> と <a href='/x/${i}'>リンク</a> &amp; <span style="color:#c00">色付き</span>。</p>\n`;
      if (i % 30 === 0) body += '<table><tr><th>a<th>b<tr><td>1<td>2</table>\n';
    }
  }
  ed.value = body;
  // 計測用に主要メソッドを包む
  const stats = (window.__stats = {});
  const wrap = (obj, name, label = name) => {
    const orig = obj[name];
    obj[name] = function (...a) {
      const t = performance.now();
      try { return orig.apply(this, a); } finally {
        const s = (stats[label] ??= { n: 0, ms: 0 });
        s.n++; s.ms += performance.now() - t;
      }
    };
  };
  const proto = Object.getPrototypeOf(ed);
  ['update', '_serializePreserving', '_onMutations', '_renderOverlays', '_renderToolbar', '_syncFormValue', '_flushTyping', '_updateEmpty'].forEach((n) => wrap(proto, n));
  wrap(ed.history, 'record', 'history.record');
  // 1 キー入力あたりの「イベント開始〜次の描画まで」の時間
  window.__frames = [];
  ed.editable.addEventListener('keydown', () => {
    const t0 = performance.now();
    requestAnimationFrame(() => setTimeout(() => window.__frames.push(performance.now() - t0)));
  });
}, size);

const p = await page.$('formulit-editor p');
await p.click();
await page.keyboard.press('End');
const N = 40;
const t0 = Date.now();
for (let i = 0; i < N; i++) await page.keyboard.type('あ'.length ? 'x' : 'x');
await page.waitForTimeout(800);
const wall = Date.now() - t0;
const res = await page.evaluate(() => ({ stats: window.__stats, frames: window.__frames }));
const f = res.frames.sort((a, b) => a - b);
console.log(`[${browserName} / ${size}] ${N} 文字入力  keydown→描画: 中央値 ${f[f.length >> 1]?.toFixed(1)}ms, 最大 ${f.at(-1)?.toFixed(1)}ms`);
for (const [k, v] of Object.entries(res.stats).sort((a, b) => b[1].ms - a[1].ms)) {
  console.log(`  ${k.padEnd(22)} ${String(v.n).padStart(4)} 回  合計 ${v.ms.toFixed(1).padStart(7)}ms  1 文字あたり ${(v.ms / N).toFixed(2)}ms`);
}
await browser.close();
server.close();
