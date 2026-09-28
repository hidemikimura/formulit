/**
 * 選択範囲の読み書き（エディタがシャドウ DOM の中にあっても動くように）。
 *
 * document.getSelection() は、選択がシャドウ DOM の中にあるとき、Chrome と Safari では
 * シャドウホストの位置に置き換えた（中が見えない）範囲を返す。そのため:
 *   1. ShadowRoot#getSelection()（Chromium。本物の Range を返す）
 *   2. Selection#getComposedRanges({ shadowRoots })（標準。Safari 17+ / Chrome 137+ / Firefox 142+）
 *   3. document.getSelection()（シャドウ DOM の外、または Firefox の旧版はこれで中まで見える）
 * の順に試す。
 */

/** node が属するシャドウルート（なければ null） */
function shadowRootOf(node) {
  const root = node?.getRootNode?.();
  return root && root !== node.ownerDocument && root instanceof ShadowRoot ? root : null;
}

/** getComposedRanges の呼び方は、仕様の変更で { shadowRoots: [...] } と可変長引数の 2 通りがある */
function composedRange(sel, root) {
  let ranges;
  try { ranges = sel.getComposedRanges({ shadowRoots: [root] }); } catch { ranges = null; }
  if (!ranges?.length || !isInside(ranges[0].startContainer, root)) {
    try { ranges = sel.getComposedRanges(root); } catch { /* 未対応 */ }
  }
  const s = ranges?.[0];
  if (!s) return null;
  const r = document.createRange();
  r.setStart(s.startContainer, s.startOffset);
  r.setEnd(s.endContainer, s.endOffset);
  return r;
}

function isInside(node, root) {
  for (let n = node; n; n = n.parentNode ?? n.host) if (n === root) return true;
  return false;
}

/**
 * node（編集領域など）と同じツリーにある、現在の選択範囲。なければ null。
 * シャドウ DOM の外では Selection の Range そのもの（変更すると選択も変わる）を返す。
 */
export function getSelectionRange(node) {
  const sel = document.getSelection();
  const root = shadowRootOf(node);
  if (root) {
    if (typeof root.getSelection === 'function') {
      const s = root.getSelection();
      if (s?.rangeCount) return s.getRangeAt(0);
    }
    if (sel && typeof sel.getComposedRanges === 'function') {
      const r = composedRange(sel, root);
      if (r) return r;
    }
  }
  return sel?.rangeCount ? sel.getRangeAt(0) : null;
}

/** 選択範囲を range にする */
export function setSelectionRange(range, node = range.startContainer) {
  const root = shadowRootOf(node);
  const sel = (root && typeof root.getSelection === 'function' ? root.getSelection() : null) ?? document.getSelection();
  if (!sel) return;
  if (root && typeof sel.setBaseAndExtent === 'function') {
    // シャドウ DOM の中は addRange より setBaseAndExtent の方が確実（Safari）
    sel.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
    return;
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

/** node と同じツリーでフォーカスのある要素（シャドウ DOM の中なら、その中の要素） */
export function activeElementOf(node) {
  const root = node?.getRootNode?.();
  return (root && 'activeElement' in root ? root.activeElement : null) ?? document.activeElement;
}

/** 画面上の位置 (x, y) にあるキャレット位置の Range（ドロップ位置などに使う） */
export function caretRangeAt(x, y, node) {
  const root = shadowRootOf(node);
  if (document.caretPositionFromPoint) {
    let pos = null;
    try { pos = root ? document.caretPositionFromPoint(x, y, { shadowRoots: [root] }) : document.caretPositionFromPoint(x, y); } catch { /* 引数に未対応 */ }
    if (pos?.offsetNode && (!root || isInside(pos.offsetNode, root))) {
      const r = document.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.collapse(true);
      return r;
    }
  }
  if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (r && (!root || isInside(r.startContainer, root))) return r;
  }
  return null;
}
