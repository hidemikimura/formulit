import { LitElement, html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { load, serialize, DEFAULT_PROTECT } from './core/html.js';
import { History } from './core/history.js';
import { serializeWithSource, recordMutation, cloneWithMeta, equivalentHTML } from './core/source-map.js';
import { getPlugins } from './core/plugins.js';
import { getSelectionRange, setSelectionRange, activeElementOf } from './core/selection.js';
import {
  applyOps, isWrapActive, styleAt, selectedBlocks, insertStyledText,
} from './core/inline.js';

export const DEFAULT_TOOLBAR = [
  'undo', 'redo', 'findReplace', '|',
  'format', 'styles', 'fontFamily', 'fontSize', 'lineHeight', '|',
  'bold', 'italic', 'underline', 'strike', 'sup', 'sub', 'code', '|',
  'fontColor', 'bgColor', 'painter', 'caseChange', 'specialChars', '|',
  'ul', 'ol', 'todoList', 'listStyle', 'outdent', 'indent', '|',
  'alignLeft', 'alignCenter', 'alignRight', '|',
  'link', 'unlink', 'image', 'table', 'mediaEmbed', 'codeBlock', 'htmlEmbed', 'quote', 'hr', 'pageBreak', 'toc', 'variable', '|',
  'clear', 'source', 'fullscreen', 'shortcuts',
];

/**
 * グループでまとめた、コンパクトなツールバーの例（そのまま使うことも、参考にすることもできる）
 */
export const COMPACT_TOOLBAR = [
  'undo', 'redo', '|',
  'format', 'styles', '|',
  'bold', 'italic', 'underline',
  { label: '文字', title: '文字の装飾', items: ['strike', 'sup', 'sub', 'code', '|', 'fontFamily', 'fontSize', 'fontColor', 'bgColor', '|', 'painter', 'caseChange', 'clear'] },
  '|',
  'ul', 'ol',
  { label: '段落', title: '段落の書式', items: ['todoList', 'listStyle', 'outdent', 'indent', '|', 'alignLeft', 'alignCenter', 'alignRight', '|', 'lineHeight', 'quote'] },
  '|',
  'link', 'image', 'table', 'variable',
  { label: '挿入', title: 'その他の挿入', items: ['mediaEmbed', 'codeBlock', 'htmlEmbed', 'specialChars', '|', 'hr', 'pageBreak', 'toc'] },
  '|',
  { label: '⋯', title: 'その他', items: ['findReplace', 'source', 'fullscreen', 'shortcuts'] },
];

const PARAGRAPH_LIKE = 'p,h1,h2,h3,h4,h5,h6,pre';
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol',
  'p', 'pre', 'section', 'table', 'ul', 'iframe', 'video', 'audio',
]);
const isBlock = (n) => n.nodeType === 1 && BLOCK_TAGS.has(n.localName);
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const listConverter = {
  fromAttribute: (v) => (v == null ? null : v.split(/[\s,]+/).filter(Boolean)),
  toAttribute: (v) => (Array.isArray(v) ? v.join(' ') : v),
};

/* 編集領域（ライト DOM）用の最小限のスタイル。ページのスタイルが本文に効くよう、見た目の補助だけにとどめる */
const lightSheet = new CSSStyleSheet();
lightSheet.replaceSync(`
  :is(formulit-editor, formulit-markdown) > .formulit-editable { display:block; position:relative; outline:none; box-sizing:border-box;
    min-height:var(--formulit-min-height,240px); padding:var(--formulit-padding,12px 16px); overflow-wrap:break-word; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable.formulit-empty::before { content:attr(data-placeholder); color:#9aa0a6;
    position:absolute; pointer-events:none; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable td, :is(formulit-editor, formulit-markdown) > .formulit-editable th { outline:1px dashed #c4c7c5; outline-offset:-1px; min-width:2em; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable [data-formulit-selected] { outline:2px solid #1a73e8; outline-offset:1px; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable [contenteditable=false] { outline:1px dotted #9aa0a6; outline-offset:2px; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable img { max-width:100%; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable [data-formulit-variable] { outline:none; padding:0 .3em; margin:0 .05em;
    border-radius:4px; background:rgb(26 115 232 / .12); color:#1a56c4; white-space:nowrap; cursor:default; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable.formulit-painting { cursor:copy; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable [data-formulit-cell-selected] { background-color:rgb(26 115 232 / .14) !important; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable figure > figcaption:empty::before { content:'キャプションを入力'; color:#9aa0a6; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable img[data-formulit-uploading] { opacity:.5; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable pre > code[class*="language-"] { display:block; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable figure.media { position:relative; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable figure.media::after { content:''; position:absolute; inset:0; cursor:pointer; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable table > caption:empty::before { content:'表のタイトルを入力'; color:#9aa0a6; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable ul.todo-list > li > input[type=checkbox] { margin:0 .45em 0 -.2em; vertical-align:middle; cursor:pointer; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable ul.todo-list > li:has(> input[checked]) { text-decoration:line-through; color:#80868b; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable div.page-break { position:relative; clear:both; height:0; margin:1.6em 0; border-top:1px dashed #9aa0a6; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable div.page-break::after { content:'改ページ'; position:absolute; left:50%; top:-.75em; transform:translateX(-50%);
    background:#fff; color:#80868b; font:11px/1.5 system-ui,sans-serif; padding:0 8px; border:1px solid #dadce0; border-radius:10px; }
  :is(formulit-editor, formulit-markdown) > .formulit-editable nav.toc { border:1px solid #dadce0; border-radius:6px; padding:.4em 1em; background:#fafafa; cursor:default; }
`);
const styledRoots = new WeakSet();
const highlightRules = new Set();
let uidCounter = 0;

export class FormulitEditor extends LitElement {
  static formAssociated = true;

  static properties = {
    toolbar: { converter: listConverter },
    plugins: { converter: listConverter },
    sanitize: { type: String },
    protect: { type: String },
    placeholder: { type: String },
    readonly: { type: Boolean, reflect: true },
    preserveSource: { attribute: 'preserve-source', converter: { fromAttribute: (v) => v !== 'false' } },
    /** 設定（JS プロパティで渡す）。null ならプラグインの既定値 */
    fontFamilies: { attribute: false },
    fontSizes: { attribute: false },
    colors: { attribute: false },
    lineHeights: { attribute: false },
    formatStyles: { attribute: false },
    imageStyles: { attribute: false },
    codeBlockLanguages: { attribute: false },
    mediaProviders: { attribute: false },
    fullscreen: { type: Boolean, reflect: true },
    wordCount: { type: Boolean, attribute: 'word-count' },
    maxChars: { type: Number, attribute: 'max-chars' },
    autosave: { attribute: false },
    autosaveDelay: { type: Number, attribute: 'autosave-delay' },
    autoformat: { attribute: 'autoformat', converter: { fromAttribute: (v) => v !== 'false' } },
    slashCommands: { attribute: false },
    variables: { attribute: false },
    variableFormat: { attribute: false },
    variableTrigger: { attribute: false },
    _popup: { state: true },
    _mode: { state: true },
    _dialog: { state: true },
    _openDropdown: { state: true },
    _openInner: { state: true },
    _resizing: { state: true },
  };

  static styles = css`
    :host { display:block; border:1px solid var(--formulit-border,#d0d4d9); border-radius:var(--formulit-radius,6px);
      background:var(--formulit-bg,#fff); color:inherit; position:relative; }
    :host([fullscreen]) { position:fixed; inset:0; z-index:2147483000; border-radius:0; display:flex; flex-direction:column; border:0; }
    :host([fullscreen]) .toolbar { border-radius:0; }
    :host([fullscreen]) .body { flex:1; overflow:auto; }
    :host([fullscreen]) ::slotted(.formulit-editable) { max-width:var(--formulit-fullscreen-width, 860px); margin:0 auto; min-height:100%; }
    .status { display:flex; gap:14px; justify-content:flex-end; align-items:center; padding:3px 10px; min-height:22px;
      border-top:1px solid var(--formulit-border,#d0d4d9); background:var(--formulit-toolbar-bg,#f7f8fa);
      font:12px system-ui,sans-serif; color:#5f6368; border-radius:0 0 var(--formulit-radius,6px) var(--formulit-radius,6px); }
    .status .over { color:#c5221f; font-weight:600; }
    .status .err { color:#c5221f; }
    .popup { position:absolute; z-index:6; background:#fff; border:1px solid #d0d4d9; border-radius:8px;
      box-shadow:0 8px 24px rgb(0 0 0 / .16); padding:4px; min-width:220px; max-height:300px; overflow:auto;
      font:13px system-ui,sans-serif; color:#202124; }
    .popup .opt { display:flex; gap:10px; align-items:center; padding:6px 10px; border-radius:5px; cursor:pointer; }
    .popup .opt[aria-selected=true] { background:#e8f0fe; }
    .popup .opt small { color:#5f6368; margin-left:auto; }
    .popup .empty { padding:6px 10px; color:#5f6368; }
    .vars-combo { width:280px; display:flex; flex-direction:column; gap:6px; }
    .vars-combo input { height:30px; border:1px solid #c4c7c5; border-radius:4px; padding:0 8px; font:inherit; }
    .vars-combo input:focus { outline:2px solid #1a73e8; outline-offset:-1px; border-color:transparent; }
    .vars { max-height:280px; overflow:auto; }
    .vars .grp { padding:6px 8px 2px; font-size:11px; font-weight:600; color:#5f6368; }
    .vars .opt { display:flex; gap:10px; align-items:baseline; padding:5px 8px; border-radius:5px; cursor:pointer; }
    .vars .opt[aria-selected=true] { background:#e8f0fe; }
    .vars .opt code { margin-left:auto; font:12px ui-monospace,Menlo,monospace; color:#5f6368; white-space:nowrap; }
    .vars mark { background:#fde68a; color:inherit; padding:0; border-radius:2px; }
    .vars .empty { padding:6px 8px; color:#5f6368; }
    .dialog table.keys { border-collapse:collapse; width:100%; font-size:13px; }
    .dialog table.keys td { padding:4px 6px; border-bottom:1px solid #eee; }
    .dialog table.keys kbd { font:12px ui-monospace,Menlo,monospace; background:#f1f3f4; border:1px solid #dadce0; border-radius:3px; padding:1px 5px; }
    .dialog .content { max-height:60vh; overflow:auto; }
    .toolbar { display:flex; flex-wrap:wrap; gap:2px; align-items:center; padding:4px 6px;
      border-bottom:1px solid var(--formulit-border,#d0d4d9); background:var(--formulit-toolbar-bg,#f7f8fa);
      border-radius:var(--formulit-radius,6px) var(--formulit-radius,6px) 0 0; position:sticky; top:0; z-index:2; }
    button { all:unset; box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center;
      min-width:30px; height:30px; padding:0 6px; border-radius:4px; cursor:pointer; color:#3c4043; font:600 14px/1 system-ui,sans-serif; }
    button:hover:not([disabled]) { background:#e8eaed; }
    button:focus-visible, select:focus-visible { outline:2px solid #1a73e8; outline-offset:-2px; }
    button[aria-pressed=true] { background:#d3e3fd; color:#0b57d0; }
    button[disabled] { opacity:.35; cursor:default; }
    select { height:30px; border:1px solid transparent; border-radius:4px; background:transparent; font:14px system-ui,sans-serif; color:#3c4043; padding:0 4px; cursor:pointer; }
    select:hover:not([disabled]) { background:#e8eaed; }
    .sep { width:1px; align-self:stretch; margin:4px 3px; background:#d0d4d9; }
    .body { position:relative; }
    textarea.source { display:block; box-sizing:border-box; width:100%; min-height:var(--formulit-min-height,240px);
      border:0; outline:none; resize:vertical; padding:12px 16px; font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      background:#1f2328; color:#e6edf3; border-radius:0 0 var(--formulit-radius,6px) var(--formulit-radius,6px); tab-size:2; }
    [hidden] { display:none !important; }
    .overlay { position:absolute; inset:0; background:rgb(0 0 0 / .18); display:flex; align-items:flex-start;
      justify-content:center; padding-top:48px; z-index:3; border-radius:inherit; }
    form.dialog { background:#fff; border-radius:8px; box-shadow:0 8px 28px rgb(0 0 0 / .2); padding:16px 18px;
      min-width:min(360px, 90%); font:14px system-ui,sans-serif; color:#202124; }
    .dialog h3 { margin:0 0 12px; font-size:15px; }
    .dialog .msg { margin:-6px 0 12px; font-size:12px; color:#5f6368; }
    .dialog label { display:block; margin-bottom:10px; }
    .dialog label span { display:block; font-size:12px; color:#5f6368; margin-bottom:4px; }
    .dialog label.check { display:flex; gap:6px; align-items:center; }
    .dialog label.check span { display:inline; margin:0; font-size:14px; color:inherit; }
    .dialog input:not([type=checkbox]), .dialog select { width:100%; box-sizing:border-box; height:32px; padding:0 8px;
      border:1px solid #c4c7c5; border-radius:4px; font:inherit; background:#fff; }
    .dialog .actions { display:flex; justify-content:flex-end; gap:8px; margin-top:14px; }
    .dialog .actions button { font-weight:500; padding:0 14px; }
    .dialog .actions button.primary { background:#0b57d0; color:#fff; }
    .dd { position:relative; display:inline-flex; }
    .dd > button .caret { margin-left:2px; font-size:9px; opacity:.7; }
    .dd > button .label { font-weight:500; font-size:13px; max-width:9em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .panel { position:absolute; top:calc(100% + 4px); left:0; z-index:5; background:#fff; border:1px solid #d0d4d9;
      border-radius:6px; box-shadow:0 6px 20px rgb(0 0 0 / .15); padding:6px; font:13px system-ui,sans-serif; color:#202124;
      min-width:120px; max-height:360px; overflow:auto; }
    .panel.right { left:auto; right:0; }
    .panel.group { display:flex; flex-wrap:wrap; gap:2px; align-items:center; overflow:visible; max-height:none;
      min-width:0; width:max-content; max-width:min(360px, 90vw); padding:4px; }
    .panel.group .sep { margin:3px 2px; }
    .group-btn { gap:2px; }
    .panel .menu { display:flex; flex-direction:column; min-width:160px; }
    .panel .menu button { justify-content:flex-start; font-weight:400; height:auto; min-height:30px; padding:4px 10px; white-space:nowrap; }
    .panel .menu button[aria-checked=true] { background:#e8f0fe; color:#0b57d0; }
    .panel .grid { display:grid; gap:3px; }
    .panel .swatch { min-width:0; width:22px; height:22px; padding:0; border-radius:3px; border:1px solid rgb(0 0 0 / .15); }
    .panel .swatch:hover { outline:2px solid #1a73e8; outline-offset:1px; }
    .panel .row { display:flex; gap:6px; align-items:center; margin-top:6px; }
    .panel .row button { font-weight:500; font-size:12px; }
    .panel h4 { margin:6px 4px 4px; font-size:11px; font-weight:600; color:#5f6368; }
    .panel .chars button { min-width:30px; font-weight:400; font-size:16px; }
    .panel input[type=color] { width:32px; height:26px; padding:0; border:1px solid #c4c7c5; border-radius:4px; background:#fff; }
    .ctx { position:absolute; z-index:4; display:flex; flex-wrap:wrap; gap:2px; align-items:center; padding:3px 4px;
      background:#fff; border:1px solid #d0d4d9; border-radius:6px; box-shadow:0 4px 14px rgb(0 0 0 / .14); max-width:calc(100% - 8px); }
    .ctx.above { transform:translateY(calc(-100% - 6px)); }
    .ctx .sep { margin:3px 2px; }
    .resize { position:absolute; z-index:3; pointer-events:none; outline:1px solid #1a73e8; }
    .resize i { position:absolute; width:10px; height:10px; background:#fff; border:2px solid #1a73e8; border-radius:2px;
      box-sizing:border-box; pointer-events:auto; }
    .resize i[data-h=nw] { left:-6px; top:-6px; cursor:nwse-resize; }
    .resize i[data-h=ne] { right:-6px; top:-6px; cursor:nesw-resize; }
    .resize i[data-h=sw] { left:-6px; bottom:-6px; cursor:nesw-resize; }
    .resize i[data-h=se] { right:-6px; bottom:-6px; cursor:nwse-resize; }
    .resize b { position:absolute; right:4px; bottom:4px; background:rgb(0 0 0 / .65); color:#fff; font:11px/1.6 system-ui; padding:0 5px; border-radius:3px; }
    .dialog textarea { width:100%; box-sizing:border-box; min-height:160px; padding:8px; border:1px solid #c4c7c5; border-radius:4px;
      font:12px/1.5 ui-monospace,Menlo,Consolas,monospace; resize:vertical; }
    .dialog .color { display:flex; gap:6px; }
    .dialog .color input[type=color] { width:40px; flex:none; padding:0 2px; }
    .dialog .cols { display:grid; grid-template-columns:1fr 1fr; gap:0 12px; }
    form.dialog.wide { min-width:min(520px, 94%); }
  `;

  constructor() {
    super();
    // 要素が定義される前（アップグレード前）に設定されたプロパティを退避する。
    // そのままだと下の初期化で上書きされたり、value のアクセサが隠れたりするため
    const preset = {};
    for (const key of ['value', 'imageUploader']) {
      if (Object.prototype.hasOwnProperty.call(this, key)) {
        preset[key] = this[key];
        delete this[key];
      }
    }
    this.toolbar = null;
    this.plugins = null;
    this.sanitize = 'strip';
    this.protect = DEFAULT_PROTECT;
    this.placeholder = '';
    this.readonly = false;
    this.preserveSource = true;
    this.fontFamilies = null;
    this.fontSizes = null;
    this.colors = null;
    this.lineHeights = null;
    this.formatStyles = null;
    this.imageStyles = null;
    this.codeBlockLanguages = null;
    this.mediaProviders = null;
    /** 画像のアップロード先 async (file) => url（未設定なら data URL） */
    this.imageUploader = null;
    this.fullscreen = false;
    this.wordCount = false;
    this.maxChars = 0;
    this.autosave = null;
    this.autosaveDelay = 2000;
    this._popup = null;
    this.autoformat = true;
    this.slashCommands = null;
    /** 変数の一覧（[{ type: 'group', label, variables: [{ label, value }] }]）。空なら「変数」ボタンは出ない */
    this.variables = null;
    /** 変数を挿入するときの書式 { open, close } または (variable) => string */
    this.variableFormat = null;
    /** 本文で変数の候補を出すきっかけの文字列（null なら variableFormat.open から決める。false で無効） */
    this.variableTrigger = null;
    this._uid = ++uidCounter;
    this._openDropdown = null;
    this._openInner = null;
    this._pending = null;
    this._mode = 'wysiwyg';
    this._dialog = null;
    this._original = '';
    this._initialValue = '';
    this._dirty = false;
    this._cleanIndex = 0;
    this._lastRange = null;
    this._cleanups = [];
    try { this._internals = this.attachInternals(); } catch { this._internals = null; }

    this.editable = document.createElement('div');
    this.editable.className = 'formulit-editable';
    this.editable.slot = 'editable';
    this.editable.setAttribute('role', 'textbox');
    this.editable.setAttribute('aria-multiline', 'true');
    this.history = new History(this.editable, {
      // 原文との対応情報ごと保存・復元し、undo/redo 後も部分的な原文保持を効かせる
      snapshot: (root) => [...root.childNodes].map(cloneWithMeta),
      restore: (root, nodes) => root.replaceChildren(...nodes.map(cloneWithMeta)),
    });
    // 最後に履歴へ記録してから内容が変わったか（元に戻したときのカーソル位置を覚えるかの判断用）
    this._unrecorded = false;
    for (const m of ['record', 'reset', 'undo', 'redo', 'amend']) {
      const f = this.history[m].bind(this.history);
      this.history[m] = (...args) => { const r = f(...args); this._unrecorded = false; return r; };
    }
    this._version = 0;
    this._cache = null;
    this._observer = new MutationObserver((records) => this._onMutations(records));
    if ('imageUploader' in preset) this.imageUploader = preset.imageUploader;
    if ('value' in preset) this.value = preset.value;
  }

  /* ============ 公開 API ============ */

  /** 現在の HTML。WYSIWYG 側で何も変更していなければ、読み込んだ文字列をそのまま返す */
  get value() {
    if (this._mode === 'source') return this._sourceArea?.value ?? this._original;
    if (!this._dirty) return this._original;
    if (this._cache?.version === this._version) return this._cache.value;
    const value = this._serializePreserving();
    this._cache = { version: this._version, value };
    return value;
  }

  /**
   * 編集されていない部分は原文の文字列をそのまま使って書き出す。
   * 組み立てた結果が DOM と等価でなければ（念のため）通常のシリアライズに戻す。
   */
  _serializePreserving() {
    const ed = this.editable;
    if (!this.preserveSource || ed.childElementCount <= 1) {
      const plain = serialize(ed);
      if (plain === '' || !this.preserveSource) return plain;
    }
    const ctx = { risky: false };
    let preserved;
    try { preserved = serializeWithSource(ed, ctx); } catch { return serialize(ed); }
    // つなぎ目に不安がなければ、文書全体の再パースによる確認は省く（入力ごとの処理を軽くするため）
    if (!ctx.risky) return preserved;
    const plain = serialize(ed);
    return equivalentHTML(preserved, plain) ? preserved : plain;
  }

  set value(v) {
    // ページに付ける前に設定された値は、接続時に子要素などの初期値より優先する
    if (!this._initialized) this._valueSetEarly = true;
    this._setContent(String(v ?? ''), { resetHistory: true });
    if (this._mode === 'source' && this._sourceArea) this._sourceArea.value = this._original;
  }

  getHTML() { return this.value; }
  setHTML(v) { this.value = v; }

  /** toolbar を設定しないときのツールバー（継承した要素で差し替えられる） */
  get defaultToolbar() { return DEFAULT_TOOLBAR; }

  get mode() { return this._mode; }
  get dirty() { return this._dirty; }

  /** 解決済みのツールバー項目（プラグインから収集） */
  get items() {
    const items = {};
    for (const p of this._activePlugins()) Object.assign(items, p.items);
    return items;
  }

  /** execCommand を実行して履歴に積む */
  exec(command, value = null) {
    return this.transact(() => document.execCommand(command, false, value));
  }

  /** DOM を変更する処理をまとめて 1 つの履歴にする */
  transact(fn) {
    if (this.readonly || this._mode === 'source') return;
    this._flushTyping();
    if (!this._noFocus) this.focusEditor();
    // 元に戻したときに戻るカーソル位置（変更の直前の位置）
    this.history.noteSelection({ verify: false });
    const result = fn(this);
    this._afterChange();
    return result;
  }

  queryState(command) {
    try { return document.queryCommandState(command); } catch { return false; }
  }

  /**
   * インライン書式を適用する（ops は core/inline.js 参照）。
   * 範囲選択なしのときは「次に入力する文字」に適用する。
   */
  applyInline(ops) {
    return this.transact(() => {
      const range = this.getRange(true);
      if (range.collapsed) {
        const keep = (this._pendingValid() ? this._pending.ops : []).filter((o) => !ops.some((n) => sameOpTarget(n, o)));
        this._pending = { ops: [...keep, ...ops], node: range.startContainer, offset: range.startOffset };
        return;
      }
      this._pending = null;
      this.selectRange(applyOps(range, this.editable, ops));
    });
  }

  /** 要素で囲む書式（インラインコードなど）の切り替え */
  toggleInline(op) {
    const active = this.isInlineActive(op);
    return this.applyInline([{ kind: 'wrap', ...op, remove: active }]);
  }

  isInlineActive(op) {
    const pending = this._pendingValid() && this._pending.ops.find((o) => o.kind === 'wrap' && o.tag === op.tag
      && (o.classes ?? []).join() === (op.classes ?? []).join());
    if (pending) return !pending.remove;
    const r = this.getRange();
    return r ? isWrapActive(r, this.editable, { kind: 'wrap', ...op }) : false;
  }

  /** カーソル位置の実際のインラインスタイル値（入力待ちスタイルを含む） */
  inlineStyleAt(prop) {
    if (this._pendingValid()) {
      const p = this._pending.ops.findLast((o) => o.kind === 'style' && o.prop === prop);
      if (p) return p.value ?? '';
    }
    const r = this.getRange();
    return r ? styleAt(r, this.editable, prop) : '';
  }

  /** 選択範囲にかかっている段落などのブロック */
  selectedBlocks() {
    const r = this.getRange();
    return r ? selectedBlocks(r, this.editable) : [];
  }

  /** 選択中のブロックにスタイルを設定する（value が null/'' なら解除） */
  setBlockStyle(prop, value) {
    return this.transact(() => {
      for (const b of this.selectedBlocks()) {
        if (value) b.style.setProperty(prop, value);
        else b.style.removeProperty(prop);
        if (b.getAttribute('style') === '') b.removeAttribute('style');
      }
    });
  }

  /**
   * ツールバーの状態（押下表示など）やコンテキストツールバーの位置の更新をまとめて行う。
   * 連続入力中は 1 文字ごとに更新せず、入力が一息ついたとき（最大でも 250ms ごと）に更新する。
   * 状態の計算はブラウザにレイアウトをさせるため、大きな文書では毎回行うと入力が重くなる。
   */
  _scheduleUi({ selection = false } = {}) {
    if (selection) this._uiSelection = true;
    if (this._uiTimer) return;
    const typing = performance.now() - (this._lastInputAt ?? -1e9) < 150;
    const run = () => {
      this._uiTimer = null;
      if (performance.now() - (this._lastInputAt ?? -1e9) < 120 && performance.now() - this._uiSince < 250) {
        this._uiTimer = setTimeout(run, 120);
        return;
      }
      if (this._uiSelection) { this._uiSelection = false; this._emit('formulit-selectionchange'); }
      this.requestUpdate();
    };
    this._uiSince = performance.now();
    this._uiTimer = typing ? setTimeout(run, 120) : requestAnimationFrame(run);
  }

  /**
   * キャレット付近にポップアップ（候補メニューなど）を表示する。
   * render(editor) は Lit テンプレート、rect() は位置の基準となる矩形（getBoundingClientRect の形）を返す。
   */
  showPopup({ render, rect }) {
    this._popup = { render, rect };
  }

  hidePopup() {
    this._popup = null;
  }

  /**
   * 本文を変更せずに範囲を強調表示する（CSS Custom Highlight API。未対応ブラウザでは何もしない）。
   * key ごとに css（例: 'background: #fde68a'）を指定する。ranges が空なら解除。
   */
  setHighlight(key, ranges, css) {
    if (!globalThis.CSS?.highlights || typeof Highlight === 'undefined') return false;
    const name = `formulit-${key}-${this._uid}`;
    if (!highlightRules.has(name)) {
      lightSheet.insertRule(`::highlight(${name}) { ${css} }`, lightSheet.cssRules.length);
      highlightRules.add(name);
    }
    if (ranges?.length) CSS.highlights.set(name, new Highlight(...ranges));
    else CSS.highlights.delete(name);
    return true;
  }

  /** 読み込み（load）に渡すオプション。プラグインの prepare(root) を含む */
  loadOptions() {
    return {
      sanitize: this.sanitize,
      protect: this.protect,
      prepare: this._activePlugins().filter((p) => p.prepare).map((p) => (root) => p.prepare(root, this)),
    };
  }

  /** 全画面表示の切り替え */
  toggleFullscreen(force) {
    const on = force ?? !this.fullscreen;
    if (on === this.fullscreen) return;
    this.fullscreen = on;
    // ページ側のスクロールを止める
    const root = document.documentElement;
    if (on) { this._savedOverflow = root.style.overflow; root.style.overflow = 'hidden'; }
    else root.style.overflow = this._savedOverflow ?? '';
    this.updateComplete.then(() => this.focusEditor());
    this._emit('formulit-fullscreen', { fullscreen: on });
  }

  /** フォーカスを奪わずに処理する（アップロード完了時など、非同期の変更用） */
  _withoutFocus(fn) {
    this._noFocus = true;
    try { return fn(); } finally { this._noFocus = false; }
  }

  /** ドロップダウンを閉じる */
  closeDropdown() {
    this._openDropdown = null;
    this._openInner = null;
  }

  /**
   * 名前を指定してドロップダウン項目を開く。ツールバーのグループの中にあれば、グループごと開く。
   * 開けたら true
   */
  openDropdownItem(name) {
    const find = (list, prefix) => {
      for (const [i, e] of (list ?? []).entries()) {
        if (e === name) return { top: name };
        if (e && typeof e === 'object' && Array.isArray(e.items) && e.items.includes(name)) return { top: groupKey(e, prefix, i), inner: name };
      }
      return null;
    };
    const hit = find(this.toolbar ?? this.defaultToolbar, 'group');
    if (!hit) return false;
    this._openDropdown = hit.top;
    this._openInner = hit.inner ?? null;
    return true;
  }

  _pendingValid() {
    const p = this._pending;
    if (!p) return false;
    const r = this.getRange();
    return !!r && r.collapsed && r.startContainer === p.node && r.startOffset === p.offset;
  }

  /** HTML 文字列をカーソル位置に挿入する（サニタイズ・保護処理を通す） */
  insertHTML(htmlString) {
    const frag = load(htmlString, this.loadOptions());
    return this.insertNodes(frag);
  }

  /** ノードを挿入する。ブロック要素は段落を分割して正しい位置に入れる */
  insertNodes(fragOrNode) {
    return this.transact(() => this.insertNodesAtSelection(fragOrNode));
  }

  /** insertNodes の本体（transact の中から呼ぶ用） */
  insertNodesAtSelection(fragOrNode) {
    {
      const frag = fragOrNode instanceof DocumentFragment ? fragOrNode : wrapFragment(fragOrNode);
      const nodes = [...frag.childNodes];
      if (!nodes.length) return;
      const range = this.getRange(true);
      range.deleteContents();
      const para = this._closest(range.startContainer, PARAGRAPH_LIKE);
      if (!nodes.some(isBlock) || !para) {
        range.insertNode(frag);
        this.setCaretAfter(nodes.at(-1));
        return nodes;
      }
      // 段落をカーソル位置で 2 つに分け、その間にブロックを入れる
      const tailRange = document.createRange();
      tailRange.setStart(range.startContainer, range.startOffset);
      tailRange.setEndAfter(para);
      const tail = tailRange.extractContents().firstElementChild;
      para.after(frag);
      let caretTarget = null;
      if (tail && !isEmptyBlock(tail)) { nodes.at(-1).after(tail); caretTarget = tail; }
      if (isEmptyBlock(para)) para.remove();
      if (!caretTarget) {
        // 後ろに段落などがあればそこへ、無ければ続けて入力できるよう空の段落を作る
        const next = nodes.at(-1).nextElementSibling;
        if (next?.matches('p,h1,h2,h3,h4,h5,h6,pre,div:not([contenteditable=false]),blockquote,ul,ol')) {
          caretTarget = next.matches('ul,ol') ? next.querySelector('li') ?? next : next;
        } else {
          caretTarget = document.createElement('p');
          caretTarget.append(document.createElement('br'));
          nodes.at(-1).after(caretTarget);
        }
      }
      this.setCaretAt(caretTarget, 0);
      return nodes;
    }
  }

  /** 編集領域内の選択範囲（無ければ最後の選択、それも無ければ末尾） */
  getRange(fallbackToEnd = false) {
    // シャドウ DOM の中に置かれていても、中の本当の選択範囲を取る（core/selection.js）
    const cur = getSelectionRange(this.editable);
    if (cur && this.editable.contains(cur.commonAncestorContainer)) return cur;
    if (this._lastRange && this.editable.contains(this._lastRange.commonAncestorContainer)) {
      return this._lastRange.cloneRange();
    }
    if (!fallbackToEnd) return null;
    const r = document.createRange();
    r.selectNodeContents(this.editable);
    r.collapse(false);
    return r;
  }

  selectRange(range) {
    setSelectionRange(range, this.editable);
    this._lastRange = range.cloneRange();
  }

  setCaretAt(node, offset = 0) {
    const r = document.createRange();
    r.setStart(node, offset);
    r.collapse(true);
    this.selectRange(r);
  }

  setCaretAfter(node) {
    const r = document.createRange();
    r.setStartAfter(node);
    r.collapse(true);
    this.selectRange(r);
  }

  /** カーソル位置から、編集領域内で selector に一致する最も近い祖先要素 */
  closestAtSelection(selector) {
    const r = this.getRange();
    return r ? this._closest(r.startContainer, selector) : null;
  }

  /** 選択中の画像などの「オブジェクト選択」 */
  get selectedObject() {
    return this.editable.querySelector('[data-formulit-selected]');
  }

  focusEditor() {
    if (this._mode === 'source') return this._sourceArea?.focus();
    const cur = getSelectionRange(this.editable);
    const wasInside = !!cur && this.editable.contains(cur.commonAncestorContainer);
    const had = this.getRange();
    this.editable.focus({ preventScroll: true });
    // 選択が編集領域の外（ツールバーの入力欄など）にあった場合は、最後の選択位置に戻す
    // （Firefox はフォーカス時に選択を先頭へ移すことがある）
    if (!wasInside && had) this.selectRange(had);
  }

  undo() { this._historyStep('undo'); }
  redo() { this._historyStep('redo'); }

  toggleSource(force) {
    const toSource = force ?? this._mode !== 'source';
    if (toSource === (this._mode === 'source')) return;
    if (toSource) {
      this._flushTyping();
      const text = this.value;
      this._sourceText = text;
      this._mode = 'source';
      this.updateComplete.then(() => {
        this._sourceArea.value = text;
        this._sourceArea.focus();
      });
    } else {
      const text = this._sourceArea.value;
      this._mode = 'wysiwyg';
      if (text !== this._sourceText) {
        // ソースで編集した内容を新しい「原文」として採用（履歴には積むので元に戻せる）
        this._setContent(text, { resetHistory: false });
        this._emit('input');
      }
      this.updateComplete.then(() => this.editable.focus());
    }
    this._emit('formulit-mode', { mode: this._mode });
  }

  /**
   * シンプルな入力ダイアログ。
   * fields: [{ name, label, type: 'text'|'url'|'number'|'checkbox'|'select', value, options }]
   * 戻り値: 入力値のオブジェクト（キャンセル時 null）
   */
  openDialog({ title, fields = [], submitLabel = 'OK', wide = false, message = '', content = null, cancel = true }) {
    const saved = this.getRange();
    this._openDropdown = null;
    return new Promise((resolve) => {
      this._dialog = {
        title, fields, submitLabel, wide, message, content, cancel,
        close: (result) => {
          this._dialog = null;
          if (saved) this.selectRange(saved);
          this.editable.focus({ preventScroll: true });
          if (saved) this.selectRange(saved);
          resolve(result);
        },
      };
      this.updateComplete.then(() => this.renderRoot.querySelector('.dialog input:not([type=color]), .dialog select, .dialog textarea, .dialog button.primary')?.focus());
    });
  }

  /* ============ ライフサイクル ============ */

  connectedCallback() {
    super.connectedCallback();
    this._adoptLightStyles();
    if (!this._initialized) {
      this._initialized = true;
      // 初期値: 接続前に設定した value プロパティ > <script type="text/html">（原文を 1 文字も変えずに渡せる）
      //         > <template>（ブラウザが整形する）> value 属性 > 子要素
      if (this._valueSetEarly) {
        this.replaceChildren(this.editable);
        this._initialValue = this._original;
      } else {
        this._readInitialContent();
      }
    }
    this._bindEvents();
    this._cleanups.push(...this._activePlugins().map((p) => p.init?.(this)).filter((f) => typeof f === 'function'));
  }

  /** 子要素・属性から初期値を読み込む（最初の接続時） */
  _readInitialContent() {
    const raw = this.querySelector(':scope > script[type="text/html"]');
    const tpl = this.querySelector(':scope > template');
    let initial = raw
      ? raw.textContent.replace(/<\\\/script/gi, '</script').replace(/^\r?\n/, '').replace(/\s+$/, '')
      : tpl ? tpl.innerHTML : this.getAttribute('value');
    if (initial == null) {
      initial = [...this.childNodes].map((n) => (n.nodeType === 1 ? n.outerHTML : n.nodeType === 3 ? n.data : '')).join('').trim();
    }
    this.replaceChildren(this.editable);
    this._initialValue = initial;
    this._setContent(initial, { resetHistory: true });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._cleanups.splice(0).forEach((f) => f());
    this._observer.disconnect();
  }

  updated(changed) {
    for (const p of this._activePlugins()) if (p.updated) safe(() => p.updated(this, changed));
    for (const key of ['_openDropdown', '_openInner']) {
      if (!changed.has(key)) continue;
      const prev = changed.get(key);
      if (prev && prev !== this[key]) safe(() => this.items[prev]?.onClose?.(this));
      if (this[key]) safe(() => this.items[this[key]]?.onOpen?.(this));
    }
    if (changed.has('readonly') || changed.has('_mode')) {
      this.editable.contentEditable = this.readonly ? 'false' : 'true';
      this.editable.hidden = this._mode === 'source';
    }
    if (changed.has('preserveSource')) { this._version++; this._syncFormValue(); }
    if (changed.has('placeholder')) this.editable.dataset.placeholder = this.placeholder;
    this._sourceArea = this.renderRoot.querySelector('textarea.source');
    const panels = this.renderRoot.querySelectorAll('.panel');
    if (panels.length) {
      const host = this.getBoundingClientRect();
      panels.forEach((panel) => {
        if (panel.getBoundingClientRect().right > Math.max(host.right, window.innerWidth - 8)) panel.classList.add('right');
      });
    }
  }

  formResetCallback() { this.value = this._initialValue; }
  formDisabledCallback(disabled) { this.readonly = disabled; }

  /* ============ 描画 ============ */

  render() {
    return html`
      <div class="toolbar" role="toolbar" part="toolbar">${this._renderToolbar()}</div>
      <div class="body" part="body">
        <slot name="editable"></slot>
        ${this._mode === 'wysiwyg' && !this.readonly ? this._renderOverlays() : nothing}
        <textarea class="source" part="source" spellcheck="false" ?hidden=${this._mode !== 'source'}
          ?readonly=${this.readonly} aria-label="HTMLソース"
          @input=${() => this._syncFormValue()}></textarea>
      </div>
      ${this._renderStatus()}
      ${this._dialog ? this._renderDialog() : nothing}
    `;
  }

  /** ステータスバー（プラグインの status(editor) が返した内容を並べる） */
  _renderStatus() {
    const parts = this._activePlugins().map((p) => (p.status ? safe(() => p.status(this)) : null)).filter((x) => x && x !== nothing);
    return parts.length ? html`<div class="status" part="status">${parts}</div>` : nothing;
  }

  _renderToolbar() {
    return this._renderEntries(this._resolveEntries(this.toolbar ?? this.defaultToolbar, 'group'));
  }

  /**
   * ツールバー定義を描画用に解決する。
   * 要素は 項目名 / '|' / { label, items, icon?, title?, name? }（グループ：ドロップダウンにまとめる）
   */
  _resolveEntries(list, prefix) {
    const items = this.items;
    const out = [];
    for (const [i, e] of (list ?? []).entries()) {
      if (e === '|') {
        if (out.length && !out.at(-1).sep) out.push({ sep: true });
        continue;
      }
      if (e && typeof e === 'object' && Array.isArray(e.items)) {
        const children = this._resolveEntries(e.items, `${prefix}-${i}`);
        if (children.some((c) => !c.sep)) out.push({ group: e, key: groupKey(e, prefix, i), children });
        continue;
      }
      const item = items[e];
      if (item && (!item.visible || safe(() => item.visible(this)))) out.push({ name: e, item });
    }
    while (out.at(-1)?.sep) out.pop();
    return out;
  }

  _renderEntries(entries, opts = {}) {
    return entries.map((x) => {
      if (x.sep) return html`<span class="sep"></span>`;
      if (x.group) return this._renderGroup(x);
      return this._renderItem(x.name, x.item, opts);
    });
  }

  /**
   * グループのアイコン指定を描画用にする。
   *  - 項目名の文字列（'bold' など） → その項目のアイコン
   *  - それ以外の文字列 → HTML としてそのまま描画（開発者が書いた信頼できる値だけを渡すこと）
   *  - Lit のテンプレート / svg テンプレート / DOM ノード → そのまま
   */
  _resolveIcon(icon) {
    if (icon == null || icon === '') return null;
    if (typeof icon === 'string') {
      const item = this.items[icon];
      if (item?.icon) return item.icon;
      return html`<span class="icon">${unsafeHTML(icon)}</span>`;
    }
    return icon;
  }

  /** グループ：ボタン（ラベル▼）を押すと、中の項目を並べたパネルを開く */
  _renderGroup({ group, key, children }) {
    const inSource = this._mode === 'source';
    const leaves = children.filter((c) => c.item);
    const usable = leaves.some((c) => !inSource || c.item.availableInSource);
    const disabled = this.readonly || !usable;
    const open = this._openDropdown === key && !disabled;
    // 中のどれかが押下状態ならグループのボタンも押下表示にする
    const active = !inSource && leaves.some((c) => c.item.active && safe(() => c.item.active(this)));
    const icon = this._resolveIcon(group.icon);
    const label = group.label ?? (icon ? '' : '⋯');
    const title = group.title ?? group.label ?? 'その他';
    const closeAll = () => this.closeDropdown();
    return html`<span class="dd">
      <button type="button" class="group-btn" title=${title} aria-label=${title} aria-haspopup="true"
        aria-expanded=${String(open)} aria-pressed=${String(active)} ?disabled=${disabled} data-group=${key}
        @mousedown=${(e) => e.preventDefault()}
        @click=${() => { this._openInner = null; this._openDropdown = open ? null : key; }}>
        ${icon ?? nothing}${label ? html`<span class="label">${label}</span>` : nothing}<span class="caret">▼</span>
      </button>
      ${open ? html`<div class="panel group" role="toolbar" aria-label=${title} data-panel=${key}
        @mousedown=${(e) => { if (!e.composedPath()[0].matches?.('input,select,textarea,label,option')) e.preventDefault(); }}
        @keydown=${(e) => { if (e.key === 'Escape') { closeAll(); this.focusEditor(); } }}>
        ${this._renderEntries(children, { nested: true, onAction: group.keepOpen ? null : closeAll })}
      </div>` : nothing}
    </span>`;
  }

  _renderItem(name, item, { nested = false, onAction = null } = {}) {
    const inSource = this._mode === 'source';
    const disabled = this.readonly
      || (inSource && !item.availableInSource)
      || (item.enabled ? !safe(() => item.enabled(this)) : false);
    if (item.type === 'select') {
      const current = inSource ? '' : safe(() => item.value?.(this)) ?? '';
      const options = (typeof item.options === 'function' ? safe(() => item.options(this)) : item.options) ?? [];
      const known = options.some((o) => o.value === current);
      return html`<select title=${item.title ?? name} aria-label=${item.title ?? name} ?disabled=${disabled}
        data-item=${name} .value=${current}
        @change=${(e) => { const v = e.target.value; item.action(this, v); onAction?.(); this.requestUpdate(); }}>
        ${!known && current ? html`<option value=${current} selected>${item.formatUnknown?.(current) ?? current}</option>` : nothing}
        ${options.map((o) => html`<option value=${o.value} ?selected=${o.value === current}>${o.label}</option>`)}
      </select>`;
    }
    if (item.type === 'dropdown') {
      // グループの中では _openInner、トップレベルでは _openDropdown で開閉を管理する
      const openKey = nested ? '_openInner' : '_openDropdown';
      const open = this[openKey] === name && !disabled;
      const label = item.label ? safe(() => item.label(this)) : null;
      const close = () => (nested ? this.closeDropdown() : (this._openDropdown = null));
      return html`<span class="dd">
        <button type="button" title=${item.title ?? name} aria-label=${item.title ?? name} aria-haspopup="true"
          aria-expanded=${String(open)} ?disabled=${disabled} data-item=${name}
          @mousedown=${(e) => e.preventDefault()}
          @click=${() => { this[openKey] = open ? null : name; }}>
          ${label != null ? html`<span class="label">${label}</span>` : item.icon ?? item.title ?? name}<span class="caret">▼</span>
        </button>
        ${open ? html`<div class="panel" role="menu" data-panel=${name}
          @mousedown=${(e) => { if (!e.composedPath()[0].matches?.('input,select,textarea,label,option')) e.preventDefault(); }}
          @keydown=${(e) => { if (e.key === 'Escape') { close(); this.focusEditor(); } }}>
          ${item.panel(this, close)}
        </div>` : nothing}
      </span>`;
    }
    const active = !inSource && item.active ? !!safe(() => item.active(this)) : false;
    return html`<button type="button" title=${item.title ?? name} aria-label=${item.title ?? name}
      aria-pressed=${item.active || item.toggle ? String(active) : nothing} ?disabled=${disabled}
      data-item=${name}
      @mousedown=${(e) => e.preventDefault()}
      @click=${() => { item.action(this); onAction?.(); this.requestUpdate(); }}>${item.icon ?? item.title ?? name}</button>`;
  }

  /** 選択中の要素に応じたコンテキストツールバーと、画像のリサイズ枠 */
  _renderOverlays() {
    const body = this.renderRoot?.querySelector('.body');
    if (!body || this._dialog) return nothing;
    const base = body.getBoundingClientRect();
    const out = [];
    if (this._popup) {
      const rect = safe(() => this._popup.rect()) ?? { left: base.left, bottom: base.top };
      const left = Math.max(4, Math.min(rect.left - base.left, base.width - 292));
      out.push(html`<div class="popup" role="listbox" style="left:${left}px;top:${rect.bottom - base.top + 4}px"
        @mousedown=${(e) => e.preventDefault()}>${this._popup.render(this)}</div>`);
    }
    const obj = this.selectedObject;
    if (obj?.localName === 'img' && obj.isConnected) {
      const r = obj.getBoundingClientRect();
      out.push(html`<div class="resize" style="left:${r.left - base.left}px;top:${r.top - base.top}px;width:${r.width}px;height:${r.height}px">
        ${['nw', 'ne', 'sw', 'se'].map((h) => html`<i data-h=${h} @mousedown=${(e) => this._startResize(e, obj, h)}></i>`)}
        ${this._resizing ? html`<b>${Math.round(r.width)} × ${Math.round(r.height)}</b>` : nothing}
      </div>`);
    }
    if (this._resizing) return out;
    for (const p of this._activePlugins()) {
      for (const ctx of p.contextToolbars ?? []) {
        const target = safe(() => ctx.match(this));
        if (!target?.isConnected) continue;
        const r = target.getBoundingClientRect();
        const top = r.top - base.top;
        const above = top > 44;
        const parts = this._resolveEntries(ctx.items, `ctx-${ctx.name}`);
        out.push(html`<div class="ctx ${above ? 'above' : ''}" role="toolbar" data-ctx=${ctx.name}
          style="left:${Math.max(4, Math.min(r.left - base.left, base.width - 320))}px;top:${above ? top : r.bottom - base.top + 6}px">
          ${this._renderEntries(parts)}
        </div>`);
        return out;
      }
    }
    return out;
  }

  _startResize(e, img, handle) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = img.getBoundingClientRect().width;
    const ratio = img.getBoundingClientRect().height / startW || 1;
    const maxW = this.editable.clientWidth;
    const dir = handle.includes('e') ? 1 : -1;
    const hadHeight = img.hasAttribute('height');
    this._flushTyping();
    this._resizing = true;
    const move = (ev) => {
      const w = Math.round(Math.max(16, Math.min(maxW, startW + (ev.clientX - startX) * dir)));
      img.setAttribute('width', String(w));
      if (hadHeight) img.setAttribute('height', String(Math.round(w * ratio)));
      this.requestUpdate();
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      this._resizing = false;
      this.transact(() => {});
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  _renderDialog() {
    const d = this._dialog;
    const submit = (e) => {
      e.preventDefault();
      const form = e.target;
      const values = {};
      for (const f of d.fields) {
        const el = form.elements[f.name];
        values[f.name] = f.type === 'checkbox' ? el.checked : f.type === 'file' ? el.files?.[0] ?? null : el.value.trim?.() ?? el.value;
      }
      d.close(values);
    };
    return html`<div class="overlay" @mousedown=${(e) => e.target === e.currentTarget && d.close(null)}>
      <form class="dialog ${d.wide ? 'wide' : ''}" @submit=${submit} @keydown=${(e) => e.key === 'Escape' && d.close(null)}
        role="dialog" aria-label=${d.title}>
        <h3>${d.title}</h3>
        ${d.message ? html`<p class="msg">${d.message}</p>` : nothing}
        ${d.content ? html`<div class="content">${d.content}</div>` : nothing}
        ${renderFieldGroups(d.fields, (f) => this._renderField(f))}
        <div class="actions">
          ${d.cancel ? html`<button type="button" @click=${() => d.close(null)}>キャンセル</button>` : nothing}
          <button type="submit" class="primary">${d.submitLabel}</button>
        </div>
      </form>
    </div>`;
  }

  _renderField(f) {
    if (f.type === 'textarea') {
      return html`<label><span>${f.label}</span><textarea name=${f.name} spellcheck="false"
        placeholder=${f.placeholder ?? ''} .value=${f.value ?? ''}></textarea></label>`;
    }
    if (f.type === 'color') {
      // 空（指定なし）も表せるよう、テキスト欄 + カラーピッカー
      return html`<label><span>${f.label}</span><div class="color">
        <input name=${f.name} type="text" .value=${f.value ?? ''} placeholder=${f.placeholder ?? '例: #333333（空欄で指定なし）'}>
        <input type="color" aria-label="${f.label}を選ぶ" .value=${/^#[0-9a-f]{6}$/i.test(f.value ?? '') ? f.value : '#000000'}
          @input=${(e) => { e.target.previousElementSibling.value = e.target.value; }}>
      </div></label>`;
    }
    if (f.type === 'checkbox') {
      return html`<label class="check"><input type="checkbox" name=${f.name} ?checked=${!!f.value}><span>${f.label}</span></label>`;
    }
    if (f.type === 'select') {
      return html`<label><span>${f.label}</span><select name=${f.name}>
        ${f.options.map((o) => html`<option value=${o.value} ?selected=${o.value === f.value}>${o.label}</option>`)}
      </select></label>`;
    }
    return html`<label><span>${f.label}</span>
      <input name=${f.name} type=${f.type ?? 'text'} .value=${f.type === 'file' ? '' : f.value ?? ''} placeholder=${f.placeholder ?? ''}
        min=${f.min ?? nothing} ?required=${!!f.required}></label>`;
  }

  /* ============ 内部処理 ============ */

  _activePlugins() {
    return getPlugins(this.plugins);
  }

  _adoptLightStyles() {
    const root = this.getRootNode();
    if (!root || styledRoots.has(root) || !('adoptedStyleSheets' in root)) return;
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, lightSheet];
    styledRoots.add(root);
  }

  _setContent(htmlString, { resetHistory }) {
    this._observer.disconnect();
    const frag = this._loadContent(htmlString);
    this.editable.replaceChildren(frag);
    this._original = htmlString;
    // サニタイズで何か除去したら、原文ではなく除去後の DOM を value とする
    this._version++;
    this._sanitizedOnLoad = frag.formulitRemoved > 0;
    this._dirty = this._sanitizedOnLoad;
    if (resetHistory) this.history.reset();
    else this.history.record();
    this._cleanIndex = this.history.index;
    this._lastRange = null;
    this._observe();
    this._updateEmpty();
    this._syncFormValue();
    this.requestUpdate();
  }

  /**
   * 文字列を編集用の DocumentFragment にする（継承した要素で、HTML 以外の形式を読み込むために差し替えられる）。
   * frag.formulitRemoved にサニタイズで除去した数を入れること。
   */
  _loadContent(text) {
    return load(text, this.loadOptions());
  }

  _observe() {
    this._observer.observe(this.editable, {
      subtree: true, childList: true, characterData: true, attributes: true,
    });
  }

  _onMutations(records) {
    // エディタ内部用の属性（選択表示など）の変化は「変更」とみなさない
    // 変更されたノードを記録（部分的な原文保持用）。編集領域自体の属性や内部属性の変化は本文ではないので無視
    let real = false;
    for (const r of records) if (recordMutation(r, this.editable)) real = true;
    if (!real) return;
    this._unrecorded = true;
    this._version++;
    this._dirty = true;
    this._updateEmpty();
    this._syncFormValue();
  }

  _afterChange() {
    this._onMutations(this._observer.takeRecords());
    this.history.record();
    this._emit('input');
    this.requestUpdate();
  }

  _historyStep(dir) {
    if (this._mode === 'source') return;
    this._flushTyping();
    if (!this.history[dir]()) return;
    this._observer.takeRecords();
    this._version++;
    this._dirty = this.history.index !== this._cleanIndex || this._sanitizedOnLoad;
    this._updateEmpty();
    this._syncFormValue();
    this._emit('input');
    this.requestUpdate();
  }

  _flushTyping() {
    clearTimeout(this._typingTimer);
    this._typingTimer = null;
    this._onMutations(this._observer.takeRecords());
    this.history.record();
  }

  /**
   * Chrome / Safari は空の編集領域に入力すると 1 行目を <p> で囲まないため、
   * 空のときは <p><br></p> を用意してカーソルを入れる（見た目上の変更なので dirty にはしない）
   */
  _ensureParagraph() {
    if (this.readonly || !this._isBlank()) return false;
    const ed = this.editable;
    this._observer.takeRecords();
    this._observer.disconnect();
    const p = document.createElement('p');
    p.append(document.createElement('br'));
    ed.replaceChildren(p);
    this._observe();
    if (!this._dirty) this.history.amend();
    this.setCaretAt(p, 0);
    return true;
  }

  /** テキストも画像等も無い（<br> だけ・空の <p> だけも含む）状態 */
  _isBlank() {
    const ed = this.editable;
    if (ed.innerHTML === '<p><br></p>') return false; // 既に段落がある
    // 空白テキスト・<br>・属性なしで中身が <br> だけの <p>/<div> 以外が 1 つでもあれば空ではない
    // （コメントや空の独自要素なども消さないよう厳密に判定する）
    const trivial = (n) => (n.nodeType === 3 && !n.data.trim())
      || (n.nodeType === 1 && n.localName === 'br' && !n.attributes.length)
      || (n.nodeType === 1 && (n.localName === 'p' || n.localName === 'div') && !n.attributes.length
        && [...n.childNodes].every((c) => (c.nodeType === 3 && !c.data.trim()) || (c.nodeType === 1 && c.localName === 'br')));
    return [...ed.childNodes].every(trivial);
  }

  _updateEmpty() {
    if (!this.placeholder) { this.editable.classList.remove('formulit-empty'); return; }
    // 要素が 2 つ以上あれば空ではない（大きな文書で毎回 textContent を作らないように）
    const empty = this.editable.childElementCount <= 1 && !this.editable.textContent.trim()
      && !this.editable.querySelector('img,table,hr,iframe,video,audio,svg,object,embed,input,[contenteditable=false]');
    this.editable.classList.toggle('formulit-empty', empty && !!this.placeholder);
  }

  /**
   * フォームに渡す値を更新する。書き出しに時間がかかる大きな文書では、入力のたびに
   * 行うと重くなるので少し遅らせる（送信・フォーカスアウト時には必ず最新にする）。
   */
  _syncFormValue({ now = false } = {}) {
    if (!this._internals?.setFormValue) return;
    clearTimeout(this._formTimer);
    if (!now && this._slowSerialize) {
      this._formTimer = setTimeout(() => this._syncFormValue({ now: true }), 250);
      return;
    }
    const t0 = performance.now();
    this._internals.setFormValue(this.value);
    this._slowSerialize = performance.now() - t0 > 12;
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
  }

  _closest(node, selector) {
    let el = node?.nodeType === 1 ? node : node?.parentElement;
    const found = el?.closest(selector);
    return found && this.editable.contains(found) && found !== this.editable ? found : null;
  }

  _bindEvents() {
    const ed = this.editable;
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this._cleanups.push(() => target.removeEventListener(type, fn, opts));
    };

    on(ed, 'focus', () => {
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand('styleWithCSS', false, false);
      this._focusValue = this.value;
      this._ensureParagraph();
    });
    // 送信時は遅延中の値を確定させる（submit イベントはフォームデータ作成より前に発火する）
    const form = this._internals?.form;
    if (form) on(form, 'submit', () => this._syncFormValue({ now: true }), true);
    on(ed, 'blur', () => {
      this._flushTyping();
      this._syncFormValue({ now: true });
      if (this.value !== this._focusValue) this._emit('change');
    });

    // ネイティブの input をホスト要素から出し直す（event.target を <formulit-editor> にする）
    on(ed, 'input', (e) => {
      e.stopPropagation();
      clearTimeout(this._typingTimer);
      this._typingTimer = setTimeout(() => this._flushTyping(), 400);
      this._lastInputAt = performance.now();
      this._emit('input');
      this._scheduleUi();
    });

    // 独自の履歴を使うため、ブラウザ標準の undo は横取りする
    on(ed, 'beforeinput', (e) => {
      // 空の状態での最初の 1 文字は自前で <p> の中に入れる
      // （beforeinput 中に DOM を差し替えると Safari は元の位置に入力してしまうため）
      if (e.inputType === 'insertText' && e.data && !e.isComposing && this._ensureParagraph()) {
        e.preventDefault();
        const p = ed.firstChild;
        p.replaceChildren(document.createTextNode(e.data));
        this.setCaretAt(p.firstChild, e.data.length);
        this._onMutations(this._observer.takeRecords());
        ed.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: e.data, bubbles: true }));
        return;
      }
      // 範囲選択なしで設定した書式を、次に入力した文字に適用する
      if (e.inputType === 'insertText' && e.data && !e.isComposing && this._pendingValid()) {
        e.preventDefault();
        const ops = this._pending.ops;
        this._pending = null;
        const range = this.getRange();
        range.deleteContents();
        this.selectRange(insertStyledText(range, this.editable, ops, e.data));
        this._onMutations(this._observer.takeRecords());
        ed.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: e.data, bubbles: true }));
        return;
      }
      if (e.inputType === 'historyUndo') { e.preventDefault(); this.undo(); }
      if (e.inputType === 'historyRedo') { e.preventDefault(); this.redo(); }
    });

    on(ed, 'keydown', (e) => this._onKeydown(e));
    on(ed, 'paste', (e) => this._onPaste(e));

    // 画像などのオブジェクト選択
    on(ed, 'mousedown', (e) => {
      let prot = e.target.closest?.('[contenteditable=false]');
      if (prot?.localName === 'input') prot = null;
      const target = e.target.closest?.('img') ?? (prot && prot !== ed ? prot : null);
      this.editable.querySelectorAll('[data-formulit-selected]').forEach((el) => el.removeAttribute('data-formulit-selected'));
      if (target && ed.contains(target)) {
        target.setAttribute('data-formulit-selected', '');
        requestAnimationFrame(() => {
          // ダイアログなどにフォーカスが移った後で選択を変えると、Chrome は編集領域へフォーカスを戻してしまう
          if (this._dialog || activeElementOf(this.editable) !== this.editable) { this.requestUpdate(); return; }
          const r = document.createRange();
          r.selectNode(target);
          this.selectRange(r);
          this.requestUpdate();
        });
      }
    });

    // ドロップダウンの外をクリックしたら閉じる
    on(document, 'mousedown', (e) => {
      if (!this._openDropdown) return;
      const panelOrButton = e.composedPath().some((n) => n.classList?.contains('dd'));
      if (!panelOrButton) this.closeDropdown();
    }, true);

    // 範囲選択なしで設定した書式（文字色など）を、日本語入力の確定文字に適用する
    on(ed, 'compositionstart', () => {
      this._composePending = this._pendingValid() ? this._pending.ops : null;
    });
    on(ed, 'compositionend', (e) => {
      const ops = this._composePending;
      this._composePending = null;
      if (!ops || !e.data) return;
      setTimeout(() => {
        const r = this.getRange();
        const t = r?.startContainer;
        if (!r?.collapsed || t?.nodeType !== 3 || r.startOffset < e.data.length) return;
        if (t.data.slice(r.startOffset - e.data.length, r.startOffset) !== e.data) return;
        const target = document.createRange();
        target.setStart(t, r.startOffset - e.data.length);
        target.setEnd(t, r.startOffset);
        this.transact(() => {
          const covered = applyOps(target, this.editable, ops);
          covered.collapse(false);
          this.selectRange(covered);
          this._pending = null;
        });
      });
    });

    on(window, 'resize', () => this.requestUpdate());
    on(ed, 'load', () => this.requestUpdate(), true);

    // 入力で内容が変わる直前のカーソル位置を、元に戻したときの位置として覚える
    on(ed, 'beforeinput', () => { if (!this._unrecorded) this.history.noteSelection({ verify: false }); });

    on(document, 'selectionchange', () => {
      const r = getSelectionRange(ed);
      if (!r || !ed.contains(r.commonAncestorContainer)) return;
      this._lastRange = r.cloneRange();
      // 入力の途中でなければ、元に戻したときに戻るカーソル位置として覚える
      if (!this._unrecorded) this.history.noteSelection({ verify: false });
      this._scheduleUi({ selection: true });
    });
  }

  _onKeydown(e) {
    // 日本語入力などの変換中のキー（Enter での確定、Tab など）はショートカットとして扱わない
    if (e.isComposing || e.keyCode === 229) return;
    const key = keyString(e);
    if (key === 'Mod-z') { e.preventDefault(); return this.undo(); }
    if (key === 'Mod-Shift-z' || key === 'Mod-y') { e.preventDefault(); return this.redo(); }
    const items = this.items;
    for (const p of this._activePlugins()) {
      const target = p.keymap?.[key];
      if (!target) continue;
      // 関数が false を返したら「処理しなかった」とみなしブラウザ既定動作に任せる
      const handled = typeof target === 'function' ? target(this, e) : (items[target]?.action(this), true);
      if (handled === false) continue;
      e.preventDefault();
      this.requestUpdate();
      return;
    }
    // 選択中の画像を Delete/Backspace で削除
    const obj = this.selectedObject;
    if (obj && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      this.transact(() => { const p = obj.parentNode; const i = [...p.childNodes].indexOf(obj); obj.remove(); this.setCaretAt(p, i); });
    }
  }

  _onPaste(e) {
    if (e.defaultPrevented) return;
    const data = e.clipboardData;
    const htmlData = data?.getData('text/html');
    if (!htmlData) return; // プレーンテキストはブラウザに任せる
    e.preventDefault();
    this.insertHTML(cleanPastedHTML(htmlData));
  }
}

/* ============ ヘルパー ============ */

function groupKey(group, prefix, index) {
  return group.name ? `group:${group.name}` : `${prefix}-${index}`;
}

function sameOpTarget(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'style') return a.prop === b.prop;
  return a.tag === b.tag && (a.classes ?? []).join() === (b.classes ?? []).join();
}

/** 連続する half: true のフィールドを 2 列にまとめる */
function renderFieldGroups(fields, render) {
  const out = [];
  let group = [];
  const flush = () => { if (group.length) { out.push(html`<div class="cols">${group.map(render)}</div>`); group = []; } };
  for (const f of fields) {
    if (f.half) group.push(f);
    else { flush(); out.push(render(f)); }
  }
  flush();
  return out;
}

function safe(fn) {
  try { return fn(); } catch { return undefined; }
}

function wrapFragment(node) {
  const f = document.createDocumentFragment();
  f.append(node);
  return f;
}

function isEmptyBlock(el) {
  return !el.textContent.trim() && !el.querySelector('img,table,hr,iframe,video,audio,svg,object,embed,input,[contenteditable=false]');
}

function keyString(e) {
  const parts = [];
  if (IS_MAC ? e.metaKey : e.ctrlKey) parts.push('Mod');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  return parts.join('-');
}

/** 他アプリから貼り付けた HTML の付帯物だけを落とす（本文のタグ・属性は残す） */
export function cleanPastedHTML(src) {
  const m = src.match(/<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/);
  let s = m ? m[1] : src.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(meta|link|title)\b[^>]*>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?o:p>/gi, '');
  return stripCopiedStyles(s);
}

/**
 * Chrome / Safari はページからコピーすると、見た目を再現するため計算済みスタイルを
 * style 属性に書き込む（orphans / widows / -webkit-text-stroke-width など手書きでは使わないプロパティを含む）。
 * その「署名」を含む style 属性だけを取り除き、属性が無くなった span は外す。
 * class・data-* や、手書きの style（署名を含まないもの）はそのまま残す。
 * ※ コピー元の style はブラウザが計算済みスタイルと混ぜてしまうため区別できず、一緒に除去される。
 *   手書き HTML を正確に持ち込みたい場合はソース表示に貼り付ける。
 */
const COPY_STYLE_SIGNATURE = /(^|;)\s*(orphans|widows|-webkit-text-stroke-width|font-variant-caps)\s*:/i;
export function stripCopiedStyles(htmlString) {
  const t = document.createElement('template');
  t.innerHTML = htmlString;
  const root = t.content;
  root.querySelectorAll('[style]').forEach((el) => {
    if (COPY_STYLE_SIGNATURE.test(el.getAttribute('style'))) el.removeAttribute('style');
  });
  // Safari の空白保持用 span
  root.querySelectorAll('span.Apple-converted-space').forEach((el) => el.replaceWith(el.textContent.replace(/\u00a0/g, ' ')));
  // 属性の無い span はコピー時に付いた入れ物なので外す（内側から処理）
  [...root.querySelectorAll('span')].reverse().forEach((el) => {
    if (el.attributes.length) return;
    // Chrome は区切りの空白を <span>&nbsp;</span> で包むので通常の空白に戻す
    if (!el.children.length && /^[\s\u00a0]+$/.test(el.textContent)) el.replaceWith(' ');
    else el.replaceWith(...el.childNodes);
  });
  root.normalize();
  return t.innerHTML;
}
