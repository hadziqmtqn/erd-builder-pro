import React from 'react';
import { Node, mergeAttributes, RawCommands } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toggle: {
      setToggle: () => ReturnType,
    }
  }
}

export const ToggleExtension = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'block+',
  addAttributes() {
    return {
      open: { default: true },
      title: { default: 'Toggle Section' }
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="toggle"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'toggle' }), 0];
  },
  addCommands() {
    return {
      setToggle: () => ({ commands }: { commands: RawCommands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: { open: true, title: 'Toggle Section' },
          content: [{ type: 'paragraph' }]
        });
      },
    } as Record<string, any>;
  },
  addNodeView() {
    return ReactNodeViewRenderer(({ node, updateAttributes }) => {
      return (
        <NodeViewWrapper className="my-2 border border-border/50 rounded-md bg-muted/5 group overflow-hidden">
          <div
            className="flex items-center gap-2 px-3 py-2 cursor-pointer bg-muted/10 hover:bg-muted/20 transition-colors select-none"
            onClick={() => updateAttributes({ open: !node.attrs.open })}
            contentEditable={false}
            suppressContentEditableWarning={true}
          >
            <span className="text-muted-foreground shrink-0 w-4 h-4 flex items-center justify-center">
              {node.attrs.open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </span>
            <input
              value={node.attrs.title}
              onChange={(e) => updateAttributes({ title: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="bg-transparent border-none focus:ring-0 outline-none text-sm font-semibold text-foreground/80 w-full"
              placeholder="Toggle Title..."
            />
          </div>

          <div className={cn("p-2 px-4 border-t border-border/20", node.attrs.open ? "block" : "hidden")}>
            <NodeViewContent className="tiptap-toggle-content outline-none min-h-[1.5rem]" />
          </div>
        </NodeViewWrapper>
      );
    });
  }
});
