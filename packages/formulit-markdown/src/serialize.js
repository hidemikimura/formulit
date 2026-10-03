/**
 * HTML（DOM）→ Markdown（GFM）。
 *
 * Markdown で表せるもの（見出し・段落・強調・リンク・画像・リスト・ToDo・引用・コード・表・水平線）は Markdown に、
 * 表せないもの（文字色・下線・結合セル・属性付きの要素・独自要素など）は HTML のまま書き出す。
 * 書き出した結果をもう一度読み込むと同じ内容になることを優先し、迷うときは HTML を選ぶ。
 */
import { restore, TEXT_ATTR } from '@hidemikimura/formulit';

const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'dd', 'div', 'dl', 'dt', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'li', 'main', 'nav', 'ol',
  'p', 'pre', 'section', 'table', 'ul', 'iframe', 'video', 'audio', 'summary', 'caption', 'thead', 'tbody', 'tfoot', 'tr',
  'td', 'th', 'colgroup', 'col', 'style', 'script', 'template', 'center', 'menu', 'search', 'canvas', 'picture', 'object',
]);
// CommonMark の「HTML ブロック（6 種）」として始められるタグ
const HTML_BLOCK_6 = new Set([
  'address', 'article', 'aside', 'base', 'basefont', 'blockquote', 'body', 'caption', 'center', 'col', 'colgroup', 'dd',
  'details', 'dialog', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'frame', 'frameset',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'iframe', 'legend', 'li', 'link', 'main', 'menu',
  'menuitem', 'nav', 'noframes', 'ol', 'optgroup', 'option', 'p', 'param', 'search', 'section', 'summary', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'title', 'tr', 'track', 'ul',
]);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

const isBlockNode = (n) => n.nodeType === 1 && BLOCK.has(n.localName);
const isBlankText = (n) => n.nodeType === 3 && !/[^\s]/.test(n.data.replace(/\u00a0/g, 'x'));
const attrNames = (el) => [...el.attributes].map((a) => a.name).filter((n) => !n.startsWith('data-formulit-'));
/** 許した属性以外を持っていないか（編集用の一時属性は戻してから判定） */
function onlyAttrs(el, allowed = []) {
  const c = restored(el, false);
  return attrNames(c).every((n) => allowed.includes(n));
}

/** 編集用の一時的な属性を戻した複製 */
function restored(el, deep = true) {
  const box = document.createElement('div');
  box.append(el.cloneNode(deep));
  restore(box);
  return box.firstChild;
}

/** 要素をそのまま HTML にする */
export function outerHTML(el) {
  if (el.nodeType === 8) return `<!--${el.data}-->`;
  return restored(el).outerHTML;
}
function openTag(el) {
  const c = restored(el, false);
  const html = c.outerHTML;
  return VOID.has(el.localName) ? html : html.slice(0, html.length - `</${el.localName}>`.length);
}

/* ================= 文書全体 ================= */

export const DEFAULT_STYLE = Object.freeze({ bullet: '-', fence: '```', strong: '**', em: '*' });

/**
 * 原文から書き方の癖（箇条書きの記号・コードフェンス）を推定する。
 * 強調は日本語の文中でも確実に効く ** と * に固定（_ は単語の途中では強調にならないため）。
 */
export function detectStyle(src = '') {
  const count = (re) => (src.match(re) ?? []).length;
  const bullets = { '-': count(/^[ \t]*-[ \t]+\S/gm), '*': count(/^[ \t]*\*[ \t]+\S/gm), '+': count(/^[ \t]*\+[ \t]+\S/gm) };
  const bullet = Object.entries(bullets).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(bullets).sort((a, b) => b[1] - a[1])[0][0] : '-';
  const fence = count(/^[ \t]*~~~/gm) > count(/^[ \t]*```/gm) ? '~~~' : '```';
  return { ...DEFAULT_STYLE, bullet, fence };
}

/** HTML 文字列を Markdown にする */
export function htmlToMarkdown(html, style = DEFAULT_STYLE) {
  const t = document.createElement('template');
  t.innerHTML = html ?? '';
  return nodesToMarkdown([...t.content.childNodes], style);
}

/** トップレベルのノード列を Markdown にする（ブロックは空行で区切る） */
export function nodesToMarkdown(nodes, style = DEFAULT_STYLE) {
  const ctx = { style };
  const out = [];
  for (const b of blocksOf(nodes, ctx)) out.push(b);
  return joinBlocks(out);
}

/** ブロックの書き出し結果を空行でつなぐ。同じ種類のリストが続くときは記号を変えて別のリストにする */
export function joinBlocks(blocks) {
  let s = '';
  let prev = null;
  for (const b of blocks) {
    if (!b || b.text === '') continue;
    let { text } = b;
    if (prev && b.list && prev.list && b.list.ordered === prev.list.ordered && b.list.delim === prev.list.delim && b.relist) {
      text = b.relist(prev.list);
    }
    s += (s ? '\n\n' : '') + text;
    prev = b;
  }
  return s;
}

/**
 * ノード列をブロックの配列にする。連続するインライン（文字・強調など）は 1 つの段落にまとめる。
 * 各ブロック: { text, list? }（list は続くリストと区別するための情報）
 */
export function blocksOf(nodes, ctx) {
  const out = [];
  let inline = [];
  const flush = () => {
    if (inline.length) {
      const text = paragraph(inline, ctx);
      if (text) out.push({ text });
    }
    inline = [];
  };
  for (const n of nodes) {
    if (n.nodeType === 8) { flush(); out.push({ text: `<!--${n.data}-->` }); continue; }
    if (isBlockNode(n) || (n.nodeType === 1 && n.localName.includes('-') && ctx.top !== false)) {
      flush(); const b = block(n, ctx); if (b) out.push(b); continue;
    }
    if (n.nodeType === 1 && n.localName === 'br' && !inline.length) continue;
    if (isBlankText(n) && !inline.length) continue;
    inline.push(n);
  }
  flush();
  return out;
}

/* ================= ブロック ================= */

function block(el, ctx) {
  const name = el.localName;
  if (/^h[1-6]$/.test(name)) {
    if (!onlyAttrs(el)) return { text: htmlBlock(el) };
    const text = inlineText(el.childNodes, ctx).replace(/\s*\n\s*/g, ' ').trim();
    if (!text) return null;
    return { text: `${'#'.repeat(+name[1])} ${text.replace(/(^|\s)(#+)$/, '$1\\$2')}` };
  }
  if (name === 'p') {
    if (!onlyAttrs(el)) return { text: htmlBlock(el) };
    const text = paragraph([...el.childNodes], ctx);
    return text ? { text } : null;
  }
  if (name === 'hr') return onlyAttrs(el) ? { text: '---' } : { text: htmlBlock(el) };
  if (name === 'blockquote') {
    if (!onlyAttrs(el)) return { text: htmlBlock(el) };
    const inner = joinBlocks(blocksOf([...el.childNodes], ctx));
    if (!inner) return null;
    return { text: inner.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n') };
  }
  if (name === 'pre') return codeBlock(el, ctx);
  if (name === 'ul' || name === 'ol') return list(el, ctx);
  if (name === 'table') return table(el, ctx);
  if (name === 'figure') return figure(el, ctx);
  return { text: htmlBlock(el) };
}

/** HTML のまま書き出すブロック */
function htmlBlock(el) {
  let html = outerHTML(el);
  // HTML ブロックは空行で終わるので、中の空行は詰める（pre などの中身は変えない）
  if (/\n[ \t]*\n/.test(html) && !el.querySelector?.('pre,textarea,script,style')) html = html.replace(/\n[ \t]*\n/g, '\n');
  // 6 種に当たらない要素（独自要素など）は、開始タグだけの行で始めると HTML ブロックになる
  if (el.nodeType === 1 && !HTML_BLOCK_6.has(el.localName) && !VOID.has(el.localName)) {
    const open = openTag(el);
    if (html.startsWith(open) && html[open.length] !== '\n') html = `${open}\n${html.slice(open.length)}`;
  }
  return html;
}

function codeBlock(pre, ctx) {
  const code = pre.children.length === 1 && pre.firstElementChild.localName === 'code'
    && [...pre.childNodes].every((n) => n === pre.firstElementChild || isBlankText(n)) ? pre.firstElementChild : null;
  const lang = code ? /^language-(\S+)$/.exec(code.getAttribute('class') ?? '')?.[1] ?? '' : '';
  const codeOk = !code || onlyAttrs(code, code.getAttribute('class') && lang ? ['class'] : []);
  const textOnly = code
    ? [...code.childNodes].every((n) => n.nodeType === 3 || (n.nodeType === 1 && n.localName === 'br'))
    : [...pre.childNodes].every((n) => n.nodeType === 3 || (n.nodeType === 1 && n.localName === 'br'));
  if (!onlyAttrs(pre) || !codeOk || !textOnly) return { text: htmlBlock(pre) };
  const src = code ?? pre;
  let text = [...src.childNodes].map((n) => (n.nodeType === 3 ? n.data : '\n')).join('');
  // 編集用に置いた末尾の <br> や改行は 1 つ取る
  text = text.replace(/\n$/, '');
  let fence = ctx.style.fence;
  const ch = fence[0];
  const longest = Math.max(0, ...[...text.matchAll(new RegExp(`^[ \\t]*(\\${ch}{3,})`, 'gm'))].map((m) => m[1].length));
  if (longest >= fence.length) fence = ch.repeat(longest + 1);
  return { text: `${fence}${lang}\n${text}${text ? '\n' : ''}${fence}` };
}

function list(el, ctx) {
  const ordered = el.localName === 'ol';
  const todo = !ordered && el.classList.contains('todo-list');
  const allowed = todo ? ['class', 'style'] : ordered ? ['start'] : [];
  if (!onlyAttrs(el, allowed)) return { text: htmlBlock(el) };
  if (todo) {
    const c = restored(el, false);
    if (c.getAttribute('class') !== 'todo-list' || !/^\s*list-style:\s*none;?\s*$/.test(c.getAttribute('style') ?? '')) return { text: htmlBlock(el) };
  }
  const items = [...el.children];
  if (items.some((li) => li.localName !== 'li' || !onlyAttrs(li))) return { text: htmlBlock(el) };
  if ([...el.childNodes].some((n) => n.nodeType === 3 && !isBlankText(n))) return { text: htmlBlock(el) };
  const start = ordered ? parseInt(el.getAttribute('start') ?? '1', 10) || 1 : 1;
  const loose = items.some((li) => [...li.children].some((c) => c.localName === 'p'));
  const bodies = items.map((li) => {
    let nodes = [...li.childNodes];
    let box = '';
    if (todo) {
      const first = nodes.find((n) => !isBlankText(n));
      if (first?.nodeType === 1 && first.localName === 'input' && first.type === 'checkbox') {
        box = first.hasAttribute('checked') ? '[x] ' : '[ ] ';
        nodes = nodes.filter((n) => n !== first);
      }
    }
    const inner = blocksOf(nodes, ctx);
    const text = loose ? joinBlocks(inner) : inner.filter((b) => b?.text).map((b) => b.text).join('\n');
    return box + text;
  });
  const render = (bullet, delim) => bodies.map((body, i) => {
    const marker = ordered ? `${start + i}${delim}` : bullet;
    const pad = ' '.repeat(marker.length + 1);
    const lines = body.split('\n');
    return [`${marker}${lines[0] ? ` ${lines[0]}` : ''}`, ...lines.slice(1).map((l) => (l ? pad + l : ''))].join('\n');
  }).join(loose ? '\n\n' : '\n');
  // 原文から来たリストなら、その記号（- * + / . )）を使う
  const hint = ctx.hintFor?.(el);
  const bullet = !ordered && hint && !hint.ordered ? hint.delim : ctx.style.bullet;
  const delim = ordered && hint?.ordered ? hint.delim : '.';
  const info = { ordered, delim: ordered ? delim : bullet };
  return {
    text: render(bullet, delim),
    list: info,
    // 直前も同じ種類のリストなら、記号を変えて別のリストにする
    relist: (prev) => {
      if (ordered) { info.delim = prev.delim === '.' ? ')' : '.'; return render(bullet, info.delim); }
      const other = ['-', '*', '+'].find((b) => b !== prev.delim);
      info.delim = other;
      return render(other, '.');
    },
  };
}

function figure(el, ctx) {
  // formulit の画像（<figure class="image"><img></figure>）で、キャプションも配置もなければ ![]() にする
  const kids = [...el.childNodes].filter((n) => !isBlankText(n));
  const c = restored(el, false);
  const plain = c.getAttribute('class') === 'image' && attrNames(c).length === 1;
  if (plain && kids.length === 1 && kids[0].localName === 'img') {
    const img = image(kids[0]);
    if (img) return { text: img };
  }
  return { text: htmlBlock(el) };
}

function table(el, ctx) {
  const fallback = { text: htmlBlock(el) };
  if (!onlyAttrs(el)) return fallback;
  const sections = [...el.children];
  if (sections.some((s) => !['thead', 'tbody', 'tr'].includes(s.localName) || !onlyAttrs(s))) return fallback;
  const rows = [...el.rows];
  if (!rows.length || rows.some((r) => !onlyAttrs(r))) return fallback;
  const thead = el.tHead;
  if (thead && thead.rows.length !== 1) return fallback;
  const head = thead ? thead.rows[0] : rows[0];
  const body = rows.filter((r) => r !== head);
  const cellOk = (c) => onlyAttrs(c, ['style']) && /^\s*(text-align:\s*(left|center|right);?\s*)?$/.test(restored(c, false).getAttribute('style') ?? '')
    && ![...c.childNodes].some((n) => isBlockNode(n));
  const all = rows.flatMap((r) => [...r.cells]);
  if (all.some((c) => !cellOk(c) || c.rowSpan > 1 || c.colSpan > 1)) return fallback;
  if (!thead && [...head.cells].some((c) => c.localName !== 'th')) {
    // 見出し行のない表は、1 行目を見出しとして書く（Markdown の表には見出し行が必須）
  }
  const cols = Math.max(...rows.map((r) => r.cells.length));
  const cell = (c) => {
    if (!c) return '';
    const onlyBr = [...c.childNodes].every((n) => isBlankText(n) || (n.nodeType === 1 && n.localName === 'br'));
    if (onlyBr) return '';
    return inlineText(c.childNodes, { ...ctx, table: true }).replace(/\s*\n\s*/g, ' ').trim();
  };
  const line = (r) => `| ${Array.from({ length: cols }, (_, i) => cell(r.cells[i])).join(' | ')} |`;
  const align = Array.from({ length: cols }, (_, i) => {
    const a = /text-align:\s*(left|center|right)/.exec(head.cells[i]?.getAttribute('style') ?? '')?.[1];
    return a === 'left' ? ':---' : a === 'center' ? ':---:' : a === 'right' ? '---:' : '---';
  });
  return { text: [line(head), `| ${align.join(' | ')} |`, ...body.map(line)].join('\n') };
}

/* ================= 段落とインライン ================= */

/** 段落の本文。行頭で別の記法にならないようにエスケープし、末尾の空白（改行の意味になる）を消す */
function paragraph(nodes, ctx) {
  const text = inlineText(nodes, ctx);
  return text.split('\n').map((l) => escapeLineStart(l.replace(/^[ \t]+/, '').replace(/[ \t]+$/, ''))).join('\n')
    .replace(/^\n+|\n+$/g, '');
}

function escapeLineStart(l) {
  return l
    .replace(/^(#{1,6})(?=\s|$)/, '\\$1')
    .replace(/^>/, '\\>')
    .replace(/^([-+])(?=\s|$)/, '\\$1')
    .replace(/^(=+|-+)$/, (m) => `\\${m}`)
    .replace(/^(\d{1,9})([.)])(?=\s|$)/, '$1\\$2');
}

export function inlineText(nodes, ctx) {
  let s = '';
  let afterBr = false;
  const list = [...nodes];
  list.forEach((n, i) => {
    if (n.nodeType === 3) {
      let t = n.data;
      if (afterBr) t = t.replace(/^\n/, '');
      s += escapeText(t, ctx);
      afterBr = false;
      return;
    }
    afterBr = false;
    if (n.nodeType === 8) { s += `<!--${n.data}-->`; return; }
    if (n.nodeType !== 1) return;
    if (n.localName === 'br') {
      // 最後の <br>（編集用の置き場所）は無視
      if (list.slice(i + 1).every((m) => isBlankText(m))) return;
      s += ctx.table ? '<br>' : '\\\n';
      afterBr = true;
      return;
    }
    s += inlineEl(n, ctx);
  });
  return s;
}

const PUNCT = /[\p{P}\p{S}]/u;

/** 強調などの記号で囲む。中身の端の空白は外に出す。端が記号の場合は Markdown では効かないことがあるので HTML にする */
function wrap(el, delim, tag, ctx) {
  const inner = inlineText(el.childNodes, ctx);
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
  if (!m[2]) return inner;
  if (PUNCT.test(m[2][0]) || PUNCT.test(m[2].at(-1)) || m[2].includes('\n')) return `${m[1]}<${tag}>${m[2]}</${tag}>${m[3]}`;
  return `${m[1]}${delim}${m[2]}${delim}${m[3]}`;
}

function inlineEl(el, ctx) {
  // 編集中だけの要素（変数の表示など）は、記録した文字列に戻す
  if (el.hasAttribute(TEXT_ATTR)) return escapeText(el.getAttribute(TEXT_ATTR), ctx);
  const name = el.localName;
  const plain = onlyAttrs(el);
  if (plain && (name === 'strong' || name === 'b')) return wrap(el, ctx.style.strong, 'strong', ctx);
  if (plain && (name === 'em' || name === 'i')) return wrap(el, ctx.style.em, 'em', ctx);
  if (plain && (name === 's' || name === 'del' || name === 'strike')) return wrap(el, '~~', 's', ctx);
  if (plain && name === 'code' && [...el.childNodes].every((n) => n.nodeType === 3)) return codeSpan(el.textContent, ctx);
  if (name === 'a' && onlyAttrs(el, ['href', 'title'])) return link(el, ctx);
  if (name === 'img') return image(el) ?? outerHTML(el);
  if (name === 'span' && plain) return inlineText(el.childNodes, ctx);
  if (name === 'input') return outerHTML(el);
  // それ以外（下線・文字色・上付きなど）は HTML のタグで囲み、中身は Markdown で書く
  if (VOID.has(name)) return outerHTML(el);
  if (['script', 'style', 'textarea', 'template', 'svg', 'math', 'iframe', 'object', 'video', 'audio'].includes(name)) return outerHTML(el);
  return `${openTag(el)}${inlineText(el.childNodes, ctx)}</${name}>`;
}

function codeSpan(text, ctx) {
  text = text.replace(/\u00a0/g, ' ');
  if (ctx.table) text = text.replace(/\|/g, '\\|');
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = '`'.repeat(longest + 1);
  const pad = /^`|`$/.test(text) || (/^ .*[^ ].* $/.test(text)) ? ' ' : '';
  return `${ticks}${pad}${text}${pad}${ticks}`;
}

function url(href) {
  if (/[\s<>]/.test(href) || /[()]/.test(href) && !balanced(href)) return `<${href.replace(/[<>]/g, (c) => encodeURIComponent(c))}>`;
  return href;
}
const balanced = (s) => { let n = 0; for (const c of s) { if (c === '(') n++; else if (c === ')' && --n < 0) return false; } return n === 0; };
const title = (t) => (t ? ` "${t.replace(/["\\]/g, '\\$&')}"` : '');

function link(a, ctx) {
  const href = a.getAttribute('href') ?? '';
  const text = inlineText(a.childNodes, ctx);
  const t = a.getAttribute('title');
  if (!t && a.children.length === 0 && a.textContent === href) {
    // 自動リンク（GFM は URL をそのまま書けばリンクになる）
    if (/^https?:\/\/[^\s<>]+$/.test(href) && !/[.,:;!?)\]'"]$/.test(href)) return href.replace(/[*_~`]/g, '\\$&');
    if (/^(https?:|mailto:)[^\s<>]+$/.test(href)) return `<${href}>`;
  }
  if (!text.trim() && !a.querySelector('img')) return outerHTML(a);
  return `[${text}](${url(href)}${title(t)})`;
}

function image(img) {
  if (!onlyAttrs(img, ['src', 'alt', 'title'])) return null;
  const alt = (img.getAttribute('alt') ?? '').replace(/[[\]\\]/g, '\\$&');
  return `![${alt}](${url(img.getAttribute('src') ?? '')}${title(img.getAttribute('title'))})`;
}

/** 文字をエスケープ（Markdown の記号として解釈されないように） */
function escapeText(t, ctx) {
  t = t.replace(/\u00a0/g, ' ');
  t = t.replace(/[\\`*[\]~]/g, '\\$&');
  // _ は単語の途中なら強調にならないので、区切りに接するときだけエスケープ
  t = t.replace(/_/g, (m, i, s) => (/[\p{L}\p{N}]/u.test(s[i - 1] ?? '') && /[\p{L}\p{N}]/u.test(s[i + 1] ?? '') ? '_' : '\\_'));
  t = t.replace(/<(?=[a-zA-Z/!?])/g, '\\<');
  t = t.replace(/&(?=#?[a-zA-Z0-9]+;)/g, '&amp;');
  if (ctx.table) t = t.replace(/\|/g, '\\|');
  return t;
}
