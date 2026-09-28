import { html, nothing } from 'lit';
import { icons } from '../icons.js';

/**
 * コードブロック：<pre><code class="language-xxx">…</code></pre>
 *  - Enter は改行（ブロックを分けない）。末尾で Enter を 3 回押すとブロックを抜ける
 *  - Tab / Shift+Tab でインデント・インデント解除（複数行にも対応）
 *  - 貼り付けはプレーンテキストとして挿入
 */
export const DEFAULT_CODE_LANGUAGES = [
  { value: 'plaintext', label: 'テキスト' },
  { value: 'html', label: 'HTML' }, { value: 'css', label: 'CSS' },
  { value: 'javascript', label: 'JavaScript' }, { value: 'typescript', label: 'TypeScript' },
  { value: 'json', label: 'JSON' }, { value: 'xml', label: 'XML' }, { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' }, { value: 'sql', label: 'SQL' }, { value: 'bash', label: 'Bash' },
  { value: 'java', label: 'Java' }, { value: 'kotlin', label: 'Kotlin' }, { value: 'python', label: 'Python' },
  { value: 'php', label: 'PHP' }, { value: 'ruby', label: 'Ruby' }, { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' }, { value: 'c', label: 'C' }, { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' }, { value: 'swift', label: 'Swift' },
];
const INDENT = '\t';

const languages = (ed) => ed.codeBlockLanguages ?? DEFAULT_CODE_LANGUAGES;
const preAt = (ed) => ed.closestAtSelection('pre');
const codeOf = (pre) => pre.querySelector(':scope > code') ?? pre;
function languageOf(pre) {
  const m = codeOf(pre).className.match(/(?:^|\s)language-([\w+#-]+)/);
  return m ? m[1] : '';
}

/** ブロックのテキスト（<br> は改行として） */
function blockText(el) {
  const c = el.cloneNode(true);
  c.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  return c.textContent.replace(/\n$/, '');
}

function setLanguage(code, lang) {
  [...code.classList].filter((c) => c.startsWith('language-')).forEach((c) => code.classList.remove(c));
  if (lang) code.classList.add(`language-${lang}`);
  if (!code.classList.length) code.removeAttribute('class');
}

export function toCodeBlock(ed, lang) {
  ed.transact(() => {
    const pre = preAt(ed);
    if (pre) {
      // 既存のコードブロックは言語だけ変える
      let code = pre.querySelector(':scope > code');
      if (!code) { code = document.createElement('code'); code.append(...pre.childNodes); pre.append(code); }
      setLanguage(code, lang);
      return;
    }
    const blocks = ed.selectedBlocks().filter((b) => b.matches('p,h1,h2,h3,h4,h5,h6,div') && !b.querySelector('p,div,table,ul,ol'));
    const newPre = document.createElement('pre');
    const code = document.createElement('code');
    setLanguage(code, lang);
    newPre.append(code);
    code.textContent = blocks.map(blockText).join('\n');
    if (blocks.length) {
      blocks[0].replaceWith(newPre);
      blocks.slice(1).forEach((b) => b.remove());
    } else {
      ed.insertNodesAtSelection(newPre);
    }
    if (!code.textContent) {
      // 空のコードブロックはカーソルを置けるよう <br> を入れる（入力後に取り除く）
      code.append(document.createElement('br'));
      ed.setCaretAt(code, 0);
    } else {
      const t = code.firstChild;
      ed.setCaretAt(t, t.length);
    }
  });
}

function fromCodeBlock(ed) {
  const pre = preAt(ed);
  if (!pre) return;
  ed.transact(() => {
    const lines = codeOf(pre).textContent.replace(/\n$/, '').split('\n');
    const ps = lines.map((line) => {
      const p = document.createElement('p');
      if (line) p.textContent = line; else p.append(document.createElement('br'));
      return p;
    });
    pre.replaceWith(...ps);
    ed.setCaretAt(ps[0], 0);
  });
}

/* ---------- テキスト位置での編集（中身がテキストだけのコードブロック用） ---------- */

function offsets(code, range) {
  const pre = document.createRange();
  pre.selectNodeContents(code);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  return [start, start + range.toString().length];
}

function setTextAndSelect(ed, code, text, start, end = start) {
  code.textContent = text;
  const t = code.firstChild ?? code.appendChild(document.createTextNode(''));
  const r = document.createRange();
  r.setStart(t, Math.min(start, t.length));
  r.setEnd(t, Math.min(end, t.length));
  ed.selectRange(r);
}

const textOnly = (code) => code.childElementCount === 0;

function onEnter(ed) {
  const pre = preAt(ed);
  if (!pre) return false;
  const code = codeOf(pre);
  ed.transact(() => {
    const range = ed.getRange(true);
    if (!textOnly(code)) {
      range.deleteContents();
      const nl = document.createTextNode('\n');
      range.insertNode(nl);
      ed.setCaretAfter(nl);
      return;
    }
    const [s, e] = offsets(code, range);
    let text = code.textContent;
    const before = text.slice(0, s);
    const after = text.slice(e);
    // 末尾で空行が 2 つ続いた状態で Enter → ブロックを抜ける
    if (before.endsWith('\n\n') && (after === '' || after === '\n')) {
      code.textContent = before.slice(0, -2);
      const p = document.createElement('p');
      p.append(document.createElement('br'));
      pre.after(p);
      ed.setCaretAt(p, 0);
      return;
    }
    text = `${before}\n${after}`;
    // 末尾の空行を表示させるため、最後が改行で終わるときはもう 1 つ入れておく（表示上は現れない）
    if (after === '') text += '\n';
    setTextAndSelect(ed, code, text, s + 1);
  });
  return true;
}

function onTab(ed, e) {
  const pre = preAt(ed);
  if (!pre) return false;
  const code = codeOf(pre);
  ed.transact(() => {
    const range = ed.getRange(true);
    if (!textOnly(code)) {
      if (!e.shiftKey) { range.deleteContents(); const t = document.createTextNode(INDENT); range.insertNode(t); ed.setCaretAfter(t); }
      return;
    }
    const [s, e2] = offsets(code, range);
    const text = code.textContent;
    const lineStart = text.lastIndexOf('\n', s - 1) + 1;
    if (!e.shiftKey && s === e2) {
      setTextAndSelect(ed, code, text.slice(0, s) + INDENT + text.slice(s), s + INDENT.length);
      return;
    }
    // 選択範囲にかかる各行の先頭をインデント／解除
    const block = text.slice(lineStart, e2);
    const lines = block.split('\n');
    let delta0 = 0;
    let total = 0;
    const out = lines.map((line, i) => {
      if (!e.shiftKey) { if (i === 0) delta0 = INDENT.length; total += INDENT.length; return INDENT + line; }
      const m = line.match(/^(\t| {1,4})/);
      const n = m ? m[1].length : 0;
      if (i === 0) delta0 = -n;
      total -= n;
      return line.slice(n);
    }).join('\n');
    const next = text.slice(0, lineStart) + out + text.slice(e2);
    setTextAndSelect(ed, code, next, Math.max(lineStart, s + delta0), e2 + total);
  });
  return true;
}

export const codeBlockPlugin = {
  name: 'codeBlock',
  items: {
    codeBlock: {
      type: 'dropdown', title: 'コードブロック', icon: icons.codeBlock,
      active: (ed) => !!preAt(ed),
      panel: (ed, close) => {
        const pre = preAt(ed);
        const cur = pre ? languageOf(pre) : null;
        return html`<div class="menu">
          ${languages(ed).map((l) => html`<button role="menuitemradio" aria-checked=${String(cur === l.value)} data-lang=${l.value}
            @click=${() => { toCodeBlock(ed, l.value); close(); }}>${l.label}</button>`)}
          ${pre ? html`<button data-lang="" @click=${() => { fromCodeBlock(ed); close(); }}>コードブロックを解除</button>` : nothing}
        </div>`;
      },
    },
  },
  keymap: {
    Enter: onEnter,
    Tab: onTab,
    'Shift-Tab': onTab,
  },
  init(ed) {
    // 空のときに入れた <br> は、文字が入ったら取り除く
    const onInput = () => {
      const pre = preAt(ed);
      const code = pre && codeOf(pre);
      if (!code || code.childElementCount !== 1 || code.lastChild?.nodeName !== 'BR' || !code.textContent) return;
      const r = ed.getRange();
      code.lastChild.remove();
      if (r) try { ed.selectRange(r); } catch { /* noop */ }
    };
    ed.editable.addEventListener('input', onInput);
    // コードブロック内の貼り付けはプレーンテキストで
    const onPaste = (e) => {
      if (e.defaultPrevented || !preAt(ed)) return;
      const text = e.clipboardData?.getData('text/plain');
      if (text == null) return;
      e.preventDefault();
      ed.transact(() => {
        const r = ed.getRange(true);
        r.deleteContents();
        const t = document.createTextNode(text.replace(/\r\n?/g, '\n'));
        r.insertNode(t);
        ed.setCaretAfter(t);
      });
    };
    ed.editable.addEventListener('paste', onPaste, true);
    return () => {
      ed.editable.removeEventListener('paste', onPaste, true);
      ed.editable.removeEventListener('input', onInput);
    };
  },
};
