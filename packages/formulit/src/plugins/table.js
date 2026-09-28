import { icons } from '../icons.js';

/**
 * 表：挿入、行・列の挿入／削除（結合セル対応）、セルの結合・分割、見出し行・列、
 * キャプション、表・セルのプロパティ、Tab でのセル移動、複数セル選択の表示。
 */

const cellAt = (ed) => ed.closestAtSelection('td,th');
const tableAt = (ed) => cellAt(ed)?.closest('table') ?? null;

function emptyCell(tag) {
  const c = document.createElement(tag);
  c.append(document.createElement('br'));
  return c;
}

/* ================= グリッドモデル ================= */

/**
 * 表を「行 × 列」の格子にする。結合セルは覆うマスすべてに同じセルが入る。
 * pos: cell → { r, c, rs, cs }（開始位置と大きさ）
 */
export function buildGrid(table) {
  const rows = [...table.rows];
  const grid = rows.map(() => []);
  const pos = new Map();
  rows.forEach((tr, r) => {
    let c = 0;
    for (const cell of tr.cells) {
      while (grid[r][c]) c++;
      const rs = Math.min(cell.rowSpan > 0 ? cell.rowSpan : rows.length - r, rows.length - r);
      const cs = Math.max(1, cell.colSpan || 1);
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) grid[r + i][c + j] = cell;
      pos.set(cell, { r, c, rs, cs });
      c += cs;
    }
  });
  const width = Math.max(0, ...grid.map((g) => g.length));
  return { rows, grid, pos, width };
}

function setSpan(cell, name, n) {
  if (n > 1) cell.setAttribute(name, String(n));
  else cell.removeAttribute(name);
}

/** 行 r に、列 c から始まるセルとして挿入する（その行で始まるセルの並びを保つ） */
function placeInRow(g, r, cell, c) {
  const tr = g.rows[r];
  const next = [...tr.cells].find((x) => g.pos.get(x)?.c > c);
  if (next) next.before(cell); else tr.append(cell);
}

/** 選択範囲の始点と終点のセルを対角とする長方形（結合セルがはみ出す場合は広げる） */
export function selectedCellsInfo(ed) {
  const r = ed.getRange();
  const start = cellAt(ed);
  if (!r || !start) return null;
  const table = start.closest('table');
  const endEl = r.endContainer.nodeType === 1 ? r.endContainer : r.endContainer.parentElement;
  let end = endEl?.closest('td,th');
  if (!end || end.closest('table') !== table) end = start;
  const g = buildGrid(table);
  const a = g.pos.get(start);
  const b = g.pos.get(end);
  if (!a || !b) return null;
  let rect = {
    r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c),
    r2: Math.max(a.r + a.rs - 1, b.r + b.rs - 1), c2: Math.max(a.c + a.cs - 1, b.c + b.cs - 1),
  };
  for (let changed = true; changed;) {
    changed = false;
    for (let y = rect.r1; y <= rect.r2; y++) {
      for (let x = rect.c1; x <= rect.c2; x++) {
        const p = g.pos.get(g.grid[y]?.[x]);
        if (!p) continue;
        const n = { r1: Math.min(rect.r1, p.r), c1: Math.min(rect.c1, p.c), r2: Math.max(rect.r2, p.r + p.rs - 1), c2: Math.max(rect.c2, p.c + p.cs - 1) };
        if (n.r1 !== rect.r1 || n.c1 !== rect.c1 || n.r2 !== rect.r2 || n.c2 !== rect.c2) { rect = n; changed = true; }
      }
    }
  }
  const cells = [];
  for (let y = rect.r1; y <= rect.r2; y++) {
    for (let x = rect.c1; x <= rect.c2; x++) {
      const cell = g.grid[y]?.[x];
      if (cell && !cells.includes(cell)) cells.push(cell);
    }
  }
  return { table, g, rect, cells, start };
}

function afterStructureChange(ed, table, r, c) {
  if (!table.rows.length || !table.querySelector('td,th')) return removeTable(ed, table);
  [...table.querySelectorAll(':scope > thead, :scope > tbody, :scope > tfoot')].forEach((s) => !s.rows.length && s.remove());
  const g = buildGrid(table);
  const rr = Math.max(0, Math.min(r, g.rows.length - 1));
  const target = g.grid[rr]?.[Math.max(0, Math.min(c, g.width - 1))] ?? table.querySelector('td,th');
  ed.setCaretAt(target, 0);
}

/* ================= 挿入 ================= */

async function insertTable(ed) {
  const values = await ed.openDialog({
    title: '表を挿入',
    submitLabel: '挿入',
    fields: [
      { name: 'rows', label: '行数', type: 'number', min: 1, value: 3, half: true },
      { name: 'cols', label: '列数', type: 'number', min: 1, value: 3, half: true },
      { name: 'header', label: '1行目を見出し行にする', type: 'checkbox', value: true },
    ],
  });
  if (!values) return;
  const rows = Math.max(1, Math.min(50, parseInt(values.rows, 10) || 1));
  const cols = Math.max(1, Math.min(20, parseInt(values.cols, 10) || 1));
  const table = document.createElement('table');
  if (values.header) {
    const tr = table.createTHead().insertRow();
    for (let c = 0; c < cols; c++) tr.append(emptyCell('th'));
  }
  const tbody = table.createTBody();
  const bodyRows = Math.max(1, values.header ? rows - 1 : rows);
  for (let r = 0; r < bodyRows; r++) {
    const tr = tbody.insertRow();
    for (let c = 0; c < cols; c++) tr.append(emptyCell('td'));
  }
  ed.insertNodes(table);
  ed.setCaretAt(table.querySelector('th,td'), 0);
}

function insertRow(ed, below) {
  const cell = cellAt(ed);
  if (!cell) return;
  ed.transact(() => {
    const table = cell.closest('table');
    const g = buildGrid(table);
    const p = g.pos.get(cell);
    const at = below ? p.r + p.rs : p.r;
    const refRow = g.rows[below ? at - 1 : at];
    // 見出し行（thead）の下に追加する場合は本文側（tbody の先頭）へ
    const intoBody = below && refRow.parentElement.localName === 'thead' && g.rows[at]?.parentElement !== refRow.parentElement;
    const inHead = !intoBody && refRow.parentElement.localName === 'thead';
    const tr = document.createElement('tr');
    const done = new Set();
    for (let c = 0; c < g.width; c++) {
      const up = at > 0 ? g.grid[at - 1]?.[c] : null;
      const down = g.grid[at]?.[c];
      if (up && up === down) {
        // 挿入位置をまたいで縦に結合されたセルは伸ばす
        if (!done.has(up)) { up.rowSpan = g.pos.get(up).rs + 1; done.add(up); }
        c += g.pos.get(up).cs - 1;
        continue;
      }
      const ref = g.grid[below ? at - 1 : at]?.[c];
      const tag = inHead ? 'th' : (ref?.localName === 'th' && ref.parentElement.parentElement.localName !== 'thead' ? 'th' : 'td');
      tr.append(emptyCell(tag));
    }
    if (intoBody) {
      const body = table.tBodies[0] ?? table.createTBody();
      body.prepend(tr);
    } else if (at < g.rows.length) {
      g.rows[at].before(tr);
    } else {
      g.rows[at - 1].after(tr);
    }
    afterStructureChange(ed, table, at, p.c);
  });
}

function insertCol(ed, right) {
  const cell = cellAt(ed);
  if (!cell) return;
  ed.transact(() => {
    const table = cell.closest('table');
    const g = buildGrid(table);
    const p = g.pos.get(cell);
    const at = right ? p.c + p.cs : p.c;
    const done = new Set();
    for (let r = 0; r < g.rows.length; r++) {
      const left = at > 0 ? g.grid[r][at - 1] : null;
      const cur = g.grid[r][at];
      if (left && left === cur) {
        if (!done.has(left)) { left.colSpan = g.pos.get(left).cs + 1; done.add(left); }
        continue;
      }
      const ref = (right ? left : cur) ?? left ?? cur;
      placeInRow(g, r, emptyCell(ref?.localName ?? 'td'), at - 0.5);
    }
    afterStructureChange(ed, table, p.r, at);
  });
}

/* ================= 削除 ================= */

function deleteRowAt(table, r) {
  const g = buildGrid(table);
  const done = new Set();
  for (let c = 0; c < g.width; c++) {
    const cell = g.grid[r][c];
    if (!cell || done.has(cell)) continue;
    done.add(cell);
    const p = g.pos.get(cell);
    if (p.rs > 1) {
      setSpan(cell, 'rowspan', p.rs - 1);
      // この行から始まる縦結合セルは次の行へ移す
      if (p.r === r) placeInRow(g, r + 1, cell, p.c);
    }
  }
  g.rows[r].remove();
}

function deleteRows(ed) {
  const info = selectedCellsInfo(ed);
  if (!info) return;
  ed.transact(() => {
    for (let r = info.rect.r2; r >= info.rect.r1; r--) deleteRowAt(info.table, r);
    afterStructureChange(ed, info.table, info.rect.r1, info.rect.c1);
  });
}

function deleteCols(ed) {
  const info = selectedCellsInfo(ed);
  if (!info) return;
  ed.transact(() => {
    const { table } = info;
    for (let c = info.rect.c2; c >= info.rect.c1; c--) {
      const g = buildGrid(table);
      const done = new Set();
      for (let r = 0; r < g.rows.length; r++) {
        const cell = g.grid[r][c];
        if (!cell || done.has(cell)) continue;
        done.add(cell);
        const p = g.pos.get(cell);
        if (p.cs > 1) setSpan(cell, 'colspan', p.cs - 1);
        else cell.remove();
      }
    }
    removeEmptyRows(table);
    afterStructureChange(ed, table, info.rect.r1, info.rect.c1);
  });
}

/** セルが 1 つも無くなった行を取り除き、その行をまたいでいた縦結合を縮める */
function removeEmptyRows(table) {
  for (let r = table.rows.length - 1; r >= 0; r--) {
    if (!table.rows[r].cells.length) deleteRowAt(table, r);
  }
}

function removeTable(ed, table) {
  const p = document.createElement('p');
  p.append(document.createElement('br'));
  const fig = table.parentElement?.localName === 'figure' && table.parentElement.children.length === 1 ? table.parentElement : table;
  fig.replaceWith(p);
  ed.setCaretAt(p, 0);
}

function delTable(ed) {
  const table = tableAt(ed);
  if (table) ed.transact(() => removeTable(ed, table));
}

/* ================= 結合・分割 ================= */

const hasContent = (cell) => cell.textContent.trim() !== '' || !!cell.querySelector('img,table,iframe,video,hr,input');

function mergeCells(ed) {
  const info = selectedCellsInfo(ed);
  if (!info || info.cells.length < 2) return;
  ed.transact(() => {
    const { table, g, rect } = info;
    const first = g.grid[rect.r1][rect.c1];
    const others = info.cells.filter((c) => c !== first);
    if (!hasContent(first)) first.replaceChildren();
    for (const c of others) {
      if (!hasContent(c)) continue;
      if (hasContent(first)) {
        // 段落を含むセル同士はそのまま並べ、テキストだけのセルは改行でつなぐ
        const block = first.lastElementChild && /^(p|div|ul|ol|table|h[1-6]|pre|blockquote)$/.test(first.lastElementChild.localName);
        if (!block) first.append(document.createElement('br'));
      }
      while (c.lastChild?.nodeName === 'BR') c.lastChild.remove();
      first.append(...c.childNodes);
    }
    if (!first.childNodes.length) first.append(document.createElement('br'));
    others.forEach((c) => c.remove());
    setSpan(first, 'rowspan', rect.r2 - rect.r1 + 1);
    setSpan(first, 'colspan', rect.c2 - rect.c1 + 1);
    removeEmptyRows(table);
    ed.setCaretAt(first, 0);
  });
}

/** 縦に分割（左右 2 つのセルにする） */
function splitVertical(ed) {
  const cell = cellAt(ed);
  if (!cell) return;
  ed.transact(() => {
    const table = cell.closest('table');
    const g = buildGrid(table);
    const p = g.pos.get(cell);
    const n = emptyCell(cell.localName);
    setSpan(n, 'rowspan', p.rs);
    if (p.cs > 1) {
      setSpan(cell, 'colspan', Math.ceil(p.cs / 2));
      setSpan(n, 'colspan', Math.floor(p.cs / 2));
    } else {
      // 同じ列の他のセルを 1 列分広げる
      const done = new Set([cell]);
      for (let r = 0; r < g.rows.length; r++) {
        const other = g.grid[r][p.c];
        if (!other || done.has(other)) continue;
        done.add(other);
        setSpan(other, 'colspan', g.pos.get(other).cs + 1);
      }
    }
    cell.after(n);
    ed.setCaretAt(n, 0);
  });
}

/** 横に分割（上下 2 つのセルにする） */
function splitHorizontal(ed) {
  const cell = cellAt(ed);
  if (!cell) return;
  ed.transact(() => {
    const table = cell.closest('table');
    const g = buildGrid(table);
    const p = g.pos.get(cell);
    const n = emptyCell(cell.localName);
    setSpan(n, 'colspan', p.cs);
    if (p.rs > 1) {
      const topRows = Math.ceil(p.rs / 2);
      setSpan(cell, 'rowspan', topRows);
      setSpan(n, 'rowspan', p.rs - topRows);
      placeInRow(g, p.r + topRows, n, p.c - 0.5);
    } else {
      // 新しい行を追加し、同じ行の他のセルは縦に 1 行分広げる
      const done = new Set([cell]);
      for (let c = 0; c < g.width; c++) {
        const other = g.grid[p.r][c];
        if (!other || done.has(other)) continue;
        done.add(other);
        setSpan(other, 'rowspan', g.pos.get(other).rs + 1);
      }
      const tr = document.createElement('tr');
      tr.append(n);
      g.rows[p.r].after(tr);
    }
    ed.setCaretAt(n, 0);
  });
}

/* ================= 見出し・キャプション ================= */

function renameCell(cell, tag) {
  if (cell.localName === tag) return cell;
  const n = document.createElement(tag);
  for (const a of cell.attributes) n.setAttribute(a.name, a.value);
  n.append(...cell.childNodes);
  cell.replaceWith(n);
  return n;
}

const headerRowActive = (ed) => (tableAt(ed)?.tHead?.rows.length ?? 0) > 0;

function toggleHeaderRow(ed) {
  const table = tableAt(ed);
  if (!table) return;
  ed.transact(() => {
    const head = table.tHead;
    if (head?.rows.length) {
      const body = table.tBodies[0] ?? table.createTBody();
      for (const tr of [...head.rows].reverse()) {
        body.prepend(tr);
        [...tr.cells].forEach((c) => renameCell(c, 'td'));
      }
      head.remove();
    } else {
      const first = table.rows[0];
      const newHead = table.createTHead();
      newHead.append(first);
      [...first.cells].forEach((c) => renameCell(c, 'th'));
    }
    afterStructureChange(ed, table, 0, 0);
  });
}

function firstColumnCells(table) {
  const g = buildGrid(table);
  const out = [];
  g.rows.forEach((tr, r) => {
    if (tr.parentElement.localName === 'thead') return;
    const c = g.grid[r][0];
    if (c && !out.includes(c)) out.push(c);
  });
  return out;
}

const headerColActive = (ed) => {
  const t = tableAt(ed);
  const cells = t ? firstColumnCells(t) : [];
  return cells.length > 0 && cells.every((c) => c.localName === 'th');
};

function toggleHeaderCol(ed) {
  const table = tableAt(ed);
  if (!table) return;
  const on = !headerColActive(ed);
  ed.transact(() => {
    firstColumnCells(table).forEach((c) => {
      const n = renameCell(c, on ? 'th' : 'td');
      if (on) n.setAttribute('scope', 'row'); else if (n.getAttribute('scope') === 'row') n.removeAttribute('scope');
    });
    afterStructureChange(ed, table, 0, 0);
  });
}

function toggleCaption(ed) {
  const table = tableAt(ed);
  if (!table) return;
  ed.transact(() => {
    if (table.caption) { table.deleteCaption(); afterStructureChange(ed, table, 0, 0); return; }
    const cap = table.createCaption();
    ed.setCaretAt(cap, 0);
  });
}

/* ================= プロパティ ================= */

const BORDER_STYLES = [
  { value: '', label: '指定なし' }, { value: 'none', label: 'なし' }, { value: 'solid', label: '実線' },
  { value: 'dotted', label: '点線' }, { value: 'dashed', label: '破線' }, { value: 'double', label: '二重線' },
];

function setStyles(el, map) {
  for (const [k, v] of Object.entries(map)) {
    if (v) el.style.setProperty(k, v);
    else el.style.removeProperty(k);
  }
  if (el.getAttribute('style') === '') el.removeAttribute('style');
}

const borderFields = (el) => [
  { name: 'borderStyle', label: '枠線の種類', type: 'select', options: BORDER_STYLES, value: el.style.borderStyle.split(' ')[0] ?? '', half: true },
  { name: 'borderWidth', label: '枠線の太さ', type: 'text', value: el.style.borderWidth.split(' ')[0] ?? '', placeholder: '例: 1px', half: true },
  { name: 'borderColor', label: '枠線の色', type: 'color', value: el.style.borderColor.split(' ')[0] ?? '' },
  { name: 'background', label: '背景色', type: 'color', value: el.style.backgroundColor },
];
const borderStyles = (v) => ({
  'border-style': v.borderStyle, 'border-width': v.borderWidth, 'border-color': v.borderColor, 'background-color': v.background,
});

function tableAlign(table) {
  if (table.style.float === 'left') return 'left';
  if (table.style.float === 'right') return 'right';
  if (table.style.marginLeft === 'auto' && table.style.marginRight === 'auto') return 'center';
  return '';
}

async function tableProperties(ed) {
  const table = tableAt(ed);
  if (!table) return;
  const firstCell = table.querySelector('td,th');
  const v = await ed.openDialog({
    title: '表のプロパティ', submitLabel: '適用', wide: true,
    fields: [
      ...borderFields(table),
      { name: 'cells', label: '枠線をセルにも適用する', type: 'checkbox', value: !!firstCell?.style.borderStyle },
      { name: 'width', label: '幅', type: 'text', value: table.style.width, placeholder: '例: 100%, 600px', half: true },
      { name: 'height', label: '高さ', type: 'text', value: table.style.height, placeholder: '例: 200px', half: true },
      { name: 'align', label: '配置', type: 'select', value: tableAlign(table), options: [
        { value: '', label: '指定なし' }, { value: 'left', label: '左（回り込み）' }, { value: 'center', label: '中央' }, { value: 'right', label: '右（回り込み）' }] },
    ],
  });
  if (!v) return;
  ed.transact(() => {
    setStyles(table, { ...borderStyles(v), width: v.width, height: v.height });
    if (v.borderStyle && v.borderStyle !== 'none' && !table.style.borderCollapse) table.style.borderCollapse = 'collapse';
    setStyles(table, {
      float: v.align === 'left' || v.align === 'right' ? v.align : '',
      'margin-left': v.align === 'center' ? 'auto' : v.align === 'right' ? '1.5em' : '',
      'margin-right': v.align === 'center' ? 'auto' : v.align === 'left' ? '1.5em' : '',
    });
    if (v.cells) {
      table.querySelectorAll('td,th').forEach((c) => {
        if (c.closest('table') === table) setStyles(c, { 'border-style': v.borderStyle, 'border-width': v.borderWidth, 'border-color': v.borderColor });
      });
    }
  });
}

async function cellProperties(ed) {
  const info = selectedCellsInfo(ed);
  if (!info) return;
  const c = info.cells[0];
  const v = await ed.openDialog({
    title: `セルのプロパティ${info.cells.length > 1 ? `（${info.cells.length} セル）` : ''}`, submitLabel: '適用', wide: true,
    fields: [
      ...borderFields(c),
      { name: 'padding', label: '内側の余白', type: 'text', value: c.style.padding, placeholder: '例: 8px', half: true },
      { name: 'width', label: '幅', type: 'text', value: c.style.width, placeholder: '例: 120px', half: true },
      { name: 'textAlign', label: '横方向の配置', type: 'select', value: c.style.textAlign, half: true, options: [
        { value: '', label: '指定なし' }, { value: 'left', label: '左' }, { value: 'center', label: '中央' }, { value: 'right', label: '右' }, { value: 'justify', label: '両端揃え' }] },
      { name: 'verticalAlign', label: '縦方向の配置', type: 'select', value: c.style.verticalAlign, half: true, options: [
        { value: '', label: '指定なし' }, { value: 'top', label: '上' }, { value: 'middle', label: '中央' }, { value: 'bottom', label: '下' }] },
    ],
  });
  if (!v) return;
  ed.transact(() => {
    for (const cell of info.cells) {
      setStyles(cell, {
        ...borderStyles(v), padding: v.padding, width: v.width, 'text-align': v.textAlign, 'vertical-align': v.verticalAlign,
      });
    }
  });
}

/* ================= キーボード ================= */

/** Tab / Shift+Tab でセル間を移動（最後のセルで Tab を押すと行を追加） */
function moveCell(ed, e) {
  const cell = cellAt(ed);
  if (!cell) return false;
  const table = cell.closest('table');
  const cells = [...table.querySelectorAll('th,td')].filter((c) => c.closest('table') === table);
  const i = cells.indexOf(cell) + (e.shiftKey ? -1 : 1);
  if (i < 0) return true;
  if (i >= cells.length) { insertRow(ed, true); return true; }
  const r = document.createRange();
  r.selectNodeContents(cells[i]);
  ed.selectRange(r);
  return true;
}

/* ================= プラグイン ================= */

const inTable = (ed) => !!cellAt(ed);
const multi = (ed) => (selectedCellsInfo(ed)?.cells.length ?? 0) > 1;

export const tablePlugin = {
  name: 'table',
  items: {
    table: { icon: icons.table, title: '表を挿入', action: insertTable },
    tableRowAbove: { icon: icons.rowAbove, title: '上に行を挿入', action: (ed) => insertRow(ed, false), enabled: inTable },
    tableRowAdd: { icon: icons.rowAdd, title: '下に行を挿入', action: (ed) => insertRow(ed, true), enabled: inTable },
    tableColLeft: { icon: icons.colLeft, title: '左に列を挿入', action: (ed) => insertCol(ed, false), enabled: inTable },
    tableColAdd: { icon: icons.colAdd, title: '右に列を挿入', action: (ed) => insertCol(ed, true), enabled: inTable },
    tableRowDel: { icon: icons.rowDel, title: '行を削除', action: deleteRows, enabled: inTable },
    tableColDel: { icon: icons.colDel, title: '列を削除', action: deleteCols, enabled: inTable },
    tableMerge: { icon: icons.merge, title: 'セルを結合（複数セルを選択）', action: mergeCells, enabled: multi },
    tableSplitV: { icon: icons.splitV, title: 'セルを縦に分割', action: splitVertical, enabled: inTable },
    tableSplitH: { icon: icons.splitH, title: 'セルを横に分割', action: splitHorizontal, enabled: inTable },
    tableHeaderRow: { icon: icons.headerRow, title: '見出し行', action: toggleHeaderRow, active: headerRowActive, enabled: inTable },
    tableHeaderCol: { icon: icons.headerCol, title: '見出し列', action: toggleHeaderCol, active: headerColActive, enabled: inTable },
    tableCaption: { icon: icons.caption, title: '表のキャプション', action: toggleCaption, active: (ed) => !!tableAt(ed)?.caption, enabled: inTable },
    tableProps: { icon: icons.tableProps, title: '表のプロパティ', action: tableProperties, enabled: inTable },
    cellProps: { icon: icons.cellProps, title: 'セルのプロパティ', action: cellProperties, enabled: inTable },
    tableDel: { icon: icons.tableDel, title: '表を削除', action: delTable, enabled: inTable },
  },
  contextToolbars: [{
    name: 'table',
    match: (ed) => (ed.selectedObject ? null : tableAt(ed)),
    items: ['tableRowAbove', 'tableRowAdd', 'tableColLeft', 'tableColAdd', 'tableRowDel', 'tableColDel', '|',
      'tableMerge', 'tableSplitV', 'tableSplitH', '|', 'tableHeaderRow', 'tableHeaderCol', 'tableCaption', '|',
      'tableProps', 'cellProps', '|', 'tableDel'],
  }],
  keymap: {
    Tab: moveCell,
    'Shift-Tab': moveCell,
  },
  init(ed) {
    // 複数セルを選択しているときは、選択中のセルに印を付けて表示する（内部属性なので出力されない）
    const onSel = () => {
      const info = selectedCellsInfo(ed);
      const cells = info && info.cells.length > 1 ? info.cells : [];
      ed.editable.querySelectorAll('[data-formulit-cell-selected]').forEach((c) => {
        if (!cells.includes(c)) c.removeAttribute('data-formulit-cell-selected');
      });
      cells.forEach((c) => c.setAttribute('data-formulit-cell-selected', ''));
    };
    ed.addEventListener('formulit-selectionchange', onSel);
    return () => ed.removeEventListener('formulit-selectionchange', onSel);
  },
};
