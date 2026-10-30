/**
 * リストの項目の入れ子（Tab / Shift+Tab、ツールバーのインデント・インデント解除）。
 *
 * ブラウザの indent / outdent はリストの直下に <ul> を作る（<ul><li>a</li><ul><li>b</li></ul></ul>）ため、
 * 正しい形（<ul><li>a<ul><li>b</li></ul></li></ul>）で項目を動かす。Markdown の入れ子のリストと同じ形。
 */

const LIST = 'ul, ol';

const elementOf = (node) => (node?.nodeType === 1 ? node : node?.parentElement);

/** node を含む、list の直下の li（無ければ null） */
function itemIn(list, node) {
  for (let el = elementOf(node); el && el !== list; el = el.parentElement) {
    if (el.parentElement === list && el.localName === 'li') return el;
  }
  return null;
}

/**
 * 選択範囲にかかる、同じリストの中の連続した項目。
 * 項目の中の表のセルにカーソルがある場合は対象外（表の Tab を優先する）。
 * @returns {{ list: Element, items: Element[] } | null}
 */
export function listItemsAtSelection(ed) {
  const r = ed.getRange();
  if (!r) return null;
  const start = elementOf(r.startContainer);
  const first = start?.closest('li');
  if (!first || !ed.editable.contains(first)) return null;
  const list = first.parentElement;
  if (!list?.matches(LIST)) return null;
  const cell = start.closest('td, th');
  if (cell && first.contains(cell)) return null;
  const last = itemIn(list, r.endContainer) ?? first;
  const items = [];
  for (let el = first; el; el = el.nextElementSibling) {
    if (el.localName === 'li') items.push(el);
    if (el === last) break;
  }
  return { list, items };
}

/** list と同じ種類の子リスト（ToDo リストなら ToDo の形も引き継ぐ） */
function newSubList(list) {
  const sub = document.createElement(list.localName);
  if (list.matches('ul.todo-list')) {
    sub.className = 'todo-list';
    sub.setAttribute('style', 'list-style: none;');
  }
  return sub;
}

/** li の末尾の子リスト。無ければ list と同じ種類で作る */
function subListOf(li, list) {
  const last = li.lastElementChild;
  if (last?.matches(LIST)) return last;
  const sub = newSubList(list);
  li.append(sub);
  return sub;
}

/** 項目を動かしても、選択範囲を同じ文字の位置に保つ */
function keepingSelection(ed, move) {
  const r = ed.getRange();
  const saved = r && [r.startContainer, r.startOffset, r.endContainer, r.endOffset];
  move();
  if (!saved) return;
  const next = document.createRange();
  next.setStart(saved[0], saved[1]);
  next.setEnd(saved[2], saved[3]);
  ed.selectRange(next);
}

/**
 * 選択中の項目を、一つ上の項目の子リストに移す。
 * リストの中なら true（先頭の項目で動かせない場合も、Tab でフォーカスが移らないよう true）。
 */
export function indentListItems(ed) {
  const sel = listItemsAtSelection(ed);
  if (!sel) return false;
  const { list, items } = sel;
  const prev = items[0].previousElementSibling;
  if (prev?.localName !== 'li') return true;
  ed.transact(() => keepingSelection(ed, () => subListOf(prev, list).append(...items)));
  return true;
}

/**
 * 選択中の項目を、親の項目の後ろ（一段上のリスト）に移す。
 * 後ろに続く項目は、移した最後の項目の子リストにして順序を保つ。
 * 動かしたら true。最上位のリストやリストの外なら false。
 */
export function outdentListItems(ed) {
  const sel = listItemsAtSelection(ed);
  if (!sel) return false;
  const { list, items } = sel;
  const parentItem = list.parentElement;
  if (parentItem?.localName !== 'li') return false;
  ed.transact(() => keepingSelection(ed, () => {
    const last = items.at(-1);
    const rest = [];
    for (let el = last.nextElementSibling; el; el = el.nextElementSibling) if (el.localName === 'li') rest.push(el);
    if (rest.length) subListOf(last, list).append(...rest);
    parentItem.after(...items);
    if (!list.querySelector('li')) list.remove();
  }));
  return true;
}

export const listIndentKeymap = Object.freeze({
  Tab: (ed) => indentListItems(ed),
  // 最上位のリストでは何もしないが、フォーカスが移らないようにキーは使う
  'Shift-Tab': (ed) => outdentListItems(ed) || !!listItemsAtSelection(ed),
});
