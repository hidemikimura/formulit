import { css, unsafeCSS } from 'lit';

/**
 * 配色（ライト / ダーク）。
 *
 * - 既定ではページの color-scheme に従う（`color-scheme: light dark` のページなら OS の設定で切り替わる。
 *   指定のないページでは従来どおりライト）。`theme="light"` / `theme="dark"` で固定できる。
 * - 各色は内部用の変数 `--_fl-<名前>` で参照する。公開名のあるものはページから上書きできる。
 * - light-dark() の無い古いブラウザではライトの色になる。
 *
 * 名前: [公開する CSS 変数（なければ null）, ライト, ダーク]
 */
export const THEME_COLORS = Object.freeze({
  'bg': ['--formulit-bg', '#fff', '#1f1f1f'],
  'border': ['--formulit-border', '#d0d4d9', '#444746'],
  'toolbar-bg': ['--formulit-toolbar-bg', '#f7f8fa', '#282a2c'],
  'surface': ['--formulit-surface', '#fff', '#2d2f31'], // ドロップダウン・ダイアログ・ポップアップ
  'text': ['--formulit-text', '#3c4043', '#e3e3e3'], // ボタンなど UI の文字
  'text-strong': [null, '#202124', '#e8eaed'],
  'muted': ['--formulit-muted', '#5f6368', '#9aa0a6'],
  'hint': [null, '#9aa0a6', '#80868b'], // プレースホルダー・保護要素の枠
  'accent': ['--formulit-accent', '#1a73e8', '#8ab4f8'],
  'hover': [null, '#e8eaed', '#3c4043'],
  'active-bg': [null, '#e8f0fe', '#36404f'], // 候補の選択中
  'pressed-bg': [null, '#d3e3fd', '#004a77'],
  'pressed-text': [null, '#0b57d0', '#c2e7ff'],
  'primary-bg': [null, '#0b57d0', '#a8c7fa'],
  'primary-text': [null, '#fff', '#062e6f'],
  'input-bg': [null, '#fff', '#1f1f1f'],
  'input-border': [null, '#c4c7c5', '#5f6368'],
  'divider': [null, '#eee', '#3c4043'],
  'kbd-bg': [null, '#f1f3f4', '#3c4043'],
  'kbd-border': [null, '#dadce0', '#5f6368'],
  'danger': [null, '#c5221f', '#f28b82'],
  'mark': [null, '#fde68a', '#6b5300'],
  'mark-current': [null, '#f59e0b', '#f59e0b'],
  'overlay': [null, 'rgb(0 0 0 / .18)', 'rgb(0 0 0 / .5)'],
  'cell-outline': [null, '#c4c7c5', '#5f6368'],
  'cell-selected': [null, 'rgb(26 115 232 / .14)', 'rgb(138 180 248 / .22)'],
  'variable-bg': [null, 'rgb(26 115 232 / .12)', 'rgb(138 180 248 / .18)'],
  'variable-text': [null, '#1a56c4', '#a8c7fa'],
  'done-text': [null, '#80868b', '#9aa0a6'],
});

const declarations = (pick) => Object.entries(THEME_COLORS)
  .map(([name, [pub, light, dark]]) => {
    const value = pick(light, dark);
    return `--_fl-${name}:${pub ? `var(${pub}, ${value})` : value};`;
  })
  .join('');

export const themeStyles = css`
  :host { ${unsafeCSS(declarations((light, dark) => `light-dark(${light}, ${dark})`))} }
  @supports not (color: light-dark(#000, #fff)) {
    :host { ${unsafeCSS(declarations((light) => light))} }
  }
  :host([theme=light]) { color-scheme: light; color: CanvasText; }
  :host([theme=dark]) { color-scheme: dark; color: CanvasText; }
`;
