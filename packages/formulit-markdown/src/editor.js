import { FormulitEditor, load, serialize, setNodeData, getNodeData, isNodeUnchanged } from '@hidemikimura/formulit';
import { createMarkdownIt, parseBlocks } from './parse.js';
import { blocksOf, detectStyle, DEFAULT_STYLE, nodesToMarkdown } from './serialize.js';
import { adoptMarkdownStyles } from './styles.js';

/** Markdown で表せる機能だけを並べた既定のツールバー */
export const MARKDOWN_TOOLBAR = [
  'undo', 'redo', 'findReplace', '|',
  'format', '|',
  'bold', 'italic', 'strike', 'code', '|',
  'ul', 'ol', 'todoList', '|',
  'link', 'unlink', 'image', 'table', 'codeBlock', 'quote', 'hr', 'variable', '|',
  'source', 'fullscreen', 'shortcuts',
];

const isBlankText = (n) => n.nodeType === 3 && !/[^\s]/.test(n.data);
/** 空のエディタで置かれる段落（<p><br></p>）か */
const isPlaceholder = (n) => n.nodeType === 1 && n.localName === 'p' && !n.textContent.trim()
  && [...n.childNodes].every((c) => isBlankText(c) || c.localName === 'br');
const defsOf = (gap) => gap.split('\n').filter((l) => l.trim()).join('\n');

/** 原文のブロックがリストなら、その種類（続くリストと混ざらないようにするため） */
function listOf(text) {
  let m = /^ {0,3}([-*+])[ \t]/.exec(text);
  if (m) return { ordered: false, delim: m[1] };
  m = /^ {0,3}\d{1,9}([.)])[ \t]/.exec(text);
  return m ? { ordered: true, delim: m[1] } : null;
}

/** 共通の字下げを取る（HTML の中に書いた Markdown は字下げされていることが多いため） */
export function dedent(text) {
  const lines = text.replace(/^\r?\n/, '').replace(/\s+$/, '').split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)[0].length);
  const n = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(Math.min(n, /^[ \t]*/.exec(l)[0].length))).join('\n');
}

/** 貼り付けた文字が Markdown らしいか */
const MD_BLOCK = /^ {0,3}(#{1,6}\s|[-*+]\s|\d{1,9}[.)]\s|>|```|~~~|\|.*\||[-*_]{3,}\s*$)/m;
const MD_INLINE = /\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|!?\[[^\]\n]*\]\([^)\n]+\)/;

/**
 * <formulit-markdown>：見たまま編集して、value は Markdown（GFM）。
 * formulit（<formulit-editor>）のツールバー・プラグイン・入力補助をそのまま使う。
 *
 * - 未編集なら読み込んだ Markdown を 1 文字も変えずに返す
 * - 編集後も、触っていないブロックは原文のまま返し、編集したブロックだけ書き直す
 * - Markdown で表せない書式（文字色など）は HTML のまま Markdown の中に残す
 */
export class FormulitMarkdown extends FormulitEditor {
  static properties = {
    /** markdown-it のオプション（{ linkify: false } など）。読み込み直したときから効く */
    markdownOptions: { attribute: false },
  };

  /* クラスのフィールドは使わない（親のコンストラクタから _loadContent が呼ばれることがあるため） */
  get _mdi() {
    if (!this.__mdi || this.__mdiOptions !== this.markdownOptions) {
      this.__mdiOptions = this.markdownOptions;
      this.__mdi = createMarkdownIt(this.markdownOptions ?? {});
    }
    return this.__mdi;
  }

  get defaultToolbar() { return MARKDOWN_TOOLBAR; }

  /** Markdown → 編集用の DOM。ブロックごとに、原文のどの部分から来たかを記録する */
  _loadContent(markdown) {
    const { groups, trail } = parseBlocks(markdown, this._mdi);
    const doc = { groups: [], trail, style: detectStyle(markdown) };
    const frag = document.createDocumentFragment();
    let removed = 0;
    groups.forEach((g, i) => {
      const f = load(g.html, this.loadOptions());
      removed += f.formulitRemoved;
      const nodes = [...f.childNodes];
      const content = nodes.filter((n) => !isBlankText(n));
      for (const n of content) setNodeData(n, { mdDoc: doc, mdGroup: i });
      doc.groups.push({ text: g.text, gap: g.gap, count: content.length });
      frag.append(...nodes);
    });
    frag.formulitRemoved = removed;
    this._mdDoc = doc;
    return frag;
  }

  /** 編集領域 → Markdown。変更のないブロックは原文を使う */
  _serializePreserving() {
    const doc = this._mdDoc ?? { groups: [], trail: '', style: DEFAULT_STYLE };
    // 書き直すブロックが原文のリストから来ていれば、元の記号を使う
    const ctx = {
      style: doc.style,
      hintFor: (el) => {
        const d = getNodeData(el);
        return d?.mdDoc === doc ? listOf(doc.groups[d.mdGroup].text) : null;
      },
    };
    let nodes = [...this.editable.childNodes].filter((n) => !isBlankText(n));
    if (nodes.every(isPlaceholder)) nodes = [];
    const keep = this.preserveSource !== false;

    // 1. 原文のまま使えるブロックと、書き直すブロックに分ける
    const items = [];
    const used = new Set();
    let pending = [];
    const flush = () => {
      for (const b of blocksOf(pending, ctx)) if (b?.text) items.push(b);
      pending = [];
    };
    for (let k = 0; k < nodes.length;) {
      const d = keep ? getNodeData(nodes[k]) : null;
      const g = d?.mdDoc === doc ? doc.groups[d.mdGroup] : null;
      if (g && !used.has(d.mdGroup)) {
        const run = nodes.slice(k, k + g.count);
        const intact = run.length === g.count && run.every((n) => {
          const dd = getNodeData(n);
          return dd?.mdDoc === doc && dd.mdGroup === d.mdGroup && isNodeUnchanged(n);
        });
        if (intact) {
          flush();
          items.push({ text: g.text, orig: d.mdGroup, list: listOf(g.text) });
          used.add(d.mdGroup);
          k += g.count;
          continue;
        }
      }
      if (!isPlaceholder(nodes[k])) pending.push(nodes[k]);
      k++;
    }
    flush();

    // 2. 同じ種類のリストが隣り合うと 1 つのリストになってしまうので、書き直した側の記号を変える
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1];
      const b = items[i];
      if (!a.list || !b.list || a.list.ordered !== b.list.ordered || a.list.delim !== b.list.delim) continue;
      if (a.orig != null && b.orig === a.orig + 1) continue; // 原文でも隣同士（元から別のリスト）
      if (b.relist) b.text = b.relist(a.list);
      else if (a.relist && !(items[i - 2]?.list)) a.text = a.relist(b.list);
    }

    if (!items.length) return '';

    // 3. つなぐ。原文で隣だったブロックの間は原文の空行・参照定義をそのまま使う
    let out = '';
    let prev = null;
    let lastOrig = -1;
    const emittedGap = new Set();
    for (const item of items) {
      let sep;
      if (item.orig != null && (prev ? prev.orig === item.orig - 1 : item.orig === 0)) {
        sep = doc.groups[item.orig].gap;
        emittedGap.add(item.orig);
      } else {
        // 消えたブロックの前にあった参照定義も、ここで出す
        const from = item.orig != null ? lastOrig + 1 : null;
        const defs = item.orig == null ? '' : doc.groups.slice(from, item.orig + 1)
          .map((g, j) => (emittedGap.has(from + j) ? '' : defsOf(g.gap))).filter(Boolean).join('\n');
        if (item.orig != null) for (let j = from; j <= item.orig; j++) emittedGap.add(j);
        sep = (prev ? '\n\n' : '') + (defs ? `${defs}\n\n` : '');
      }
      out += sep + item.text;
      prev = item;
      if (item.orig != null) lastOrig = Math.max(lastOrig, item.orig);
    }
    // 消えたブロックの前にあった参照定義（[名前]: URL）は残す
    const lost = doc.groups.map((g, i) => (emittedGap.has(i) ? '' : defsOf(g.gap))).filter(Boolean);
    if (prev && prev.orig === doc.groups.length - 1 && !lost.length) {
      out += doc.trail;
    } else {
      const defs = [...lost, defsOf(doc.trail)].filter(Boolean).join('\n');
      if (defs) out += (out ? '\n\n' : '') + defs;
      if (/\n$/.test(doc.trail) && out) out += '\n';
    }
    return out;
  }

  /** 子要素から初期値を読む: <script type="text/markdown"> > <template> > value 属性 > 子の文字 */
  _readInitialContent() {
    const raw = this.querySelector(':scope > script[type="text/markdown"]');
    const tpl = this.querySelector(':scope > template');
    let initial;
    if (raw) initial = dedent(raw.textContent.replace(/<\\\/script/gi, '</script'));
    else if (tpl) initial = dedent(tpl.content.textContent);
    else if (this.hasAttribute('value')) initial = this.getAttribute('value');
    else initial = dedent(this.textContent);
    this.replaceChildren(this.editable);
    this._initialValue = initial;
    this._setContent(initial, { resetHistory: true });
  }

  /** Markdown の文字を貼り付けたら、書式付きで入れる（コードブロックの中では文字のまま） */
  _onPaste(e) {
    if (e.defaultPrevented) return;
    const data = e.clipboardData;
    const text = data?.getData('text/plain');
    if (!data?.getData('text/html') && text && !this.closestAtSelection('pre, code') && (MD_BLOCK.test(text) || MD_INLINE.test(text))) {
      e.preventDefault();
      const block = /\n/.test(text.trim()) || MD_BLOCK.test(text);
      this.insertHTML(block ? this._mdi.render(text) : this._mdi.renderInline(text));
      return;
    }
    super._onPaste(e);
  }

  /** 選択範囲の Markdown（コピーしたときの text/plain にも使う） */
  getSelectionMarkdown() {
    const r = this.getRange();
    if (!r || r.collapsed) return '';
    const frag = r.cloneContents();
    return nodesToMarkdown([...frag.childNodes], this._mdDoc?.style ?? DEFAULT_STYLE);
  }

  connectedCallback() {
    super.connectedCallback();
    adoptMarkdownStyles(this);
    if (this._mdCopyBound) return;
    this._mdCopyBound = true;
    // コピーした文字（text/plain）を Markdown にする。HTML（text/html）はそのまま
    this.editable.addEventListener('copy', (e) => {
      if (this._mode === 'source' || !e.clipboardData) return;
      const md = this.getSelectionMarkdown();
      if (!md) return;
      const r = this.getRange();
      const box = document.createElement('div');
      box.append(r.cloneContents());
      e.preventDefault();
      e.clipboardData.setData('text/plain', md);
      e.clipboardData.setData('text/html', serialize(box));
    });
  }
}
