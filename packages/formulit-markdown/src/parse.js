/**
 * Markdown（GFM）→ HTML。
 *
 * markdown-it で解析し、トップレベルのブロックごとに
 *   - 原文のどの行から来たか（text）
 *   - ブロック同士の間の原文（gap：空行やリンクの参照定義）
 * を記録する。エディタはこの対応を使って、編集していないブロックを原文のまま書き出す。
 *
 * GFM: 表・取り消し線（markdown-it 標準）、自動リンク（linkify）、ToDo リスト（下の taskLists）。
 * ToDo リストは formulit の ToDo と同じ形 <ul class="todo-list" style="list-style: none;"><li><input type="checkbox" disabled>…
 * で出力するので、formulit の ToDo 機能（クリックで完了・Enter で追加）がそのまま使える。
 */
import MarkdownIt from 'markdown-it';

/** formulit-markdown が使う markdown-it の設定 */
export function createMarkdownIt(options = {}) {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false, breaks: false, ...options });
  md.use(taskLists);
  return md;
}

let shared = null;
const defaultMd = () => (shared ??= createMarkdownIt());

/** Markdown を HTML にする（ブロックの対応が不要な場合） */
export function markdownToHTML(src, md = defaultMd()) {
  return md.render(String(src ?? ''));
}

/**
 * Markdown をトップレベルのブロック（グループ）に分けて HTML にする。
 * 戻り値 { groups: [{ html, text, gap }], lead, trail, lines }
 *   text: そのブロックの原文、gap: 直前のブロックとの間の原文（最初のブロックは文書の先頭から）
 *   trail: 最後のブロックより後ろの原文
 * 生の HTML ブロックで開いたタグが後ろのブロックで閉じる場合（<div> … 空行 … </div>）は 1 つのグループにまとめる。
 */
export function parseBlocks(src, md = defaultMd()) {
  src = String(src ?? '');
  const env = {};
  const tokens = md.parse(src, env);
  const lines = src.split('\n');
  // トップレベルのトークン列をブロックごとに分ける
  const blocks = [];
  let cur = null;
  let depth = 0;
  for (const t of tokens) {
    if (depth === 0) {
      cur = { tokens: [], start: t.map?.[0] ?? null, end: t.map?.[1] ?? null, html: false };
      blocks.push(cur);
    }
    cur.tokens.push(t);
    if (t.type === 'html_block') cur.html = true;
    if (t.map && cur.end != null) cur.end = Math.max(cur.end, t.map[1]);
    depth += t.nesting;
  }
  // 開いたままの生 HTML ブロックは、閉じるまで後ろのブロックとまとめる
  const merged = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = { ...blocks[i], tokens: [...blocks[i].tokens] };
    let balance = b.html ? tagBalance(b.tokens) : 0;
    while (balance > 0 && i + 1 < blocks.length) {
      const n = blocks[++i];
      b.tokens.push(...n.tokens);
      if (n.end != null) b.end = Math.max(b.end ?? n.end, n.end);
      balance += n.html ? tagBalance(n.tokens) : 0;
    }
    merged.push(b);
  }
  const slice = (a, z) => lines.slice(a, z).join('\n');
  const groups = [];
  let prevEnd = 0;
  for (const b of merged) {
    if (b.start == null) continue;
    const html = md.renderer.render(b.tokens, md.options, env);
    // gap: 直前のブロックの終わり（改行を含む）から、このブロックの先頭まで
    const gap = groups.length
      ? (b.start === prevEnd ? '\n' : `\n${slice(prevEnd, b.start)}\n`)
      : (b.start > 0 ? `${slice(0, b.start)}\n` : '');
    groups.push({ html, text: slice(b.start, b.end), gap });
    prevEnd = b.end;
  }
  let trail = groups.length ? (prevEnd < lines.length ? `\n${slice(prevEnd, lines.length)}` : '') : src;
  // ブロック末尾の空行（リストなどで範囲に含まれる）は、次との間（gap）へ移す
  let trailOut = trail;
  for (let i = 0; i < groups.length; i++) {
    const m = /\n+$/.exec(groups[i].text);
    if (!m) continue;
    groups[i].text = groups[i].text.slice(0, m.index);
    if (i + 1 < groups.length) groups[i + 1].gap = m[0] + groups[i + 1].gap;
    else trailOut = m[0] + trailOut;
  }
  trail = trailOut;
  // 念のため、つなぎ直すと原文に戻ることを確かめる（戻らなければ全体を 1 ブロックとして扱う）
  const rebuilt = groups.map((g) => g.gap + g.text).join('') + trail;
  if (rebuilt !== src) return { groups: [{ html: md.render(src), text: src, gap: '' }], trail: '', env, exact: false };
  return { groups, trail, env, exact: true };
}

/* ---------- 生 HTML ブロックの開き・閉じの数 ---------- */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function tagBalance(tokens) {
  let n = 0;
  for (const t of tokens) {
    if (t.type !== 'html_block') continue;
    const s = t.content.replace(/<!--[\s\S]*?-->/g, '');
    for (const [, close, name, self] of s.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)) {
      const tag = name.toLowerCase();
      if (VOID.has(tag) || self) continue;
      n += close ? -1 : 1;
    }
  }
  return n;
}

/* ---------- GFM の ToDo リスト ---------- */

const TASK = /^\[([ xX])\](?=\s|$)\s?/;

/** 箇条書きのすべての項目が [ ] / [x] で始まるとき、formulit の ToDo リストにする */
function taskLists(md) {
  md.core.ruler.after('inline', 'formulit_task_lists', (state) => {
    const t = state.tokens;
    for (let i = 0; i < t.length; i++) {
      if (t[i].type !== 'bullet_list_open') continue;
      const level = t[i].level;
      const items = [];
      let ok = true;
      for (let j = i + 1; j < t.length && !(t[j].type === 'bullet_list_close' && t[j].level === level); j++) {
        if (t[j].type !== 'list_item_open' || t[j].level !== level + 1) continue;
        const inline = t[j + 1]?.type === 'paragraph_open' ? t[j + 2] : null;
        const m = inline?.type === 'inline' ? TASK.exec(inline.content) : null;
        if (!m || inline.children?.[0]?.type !== 'text' || !inline.children[0].content.startsWith(m[0].trimEnd())) { ok = false; break; }
        items.push({ inline, m });
      }
      if (!ok || !items.length) continue;
      t[i].attrJoin('class', 'todo-list');
      t[i].attrSet('style', 'list-style: none;');
      for (const { inline, m } of items) {
        const first = inline.children[0];
        first.content = first.content.slice(Math.min(first.content.length, m[0].length));
        const box = new state.Token('html_inline', '', 0);
        box.content = `<input type="checkbox" disabled${m[1] === ' ' ? '' : ' checked'}>`;
        inline.children.unshift(box);
        if (!first.content) inline.children.splice(1, 1);
      }
    }
  });
}
