// formulit ドキュメントサイト共通スクリプト
// ヘッダー・サイドバー・目次・前後リンクの生成、コードブロックの色付けとコピー
const PAGES = [
  { group: 'はじめに', items: [['index.html', '概要'], ['getting-started.html', 'インストールと基本'], ['playground.html', 'プレイグラウンド']] },
  { group: 'ガイド', items: [['configuration.html', '設定'], ['toolbar.html', 'ツールバー'], ['features.html', '機能一覧'], ['html-preservation.html', 'HTML 保持の仕組み']] },
  { group: 'Markdown', items: [['markdown.html', 'Markdown エディタ']] },
  { group: '拡張', items: [['plugins.html', 'プラグインの作り方'], ['recipes.html', 'レシピ']] },
  { group: 'リファレンス', items: [['api.html', 'API リファレンス'], ['ai-skills.html', 'AI 用スキル']] },
];
// パッケージごとのバージョン（scripts/sync-version.mjs が更新する）
const VERSIONS = { 'formulit': '0.2.1', 'formulit-markdown': '0.1.0' };

const here = (location.pathname.split('/').pop() || 'index.html');
const IS_MD = here.startsWith('markdown');
const VERSION = IS_MD ? VERSIONS['formulit-markdown'] : VERSIONS.formulit;
const flat = PAGES.flatMap((g) => g.items);

function el(tag, attrs = {}, html = '') {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}

function buildChrome() {
  const header = el('header', { class: 'site-header' }, `
    <a class="logo" href="index.html"><i>F</i>${IS_MD ? 'formulit-markdown' : 'formulit'}</a><span class="ver">v${VERSION}</span>
    <nav>
      <a href="getting-started.html">ガイド</a>
      <a href="api.html">API</a>
      <a href="plugins.html">プラグイン</a>
      <a href="playground.html">プレイグラウンド</a>
      <a href="https://github.com/hidemikimura/formulit" rel="noopener">GitHub</a>
      <a href="markdown.html">Markdown</a>
      <a href="https://www.npmjs.com/package/@hidemikimura/formulit" rel="noopener">npm</a>
    </nav>
    <button class="menu-btn" type="button" aria-label="メニュー">☰ メニュー</button>`);
  header.querySelectorAll('nav a').forEach((a) => { if (a.getAttribute('href') === here) a.classList.add('on'); });
  header.querySelector('.menu-btn').onclick = () => document.body.classList.toggle('nav-open');

  const side = el('aside', { class: 'sidebar' });
  side.innerHTML = PAGES.map((g) => `<h6>${g.group}</h6>${g.items.map(([href, label]) =>
    `<a href="${href}"${href === here ? ' class="on" aria-current="page"' : ''}>${label}</a>`).join('')}`).join('');

  const main = document.querySelector('main');
  const layout = el('div', { class: 'layout' });
  main.before(layout);
  layout.append(side, main);

  // ページ内目次
  const heads = [...main.querySelectorAll('h2')];
  heads.forEach((h, i) => { if (!h.id) h.id = `s${i + 1}`; });
  if (heads.length > 1) {
    const toc = el('aside', { class: 'toc' }, `<b>このページの内容</b>${heads.map((h) => `<a href="#${h.id}">${h.textContent}</a>`).join('')}`);
    layout.append(toc);
    const links = [...toc.querySelectorAll('a')];
    const onScroll = () => {
      let cur = heads[0];
      for (const h of heads) if (h.getBoundingClientRect().top < 120) cur = h;
      links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${cur.id}`));
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // 前後のページ
  const i = flat.findIndex(([href]) => href === here);
  if (i >= 0 && !main.hasAttribute('data-no-pager')) {
    const prev = flat[i - 1];
    const next = flat[i + 1];
    main.append(el('nav', { class: 'pager' }, `
      ${prev ? `<a class="prev" href="${prev[0]}"><small>前へ</small>← ${prev[1]}</a>` : ''}
      ${next ? `<a class="next" href="${next[0]}"><small>次へ</small>${next[1]} →</a>` : ''}`));
  }

  document.body.prepend(header);
  document.body.append(el('footer', { class: 'site-footer' }, `formulit v${VERSIONS.formulit} · formulit-markdown v${VERSIONS['formulit-markdown']} — Lit で使える WYSIWYG エディタ · <a href="https://github.com/hidemikimura/formulit">GitHub</a> · 変更履歴（<a href="https://github.com/hidemikimura/formulit/blob/main/packages/formulit/CHANGELOG.md">formulit</a> / <a href="https://github.com/hidemikimura/formulit/blob/main/packages/formulit-markdown/CHANGELOG.md">markdown</a>）· MIT License © Hidemi Kimura`));
  const title = main.querySelector('h1')?.textContent;
  if (title && here !== 'index.html') document.title = `${title} | formulit`;
}

/* ---------- コードの色付け（簡易） ---------- */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wrap = (cls, s) => `<span class="tok-${cls}">${esc(s)}</span>`;

function highlight(src, lang) {
  let re;
  let classify;
  if (lang === 'html') {
    re = /(<!--[\s\S]*?-->)|(<\/?[\w-]+)|(\s[\w:@.?-]+)(?==)|("[^"]*"|'[^']*')|(\/?>)/g;
    classify = (m) => (m[1] ? 'c' : m[2] ? 't' : m[3] ? 'a' : m[4] ? 's' : 't');
  } else if (lang === 'css') {
    re = /(\/\*[\s\S]*?\*\/)|("[^"]*"|'[^']*')|([\w-]+)(?=\s*:[^:])|(#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw)?\b)/g;
    classify = (m) => (m[1] ? 'c' : m[2] ? 's' : m[3] ? 'a' : 'n');
  } else if (lang === 'bash') {
    re = /(#.*$)|("[^"]*"|'[^']*')|(^\s*(?:npm|npx|cp|mkdir|cd|git)\b)/gm;
    classify = (m) => (m[1] ? 'c' : m[2] ? 's' : 'k');
  } else {
    re = /(\/\/.*$|\/\*[\s\S]*?\*\/)|(`(?:\\.|\$\{[^}]*\}|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")|\b(import|from|export|default|const|let|var|function|return|async|await|new|if|else|for|of|in|class|extends|static|this|true|false|null|undefined|throw|try|catch|typeof)\b|\b(\d+(?:\.\d+)?)\b/gm;
    classify = (m) => (m[1] ? 'c' : m[2] ? 's' : m[3] ? 'k' : 'n');
  }
  let out = '';
  let last = 0;
  for (const m of src.matchAll(re)) {
    out += esc(src.slice(last, m.index)) + wrap(classify(m), m[0]);
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}

function dedent(text) {
  const lines = text.replace(/\t/g, '  ').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

/**
 * <script type="text/plain" class="code" data-lang="html"> … </script> をコードブロックにする。
 * data-from="script-id" を付けると、そのスクリプト（ライブデモ）の中身をそのまま表示する。
 */
function buildCode() {
  document.querySelectorAll('script.code[type="text/plain"]').forEach((s) => {
    const from = s.dataset.from ? document.getElementById(s.dataset.from) : null;
    const lang = s.dataset.lang ?? 'js';
    const text = dedent((from ?? s).textContent.replace(/<\\\/script/g, '</script'));
    const box = el('div', { class: 'code' });
    box.innerHTML = `<span class="lang">${lang}</span><button class="copy" type="button">コピー</button><pre><code>${highlight(text, lang)}</code></pre>`;
    box.querySelector('.copy').onclick = async (e) => {
      try { await navigator.clipboard.writeText(text); e.target.textContent = 'コピーしました'; } catch { e.target.textContent = 'コピーできません'; }
      setTimeout(() => { e.target.textContent = 'コピー'; }, 1500);
    };
    s.replaceWith(box);
  });
}

buildChrome();
buildCode();
