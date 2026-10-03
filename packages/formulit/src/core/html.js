/**
 * HTML の読み込み・書き出しを担当するコア。
 *
 * 方針:
 *  - モデルに変換せず DOM をそのまま編集対象にする（Quill のような正規化による欠落を防ぐ）
 *  - 編集中だけ必要な変更（contenteditable=false の付与、<style> の無効化など）は
 *    元の値を data-formulit-tmp に記録し、書き出し時に必ず元へ戻す
 *  - サニタイズで消すのは実行されうるもの（script / on* / javascript: URL）だけ
 *  - 何かを除去した場合は「原文そのまま返す」扱いにしない（危険な記述を素通しさせない）
 */

import { attachSourceMap, markDirty } from './source-map.js';

import { TMP_ATTR, TEXT_ATTR, setTemp, restoreElement, unwrapTextElements } from './temp.js';

export { TMP_ATTR, TEXT_ATTR };

/** 編集中に contenteditable=false を付けて丸ごと保護する要素 */
export const DEFAULT_PROTECT =
  'figure.media, iframe, video, audio, object, embed, form, noscript, svg, math, canvas, [data-protect]';

const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href', 'data', 'poster'];
const DANGEROUS_URL = /^\s*(javascript|vbscript|data:text\/html)/i;

/**
 * 文字列を DocumentFragment にする。
 * <template> を使うのでパース時にスクリプトや onerror は実行されない。
 */
export function parseHTML(html) {
  const t = document.createElement('template');
  t.innerHTML = html ?? '';
  return t.content;
}

/**
 * 危険な要素・属性を処理する。
 * mode: 'strip'  … 削除する（既定）
 *       'none'   … 削除しない。ただし編集中に実行されないよう一時的に無効化し、書き出し時に戻す
 */
export function sanitize(root, mode = 'strip', onChange = () => {}) {
  let removed = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const toRemove = [];
  for (let el = walker.nextNode(); el; el = walker.nextNode()) {
    if (el.localName === 'script') {
      if (mode === 'strip') toRemove.push(el);
      continue;
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const isEvent = name.startsWith('on');
      const isBadUrl = URL_ATTRS.includes(name) && DANGEROUS_URL.test(attr.value);
      if (!isEvent && !isBadUrl) continue;
      if (mode === 'strip') { el.removeAttribute(attr.name); removed++; onChange(el, 'attr'); }
      else setTemp(el, attr.name, null);
    }
  }
  toRemove.forEach((n) => { if (n.parentNode) onChange(n.parentNode, 'content'); n.remove(); });
  return removed + toRemove.length;
}

/**
 * 編集用の下準備。書き出し時に restore() で完全に元に戻る変更だけを行う。
 */
export function prepareForEditing(root, { protect = DEFAULT_PROTECT } = {}) {
  // ページ全体に波及しないよう <style> を編集中は無効化
  root.querySelectorAll('style').forEach((el) => setTemp(el, 'media', 'not all'));
  // 構造を壊されたくない要素は丸ごと保護
  if (protect) {
    root.querySelectorAll(protect).forEach((el) => {
      if (!el.hasAttribute('contenteditable')) setTemp(el, 'contenteditable', 'false');
    });
  }
}

export { setTemp };

/** setTemp で行った変更を元に戻し、編集中だけの要素を文字列に戻し、エディタ内部用の data-formulit-* を取り除く */
export function restore(root) {
  unwrapTextElements(root);
  root.querySelectorAll('*').forEach(restoreElement);
}

/** 編集領域の中身を HTML 文字列として書き出す */
export function serialize(editable) {
  const clone = editable.cloneNode(true);
  restore(clone);
  const html = clone.innerHTML;
  // 空のエディタでブラウザが残すプレースホルダーは空文字とみなす
  if (/^\s*(<p>(<br>)?<\/p>|<br>|<div><br><\/div>)?\s*$/i.test(html)) return '';
  return html;
}

/**
 * 文字列を読み込み、編集用に整えた DocumentFragment を返す。
 * frag.formulitRemoved にサニタイズで除去した数が入る。
 */
export function load(html, { sanitize: mode = 'strip', protect, prepare = [] } = {}) {
  const frag = parseHTML(html);
  // サニタイズ前に原文との対応を記録（部分的な原文保持用）
  attachSourceMap(html ?? '', frag);
  const removed = sanitize(frag, mode, markDirty);
  prepareForEditing(frag, { protect });
  // プラグインによる編集用の下準備（setTemp を使えば書き出し時に元へ戻る）
  for (const fn of prepare) fn(frag);
  frag.formulitRemoved = removed;
  return frag;
}
