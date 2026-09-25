/**
 * スナップショット方式の元に戻す／やり直し。
 * execCommand 以外の DOM 操作（表の挿入など）も一律に扱えるよう、
 * ブラウザ標準の undo は使わず innerHTML と選択位置を保存する。
 */
export class History {
  /**
   * snapshot(root) / restore(root, snap) を渡すと、innerHTML の代わりにそれで保存・復元する
   * （原文との対応情報をノードごと引き継ぐため）
   */
  constructor(root, { limit = 100, snapshot = null, restore = null } = {}) {
    this.root = root;
    this.limit = limit;
    this.snapshot = snapshot;
    this.restore = restore;
    this.stack = [];
    this.index = -1;
  }

  reset() {
    this.stack = [];
    this.index = -1;
    this.record();
  }

  record() {
    // 選択表示用の内部属性だけの違いは履歴に積まない
    const html = this.root.innerHTML.replace(/ data-formulit-(?:selected|cell-selected)=""/g, '');
    if (this.stack[this.index]?.html === html) return false;
    this.stack.splice(this.index + 1);
    this.stack.push(this.#take(html));
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length - 1;
    return true;
  }

  /** 現在の状態で最新の履歴を置き換える（見た目だけの補正用） */
  amend() {
    if (this.index >= 0) this.stack[this.index] = this.#take(this.root.innerHTML.replace(/ data-formulit-(?:selected|cell-selected)=""/g, ''));
  }

  #take(html) {
    return { html, sel: saveSelection(this.root), snap: this.snapshot?.(this.root) };
  }

  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.stack.length - 1; }

  undo() { return this.canUndo && this.#apply(--this.index); }
  redo() { return this.canRedo && this.#apply(++this.index); }

  #apply(i) {
    const { html, sel, snap } = this.stack[i];
    if (snap && this.restore) this.restore(this.root, snap);
    else this.root.innerHTML = html;
    restoreSelection(this.root, sel);
    return true;
  }
}

/* ---- 選択範囲をノードパスで保存・復元 ---- */

function pathOf(root, node) {
  const path = [];
  while (node && node !== root) {
    const parent = node.parentNode;
    if (!parent) return null;
    path.unshift([...parent.childNodes].indexOf(node));
    node = parent;
  }
  return node === root ? path : null;
}

function nodeAt(root, path) {
  let node = root;
  for (const i of path) {
    node = node?.childNodes[i];
  }
  return node;
}

export function saveSelection(root) {
  const sel = root.ownerDocument.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.commonAncestorContainer)) return null;
  const start = pathOf(root, r.startContainer);
  const end = pathOf(root, r.endContainer);
  if (!start || !end) return null;
  return { start, startOffset: r.startOffset, end, endOffset: r.endOffset };
}

export function restoreSelection(root, saved) {
  if (!saved) return;
  const s = nodeAt(root, saved.start);
  const e = nodeAt(root, saved.end);
  if (!s || !e) return;
  try {
    const r = root.ownerDocument.createRange();
    r.setStart(s, Math.min(saved.startOffset, maxOffset(s)));
    r.setEnd(e, Math.min(saved.endOffset, maxOffset(e)));
    const sel = root.ownerDocument.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  } catch {
    /* 構造が変わって復元できない場合は無視 */
  }
}

function maxOffset(node) {
  return node.nodeType === Node.TEXT_NODE ? node.length : node.childNodes.length;
}
