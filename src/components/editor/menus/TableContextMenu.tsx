import React, { type ReactNode, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { CellSelection, selectedRect } from '@tiptap/pm/tables';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Columns, Heading, Layout, MessageSquareText, Sigma, Trash2 } from 'lucide-react';
import { moveSelectedTableColumns, moveSelectedTableRows } from '@/lib/tiptap/table-drag';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface TableContextMenuProps {
  editor: Editor;
  children: ReactNode;
  disabled?: boolean;
  onRequestComment?: (blockPosition: number) => Promise<boolean>;
}

export function TableContextMenu({ editor, children, disabled = false, onRequestComment }: TableContextMenuProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [contextBlockPosition, setContextBlockPosition] = React.useState<number | null>(null);
  const [isTableTarget, setIsTableTarget] = React.useState(false);
  const selection = editor.state.selection;
  const isMultiRowSelection = selection instanceof CellSelection
    && selectedRect(editor.state).bottom - selectedRect(editor.state).top > 1;
  const isMultiColumnSelection = selection instanceof CellSelection
    && selectedRect(editor.state).right - selectedRect(editor.state).left > 1;

  const moveRows = (direction: 'up' | 'down') => {
    editor.view.focus();
    moveSelectedTableRows(editor.view, direction);
  };

  const moveColumns = (direction: 'left' | 'right') => {
    editor.view.focus();
    moveSelectedTableColumns(editor.view, direction);
  };

  React.useEffect(() => {
    if (!editor.isEditable || disabled) return;

    const allowNativeContextMenuOutsideTable = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !triggerRef.current?.contains(target)) return;
      if (target.closest('td, th')) return;
      const position = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (!onRequestComment || !position || commentableBlockPosition(editor, position.pos) === null) {
        event.stopImmediatePropagation();
      }
    };

    document.addEventListener('contextmenu', allowNativeContextMenuOutsideTable, true);
    return () => document.removeEventListener('contextmenu', allowNativeContextMenuOutsideTable, true);
  }, [disabled, editor, editor.isEditable, onRequestComment]);

  if (!editor.isEditable || disabled) return <>{children}</>;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        ref={triggerRef}
        className="contents"
        onContextMenuCapture={event => {
          const target = event.target;
          const isTable = target instanceof Element && Boolean(target.closest('td, th'));
          const pointerPosition = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
          const position = pointerPosition?.pos ?? editor.state.selection.from;
          setIsTableTarget(isTable || editor.state.selection instanceof CellSelection);
          setContextBlockPosition(commentableBlockPosition(editor, position));
        }}
      >
        {children}
      </ContextMenuTrigger>

      <ContextMenuContent className="min-w-52">
        {contextBlockPosition !== null && onRequestComment && (
          <ContextMenuItem onSelect={() => void onRequestComment(contextBlockPosition)}>
            <MessageSquareText className="size-4" />
            <span>Comment on block</span>
          </ContextMenuItem>
        )}
        {isTableTarget && (
        <>
        {contextBlockPosition !== null && onRequestComment && <ContextMenuSeparator />}
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Layout className="size-4" />
            <span>Rows</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => editor.chain().focus().addRowBefore().run()}>
              <ArrowUp className="size-4" />
              <span>Add Row Above</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => editor.chain().focus().addRowAfter().run()}>
              <ArrowDown className="size-4" />
              <span>Add Row Below</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => moveRows('up')}>
              <ArrowUp className="size-4" />
              <span>{isMultiRowSelection ? 'Move Selected Rows Up' : 'Move Row Up'}</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => moveRows('down')}>
              <ArrowDown className="size-4" />
              <span>{isMultiRowSelection ? 'Move Selected Rows Down' : 'Move Row Down'}</span>
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              onClick={() => editor.chain().focus().deleteRow().run()}
            >
              <Trash2 className="size-4" />
              <span>{isMultiRowSelection ? 'Delete Selected Rows' : 'Delete Row'}</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => toggleRowType(editor, 'header')}>
              <Heading className="size-4" />
              <span>Header Row</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => toggleRowType(editor, 'footer')}>
              <Sigma className="size-4" />
              <span>Footer Row</span>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Columns className="size-4" />
            <span>Columns</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => editor.chain().focus().addColumnBefore().run()}>
              <ArrowLeft className="size-4" />
              <span>Add Column Before</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => editor.chain().focus().addColumnAfter().run()}>
              <ArrowRight className="size-4" />
              <span>Add Column After</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => moveColumns('left')}>
              <ArrowLeft className="size-4" />
              <span>{isMultiColumnSelection ? 'Move Selected Columns Left' : 'Move Column Left'}</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => moveColumns('right')}>
              <ArrowRight className="size-4" />
              <span>{isMultiColumnSelection ? 'Move Selected Columns Right' : 'Move Column Right'}</span>
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              onClick={() => editor.chain().focus().deleteColumn().run()}
            >
              <Trash2 className="size-4" />
              <span>Delete Column</span>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={() => editor.chain().focus().deleteTable().run()}
        >
          <Trash2 className="size-4" />
          <span>Delete Table</span>
        </ContextMenuItem>
        </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function commentableBlockPosition(editor: Editor, position: number): number | null {
  const resolved = editor.state.doc.resolve(position);
  for (let depth = resolved.depth; depth > 0; depth--) {
    const node = resolved.node(depth);
    if (node.type.name === 'paragraph' || node.type.name === 'heading') return resolved.before(depth);
  }
  return null;
}

function toggleRowType(editor: Editor, rowType: 'header' | 'footer') {
  const currentType = editor.getAttributes('tableRow').rowType;
  editor.chain().focus().updateAttributes('tableRow', {
    rowType: currentType === rowType ? 'data' : rowType,
  }).run();
}
