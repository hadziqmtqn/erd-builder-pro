import React from 'react';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import * as LucideIcons from 'lucide-react';

export const LucideIconExtension = Node.create({
  name: 'lucideIcon',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      name: {
        default: 'HelpCircle',
      },
      color: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-lucide-name]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-lucide-name': HTMLAttributes.name, 'data-lucide-icon': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer((props) => {
      const { name, color } = props.node.attrs;
      const IconComponent = (LucideIcons as Record<string, any>)[name] || LucideIcons.HelpCircle;

      return (
        <NodeViewWrapper className="inline-flex items-center align-middle ml-0.5 mr-1.5 leading-none translate-y-[-1px]">
          <IconComponent 
            size={18} 
            strokeWidth={2} 
            fill="currentColor"
            fillOpacity={0.2}
            style={{ color: props.node.attrs.color || 'currentColor' }}
            className={`transition-colors duration-200 ${props.selected ? 'opacity-50' : 'opacity-100'}`}
          />
        </NodeViewWrapper>
      );
    });
  },
});

export const IconSpaceReset = Extension.create({
  name: 'iconSpaceReset',
  addKeyboardShortcuts() {
    return {
      'Space': () => {
        const { state } = this.editor;
        const { selection } = state;
        const { $from } = selection;

        // Check if there is a lucideIcon before the cursor
        const nodeBefore = $from.nodeBefore;
        if (nodeBefore && nodeBefore.type.name === 'lucideIcon') {
          this.editor.commands.unsetColor();
        }

        return false; // Let the space be inserted normally
      },
    };
  },
});
