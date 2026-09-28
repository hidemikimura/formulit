import { icons } from '../icons.js';

const SAFE_URL = /^(https?:|mailto:|tel:|\/|#|\.|[^:]*$)/i;

async function editLink(ed) {
  const existing = ed.closestAtSelection('a');
  const range = ed.getRange(true);
  const needsText = !existing && range.collapsed;
  const values = await ed.openDialog({
    title: existing ? 'リンクを編集' : 'リンクを挿入',
    submitLabel: existing ? '更新' : '挿入',
    fields: [
      { name: 'href', label: 'URL', type: 'text', value: existing?.getAttribute('href') ?? 'https://', required: true },
      ...(needsText ? [{ name: 'text', label: '表示テキスト', type: 'text', value: '' }] : []),
      { name: 'blank', label: '新しいタブで開く', type: 'checkbox', value: existing?.target === '_blank' },
    ],
  });
  if (!values) return;
  const href = values.href.trim();
  if (!href || !SAFE_URL.test(href)) return;

  // 既存リンクは href / target だけを書き換え、他の属性（class や data-* など）は残す
  const applyAttrs = (a) => {
    a.setAttribute('href', href);
    if (values.blank) {
      a.setAttribute('target', '_blank');
      if (!a.hasAttribute('rel')) a.setAttribute('rel', 'noopener');
    } else if (a.getAttribute('target') === '_blank') {
      a.removeAttribute('target');
    }
  };

  if (existing) {
    ed.transact(() => applyAttrs(existing));
  } else if (needsText) {
    const a = document.createElement('a');
    a.textContent = values.text || href;
    applyAttrs(a);
    ed.insertNodes(a);
  } else {
    ed.transact(() => {
      const marker = `formulit-link-${Date.now()}`;
      document.execCommand('createLink', false, marker);
      ed.editable.querySelectorAll(`a[href="${marker}"]`).forEach(applyAttrs);
    });
  }
}

function unlink(ed) {
  const a = ed.closestAtSelection('a');
  ed.transact(() => {
    if (a) {
      a.replaceWith(...a.childNodes);
    } else {
      document.execCommand('unlink');
    }
  });
}

export const linkPlugin = {
  name: 'link',
  items: {
    link: {
      icon: icons.link, title: 'リンク (Ctrl/⌘+K)',
      action: editLink,
      active: (ed) => !!ed.closestAtSelection('a'),
    },
    unlink: {
      icon: icons.unlink, title: 'リンク解除',
      action: unlink,
      enabled: (ed) => !!ed.closestAtSelection('a') || ed.queryState('unlink'),
    },
  },
  keymap: { 'Mod-k': 'link' },
};
