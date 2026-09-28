import { html, nothing } from 'lit';
import { icons } from '../icons.js';
import { setTemp } from '../core/html.js';
import { unwrapListsFromParagraphs } from './basic.js';

/**
 * ToDo リスト、リストの種類（記号・番号の種類、開始番号、逆順）、改ページ、目次。
 *
 * ToDo リストの出力:
 *   <ul class="todo-list" style="list-style: none;"><li><input type="checkbox" disabled checked>完了した項目</li></ul>
 * （編集中だけ disabled を外してクリックで切り替えられるようにする）
 */

/* ================= ToDo リスト ================= */

const todoLiAt = (ed) => ed.closestAtSelection('ul.todo-list > li');

function prepareCheckbox(input) {
  if (input.hasAttribute('disabled')) setTemp(input, 'disabled', null);
  if (!input.hasAttribute('contenteditable')) setTemp(input, 'contenteditable', 'false');
}

function newCheckbox(checked = false) {
  const input = document.createElement('input');
  input.setAttribute('type', 'checkbox');
  input.setAttribute('disabled', '');
  if (checked) input.setAttribute('checked', '');
  prepareCheckbox(input);
  return input;
}

const checkboxOf = (li) => (li.firstElementChild?.matches('input[type=checkbox]') ? li.firstElementChild : null);

/** li の先頭にチェックボックスが無ければ付け、カーソルが先頭ならチェックボックスの後ろへ */
function ensureCheckbox(ed, li) {
  if (checkboxOf(li)) return;
  li.prepend(newCheckbox());
  const r = ed.getRange();
  if (r?.collapsed && r.startContainer === li && r.startOffset === 0) ed.setCaretAt(li, 1);
}

/** ブロックの先頭から数えたカーソルの文字位置 */
function caretOffsetIn(block, r) {
  const pre = document.createRange();
  pre.setStart(block, 0);
  pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length;
}

/** 文字位置にカーソルを置く（テキストがなければ先頭） */
function placeCaretAtOffset(ed, el, offset) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let t;
  let left = offset;
  while ((t = w.nextNode())) {
    if (left <= t.length) { ed.setCaretAt(t, left); return; }
    left -= t.length;
  }
  ed.setCaretAt(el, 0);
}

export function toggleTodo(ed, { checked = false } = {}) {
  ed.transact(() => {
    const cur = ed.closestAtSelection('ul.todo-list');
    if (cur) {
      // ToDo をやめて普通の段落に戻す
      cur.querySelectorAll(':scope > li > input[type=checkbox]').forEach((i) => i.remove());
      cur.classList.remove('todo-list');
      if (!cur.classList.length) cur.removeAttribute('class');
      cur.style.removeProperty('list-style');
      if (cur.getAttribute('style') === '') cur.removeAttribute('style');
      document.execCommand('insertUnorderedList');
      unwrapListsFromParagraphs(ed);
      return;
    }
    if (!ed.closestAtSelection('ul')) {
      const r = ed.getRange();
      const block = r?.collapsed ? ed.closestAtSelection('p, h1, h2, h3, h4, h5, h6, div') : null;
      if (block && block !== ed.editable && block.parentNode) {
        // カーソルのある段落だけを ToDo にする（execCommand は隣のリストとつなげてしまうため自前で包む）
        const offset = caretOffsetIn(block, r);
        const ul = document.createElement('ul');
        const li = document.createElement('li');
        li.append(...block.childNodes);
        ul.append(li);
        block.replaceWith(ul);
        placeCaretAtOffset(ed, li, offset);
      } else {
        document.execCommand('insertUnorderedList');
        unwrapListsFromParagraphs(ed);
      }
    }
    const ul = ed.closestAtSelection('ul');
    if (!ul) return;
    ul.classList.add('todo-list');
    ul.style.setProperty('list-style', 'none');
    for (const li of ul.children) {
      if (li.localName !== 'li') continue;
      ensureCheckbox(ed, li);
      // Safari が付ける末尾の <br> は、文字がある項目では不要
      if (li.lastChild?.nodeName === 'BR' && li.textContent.trim()) li.lastChild.remove();
    }
    if (checked) checkboxOf(todoLiAt(ed) ?? ul.firstElementChild)?.setAttribute('checked', '');
    const li = todoLiAt(ed) ?? ul.firstElementChild;
    const r = ed.getRange();
    if (li && r?.collapsed && (r.startContainer === li && r.startOffset === 0)) ed.setCaretAt(li, 1);
  });
}

function toggleChecked(ed, input) {
  const next = !input.hasAttribute('checked');
  ed._withoutFocus(() => ed.transact(() => {
    if (next) input.setAttribute('checked', ''); else input.removeAttribute('checked');
  }));
  input.checked = next;
}

/** 空の ToDo 項目で Enter → リストを抜けて段落にする */
function todoEnter(ed) {
  const li = todoLiAt(ed);
  if (!li) return false;
  if (li.textContent.trim() || li.querySelector('img,table,iframe')) return false;
  ed.transact(() => {
    const ul = li.parentElement;
    const p = document.createElement('p');
    p.append(document.createElement('br'));
    const after = [...ul.children].slice([...ul.children].indexOf(li) + 1);
    li.remove();
    if (after.length) {
      const rest = ul.cloneNode(false);
      rest.append(...after);
      ul.after(p, rest);
    } else {
      ul.after(p);
    }
    if (!ul.children.length) ul.remove();
    ed.setCaretAt(p, 0);
  });
  return true;
}

/* ================= リストの種類 ================= */

const UL_TYPES = [
  { value: '', label: '既定' }, { value: 'disc', label: '● 黒丸' }, { value: 'circle', label: '○ 白丸' }, { value: 'square', label: '■ 四角' },
];
const OL_TYPES = [
  { value: '', label: '既定' }, { value: 'decimal', label: '1. 2. 3.' }, { value: 'decimal-leading-zero', label: '01. 02. 03.' },
  { value: 'lower-roman', label: 'i. ii. iii.' }, { value: 'upper-roman', label: 'I. II. III.' },
  { value: 'lower-alpha', label: 'a. b. c.' }, { value: 'upper-alpha', label: 'A. B. C.' },
  { value: 'cjk-ideographic', label: '一、二、三、' },
];
const listAt = (ed) => {
  const l = ed.closestAtSelection('ul,ol');
  return l && !l.classList.contains('todo-list') ? l : null;
};

function setListStyle(ed, list, type) {
  ed.transact(() => {
    if (type) list.style.setProperty('list-style-type', type);
    else list.style.removeProperty('list-style-type');
    if (list.getAttribute('style') === '') list.removeAttribute('style');
  });
}

function listStylePanel(ed, close) {
  const list = listAt(ed);
  if (!list) return html`<div style="padding:6px;color:#5f6368">リストの中にカーソルを置いてください</div>`;
  const types = list.localName === 'ol' ? OL_TYPES : UL_TYPES;
  const cur = list.style.listStyleType;
  return html`<div class="menu">
    ${types.map((t) => html`<button role="menuitemradio" aria-checked=${String(cur === t.value)} data-list-type=${t.value}
      @click=${() => { setListStyle(ed, list, t.value); close(); }}>${t.label}</button>`)}
  </div>
  ${list.localName === 'ol' ? html`<div class="row" style="flex-wrap:wrap;font-size:12px">
    <label>開始番号 <input name="start" type="number" min="0" .value=${list.getAttribute('start') ?? '1'} style="width:56px"
      @change=${(e) => ed.transact(() => { const n = parseInt(e.target.value, 10); if (!n || n === 1) list.removeAttribute('start'); else list.setAttribute('start', String(n)); })}></label>
    <label><input name="reversed" type="checkbox" .checked=${list.hasAttribute('reversed')}
      @change=${(e) => ed.transact(() => list.toggleAttribute('reversed', e.target.checked))}> 逆順</label>
  </div>` : nothing}`;
}

/* ================= 改ページ ================= */

function pageBreakElement() {
  // CKEditor と同じ形式
  const div = document.createElement('div');
  div.className = 'page-break';
  div.setAttribute('style', 'page-break-after: always;');
  const span = document.createElement('span');
  span.setAttribute('style', 'display: none;');
  span.textContent = ' ';
  div.append(span);
  setTemp(div, 'contenteditable', 'false');
  return div;
}

/* ================= 目次 ================= */

const HEADINGS = 'h1,h2,h3,h4,h5,h6';

function headingsOf(ed) {
  return [...ed.editable.querySelectorAll(HEADINGS)].filter((h) => !h.closest('nav.toc') && h.textContent.trim());
}

function ensureIds(ed, hs) {
  const used = new Set([...ed.editable.querySelectorAll('[id]')].map((e) => e.id));
  let n = 1;
  for (const h of hs) {
    if (h.id) continue;
    while (used.has(`toc-${n}`)) n++;
    h.id = `toc-${n}`;
    used.add(h.id);
  }
}

/** 見出しのレベルに合わせた入れ子の <ul> を作る */
function buildTocList(hs) {
  const root = document.createElement('ul');
  const stack = [{ level: 0, ul: root, li: null }];
  for (const h of hs) {
    const level = Number(h.localName[1]);
    while (stack.length > 1 && stack.at(-1).level >= level) stack.pop();
    const top = stack.at(-1);
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.setAttribute('href', `#${h.id}`);
    a.textContent = h.textContent.trim();
    li.append(a);
    let ul = top.ul;
    if (top.li && top.level < level) {
      ul = top.li.querySelector(':scope > ul') ?? top.li.appendChild(document.createElement('ul'));
    }
    ul.append(li);
    stack.push({ level, ul, li });
  }
  return root;
}

function tocList(ed) {
  const hs = headingsOf(ed);
  ensureIds(ed, hs);
  return hs.length ? buildTocList(hs) : Object.assign(document.createElement('p'), { textContent: '（見出しがありません）' });
}

/** 目次の中身が見出しと食い違っていれば作り直す。変更したら true */
function fillToc(ed, nav, list = tocList(ed)) {
  const current = [...nav.children].find((c) => !c.classList.contains('toc-title'));
  if (current && current.outerHTML === list.outerHTML) return false;
  const title = nav.querySelector(':scope > .toc-title');
  nav.replaceChildren(...(title ? [title] : []), list);
  return true;
}

function insertToc(ed) {
  const nav = document.createElement('nav');
  nav.className = 'toc';
  const title = document.createElement('p');
  title.className = 'toc-title';
  title.textContent = '目次';
  nav.append(title);
  setTemp(nav, 'contenteditable', 'false');
  ed.transact(() => {
    fillToc(ed, nav);
    ed.insertNodesAtSelection(nav);
  });
}

function updateTocs(ed, { silent = false } = {}) {
  const navs = [...ed.editable.querySelectorAll('nav.toc')];
  if (!navs.length) return;
  const fresh = buildTocList(headingsOf(ed).filter((h) => h.id));
  const stale = navs.filter((n) => {
    const cur = [...n.children].find((c) => !c.classList.contains('toc-title'));
    return !cur || cur.outerHTML !== fresh.outerHTML || headingsOf(ed).some((h) => !h.id);
  });
  if (!stale.length) return;
  if (!silent) { ed.transact(() => stale.forEach((n) => fillToc(ed, n))); return; }
  // 見出しの編集に追従する自動更新は、直前の入力と同じ履歴に含める（元に戻すで一緒に戻る）
  ed._flushTyping();
  stale.forEach((n) => fillToc(ed, n));
  ed._onMutations(ed._observer.takeRecords());
  ed.history.amend();
}

/* ================= プラグイン ================= */

export const listsPlugin = {
  name: 'lists',
  items: {
    todoList: {
      icon: icons.todo, title: 'ToDo リスト',
      action: (ed) => toggleTodo(ed),
      active: (ed) => !!ed.closestAtSelection('ul.todo-list'),
    },
    listStyle: {
      type: 'dropdown', title: 'リストの種類・開始番号', icon: icons.listStyle,
      enabled: (ed) => !!listAt(ed),
      panel: listStylePanel,
    },
    pageBreak: { icon: icons.pageBreak, title: '改ページ（印刷時）', action: (ed) => ed.insertNodes(pageBreakElement()) },
    toc: { icon: icons.toc, title: '目次を挿入（見出しから自動生成）', action: insertToc },
    tocUpdate: { icon: icons.toc, title: '目次を更新', action: (ed) => updateTocs(ed) },
  },
  contextToolbars: [{
    name: 'toc',
    match: (ed) => (ed.selectedObject?.matches('nav.toc') ? ed.selectedObject : null),
    items: ['tocUpdate', 'embedDelete'],
  }],
  keymap: {
    Enter: todoEnter,
  },
  prepare(root) {
    root.querySelectorAll('ul.todo-list > li > input[type=checkbox]').forEach(prepareCheckbox);
    root.querySelectorAll('div.page-break, nav.toc').forEach((el) => {
      if (!el.hasAttribute('contenteditable')) setTemp(el, 'contenteditable', 'false');
    });
  },
  init(ed) {
    const onDown = (e) => {
      const input = e.target.closest?.('ul.todo-list > li > input[type=checkbox]');
      if (input && ed.editable.contains(input)) e.preventDefault();
    };
    const onClick = (e) => {
      const input = e.target.closest?.('ul.todo-list > li > input[type=checkbox]');
      if (!input || !ed.editable.contains(input) || ed.readonly) return;
      e.preventDefault();
      setTimeout(() => toggleChecked(ed, input));
    };
    const onInput = (e) => {
      // Enter で増えた ToDo 項目にチェックボックスを付ける
      if (e.inputType === 'insertParagraph' || e.inputType === 'insertText') {
        ed.editable.querySelectorAll('ul.todo-list > li').forEach((li) => ensureCheckbox(ed, li));
      }
    };
    let t;
    const onHostInput = () => {
      if (!ed.editable.querySelector('nav.toc')) return;
      clearTimeout(t);
      t = setTimeout(() => updateTocs(ed, { silent: true }), 500);
    };
    ed.editable.addEventListener('mousedown', onDown);
    ed.editable.addEventListener('click', onClick);
    ed.editable.addEventListener('input', onInput);
    ed.addEventListener('input', onHostInput);
    return () => {
      ed.editable.removeEventListener('mousedown', onDown);
      ed.editable.removeEventListener('click', onClick);
      ed.editable.removeEventListener('input', onInput);
      ed.removeEventListener('input', onHostInput);
      clearTimeout(t);
    };
  },
};
