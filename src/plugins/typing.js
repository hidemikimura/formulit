import { html } from 'lit';
import { closestBlock } from '../core/inline.js';
import { toCodeBlock } from './code-block.js';
import { toggleQuote, unwrapListsFromParagraphs } from './basic.js';
import { toggleTodo } from './lists.js';

/**
 * 入力補助：Markdown 風のオートフォーマットと、スラッシュコマンド。
 * オートフォーマットは 1 回の「元に戻す」で入力した記号の状態に戻せる。
 */

const inCode = (node) => !!(node.nodeType === 1 ? node : node.parentElement)?.closest('pre,code');

/* ================= オートフォーマット ================= */

const escapes = new WeakMap(); // editor → { el, after }：直前に作った装飾要素と、その直後のテキストノード

/** カーソルが「装飾の直後」にあるか（ブラウザによっては装飾の末尾として扱われる） */
function atEscape(ed) {
  const st = escapes.get(ed);
  const r = ed.getRange();
  if (!st || !r?.collapsed || !st.el.isConnected) return null;
  const n = r.startContainer;
  if (n === st.after && r.startOffset === 0) return st;
  const last = st.el.lastChild;
  if (n === st.el && r.startOffset === st.el.childNodes.length) return st;
  if (last?.nodeType === 3 && n === last && r.startOffset === last.length) return st;
  if (n === st.el.parentNode && r.startOffset === [...n.childNodes].indexOf(st.el) + 1) return st;
  return null;
}

/**
 * カーソルのあるブロックの要素名を変える（execCommand('formatBlock') は空の段落で余計な <p> を残すことがあるため自前で）。
 * 属性と中身はそのまま移す。
 */
export function renameBlockAtSelection(ed, tag) {
  const r = ed.getRange();
  if (!r) return;
  const block = closestBlock(r.startContainer, ed.editable);
  if (!block || !block.matches('p,h1,h2,h3,h4,h5,h6,div,pre') || block.localName === tag) return;
  const saved = [r.startContainer, r.startOffset];
  const n = document.createElement(tag);
  for (const a of block.attributes) n.setAttribute(a.name, a.value);
  n.append(...block.childNodes);
  block.replaceWith(n);
  try { ed.setCaretAt(saved[0] === block ? n : saved[0], saved[1]); } catch { ed.setCaretAt(n, 0); }
}

const BLOCK_RULES = [
  { re: /^(#{1,6}) $/, run: (ed, m) => renameBlockAtSelection(ed, `h${m[1].length}`) },
  { re: /^[-*+] $/, run: (ed) => { document.execCommand('insertUnorderedList'); unwrapListsFromParagraphs(ed); } },
  {
    re: /^(\d+)[.)] $/,
    run: (ed, m) => {
      document.execCommand('insertOrderedList');
      unwrapListsFromParagraphs(ed);
      const n = parseInt(m[1], 10);
      const ol = ed.closestAtSelection('ol');
      if (ol && n !== 1) ol.setAttribute('start', String(n));
    },
  },
  { re: /^> $/, run: 'quote' },
  { re: /^\[( |x|X)?\] $/, run: 'todo' },
  { re: /^```([\w+#-]*) $/, run: 'code' },
];

const INLINE_RULES = [
  { re: /(\*\*|__)(?=\S)([^*_]+?)(?<=\S)\1$/u, tag: 'b', group: 2 },
  { re: /~~(?=\S)([^~]+?)(?<=\S)~~$/u, tag: 's', group: 1 },
  { re: /`([^`]+)`$/u, tag: 'code', group: 1 },
  { re: /(?<![*_\p{L}\p{N}])([*_])(?=\S)([^*_]+?)(?<=\S)\1$/u, tag: 'i', group: 2 },
];

function autoformatBlock(ed, node, offset) {
  const block = closestBlock(node, ed.editable);
  if (!block || !block.matches('p, div') || block.closest('li,td,th,blockquote,pre')) return false;
  const pre = document.createRange();
  pre.setStart(block, 0);
  pre.setEnd(node, offset);
  const before = pre.toString().replace(/ /g, ' ');
  for (const rule of BLOCK_RULES) {
    const m = before.match(rule.re);
    if (!m) continue;
    ed.transact(() => {
      pre.deleteContents();
      if (!block.textContent && !block.querySelector('br')) block.append(document.createElement('br'));
      ed.setCaretAt(block, 0);
      if (typeof rule.run === 'function') rule.run(ed, m);
    });
    if (rule.run === 'quote') toggleQuote(ed);
    if (rule.run === 'todo') toggleTodo(ed, { checked: /x/i.test(m[1] ?? '') });
    if (rule.run === 'code') toCodeBlock(ed, m[1] || 'plaintext');
    return true;
  }
  return false;
}

function autoformatHr(ed, node) {
  const block = closestBlock(node, ed.editable);
  if (!block?.matches('p') || block.closest('li,td,th,blockquote') || block.textContent.replace(/ /g, ' ').trim() !== '---') return false;
  ed.transact(() => {
    const hr = document.createElement('hr');
    const p = document.createElement('p');
    p.append(document.createElement('br'));
    block.replaceWith(hr, p);
    ed.setCaretAt(p, 0);
  });
  return true;
}

function autoformatInline(ed, node, offset) {
  const text = node.data.slice(0, offset);
  for (const rule of INLINE_RULES) {
    const m = text.match(rule.re);
    if (!m) continue;
    const start = offset - m[0].length;
    ed.transact(() => {
      const r = document.createRange();
      r.setStart(node, start);
      r.setEnd(node, offset);
      r.deleteContents();
      const el = document.createElement(rule.tag);
      el.textContent = m[rule.group];
      r.insertNode(el);
      // 続けて入力した文字が装飾の外に入るよう、直後にテキストノードを置いてそこへカーソルを移す
      // （ブラウザはカーソルを装飾の中に入れがちなので、次の 1 文字は自前で入れる: onBeforeInput）
      const after = document.createTextNode('');
      el.after(after);
      ed.setCaretAt(after, 0);
      escapes.set(ed, { el, after });
    });
    return true;
  }
  return false;
}

/* ================= スラッシュコマンド ================= */

const heading = (n) => (ed) => ed.transact(() => renameBlockAtSelection(ed, `h${n}`));
const item = (name) => (ed) => ed.items[name]?.action(ed);

export const SLASH_COMMANDS = [
  { label: '見出し 1', keywords: 'h1 heading midashi みだし 見出し', run: heading(1) },
  { label: '見出し 2', keywords: 'h2 heading midashi みだし 見出し', run: heading(2) },
  { label: '見出し 3', keywords: 'h3 heading midashi みだし 見出し', run: heading(3) },
  { label: '本文', keywords: 'p paragraph text honbun ほんぶん 段落', run: (ed) => ed.transact(() => renameBlockAtSelection(ed, 'p')) },
  { label: '箇条書き', keywords: 'ul bullet list kajougaki かじょうがき リスト', item: 'ul' },
  { label: '番号付きリスト', keywords: 'ol number list bangou ばんごう リスト', item: 'ol' },
  { label: 'ToDo リスト', keywords: 'todo task check チェック タスク', item: 'todoList' },
  { label: '引用', keywords: 'quote blockquote inyou いんよう', item: 'quote' },
  { label: 'コードブロック', keywords: 'code pre codeblock コード', run: (ed) => toCodeBlock(ed, 'plaintext'), needs: 'codeBlock' },
  { label: '表', keywords: 'table hyou ひょう テーブル', item: 'table' },
  { label: '画像', keywords: 'image img picture gazou がぞう 写真', item: 'image' },
  { label: 'メディア埋め込み', keywords: 'media youtube video 動画 どうが 埋め込み', item: 'mediaEmbed' },
  { label: '水平線', keywords: 'hr line rule suiheisen すいへいせん 区切り', item: 'hr' },
  { label: '改ページ', keywords: 'pagebreak page break kaipeji かいぺーじ 印刷', item: 'pageBreak' },
  { label: '目次', keywords: 'toc contents mokuji もくじ', item: 'toc' },
  { label: 'HTML 埋め込み', keywords: 'html embed raw', item: 'htmlEmbed' },
  { label: '特殊文字・絵文字', keywords: 'special char emoji 記号 きごう 絵文字 えもじ', run: (ed) => ed.openDropdownItem('specialChars'), needs: 'specialChars' },
];

const slashes = new WeakMap(); // editor → { node, offset, query, index, list }

function availableCommands(ed) {
  const items = ed.items;
  return (ed.slashCommands ?? SLASH_COMMANDS).filter((c) => (c.item ? items[c.item] : (!c.needs || items[c.needs])));
}

function filterCommands(ed, q) {
  const all = availableCommands(ed);
  if (!q) return all;
  const k = q.toLowerCase();
  return all.filter((c) => c.label.toLowerCase().includes(k) || c.keywords.toLowerCase().includes(k));
}

function closeSlash(ed) {
  if (!slashes.has(ed)) return;
  slashes.delete(ed);
  ed.hidePopup();
}

function renderSlash(ed) {
  const st = slashes.get(ed);
  if (!st) return html``;
  if (!st.list.length) return html`<div class="empty">一致するコマンドがありません</div>`;
  return st.list.map((c, i) => html`<div class="opt" role="option" aria-selected=${String(i === st.index)} data-command=${c.label}
    @mouseenter=${() => { st.index = i; ed.requestUpdate(); }}
    @click=${() => runSlash(ed, i)}>${c.label}</div>`);
}

function slashRect(ed) {
  const st = slashes.get(ed);
  if (!st?.node.isConnected) return null;
  const r = document.createRange();
  r.setStart(st.node, st.offset);
  r.setEnd(st.node, Math.min(st.offset + 1, st.node.length));
  return r.getBoundingClientRect();
}

function openSlash(ed, node, offset) {
  slashes.set(ed, { node, offset, query: '', index: 0, list: filterCommands(ed, '') });
  ed.showPopup({ render: renderSlash, rect: () => slashRect(ed) });
}

/** 入力に合わせて絞り込み。"/" の位置が崩れたら閉じる */
function updateSlash(ed) {
  const st = slashes.get(ed);
  if (!st) return;
  const r = ed.getRange();
  if (!r?.collapsed || r.startContainer !== st.node || r.startOffset <= st.offset || !/^[/／]/.test(st.node.data.slice(st.offset))) {
    closeSlash(ed);
    return;
  }
  const q = st.node.data.slice(st.offset + 1, r.startOffset);
  if (/\s/.test(q) || q.length > 24) { closeSlash(ed); return; }
  st.query = q;
  st.list = filterCommands(ed, q);
  st.index = Math.min(st.index, Math.max(0, st.list.length - 1));
  ed.requestUpdate();
}

function runSlash(ed, i) {
  const st = slashes.get(ed);
  const cmd = st?.list[i ?? st.index];
  if (!cmd) return;
  const r = document.createRange();
  r.setStart(st.node, st.offset);
  r.setEnd(st.node, Math.min(st.node.length, st.offset + 1 + st.query.length));
  closeSlash(ed);
  ed.transact(() => {
    const block = closestBlock(st.node, ed.editable);
    r.deleteContents();
    if (block && !block.textContent && !block.querySelector('br,img')) block.append(document.createElement('br'));
    ed.setCaretAt(r.startContainer, r.startOffset);
  });
  if (cmd.item) ed.items[cmd.item]?.action(ed);
  else cmd.run(ed);
  ed.requestUpdate();
}

const slashKey = (fn) => (ed, e) => (slashes.has(ed) ? (fn(ed, e), true) : false);

/* ================= プラグイン ================= */

export const typingPlugin = {
  name: 'typing',
  items: {},
  keymap: {
    ArrowDown: slashKey((ed) => { const st = slashes.get(ed); if (st.list.length) st.index = (st.index + 1) % st.list.length; ed.requestUpdate(); }),
    ArrowUp: slashKey((ed) => { const st = slashes.get(ed); if (st.list.length) st.index = (st.index - 1 + st.list.length) % st.list.length; ed.requestUpdate(); }),
    Enter: (ed) => (slashes.get(ed)?.list.length ? (runSlash(ed), true) : false),
    Tab: (ed) => (slashes.get(ed)?.list.length ? (runSlash(ed), true) : false),
    Escape: slashKey((ed) => closeSlash(ed)),
  },
  init(ed) {
    const onBeforeInput = (e) => {
      if (e.inputType !== 'insertText' || !e.data || e.isComposing) { if (e.inputType !== 'insertText') escapes.delete(ed); return; }
      const st = atEscape(ed);
      escapes.delete(ed);
      if (!st) return;
      e.preventDefault();
      if (!st.after.isConnected) st.el.after(st.after);
      // 行末の半角スペースは表示上つぶれるので、ブラウザと同じく &nbsp; にする
      const data = e.data === ' ' && !st.after.data ? '\u00a0' : e.data;
      st.after.insertData(0, data);
      ed.setCaretAt(st.after, data.length);
      ed.editable.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: e.data, bubbles: true }));
    };
    const onCompositionEnd = (e) => {
      // 日本語入力で確定した文字が装飾の中に入った場合は外へ出す
      const st = escapes.get(ed);
      escapes.delete(ed);
      if (!st || !e.data) return;
      setTimeout(() => {
        const last = st.el.lastChild;
        if (last?.nodeType !== 3 || !last.data.endsWith(e.data)) return;
        ed.transact(() => {
          last.deleteData(last.length - e.data.length, e.data.length);
          if (!st.after.isConnected) st.el.after(st.after);
          st.after.insertData(0, e.data);
          ed.setCaretAt(st.after, e.data.length);
        });
      });
    };
    ed.editable.addEventListener('beforeinput', onBeforeInput);
    ed.editable.addEventListener('compositionend', onCompositionEnd);
    const onInput = (e) => {
      if (e.isComposing) return;
      const r = ed.getRange();
      if (!r?.collapsed || r.startContainer.nodeType !== 3) { closeSlash(ed); return; }
      const node = r.startContainer;
      const offset = r.startOffset;
      if (slashes.has(ed)) { updateSlash(ed); if (slashes.has(ed)) return; }
      if (inCode(node) || !['insertText', 'insertCompositionText', 'insertReplacementText'].includes(e.inputType)) return;
      const data = e.data ?? '';
      const last = data.at(-1);
      // スラッシュコマンド：行頭または空白の直後に "/"
      if ((last === '/' || last === '／') && ed.slashCommands !== false) {
        const prev = node.data[offset - 2];
        const blockStart = (() => {
          const b = closestBlock(node, ed.editable);
          if (!b) return offset === 1;
          const rr = document.createRange();
          rr.setStart(b, 0);
          rr.setEnd(node, offset - 1);
          return rr.toString().replace(/[\s ]/g, '') === '';
        })();
        if (blockStart || prev === ' ' || prev === ' ') { openSlash(ed, node, offset - 1); return; }
      }
      if (ed.autoformat === false) return;
      if (last === ' ' || last === ' ') { if (autoformatBlock(ed, node, offset)) return; }
      if (last === '-') { if (autoformatHr(ed, node)) return; }
      if ('*_`~'.includes(last)) autoformatInline(ed, node, offset);
    };
    const onSel = () => { if (slashes.has(ed)) updateSlash(ed); };
    const onBlur = () => setTimeout(() => { if (!ed.matches(':focus-within')) closeSlash(ed); }, 0);
    ed.editable.addEventListener('input', onInput);
    ed.addEventListener('formulit-selectionchange', onSel);
    ed.editable.addEventListener('blur', onBlur);
    return () => {
      ed.editable.removeEventListener('beforeinput', onBeforeInput);
      ed.editable.removeEventListener('compositionend', onCompositionEnd);
      ed.editable.removeEventListener('input', onInput);
      ed.removeEventListener('formulit-selectionchange', onSel);
      ed.editable.removeEventListener('blur', onBlur);
    };
  },
};
