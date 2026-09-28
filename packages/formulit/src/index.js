import { FormulitEditor, DEFAULT_TOOLBAR, COMPACT_TOOLBAR, cleanPastedHTML, stripCopiedStyles } from './formulit-editor.js';
import { registerPlugin, getPlugin, getPlugins } from './core/plugins.js';
import { corePlugin } from './plugins/core.js';
import { basicPlugin } from './plugins/basic.js';
import { linkPlugin } from './plugins/link.js';
import { imagePlugin } from './plugins/image.js';
import { tablePlugin } from './plugins/table.js';
import { formattingPlugin } from './plugins/formatting.js';
import { codeBlockPlugin } from './plugins/code-block.js';
import { embedPlugin } from './plugins/embed.js';
import { typingPlugin } from './plugins/typing.js';
import { listsPlugin } from './plugins/lists.js';
import { productivityPlugin } from './plugins/productivity.js';
import { variablesPlugin } from './plugins/variables.js';
import { icons } from './icons.js';

// 登録順＝キー操作の優先順（コードブロック内の Tab を表より先に処理する）
[
  corePlugin, basicPlugin, formattingPlugin, typingPlugin, variablesPlugin, codeBlockPlugin, listsPlugin,
  linkPlugin, imagePlugin, embedPlugin, productivityPlugin, tablePlugin,
].forEach(registerPlugin);

if (!customElements.get('formulit-editor')) customElements.define('formulit-editor', FormulitEditor);

export * from './core/html.js';
export * from './core/inline.js';
export {
  DEFAULT_FONT_FAMILIES, DEFAULT_FONT_SIZES, DEFAULT_LINE_HEIGHTS, DEFAULT_COLORS, SPECIAL_CHARS,
} from './plugins/formatting.js';
export { DEFAULT_IMAGE_STYLES, insertImageFiles, uploadImage } from './plugins/image.js';
export { MEDIA_PROVIDERS, matchMedia } from './plugins/embed.js';
export { DEFAULT_CODE_LANGUAGES, toCodeBlock } from './plugins/code-block.js';
export { SLASH_COMMANDS } from './plugins/typing.js';
export { toggleTodo } from './plugins/lists.js';
export { findMatches, getStats, saveNow, SHORTCUTS, MARKDOWN_SHORTCUTS } from './plugins/productivity.js';
export { buildGrid } from './plugins/table.js';
export {
  DEFAULT_VARIABLE_FORMAT, normalizeVariables, filterVariables, formatVariable, insertVariable,
} from './plugins/variables.js';
export {
  serializeWithSource, equivalentHTML, tokenize, buildSourceTree, setNodeData, getNodeData, isNodeUnchanged,
} from './core/source-map.js';
export {
  FormulitEditor, DEFAULT_TOOLBAR, COMPACT_TOOLBAR, cleanPastedHTML, stripCopiedStyles,
  registerPlugin, getPlugin, getPlugins, icons,
  corePlugin, basicPlugin, formattingPlugin, typingPlugin, codeBlockPlugin, listsPlugin,
  linkPlugin, imagePlugin, embedPlugin, productivityPlugin, tablePlugin, variablesPlugin,
};
