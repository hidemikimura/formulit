// <formulit-markdown> のブラウザテスト
// 使い方: npm run test:markdown   （BROWSER=firefox|webkit で切替）
import { chromium, firefox, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const browserName = process.env.BROWSER ?? 'chromium';
const engine = { chromium, firefox, webkit }[browserName];
const browser = await engine.launch(browserName === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
console.log(`[${browserName} ${browser.version()}] formulit-markdown`);
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', process.env.VERBOSE ? e.message : e.message.split('\n').slice(0, 3).join('\n      ')); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, label = '') => assert(a === b, `${label}\n期待: ${JSON.stringify(b)}\n実際: ${JSON.stringify(a)}`);

await page.goto(`${base}/demo/markdown.html`);
await page.waitForFunction(() => window.ed?.shadowRoot?.querySelector('.toolbar button'));

const val = () => page.evaluate(() => ed.value);
const setVal = (v) => page.evaluate((v) => { ed.value = v; }, v);
/** selector の要素の中の文字の位置 offset にカーソルを置く（テキストノードをたどる） */
const caret = (selector, offset = 0, index = 0) => page.evaluate(([s, o, i]) => {
  const el = ed.editable.querySelectorAll(s)[i];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let t; let left = o;
  while ((t = w.nextNode())) { if (left <= t.length) break; left -= t.length; }
  ed.focusEditor();
  const r = document.createRange();
  if (t) r.setStart(t, left); else r.setStart(el, 0);
  r.collapse(true); ed.selectRange(r);
}, [selector, offset, index]);
const selectChars = (selector, a, b, index = 0) => page.evaluate(([s, a, b, i]) => {
  const el = ed.editable.querySelectorAll(s)[i];
  const t = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
  ed.focusEditor();
  const r = document.createRange(); r.setStart(t, a); r.setEnd(t, b); ed.selectRange(r);
}, [selector, a, b, index]);
const typeAtEnd = async (selector, text, index = 0) => {
  await page.evaluate(([s, i]) => {
    const el = ed.editable.querySelectorAll(s)[i];
    ed.focusEditor();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); ed.selectRange(r);
  }, [selector, index]);
  await page.keyboard.type(text);
};
const click = (item) => page.click(`formulit-markdown >> button[data-item="${item}"]`);

const DOC = `Title
=====

Intro with __bold__ and _em_ and a [ref link][ref].

* star item
* second

1) paren list
2) two

<div class="note">

**Markdown inside HTML**

</div>

    indented code

~~~python
print("hi")
~~~

| a | b |
|:--|--:|
| 1 | 2 |

[ref]: https://example.com  "Example"
`;

console.log('原文の保持');
await test('未編集なら読み込んだ Markdown を 1 文字も変えずに返す', async () => {
  await setVal(DOC);
  eq(await val(), DOC);
  eq(await page.evaluate(() => ed.dirty), false, 'dirty');
});

await test('1 つの段落を編集しても、ほかのブロックは原文のまま（setext 見出し・* のリスト・__・参照定義・HTML ブロック・字下げコード・~~~）', async () => {
  await setVal(DOC);
  await typeAtEnd('ol li', ' three', 1);
  const out = await val();
  eq(out, DOC.replace('2) two', '2) two three'));
});

await test('新しい段落を足すと、そのブロックだけ書き足される', async () => {
  await setVal('# A\n\npara one\n\n\n\npara two\n');
  await typeAtEnd('p', '');
  await page.keyboard.press('Enter');
  await page.keyboard.type('added *x*');
  eq(await val(), '# A\n\npara one\n\nadded *x*\n\npara two\n');
});

await test('ブロックを削除しても、残りは原文のまま・参照定義は残る', async () => {
  await setVal('[x]: http://x.test\n\nfirst\n\nsecond [x]\n\nthird\n');
  await page.evaluate(() => ed.transact(() => ed.editable.querySelector('p').remove()));
  eq(await val(), '[x]: http://x.test\n\nsecond [x]\n\nthird\n');
});

await test('元に戻すと原文に戻る', async () => {
  await setVal(DOC);
  await typeAtEnd('p', ' 追記');
  assert((await val()).includes('追記'), '編集');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ControlOrMeta+z');
  eq(await val(), DOC);
});

await test('空のエディタは空文字、全部消すと空文字', async () => {
  await setVal('');
  eq(await val(), '');
  await setVal('# a\n\nb\n');
  await page.evaluate(() => { ed.focusEditor(); document.execCommand('selectAll'); });
  await page.keyboard.press('Backspace');
  eq(await val(), '');
});

await test('preserve-source="false" なら全体を書き直す（書き方がそろう）', async () => {
  await page.evaluate(() => { ed.preserveSource = false; });
  await setVal('Title\n=====\n\n* a\n* b\n');
  await typeAtEnd('li', '!', 1);
  eq(await val(), '# Title\n\n* a\n* b!\n');
  await page.evaluate(() => { ed.preserveSource = true; });
});

await test('全体を書き直しても（preserve-source="false"）、読み込み直すと同じ内容になる', async () => {
  const r = await page.evaluate(async (doc) => {
    const norm = (h) => h.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
    const demo = document.querySelector('#ed');
    const samples = [doc, demo._initialValue];
    const out = [];
    for (const md of samples) {
      ed.preserveSource = true;
      ed.value = md;
      const before = norm(ed.editable.innerHTML);
      ed.preserveSource = false;
      ed.transact(() => ed.editable.append(document.createComment('x')));
      ed.transact(() => ed.editable.lastChild.remove());
      const rewritten = ed.value;
      ed.preserveSource = true;
      ed.value = rewritten;
      out.push({ same: norm(ed.editable.innerHTML) === before, rewritten, before, after: norm(ed.editable.innerHTML) });
    }
    return out;
  }, DOC);
  for (const x of r) assert(x.same, `書き直し: ${x.rewritten}\n前: ${x.before}\n後: ${x.after}`);
});

console.log('Markdown への書き出し（往復で内容が変わらない）');
const ROUNDTRIP = [
  '# h1\n\n## h2 with `code`\n\n###### h6',
  'a **bold** *em* ***both*** ~~del~~ `co`de` ``x`y``',
  '[link](https://a.test/p "T") [paren](https://a.test/(x)) <https://auto.test> https://bare.test/path',
  '![alt text](https://img.test/a.png "cap")',
  '- a\n- b\n  - c\n    1. d\n    2. e\n- f',
  '3. three\n4. four',
  '- loose\n\n- items\n\n  second para',
  '- [ ] todo\n- [x] done **b**',
  '> quote\n> - list\n>\n> > nested',
  '````\n```js\ninner fence\n```\n````',
  '```\n```',
  '| a | b | c |\n|:--|:-:|--:|\n| 1 | `x\\|y` | a \\| b |\n| 2 |  |  |',
  'para\n\n---\n\nafter',
  'line one\\\nline two  \nline three\nsoft wrap',
  '\\*not em\\* \\# \\_x\\_ snake_case a_b_c 1\\. \\[x\\] \\<b> &amp;copy; \\~\\~',
  '\\# not heading\n\n\\- not list\n\n1\\. not ordered\n\n\\> not quote',
  'html <span style="color: red">red **md**</span> <u>u</u> <sup>2</sup>',
  '<div class="box">\n<p>raw</p>\n</div>',
  '<details>\n<summary>more</summary>\n\ninside\n\n</details>',
  '日本語の<strong>「強調」</strong>と<em>（括弧）</em>、<s>「取消」</s>',
  '日本語の**強調**と*斜体*と~~取消~~',
  'a <br> b',
  '<!-- comment -->\n\ntext',
];
for (const md of ROUNDTRIP) {
  await test(`往復: ${JSON.stringify(md).slice(0, 60)}`, async () => {
    const r = await page.evaluate(async (md) => {
      const m = await import('@hidemikimura/formulit-markdown');
      const norm = (h) => h.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
      const html1 = m.markdownToHTML(md);
      const md2 = m.htmlToMarkdown(html1);
      const html2 = m.markdownToHTML(md2);
      return { ok: norm(html1) === norm(html2), html1: norm(html1), html2: norm(html2), md2 };
    }, md);
    assert(r.ok, `書き出し: ${JSON.stringify(r.md2)}\n元の HTML: ${r.html1}\n再読込み: ${r.html2}`);
  });
}

await test('書き出しの形: 表せないものは HTML のまま、画像は ![]()', async () => {
  const r = await page.evaluate(async () => {
    const { htmlToMarkdown } = await import('@hidemikimura/formulit-markdown');
    return [
      htmlToMarkdown('<p><span style="color:red">x</span> <b>b</b></p>'),
      htmlToMarkdown('<table><tbody><tr><td colspan="2">merged</td></tr></tbody></table>'),
      htmlToMarkdown('<figure class="image"><img src="a.png" alt="A"></figure>'),
      htmlToMarkdown('<figure class="image"><img src="a.png" alt="A"><figcaption>cap</figcaption></figure>'),
      htmlToMarkdown('<ul><li>a</li></ul><ul><li>b</li></ul>'),
      htmlToMarkdown('<p><a href="https://x.test" target="_blank" rel="noopener">x</a></p>'),
      htmlToMarkdown('<pre><code class="language-js">a\n</code></pre>'),
      htmlToMarkdown('<table><tbody><tr><td>h</td><td>i</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>'),
      htmlToMarkdown('<my-card level="2">x</my-card>'),
    ];
  });
  eq(r[0], '<span style="color:red">x</span> **b**', 'span');
  eq(r[1], '<table><tbody><tr><td colspan="2">merged</td></tr></tbody></table>', '結合セル');
  eq(r[2], '![A](a.png)', '画像');
  assert(r[3].startsWith('<figure class="image">'), 'キャプション付き: ' + r[3]);
  eq(r[4], '- a\n\n* b', '続くリスト');
  eq(r[5], '<a href="https://x.test" target="_blank" rel="noopener">x</a>', 'target 付きリンク');
  eq(r[6], '```js\na\n```', 'コード');
  eq(r[7], '| h | i |\n| --- | --- |\n| 1 | 2 |', '見出し行なしの表');
  eq(r[8], '<my-card level="2">\nx</my-card>', '独自要素');
});

console.log('編集');
await test('入力変換: # 見出し・- 箇条書き・**太字**・[] ToDo・``` コード', async () => {
  await setVal('');
  await page.click('formulit-markdown .formulit-editable');
  await page.keyboard.type('# 見出し');
  await page.keyboard.press('Enter');
  await page.keyboard.type('本文 **太字** と `code`');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- 項目');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('[] やること');
  // ToDo は直前の箇条書きとは別のリスト（同じ記号だとつながるので * にする）
  eq(await val(), '# 見出し\n\n本文 **太字** と `code`\n\n- 項目\n\n* [ ] やること');
});

await test('ツールバー: 太字・リンク解除・番号付きリスト・引用', async () => {
  await setVal('hello world\n\nsecond\n');
  await selectChars('p', 0, 5);
  await click('bold');
  eq(await val(), '**hello** world\n\nsecond\n', '太字');
  await caret('p', 2, 1);
  await click('ol');
  eq(await val(), '**hello** world\n\n1. second\n', '番号付き');
  await caret('p', 2);
  await click('quote');
  eq(await val(), '> **hello** world\n\n1. second\n', '引用');
});

await test('ToDo をクリックで完了にすると [x]', async () => {
  await setVal('- [ ] a\n- [ ] b\n');
  await page.click('formulit-markdown .formulit-editable li:nth-child(2) input');
  await page.waitForTimeout(50);
  eq(await val(), '- [ ] a\n- [x] b\n');
});

await test('Markdown で表せない書式（文字色）は HTML で残り、読み込み直しても同じ', async () => {
  await setVal('text here\n');
  await page.evaluate(() => { ed.toolbar = ['fontColor']; });
  await page.waitForTimeout(30);
  await selectChars('p', 0, 4);
  await click('fontColor');
  await page.click('formulit-markdown >> .panel button[data-color]');
  await page.evaluate(() => { ed.toolbar = null; });
  const out = await val();
  assert(/^<span style="color: [^"]+;?">text<\/span> here\n$/.test(out), out);
  await setVal(out);
  eq(await val(), out, '読み込み直し');
  assert(await page.evaluate(() => !!ed.editable.querySelector('span[style*=color]')), 'span');
});

await test('ソース表示で Markdown を編集して戻すと反映される', async () => {
  await setVal('# a\n');
  await click('source');
  await page.waitForFunction(() => ed.shadowRoot.querySelector('textarea.source'));
  eq(await page.evaluate(() => ed.shadowRoot.querySelector('textarea.source').value), '# a\n', 'ソースは Markdown');
  await page.evaluate(() => { const t = ed.shadowRoot.querySelector('textarea.source'); t.value = '# a\n\n- [x] b\n'; t.dispatchEvent(new Event('input')); });
  await click('source');
  await page.waitForTimeout(50);
  eq(await val(), '# a\n\n- [x] b\n');
  assert(await page.evaluate(() => !!ed.editable.querySelector('ul.todo-list input[checked]')), '描画');
});

await test('Markdown の文字を貼り付けると書式付きで入る（1 行ならインライン）', async () => {
  await setVal('start\n');
  await typeAtEnd('p', '');
  const paste = (text) => page.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    // Firefox は合成イベントの clipboardData を無視するので、明示的に持たせる
    Object.defineProperty(ev, 'clipboardData', { value: dt });
    ed.editable.dispatchEvent(ev);
  }, text);
  await paste(' **b** [l](https://l.test)');
  eq(await val(), 'start **b** [l](https://l.test)\n', 'インライン');
  await setVal('x\n');
  await typeAtEnd('p', '');
  await paste('## H\n\n- a\n- b');
  const out = await val();
  assert(out.includes('## H') && out.includes('- a\n- b'), out);
});

await test('コピーした text/plain は Markdown', async () => {
  await setVal('a **b** c\n\n- x\n');
  const text = await page.evaluate(() => {
    ed.focusEditor();
    const r = document.createRange(); r.selectNodeContents(ed.editable); ed.selectRange(r);
    const dt = new DataTransfer();
    const ev = new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: dt });
    ed.editable.dispatchEvent(ev);
    return [dt.getData('text/plain'), dt.getData('text/html')];
  });
  eq(text[0], 'a **b** c\n\n- x');
  assert(text[1].includes('<strong>b</strong>') && !text[1].includes('data-formulit'), text[1]);
});

await test('差し込み変数を挿入できる（{{ title }}）', async () => {
  await setVal('Hi\n');
  await typeAtEnd('p', ' ');
  await page.evaluate(() => ed.insertVariable('title'));
  eq(await val(), 'Hi {{ title }}\n');
});

console.log('組み込み');
await test('<script type="text/markdown"> の初期値は共通の字下げを取って読み込む', async () => {
  const out = await page.evaluate(async () => {
    const box = document.createElement('div');
    box.innerHTML = `<formulit-markdown><script type="text/markdown">
        # T

        - a
          - b
    <\/script></formulit-markdown>`;
    document.body.append(box);
    const el = box.querySelector('formulit-markdown');
    await el.updateComplete;
    const r = [el.value, el.editable.querySelector('ul ul li')?.textContent];
    box.remove();
    return r;
  });
  eq(out[0], '# T\n\n- a\n  - b');
  eq(out[1], 'b');
});

await test('フォーム: FormData に Markdown が入り、reset で初期値に戻る', async () => {
  const out = await page.evaluate(async () => {
    const f = document.createElement('form');
    const el = document.createElement('formulit-markdown');
    el.setAttribute('name', 'body');
    el.value = '**init**';
    f.append(el);
    document.body.append(f);
    await el.updateComplete;
    el.value = 'changed';
    const a = new FormData(f).get('body');
    f.reset();
    const b = el.value;
    f.remove();
    return [a, b];
  });
  eq(out[0], 'changed');
  eq(out[1], '**init**');
});

await test('Lit のテンプレートで .value を渡せる', async () => {
  const out = await page.evaluate(async () => {
    const { html, render } = await import('lit');
    const box = document.createElement('div');
    document.body.append(box);
    render(html`<formulit-markdown .value=${'# lit'}></formulit-markdown>`, box);
    const el = box.querySelector('formulit-markdown');
    await el.updateComplete;
    const r = [el.value, el.editable.querySelector('h1')?.textContent, el.shadowRoot.querySelectorAll('.toolbar [data-item]').length];
    box.remove();
    return r;
  });
  eq(out[0], '# lit');
  eq(out[1], 'lit');
  assert(out[2] > 10 && out[2] < 30, 'Markdown 用のツールバー: ' + out[2]);
});

await test('危険な HTML・URL は除去される（script / on* / javascript:）', async () => {
  await setVal('<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">\n\n[x](javascript:alert(3))\n');
  const html = await page.evaluate(() => ed.editable.innerHTML);
  assert(!/<script|onerror|href="javascript:/.test(html), html);
  const out = await val();
  assert(!/<script|onerror/.test(out), out);
});

await test('<formulit-editor> と同じページで共存し、互いの既定ツールバーは別', async () => {
  const out = await page.evaluate(async () => {
    const a = document.createElement('formulit-editor');
    const b = document.createElement('formulit-markdown');
    document.body.append(a, b);
    await a.updateComplete; await b.updateComplete;
    const n = (el) => el.shadowRoot.querySelectorAll('.toolbar [data-item]').length;
    const r = [n(a), n(b), !!a.shadowRoot.querySelector('[data-item="fontColor"]'), !!b.shadowRoot.querySelector('[data-item="fontColor"]')];
    a.remove(); b.remove();
    return r;
  });
  assert(out[0] > out[1] && out[2] && !out[3], JSON.stringify(out));
});

await test('ページエラー・alert が発生していない', async () => {
  assert(errors.length === 0, errors.join('\n'));
});

await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${base}/demo/markdown.html`);
await page.waitForFunction(() => window.ed?.shadowRoot?.querySelector('.toolbar button'));
await page.screenshot({ path: new URL(`./screenshot-markdown-${browserName}.png`, import.meta.url).pathname, fullPage: true });

console.log(`\n[${browserName}] formulit-markdown ${pass} passed, ${fail} failed`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
