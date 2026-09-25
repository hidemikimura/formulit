import { icons } from '../icons.js';

/** 元に戻す／やり直し／HTMLソース切替 */
export const corePlugin = {
  name: 'core',
  items: {
    undo: {
      icon: icons.undo, title: '元に戻す (Ctrl/⌘+Z)',
      action: (ed) => ed.undo(),
      enabled: (ed) => ed.history.canUndo,
    },
    redo: {
      icon: icons.redo, title: 'やり直し (Ctrl/⌘+Shift+Z)',
      action: (ed) => ed.redo(),
      enabled: (ed) => ed.history.canRedo,
    },
    source: {
      icon: icons.source, title: 'HTMLソース',
      toggle: true, availableInSource: true,
      action: (ed) => ed.toggleSource(),
      active: (ed) => ed.mode === 'source',
    },
  },
};
