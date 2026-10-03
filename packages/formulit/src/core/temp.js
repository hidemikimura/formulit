/**
 * 編集中だけの一時的な属性変更（setTemp）と、その復元。
 * 元の値に加えて元の属性の並び順も記録し、書き出し時に順序ごと元に戻す。
 */
export const TMP_ATTR = 'data-formulit-tmp';
export const INTERNAL_PREFIX = 'data-formulit-';
/** 編集中だけの要素。書き出し時は要素ごと、この属性の値の文字列に置き換える（変数の表示など） */
export const TEXT_ATTR = 'data-formulit-text';
const ORDER = '\u0000order';

/**
 * 属性値を一時的に変更し、元の値（無ければ null）を記録する。
 * value が null なら属性を取り除く。
 */
export function setTemp(el, name, value) {
  const saved = el.hasAttribute(TMP_ATTR) ? JSON.parse(el.getAttribute(TMP_ATTR)) : {};
  if (!(ORDER in saved)) saved[ORDER] = [...el.attributes].map((a) => a.name);
  if (!(name in saved)) saved[name] = el.hasAttribute(name) ? el.getAttribute(name) : null;
  el.setAttribute(TMP_ATTR, JSON.stringify(saved));
  if (value === null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

/** setTemp の変更を戻し（並び順も元どおり）、エディタ内部用の data-formulit-* を取り除く */
export function restoreElement(el) {
  if (el.hasAttribute(TMP_ATTR)) {
    const saved = JSON.parse(el.getAttribute(TMP_ATTR));
    el.removeAttribute(TMP_ATTR);
    const order = saved[ORDER];
    delete saved[ORDER];
    for (const [name, value] of Object.entries(saved)) {
      if (value === null) el.removeAttribute(name);
      else el.setAttribute(name, value);
    }
    if (order) {
      const cur = [...el.attributes].map((a) => [a.name, a.value]);
      const rank = (n, i) => { const k = order.indexOf(n); return k < 0 ? order.length + i : k; };
      const sorted = cur.map((c, i) => [...c, rank(c[0], i)]).sort((a, b) => a[2] - b[2]);
      if (sorted.some((c, i) => c[0] !== cur[i][0])) {
        cur.forEach(([n]) => el.removeAttribute(n));
        sorted.forEach(([n, v]) => el.setAttribute(n, v));
      }
    }
  }
  for (const a of [...el.attributes]) if (a.name.startsWith(INTERNAL_PREFIX)) el.removeAttribute(a.name);
}

/** TEXT_ATTR を持つ要素を、その値の文字列に置き換える */
export function unwrapTextElements(root) {
  root.querySelectorAll(`[${TEXT_ATTR}]`).forEach((el) => el.replaceWith(el.getAttribute(TEXT_ATTR)));
}
