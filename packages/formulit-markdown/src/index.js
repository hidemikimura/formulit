// formulit（<formulit-editor> とプラグイン）を読み込んでから、<formulit-markdown> を定義する
import '@hidemikimura/formulit';
import { FormulitMarkdown, MARKDOWN_TOOLBAR, dedent } from './editor.js';

if (!customElements.get('formulit-markdown')) customElements.define('formulit-markdown', FormulitMarkdown);

export { FormulitMarkdown, MARKDOWN_TOOLBAR, dedent };
export { createMarkdownIt, markdownToHTML, parseBlocks } from './parse.js';
export { htmlToMarkdown, nodesToMarkdown, detectStyle, DEFAULT_STYLE } from './serialize.js';
