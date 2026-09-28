import { html, nothing } from 'lit';
import { icons } from '../icons.js';
import {
  removeFormatting, captureFormatting, applyFormatting, changeCase,
} from '../core/inline.js';

/* ================= 既定の設定値（エディタのプロパティで上書き可能） ================= */

export const DEFAULT_FONT_FAMILIES = [
  { value: '', label: 'フォント' },
  { value: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif', label: 'ゴシック' },
  { value: '"Hiragino Mincho ProN", "Yu Mincho", serif', label: '明朝' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
  { value: 'ui-monospace, Menlo, Consolas, monospace', label: '等幅' },
];

export const DEFAULT_FONT_SIZES = [
  { value: '', label: 'サイズ' },
  ...['10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px', '48px'].map((v) => ({ value: v, label: v })),
];

export const DEFAULT_LINE_HEIGHTS = [
  { value: '', label: '行間' },
  ...['1', '1.15', '1.5', '1.75', '2', '2.5', '3'].map((v) => ({ value: v, label: v })),
];

export const DEFAULT_COLORS = [
  { color: '#000000', label: '黒' }, { color: '#4d4d4d', label: '濃い灰色' }, { color: '#999999', label: '灰色' },
  { color: '#e6e6e6', label: '薄い灰色' }, { color: '#ffffff', label: '白' },
  { color: '#e64c4c', label: '赤' }, { color: '#e6994c', label: 'オレンジ' }, { color: '#e6e64c', label: '黄' },
  { color: '#99e64c', label: '黄緑' }, { color: '#4ce64c', label: '緑' },
  { color: '#4ce699', label: 'アクアマリン' }, { color: '#4ce6e6', label: 'ターコイズ' }, { color: '#4c99e6', label: '水色' },
  { color: '#4c4ce6', label: '青' }, { color: '#994ce6', label: '紫' },
];

export const SPECIAL_CHARS = [
  { name: '記号', chars: '©®™§¶†‡•·…‰′″‹›«»“”‘’–—¡¿' },
  { name: '通貨', chars: '$€£¥₩₹¢₽₺₫฿' },
  { name: '矢印', chars: '←↑→↓↔↕⇐⇑⇒⇓⇔↩↪↖↗↘↙' },
  { name: '数学', chars: '±×÷≠≈≡≤≥∞√∑∏∫∂∆∇π°µ¼½¾¹²³∈∉∩∪⊂⊃∀∃¬∧∨' },
  { name: 'ラテン文字', chars: 'ÀÁÂÄÃÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÖÕØŒÙÚÛÜÝàáâäãåæçèéêëìíîïñòóôöõøœùúûüýÿß' },
  { name: '日本語の記号', chars: '〒※〇△▲▽▼□■◇◆○●◎☆★♪♭♯①②③④⑤⑥⑦⑧⑨⑩〜〃々〆「」『』【】〔〕' },
  { name: '絵文字', chars: ['😀', '😂', '😊', '😍', '🤔', '😢', '😡', '👍', '👎', '👏', '🙏', '🎉', '🔥', '✨', '⭐', '❤️', '✅', '❌', '⚠️', '📌', '📎', '📷', '💡', '🚀', '📅', '📝', '🔗', '💬'] },
];

/* ================= ヘルパー ================= */

const norm = (v) => (v ?? '').replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim().toLowerCase();

/** 現在値に一致する選択肢の value（書き方の違いは無視）。見つからなければ現在値そのもの */
function matchOption(options, current) {
  if (!current) return '';
  return options.find((o) => o.value && norm(o.value) === norm(current))?.value ?? current;
}

const styleSelect = (prop, title, key, defaults) => ({
  type: 'select',
  title,
  options: (ed) => ed[key] ?? defaults,
  value: (ed) => matchOption(ed[key] ?? defaults, ed.inlineStyleAt(prop)),
  formatUnknown: (v) => v.split(',')[0].replace(/["']/g, ''),
  action: (ed, v) => ed.applyInline([{ kind: 'style', prop, value: v || null }]),
});

function colorPanel(ed, close, prop) {
  const colors = ed.colors ?? DEFAULT_COLORS;
  const apply = (value) => { ed.applyInline([{ kind: 'style', prop, value }]); close(); };
  const current = ed.inlineStyleAt(prop);
  return html`
    <div class="grid" style="grid-template-columns:repeat(5, 22px)">
      ${colors.map((c) => html`<button class="swatch" title=${c.label} aria-label=${c.label} data-color=${c.color}
        style="background:${c.color}" @click=${() => apply(c.color)}></button>`)}
    </div>
    <div class="row">
      <button data-action="remove" @click=${() => apply(null)}>色を解除</button>
      <label title="その他の色"><input type="color" .value=${toHex(current) || '#000000'}
        @change=${(e) => apply(e.target.value)}></label>
    </div>`;
}

function toHex(v) {
  if (!v) return '';
  if (v.startsWith('#')) return v.length === 4 ? `#${[...v.slice(1)].map((c) => c + c).join('')}` : v;
  const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? `#${m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : '';
}

const colorIcon = (base, prop) => (ed) => {
  const c = ed.inlineStyleAt(prop);
  return html`<span style="display:inline-flex;flex-direction:column;align-items:center;line-height:0">
    ${base}<span style="display:block;width:16px;height:3px;margin-top:-1px;border-radius:1px;background:${c || (prop === 'color' ? '#202124' : 'transparent')};border:${c ? 0 : '1px solid #bbb'}"></span>
  </span>`;
};

/* ---------- スタイル（CKEditor の Style 機能） ---------- */

const BLOCK_ELEMENTS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'blockquote', 'pre', 'li', 'ul', 'ol', 'table', 'figure', 'section']);

function styleState(ed, def) {
  if (BLOCK_ELEMENTS.has(def.element)) {
    const targets = ed.selectedBlocks().map((b) => b.closest(def.element)).filter((b) => b && b !== ed.editable && ed.editable.contains(b));
    const active = targets.length > 0 && targets.every((b) => def.classes.every((c) => b.classList.contains(c)));
    return { enabled: targets.length > 0, active, targets };
  }
  return { enabled: true, active: ed.isInlineActive({ tag: def.element, classes: def.classes }) };
}

function applyStyleDef(ed, def) {
  if (BLOCK_ELEMENTS.has(def.element)) {
    const { active, targets } = styleState(ed, def);
    ed.transact(() => {
      for (const b of new Set(targets)) {
        if (active) b.classList.remove(...def.classes);
        else b.classList.add(...def.classes);
        if (!b.classList.length) b.removeAttribute('class');
      }
    });
  } else {
    ed.toggleInline({ tag: def.element, classes: def.classes });
  }
}

function stylesPanel(ed, close) {
  const defs = ed.formatStyles ?? [];
  const block = defs.filter((d) => BLOCK_ELEMENTS.has(d.element));
  const inline = defs.filter((d) => !BLOCK_ELEMENTS.has(d.element));
  const entry = (d) => {
    const st = styleState(ed, d);
    return html`<button role="menuitemcheckbox" aria-checked=${String(st.active)} ?disabled=${!st.enabled}
      data-style=${d.name} @click=${() => { applyStyleDef(ed, d); close(); }}>${d.name}</button>`;
  };
  return html`<div class="menu">
    ${block.length ? html`<h4>ブロック</h4>${block.map(entry)}` : nothing}
    ${inline.length ? html`<h4>インライン</h4>${inline.map(entry)}` : nothing}
  </div>`;
}

/* ---------- 書式コピー ---------- */

const painters = new WeakMap(); // editor → 書式の複製（外側→内側）

function togglePainter(ed) {
  if (painters.has(ed)) { stopPainter(ed); return; }
  const r = ed.getRange();
  if (!r) return;
  painters.set(ed, captureFormatting(r, ed.editable));
  ed.editable.classList.add('formulit-painting');
}

function stopPainter(ed) {
  painters.delete(ed);
  ed.editable.classList.remove('formulit-painting');
  ed.requestUpdate();
}

/* ---------- 大文字・小文字 ---------- */

const caseCycle = new WeakMap();
function applyCase(ed, mode) {
  ed.transact(() => {
    const r = ed.getRange(true);
    if (r.collapsed) return;
    ed.selectRange(changeCase(r, ed.editable, mode));
  });
}

/* ================= プラグイン ================= */

export const formattingPlugin = {
  name: 'formatting',
  items: {
    fontFamily: styleSelect('font-family', 'フォント', 'fontFamilies', DEFAULT_FONT_FAMILIES),
    fontSize: styleSelect('font-size', '文字サイズ', 'fontSizes', DEFAULT_FONT_SIZES),
    lineHeight: {
      type: 'select',
      title: '行間',
      options: (ed) => ed.lineHeights ?? DEFAULT_LINE_HEIGHTS,
      value: (ed) => ed.selectedBlocks()[0]?.style.lineHeight ?? '',
      action: (ed, v) => ed.setBlockStyle('line-height', v),
    },
    fontColor: {
      type: 'dropdown', title: '文字色',
      icon: null,
      label: null,
      panel: (ed, close) => colorPanel(ed, close, 'color'),
    },
    bgColor: {
      type: 'dropdown', title: '背景色（マーカー）',
      panel: (ed, close) => colorPanel(ed, close, 'background-color'),
    },
    code: {
      icon: icons.code, title: 'インラインコード',
      action: (ed) => ed.toggleInline({ tag: 'code' }),
      active: (ed) => ed.isInlineActive({ tag: 'code' }),
    },
    styles: {
      type: 'dropdown', title: 'スタイル', icon: icons.styles,
      visible: (ed) => (ed.formatStyles ?? []).length > 0,
      label: (ed) => {
        const act = (ed.formatStyles ?? []).filter((d) => styleState(ed, d).active);
        return act.length ? act.map((d) => d.name).join(', ') : 'スタイル';
      },
      panel: stylesPanel,
    },
    painter: {
      icon: icons.painter, title: '書式のコピー（貼り付け先を選択してください。Esc で中止）',
      toggle: true,
      action: togglePainter,
      active: (ed) => painters.has(ed),
    },
    specialChars: {
      type: 'dropdown', title: '特殊文字・絵文字', icon: icons.specialChars,
      panel: (ed) => html`<div style="width:300px">${SPECIAL_CHARS.map((g) => html`
        <h4>${g.name}</h4>
        <div class="grid chars" style="grid-template-columns:repeat(8, 1fr)">
          ${[...g.chars].map((ch) => html`<button title=${ch} data-char=${ch}
            @click=${() => ed.transact(() => document.execCommand('insertText', false, ch))}>${ch}</button>`)}
        </div>`)}</div>`,
    },
    caseChange: {
      type: 'dropdown', title: '大文字・小文字の変換 (Shift+F3)', icon: icons.caseChange,
      panel: (ed, close) => html`<div class="menu">
        <button data-case="upper" @click=${() => { applyCase(ed, 'upper'); close(); }}>大文字（UPPER CASE）</button>
        <button data-case="lower" @click=${() => { applyCase(ed, 'lower'); close(); }}>小文字（lower case）</button>
        <button data-case="title" @click=${() => { applyCase(ed, 'title'); close(); }}>先頭を大文字（Title Case）</button>
      </div>`,
    },
    clear: {
      icon: icons.clear, title: '書式をクリア',
      action: (ed) => ed.transact(() => {
        const r = ed.getRange(true);
        if (!r.collapsed) ed.selectRange(removeFormatting(r, ed.editable));
      }),
    },
  },
  keymap: {
    'Shift-F3': (ed) => {
      const order = ['upper', 'lower', 'title'];
      const next = order[((caseCycle.get(ed) ?? -1) + 1) % 3];
      caseCycle.set(ed, order.indexOf(next));
      applyCase(ed, next);
    },
    Escape: (ed) => {
      if (painters.has(ed)) { stopPainter(ed); return true; }
      if (ed._openDropdown) { ed.closeDropdown(); return true; }
      return false;
    },
  },
  init(ed) {
    // 書式コピー：マウスで範囲を選び終えたら貼り付ける
    const onUp = () => setTimeout(() => {
      const chain = painters.get(ed);
      if (!chain) return;
      const r = ed.getRange();
      if (!r || r.collapsed) return;
      ed.transact(() => ed.selectRange(applyFormatting(r, ed.editable, chain)));
      stopPainter(ed);
    });
    ed.editable.addEventListener('mouseup', onUp);
    return () => ed.editable.removeEventListener('mouseup', onUp);
  },
};

// 文字色・背景色のアイコンは現在の色を表示するため関数で作る
formattingPlugin.items.fontColor.label = colorIcon(icons.fontColor, 'color');
formattingPlugin.items.bgColor.label = colorIcon(icons.bgColor, 'background-color');
