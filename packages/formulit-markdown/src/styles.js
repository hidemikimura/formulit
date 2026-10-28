/**
 * <formulit-markdown> の本文の既定の見た目（Markdown のプレビューらしい最小限のもの）。
 * :where() で詳細度を 0 にしているので、ページの CSS で簡単に上書きできる。
 * 使わない場合は <formulit-markdown plain> とする。
 */
export const markdownSheet = new CSSStyleSheet();
markdownSheet.replaceSync(`
  :where(formulit-markdown:not([plain])) > .formulit-editable { line-height: 1.7; }
  :where(formulit-markdown:not([plain])) > .formulit-editable :where(h1, h2) { padding-bottom: .25em; border-bottom: 1px solid #e5e7eb; border-bottom-color: light-dark(#e5e7eb, #3d444d); }
  :where(formulit-markdown:not([plain])) > .formulit-editable :where(blockquote) { margin: 1em 0; padding: 0 1em; color: #57606a; color: light-dark(#57606a, #9198a1); border-left: .25em solid #d0d7de; border-left-color: light-dark(#d0d7de, #3d444d); }
  :where(formulit-markdown:not([plain])) > .formulit-editable :where(code) { font: .9em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: rgb(175 184 193 / .2); background: light-dark(rgb(175 184 193 / .2), rgb(101 108 118 / .3)); padding: .15em .35em; border-radius: 4px; }
  :where(formulit-markdown:not([plain])) > .formulit-editable :where(pre) { background: #f6f8fa; background: light-dark(#f6f8fa, #151b23); padding: 12px 16px; border-radius: 6px; overflow: auto; }
  :where(formulit-markdown:not([plain])) > .formulit-editable :where(pre code) { background: none; padding: 0; font-size: .88em; }
  :where(formulit-markdown:not([plain])) > .formulit-editable :where(table) { border-collapse: collapse; }
  :where(formulit-markdown:not([plain])) > .formulit-editable :where(th, td) { border: 1px solid #d0d7de; border-color: light-dark(#d0d7de, #3d444d); padding: 4px 12px; }
  :where(formulit-markdown:not([plain])) > .formulit-editable :where(th) { background: #f6f8fa; background: light-dark(#f6f8fa, #151b23); }
  :where(formulit-markdown:not([plain])) > .formulit-editable :where(hr) { border: 0; border-top: 2px solid #d0d7de; border-top-color: light-dark(#d0d7de, #3d444d); margin: 1.5em 0; }
  :where(formulit-markdown:not([plain])) > .formulit-editable :where(img) { max-width: 100%; }
`);

const styled = new WeakSet();
export function adoptMarkdownStyles(host) {
  const root = host.getRootNode();
  if (!root || styled.has(root) || !('adoptedStyleSheets' in root)) return;
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, markdownSheet];
  styled.add(root);
}
