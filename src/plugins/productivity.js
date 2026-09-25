import { html, nothing } from 'lit';
import { icons } from '../icons.js';
import { closestBlock } from '../core/inline.js';

/**
 * 生産性：検索と置換、文字数カウント、自動保存、全画面、ショートカット一覧。
 */

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/* ================= 検索と置換 ================= */

const finds = new WeakMap(); // editor → { query, replacement, matchCase, wholeWord, matches, index }
const findState = (ed) => {
  if (!finds.has(ed)) finds.set(ed, { query: '', replacement: '', matchCase: false, wholeWord: false, matches: [], index: -1 });
  return finds.get(ed);
};

/** 本文のテキストを 1 本の文字列にし、各テキストノードの開始位置を記録する（段落の境目には改行を挟む） */
function textIndex(root) {
  const segs = [];
  let text = '';
  let lastBlock = null;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest('[contenteditable=false],script,style,template') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    const b = closestBlock(t, root);
    if (segs.length && b !== lastBlock) text += '\n';
    lastBlock = b;
    segs.push({ node: t, start: text.length });
    text += t.data;
  }
  return { text, segs };
}

function locate(segs, pos, preferNext) {
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].start <= pos) lo = mid; else hi = mid - 1;
  }
  let s = segs[lo];
  // 位置がノードの末尾ちょうどなら、始点としては次のノードの先頭を使う
  if (preferNext && pos - s.start >= s.node.length && segs[lo + 1]) s = segs[lo + 1];
  return { node: s.node, offset: Math.min(pos - s.start, s.node.length) };
}

export function findMatches(root, { query, matchCase = false, wholeWord = false }) {
  if (!query) return [];
  const { text, segs } = textIndex(root);
  if (!segs.length) return [];
  let src = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (wholeWord) src = `(?<![\\p{L}\\p{N}_])${src}(?![\\p{L}\\p{N}_])`;
  const re = new RegExp(src, `g${matchCase ? '' : 'i'}u`);
  const out = [];
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!m[0].length) { re.lastIndex++; continue; }
    const a = locate(segs, m.index, true);
    const b = locate(segs, m.index + m[0].length, false);
    const r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    out.push(r);
    if (out.length > 5000) break;
  }
  return out;
}

function refreshFind(ed, { keepIndex = true, fromCaret = false } = {}) {
  const st = findState(ed);
  st.matches = findMatches(ed.editable, st);
  if (!st.matches.length) st.index = -1;
  else if (fromCaret) {
    const caret = ed.getRange();
    const i = caret ? st.matches.findIndex((m) => m.compareBoundaryPoints(Range.START_TO_START, caret) >= 0) : 0;
    st.index = i < 0 ? 0 : i;
  } else if (!keepIndex || st.index < 0 || st.index >= st.matches.length) st.index = Math.min(Math.max(st.index, 0), st.matches.length - 1);
  paintFind(ed);
}

function paintFind(ed) {
  const st = findState(ed);
  const cur = st.matches[st.index];
  ed.setHighlight('find', st.matches.filter((m) => m !== cur), 'background-color: #fde68a; color: inherit;');
  ed.setHighlight('find-current', cur ? [cur] : [], 'background-color: #f59e0b; color: #fff;');
  ed.requestUpdate();
}

function scrollToMatch(ed) {
  const st = findState(ed);
  const m = st.matches[st.index];
  const el = m?.startContainer.parentElement;
  if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function step(ed, dir) {
  const st = findState(ed);
  if (!st.matches.length) refreshFind(ed, { fromCaret: true });
  if (!st.matches.length) return;
  st.index = (st.index + dir + st.matches.length) % st.matches.length;
  paintFind(ed);
  scrollToMatch(ed);
}

const INLINE_EMPTY = 'b,strong,i,em,u,s,strike,del,ins,span,code,mark,sub,sup,font,small,big,a';

function replaceRange(r, text) {
  const blocks = new Set([r.startContainer, r.endContainer].map((n) => (n.nodeType === 1 ? n : n.parentElement)?.closest('p,li,td,th,h1,h2,h3,h4,h5,h6,div,pre,blockquote,figcaption,caption')));
  r.deleteContents();
  // 一致箇所が装飾をまたいでいた場合に残る空の要素を消す
  for (const b of blocks) {
    b?.querySelectorAll(INLINE_EMPTY).forEach((el) => {
      if (!el.textContent && !el.querySelector('img,br,input,iframe,svg')) el.remove();
    });
  }
  if (text) {
    const t = document.createTextNode(text);
    r.insertNode(t);
    return t;
  }
  return null;
}

function replaceOne(ed) {
  const st = findState(ed);
  const m = st.matches[st.index];
  if (!m) return;
  ed._withoutFocus(() => ed.transact(() => replaceRange(m, st.replacement)));
  refreshFind(ed);
  scrollToMatch(ed);
}

function replaceAll(ed) {
  const st = findState(ed);
  refreshFind(ed);
  const n = st.matches.length;
  if (!n) return 0;
  ed._withoutFocus(() => ed.transact(() => { for (const m of [...st.matches].reverse()) replaceRange(m, st.replacement); }));
  refreshFind(ed);
  st.lastReplaced = n;
  return n;
}

function findPanel(ed) {
  const st = findState(ed);
  const onQuery = (e) => { st.query = e.target.value; st.lastReplaced = 0; refreshFind(ed, { fromCaret: true }); scrollToMatch(ed); };
  const keys = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); step(ed, e.shiftKey ? -1 : 1); }
  };
  const count = st.query ? (st.matches.length ? `${st.index + 1} / ${st.matches.length} 件` : '見つかりません') : '';
  return html`<div class="find" style="width:300px;display:flex;flex-direction:column;gap:6px">
    <input name="find" type="search" placeholder="検索" aria-label="検索" .value=${st.query} @input=${onQuery} @keydown=${keys}
      style="height:28px;border:1px solid #c4c7c5;border-radius:4px;padding:0 8px;font:inherit">
    <input name="replace" type="text" placeholder="置換後の文字列" aria-label="置換後の文字列" .value=${st.replacement}
      @input=${(e) => { st.replacement = e.target.value; }}
      @keydown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); replaceOne(ed); } }}
      style="height:28px;border:1px solid #c4c7c5;border-radius:4px;padding:0 8px;font:inherit">
    <div style="display:flex;gap:12px;font-size:12px">
      <label><input type="checkbox" name="matchCase" .checked=${st.matchCase}
        @change=${(e) => { st.matchCase = e.target.checked; refreshFind(ed, { fromCaret: true }); }}> 大文字と小文字を区別</label>
      <label><input type="checkbox" name="wholeWord" .checked=${st.wholeWord}
        @change=${(e) => { st.wholeWord = e.target.checked; refreshFind(ed, { fromCaret: true }); }}> 単語単位</label>
    </div>
    <div class="row" style="margin-top:0;flex-wrap:wrap">
      <button data-find="prev" title="前へ (Shift+Enter)" @click=${() => step(ed, -1)}>▲ 前へ</button>
      <button data-find="next" title="次へ (Enter)" @click=${() => step(ed, 1)}>▼ 次へ</button>
      <button data-find="replace" @click=${() => replaceOne(ed)}>置換</button>
      <button data-find="replaceAll" @click=${() => replaceAll(ed)}>すべて置換</button>
      <span data-find="count" style="margin-left:auto;font-size:12px;color:#5f6368">${st.lastReplaced ? `${st.lastReplaced} 件置換しました` : count}</span>
    </div>
  </div>`;
}

function openFind(ed) {
  const st = findState(ed);
  const r = ed.getRange();
  const sel = r && !r.collapsed ? r.toString() : '';
  if (sel && !sel.includes('\n') && sel.length < 200) st.query = sel;
  if (!ed.openDropdownItem('findReplace')) return false;
  ed.updateComplete.then(() => {
    const input = ed.renderRoot.querySelector('.panel input[name=find]');
    input?.focus();
    input?.select();
  });
  return true;
}

/* ================= 文字数カウント ================= */

const statsCache = new WeakMap();
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;

/** 文字数（改行を除く）、空白を除く文字数、単語数 */
export function getStats(ed) {
  const c = statsCache.get(ed);
  if (c && c.version === ed._version) return c.stats;
  const { text } = textIndex(ed.editable);
  const chars = [...text.replace(/\n/g, '')].length;
  const charsNoSpace = [...text.replace(/\s/g, '')].length;
  let words = 0;
  if (segmenter) for (const s of segmenter.segment(text)) { if (s.isWordLike) words++; }
  else words = (text.match(/\S+/g) ?? []).length;
  const stats = { chars, charsNoSpace, words };
  statsCache.set(ed, { version: ed._version, stats });
  return stats;
}

const fmt = (n) => n.toLocaleString('ja-JP');

/* ================= 自動保存 ================= */

const saves = new WeakMap(); // editor → { status, timer, lastSaved, savedAt, running }

async function saveNow(ed) {
  const st = saves.get(ed);
  if (!st || typeof ed.autosave !== 'function') return false;
  clearTimeout(st.timer);
  if (st.running) { st.again = true; return st.running; }
  const value = ed.value;
  if (value === st.lastSaved) { st.status = st.savedAt ? 'saved' : 'idle'; ed.requestUpdate(); return true; }
  st.status = 'saving';
  ed.requestUpdate();
  st.running = (async () => {
    try {
      await ed.autosave(value, ed);
      st.lastSaved = value;
      st.savedAt = new Date();
      st.status = 'saved';
      ed.dispatchEvent(new CustomEvent('formulit-autosave', { bubbles: true, composed: true, detail: { value } }));
    } catch (error) {
      st.status = 'error';
      ed.dispatchEvent(new CustomEvent('formulit-autosave-error', { bubbles: true, composed: true, detail: { error } }));
    } finally {
      st.running = null;
      ed.requestUpdate();
      if (st.again) { st.again = false; schedule(ed); }
    }
    return st.status === 'saved';
  })();
  return st.running;
}

function schedule(ed) {
  const st = saves.get(ed);
  if (!st || typeof ed.autosave !== 'function') return;
  if (st.lastSaved === undefined) st.lastSaved = ed._original;
  if (st.status !== 'pending') { st.status = 'pending'; ed.requestUpdate(); }
  clearTimeout(st.timer);
  st.timer = setTimeout(() => saveNow(ed), ed.autosaveDelay ?? 2000);
}

function autosaveStatus(ed) {
  const st = saves.get(ed);
  if (!st || typeof ed.autosave !== 'function') return null;
  const time = st.savedAt ? st.savedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
  const label = {
    idle: '', pending: '未保存の変更があります', saving: '保存中…',
    saved: `保存しました ${time}`, error: '保存に失敗しました（次の変更時に再試行）',
  }[st.status ?? 'idle'];
  return label ? html`<span data-status="autosave" class=${st.status === 'error' ? 'err' : ''}>${label}</span>` : null;
}

/* ================= ショートカット一覧 ================= */

function keyLabel(k) {
  return k.replace(/Mod/g, IS_MAC ? '⌘' : 'Ctrl').replace(/Alt/g, IS_MAC ? '⌥' : 'Alt').replace(/Shift/g, IS_MAC ? '⇧' : 'Shift');
}

export const SHORTCUTS = [
  ['太字', 'Mod+B'], ['斜体', 'Mod+I'], ['下線', 'Mod+U'], ['リンク', 'Mod+K'],
  ['元に戻す', 'Mod+Z'], ['やり直し', 'Mod+Shift+Z / Mod+Y'],
  ['検索と置換', 'Mod+F'], ['保存（自動保存を設定しているとき）', 'Mod+S'],
  ['大文字・小文字の変換', 'Shift+F3'], ['表：次・前のセル', 'Tab / Shift+Tab'],
  ['コードブロック：インデント・解除', 'Tab / Shift+Tab'], ['コードブロックを抜ける', '末尾で Enter ×3'],
  ['コマンドメニュー', '/（行頭で入力）'], ['書式のコピー・全画面・メニューを閉じる', 'Esc'],
  ['ショートカット一覧', 'Alt+0'],
];
export const MARKDOWN_SHORTCUTS = [
  ['見出し', '# ～ ###### + 空白'], ['箇条書き', '- または * + 空白'], ['番号付きリスト', '1. + 空白'],
  ['ToDo リスト', '[] または [x] + 空白'], ['引用', '> + 空白'], ['コードブロック', '``` + 空白（```js で言語指定）'],
  ['水平線', '---'], ['太字', '**文字**'], ['斜体', '*文字* または _文字_'], ['インラインコード', '`文字`'], ['取り消し線', '~~文字~~'],
];

function showShortcuts(ed) {
  const row = ([label, key]) => html`<tr><td>${label}</td><td>${key.split(' / ').map((k, i) => html`${i ? ' / ' : ''}<kbd>${keyLabel(k)}</kbd>`)}</td></tr>`;
  ed.openDialog({
    title: 'キーボードショートカット', submitLabel: '閉じる', wide: true, cancel: false,
    content: html`<table class="keys">${SHORTCUTS.map(row)}</table>
      <h3 style="margin:14px 0 6px;font-size:13px">入力しながら書式を付ける（行頭・文中）</h3>
      <table class="keys">${MARKDOWN_SHORTCUTS.map(([l, k]) => html`<tr><td>${l}</td><td><kbd>${k}</kbd></td></tr>`)}</table>`,
  });
  return true;
}

/* ================= プラグイン ================= */

export const productivityPlugin = {
  name: 'productivity',
  items: {
    findReplace: {
      type: 'dropdown', title: '検索と置換 (Ctrl/⌘+F)', icon: icons.find,
      panel: (ed) => findPanel(ed),
      onOpen: (ed) => refreshFind(ed, { fromCaret: true }),
      onClose: (ed) => {
        const st = findState(ed);
        const cur = st.matches[st.index];
        ed.setHighlight('find', [], '');
        ed.setHighlight('find-current', [], '');
        // 閉じたら現在の一致箇所を選択状態にする
        if (cur && ed.editable.contains(cur.startContainer)) { ed.focusEditor(); ed.selectRange(cur); }
      },
    },
    fullscreen: {
      icon: icons.fullscreen, title: '全画面表示', toggle: true, availableInSource: true,
      action: (ed) => ed.toggleFullscreen(),
      active: (ed) => ed.fullscreen,
    },
    shortcuts: { icon: icons.keyboard, title: 'キーボードショートカット (Alt+0)', availableInSource: true, action: showShortcuts },
  },
  keymap: {
    'Mod-f': openFind,
    'Mod-s': (ed) => (typeof ed.autosave === 'function' ? (saveNow(ed), true) : false),
    'Alt-0': showShortcuts,
    Escape: (ed) => {
      if (ed._openDropdown || ed._popup) return false;
      if (ed.fullscreen) { ed.toggleFullscreen(false); return true; }
      return false;
    },
  },
  status(ed) {
    const parts = [];
    const a = autosaveStatus(ed);
    if (a) parts.push(a);
    if (ed.wordCount || ed.maxChars > 0) {
      const s = getStats(ed);
      if (ed.maxChars > 0) {
        parts.push(html`<span data-status="chars" class=${s.chars > ed.maxChars ? 'over' : ''}>${fmt(s.chars)} / ${fmt(ed.maxChars)} 文字</span>`);
      } else {
        parts.push(html`<span data-status="chars">文字数 ${fmt(s.chars)}（空白を除く ${fmt(s.charsNoSpace)}）</span>`);
      }
      if (ed.wordCount) parts.push(html`<span data-status="words">単語 ${fmt(s.words)}</span>`);
    }
    return parts.length ? parts : nothing;
  },
  init(ed) {
    saves.set(ed, { status: 'idle' });
    // エディタのメソッドとしても呼べるようにする
    ed.saveNow = () => saveNow(ed);
    ed.getStats = () => getStats(ed);
    let t;
    const onInput = () => {
      schedule(ed);
      // 検索パネルを開いている間は、本文の変更に合わせて一致箇所を更新する
      if (ed._openDropdown === 'findReplace' || ed._openInner === 'findReplace') { clearTimeout(t); t = setTimeout(() => refreshFind(ed), 150); }
    };
    const onUnload = (e) => {
      const st = saves.get(ed);
      if (typeof ed.autosave === 'function' && (st?.status === 'pending' || st?.status === 'saving')) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    ed.addEventListener('input', onInput);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      ed.removeEventListener('input', onInput);
      window.removeEventListener('beforeunload', onUnload);
      clearTimeout(saves.get(ed)?.timer);
    };
  },
};

export { saveNow };
