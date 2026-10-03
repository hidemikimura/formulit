import { html, nothing } from 'lit';
import { icons } from '../icons.js';
import { TEXT_ATTR } from '../core/temp.js';

/**
 * 変数の挿入
 *
 *   editor.variables = [
 *     { type: 'group', label: '商品', variables: [
 *       { label: '商品名', value: 'product_name' },
 *       { label: 'SKUコード', value: 'sku' },
 *     ] },
 *     { label: '今日の日付', value: 'today' },   // グループに入れない変数も書ける
 *   ];
 *
 * - ツールバーの「変数」から、文字で絞り込めるコンボボックスで選んで挿入する
 * - 本文で "{{" と入力すると、キャレットの位置に同じ候補が出る（続けて入力すると絞り込み）
 * - 絞り込みの対象は グループ名・変数名・変数値（空白区切りで AND 検索、大文字小文字・全角半角・ひらがなカタカナを区別しない）
 * - 書き出される（value / getHTML / ソース表示）のはただの文字列（既定は "{{ product_name }}"）。書式は editor.variableFormat で変えられる
 * - エディタの中では変数名で表示する（"{{ 商品名 }}"）。読み込んだ本文のうち、一覧にある変数の書式に一致する部分も同じく表示する
 *   （編集中だけの要素で、書き出し時は元の文字列に戻る）
 */

export const DEFAULT_VARIABLE_FORMAT = Object.freeze({ open: '{{ ', close: ' }}' });

/* ================= データ ================= */

const normCache = new WeakMap(); // editor → { src, groups }

/** 設定値を [{ label, variables: [{ label, value, ... }] }] の形にそろえる */
export function normalizeVariables(list) {
  const groups = [];
  let loose = null;
  const toVar = (v) => ({ ...v, label: String(v.label ?? v.value), value: String(v.value) });
  for (const e of Array.isArray(list) ? list : []) {
    if (!e || typeof e !== 'object') continue;
    if (e.type === 'group' || Array.isArray(e.variables)) {
      groups.push({ label: String(e.label ?? ''), variables: (e.variables ?? []).filter((v) => v && v.value != null).map(toVar) });
      loose = null;
    } else if (e.value != null) {
      if (!loose) { loose = { label: '', variables: [] }; groups.push(loose); }
      loose.variables.push(toVar(e));
    }
  }
  return groups.filter((g) => g.variables.length);
}

function groupsOf(ed) {
  const c = normCache.get(ed);
  if (c && c.src === ed.variables) return c.groups;
  const groups = normalizeVariables(ed.variables);
  normCache.set(ed, { src: ed.variables, groups });
  return groups;
}

/** 比較用：全角→半角（NFKC）、小文字、カタカナ→ひらがな */
const fold = (s) => String(s ?? '').normalize('NFKC').toLowerCase()
  .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

const termsOf = (q) => fold(q).split(/\s+/).filter(Boolean);

/** グループ名・変数名・変数値のいずれかに、すべての語が含まれる変数だけを残す */
export function filterVariables(groups, query) {
  const terms = termsOf(query);
  if (!terms.length) return groups;
  return groups
    .map((g) => ({
      ...g,
      variables: g.variables.filter((v) => {
        const hay = [g.label, v.label, v.value].map(fold);
        return terms.every((t) => hay.some((h) => h.includes(t)));
      }),
    }))
    .filter((g) => g.variables.length);
}

const flatten = (groups) => groups.flatMap((g) => g.variables.map((v) => ({ group: g, variable: v })));

/** 挿入する文字列 */
export function formatVariable(ed, variable) {
  const f = ed.variableFormat ?? DEFAULT_VARIABLE_FORMAT;
  if (typeof f === 'function') return String(f(variable));
  return `${f.open ?? ''}${variable.value}${f.close ?? ''}`;
}

/** エディタの中での表示（"{{ 商品名 }}"） */
export function variableDisplay(ed, variable) {
  const f = ed.variableFormat;
  const { open, close } = f && typeof f === 'object' ? f : DEFAULT_VARIABLE_FORMAT;
  return `${open ?? ''}${variable.label}${close ?? ''}`;
}

/* ================= エディタの中での表示 ================= */

const VAR_ATTR = 'data-formulit-variable';
/** 変数として表示しない場所（コード・保護された要素の中など） */
const SKIP = 'script, style, textarea, template, pre, code, [contenteditable=false]';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 本文の文字列から変数を探すための { re, find(matchedText) } */
function matcherOf(ed) {
  const vars = flatten(groupsOf(ed)).map((x) => x.variable);
  if (!vars.length) return null;
  const f = ed.variableFormat ?? DEFAULT_VARIABLE_FORMAT;
  if (typeof f === 'object' && (f.open ?? '').trim() && (f.close ?? '').trim()) {
    // 区切りの内側の空白の有無は問わない（"{{name}}" も "{{ name }}" も同じ変数）
    const byValue = new Map(vars.map((v) => [v.value.trim(), v]));
    const open = escapeRe(f.open.trim());
    const close = escapeRe(f.close.trim());
    return {
      re: new RegExp(`${open}\\s*((?:(?!${close})[^\\n])*?)\\s*${close}`, 'g'),
      find: (m) => byValue.get(m[1].trim()),
    };
  }
  // 書式が関数の場合は、挿入するときと同じ文字列だけを探す
  const byText = new Map();
  for (const v of vars) {
    const t = formatVariable(ed, v);
    if (t && !byText.has(t)) byText.set(t, v);
  }
  if (!byText.size) return null;
  const alts = [...byText.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  return { re: new RegExp(alts.join('|'), 'g'), find: (m) => byText.get(m[0]) };
}

/** 変数を表示する要素。書き出し時は text（"{{ product_name }}"）に戻る */
function variableElement(ed, variable, text) {
  const el = document.createElement('span');
  el.setAttribute('contenteditable', 'false');
  el.setAttribute(VAR_ATTR, variable.value);
  el.setAttribute(TEXT_ATTR, text);
  el.title = text;
  el.textContent = variableDisplay(ed, variable);
  return el;
}

/**
 * root の中の変数の文字列を、変数名で表示する要素に置き換える（何度呼んでもよい）。
 * 元のテキストノードは書き換えず新しいノードに差し替えるので、原文との対応情報は崩れない。
 */
export function decorateVariables(ed, root) {
  const m = matcherOf(ed);
  // 変数の一覧が変わった場合に備えて、表示済みの変数名を更新する
  const byValue = new Map(flatten(groupsOf(ed)).map((x) => [x.variable.value, x.variable]));
  root.querySelectorAll(`[${VAR_ATTR}]`).forEach((el) => {
    const v = byValue.get(el.getAttribute(VAR_ATTR));
    if (v && el.textContent !== variableDisplay(ed, v)) el.textContent = variableDisplay(ed, v);
  });
  if (!m) return;
  const texts = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest(SKIP)) continue;
    m.re.lastIndex = 0;
    if (m.re.test(n.data)) texts.push(n);
  }
  m.re.lastIndex = 0; // matchAll は lastIndex の位置から探すため
  for (const n of texts) {
    const out = [];
    let last = 0;
    for (const hit of n.data.matchAll(m.re)) {
      const v = m.find(hit);
      if (!v) continue;
      if (hit.index > last) out.push(document.createTextNode(n.data.slice(last, hit.index)));
      out.push(variableElement(ed, v, hit[0]));
      last = hit.index + hit[0].length;
    }
    if (!out.length) continue;
    if (last < n.data.length) out.push(document.createTextNode(n.data.slice(last)));
    n.replaceWith(...out);
  }
}

/** 本文で候補を出すきっかけの文字列（false で無効） */
function triggerOf(ed) {
  const t = ed.variableTrigger;
  if (t === false) return null;
  if (typeof t === 'string' && t) return t.normalize('NFKC');
  const f = ed.variableFormat;
  if (f && typeof f === 'object' && typeof f.open === 'string' && f.open.trim()) return f.open.trim().normalize('NFKC');
  return '{{';
}

/** 変数を挿入する。value の文字列、または { label, value } を渡す */
export function insertVariable(ed, v) {
  const variable = typeof v === 'string'
    ? flatten(groupsOf(ed)).find((x) => x.variable.value === v)?.variable ?? { label: v, value: v }
    : v;
  if (!variable) return;
  const text = formatVariable(ed, variable);
  const el = variableElement(ed, variable, text);
  ed.insertNodes(el);
  ed.dispatchEvent(new CustomEvent('formulit-variable-insert', { detail: { variable, text }, bubbles: true, composed: true }));
}

/* ================= 候補リストの描画（ツールバーと本文で共通） ================= */

/** 一致した部分を <mark> で囲む */
function highlight(text, terms) {
  if (!terms.length) return text;
  const f = fold(text);
  if (f.length !== text.length) return text; // 正規化で長さが変わる文字を含む場合は強調しない
  const hit = new Array(text.length).fill(false);
  for (const t of terms) {
    for (let i = f.indexOf(t); i !== -1; i = f.indexOf(t, i + 1)) hit.fill(true, i, i + t.length);
  }
  const out = [];
  let i = 0;
  while (i < text.length) {
    let j = i;
    while (j < text.length && hit[j] === hit[i]) j++;
    out.push(hit[i] ? html`<mark>${text.slice(i, j)}</mark>` : text.slice(i, j));
    i = j;
  }
  return out;
}

function renderList(ed, st, pick) {
  const terms = termsOf(st.query);
  if (!st.flat.length) return html`<div class="empty">一致する変数がありません</div>`;
  let n = -1;
  return st.groups.map((g) => html`
    ${g.label ? html`<div class="grp" role="presentation">${highlight(g.label, terms)}</div>` : nothing}
    ${g.variables.map((v) => {
      const i = ++n;
      return html`<div class="opt" role="option" id=${`fv-${ed._uid}-${i}`} aria-selected=${String(i === st.index)}
        data-variable=${v.value}
        @mouseenter=${() => { if (st.index !== i) { st.index = i; ed.requestUpdate(); } }}
        @mousedown=${(e) => e.preventDefault()}
        @click=${() => pick(i)}>
        <span class="lbl">${highlight(v.label, terms)}</span><code>${highlight(v.value, terms)}</code>
      </div>`;
    })}`);
}

function refilter(ed, st) {
  st.groups = filterVariables(groupsOf(ed), st.query);
  st.flat = flatten(st.groups);
  st.index = Math.max(0, Math.min(st.index, st.flat.length - 1));
}

function move(ed, st, d) {
  if (!st.flat.length) return;
  st.index = (st.index + d + st.flat.length) % st.flat.length;
  ed.requestUpdate();
  ed.updateComplete.then(() => ed.renderRoot.querySelector('.vars .opt[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }));
}

/* ================= ツールバーのコンボボックス ================= */

const panels = new WeakMap(); // editor → { query, index, groups, flat }

function panelState(ed) {
  if (!panels.has(ed)) panels.set(ed, { query: '', index: 0, groups: [], flat: [] });
  return panels.get(ed);
}

function renderPanel(ed, close) {
  const st = panelState(ed);
  refilter(ed, st);
  const pick = (i) => {
    const it = st.flat[i ?? st.index];
    if (!it) return;
    close();
    ed.focusEditor();
    insertVariable(ed, it.variable);
  };
  const onKey = (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); move(ed, st, 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(ed, st, -1); } else if (e.key === 'Enter') { e.preventDefault(); pick(); }
  };
  const listId = `fv-list-${ed._uid}`;
  return html`<div class="vars-combo">
    <input type="search" name="variable-search" placeholder="変数を検索" autocomplete="off"
      role="combobox" aria-label="変数を検索" aria-expanded="true" aria-controls=${listId} aria-autocomplete="list"
      aria-activedescendant=${st.flat.length ? `fv-${ed._uid}-${st.index}` : nothing}
      .value=${st.query}
      @input=${(e) => { st.query = e.target.value; st.index = 0; ed.requestUpdate(); }}
      @keydown=${onKey}>
    <div class="vars" id=${listId} role="listbox" aria-label="変数">${renderList(ed, st, pick)}</div>
  </div>`;
}

/* ================= 本文での呼び出し（"{{" に続けて入力） ================= */

const inlines = new WeakMap(); // editor → { node, offset, length, query, index, groups, flat }

function closeInline(ed) {
  if (!inlines.has(ed)) return;
  inlines.delete(ed);
  ed.hidePopup();
}

function inlineRect(ed) {
  const st = inlines.get(ed);
  if (!st?.node.isConnected) return null;
  const r = document.createRange();
  r.setStart(st.node, Math.min(st.offset, st.node.length));
  r.setEnd(st.node, Math.min(st.offset + st.length, st.node.length));
  return r.getBoundingClientRect();
}

function renderInline(ed) {
  const st = inlines.get(ed);
  if (!st) return html``;
  return html`<div class="vars" style="width:280px">${renderList(ed, st, (i) => runInline(ed, i))}</div>`;
}

function openInline(ed, node, offset, length) {
  const st = { node, offset, length, query: '', index: 0, groups: [], flat: [] };
  refilter(ed, st);
  inlines.set(ed, st);
  ed.showPopup({ render: renderInline, rect: () => inlineRect(ed) });
}

function updateInline(ed) {
  const st = inlines.get(ed);
  if (!st) return;
  const r = ed.getRange();
  const trigger = triggerOf(ed);
  const ok = r?.collapsed && trigger && r.startContainer === st.node && r.startOffset >= st.offset + st.length
    && st.node.data.slice(st.offset, st.offset + st.length).normalize('NFKC') === trigger;
  if (!ok) { closeInline(ed); return; }
  const q = st.node.data.slice(st.offset + st.length, r.startOffset);
  const f = ed.variableFormat;
  const closer = (f && typeof f === 'object' && f.close?.trim()?.[0]) || '}';
  if (q.length > 40 || /[\n{}]/.test(q) || q.normalize('NFKC').includes(closer)) { closeInline(ed); return; }
  if (q === st.query) return;
  st.query = q;
  st.index = 0;
  refilter(ed, st);
  ed.requestUpdate();
}

function runInline(ed, i) {
  const st = inlines.get(ed);
  const it = st?.flat[i ?? st.index];
  if (!it) return;
  const r = document.createRange();
  r.setStart(st.node, st.offset);
  r.setEnd(st.node, Math.min(st.node.length, st.offset + st.length + st.query.length));
  closeInline(ed);
  ed.selectRange(r);
  insertVariable(ed, it.variable);
}

/** キャレットの直前がきっかけの文字列なら候補を開く */
function maybeOpen(ed) {
  if (inlines.has(ed) || !groupsOf(ed).length) return;
  const trigger = triggerOf(ed);
  if (!trigger) return;
  const r = ed.getRange();
  if (!r?.collapsed || r.startContainer.nodeType !== 3) return;
  const node = r.startContainer;
  const offset = r.startOffset;
  // NFKC で全角の "｛｛" なども同じに扱う（1 文字ずつ対応するので長さは変わらない）
  const len = trigger.length;
  if (offset < len || node.data.slice(offset - len, offset).normalize('NFKC') !== trigger) return;
  openInline(ed, node, offset - len, len);
}

const inlineKey = (fn) => (ed, e) => (inlines.has(ed) ? (fn(ed, e), true) : false);

/* ================= プラグイン ================= */

export const variablesPlugin = {
  name: 'variables',
  items: {
    variable: {
      type: 'dropdown', title: '変数を挿入', icon: icons.variable,
      label: () => '変数',
      visible: (ed) => groupsOf(ed).length > 0,
      panel: renderPanel,
      onOpen: (ed) => {
        Object.assign(panelState(ed), { query: '', index: 0 });
        ed.updateComplete.then(() => ed.renderRoot.querySelector('.panel input[name=variable-search]')?.focus());
      },
    },
  },
  keymap: {
    ArrowDown: inlineKey((ed) => move(ed, inlines.get(ed), 1)),
    ArrowUp: inlineKey((ed) => move(ed, inlines.get(ed), -1)),
    Enter: (ed) => (inlines.get(ed)?.flat.length ? (runInline(ed), true) : false),
    Tab: (ed) => (inlines.get(ed)?.flat.length ? (runInline(ed), true) : false),
    Escape: inlineKey((ed) => closeInline(ed)),
  },
  // 読み込み時に、本文の変数の文字列を変数名の表示にする
  prepare(root, ed) {
    if (ed) decorateVariables(ed, root);
  },
  // 本文を読み込んだ後に変数の一覧や書式を設定した場合も、表示を合わせる
  updated(ed, changed) {
    if (!changed.has('variables') && !changed.has('variableFormat')) return;
    if (!ed.editable || ed.mode === 'source') return;
    ed._onMutations(ed._observer.takeRecords()); // それまでの変更は通常どおり記録する
    decorateVariables(ed, ed.editable);
    // 見た目だけの変更（書き出す内容は変わらない）なので、変更として扱わない
    ed._observer.takeRecords();
    ed.history.amend();
  },
  init(ed) {
    ed.insertVariable = (v) => insertVariable(ed, v);
    const onInput = (e) => {
      if (inlines.has(ed)) { updateInline(ed); return; }
      if (e.isComposing) return;
      if (!['insertText', 'insertCompositionText', 'insertReplacementText', 'insertFromPaste'].includes(e.inputType)) return;
      maybeOpen(ed);
    };
    // 日本語入力で "｛｛" を確定した場合
    const onCompositionEnd = () => setTimeout(() => maybeOpen(ed));
    const onSel = () => { if (inlines.has(ed)) updateInline(ed); };
    const onBlur = () => setTimeout(() => { if (!ed.matches(':focus-within')) closeInline(ed); }, 0);
    ed.editable.addEventListener('input', onInput);
    ed.editable.addEventListener('compositionend', onCompositionEnd);
    ed.addEventListener('formulit-selectionchange', onSel);
    ed.editable.addEventListener('blur', onBlur);
    return () => {
      closeInline(ed);
      ed.editable.removeEventListener('input', onInput);
      ed.editable.removeEventListener('compositionend', onCompositionEnd);
      ed.removeEventListener('formulit-selectionchange', onSel);
      ed.editable.removeEventListener('blur', onBlur);
    };
  },
};
