/**
 * プラグインレジストリ。
 *
 * プラグインの形:
 * {
 *   name: 'my-plugin',
 *   items: {                       // ツールバー項目（名前 → 定義）
 *     myButton: {
 *       type: 'button',            // 'button'（既定） | 'select' | 'dropdown'（panel(editor, close) で中身を返す）
 *       icon: svgテンプレート | 文字列,
 *       title: 'ツールチップ',
 *       action(editor, value) {},  // クリック / 選択時
 *       active(editor) {},         // 押下状態（任意）
 *       enabled(editor) {},        // 有効状態（任意）
 *       options: [{label, value}], // type: 'select' の場合
 *       value(editor) {},          // type: 'select' の現在値
 *     },
 *   },
 *   keymap: { 'Mod-b': 'myButton' }, // ショートカット → 項目名 または関数(editor)
 *   contextToolbars: [{              // 要素を選んだときに出る浮動ツールバー
 *     name: 'image',
 *     match(editor) { return 要素 | null },
 *     items: ['imgCaption', '|', 'imgDelete'],
 *   }],
 *   init(editor) { return () => {} } // 各エディタ生成時。戻り値の関数は破棄時に呼ばれる
 * }
 */
const registry = new Map();

export function registerPlugin(plugin) {
  if (!plugin?.name) throw new Error('plugin.name is required');
  registry.set(plugin.name, plugin);
}

export function getPlugin(name) {
  return registry.get(name);
}

export function getPlugins(names) {
  if (!names) return [...registry.values()];
  return names.map((n) => registry.get(n)).filter(Boolean);
}
