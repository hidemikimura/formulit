import { icons } from '../icons.js';
import { caretRangeAt } from '../core/selection.js';

/**
 * 画像：挿入・編集、キャプション、配置、リサイズ（本体側のハンドル）、
 * ドラッグ＆ドロップ・貼り付け・ファイル選択によるアップロード。
 *
 * アップロード先: editor.imageUploader = async (file) => url
 * 未設定のときは data URL（Base64）として埋め込む。
 *
 * 配置は <figure class="image"> の style（既定）で表す。
 * editor.imageStyles でクラス方式などに差し替えられる:
 *   [{ name: 'alignLeft', label: '左寄せ', classes: ['image-style-align-left'] }, ...]
 */
export const DEFAULT_IMAGE_STYLES = [
  { name: 'inline', label: '文中に配置' },
  { name: 'alignLeft', label: '左寄せ（文字を回り込ませる）', style: { float: 'left', margin: '0 1.5em 1em 0' } },
  { name: 'alignCenter', label: '中央寄せ', style: { display: 'table', margin: '1em auto' } },
  { name: 'alignRight', label: '右寄せ（文字を回り込ませる）', style: { float: 'right', margin: '0 0 1em 1.5em' } },
];

const styleDefs = (ed) => ed.imageStyles ?? DEFAULT_IMAGE_STYLES;
const selectedImage = (ed) => (ed.selectedObject?.localName === 'img' ? ed.selectedObject : null);

function figureOf(ed, img) {
  const fig = img?.closest('figure');
  return fig && ed.editable.contains(fig) && !fig.classList.contains('media') ? fig : null;
}

/* ---------- 配置 ---------- */

const normBox = document.createElement('div');
function normStyle(prop, value) {
  normBox.style.cssText = '';
  normBox.style.setProperty(prop, value);
  return normBox.style.getPropertyValue(prop);
}

function matchesDef(el, def) {
  if (!def.style && !def.classes) return false;
  const okStyle = Object.entries(def.style ?? {}).every(([k, v]) => el.style.getPropertyValue(k) === normStyle(k, v));
  const okClass = (def.classes ?? []).every((c) => el.classList.contains(c));
  return okStyle && okClass;
}

function currentStyle(ed, img) {
  const fig = figureOf(ed, img);
  if (!fig) return 'inline';
  return styleDefs(ed).find((d) => d.name !== 'inline' && matchesDef(fig, d))?.name ?? null;
}

/** 画像（リンクで囲まれていればリンクごと）を figure に入れ、段落の外へ出す */
function wrapInFigure(ed, img) {
  const top = img.parentElement?.localName === 'a' && img.parentElement.childNodes.length === 1 ? img.parentElement : img;
  const marker = document.createTextNode('');
  top.before(marker);
  const fig = document.createElement('figure');
  fig.className = 'image';
  fig.append(top);
  const r = document.createRange();
  r.setStartBefore(marker);
  r.setEndAfter(marker);
  ed.selectRange(r);
  ed.insertNodesAtSelection(fig);
  marker.remove();
  return fig;
}

function setImageStyle(ed, name) {
  const img = selectedImage(ed);
  if (!img) return;
  const defs = styleDefs(ed);
  const def = defs.find((d) => d.name === name);
  if (!def) return;
  ed.transact(() => {
    let fig = figureOf(ed, img);
    if (name === 'inline') {
      if (!fig) return;
      // figure を段落に戻す（キャプションは外す）
      const p = document.createElement('p');
      const top = img.parentElement?.localName === 'a' ? img.parentElement : img;
      p.append(top);
      fig.replaceWith(p);
      reselect(ed, img);
      return;
    }
    if (!fig) fig = wrapInFigure(ed, img);
    for (const d of defs) {
      for (const k of Object.keys(d.style ?? {})) fig.style.removeProperty(k);
      if (d.classes?.length) fig.classList.remove(...d.classes);
    }
    for (const [k, v] of Object.entries(def.style ?? {})) fig.style.setProperty(k, v);
    if (def.classes?.length) fig.classList.add(...def.classes);
    if (fig.getAttribute('style') === '') fig.removeAttribute('style');
    reselect(ed, img);
  });
}

function reselect(ed, img) {
  ed.editable.querySelectorAll('[data-formulit-selected]').forEach((el) => el.removeAttribute('data-formulit-selected'));
  img.setAttribute('data-formulit-selected', '');
  const r = document.createRange();
  r.selectNode(img);
  ed.selectRange(r);
}

/* ---------- キャプション ---------- */

function toggleCaption(ed) {
  const img = selectedImage(ed);
  if (!img) return;
  let caption = figureOf(ed, img)?.querySelector(':scope > figcaption');
  if (caption) {
    ed.transact(() => { caption.remove(); reselect(ed, img); });
    return;
  }
  ed.transact(() => {
    let fig = figureOf(ed, img);
    if (!fig) {
      fig = wrapInFigure(ed, img);
      const center = styleDefs(ed).find((d) => d.name === 'alignCenter');
      if (center) {
        for (const [k, v] of Object.entries(center.style ?? {})) fig.style.setProperty(k, v);
        if (center.classes?.length) fig.classList.add(...center.classes);
      }
    }
    caption = document.createElement('figcaption');
    fig.append(caption);
    img.removeAttribute('data-formulit-selected');
    ed.setCaretAt(caption, 0);
  });
}

/* ---------- アップロード ---------- */

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

export function uploadImage(ed, file) {
  return ed.imageUploader ? ed.imageUploader(file) : readAsDataURL(file);
}

/** 画像ファイルをカーソル位置に挿入し、アップロード完了後に src を差し替える */
export function insertImageFiles(ed, files) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  if (!images.length) return [];
  const placed = images.map((file) => {
    const img = document.createElement('img');
    img.setAttribute('src', URL.createObjectURL(file));
    img.setAttribute('alt', '');
    img.setAttribute('data-formulit-uploading', '');
    return { file, img };
  });
  const frag = document.createDocumentFragment();
  placed.forEach(({ img }) => frag.append(img));
  ed.insertNodes(frag);
  return Promise.all(placed.map(async ({ file, img }) => {
    try {
      const url = await uploadImage(ed, file);
      ed._withoutFocus(() => ed.transact(() => {
        img.setAttribute('src', url);
        img.removeAttribute('data-formulit-uploading');
      }));
      ed.dispatchEvent(new CustomEvent('formulit-upload', { bubbles: true, composed: true, detail: { file, url } }));
    } catch (error) {
      ed._withoutFocus(() => ed.transact(() => img.remove()));
      ed.dispatchEvent(new CustomEvent('formulit-upload-error', { bubbles: true, composed: true, detail: { file, error } }));
    }
    return img;
  }));
}

/* ---------- ダイアログ ---------- */

async function editImage(ed) {
  const current = selectedImage(ed);
  const values = await ed.openDialog({
    title: current ? '画像を編集' : '画像を挿入',
    submitLabel: current ? '更新' : '挿入',
    fields: [
      { name: 'file', label: 'ファイルを選択（またはエディタにドラッグ＆ドロップ・貼り付け）', type: 'file' },
      { name: 'src', label: '画像URL', type: 'text', value: current?.getAttribute('src')?.startsWith('data:') ? '' : current?.getAttribute('src') ?? '', placeholder: 'https://...' },
      { name: 'alt', label: '代替テキスト (alt)', type: 'text', value: current?.getAttribute('alt') ?? '' },
      { name: 'width', label: '幅 (px、空欄で原寸)', type: 'number', min: 1, value: current?.getAttribute('width') ?? '', half: true },
      { name: 'height', label: '高さ (px、空欄で自動)', type: 'number', min: 1, value: current?.getAttribute('height') ?? '', half: true },
    ],
  });
  if (!values) return;

  // 既存画像は変更した属性だけ書き換え、class / style / data-* などはそのまま残す
  const applyAttrs = (img) => {
    img.setAttribute('alt', values.alt);
    for (const k of ['width', 'height']) {
      if (values[k]) img.setAttribute(k, values[k]);
      else img.removeAttribute(k);
    }
  };
  if (!current && values.file) {
    const imgs = await insertImageFiles(ed, [values.file]);
    imgs.forEach((img) => img.isConnected && ed.transact(() => applyAttrs(img)));
    return;
  }
  let src = values.src;
  if (values.file) src = await uploadImage(ed, values.file);
  if (current && !src) src = current.getAttribute('src');
  if (!src || /^\s*(javascript|vbscript):/i.test(src)) return;
  if (current) {
    ed.transact(() => { current.setAttribute('src', src); applyAttrs(current); });
  } else {
    const img = document.createElement('img');
    img.setAttribute('src', src);
    applyAttrs(img);
    ed.insertNodes(img);
  }
}

/* ---------- プラグイン ---------- */

const styleItem = (name, icon) => ({
  icon,
  title: '',
  visible: (ed) => styleDefs(ed).some((d) => d.name === name),
  active: (ed) => currentStyle(ed, selectedImage(ed)) === name,
  action: (ed) => setImageStyle(ed, name),
});

export const imagePlugin = {
  name: 'image',
  items: {
    image: {
      icon: icons.image, title: '画像',
      action: editImage,
      active: (ed) => !!selectedImage(ed),
    },
    imgInline: styleItem('inline', icons.imgInline),
    imgAlignLeft: styleItem('alignLeft', icons.imgLeft),
    imgAlignCenter: styleItem('alignCenter', icons.imgCenter),
    imgAlignRight: styleItem('alignRight', icons.imgRight),
    imgCaption: {
      icon: icons.caption, title: 'キャプションの表示・非表示',
      active: (ed) => !!figureOf(ed, selectedImage(ed))?.querySelector(':scope > figcaption'),
      action: toggleCaption,
    },
    imgEdit: { icon: icons.edit, title: '画像の設定（URL・代替テキスト・サイズ）', action: editImage },
    imgDelete: {
      icon: icons.trash, title: '画像を削除',
      action: (ed) => {
        const img = selectedImage(ed);
        if (!img) return;
        ed.transact(() => {
          const fig = figureOf(ed, img);
          const target = fig ?? (img.parentElement?.localName === 'a' && img.parentElement.childNodes.length === 1 ? img.parentElement : img);
          const p = target.parentNode;
          const i = [...p.childNodes].indexOf(target);
          target.remove();
          ed.setCaretAt(p, Math.min(i, p.childNodes.length));
        });
      },
    },
  },
  contextToolbars: [{
    name: 'image',
    match: (ed) => selectedImage(ed),
    items: ['imgInline', 'imgAlignLeft', 'imgAlignCenter', 'imgAlignRight', '|', 'imgCaption', 'imgEdit', 'link', '|', 'imgDelete'],
  }],
  init(ed) {
    // ボタンのツールチップは設定から
    for (const d of styleDefs(ed)) {
      const key = { inline: 'imgInline', alignLeft: 'imgAlignLeft', alignCenter: 'imgAlignCenter', alignRight: 'imgAlignRight' }[d.name];
      if (key) imagePlugin.items[key].title = d.label;
    }
    const hasFiles = (dt) => [...(dt?.types ?? [])].includes('Files');
    const onDragOver = (e) => { if (hasFiles(e.dataTransfer)) e.preventDefault(); };
    const onDrop = (e) => {
      const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      const r = caretRangeAt(e.clientX, e.clientY, ed.editable);
      if (r && ed.editable.contains(r.startContainer)) ed.selectRange(r);
      insertImageFiles(ed, files);
    };
    const onPaste = (e) => {
      if (e.defaultPrevented) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      insertImageFiles(ed, files);
    };
    ed.editable.addEventListener('dragover', onDragOver);
    ed.editable.addEventListener('drop', onDrop);
    ed.editable.addEventListener('paste', onPaste);
    return () => {
      ed.editable.removeEventListener('dragover', onDragOver);
      ed.editable.removeEventListener('drop', onDrop);
      ed.editable.removeEventListener('paste', onPaste);
    };
  },
};
