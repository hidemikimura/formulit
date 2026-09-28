/**
 * 部分的な原文保持。
 *
 * 読み込んだ HTML 文字列の「どの範囲がどの DOM ノードになったか」を記録しておき、
 * 書き出し時に、編集されていないノードは元の文字列をそのまま使う。
 *
 *  1. 位置付きの簡易トークナイザ + ツリー構築で、原文をノード単位の範囲に分ける
 *  2. ブラウザが作った DOM と突き合わせ、各範囲をブラウザ自身のパーサで再パースして
 *     同じノードになることを検証できたものだけを採用する（推測を信用しない）
 *  3. MutationObserver の記録から「属性が変わった」「中身が変わった」ノードを追跡する
 *  4. 書き出し時:
 *       未変更ノード              → 原文そのまま
 *       中身だけ変わった要素      → 原文の開始タグ + 子を再帰的に処理 + 原文の終了タグ
 *       属性が変わった要素・新規  → ブラウザのシリアライズ
 *  5. 組み立てた結果をもう一度パースし、DOM と等価であることを確認する（呼び出し側）
 */
import { restoreElement, INTERNAL_PREFIX } from './temp.js';

/** node → { outer, start, end, attrDirty, contentDirty } */
const meta = new WeakMap();

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr', 'basefont', 'bgsound', 'frame', 'keygen']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed',
  'noframes', 'noscript', 'plaintext']);
/** 子を再帰処理せず、要素ごと扱うもの */
const OPAQUE = new Set([...RAW_TEXT, 'template']);
const CLOSES_P = new Set(['address', 'article', 'aside', 'blockquote', 'center', 'details', 'dialog',
  'dir', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'table',
  'ul', 'li', 'dd', 'dt', 'listing', 'xmp', 'plaintext', 'search']);
const SCOPE = new Set(['applet', 'caption', 'html', 'table', 'td', 'th', 'marquee', 'object', 'template']);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/* ================= 1. トークナイザ ================= */

/**
 * HTML を位置付きトークンに分解する。
 * { type: 'start'|'end'|'text'|'comment', name, start, end, selfClosing }
 */
export function tokenize(src) {
  const tokens = [];
  const n = src.length;
  let i = 0;
  let textStart = 0;
  const flushText = (to) => {
    if (to > textStart) tokens.push({ type: 'text', start: textStart, end: to });
  };
  while (i < n) {
    if (src[i] !== '<') { i++; continue; }
    const next = src[i + 1] ?? '';
    // コメント
    if (src.startsWith('<!--', i)) {
      flushText(i);
      let close = src.indexOf('-->', i + 4);
      if (src.startsWith('<!-->', i)) close = i + 2;
      else if (src.startsWith('<!--->', i)) close = i + 3;
      const end = close < 0 ? n : close + 3;
      tokens.push({ type: 'comment', start: i, end });
      i = textStart = end;
      continue;
    }
    // </> はブラウザが読み飛ばす
    if (next === '/' && src[i + 2] === '>') {
      flushText(i);
      tokens.push({ type: 'ignore', start: i, end: i + 3 });
      i = textStart = i + 3;
      continue;
    }
    // 末尾の "</" はただの文字
    if (next === '/' && i + 2 >= n) { i++; continue; }
    // <!DOCTYPE>, <?xml ?>, </3 などは「おかしなコメント」扱い
    if (next === '!' || next === '?' || (next === '/' && !/[a-zA-Z]/.test(src[i + 2]))) {
      flushText(i);
      const close = src.indexOf('>', i + 2);
      const end = close < 0 ? n : close + 1;
      tokens.push({ type: 'comment', start: i, end, bogus: true });
      i = textStart = end;
      continue;
    }
    const isEnd = next === '/';
    const nameStart = i + (isEnd ? 2 : 1);
    if (!/[a-zA-Z]/.test(src[nameStart] ?? '')) { i++; continue; }
    flushText(i);
    let j = nameStart;
    while (j < n && !/[\s/>]/.test(src[j])) j++;
    const name = src.slice(nameStart, j).toLowerCase();
    // 属性（引用符の中の > は無視）
    let selfClosing = false;
    while (j < n && src[j] !== '>') {
      const c = src[j];
      if (c === '"' || c === "'") {
        const q = src.indexOf(c, j + 1);
        j = q < 0 ? n : q + 1;
        continue;
      }
      if (c === '=') {
        j++;
        while (j < n && /\s/.test(src[j])) j++;
        if (src[j] === '"' || src[j] === "'") continue;
        while (j < n && !/[\s>]/.test(src[j])) j++;
        continue;
      }
      if (c === '/' && src[j + 1] === '>') selfClosing = true;
      j++;
    }
    const end = Math.min(n, j + 1);
    tokens.push({ type: isEnd ? 'end' : 'start', name, start: i, end, selfClosing });
    i = textStart = end;
    // script / style などの中身は次の閉じタグまでテキスト
    if (!isEnd && RAW_TEXT.has(name)) {
      const re = new RegExp(`</${name}[\\s/>]`, 'ig');
      re.lastIndex = i;
      const m = re.exec(src);
      const close = m ? m.index : n;
      if (close > i) tokens.push({ type: 'text', start: i, end: close });
      i = textStart = close;
    }
  }
  flushText(n);
  return tokens;
}

/* ================= ソースツリーの構築 ================= */

/**
 * ブラウザのツリー構築を簡略化してまねる（暗黙の終了タグの主要ルールのみ）。
 * 厳密でなくてよい：ずれた箇所は後の検証で不採用になるだけ。
 */
export function buildSourceTree(src) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const close = (node, at, endTagStart = null, endTagEnd = null) => {
    node.end = endTagEnd ?? at;
    node.endTagStart = endTagStart;
  };
  const popUntil = (pred, at, boundary) => {
    for (let k = stack.length - 1; k > 0; k--) {
      const s = stack[k];
      if (boundary?.has(s.name)) return false;
      if (pred(s)) {
        while (stack.length > k) close(stack.pop(), at);
        return true;
      }
    }
    return false;
  };

  for (const t of tokenize(src)) {
    if (t.type === 'ignore') continue;
    if (t.type === 'text' || t.type === 'comment') {
      const parent = top();
      const last = parent.children.at(-1);
      // 連続したテキストはブラウザでは 1 つのテキストノード
      if (t.type === 'text' && last?.type === 'text') { last.end = t.end; continue; }
      parent.children.push({ type: t.type, start: t.start, end: t.end });
      continue;
    }
    if (t.type === 'start') {
      const name = t.name;
      if (CLOSES_P.has(name)) popUntil((s) => s.name === 'p', t.start, new Set([...SCOPE, 'button']));
      if (HEADINGS.has(name) && HEADINGS.has(top().name)) close(stack.pop(), t.start);
      if (name === 'li') popUntil((s) => s.name === 'li', t.start, new Set([...SCOPE, 'ul', 'ol']));
      if (name === 'dt' || name === 'dd') popUntil((s) => s.name === 'dt' || s.name === 'dd', t.start, new Set([...SCOPE, 'dl']));
      if (name === 'option' || name === 'optgroup') {
        if (top().name === 'option') close(stack.pop(), t.start);
        if (name === 'optgroup' && top().name === 'optgroup') close(stack.pop(), t.start);
      }
      if (name === 'tr') popUntil((s) => s.name === 'tr', t.start, new Set(['table', 'template']));
      if (name === 'td' || name === 'th') popUntil((s) => s.name === 'td' || s.name === 'th', t.start, new Set(['table', 'template', 'tr']));
      if (name === 'thead' || name === 'tbody' || name === 'tfoot') {
        popUntil((s) => s.name === 'thead' || s.name === 'tbody' || s.name === 'tfoot', t.start, new Set(['table', 'template']));
      }
      const node = { type: 'element', name, start: t.start, startTagEnd: t.end, children: [] };
      top().children.push(node);
      if (VOID.has(name)) { node.end = t.end; node.endTagStart = null; continue; }
      stack.push(node);
      continue;
    }
    // 終了タグ：対応する開始タグまでを閉じる（見つからなければ無視）
    const name = t.name;
    for (let k = stack.length - 1; k > 0; k--) {
      if (stack[k].name === name) {
        while (stack.length > k + 1) close(stack.pop(), t.start);
        close(stack.pop(), t.start, t.start, t.end);
        break;
      }
    }
  }
  while (stack.length > 1) close(stack.pop(), src.length);
  return root;
}

/* ================= 2. DOM との対応づけと検証 ================= */

const parseTemplate = document.createElement('template');
function parse(html) {
  parseTemplate.innerHTML = html;
  return parseTemplate.content;
}

/** ノード 1 つを HTML 文字列に */
export function nodeHTML(node) {
  if (node.nodeType === 1) return node.outerHTML;
  if (node.nodeType === 3) return escapeText(node.data);
  if (node.nodeType === 8) return `<!--${node.data}-->`;
  return '';
}

function escapeText(s) {
  return s.replace(/&/g, '&amp;').replace(/ /g, '&nbsp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function shallowHTML(el) {
  return el.cloneNode(false).outerHTML;
}

/** 原文 src と、src をパースしてできた frag の各ノードを対応づける */
export function attachSourceMap(src, frag) {
  if (!src) return;
  const tree = buildSourceTree(src);
  alignChildren(src, tree.children, [...frag.childNodes]);
}

function compatible(s, d) {
  if (s.type === 'text') return d.nodeType === 3;
  if (s.type === 'comment') return d.nodeType === 8;
  return d.nodeType === 1 && d.localName === s.name;
}

/**
 * trusted: 親要素の原文が検証済みで、子の数と種類も一致している
 *          → 子を個別に再パースして検証する必要はない（高速化）。
 * 最終的な等価性チェックが別にあるので、ここでの判定は「保持できる量」にだけ影響する。
 */
function alignChildren(src, sChildren, dChildren, trusted = false) {
  const len = Math.min(sChildren.length, dChildren.length);
  for (let k = 0; k < len; k++) {
    if (!compatible(sChildren[k], dChildren[k])) return; // 以降はずれているので採用しない
    attach(src, sChildren[k], dChildren[k], trusted);
  }
}

function checkOuter(outer, d, trusted) {
  if (d.nodeType === 3 && !outer.includes('&')) return outer === d.data;
  if (trusted) return true;
  const f = parse(outer);
  return f.childNodes.length === 1 && nodeHTML(f.firstChild) === nodeHTML(d);
}

function attach(src, s, d, trusted) {
  const outer = src.slice(s.start, s.end);
  const info = {
    outer: null, start: null, end: null, attrDirty: false, contentDirty: false,
    // 原文上の位置と、この範囲が「閉じている」か（終了タグ省略や途中で切れた文字参照などが無いか）
    srcStart: s.start, srcEnd: s.end, closed: isClosed(s, outer),
  };
  const outerOk = checkOuter(outer, d, trusted);
  if (outerOk) info.outer = outer;
  if (s.type === 'element') {
    const start = src.slice(s.start, s.startTagEnd);
    let startOk = outerOk; // 全体が検証済みなら開始タグも正しい
    if (!startOk) {
      const fs = parse(start);
      startOk = fs.childNodes.length === 1 && fs.firstChild.nodeType === 1 && shallowHTML(fs.firstChild) === shallowHTML(d);
    }
    if (startOk) {
      info.start = start;
      info.end = s.endTagStart == null ? '' : src.slice(s.endTagStart, s.end);
    }
    if (!OPAQUE.has(s.name)) {
      const kids = [...d.childNodes];
      const full = outerOk && kids.length === s.children.length && s.children.every((c, k) => compatible(c, kids[k]));
      alignChildren(src, s.children, kids, full);
    }
  }
  if (info.outer != null || info.start != null) meta.set(d, info);
}

/**
 * 範囲の直後に別の内容が来ても意味が変わらないか。
 *  - 要素: 終了タグが明示されている（または空要素）
 *  - テキスト: 末尾が "<" や書きかけの文字参照（"&am" など）ではない
 *  - コメント: "-->" / ">" で閉じている
 */
function isClosed(s, outer) {
  if (s.type === 'element') return s.endTagStart != null || VOID.has(s.name);
  if (s.type === 'text') return !/(<|&[#\w]*)$/.test(outer);
  return outer.endsWith('>');
}

/* ================= 3. 変更の追跡 ================= */

/** node とその祖先を「変更あり」にする（kind: 'attr' は node 自身の開始タグだけ） */
export function markDirty(node, kind = 'content') {
  const m = meta.get(node);
  if (m) {
    if (kind === 'attr') m.attrDirty = true;
    else m.contentDirty = true;
  }
  for (let p = node.parentNode; p; p = p.parentNode) {
    const pm = meta.get(p);
    if (pm) pm.contentDirty = true;
  }
}

/** MutationRecord を反映する。本文と無関係な記録は false を返す */
export function recordMutation(r, root) {
  if (r.type === 'attributes') {
    if (r.target === root || r.attributeName?.startsWith(INTERNAL_PREFIX)) return false;
    markDirty(r.target, 'attr');
    return true;
  }
  if (r.target === root && r.type === 'childList') return true;
  markDirty(r.target, 'content');
  return true;
}

/** 対応情報ごと複製する（undo/redo のスナップショット用） */
export function cloneWithMeta(node) {
  if (node.nodeType !== 1 || node.localName === 'template') {
    const c = node.cloneNode(true);
    copyMeta(node, c);
    return c;
  }
  const c = node.cloneNode(false);
  copyMeta(node, c);
  for (const child of node.childNodes) c.appendChild(cloneWithMeta(child));
  return c;
}

function copyMeta(from, to) {
  const m = meta.get(from);
  if (m) meta.set(to, { ...m });
}

/* ================= 付加情報（拡張用） ================= */

/**
 * ノードに付加情報を持たせる。変更の追跡と undo/redo の複製（cloneWithMeta）に乗るので、
 * 「読み込み時のどの範囲から来たノードか」などを覚えておくのに使える（formulit-markdown が使用）。
 */
export function setNodeData(node, data) {
  const m = meta.get(node);
  if (m) m.data = { ...m.data, ...data };
  else meta.set(node, { data: { ...data }, attrDirty: false, contentDirty: false });
}

/** setNodeData で付けた情報（なければ undefined） */
export function getNodeData(node) {
  return meta.get(node)?.data;
}

/** 読み込み後に、そのノード自身・属性・子孫のどれも変更されていないか（対応情報のないノードは false） */
export function isNodeUnchanged(node) {
  const m = meta.get(node);
  return !!m && !m.attrDirty && !m.contentDirty;
}

/* ================= 4. 書き出し ================= */

/**
 * 編集領域の子を、未変更部分は原文のまま書き出す。
 * ctx.risky が true になったら、つなぎ目で意味が変わる可能性があるので呼び出し側で等価性を確認する。
 * （例: 終了タグを省略した "<p>x" の直後に、原文では隣でなかった内容が来る）
 */
export function serializeWithSource(editable, ctx = { risky: false }) {
  return serializeChildren(editable, ctx);
}

function serializeChildren(parent, ctx) {
  let out = '';
  let prev = null;
  for (const c of parent.childNodes) {
    const r = serializeNode(c, ctx);
    // 閉じていない原文の直後は、原文でも隣だった範囲が続く場合だけ安全
    if (prev?.open && !(r.srcStart != null && r.srcStart === prev.srcEnd)) ctx.risky = true;
    out += r.html;
    prev = r;
  }
  return out;
}

const LEADING_NEWLINE = new Set(['pre', 'textarea', 'listing']);

function serializeNode(n, ctx) {
  const info = meta.get(n);
  if (info?.outer != null && !info.attrDirty && !info.contentDirty) {
    return { html: info.outer, srcStart: info.srcStart, srcEnd: info.srcEnd, open: !info.closed };
  }
  if (n.nodeType === 3) return { html: escapeText(n.data) };
  if (n.nodeType === 8) return { html: `<!--${n.data}-->` };
  if (n.nodeType !== 1) return { html: '' };

  // 編集用の一時属性を戻した状態で考える
  if (OPAQUE.has(n.localName)) {
    const deep = n.cloneNode(true);
    restoreAttrs(deep);
    deep.querySelectorAll?.('*').forEach(restoreAttrs);
    return { html: deep.outerHTML };
  }
  // pre などの先頭の改行はパーサーが 1 つ読み飛ばすため、作り直した場合は念のため等価性を確認する
  if (LEADING_NEWLINE.has(n.localName)) ctx.risky = true;
  if (info?.start != null && !info.attrDirty) {
    const html = info.start + serializeChildren(n, ctx) + info.end;
    return { html, srcStart: info.srcStart, srcEnd: info.srcEnd, open: info.end === '' && !VOID.has(n.localName) };
  }
  const shell = restoredShallow(n).outerHTML;
  if (VOID.has(n.localName)) return { html: shell };
  const closeTag = `</${n.localName}>`;
  return { html: shell.slice(0, shell.length - closeTag.length) + serializeChildren(n, ctx) + closeTag };
}

function restoredShallow(el) {
  const c = el.cloneNode(false);
  restoreAttrs(c);
  return c;
}

const restoreAttrs = restoreElement;

/** 2 つの HTML 文字列がパース後に同じ DOM になるか */
export function equivalentHTML(a, b) {
  if (a === b) return true;
  const norm = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.innerHTML;
  };
  return norm(a) === norm(b);
}
