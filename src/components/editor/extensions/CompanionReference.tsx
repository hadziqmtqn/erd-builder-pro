import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Database, GitBranch, PenTool, PanelRightOpen } from 'lucide-react';

export type CompanionType = 'erd' | 'flowchart' | 'drawing';
export type NotesCompanionEventDetail = {
  type: CompanionType;
  uid: string;
  title?: string;
  previewSchema?: string;
};

export const NOTES_COMPANION_EVENT = 'erdbpro:notes-open-companion';

export function openNotesCompanion(type: CompanionType, uid: string, title?: string, previewSchema?: string) {
  window.dispatchEvent(new CustomEvent<NotesCompanionEventDetail>(NOTES_COMPANION_EVENT, {
    detail: { type, uid, title, previewSchema },
  }));
}

const iconByType = { erd: Database, flowchart: GitBranch, drawing: PenTool };
const labelByType = { erd: 'ERD Builder', flowchart: 'Flowchart', drawing: 'Drawing' };

function CompanionReferenceView({ node }: NodeViewProps) {
  const type = node.attrs.targetType as CompanionType;
  const Icon = iconByType[type] ?? Database;
  const title = String(node.attrs.title || 'Untitled');
  const uid = String(node.attrs.targetUid || '');

  return (
    <NodeViewWrapper contentEditable={false} className="not-prose my-4 flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="size-4" /></span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block text-xs text-muted-foreground">{labelByType[type] ?? 'Companion file'}</span>
        </span>
      </div>
      <button
        type="button"
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium hover:bg-accent"
        onClick={() => uid && openNotesCompanion(type, uid, title)}
      >
        <PanelRightOpen className="size-3.5" /> Open preview
      </button>
    </NodeViewWrapper>
  );
}

export const CompanionReference = Node.create({
  name: 'companionReference',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      targetType: { default: 'erd' },
      targetUid: { default: '' },
      title: { default: 'Untitled' },
    };
  },
  parseHTML() {
    return [{
      tag: 'div[data-note-companion]',
      getAttrs: element => {
        if (!(element instanceof HTMLElement)) return false;
        return {
          targetType: element.dataset.targetType ?? 'erd',
          targetUid: element.dataset.targetUid ?? '',
          title: element.dataset.title ?? 'Untitled',
        };
      },
    }];
  },
  renderHTML({ HTMLAttributes }) {
    const { targetType, targetUid, title, ...attributes } = HTMLAttributes;
    return ['div', mergeAttributes(attributes, {
      'data-note-companion': '',
      'data-target-type': targetType,
      'data-target-uid': targetUid,
      'data-title': title,
    })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CompanionReferenceView);
  },
});
