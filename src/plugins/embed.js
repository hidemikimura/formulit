import { icons } from '../icons.js';
import { load, setTemp, restore } from '../core/html.js';

/**
 * メディア埋め込み（YouTube などの URL → iframe）と HTML 埋め込み。
 * どちらも編集中は contenteditable=false で保護され、クリックで選択、
 * コンテキストツールバーから編集・削除できる（ダブルクリックでも編集）。
 */

export const MEDIA_PROVIDERS = [
  {
    name: 'YouTube',
    re: /^(?:https?:)?\/\/(?:www\.|m\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i,
    src: (m) => `https://www.youtube.com/embed/${m[1]}`, width: 560, height: 315,
  },
  {
    name: 'Vimeo',
    re: /^(?:https?:)?\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d+)/i,
    src: (m) => `https://player.vimeo.com/video/${m[1]}`, width: 560, height: 315,
  },
  {
    name: 'Dailymotion',
    re: /^(?:https?:)?\/\/(?:www\.)?(?:dailymotion\.com\/(?:embed\/)?video|dai\.ly)\/([a-z0-9]+)/i,
    src: (m) => `https://www.dailymotion.com/embed/video/${m[1]}`, width: 560, height: 315,
  },
  {
    name: 'Spotify',
    re: /^(?:https?:)?\/\/open\.spotify\.com\/(?:intl-[\w-]+\/)?(?:embed\/)?(track|album|playlist|episode|show|artist)\/(\w+)/i,
    src: (m) => `https://open.spotify.com/embed/${m[1]}/${m[2]}`, width: '100%', height: (m) => (m[1] === 'track' || m[1] === 'episode' ? 152 : 352),
  },
  {
    name: 'Google マップ',
    re: /^https:\/\/www\.google\.[a-z.]+\/maps\/embed\?[^\s"'<>]+$/i,
    src: (m) => m[0], width: 600, height: 450,
  },
];

export function matchMedia(url, providers = MEDIA_PROVIDERS) {
  const u = (url ?? '').trim();
  for (const p of providers) {
    const m = u.match(p.re);
    if (m) {
      return {
        provider: p.name,
        src: p.src(m),
        width: typeof p.width === 'function' ? p.width(m) : p.width,
        height: typeof p.height === 'function' ? p.height(m) : p.height,
      };
    }
  }
  return null;
}

export function mediaElement(info, url) {
  const fig = document.createElement('figure');
  fig.className = 'media';
  const iframe = document.createElement('iframe');
  iframe.setAttribute('src', info.src);
  iframe.setAttribute('width', String(info.width));
  iframe.setAttribute('height', String(info.height));
  iframe.setAttribute('title', info.provider);
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('data-url', url);
  fig.append(iframe);
  protect(fig);
  return fig;
}

/** 編集中だけ保護する（書き出し時には contenteditable は消える） */
function protect(el) {
  if (el.nodeType === 1 && !el.hasAttribute('contenteditable')) setTemp(el, 'contenteditable', 'false');
}

const selectedEmbed = (ed) => {
  const o = ed.selectedObject;
  return o && o.localName !== 'img' ? o : null;
};
const isMedia = (el) => el?.localName === 'figure' && el.classList.contains('media');

async function mediaDialog(ed, current) {
  const iframe = current?.querySelector('iframe');
  let message = '';
  let url = iframe?.getAttribute('data-url') ?? iframe?.getAttribute('src') ?? '';
  for (;;) {
    const v = await ed.openDialog({
      title: current ? 'メディアの URL を変更' : 'メディアを埋め込む',
      submitLabel: current ? '更新' : '埋め込む',
      message: message || `対応: ${(ed.mediaProviders ?? MEDIA_PROVIDERS).map((p) => p.name).join('、')}`,
      fields: [{ name: 'url', label: 'URL', type: 'text', value: url, placeholder: 'https://www.youtube.com/watch?v=...' }],
    });
    if (!v) return;
    url = v.url;
    const info = matchMedia(url, ed.mediaProviders ?? MEDIA_PROVIDERS);
    if (!info) { message = 'この URL は埋め込みに対応していません。'; continue; }
    const fig = mediaElement(info, url);
    if (current) ed.transact(() => current.replaceWith(fig));
    else ed.insertNodes(fig);
    return;
  }
}

/** HTML スニペットを読み込み、トップレベルの要素を保護して返す */
function embedFragment(ed, htmlString) {
  const frag = load(htmlString, ed.loadOptions());
  [...frag.childNodes].forEach(protect);
  return frag;
}

async function htmlEmbedDialog(ed, current) {
  let value = '';
  if (current) {
    const c = current.cloneNode(true);
    const wrap = document.createElement('div');
    wrap.append(c);
    restore(wrap);
    value = wrap.innerHTML;
  }
  const v = await ed.openDialog({
    title: current ? 'HTML を編集' : 'HTML を埋め込む', submitLabel: current ? '更新' : '挿入', wide: true,
    message: 'script や on* 属性はサニタイズ設定に従って除去されます。',
    fields: [{ name: 'html', label: 'HTML', type: 'textarea', value, placeholder: '<div class="widget">...</div>' }],
  });
  if (!v) return;
  const frag = embedFragment(ed, v.html);
  if (current) {
    ed.transact(() => {
      const last = frag.lastChild;
      current.replaceWith(frag);
      if (last) ed.setCaretAfter(last);
    });
  } else if (frag.childNodes.length) {
    ed.insertNodes(frag);
  }
}

function editEmbed(ed, el = selectedEmbed(ed)) {
  if (!el) return;
  return isMedia(el) ? mediaDialog(ed, el) : htmlEmbedDialog(ed, el);
}

export const embedPlugin = {
  name: 'embed',
  items: {
    mediaEmbed: { icon: icons.media, title: 'メディアを埋め込む（YouTube など）', action: (ed) => mediaDialog(ed, null) },
    htmlEmbed: { icon: icons.htmlEmbed, title: 'HTML を埋め込む', action: (ed) => htmlEmbedDialog(ed, null) },
    embedEdit: { icon: icons.edit, title: '編集', action: (ed) => editEmbed(ed) },
    embedDelete: {
      icon: icons.trash, title: '削除',
      action: (ed) => {
        const el = selectedEmbed(ed);
        if (!el) return;
        ed.transact(() => {
          const p = el.parentNode;
          const i = [...p.childNodes].indexOf(el);
          el.remove();
          ed.setCaretAt(p, Math.min(i, p.childNodes.length));
        });
      },
    },
  },
  contextToolbars: [{
    name: 'embed',
    match: (ed) => selectedEmbed(ed),
    items: ['embedEdit', 'embedDelete'],
  }],
  init(ed) {
    // URL だけを貼り付けたら自動で埋め込む
    const onPaste = (e) => {
      if (e.defaultPrevented || e.clipboardData?.getData('text/html')) return;
      if (ed.closestAtSelection('pre,code,a')) return;
      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (!text || /\s/.test(text)) return;
      const info = matchMedia(text, ed.mediaProviders ?? MEDIA_PROVIDERS);
      if (!info) return;
      e.preventDefault();
      ed.insertNodes(mediaElement(info, text));
    };
    const onDbl = (e) => {
      const el = e.target.closest?.('[contenteditable=false]');
      if (el && ed.editable.contains(el) && el !== ed.editable) { e.preventDefault(); editEmbed(ed, el); }
    };
    ed.editable.addEventListener('paste', onPaste);
    ed.editable.addEventListener('dblclick', onDbl);
    return () => {
      ed.editable.removeEventListener('paste', onPaste);
      ed.editable.removeEventListener('dblclick', onDbl);
    };
  },
};
