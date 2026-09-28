/**
 * インライン書式の基盤。
 *
 * execCommand の fontSize（1〜7 しか指定できない）や foreColor（<font> を作る）は
 * 出力 HTML がブラウザ任せになるため、選択範囲のテキストノードを自前で
 * <span style="..."> や任意の要素で囲む・外す。
 *
 * 操作（op）は次の 2 種類:
 *   { kind: 'style', prop: 'color', value: '#c00' }   value が null なら解除
 *   { kind: 'wrap', tag: 'code', classes: [], attrs: {} , remove?: true }
 */

export const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,pre,blockquote,div,td,th,dt,dd,figcaption,'
  + 'address,section,article,header,footer,aside,nav,main,figure,caption,summary,details';
const STRUCTURAL = new Set(['ul', 'ol', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'dl', 'select', 'colgroup']);
const BLOCK_TAGS = new Set(BLOCK_SELECTOR.split(',').concat(['ul', 'ol', 'table', 'hr', 'dl']));
/** 「書式をクリア」「書式コピー」で外すインライン要素 */
export const FORMAT_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup',
  'code', 'mark', 'font', 'small', 'big', 'span', 'kbd', 'var', 'samp', 'tt']);
const OBJECT_SELECTOR = 'img,br,hr,input,iframe,video,audio,svg,canvas,object,embed,picture';

/* ---------- 範囲とテキストノード ---------- */

/** 範囲の両端がテキストの途中なら分割し、範囲がテキストノードをちょうど覆うようにする */
export function splitBoundaries(range) {
  let { startContainer: sc, startOffset: so, endContainer: ec, endOffset: eo } = range;
  if (ec.nodeType === 3 && eo > 0 && eo < ec.length) {
    ec.splitText(eo);
  }
  if (sc.nodeType === 3 && so > 0 && so < sc.length) {
    const tail = sc.splitText(so);
    if (ec === sc) { ec = tail; eo -= so; }
    sc = tail; so = 0;
  }
  const r = document.createRange();
  r.setStart(sc, so);
  r.setEnd(ec, eo);
  return r;
}

function isEditableText(t, root) {
  for (let p = t.parentElement; p && p !== root; p = p.parentElement) {
    if (p.getAttribute('contenteditable') === 'false') return false;
    if (p.localName === 'script' || p.localName === 'style') return false;
  }
  return true;
}

function isLayoutWhitespace(t) {
  if (t.data.trim()) return false;
  const p = t.parentNode;
  if (!p || STRUCTURAL.has(p.localName) || p.classList?.contains('formulit-editable')) return true;
  const isB = (n) => n?.nodeType === 1 && BLOCK_TAGS.has(n.localName);
  return isB(t.previousSibling) || isB(t.nextSibling);
}

/** 範囲に完全に含まれる（編集可能な）テキストノード */
export function textNodesInRange(range, root) {
  const out = [];
  const container = range.commonAncestorContainer;
  if (container.nodeType === 3) {
    if (container.length && range.startOffset < range.endOffset && isEditableText(container, root)) out.push(container);
    return out;
  }
  const w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    if (!t.length || !range.intersectsNode(t)) continue;
    if (range.comparePoint(t, 0) < 0 || range.comparePoint(t, t.length) > 0) continue;
    if (!isEditableText(t, root) || isLayoutWhitespace(t)) continue;
    out.push(t);
  }
  return out;
}

export function closestBlock(node, root) {
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  const b = el?.closest(BLOCK_SELECTOR);
  return b && b !== root && root.contains(b) ? b : null;
}

/** 選択範囲にかかっている段落などのブロック（文書順） */
export function selectedBlocks(range, root) {
  const set = new Set();
  const add = (n) => { const b = closestBlock(n, root); if (b) set.add(b); };
  add(range.startContainer.nodeType === 1 ? range.startContainer.childNodes[range.startOffset] ?? range.startContainer : range.startContainer);
  if (!range.collapsed) {
    const w = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) if (range.intersectsNode(t) && t.data.trim()) add(t);
    add(range.endContainer);
  }
  return [...set].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

/** node の祖先のうち、ブロックに達するまでのインライン要素（内側から） */
export function inlineAncestors(node, root) {
  const out = [];
  for (let p = node.parentElement; p && p !== root; p = p.parentElement) {
    if (BLOCK_TAGS.has(p.localName) || p.matches(BLOCK_SELECTOR)) break;
    out.push(p);
  }
  return out;
}

/* ---------- 分割・ラップ ---------- */

function isEmptyFragment(f) {
  return !f.textContent && !f.querySelector?.(OBJECT_SELECTOR);
}

/**
 * ancestor を分割し、node だけを含む状態にする（前後の部分は ancestor の複製に移す）。
 *   <b>ab[c]de</b> → <b>ab</b><b>[c]</b><b>de</b>
 */
export function isolate(node, ancestor) {
  const before = document.createRange();
  before.setStart(ancestor, 0);
  before.setEndBefore(node);
  if (!before.collapsed) {
    const f = before.extractContents();
    if (!isEmptyFragment(f)) {
      const c = ancestor.cloneNode(false);
      c.append(f);
      ancestor.before(c);
    }
  }
  const after = document.createRange();
  after.setStartAfter(node);
  after.setEnd(ancestor, ancestor.childNodes.length);
  if (!after.collapsed) {
    const f = after.extractContents();
    if (!isEmptyFragment(f)) {
      const c = ancestor.cloneNode(false);
      c.append(f);
      ancestor.after(c);
    }
  }
  return ancestor;
}

export function unwrap(el) {
  el.replaceWith(...el.childNodes);
}

function wrap(node, wrapper) {
  node.before(wrapper);
  wrapper.append(node);
  return wrapper;
}

function cleanupSpan(el) {
  if (el.getAttribute('style') === '') el.removeAttribute('style');
  if (el.getAttribute('class') === '') el.removeAttribute('class');
  if (el.localName === 'span' && !el.attributes.length) unwrap(el);
}

function sameShell(a, b) {
  return a?.nodeType === 1 && b?.nodeType === 1 && a.localName === b.localName
    && a.cloneNode(false).outerHTML === b.cloneNode(false).outerHTML;
}

/** 隣り合った同じ要素（同じ属性）をまとめる */
function mergeAround(el) {
  if (!el?.parentNode) return el;
  const prev = el.previousSibling;
  if (sameShell(prev, el)) {
    prev.append(...el.childNodes);
    el.remove();
    el = prev;
  }
  const next = el.nextSibling;
  if (sameShell(next, el)) {
    el.append(...next.childNodes);
    next.remove();
  }
  return el;
}

export function matchesWrap(el, op) {
  if (el.localName !== op.tag) return false;
  return (op.classes ?? []).every((c) => el.classList.contains(c));
}

function createWrapper(op) {
  const el = document.createElement(op.tag);
  if (op.classes?.length) el.className = op.classes.join(' ');
  for (const [k, v] of Object.entries(op.attrs ?? {})) el.setAttribute(k, v);
  return el;
}

/* ---------- 操作の適用 ---------- */

function applyStyle(t, root, prop, value) {
  // 解除：祖先の span からそのプロパティを取り除く（部分的なら分割）
  for (const a of inlineAncestors(t, root)) {
    if (!a.style?.getPropertyValue(prop)) continue;
    if (value != null && a.parentNode && a.childNodes.length === 1 && a.firstChild === t) break;
    isolate(t, a);
    a.style.removeProperty(prop);
    cleanupSpan(a);
  }
  if (value == null) return;
  const parent = t.parentNode;
  if (parent.localName === 'span' && parent.childNodes.length === 1 && parent !== root) {
    parent.style.setProperty(prop, value);
    mergeAround(parent);
  } else {
    const span = document.createElement('span');
    span.style.setProperty(prop, value);
    mergeAround(wrap(t, span));
  }
}

function applyWrap(t, root, op) {
  const hit = inlineAncestors(t, root).filter((a) => matchesWrap(a, op));
  if (op.remove) {
    for (const a of hit) {
      isolate(t, a);
      if (op.classes?.length && a.localName === 'span') {
        a.classList.remove(...op.classes);
        cleanupSpan(a);
      } else {
        unwrap(a);
      }
    }
    return;
  }
  if (!hit.length) mergeAround(wrap(t, createWrapper(op)));
}

/**
 * 範囲に op を適用し、同じテキストを覆う新しい範囲を返す。
 */
export function applyOps(range, root, ops) {
  let r = splitBoundaries(range);
  const texts = textNodesInRange(r, root);
  if (!texts.length) return r;
  for (const op of ops) {
    for (const t of texts) {
      if (op.kind === 'style') applyStyle(t, root, op.prop, op.value);
      else if (op.kind === 'wrap') applyWrap(t, root, op);
    }
  }
  return rangeOver(texts);
}

export function rangeOver(texts) {
  const r = document.createRange();
  r.setStart(texts[0], 0);
  const last = texts.at(-1);
  r.setEnd(last, last.length);
  return r;
}

/** 範囲内のテキストが全部 op の要素の中にあるか（ボタンの押下状態用） */
export function isWrapActive(range, root, op) {
  if (range.collapsed) {
    const n = range.startContainer;
    return inlineAncestors(n.nodeType === 3 ? n : n.childNodes[range.startOffset] ?? n, root)
      .some((a) => matchesWrap(a, op)) || (n.nodeType === 1 && matchesWrap(n, op));
  }
  const texts = textNodesInRange(range, root);
  return texts.length > 0 && texts.every((t) => inlineAncestors(t, root).some((a) => matchesWrap(a, op)));
}

/** カーソル位置で有効なインラインスタイル値（無ければ ''） */
export function styleAt(range, root, prop) {
  let n = range.startContainer;
  if (n.nodeType === 1) n = n.childNodes[range.startOffset] ?? n;
  for (let p = n.nodeType === 1 ? n : n.parentElement; p && p !== root; p = p.parentElement) {
    const v = p.style?.getPropertyValue(prop);
    if (v) return v;
    if (p.matches(BLOCK_SELECTOR) && prop !== 'line-height') break;
  }
  return '';
}

/** 書式（インライン要素）をすべて外す。リンクや独自要素は残す */
export function removeFormatting(range, root) {
  const r = splitBoundaries(range);
  const texts = textNodesInRange(r, root);
  for (const t of texts) {
    for (const a of inlineAncestors(t, root)) {
      if (!FORMAT_TAGS.has(a.localName)) continue;
      isolate(t, a);
      unwrap(a);
    }
  }
  return texts.length ? rangeOver(texts) : r;
}

/** 書式コピー用：カーソル位置のインライン書式を外側→内側の順で複製 */
export function captureFormatting(range, root) {
  let n = range.startContainer;
  if (n.nodeType === 1) n = n.childNodes[range.startOffset] ?? n;
  const base = n.nodeType === 3 ? n : n.firstChild ?? n;
  return inlineAncestors(base, root).filter((a) => FORMAT_TAGS.has(a.localName)).reverse().map((a) => a.cloneNode(false));
}

export function applyFormatting(range, root, chain) {
  let r = removeFormatting(range, root);
  const texts = textNodesInRange(r, root);
  if (!chain.length || !texts.length) return r;
  for (const t of texts) {
    let target = t;
    for (const shell of [...chain].reverse()) target = wrap(target, shell.cloneNode(false));
  }
  // 同じ入れ子が隣り合ったらまとめる
  for (const t of texts) {
    let top = t;
    while (top.parentElement && inlineAncestors(t, root).includes(top.parentElement)) top = top.parentElement;
    mergeDeep(top);
  }
  return rangeOver(texts);
}

function mergeDeep(el) {
  if (el.nodeType !== 1) return;
  const merged = mergeAround(el);
  for (const c of [...merged.children]) mergeDeep(c);
}

/** 大文字・小文字・先頭大文字の変換 */
export function changeCase(range, root, mode) {
  const r = splitBoundaries(range);
  const texts = textNodesInRange(r, root);
  let prevLetter = false;
  for (const t of texts) {
    if (mode === 'upper') t.data = t.data.toUpperCase();
    else if (mode === 'lower') t.data = t.data.toLowerCase();
    else {
      let s = '';
      for (const ch of t.data) {
        const letter = /\p{L}|\p{N}|['’]/u.test(ch);
        s += letter ? (prevLetter ? ch.toLowerCase() : ch.toUpperCase()) : ch;
        prevLetter = letter;
      }
      t.data = s;
    }
  }
  return texts.length ? rangeOver(texts) : r;
}

/** キャレット位置に、op を適用したテキストを挿入する（入力待ちスタイル用） */
export function insertStyledText(range, root, ops, text) {
  const node = document.createTextNode(text);
  range.insertNode(node);
  const r = document.createRange();
  r.selectNodeContents(node);
  applyOps(r, root, ops);
  const caret = document.createRange();
  caret.setStart(node, node.length);
  caret.collapse(true);
  return caret;
}
