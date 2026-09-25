import { icons } from '../icons.js';

const PARAGRAPH_LIKE = 'p,h1,h2,h3,h4,h5,h6,pre';

const cmd = (command, icon, title, extra = {}) => ({
  icon, title,
  action: (ed) => ed.exec(command),
  active: (ed) => ed.queryState(command),
  ...extra,
});

/** 引用ブロックの切り替え（formatBlock はブラウザ差が大きいので自前実装） */
/**
 * Chrome は段落内で箇条書きにすると <p><ul>…</ul></p> を作ってしまうため、
 * 段落の中身がリストだけなら段落を外す（カーソル位置は保つ）。
 */
export function unwrapListsFromParagraphs(ed) {
  const r = ed.getRange();
  const saved = r && [r.startContainer, r.startOffset, r.endContainer, r.endOffset];
  let changed = false;
  ed.editable.querySelectorAll('p > ul, p > ol').forEach((list) => {
    const p = list.parentElement;
    const others = [...p.childNodes].filter((n) => n !== list && !(n.nodeType === 3 && !n.data.trim()) && n.nodeName !== 'BR');
    if (others.length) return;
    p.replaceWith(list);
    changed = true;
  });
  if (changed && saved) {
    try {
      const nr = document.createRange();
      nr.setStart(saved[0], saved[1]);
      nr.setEnd(saved[2], saved[3]);
      ed.selectRange(nr);
    } catch { /* 復元できなければそのまま */ }
  }
}

export function listCommand(ed, command) {
  return ed.transact(() => {
    document.execCommand(command);
    unwrapListsFromParagraphs(ed);
  });
}

export function toggleQuote(ed) {
  ed.transact(() => {
    const quote = ed.closestAtSelection('blockquote');
    const range = ed.getRange(true);
    if (quote) {
      const first = quote.firstChild;
      quote.replaceWith(...quote.childNodes);
      if (first) ed.setCaretAt(first, 0);
      return;
    }
    let block = ed.closestAtSelection('li')?.closest('ul,ol') ?? ed.closestAtSelection(PARAGRAPH_LIKE);
    if (!block) {
      // 段落に入っていない裸のテキストは <p> でくるむ
      block = document.createElement('p');
      range.surroundContents(block);
    }
    const bq = document.createElement('blockquote');
    block.before(bq);
    bq.append(block);
    ed.setCaretAt(block, 0);
  });
}

export const basicPlugin = {
  name: 'basic',
  items: {
    format: {
      type: 'select', title: '段落の書式',
      options: [
        { value: 'p', label: '本文' },
        { value: 'h1', label: '見出し1' },
        { value: 'h2', label: '見出し2' },
        { value: 'h3', label: '見出し3' },
        { value: 'h4', label: '見出し4' },
        { value: 'pre', label: '整形済み' },
      ],
      value: (ed) => ed.closestAtSelection(PARAGRAPH_LIKE)?.localName ?? 'p',
      action: (ed, tag) => ed.exec('formatBlock', `<${tag}>`),
    },
    bold: cmd('bold', icons.bold, '太字 (Ctrl/⌘+B)'),
    italic: cmd('italic', icons.italic, '斜体 (Ctrl/⌘+I)'),
    underline: cmd('underline', icons.underline, '下線 (Ctrl/⌘+U)'),
    strike: cmd('strikeThrough', icons.strike, '取り消し線'),
    sup: cmd('superscript', icons.sup, '上付き'),
    sub: cmd('subscript', icons.sub, '下付き'),
    ul: cmd('insertUnorderedList', icons.ul, '箇条書き', { action: (ed) => listCommand(ed, 'insertUnorderedList') }),
    ol: cmd('insertOrderedList', icons.ol, '番号付きリスト', { action: (ed) => listCommand(ed, 'insertOrderedList') }),
    indent: { icon: icons.indent, title: 'インデント', action: (ed) => ed.exec('indent') },
    outdent: { icon: icons.outdent, title: 'インデント解除', action: (ed) => ed.exec('outdent') },
    alignLeft: cmd('justifyLeft', icons.alignLeft, '左揃え'),
    alignCenter: cmd('justifyCenter', icons.alignCenter, '中央揃え'),
    alignRight: cmd('justifyRight', icons.alignRight, '右揃え'),
    quote: {
      icon: icons.quote, title: '引用',
      action: toggleQuote,
      active: (ed) => !!ed.closestAtSelection('blockquote'),
    },
    hr: {
      icon: icons.hr, title: '水平線',
      action: (ed) => ed.insertNodes(document.createElement('hr')),
    },
  },
  keymap: {
    'Mod-b': 'bold',
    'Mod-i': 'italic',
    'Mod-u': 'underline',
  },
};
