import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    badge: {
      toggleBadge: () => ReturnType,
      setBadgeColor: (color: string) => ReturnType,
    }
  }
}

export const Badge = Mark.create({
  name: 'badge',
  inclusive: true,
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: element => element.getAttribute('data-color'),
        renderHTML: attributes => {
          if (!attributes.color) return {};
          return {
            'data-color': attributes.color,
            style: `color: ${attributes.color}`,
          };
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="badge"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'badge', class: 'tiptap-badge' }), 0];
  },
  addCommands() {
    return {
      toggleBadge: () => ({ commands }: { commands: any }) => commands.toggleMark(this.name),
      setBadgeColor: (color: string) => ({ commands }: { commands: any }) => commands.updateAttributes(this.name, { color: color || null }),
    };
  },
  addKeyboardShortcuts() {
    return {
      ArrowRight: () => {
        const { state } = this.editor;
        const { selection, doc } = state;
        const { $from, empty } = selection;

        if (!empty || !this.editor.isActive('badge')) {
          return false;
        }

        const pos = $from.pos;
        const marks = doc.resolve(pos).marks();
        const hasBadge = marks.some(m => m.type.name === 'badge');
        
        // Check if there's a badge mark at the next position
        const hasBadgeAfter = pos < doc.content.size && doc.resolve(pos + 1).marks().some(m => m.type.name === 'badge');

        if (hasBadge && !hasBadgeAfter) {
          // Move cursor one step out and clear the badge mark
          return this.editor.chain().setTextSelection(pos + 1).unsetMark(this.name).run();
        }

        return false;
      },
    };
  },
});
