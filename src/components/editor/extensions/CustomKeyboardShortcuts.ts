import { Extension } from '@tiptap/core';

export const CustomKeyboardShortcuts = Extension.create({
  name: 'customKeyboardShortcuts',

  addKeyboardShortcuts() {
    return {
      'Mod-a': () => {
        const { doc } = this.editor.state;
        return this.editor.commands.setTextSelection({
          from: 1,
          to: Math.max(1, doc.content.size - 1),
        });
      },
      'Mod-Alt-b': () => this.editor.commands.toggleBadge(),
      'Mod-Alt-B': () => this.editor.commands.toggleBadge(),
      'Mod-Alt-i': () => {
        // Just return true to intercept, maybe trigger slash menu logic later
        return true;
      },
      'Mod-Alt-t': () => {
        this.editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
        return true;
      },
      'Mod-Alt-T': () => {
        this.editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
        return true;
      },
      'Mod-Shift-l': () => this.editor.commands.setTextAlign('left'),
      'Mod-Shift-L': () => this.editor.commands.setTextAlign('left'),
      'Mod-Shift-c': () => this.editor.commands.setTextAlign('center'),
      'Mod-Shift-C': () => this.editor.commands.setTextAlign('center'),
      'Mod-Shift-r': () => this.editor.commands.setTextAlign('right'),
      'Mod-Shift-R': () => this.editor.commands.setTextAlign('right'),
    }
  },
});
