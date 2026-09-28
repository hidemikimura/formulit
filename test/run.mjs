// ブラウザ（Chromium）で実際に動かして検証する。
// 使い方: npm test  （内部で静的サーバを起動します）
//         BROWSER=firefox npm test / BROWSER=webkit npm test / npm run test:all
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
if (!engine) throw new Error(`unknown BROWSER: ${browserName}`);
const browser = await engine.launch(browserName === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
console.log(`[${browserName} ${browser.version()}]`);
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', process.env.VERBOSE ? e.message : e.message.split('\n').slice(0, 1).join('')); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

await page.goto(`${base}/demo/index.html`);
await page.waitForFunction(() => window.ed?.shadowRoot?.querySelector('.toolbar button'));

const val = () => page.evaluate(() => ed.value);
const setVal = (v) => page.evaluate((v) => { ed.value = v; }, v);
const placeCaret = (selector, offset = 0) => page.evaluate(([s, o]) => {
  const el = ed.editable.querySelector(s);
  const node = el.firstChild?.nodeType === 3 ? el.firstChild : el;
  ed.focusEditor();
  const r = document.createRange(); r.setStart(node, o); r.collapse(true);
  ed.selectRange(r);
}, [selector, offset]);
const selectText = (selector) => page.evaluate((s) => {
  const el = ed.editable.querySelector(s);
  ed.focusEditor();
  const r = document.createRange(); r.selectNodeContents(el); ed.selectRange(r);
}, selector);
const click = (item) => page.click(`formulit-editor >> button[data-item="${item}"]`);

console.log('HTML保持');
await test('未編集なら読み込んだ文字列をバイト単位でそのまま返す', async () => {
  const src = `<P CLASS='x'>大文字 &amp; 'シングル' 引用符<br/></P>\n<!-- c -->\n<x-foo bar></x-foo>`;
  await setVal(src);
  assert(await val() === src, 'value が原文と一致しない: ' + await val());
});

await test('初期値を <script type="text/html"> で渡すと原文を 1 文字も変えずに読み込む（<template> はブラウザが整形）', async () => {
  const out = await page.evaluate(async () => {
    const box = document.createElement('div');
    box.innerHTML = `<formulit-editor><script type="text/html">
<P CLASS='x'>a &copy; b<br/></P><li>open
<\/script></formulit-editor><formulit-editor><template><P CLASS='x'>a &copy; b<br/></P></template></formulit-editor>`;
    document.body.append(box);
    await new Promise((r) => setTimeout(r));
    const [a, b] = box.querySelectorAll('formulit-editor');
    const res = [a.value, b.value];
    box.remove();
    return res;
  });
  assert(out[0] === "<P CLASS='x'>a &copy; b<br/></P><li>open", 'script: ' + JSON.stringify(out[0]));
  assert(out[1] === '<p class="x">a © b<br></p>', 'template: ' + JSON.stringify(out[1]));
});

await test('編集後も class / data-* / style / 独自要素 / コメント / 空要素 / iframe を保持', async () => {
  const src = '<div class="note" data-type="info"><p>abc <i class="icon"></i><span style="color:red" data-x="1">red</span></p></div>'
    + '<!-- keep --><my-badge level="3">x</my-badge><details><summary>s</summary><p>d</p></details>'
    + '<iframe src="about:blank" title="t"></iframe><table><tbody><tr><td colspan="2">c</td></tr></tbody></table>';
  await setVal(src);
  await placeCaret('.note p', 3);
  await page.keyboard.type('XYZ');
  const out = await val();
  assert(out.includes('abcXYZ'), '入力が反映されていない');
  for (const part of ['<div class="note" data-type="info">', '<i class="icon"></i>', 'style="color:red" data-x="1"',
    '<!-- keep -->', '<my-badge level="3">x</my-badge>', '<details><summary>s</summary>', '<iframe src="about:blank" title="t"></iframe>', 'colspan="2"']) {
    assert(out.includes(part), `欠落: ${part}\n${out}`);
  }
  assert(!out.includes('data-formulit') && !out.includes('contenteditable'), '内部属性が漏れている: ' + out);
});

await test('<style> は編集中だけ無効化し、出力では元どおり', async () => {
  await setVal('<style media="print">.a{color:red}</style><style>.b{}</style><p>x</p>');
  const media = await page.evaluate(() => [...ed.editable.querySelectorAll('style')].map((s) => s.media));
  assert(media.every((m) => m === 'not all'), '編集中に無効化されていない');
  await placeCaret('p', 1); await page.keyboard.type('y');
  assert(await val() === '<style media="print">.a{color:red}</style><style>.b{}</style><p>xy</p>', await val());
});

await test('script / on* / javascript: を除去（sanitize="strip"）', async () => {
  await setVal('<p onclick="alert(1)">a</p><script>alert(2)</script><a href="javascript:alert(3)">l</a><img src=x onerror="alert(4)">');
  await placeCaret('p', 1); await page.keyboard.type('b');
  const out = await val();
  assert(!/onclick|onerror|<script|javascript:/.test(out), out);
  assert(out.includes('<p>ab</p>') && out.includes('<a>l</a>'), out);
});

await test('sanitize="none" なら危険な属性も出力に残す（編集中は無効化）', async () => {
  await page.evaluate(() => { ed.sanitize = 'none'; });
  await setVal('<p onclick="alert(1)">a</p>');
  const live = await page.evaluate(() => ed.editable.querySelector('p').hasAttribute('onclick'));
  assert(!live, '編集中に onclick が生きている');
  await placeCaret('p', 1); await page.keyboard.type('b');
  assert(await val() === '<p onclick="alert(1)">ab</p>', await val());
  await page.evaluate(() => { ed.sanitize = 'strip'; });
});

await test('サニタイズで除去があれば、未編集でも除去後の HTML を返す', async () => {
  await setVal('<p onclick="x()">a</p><script>y()</script>');
  assert(await val() === '<p>a</p>', await val());
});

console.log('部分的な原文保持');
const typeAt = async (selector, textOffset, text, index = 0) => {
  await page.evaluate(([s, o, i]) => {
    const el = ed.editable.querySelectorAll(s)[i];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const t = walker.nextNode();
    ed.focusEditor();
    const r = document.createRange(); r.setStart(t, o); r.collapse(true); ed.selectRange(r);
  }, [selector, textOffset, index]);
  await page.keyboard.type(text);
};

await test('入れ子の中の 1 段落を編集しても、他の部分は書き方ごと原文のまま', async () => {
  const src = "<div class='wrap'>\n  <P CLASS=lead>Hello&nbsp;world &copy; 2026</P>\n  <p class=a>edit me</p>\n  <ul>\n    <li>one\n    <li>two\n  </ul>\n  <img src=a.png alt=''/>\n</div>\n<!-- end -->";
  await setVal(src);
  await typeAt('p.a', 4, 'X');
  assert(await val() === src.replace('edit me', 'editX me'), await val());
});

await test('属性を変えた要素だけ開始タグを作り直す（中身と周囲は原文のまま）', async () => {
  const src = "<p>x <a href='/old' class=btn>link</a> y</p>\n<p>keep  <b>this</b></p>";
  await setVal(src);
  await placeCaret('a', 2);
  await click('link');
  await page.fill('formulit-editor >> input[name=href]', 'https://e.example/');
  await page.click('formulit-editor >> .dialog button[type=submit]');
  assert(await val() === "<p>x <a href=\"https://e.example/\" class=\"btn\">link</a> y</p>\n<p>keep  <b>this</b></p>", await val());
});

await test('太字などの構造変更でも、触れていない段落は原文のまま', async () => {
  const src = "<p class=one>first  paragraph</p>\n<p class=two>second</p>\n<p class=three>third &amp; last</p>";
  await setVal(src);
  await page.evaluate(() => {
    const t = ed.editable.querySelector('.two').firstChild; ed.focusEditor();
    const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 3); ed.selectRange(r);
  });
  await click('bold');
  const out = await val();
  assert(out.startsWith('<p class=one>first  paragraph</p>\n<p class=two><b>sec</b>ond</p>\n'), out);
  assert(out.endsWith('<p class=three>third &amp; last</p>'), out);
});

await test('元に戻す（途中の状態）でも原文保持が効く', async () => {
  const src = "<P class=a>aaa</P>\n<P class=b>bbb</P>\n<P class=c>ccc</P>";
  await setVal(src);
  await typeAt('p.a', 3, '1');
  await page.evaluate(() => ed._flushTyping());
  await typeAt('p.b', 3, '2');
  await page.keyboard.press('ControlOrMeta+z');
  assert(await val() === "<P class=a>aaa1</P>\n<P class=b>bbb</P>\n<P class=c>ccc</P>", 'undo: ' + await val());
  await page.keyboard.press('ControlOrMeta+Shift+z');
  assert(await val() === "<P class=a>aaa1</P>\n<P class=b>bbb2</P>\n<P class=c>ccc</P>", 'redo: ' + await val());
});

await test('サニタイズで属性を除去した要素だけ作り直し、他は原文のまま', async () => {
  await setVal("<p onclick='x()' class=k>a</p>\n<P>b</P><script>y()</script>");
  assert(await val() === '<p class="k">a</p>\n<P>b</P>', await val());
});

await test('暗黙の終了タグ・tbody 省略などを含んでも、出力は常に DOM と等価', async () => {
  const docs = [
    '<table class=t><tr><td>a<td>b</table><p>after',
    '<p>x<div>y</div>z</p>',
    '<ul><li>one<li>two</ul><dl><dt>t<dd>d</dl>',
    '<b>1<p>2</b>3</p>',
    '<p>a</p></div><p>b</p>',
    'text only &amp; <br/> more',
  ];
  for (const d of docs) {
    await setVal(d);
    await page.evaluate(() => {
      const w = document.createTreeWalker(ed.editable, NodeFilter.SHOW_TEXT);
      const t = w.nextNode(); ed.focusEditor();
      const r = document.createRange(); r.setStart(t, 1); r.collapse(true); ed.selectRange(r);
    });
    await page.keyboard.type('Z');
    const ok = await page.evaluate(async () => {
      const m = await import('/packages/formulit/src/index.js');
      return m.equivalentHTML(ed.value, m.serialize(ed.editable)) && ed.value.includes('Z');
    });
    assert(ok, `${d} → ${await val()}`);
  }
});

await test('原文をつなぐと意味が変わる場合は通常のシリアライズに切り替える（安全装置）', async () => {
  // 終了タグ省略の "<p>x" の直後に段落外のテキストを置くと、原文のままでは "<p>xQ" になり Q が段落に入ってしまう
  await setVal('<p>x<p>y');
  await page.evaluate(() => ed.transact(() => ed.editable.firstChild.after(document.createTextNode('Q'))));
  assert(await val() === '<p>x</p>Q<p>y</p>', await val());
});

await test('ランダム編集（4 文書 × 最大 67 回）：出力は常に DOM と等価、かつ原文保持が働いている', async () => {
  const result = await page.evaluate(async () => {
    const m = await import('/packages/formulit/src/index.js');
    let seed = 12345;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const docs = [
      "<div class='a'>\n <p class=x>alpha beta</p>\n <p>gamma &copy;</p>\n <ul><li>one<li>two</ul>\n</div>",
      "<h2 id=t>Title</h2><table><tr><th>h<th>i<tr><td>1<td>2</table><!-- c --><p>tail",
      "<section data-x='1'><p>a <em>b</em> c</p><p>d<br/>e</p></section>",
      "<p>one<p>two &amp; three<p>four<ul><li>x<li>y &lt;z</ul><dl><dt>t<dd>d</dl>tail text &copy",
    ];
    let preservedCount = 0, total = 0, fallbackCount = 0;
    const failures = [];
    for (const d of docs) {
      ed.value = d;
      for (let step = 0; step < 67; step++) {
        const texts = [];
        const w = document.createTreeWalker(ed.editable, NodeFilter.SHOW_TEXT);
        for (let t = w.nextNode(); t; t = w.nextNode()) if (t.data.trim()) texts.push(t);
        if (!texts.length) break;
        const t = texts[rnd(texts.length)];
        ed.focusEditor();
        const r = document.createRange();
        const a = rnd(t.length + 1);
        r.setStart(t, a); r.setEnd(t, Math.min(t.length, a + rnd(3)));
        ed.selectRange(r);
        const op = rnd(6);
        if (op === 0) ed.exec('bold');
        else if (op === 1) ed.exec('insertText', 'q');
        else if (op === 2) ed.exec('delete');
        else if (op === 3) ed.exec('insertParagraph');
        else if (op === 4) ed.undo();
        else ed.exec('italic');
        ed._flushTyping();
        const plain = m.serialize(ed.editable);
        const v = ed.value;
        total++;
        if (v !== plain) preservedCount++;
        if (m.serializeWithSource(ed.editable) !== v) fallbackCount++;
        if (!m.equivalentHTML(v, plain) || /data-formulit|contenteditable/.test(v)) failures.push({ d, step, v, plain });
      }
    }
    return { preservedCount, total, fallbackCount, failures: failures.slice(0, 2) };
  });
  assert(!result.failures.length, JSON.stringify(result.failures));
  assert(result.preservedCount > result.total / 3, `原文保持が働いた割合が低い: ${result.preservedCount}/${result.total}`);
  console.log(`      （原文保持あり ${result.preservedCount}/${result.total} 回、等価でなく通常方式に戻した回数 ${result.fallbackCount}）`);
});

console.log('ソース編集');
await test('ソースモードで編集 → WYSIWYG に戻すとその文字列が value になる', async () => {
  await setVal('<p>a</p>');
  await click('source');
  const src = '<section  class="s"   data-a="1"><p>手書き</p></section>';
  await page.evaluate((s) => { const t = ed.shadowRoot.querySelector('textarea'); t.value = s; t.dispatchEvent(new Event('input')); }, src);
  assert(await val() === src, 'ソースモード中の value');
  await click('source');
  assert(await val() === src, '戻した直後は原文そのまま（空白もそのまま）: ' + await val());
  assert(await page.evaluate(() => !!ed.editable.querySelector('section.s[data-a="1"]')), 'DOM に反映されていない');
});

console.log('書式');
await test('太字（ボタン）と Ctrl+B', async () => {
  await setVal('<p>hello world</p>');
  await page.evaluate(() => {
    const t = ed.editable.querySelector('p').firstChild; ed.focusEditor();
    const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 5); ed.selectRange(r);
  });
  await click('bold');
  assert((await val()).includes('<b>hello</b>'), await val());
  assert(await page.evaluate(() => ed.shadowRoot.querySelector('[data-item=bold]').getAttribute('aria-pressed')) === 'true', 'active 表示');
  await page.keyboard.press('ControlOrMeta+b');
  assert(await val() === '<p>hello world</p>', 'Ctrl+B で解除: ' + await val());
});

await test('見出し変更（select）', async () => {
  await setVal('<p class="lead">見出しに</p>');
  await placeCaret('p', 1);
  await page.selectOption('formulit-editor >> select', 'h2');
  assert(/<h2[^>]*>見出しに<\/h2>/.test(await val()), await val());
});

await test('箇条書き', async () => {
  await setVal('<p>item</p>');
  await placeCaret('p', 1);
  await click('ul');
  assert(/^<ul><li>item(<br>)?<\/li><\/ul>$/.test(await val()), await val());
});

await test('引用の切替', async () => {
  await setVal('<p>q</p>');
  await placeCaret('p', 0);
  await click('quote');
  assert(await val() === '<blockquote><p>q</p></blockquote>', await val());
  await click('quote');
  assert(await val() === '<p>q</p>', await val());
});

await test('元に戻す／やり直し', async () => {
  await setVal('<p>abc</p>');
  await placeCaret('p', 3);
  await page.keyboard.type('def');
  await page.keyboard.press('ControlOrMeta+z');
  assert(await val() === '<p>abc</p>', 'undo: ' + await val());
  assert(await page.evaluate(() => ed.dirty) === false, 'undo で原文に戻ったら dirty=false');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  assert(await val() === '<p>abcdef</p>', 'redo: ' + await val());
});

await test('空のエディタに入力 → Enter でも 1 行目から <p> になる（Chrome/Safari 差異の吸収）', async () => {
  await setVal('');
  await page.click('formulit-editor .formulit-editable');
  await page.keyboard.type('abc');
  await page.keyboard.press('Enter');
  await page.keyboard.type('def');
  assert(await val() === '<p>abc</p><p>def</p>', await val());
});

await test('空扱いの判定でコメントだけの内容を消さない', async () => {
  await setVal('<!-- only comment -->');
  await page.click('formulit-editor .formulit-editable');
  assert(await val() === '<!-- only comment -->', await val());
});

await test('リスト内の Enter で項目追加、空項目で Enter するとリストを抜ける', async () => {
  await setVal('<ul><li>a</li></ul>');
  await placeCaret('li', 1);
  await page.keyboard.press('Enter'); await page.keyboard.type('b');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.type('c');
  assert(await val() === '<ul><li>a</li><li>b</li></ul><p>c</p>', await val());
});

await test('日本語入力の変換中（isComposing）はショートカットを実行しない', async () => {
  await setVal('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
  await placeCaret('td', 1);
  const moved = await page.evaluate(() => {
    const ev = new KeyboardEvent('keydown', { key: 'Tab', isComposing: true, bubbles: true, cancelable: true });
    ed.editable.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  assert(!moved, '変換中の Tab が処理された');
});

console.log('書式の拡充');
// selector 内の最初のテキストノードの [start, end) を選択
const selectChars = (selector, start, end, index = 0) => page.evaluate(([s, a, b, i]) => {
  const el = ed.editable.querySelectorAll(s)[i];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const t = w.nextNode();
  ed.focusEditor();
  const r = document.createRange(); r.setStart(t, a); r.setEnd(t, b); ed.selectRange(r);
}, [selector, start, end, index]);
const pickColor = async (item, color) => {
  await click(item);
  await page.click(`formulit-editor >> .panel button[data-color="${color}"]`);
};
const RED = /color:\s*(rgb\(230, 76, 76\)|#e64c4c);?/;

await test('文字色：選択範囲に span style で適用し、解除すると span ごと消える', async () => {
  await setVal('<p>hello world</p>');
  await selectChars('p', 0, 5);
  await pickColor('fontColor', '#e64c4c');
  let out = await val();
  assert(/^<p><span style="color:\s*(rgb\(230, 76, 76\)|#e64c4c);?">hello<\/span> world<\/p>$/.test(out), out);
  assert(!(await page.evaluate(() => !!ed.shadowRoot.querySelector('.panel'))), 'パネルが閉じていない');
  await selectChars('span', 0, 5);
  await click('fontColor');
  await page.click('formulit-editor >> .panel button[data-action="remove"]');
  out = await val();
  assert(out === '<p>hello world</p>', out);
});

await test('文字色：一部だけ解除すると span が分割される', async () => {
  await setVal('<p>hello world</p>');
  await selectChars('p', 0, 11);
  await pickColor('fontColor', '#e64c4c');
  await selectChars('span', 3, 8);
  await click('fontColor');
  await page.click('formulit-editor >> .panel button[data-action="remove"]');
  const out = await val();
  const m = out.match(/^<p><span style="([^"]+)">hel<\/span>lo wo<span style="([^"]+)">rld<\/span><\/p>$/);
  assert(m && RED.test(m[1]) && RED.test(m[2]), out);
});

await test('文字サイズと色を重ねると 1 つの span にまとまる', async () => {
  await setVal('<p>abc def</p>');
  await selectChars('p', 0, 3);
  await pickColor('fontColor', '#e64c4c');
  await selectChars('span', 0, 3);
  await page.selectOption('formulit-editor >> select[data-item="fontSize"]', '24px');
  const out = await val();
  assert(/^<p><span style="[^"]*color[^"]*font-size: 24px;">abc<\/span> def<\/p>$/.test(out), out);
  await placeCaret('span', 1);
  await page.waitForTimeout(50);
  assert(await page.evaluate(() => ed.shadowRoot.querySelector('select[data-item="fontSize"]').value) === '24px', 'サイズ表示');
});

await test('フォント：書き方が違っても選択肢と一致表示される', async () => {
  await setVal('<p>abc</p>');
  await selectChars('p', 0, 3);
  await page.selectOption('formulit-editor >> select[data-item="fontFamily"]', { label: 'Georgia' });
  assert(/font-family: Georgia, serif;/.test(await val()), await val());
  await placeCaret('span', 1);
  await page.waitForTimeout(50);
  assert(await page.evaluate(() => ed.shadowRoot.querySelector('select[data-item="fontFamily"]').selectedOptions[0].label) === 'Georgia', '表示');
});

await test('背景色（マーカー）', async () => {
  await setVal('<p>abc</p>');
  await selectChars('p', 1, 2);
  await pickColor('bgColor', '#e6e64c');
  assert(/^<p>a<span style="background-color:\s*(rgb\(230, 230, 76\)|#e6e64c);?">b<\/span>c<\/p>$/.test(await val()), await val());
});

await test('範囲選択なしで色を選ぶと、次に入力する文字に適用される', async () => {
  await setVal('<p>ab</p>');
  await placeCaret('p', 1);
  await pickColor('fontColor', '#e64c4c');
  await page.keyboard.type('XY');
  const out = await val();
  assert(/^<p>a<span style="color:\s*(rgb\(230, 76, 76\)|#e64c4c);?">XY<\/span>b<\/p>$/.test(out), out);
});

await test('範囲選択なしで色を選び、日本語入力で確定した文字にも適用される', async () => {
  await setVal('<p>ab</p>');
  await placeCaret('p', 1);
  await pickColor('fontColor', '#e64c4c');
  await page.evaluate(() => {
    ed.editable.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
    const r = ed.getRange(); const t = r.startContainer;
    t.insertData(r.startOffset, 'あい'); ed.setCaretAt(t, r.startOffset + 2);
    ed.editable.dispatchEvent(new CompositionEvent('compositionend', { data: 'あい' }));
  });
  await page.waitForTimeout(50);
  const out = await val();
  assert(/^<p>a<span style="color:\s*(rgb\(230, 76, 76\)|#e64c4c);?">あい<\/span>b<\/p>$/.test(out), out);
});

await test('行間：選択した複数の段落に適用', async () => {
  await setVal('<p>one</p><p>two</p><p>three</p>');
  await page.evaluate(() => {
    const ps = ed.editable.querySelectorAll('p'); ed.focusEditor();
    const r = document.createRange(); r.setStart(ps[0].firstChild, 1); r.setEnd(ps[1].firstChild, 1); ed.selectRange(r);
  });
  await page.selectOption('formulit-editor >> select[data-item="lineHeight"]', '2');
  assert(await val() === '<p style="line-height: 2;">one</p><p style="line-height: 2;">two</p><p>three</p>', await val());
});

await test('インラインコードの切り替え', async () => {
  await setVal('<p>run npm test now</p>');
  await selectChars('p', 4, 12);
  await click('code');
  assert(await val() === '<p>run <code>npm test</code> now</p>', await val());
  await selectChars('code', 0, 8);
  await click('code');
  assert(await val() === '<p>run npm test now</p>', await val());
});

await test('スタイル：ブロック（p.lead / div.note）とインライン（span.marker）の切り替え', async () => {
  await setVal('<p>lead text</p><div><p>in div</p></div>');
  await placeCaret('p', 1);
  await click('styles');
  await page.click('formulit-editor >> .panel button[data-style="リード文"]');
  assert((await val()).startsWith('<p class="lead">lead text</p>'), await val());
  await placeCaret(':scope > div p', 1);
  await click('styles');
  await page.click('formulit-editor >> .panel button[data-style="お知らせボックス"]');
  assert((await val()).endsWith('<div class="note"><p>in div</p></div>'), await val());
  await selectChars('p', 0, 4);
  await click('styles');
  await page.click('formulit-editor >> .panel button[data-style="マーカー（黄）"]');
  assert((await val()).startsWith('<p class="lead"><span class="marker">lead</span> text</p>'), await val());
  await selectChars('span.marker', 0, 4);
  await click('styles');
  assert(await page.evaluate(() => ed.shadowRoot.querySelector('.panel button[data-style="マーカー（黄）"]').getAttribute('aria-checked')) === 'true', '押下表示');
  await page.click('formulit-editor >> .panel button[data-style="マーカー（黄）"]');
  assert((await val()).startsWith('<p class="lead">lead text</p>'), await val());
});

await test('書式のコピー：コピー元の書式を、次に選択した範囲へ貼り付ける', async () => {
  await setVal('<p><b><span style="color: red;">src</span></b> target <i>it</i></p>');
  await placeCaret('span', 1);
  await click('painter');
  assert(await page.evaluate(() => ed.editable.classList.contains('formulit-painting')), 'コピー中の表示');
  await page.evaluate(() => {
    const ts = [...ed.editable.querySelector('p').childNodes];
    const r = document.createRange(); r.setStart(ts[1], 1); r.setEnd(ts[1], 7); ed.selectRange(r);
    ed.editable.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.waitForTimeout(50);
  assert(await val() === '<p><b><span style="color: red;">src</span></b> <b><span style="color: red;">target</span></b> <i>it</i></p>', await val());
  assert(!(await page.evaluate(() => ed.editable.classList.contains('formulit-painting'))), '終了していない');
});

await test('大文字・小文字の変換（メニューと Shift+F3）', async () => {
  await setVal('<p>hello <b>big</b> world</p>');
  await page.evaluate(() => { const p = ed.editable.querySelector('p'); ed.focusEditor(); const r = document.createRange(); r.selectNodeContents(p); ed.selectRange(r); });
  await click('caseChange');
  await page.click('formulit-editor >> .panel button[data-case="title"]');
  assert(await val() === '<p>Hello <b>Big</b> World</p>', await val());
  await page.keyboard.press('Shift+F3');
  assert(await val() === '<p>HELLO <b>BIG</b> WORLD</p>', await val());
});

await test('特殊文字・絵文字の挿入', async () => {
  await setVal('<p>ab</p>');
  await placeCaret('p', 1);
  await click('specialChars');
  await page.click('formulit-editor >> .panel button[data-char="©"]');
  await page.click('formulit-editor >> .panel button[data-char="🚀"]');
  assert(await val() === '<p>a©🚀b</p>', await val());
  await page.keyboard.press('Escape');
});

await test('書式をクリア：装飾は外し、リンクは残す', async () => {
  await setVal('<p><b>bo<i>ld</i></b> <span style="color:red" class="x">x</span> <a href="#l">l</a> <code>c</code></p>');
  await page.evaluate(() => { const p = ed.editable.querySelector('p'); ed.focusEditor(); const r = document.createRange(); r.selectNodeContents(p); ed.selectRange(r); });
  await click('clear');
  assert(await val() === '<p>bold x <a href="#l">l</a> c</p>', await val());
});

await test('ドロップダウンは外側クリックと Esc で閉じる', async () => {
  await setVal('<p>ab</p>');
  await placeCaret('p', 1);
  await click('fontColor');
  assert(await page.evaluate(() => !!ed.shadowRoot.querySelector('.panel')), '開かない');
  await page.mouse.click(5, 5);
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('.panel')), '外側クリックで閉じない');
  await placeCaret('p', 1);
  await click('specialChars');
  await page.keyboard.press('Escape');
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('.panel')), 'Esc で閉じない');
});

await test('書式操作後も未変更部分の原文は保持される', async () => {
  const src = "<P class=keep>keep  this</P>\n<p class=t>color me</p>";
  await setVal(src);
  await selectChars('p.t', 0, 5);
  await pickColor('fontColor', '#e64c4c');
  const out = await val();
  assert(out.startsWith("<P class=keep>keep  this</P>\n<p class=t><span style="), out);
});

console.log('リンク・画像・表');
await test('リンク挿入（既存属性は残して href だけ更新）', async () => {
  await setVal('<p><a href="/old" class="btn" data-track="x">link</a></p>');
  await placeCaret('a', 2);
  await click('link');
  await page.fill('formulit-editor >> input[name=href]', 'https://example.com/');
  await page.click('formulit-editor >> .dialog button[type=submit]');
  assert(await val() === '<p><a href="https://example.com/" class="btn" data-track="x">link</a></p>', await val());
});

await test('選択範囲にリンクを作成', async () => {
  await setVal('<p>click here</p>');
  await selectText('p');
  await click('link');
  await page.fill('formulit-editor >> input[name=href]', 'https://a.example/');
  await page.check('formulit-editor >> input[name=blank]');
  await page.click('formulit-editor >> .dialog button[type=submit]');
  assert(await val() === '<p><a href="https://a.example/" target="_blank" rel="noopener">click here</a></p>', await val());
});

await test('画像挿入と編集（class は保持）', async () => {
  await setVal('<p>ab</p>');
  await placeCaret('p', 1);
  await click('image');
  await page.fill('formulit-editor >> input[name=src]', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=');
  await page.fill('formulit-editor >> input[name=alt]', 'dot');
  await page.click('formulit-editor >> .dialog button[type=submit]');
  assert(await val() === '<p>a<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="dot">b</p>', await val());
  // 1x1 の画像はクリック位置がずれるブラウザがあるため、幅を付けてからクリック
  await page.evaluate(() => { const img = ed.editable.querySelector('img'); img.classList.add('photo'); img.setAttribute('width', '40'); });
  await page.click('formulit-editor img', { force: true });
  await page.waitForTimeout(50);
  assert(await page.evaluate(() => ed.selectedObject?.localName === 'img'), 'クリックで画像が選択されていない');
  await click('image');
  await page.fill('formulit-editor >> input[name=width]', '120');
  await page.click('formulit-editor >> .dialog button[type=submit]');
  const out = await val();
  assert(out.includes('width="120"') && out.includes('class="photo"') && !out.includes('data-formulit'), out);
});

await test('表の挿入（段落を分割して挿入）と行・列操作、Tab 移動', async () => {
  await setVal('<p>beforeafter</p>');
  await placeCaret('p', 6);
  await click('table');
  await page.fill('formulit-editor >> input[name=rows]', '2');
  await page.fill('formulit-editor >> input[name=cols]', '2');
  await page.click('formulit-editor >> .dialog button[type=submit]');
  let out = await val();
  assert(/^<p>before<\/p><table><thead><tr><th><br><\/th><th><br><\/th><\/tr><\/thead><tbody><tr><td><br><\/td><td><br><\/td><\/tr><\/tbody><\/table><p>after<\/p>$/.test(out), out);
  await page.keyboard.type('A');
  await page.keyboard.press('Tab');
  await page.keyboard.type('B');
  await click('tableColAdd');
  await click('tableRowAdd');
  out = await val();
  assert(await page.evaluate(() => ed.editable.querySelector('table').rows.length) === 3, '行数');
  assert(await page.evaluate(() => ed.editable.querySelector('table').rows[0].cells.length) === 3, '列数');
  assert(out.includes('<th>A</th><th>B</th>'), out);
  await click('tableDel');
  assert(!(await val()).includes('<table'), '表の削除');
});

await test('HTML 貼り付け（実際のコピー＆ペースト）：class・data-* を保持し、コピー時に付く計算済みスタイルは除去', async () => {
  await setVal('<p>12</p>');
  // ページ上の別要素を選択して Ctrl+C → エディタで Ctrl+V（ブラウザ本物のクリップボード経由）
  await page.evaluate(() => {
    const src = document.createElement('div');
    src.id = 'copy-src';
    src.innerHTML = '<p>x <span class="tag" data-k="v">P</span> <b style="color:red">y</b></p>';
    document.body.append(src);
    const r = document.createRange(); r.selectNodeContents(src);
    document.getSelection().removeAllRanges(); document.getSelection().addRange(r);
  });
  await page.keyboard.press('ControlOrMeta+c');
  await placeCaret('p', 1);
  await page.keyboard.press('ControlOrMeta+v');
  await page.evaluate(() => document.getElementById('copy-src').remove());
  const out = await val();
  // Chrome/Safari がコピー時に書き込む計算済みスタイルは除去し、class・data-* とタグは残す
  // Chrome/Safari はインライン部分だけ、Firefox は <p> ごとコピーする（その場合は段落を分割して挿入）
  const inline = /^<p>1x <span class="tag" data-k="v">P<\/span> <b( style="[^"]*")?>y<\/b>2<\/p>$/;
  const block = /^<p>1<\/p><p>x <span class="tag" data-k="v">P<\/span> <b style="color:red">y<\/b><\/p><p>2<\/p>$/;
  assert((inline.test(out) || block.test(out)) && !/orphans|widows/.test(out), out);
});

await test('HTML 貼り付けの整形：付帯物（meta/コメント）を落とし、ブロックは段落を分割して挿入', async () => {
  await setVal('<p>12</p>');
  await placeCaret('p', 1);
  // Firefox は合成 ClipboardEvent にデータを載せられないため、ハンドラへ直接渡す
  await page.evaluate(() => ed._onPaste({
    clipboardData: { getData: (t) => t === 'text/html'
      ? '<html><body><meta charset="utf-8"><!--StartFragment--><div class="card" data-k="v">P</div><!--EndFragment--></body></html>' : '' },
    preventDefault() {},
  }));
  assert(await val() === '<p>1</p><div class="card" data-k="v">P</div><p>2</p>', await val());
});

console.log('画像・表・メディア');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const IMG = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const selectImage = async () => {
  await page.click('formulit-editor img', { force: true });
  await page.waitForFunction(() => ed.shadowRoot.querySelector('[data-ctx="image"]'));
};
const ctxClick = (item) => page.click(`formulit-editor >> .ctx button[data-item="${item}"]`);
// セル a から b までを選択（テキストの先頭〜末尾）
const selectCells = (a, b) => page.evaluate(([x, y]) => {
  const cells = [...ed.editable.querySelectorAll('td,th')];
  const ca = cells.find((c) => c.textContent === x); const cb = cells.find((c) => c.textContent === y);
  ed.focusEditor();
  const r = document.createRange(); r.setStart(ca.firstChild, 0); r.setEnd(cb.firstChild, cb.firstChild.length); ed.selectRange(r);
}, [a, b]);
const caretInCell = (text) => page.evaluate((x) => {
  const c = [...ed.editable.querySelectorAll('td,th')].find((c) => c.textContent === x);
  ed.focusEditor(); const r = document.createRange(); r.setStart(c.firstChild ?? c, 0); r.collapse(true); ed.selectRange(r);
}, text);
const grid3 = '<table><tbody><tr><td>a</td><td>b</td><td>c</td></tr><tr><td>d</td><td>e</td><td>f</td></tr><tr><td>g</td><td>h</td><td>i</td></tr></tbody></table>';

await test('画像：キャプションを付けると figure になり、入力できる', async () => {
  await setVal(`<p>a<img src="${IMG}" alt="d" width="40">b</p>`);
  await selectImage();
  await ctxClick('imgCaption');
  await page.keyboard.type('Cap');
  const out = await val();
  assert(new RegExp(`^<p>a</p><figure class="image" style="display: table; margin: 1em auto;"><img src="${IMG.replace(/[+/]/g, '\\$&')}" alt="d" width="40"><figcaption>Cap</figcaption></figure><p>b</p>$`).test(out), out);
});

await test('画像：左寄せ → 文中配置に戻す', async () => {
  await setVal(`<p>a<img src="${IMG}" width="40">b</p>`);
  await selectImage();
  await ctxClick('imgAlignLeft');
  let out = await val();
  assert(/<figure class="image" style="float: left; margin: 0px 1.5em 1em 0px;"><img [^>]+><\/figure>/.test(out), out);
  assert(await page.evaluate(() => ed.shadowRoot.querySelector('.ctx button[data-item="imgAlignLeft"]').getAttribute('aria-pressed')) === 'true', '押下表示');
  await ctxClick('imgInline');
  out = await val();
  assert(/^<p>a<\/p><p><img [^>]+><\/p><p>b<\/p>$/.test(out), out);
});

await test('画像：ハンドルのドラッグでリサイズ（1 回の元に戻すで戻る）', async () => {
  await setVal(`<p><img src="${IMG}" width="40" height="40"></p>`);
  await selectImage();
  const h = await page.$('formulit-editor >> .resize i[data-h="se"]');
  const box = await h.boundingBox();
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 65, box.y + 30, { steps: 5 });
  await page.mouse.up();
  assert(await val() === `<p><img src="${IMG}" width="100" height="100"></p>`, await val());
  await page.keyboard.press('ControlOrMeta+z');
  assert(await val() === `<p><img src="${IMG}" width="40" height="40"></p>`, 'undo: ' + await val());
});

await test('画像：ファイル選択で挿入（アップロード先未設定なら data URL）', async () => {
  await setVal('<p>ab</p>');
  await placeCaret('p', 1);
  await click('image');
  await page.setInputFiles('formulit-editor >> .dialog input[type=file]', { name: 'x.png', mimeType: 'image/png', buffer: PNG });
  await page.fill('formulit-editor >> .dialog input[name=alt]', '点');
  await page.click('formulit-editor >> .dialog button[type=submit]');
  await page.waitForFunction(() => !ed.editable.querySelector('[data-formulit-uploading]'));
  const out = await val();
  assert(/^<p>a<img src="data:image\/png;base64,[^"]+" alt="点">b<\/p>$/.test(out), out);
});

await test('画像：ドロップしたファイルを imageUploader でアップロード', async () => {
  await setVal('<p>ab</p>');
  await page.evaluate(() => { ed.imageUploader = async (f) => { await new Promise((r) => setTimeout(r, 30)); return `/uploads/${f.name}`; }; });
  await placeCaret('p', 1);
  await page.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bin], 'drop.png', { type: 'image/png' }));
    const t = ed.editable.querySelector('p').firstChild;
    const r = document.createRange(); r.setStart(t, 1); const rect = r.getBoundingClientRect();
    ed.editable.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: rect.left, clientY: rect.top + rect.height / 2, bubbles: true, cancelable: true }));
  }, PNG.toString('base64'));
  assert((await val()).includes('src="blob:'), 'アップロード中はプレビュー表示');
  await page.waitForFunction(() => !ed.editable.querySelector('[data-formulit-uploading]'));
  await page.evaluate(() => { ed.imageUploader = null; });
  assert(/^<p>a?<img src="\/uploads\/drop\.png" alt="">b?/.test(await val()), await val());
});

await test('画像：コンテキストツールバーから削除', async () => {
  await setVal(`<p>a<img src="${IMG}" width="40">b</p>`);
  await selectImage();
  await ctxClick('imgDelete');
  assert(await val() === '<p>ab</p>', await val());
});

await test('表：複数セルを選ぶと選択表示され（出力には出ない）、結合できる', async () => {
  await setVal(grid3);
  await selectCells('a', 'e');
  await page.waitForTimeout(80);
  assert(await page.evaluate(() => ed.editable.querySelectorAll('[data-formulit-cell-selected]').length) === 4, '選択表示');
  assert(!(await val()).includes('data-formulit'), '内部属性が出力に出ている');
  await ctxClick('tableMerge');
  assert(await val() === '<table><tbody><tr><td rowspan="2" colspan="2">a<br>b<br>d<br>e</td><td>c</td></tr><tr><td>f</td></tr><tr><td>g</td><td>h</td><td>i</td></tr></tbody></table>', await val());
});

await test('表：結合セルをまたぐ行の挿入と、結合セルの分割', async () => {
  await setVal('<table><tbody><tr><td rowspan="2" colspan="2">M</td><td>c</td></tr><tr><td>f</td></tr><tr><td>g</td><td>h</td><td>i</td></tr></tbody></table>');
  await caretInCell('c');
  await ctxClick('tableRowAdd');
  assert(await val() === '<table><tbody><tr><td rowspan="3" colspan="2">M</td><td>c</td></tr><tr><td><br></td></tr><tr><td>f</td></tr><tr><td>g</td><td>h</td><td>i</td></tr></tbody></table>', 'row: ' + await val());
  await caretInCell('M');
  await ctxClick('tableSplitV');
  assert(await val() === '<table><tbody><tr><td rowspan="3">M</td><td rowspan="3"><br></td><td>c</td></tr><tr><td><br></td></tr><tr><td>f</td></tr><tr><td>g</td><td>h</td><td>i</td></tr></tbody></table>', 'split: ' + await val());
});

await test('表：結合セルを含む列の挿入・行と列の削除', async () => {
  await setVal('<table><tbody><tr><td colspan="2">A</td></tr><tr><td>b</td><td>c</td></tr></tbody></table>');
  await caretInCell('b');
  await ctxClick('tableColAdd');
  assert(await val() === '<table><tbody><tr><td colspan="3">A</td></tr><tr><td>b</td><td><br></td><td>c</td></tr></tbody></table>', 'col: ' + await val());
  await caretInCell('c');
  await ctxClick('tableColDel');
  await caretInCell('b');
  await ctxClick('tableColDel');
  assert(await val() === '<table><tbody><tr><td>A</td></tr><tr><td><br></td></tr></tbody></table>', 'del col: ' + await val());
  await setVal('<table><tbody><tr><td rowspan="2">A</td><td>b</td></tr><tr><td>c</td></tr></tbody></table>');
  await caretInCell('b');
  await ctxClick('tableRowDel');
  assert(await val() === '<table><tbody><tr><td>A</td><td>c</td></tr></tbody></table>', 'del row: ' + await val());
});

await test('表：横に分割・上と左への挿入', async () => {
  await setVal('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
  await caretInCell('a');
  await ctxClick('tableSplitH');
  assert(await val() === '<table><tbody><tr><td>a</td><td rowspan="2">b</td></tr><tr><td><br></td></tr></tbody></table>', 'splitH: ' + await val());
  await caretInCell('a');
  await ctxClick('tableRowAbove');
  await caretInCell('a');
  await ctxClick('tableColLeft');
  assert(await val() === '<table><tbody><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td>a</td><td rowspan="2">b</td></tr><tr><td><br></td><td><br></td></tr></tbody></table>', await val());
});

await test('表：見出し行・見出し列・キャプションの切り替え', async () => {
  await setVal('<table><tbody><tr><td>h1</td><td>h2</td></tr><tr><td>r1</td><td>v</td></tr></tbody></table>');
  await caretInCell('v');
  await ctxClick('tableHeaderRow');
  assert(await val() === '<table><thead><tr><th>h1</th><th>h2</th></tr></thead><tbody><tr><td>r1</td><td>v</td></tr></tbody></table>', 'row: ' + await val());
  await caretInCell('v');
  await ctxClick('tableHeaderCol');
  assert(await val() === '<table><thead><tr><th>h1</th><th>h2</th></tr></thead><tbody><tr><th scope="row">r1</th><td>v</td></tr></tbody></table>', 'col: ' + await val());
  await caretInCell('v');
  await ctxClick('tableCaption');
  await page.keyboard.type('表1');
  assert((await val()).startsWith('<table><caption>表1</caption><thead>'), 'caption: ' + await val());
  await caretInCell('h1');
  await ctxClick('tableHeaderRow');
  assert((await val()).includes('<tbody><tr><td>h1</td><td>h2</td></tr>'), 'off: ' + await val());
});

await test('表：表とセルのプロパティ', async () => {
  await setVal('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
  await caretInCell('a');
  await ctxClick('tableProps');
  await page.selectOption('formulit-editor >> .dialog select[name=borderStyle]', 'solid');
  await page.fill('formulit-editor >> .dialog input[name=borderWidth]', '1px');
  await page.fill('formulit-editor >> .dialog input[name=borderColor]', '#333333');
  await page.check('formulit-editor >> .dialog input[name=cells]');
  await page.fill('formulit-editor >> .dialog input[name=width]', '100%');
  await page.selectOption('formulit-editor >> .dialog select[name=align]', 'center');
  await page.click('formulit-editor >> .dialog button[type=submit]');
  let out = await val();
  assert(/<table style="border-style: solid; border-width: 1px; border-color: rgb\(51, 51, 51\); width: 100%; border-collapse: collapse; margin-left: auto; margin-right: auto;">/.test(out), out);
  assert((out.match(/<td style="border-style: solid; border-width: 1px; border-color: rgb\(51, 51, 51\);">/g) ?? []).length === 2, out);
  await selectCells('a', 'b');
  await ctxClick('cellProps');
  await page.fill('formulit-editor >> .dialog input[name=background]', '#ffeeee');
  await page.selectOption('formulit-editor >> .dialog select[name=verticalAlign]', 'top');
  await page.click('formulit-editor >> .dialog button[type=submit]');
  out = await val();
  assert((out.match(/background-color: rgb\(255, 238, 238\); vertical-align: top;/g) ?? []).length === 2, out);
});

const copyText = async (text) => {
  await page.evaluate((t) => {
    const ta = document.createElement('textarea'); ta.id = 'clip-src'; ta.value = t; document.body.append(ta); ta.select();
  }, text);
  await page.keyboard.press('ControlOrMeta+c');
  await page.evaluate(() => document.getElementById('clip-src').remove());
};

await test('メディア：YouTube の URL を埋め込み（未対応 URL はメッセージを出して再入力）', async () => {
  await setVal('<p>ab</p>');
  await placeCaret('p', 1);
  await click('mediaEmbed');
  await page.fill('formulit-editor >> .dialog input[name=url]', 'https://example.com/video');
  await page.click('formulit-editor >> .dialog button[type=submit]');
  assert((await page.textContent('formulit-editor >> .dialog .msg')).includes('対応していません'), 'メッセージ');
  await page.fill('formulit-editor >> .dialog input[name=url]', 'https://youtu.be/dQw4w9WgXcQ');
  await page.click('formulit-editor >> .dialog button[type=submit]');
  const out = await val();
  assert(/^<p>a<\/p><figure class="media"><iframe src="https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ" width="560" height="315" title="YouTube"[^>]*data-url="https:\/\/youtu\.be\/dQw4w9WgXcQ"><\/iframe><\/figure><p>b<\/p>$/.test(out), out);
  assert(await page.evaluate(() => ed.editable.querySelector('figure.media').getAttribute('contenteditable')) === 'false', '編集中は保護');
});

await test('メディア：URL だけを貼り付けると自動で埋め込む／クリックで選択して削除', async () => {
  await setVal('<p>x</p>');
  await copyText('https://vimeo.com/76979871');
  await placeCaret('p', 1);
  await page.keyboard.press('ControlOrMeta+v');
  assert((await val()).includes('<iframe src="https://player.vimeo.com/video/76979871"'), await val());
  await page.click('formulit-editor figure.media', { force: true });
  await page.waitForFunction(() => ed.shadowRoot.querySelector('[data-ctx="embed"]'));
  await ctxClick('embedDelete');
  assert(!(await val()).includes('figure'), await val());
});

await test('コードブロック：段落を変換・Enter で改行・Tab でインデント・3 回の Enter で抜ける', async () => {
  await setVal('<p>let a = 1;</p>');
  await placeCaret('p', 10);
  await click('codeBlock');
  await page.click('formulit-editor >> .panel button[data-lang="javascript"]');
  assert(await val() === '<pre><code class="language-javascript">let a = 1;</code></pre>', await val());
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('b();');
  assert(await val() === '<pre><code class="language-javascript">let a = 1;\n\tb();\n</code></pre>', JSON.stringify(await val()));
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await page.keyboard.type('after');
  assert(await val() === '<pre><code class="language-javascript">let a = 1;\n\tb();</code></pre><p>after</p>', JSON.stringify(await val()));
});

await test('コードブロック：複数行の Shift+Tab、言語の変更と解除', async () => {
  await setVal('<pre><code class="language-css">\ta {}\n\tb {}</code></pre>');
  await page.evaluate(() => {
    const t = ed.editable.querySelector('code').firstChild; ed.focusEditor();
    const r = document.createRange(); r.setStart(t, 1); r.setEnd(t, t.length); ed.selectRange(r);
  });
  await page.keyboard.press('Shift+Tab');
  assert(await val() === '<pre><code class="language-css">a {}\nb {}</code></pre>', JSON.stringify(await val()));
  await click('codeBlock');
  await page.click('formulit-editor >> .panel button[data-lang="html"]');
  assert(await val() === '<pre><code class="language-html">a {}\nb {}</code></pre>', await val());
  await click('codeBlock');
  await page.click('formulit-editor >> .panel button[data-lang=""]');
  assert(await val() === '<p>a {}</p><p>b {}</p>', await val());
});

await test('コードブロック：貼り付けはプレーンテキストになる', async () => {
  await setVal('<pre><code>x</code></pre>');
  await copyText('<b>not bold</b>');
  await placeCaret('code', 1);
  await page.keyboard.press('ControlOrMeta+v');
  assert(await val() === '<pre><code>x&lt;b&gt;not bold&lt;/b&gt;</code></pre>', await val());
});

await test('HTML 埋め込み：挿入した HTML はそのまま出力、ダブルクリックで編集', async () => {
  await setVal('<p>ab</p>');
  await placeCaret('p', 2);
  await click('htmlEmbed');
  await page.fill('formulit-editor >> .dialog textarea[name=html]', '<div class="widget" data-x="1"><span>W</span></div>');
  await page.click('formulit-editor >> .dialog button[type=submit]');
  // 末尾に挿入したときは、続けて入力できるよう空の段落が後ろに入る
  assert(await val() === '<p>ab</p><div class="widget" data-x="1"><span>W</span></div><p><br></p>', await val());
  assert(await page.evaluate(() => ed.editable.querySelector('.widget').getAttribute('contenteditable')) === 'false', '保護');
  await page.dblclick('formulit-editor .widget');
  assert((await page.inputValue('formulit-editor >> .dialog textarea[name=html]')) === '<div class="widget" data-x="1"><span>W</span></div>', 'プリフィル');
  await page.fill('formulit-editor >> .dialog textarea[name=html]', '<div class="widget" data-x="2">W2</div>');
  await page.click('formulit-editor >> .dialog button[type=submit]');
  assert(await val() === '<p>ab</p><div class="widget" data-x="2">W2</div><p><br></p>', await val());
});

console.log('生産性');
const typeInP = async (html, text) => {
  await setVal(html);
  await page.click('formulit-editor .formulit-editable p');
  await page.keyboard.press('End');
  await page.keyboard.type(text);
};
const statusText = (key) => page.evaluate((k) => ed.shadowRoot.querySelector(`.status [data-status="${k}"]`)?.textContent ?? null, key);

await test('検索と置換：Ctrl+F で選択文字を検索、件数・移動・置換・すべて置換', async () => {
  await setVal('<p>cat dog cat</p><p>Cat <b>ca</b>t</p>');
  await selectChars('p', 0, 3);
  await page.keyboard.press('ControlOrMeta+f');
  await page.waitForFunction(() => ed.shadowRoot.querySelector('.panel input[name=find]') === ed.shadowRoot.activeElement);
  assert(await page.inputValue('formulit-editor >> .panel input[name=find]') === 'cat', '選択文字が入る');
  const count = () => page.textContent('formulit-editor >> .panel [data-find="count"]');
  assert(await count() === '1 / 4 件', 'count: ' + await count());
  assert(await page.evaluate(() => [...CSS.highlights.keys()].some((k) => k.startsWith('formulit-find'))), 'ハイライト');
  await page.keyboard.press('Enter');
  assert(await count() === '2 / 4 件', 'next: ' + await count());
  await page.check('formulit-editor >> .panel input[name=matchCase]');
  assert(await count() === '2 / 3 件' || await count() === '1 / 3 件', 'case: ' + await count());
  await page.fill('formulit-editor >> .panel input[name=replace]', 'CAT');
  await page.click('formulit-editor >> .panel button[data-find="replaceAll"]');
  assert(await val() === '<p>CAT dog CAT</p><p>Cat CAT</p>', await val());
  assert((await count()).includes('3 件置換'), await count());
  await page.fill('formulit-editor >> .panel input[name=find]', 'dog');
  await page.fill('formulit-editor >> .panel input[name=replace]', '犬');
  await page.click('formulit-editor >> .panel button[data-find="replace"]');
  assert(await val() === '<p>CAT 犬 CAT</p><p>Cat CAT</p>', await val());
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  assert(await page.evaluate(() => ![...CSS.highlights.keys()].some((k) => k.startsWith('formulit-find'))), '閉じたらハイライト解除');
});

await test('検索：単語単位・段落をまたがない', async () => {
  await setVal('<p>cat category</p><p>ca</p><p>t</p>');
  await placeCaret('p', 0);
  await page.keyboard.press('ControlOrMeta+f');
  await page.fill('formulit-editor >> .panel input[name=find]', 'cat');
  const count = () => page.textContent('formulit-editor >> .panel [data-find="count"]');
  assert((await count()).endsWith('/ 2 件'), await count());
  await page.check('formulit-editor >> .panel input[name=wholeWord]');
  assert((await count()).endsWith('/ 1 件'), 'whole: ' + await count());
  await page.uncheck('formulit-editor >> .panel input[name=wholeWord]');
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
});

await test('文字数カウントと上限表示', async () => {
  await setVal('<p>hello world</p><p>日本語</p>');
  await page.evaluate(() => { ed.wordCount = true; });
  await page.waitForTimeout(50);
  assert(await statusText('chars') === '文字数 14（空白を除く 13）', await statusText('chars'));
  // 日本語の単語の区切り方はブラウザ（Intl.Segmenter の実装）によって異なる
  assert(/^単語 [2-4]$/.test(await statusText('words')), await statusText('words'));
  await page.evaluate(() => { ed.wordCount = false; ed.maxChars = 10; });
  await page.waitForTimeout(50);
  assert(await statusText('chars') === '14 / 10 文字', await statusText('chars'));
  assert(await page.evaluate(() => ed.shadowRoot.querySelector('.status [data-status="chars"]').classList.contains('over')), '超過表示');
  await page.evaluate(() => { ed.maxChars = 0; });
});

await test('自動保存：入力が止まったら autosave を呼び、状態を表示。Ctrl+S で即保存', async () => {
  await page.evaluate(() => { window.__saved = []; ed.autosaveDelay = 150; ed.autosave = async (v) => { await new Promise((r) => setTimeout(r, 30)); window.__saved.push(v); }; });
  await typeInP('<p>a</p>', 'b');
  assert(await statusText('autosave') === '未保存の変更があります', await statusText('autosave'));
  await page.waitForFunction(() => window.__saved.length === 1);
  await page.waitForTimeout(30);
  assert(/^保存しました/.test(await statusText('autosave')), await statusText('autosave'));
  assert(await page.evaluate(() => window.__saved[0]) === '<p>ab</p>', 'saved value');
  await page.keyboard.type('c');
  await page.keyboard.press('ControlOrMeta+s');
  await page.waitForFunction(() => window.__saved.length === 2);
  assert(await page.evaluate(() => window.__saved[1]) === '<p>abc</p>', 'Ctrl+S');
  await page.evaluate(() => { ed.autosave = null; });
});

await test('全画面表示の切り替えと Esc での解除', async () => {
  await setVal('<p>x</p>');
  await click('fullscreen');
  assert(await page.evaluate(() => ed.hasAttribute('fullscreen') && getComputedStyle(ed).position === 'fixed'), '全画面');
  await page.click('formulit-editor .formulit-editable p');
  await page.keyboard.press('Escape');
  assert(await page.evaluate(() => !ed.hasAttribute('fullscreen') && document.documentElement.style.overflow === ''), '解除');
});

await test('ショートカット一覧（Alt+0）', async () => {
  await setVal('<p>x</p>');
  await placeCaret('p', 1);
  await page.keyboard.press('Alt+0');
  await page.waitForFunction(() => ed.shadowRoot.querySelector('.dialog table.keys'));
  assert(await page.evaluate(() => ed.shadowRoot.querySelectorAll('.dialog table.keys tr').length) > 15, '一覧');
  await page.click('formulit-editor >> .dialog button[type=submit]');
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('.dialog')), '閉じる');
});

await test('オートフォーマット：行頭の記号で見出し・リスト・引用・コード・水平線', async () => {
  const cases = [
    ['## ', /^<h2><br><\/h2>$|^<h2><\/h2>$/, 'Title', '<h2>Title</h2>'],
    ['- ', null, 'item', '<ul><li>item</li></ul>'],
    ['3. ', null, 'three', '<ol start="3"><li>three</li></ol>'],
    ['> ', null, 'q', '<blockquote><p>q</p></blockquote>'],
    ['```js ', null, 'let a', '<pre><code class="language-js">let a</code></pre>'],
  ];
  for (const [mark, , rest, expected] of cases) {
    await typeInP('<p><br></p>', mark);
    await page.keyboard.type(rest);
    const out = (await val()).replace(/<br>(?=<\/)/g, '');
    assert(out === expected, `${mark} → ${out}`);
  }
  await typeInP('<p><br></p>', '---');
  assert(await val() === '<hr><p><br></p>', '--- → ' + await val());
});

await test('オートフォーマット：**太字** *斜体* `コード` ~~取消~~、続けた入力は装飾の外', async () => {
  await typeInP('<p>a</p>', ' **bold** x *it* y `c` z ~~s~~ w');
  const out = (await val()).replace(/&nbsp;/g, ' ');
  assert(out === '<p>a <b>bold</b> x <i>it</i> y <code>c</code> z <s>s</s> w</p>', out);
});

await test('オートフォーマットは元に戻すで記号の状態に戻る', async () => {
  await typeInP('<p><br></p>', '# ');
  assert((await val()).startsWith('<h1>'), await val());
  await page.keyboard.press('ControlOrMeta+z');
  assert((await val()).replace(/&nbsp;/g, ' ').startsWith('<p># '), 'undo: ' + await val());
});

await test('スラッシュコマンド：行頭の / で一覧、絞り込み・矢印・Enter で実行、Esc で閉じる', async () => {
  await typeInP('<p><br></p>', '/');
  await page.waitForFunction(() => ed.shadowRoot.querySelector('.popup .opt'));
  assert(await page.evaluate(() => ed.shadowRoot.querySelectorAll('.popup .opt').length) > 10, '一覧');
  await page.keyboard.type('h');
  await page.waitForTimeout(30);
  await page.keyboard.press('ArrowDown');
  assert(await page.evaluate(() => ed.shadowRoot.querySelector('.popup .opt[aria-selected=true]').dataset.command) === '見出し 2', '矢印で移動');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Sub');
  assert(await val() === '<h2>Sub</h2>', await val());
  await typeInP('<p>x</p>', ' /');
  await page.waitForFunction(() => ed.shadowRoot.querySelector('.popup'));
  await page.keyboard.press('Escape');
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('.popup')), 'Esc');
  assert((await val()).replace(/&nbsp;/g, ' ') === '<p>x /</p>', await val());
  await typeInP('<p>path</p>', '/');
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('.popup')), '語中の / では開かない');
});

await test('入力変換の直後に Enter しても、次の行に装飾（`code` など）を持ち越さない', async () => {
  await typeInP('<p><br></p>', 'a `code`');
  await page.keyboard.press('Enter');
  await page.keyboard.type('next');
  const out = (await val()).replace(/&nbsp;/g, ' ');
  assert(out === '<p>a <code>code</code></p><p>next</p>', out);
});

await test('箇条書きの直後の段落で [] を入力しても、前のリストは ToDo にならない', async () => {
  await setVal('<ul><li>a</li></ul><p>b</p>');
  await placeCaret('p', 0);
  await page.keyboard.type('[] ');
  const out = await val();
  assert(out === '<ul><li>a</li></ul><ul class="todo-list" style="list-style: none;"><li><input type="checkbox" disabled="">b</li></ul>', out);
});

await test('ToDo リスト：作成・クリックで完了・Enter で項目追加・空項目の Enter で抜ける', async () => {
  await typeInP('<p>task1</p>', '');
  await click('todoList');
  assert(await val() === '<ul class="todo-list" style="list-style: none;"><li><input type="checkbox" disabled="">task1</li></ul>', await val());
  await page.click('formulit-editor ul.todo-list input');
  await page.waitForTimeout(50);
  assert((await val()).includes('<input type="checkbox" disabled="" checked="">task1'), 'check: ' + await val());
  await page.click('formulit-editor ul.todo-list li');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('task2');
  assert(/<li><input type="checkbox" disabled="">task2<\/li><\/ul>$/.test(await val()), 'enter: ' + await val());
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('after');
  assert(/<\/ul><p>after<\/p>$/.test(await val()), 'exit: ' + await val());
  await typeInP('<p><br></p>', '[x] ');
  await page.keyboard.type('done');
  assert(await val() === '<ul class="todo-list" style="list-style: none;"><li><input type="checkbox" disabled="" checked="">done</li></ul>', '[x]: ' + await val());
});

await test('リストの種類・開始番号・逆順', async () => {
  await setVal('<ol><li>a</li><li>b</li></ol>');
  await placeCaret('li', 1);
  await click('listStyle');
  await page.click('formulit-editor >> .panel button[data-list-type="upper-roman"]');
  await placeCaret('li', 1);
  await click('listStyle');
  await page.fill('formulit-editor >> .panel input[name=start]', '3');
  await page.dispatchEvent('formulit-editor >> .panel input[name=start]', 'change');
  await page.check('formulit-editor >> .panel input[name=reversed]');
  assert(await val() === '<ol style="list-style-type: upper-roman;" start="3" reversed=""><li>a</li><li>b</li></ol>', await val());
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
});

await test('改ページ（CKEditor と同じ形式）', async () => {
  await setVal('<p>a</p><p>b</p>');
  await placeCaret('p', 1);
  await click('pageBreak');
  assert(await val() === '<p>a</p><div class="page-break" style="page-break-after: always;"><span style="display: none;">&nbsp;</span></div><p>b</p>', await val());
});

await test('目次：見出しから生成し、見出しの編集に追従（元に戻すで一緒に戻る）', async () => {
  await setVal('<p>top</p><h2>A</h2><h3>B</h3><h2 id="c">C</h2>');
  await placeCaret('p', 3);
  await click('toc');
  const expected = '<p>top</p><nav class="toc"><p class="toc-title">目次</p><ul><li><a href="#toc-1">A</a><ul><li><a href="#toc-2">B</a></li></ul></li><li><a href="#c">C</a></li></ul></nav><h2 id="toc-1">A</h2><h3 id="toc-2">B</h3><h2 id="c">C</h2>';
  assert(await val() === expected, await val());
  await placeCaret('h3', 1);
  await page.keyboard.type('2');
  await page.waitForFunction(() => ed.value.includes('<a href="#toc-2">B2</a>'), null, { timeout: 3000 });
  await page.keyboard.press('ControlOrMeta+z');
  assert(await val() === expected, 'undo: ' + await val());
});

console.log('ツールバーのグループ');
await test('グループ：指定どおり「履歴▼ | format styles ...▼ | 装飾▼」と表示される', async () => {
  await page.evaluate(() => {
    window.__origToolbar = ed.toolbar;
    ed.toolbar = [
      { label: '履歴', items: ['undo', 'redo', 'findReplace'] },
      '|',
      'format', 'styles', { label: '...', items: ['fontFamily', 'fontSize', 'lineHeight'] },
      '|',
      { label: '装飾', items: ['bold', 'italic', 'underline', 'strike', 'sup', 'sub', 'code'] },
    ];
  });
  await page.waitForTimeout(50);
  const layout = await page.evaluate(() => [...ed.shadowRoot.querySelector('.toolbar').children].map((el) => {
    if (el.classList.contains('sep')) return '|';
    const g = el.querySelector?.(':scope > button[data-group]');
    if (g) return `${g.textContent.replace(/\s+/g, '')}`;
    return el.dataset?.item ?? el.querySelector('[data-item]')?.dataset.item;
  }).join(' '));
  assert(layout === '履歴▼ | format styles ...▼ | 装飾▼', layout);
});

await test('グループ：開くと中の項目が並び、実行するとパネルが閉じる。押下状態はグループにも表示', async () => {
  await setVal('<p>hello</p>');
  await selectChars('p', 0, 5);
  await page.click('formulit-editor >> button[data-group] >> text=装飾');
  const inPanel = await page.evaluate(() => [...ed.shadowRoot.querySelectorAll('.panel.group [data-item]')].map((b) => b.dataset.item).join(','));
  assert(inPanel === 'bold,italic,underline,strike,sup,sub,code', inPanel);
  await page.click('formulit-editor >> .panel.group button[data-item="bold"]');
  assert(await val() === '<p><b>hello</b></p>', await val());
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('.panel')), 'パネルが閉じない');
  await page.waitForTimeout(300);
  const pressed = await page.evaluate(() => [...ed.shadowRoot.querySelectorAll('button[data-group]')].find((b) => b.textContent.includes('装飾')).getAttribute('aria-pressed'));
  assert(pressed === 'true', 'グループの押下表示');
});

await test('グループ：中のセレクトと、入れ子のドロップダウン（文字色）', async () => {
  await page.evaluate(() => { ed.toolbar = [{ label: '文字', items: ['fontSize', 'fontColor'] }]; });
  await setVal('<p>abc</p>');
  await selectChars('p', 0, 3);
  await page.click('formulit-editor >> button[data-group]');
  await page.selectOption('formulit-editor >> .panel.group select[data-item="fontSize"]', '24px');
  assert(/font-size: 24px/.test(await val()), await val());
  await selectChars('span', 0, 3);
  await page.click('formulit-editor >> button[data-group]');
  await page.click('formulit-editor >> .panel.group button[data-item="fontColor"]');
  await page.click('formulit-editor >> .panel.group .panel button[data-color="#e64c4c"]');
  assert(/color:\s*(rgb\(230, 76, 76\)|#e64c4c)/.test(await val()), await val());
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('.panel')), '閉じない');
});

await test('グループ：Ctrl+F はグループの中の検索パネルを開く／外側クリック・Esc で閉じる', async () => {
  await page.evaluate(() => { ed.toolbar = [{ label: '⋯', items: ['findReplace', 'source'] }]; });
  await setVal('<p>find me</p>');
  await placeCaret('p', 0);
  await page.keyboard.press('ControlOrMeta+f');
  await page.waitForFunction(() => ed.shadowRoot.querySelector('.panel.group .panel input[name=find]') === ed.shadowRoot.activeElement);
  await page.keyboard.type('me');
  assert(await page.textContent('formulit-editor >> [data-find="count"]') === '1 / 1 件', 'count');
  await page.keyboard.press('Escape');
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('.panel')), 'Esc');
  await page.click('formulit-editor >> button[data-group]');
  await page.mouse.click(5, 5);
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('.panel')), '外側クリック');
});

await test('グループ：アイコン指定（HTML 文字列・項目名）とラベル併用', async () => {
  await page.evaluate(() => {
    ed.toolbar = [
      { icon: '<span class="my-icon" style="background:#ffe58f;padding:0 3px">M</span>', title: '履歴', items: ['undo', 'redo', 'findReplace'] },
      { icon: 'bold', label: '装飾', items: ['bold', 'italic'] },
      { items: ['sup', 'sub'] },
    ];
  });
  await page.waitForTimeout(50);
  const info = await page.evaluate(() => [...ed.shadowRoot.querySelectorAll('button[data-group]')].map((b) => ({
    html: !!b.querySelector('.my-icon'), svg: !!b.querySelector('svg'), text: b.textContent.replace(/\s+/g, ''), title: b.title,
  })));
  assert(info[0].html && info[0].text === 'M▼' && info[0].title === '履歴', JSON.stringify(info[0]));
  assert(info[1].svg && info[1].text === '装飾▼', JSON.stringify(info[1]));
  assert(info[2].text === '⋯▼', JSON.stringify(info[2]));
  await page.evaluate(() => { ed.toolbar = window.__origToolbar; });
});

console.log('変数の挿入');
const VARS = [
  { type: 'group', label: '商品', variables: [{ label: '商品名', value: 'product_name' }, { label: 'SKUコード', value: 'sku' }] },
  { type: 'group', label: '顧客', variables: [{ label: '氏名', value: 'customer_name' }, { label: 'メール', value: 'email' }] },
  { label: '今日の日付', value: 'today' },
];
const varOpts = () => page.evaluate(() => [...ed.shadowRoot.querySelectorAll('.vars .opt')].map((o) => o.dataset.variable));

await test('variables を設定するまで「変数」ボタンは出ない', async () => {
  await page.evaluate(() => { ed.variables = null; });
  await page.waitForTimeout(30);
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('button[data-item="variable"]')), '未設定なのに表示');
  await page.evaluate((v) => { ed.variables = v; }, VARS);
  await page.waitForFunction(() => ed.shadowRoot.querySelector('button[data-item="variable"]'));
});

await test('ツールバー：検索欄にフォーカス、グループ名・変数名・変数値で絞り込み、矢印と Enter で挿入', async () => {
  await typeInP('<p>Hi</p>', '');
  await click('variable');
  await page.waitForFunction(() => ed.shadowRoot.activeElement?.name === 'variable-search');
  assert((await varOpts()).join() === 'product_name,sku,customer_name,email,today', '全件: ' + await varOpts());
  const grps = await page.evaluate(() => [...ed.shadowRoot.querySelectorAll('.vars .grp')].map((g) => g.textContent));
  assert(grps.join() === '商品,顧客', 'グループ見出し: ' + grps);
  await page.keyboard.type('商品');
  await page.waitForTimeout(30);
  assert((await varOpts()).join() === 'product_name,sku', 'グループ名: ' + await varOpts());
  await page.fill('formulit-editor >> input[name=variable-search]', 'MAIL');
  await page.waitForTimeout(30);
  assert((await varOpts()).join() === 'email', '変数値（大文字小文字無視）: ' + await varOpts());
  assert(await page.evaluate(() => ed.shadowRoot.querySelector('.vars .opt mark')?.textContent) === 'mail', '一致部分の強調');
  await page.fill('formulit-editor >> input[name=variable-search]', 'こーど');
  await page.waitForTimeout(30);
  assert((await varOpts()).join() === 'sku', 'ひらがなでカタカナに一致: ' + await varOpts());
  await page.fill('formulit-editor >> input[name=variable-search]', '顧客 名');
  await page.waitForTimeout(30);
  assert((await varOpts()).join() === 'customer_name', '空白区切りで AND: ' + await varOpts());
  await page.fill('formulit-editor >> input[name=variable-search]', '');
  await page.waitForTimeout(30);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(30);
  assert(await val() === '<p>Hi{{ sku }}</p>', await val());
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('.panel')), 'パネルが閉じていない');
  await page.keyboard.type('!');
  assert(await val() === '<p>Hi{{ sku }}!</p>', '挿入後に入力を続けられる: ' + await val());
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  assert(await val() === '<p>Hi</p>', 'undo: ' + await val());
});

await test('ツールバー：クリックで挿入・Esc で閉じる', async () => {
  await typeInP('<p>a</p>', '');
  await click('variable');
  await page.waitForFunction(() => ed.shadowRoot.querySelector('.vars .opt'));
  await page.keyboard.press('Escape');
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('.panel')), 'Esc');
  await click('variable');
  await page.click('formulit-editor >> .vars .opt[data-variable="today"]');
  await page.waitForTimeout(30);
  assert(await val() === '<p>a{{ today }}</p>', await val());
});

await test('本文で {{ と入力すると候補、続けて入力で絞り込み、Enter で {{…を置き換え', async () => {
  await typeInP('<p>Dear</p>', ' {{');
  await page.waitForFunction(() => ed.shadowRoot.querySelector('.popup .vars .opt'));
  assert((await varOpts()).length === 5, '候補: ' + await varOpts());
  await page.keyboard.type('氏名');
  await page.waitForTimeout(30);
  assert((await varOpts()).join() === 'customer_name', '絞り込み: ' + await varOpts());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(30);
  assert((await val()).replace(/&nbsp;/g, ' ') === '<p>Dear {{ customer_name }}</p>', await val());
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('.popup')), 'ポップアップが残っている');
  await page.keyboard.type(' 様');
  assert((await val()).replace(/&nbsp;/g, ' ') === '<p>Dear {{ customer_name }} 様</p>', await val());
});

await test('本文の候補：矢印・Tab で選択、Esc で閉じて {{ はそのまま、}} を打つと閉じる', async () => {
  await typeInP('<p>x</p>', '{{');
  await page.waitForFunction(() => ed.shadowRoot.querySelector('.popup .vars'));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(30);
  assert(await val() === '<p>x{{ sku }}</p>', await val());
  await typeInP('<p>y</p>', '{{');
  await page.waitForFunction(() => ed.shadowRoot.querySelector('.popup'));
  await page.keyboard.press('Escape');
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('.popup')), 'Esc');
  assert(await val() === '<p>y{{</p>', await val());
  await typeInP('<p>z</p>', '{{abc}}');
  await page.waitForTimeout(30);
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('.popup')), '}} で閉じない');
  await typeInP('<p>w</p>', '{{zzzz');
  await page.waitForTimeout(30);
  assert(await page.evaluate(() => ed.shadowRoot.querySelector('.popup .empty')?.textContent) === '一致する変数がありません', '一致なし');
  await page.keyboard.press('Enter');
  assert((await val()).startsWith('<p>w{{zzzz</p><p>'), '一致なしの Enter は改行: ' + await val());
});

await test('全角の ｛｛ でも候補が出る', async () => {
  await typeInP('<p>q</p>', '');
  await page.evaluate(() => document.execCommand('insertText', false, '｛｛'));
  await page.waitForFunction(() => ed.shadowRoot.querySelector('.popup .vars'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(30);
  assert(await val() === '<p>q{{ product_name }}</p>', await val());
});

await test('variableFormat で書式を変える（{ open, close } なら open がきっかけ、関数も可）', async () => {
  await page.evaluate(() => { ed.variableFormat = { open: '${', close: '}' }; });
  await typeInP('<p>a</p>', '{{');
  await page.waitForTimeout(30);
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('.popup')), '{{ で開いてしまう');
  await typeInP('<p>b</p>', '${sk');
  await page.waitForFunction(() => ed.shadowRoot.querySelector('.popup .vars .opt'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(30);
  assert(await val() === '<p>b${sku}</p>', await val());
  await page.evaluate(() => { ed.variableFormat = (v) => `[[${v.value.toUpperCase()}]]`; ed.variableTrigger = '@@'; });
  await typeInP('<p>c</p>', '@@today');
  await page.waitForFunction(() => ed.shadowRoot.querySelector('.popup .vars .opt'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(30);
  assert(await val() === '<p>c[[TODAY]]</p>', await val());
  const r = await page.evaluate(() => { ed.variableTrigger = false; return null; });
  await typeInP('<p>d</p>', '@@');
  await page.waitForTimeout(30);
  assert(await page.evaluate(() => !ed.shadowRoot.querySelector('.popup')), 'false で無効にならない');
  await page.evaluate(() => { ed.variableFormat = null; ed.variableTrigger = null; });
});

await test('insertVariable() で挿入し、formulit-variable-insert を発火', async () => {
  await typeInP('<p>e</p>', '');
  const detail = await page.evaluate(() => new Promise((res) => {
    ed.addEventListener('formulit-variable-insert', (e) => res(e.detail), { once: true });
    ed.insertVariable('email');
  }));
  assert(detail.text === '{{ email }}' && detail.variable.label === 'メール', JSON.stringify(detail));
  assert(await val() === '<p>e{{ email }}</p>', await val());
  await page.evaluate(() => { ed.variables = null; });
});

console.log('接続前の設定');
await test('ページに付ける前に設定した value が接続後も残る（form の reset でもその値に戻る）', async () => {
  const out = await page.evaluate(async () => {
    const f = document.createElement('form');
    const el = document.createElement('formulit-editor');
    el.setAttribute('name', 'x');
    el.value = '<P class=a>こんにちは</P>';
    f.append(el);
    document.body.append(f);
    await el.updateComplete;
    const r = { value: el.value, dom: el.editable.innerHTML, fd: new FormData(f).get('x'), dirty: el.dirty };
    el.value = '<p>別</p>';
    f.reset();
    r.reset = el.value;
    f.remove();
    return r;
  });
  assert(out.value === '<P class=a>こんにちは</P>', 'value: ' + out.value);
  assert(out.dom === '<p class="a">こんにちは</p>', 'dom: ' + out.dom);
  assert(out.fd === '<P class=a>こんにちは</P>' && out.dirty === false, JSON.stringify(out));
  assert(out.reset === '<P class=a>こんにちは</P>', 'reset: ' + out.reset);
});

await test('接続前の value は子要素の初期値より優先する', async () => {
  const out = await page.evaluate(async () => {
    const el = document.createElement('formulit-editor');
    el.innerHTML = '<script type="text/html"><p>子要素</p><\/script>';
    el.value = '<p>プロパティ</p>';
    document.body.append(el);
    await el.updateComplete;
    const r = [el.value, el.querySelectorAll(':scope > script').length];
    el.remove();
    return r;
  });
  assert(out[0] === '<p>プロパティ</p>' && out[1] === 0, JSON.stringify(out));
});

await test('要素の定義前（アップグレード前）に設定した value・imageUploader・toolbar も引き継ぐ', async () => {
  const out = await page.evaluate(async () => {
    const doc = document.implementation.createHTMLDocument('');
    const el = doc.createElement('formulit-editor'); // この文書には定義がないので未アップグレード
    el.value = '<p>early</p>';
    el.imageUploader = async () => 'x';
    el.toolbar = ['bold'];
    document.body.append(document.adoptNode(el));
    await el.updateComplete;
    const r = {
      upgraded: typeof el.focusEditor === 'function', value: el.value,
      uploader: typeof el.imageUploader, own: Object.prototype.hasOwnProperty.call(el, 'value'),
      buttons: [...el.shadowRoot.querySelectorAll('.toolbar [data-item]')].map((b) => b.dataset.item).join(),
    };
    el.remove();
    return r;
  });
  assert(out.upgraded && out.value === '<p>early</p>' && !out.own, JSON.stringify(out));
  assert(out.uploader === 'function', 'imageUploader: ' + out.uploader);
  assert(out.buttons === 'bold', 'toolbar: ' + out.buttons);
});

await test('Lit のテンプレートで .value を渡す（初回の描画・条件付きの描画でも値が入る）', async () => {
  const out = await page.evaluate(async () => {
    const { LitElement, html, render } = await import('lit');
    // 1. render() で直接描画
    const box = document.createElement('div');
    document.body.append(box);
    const view = (v) => html`<formulit-editor .value=${v} .variables=${[{ label: 'a', value: 'a' }]}></formulit-editor>`;
    render(view('<p>lit の初期値</p>'), box);
    const el = box.querySelector('formulit-editor');
    await el.updateComplete;
    const r = { first: el.value, text: el.editable.textContent, vars: !!el.shadowRoot.querySelector('[data-item="variable"]') };
    render(view('<p>更新後</p>'), box);
    r.updated = el.value;
    r.same = box.querySelector('formulit-editor') === el;
    box.remove();
    // 2. LitElement の中で、ボタンを押したときに出す（updated() で読む）
    if (!customElements.get('formulit-repro-test')) {
      customElements.define('formulit-repro-test', class extends LitElement {
        static properties = { shown: { state: true } };
        constructor() { super(); this.shown = false; this.log = []; }
        render() { return this.shown ? html`<formulit-editor .value=${'<p>こんにちは</p>'}></formulit-editor>` : ''; }
        updated() { const e = this.renderRoot.querySelector('formulit-editor'); if (e) this.log.push(e.value); }
      });
    }
    const host = document.createElement('formulit-repro-test');
    document.body.append(host);
    await host.updateComplete;
    host.shown = true;
    await host.updateComplete;
    const ed = host.renderRoot.querySelector('formulit-editor');
    await ed.updateComplete;
    r.repro = [...host.log, ed.value, ed.editable.textContent];
    host.remove();
    return r;
  });
  assert(out.first === '<p>lit の初期値</p>' && out.text === 'lit の初期値', JSON.stringify(out));
  assert(out.vars, 'variables');
  assert(out.same && out.updated === '<p>更新後</p>', '再描画: ' + JSON.stringify(out));
  assert(out.repro.join('|') === '<p>こんにちは</p>|<p>こんにちは</p>|こんにちは', '条件付きの描画: ' + JSON.stringify(out.repro));
});

await test('付け外ししても内容と履歴を保つ', async () => {
  const out = await page.evaluate(async () => {
    const el = document.createElement('formulit-editor');
    el.value = '<p>a</p>';
    document.body.append(el);
    await el.updateComplete;
    el.remove();
    document.body.append(el);
    await el.updateComplete;
    const r = el.value;
    el.remove();
    return r;
  });
  assert(out === '<p>a</p>', out);
});

console.log('シャドウ DOM の中');
// Lit コンポーネントなどのシャドウ DOM の中に置いた場合（document.getSelection() では中の選択が取れない）
await page.evaluate(() => {
  if (!customElements.get('shadow-host-test')) {
    customElements.define('shadow-host-test', class extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: 'open' }).innerHTML = '<formulit-editor toolbar="undo redo bold italic link ul"></formulit-editor>';
      }
    });
  }
  const h = document.createElement('shadow-host-test');
  document.body.append(h);
  window.sed = h.shadowRoot.querySelector('formulit-editor');
});
const S = 'shadow-host-test formulit-editor';
const sval = () => page.evaluate(() => sed.value);
const sset = (v) => page.evaluate((v) => { sed.value = v; }, v);
const sEnd = async (selector) => { await page.click(`${S} .formulit-editable ${selector}`); await page.keyboard.press('End'); };
const sSelectLeft = async (n) => { for (let i = 0; i < n; i++) await page.keyboard.press('Shift+ArrowLeft'); };

await test('シャドウ DOM の中：getRange() が中の選択範囲を返す', async () => {
  await sset('<p>hello world</p>');
  await sEnd('p');
  await sSelectLeft(5);
  const r = await page.evaluate(() => { const r = sed.getRange(); return r && [r.toString(), sed.editable.contains(r.commonAncestorContainer)]; });
  assert(r && r[0] === 'world' && r[1], JSON.stringify(r));
});

await test('シャドウ DOM の中：選択してツールバーの太字・Ctrl+I', async () => {
  await sset('<p>hello world</p>');
  await sEnd('p');
  await sSelectLeft(5);
  await page.click(`${S} >> button[data-item="bold"]`);
  assert(await sval() === '<p>hello <b>world</b></p>', 'bold: ' + await sval());
  await sEnd('p');
  await sSelectLeft(5);
  await page.keyboard.press('ControlOrMeta+i');
  assert(await sval() === '<p>hello <b><i>world</i></b></p>', 'italic: ' + await sval());
});

await test('シャドウ DOM の中：選択範囲にリンク（ダイアログを経ても選択を覚えている）', async () => {
  await sset('<p>click here</p>');
  await sEnd('p');
  await sSelectLeft(4);
  await page.click(`${S} >> button[data-item="link"]`);
  await page.fill(`${S} >> input[name=href]`, 'https://a.example/');
  await page.click(`${S} >> .dialog button[type=submit]`);
  assert(await sval() === '<p>click <a href="https://a.example/">here</a></p>', await sval());
});

await test('シャドウ DOM の中：入力・元に戻す後もカーソル位置に入力される', async () => {
  await sset('<p>abc</p>');
  await sEnd('p');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('X');
  assert(await sval() === '<p>abXc</p>', 'input: ' + await sval());
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.type('Y');
  assert(await sval() === '<p>abYc</p>', 'undo 後: ' + await sval());
});

await test('（比較）シャドウ DOM の外：入力・元に戻す後もカーソル位置に入力される', async () => {
  await setVal('<p>abc</p>');
  await page.click('formulit-editor .formulit-editable p');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('X');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.type('Y');
  assert(await val() === '<p>abYc</p>', 'undo 後: ' + await val());
});

await test('シャドウ DOM の中：行頭の / でコマンドメニュー', async () => {
  await sset('<p><br></p>');
  await page.click(`${S} .formulit-editable p`);
  await page.keyboard.type('/');
  await page.waitForFunction(() => sed.shadowRoot.querySelector('.popup .opt'), null, { timeout: 3000 });
  await page.keyboard.press('Escape');
});

await page.evaluate(() => document.querySelector('shadow-host-test').remove());

console.log('フォーム連携');
await test('form の FormData に value が入る・reset で初期値に戻る', async () => {
  await setVal('<p>form</p>');
  await placeCaret('p', 4); await page.keyboard.type('!');
  const fd = await page.evaluate(() => new FormData(document.getElementById('form')).get('body'));
  assert(fd === '<p>form!</p>', fd);
  await page.evaluate(() => document.getElementById('form').reset());
  assert((await val()).includes('手書き HTML の保持テスト'), 'reset');
});

await test('空にすると空文字', async () => {
  await setVal('<p>x</p>');
  await selectText('p');
  await page.keyboard.press('Backspace');
  assert(await val() === '', JSON.stringify(await val()));
});

await test('ページエラー・alert が発生していない', async () => {
  assert(errors.length === 0, errors.join('\n'));
});

await page.goto(`${base}/demo/index.html`);
await page.waitForFunction(() => window.ed?.shadowRoot?.querySelector('.toolbar button'));
await page.setViewportSize({ width: 1200, height: 900 });
await page.screenshot({ path: new URL(`./screenshot-${browserName}.png`, import.meta.url).pathname, fullPage: true });

console.log(`\n[${browserName}] ${pass} passed, ${fail} failed`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
