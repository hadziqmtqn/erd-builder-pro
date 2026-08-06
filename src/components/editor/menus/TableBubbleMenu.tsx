import React from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { 
  Check, 
  ChevronRight, 
  Columns, 
  Layout, 
  Menu, 
  ArrowUp, 
  Heading, 
  Sigma, 
  Trash2, 
  ArrowLeft, 
  ArrowRight, 
  AlignLeft, 
  AlignCenter, 
  AlignRight 
} from 'lucide-react';
import { Editor } from '@tiptap/react';
import { CellSelection, selectedRect, TableMap } from '@tiptap/pm/tables';

interface TableBubbleMenuProps {
  editor: Editor;
}

export function TableBubbleMenu({ editor }: TableBubbleMenuProps) {
  const isMultiRowSelection = editor.state.selection instanceof CellSelection
    && selectedRect(editor.state).bottom - selectedRect(editor.state).top > 1;

  const moveColumn = (direction: 'left' | 'right') => {
    const { state, view } = editor;
    const { selection } = state;
    const { from } = selection;
    const $pos = state.doc.resolve(from);
    
    let tablePos = -1;
    let tableNode = null;
    let cellPos = -1;
    
    for (let d = $pos.depth; d > 0; d--) {
      const node = $pos.node(d);
      if (node.type.name === 'table') {
        tablePos = $pos.before(d);
        tableNode = node;
        break;
      }
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        cellPos = $pos.before(d);
      }
    }
    
    if (tablePos === -1 || cellPos === -1 || !tableNode) return;
    
    const map = TableMap.get(tableNode);
    const cellIdx = cellPos - tablePos - 1;
    const rect = map.findCell(cellIdx);
    const colIdx = rect.left;
    const targetColIdx = direction === 'left' ? colIdx - 1 : colIdx + 1;
    
    if (targetColIdx < 0 || targetColIdx >= map.width) return;

    const tr = state.tr;
    const colPositions: number[] = [];
    const targetPositions: number[] = [];
    
    for (let i = 0; i < map.height; i++) {
      colPositions.push(tablePos + 1 + map.map[i * map.width + colIdx]);
      targetPositions.push(tablePos + 1 + map.map[i * map.width + targetColIdx]);
    }
    
    // Swap content of cells to move column
    colPositions.forEach((pos, i) => {
      const targetPos = targetPositions[i];
      const node = tr.doc.nodeAt(tr.mapping.map(pos));
      const targetNode = tr.doc.nodeAt(tr.mapping.map(targetPos));
      
      if (node && targetNode && pos !== targetPos) {
        const nodeContent = node.content;
        const targetNodeContent = targetNode.content;
        
        tr.replaceWith(tr.mapping.map(pos) + 1, tr.mapping.map(pos) + node.nodeSize - 1, targetNodeContent);
        tr.replaceWith(tr.mapping.map(targetPos) + 1, tr.mapping.map(targetPos) + targetNode.nodeSize - 1, nodeContent);
      }
    });
    
    view.dispatch(tr);
  };

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableMenu"
      updateDelay={0}
      shouldShow={({ editor }) => {
        return editor.isFocused
          && (editor.isActive('table') || editor.state.selection instanceof CellSelection);
      }}
      {...({ tippyOptions: { duration: 100, zIndex: 9999, placement: 'top', appendTo: () => document.body } } as any)}
      className="flex gap-0.5 p-1 bg-popover border border-border shadow-lg rounded-md overflow-hidden"
    >
      <TooltipProvider delay={200}>
        {/* Alignment Controls */}
        <div className="flex items-center gap-0.5 px-0.5">
          {[
            { icon: AlignLeft, value: 'left', label: 'Align Left' },
            { icon: AlignCenter, value: 'center', label: 'Align Center' },
            { icon: AlignRight, value: 'right', label: 'Align Right' },
          ].map((item) => (
            <Tooltip key={item.value}>
              <TooltipTrigger 
                render={
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().setTextAlign(item.value).run()}
                    className={`h-8 w-8 flex items-center justify-center rounded-sm transition-colors ${
                      editor.isActive({ textAlign: item.value }) 
                        ? 'bg-primary text-primary-foreground' 
                        : 'hover:bg-accent text-popover-foreground'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                  </button>
                }
              />
              <TooltipContent side="top" className="text-[10px] py-1 px-2 font-medium">
                {item.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="w-[1px] h-4 bg-border mx-1 self-center" />

        {/* Main Table Menu */}
        <DropdownMenu.Root modal={false}>
          <Tooltip>
            <TooltipTrigger 
              render={
                <DropdownMenu.Trigger asChild>
                  <button className="h-8 px-2 flex items-center gap-1.5 rounded-sm transition-colors hover:bg-accent text-popover-foreground outline-none">
                    <Menu className="w-4 h-4" />
                    <span className="text-xs font-medium">Table Actions</span>
                  </button>
                </DropdownMenu.Trigger>
              }
            />
            <TooltipContent side="top" className="text-[10px] py-1 px-2 font-medium">
              Table Settings & Operations
            </TooltipContent>
          </Tooltip>

          <DropdownMenu.Content 
            className="bg-popover border border-border p-1.5 rounded-lg shadow-lg z-[10000] min-w-[180px] flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100" 
            sideOffset={5} 
            align="start"
          >
            {/* Rows Submenu */}
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-default hover:bg-accent focus:bg-accent outline-none">
                <Layout className="w-4 h-4" />
                <span className="flex-1">Rows</span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className="bg-popover border border-border p-1.5 rounded-lg shadow-lg z-[10001] min-w-[160px] flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100" sideOffset={8}>
                  <DropdownMenu.Item
                    onSelect={() => editor.chain().focus().addRowBefore().run()}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none"
                  >
                    <ArrowUp className="w-4 h-4" />
                    <span>Add Row Above</span>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => editor.chain().focus().addRowAfter().run()}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none"
                  >
                    <ArrowUp className="w-4 h-4 rotate-180" />
                    <span>Add Row Below</span>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => editor.chain().focus().deleteRow().run()}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none text-destructive hover:text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{isMultiRowSelection ? 'Delete Selected Rows' : 'Delete Row'}</span>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="h-[1px] bg-border my-1" />
                  <DropdownMenu.Item
                    onSelect={() => {
                      const isHeader = editor.getAttributes('tableRow').rowType === 'header';
                      editor.chain().focus().updateAttributes('tableRow', { rowType: isHeader ? 'data' : 'header' }).run();
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none"
                  >
                    <Heading className="w-4 h-4" />
                    <span className="flex-1">Header Row</span>
                    {editor.getAttributes('tableRow').rowType === 'header' && <Check className="w-3.5 h-3.5 opacity-70" />}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => {
                      const isFooter = editor.getAttributes('tableRow').rowType === 'footer';
                      editor.chain().focus().updateAttributes('tableRow', { rowType: isFooter ? 'data' : 'footer' }).run();
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none"
                  >
                    <Sigma className="w-4 h-4" />
                    <span className="flex-1">Footer Row</span>
                    {editor.getAttributes('tableRow').rowType === 'footer' && <Check className="w-3.5 h-3.5 opacity-70" />}
                  </DropdownMenu.Item>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>

            {/* Columns Submenu */}
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-default hover:bg-accent focus:bg-accent outline-none">
                <Columns className="w-4 h-4" />
                <span className="flex-1">Columns</span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className="bg-popover border border-border p-1.5 rounded-lg shadow-lg z-[10001] min-w-[160px] flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100" sideOffset={8}>
                  <DropdownMenu.Item
                    onSelect={() => editor.chain().focus().addColumnBefore().run()}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Add Column Before</span>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => editor.chain().focus().addColumnAfter().run()}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none"
                  >
                    <ArrowRight className="w-4 h-4" />
                    <span>Add Column After</span>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => editor.chain().focus().deleteColumn().run()}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none text-destructive hover:text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Column</span>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="h-[1px] bg-border my-1" />
                  <DropdownMenu.Item
                    onSelect={() => moveColumn('left')}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Move Left</span>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => moveColumn('right')}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none"
                  >
                    <ArrowRight className="w-4 h-4" />
                    <span>Move Right</span>
                  </DropdownMenu.Item>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>

            <DropdownMenu.Separator className="h-[1px] bg-border my-1" />

            {/* General Actions */}
            <DropdownMenu.Item
              onSelect={() => {
                const { state } = editor.view;
                const { selection } = state;
                let tablePos = -1;
                state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
                  if (node.type.name === 'table') {
                    tablePos = pos;
                    return false;
                  }
                });
                if (tablePos !== -1) {
                  editor.chain().focus().insertContentAt(tablePos, { type: 'paragraph' }).run();
                }
              }}
              className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none"
            >
              <ArrowUp className="w-4 h-4" />
              <span className="flex-1">Insert Line Above</span>
            </DropdownMenu.Item>
            
            <DropdownMenu.Item
              onSelect={() => editor.chain().focus().deleteTable().run()}
              className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none text-destructive hover:text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
              <span className="flex-1">Delete Table</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </TooltipProvider>
    </BubbleMenu>
  );
}
