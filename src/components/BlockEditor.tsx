import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, Reorder, AnimatePresence } from 'motion/react';
import { 
  GripVertical, Plus, Trash2, CheckSquare, Square, 
  Type, Heading1, Heading2, Heading3, List, ListOrdered, 
  Quote, Code, MoreVertical, ChevronUp, ChevronDown,
  Sparkles, Bold, Italic, Link as LinkIcon, Underline,
  Image as ImageIcon, Upload, X, Table as TableIcon,
  PlusCircle, MinusCircle
} from 'lucide-react';
import { cn } from '../lib/utils';

export type BlockType = 'text' | 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'quote' | 'todo' | 'code' | 'image' | 'table';

export interface Block {
  id: string;
  type: BlockType;
  content: string;
  checked?: boolean;
  level?: number;
  url?: string;
  caption?: string;
  width?: '25%' | '50%' | '75%' | '100%';
  tableData?: {
    headers: string[];
    rows: string[][];
  };
}

interface BlockEditorProps {
  noteId: number;
  initialContent: string;
  onChange: (content: string) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

const parseMarkdownToBlocks = (markdown: string): Block[] => {
  if (!markdown || markdown.trim() === '') {
    return [{ id: generateId(), type: 'text', content: '' }];
  }

  // Check if it's already JSON (our new format)
  try {
    const parsed = JSON.parse(markdown);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) {
      return parsed;
    }
  } catch (e) {
    // Not JSON, parse as markdown
  }

  const lines = markdown.split('\n');
  const blocks: Block[] = [];

  lines.forEach(line => {
    if (line.startsWith('# ')) {
      blocks.push({ id: generateId(), type: 'h1', content: line.replace('# ', '') });
    } else if (line.startsWith('## ')) {
      blocks.push({ id: generateId(), type: 'h2', content: line.replace('## ', '') });
    } else if (line.startsWith('### ')) {
      blocks.push({ id: generateId(), type: 'h3', content: line.replace('### ', '') });
    } else if (line.startsWith('- ')) {
      blocks.push({ id: generateId(), type: 'bullet', content: line.replace('- ', '') });
    } else if (line.startsWith('* ')) {
      blocks.push({ id: generateId(), type: 'bullet', content: line.replace('* ', '') });
    } else if (/^\d+\. /.test(line)) {
      blocks.push({ id: generateId(), type: 'number', content: line.replace(/^\d+\. /, '') });
    } else if (line.startsWith('> ')) {
      blocks.push({ id: generateId(), type: 'quote', content: line.replace('> ', '') });
    } else if (line.startsWith('[ ] ')) {
      blocks.push({ id: generateId(), type: 'todo', content: line.replace('[ ] ', ''), checked: false });
    } else if (line.startsWith('[x] ')) {
      blocks.push({ id: generateId(), type: 'todo', content: line.replace('[x] ', ''), checked: true });
    } else if (line.startsWith('```')) {
      blocks.push({ id: generateId(), type: 'code', content: line.replace(/```/g, '') });
    } else if (line.trim() !== '' || blocks.length === 0 || blocks[blocks.length-1].content !== '') {
      blocks.push({ id: generateId(), type: 'text', content: line });
    }
  });

  return blocks.length > 0 ? blocks : [{ id: generateId(), type: 'text', content: '' }];
};

const serializeBlocksToMarkdown = (blocks: Block[]): string => {
  return JSON.stringify(blocks);
};

export default function BlockEditor({ noteId, initialContent, onChange }: BlockEditorProps) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [showMenu, setShowMenu] = useState<{ id: string, x: number, y: number } | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<{ x: number, y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setBlocks(parseMarkdownToBlocks(initialContent));
  }, [noteId]);

  const updateBlocks = (newBlocks: Block[]) => {
    setBlocks(newBlocks);
    onChange(serializeBlocksToMarkdown(newBlocks));
  };

  const deleteSelectedBlocks = useCallback(() => {
    if (selectedBlockIds.length === 0) return;
    
    // Don't delete if it would leave 0 blocks
    if (selectedBlockIds.length === blocks.length) {
      updateBlocks([{ id: generateId(), type: 'text', content: '' }]);
    } else {
      const newBlocks = blocks.filter(b => !selectedBlockIds.includes(b.id));
      updateBlocks(newBlocks);
    }
    setSelectedBlockIds([]);
  }, [blocks, selectedBlockIds]);

  const handleBlockChange = (id: string, content: string) => {
    const newBlocks = blocks.map(b => b.id === id ? { ...b, content } : b);
    updateBlocks(newBlocks);
  };

  const addTableRow = (blockId: string) => {
    const newBlocks = blocks.map(b => {
      if (b.id === blockId && b.tableData) {
        const newRow = new Array(b.tableData.headers.length).fill('');
        return { ...b, tableData: { ...b.tableData, rows: [...b.tableData.rows, newRow] } };
      }
      return b;
    });
    updateBlocks(newBlocks);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    const target = e.target as HTMLElement;
    const currentContent = target.innerText;
    const currentBlock = { ...blocks[index], content: currentContent };
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      
      // If current block is an empty list item, convert to text
      if (['bullet', 'number', 'todo'].includes(currentBlock.type) && currentBlock.content.trim() === '') {
        changeBlockType(currentBlock.id, 'text');
        return;
      }

      // Inherit list type if applicable
      const newType: BlockType = ['bullet', 'number', 'todo'].includes(currentBlock.type) 
        ? currentBlock.type 
        : 'text';
        
      const newBlock: Block = { 
        id: generateId(), 
        type: newType, 
        content: '',
        checked: newType === 'todo' ? false : undefined,
        level: currentBlock.level || 0
      };
      
      const newBlocks = [...blocks];
      // Update the current block with its latest content before inserting the new one
      newBlocks[index] = currentBlock;
      newBlocks.splice(index + 1, 0, newBlock);
      updateBlocks(newBlocks);
      setFocusedBlockId(newBlock.id);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const newBlocks = [...blocks];
      const block = { ...newBlocks[index] };
      
      if (e.shiftKey) {
        // Decrease level
        block.level = Math.max(0, (block.level || 0) - 1);
      } else {
        // Increase level
        block.level = Math.min(4, (block.level || 0) + 1);
      }
      
      newBlocks[index] = block;
      updateBlocks(newBlocks);
    } else if (e.key === 'Backspace' && currentBlock.content === '') {
      e.preventDefault();
      if ((currentBlock.level || 0) > 0) {
        const newBlocks = [...blocks];
        newBlocks[index] = { ...currentBlock, level: currentBlock.level! - 1 };
        updateBlocks(newBlocks);
      } else if (blocks.length > 1) {
        const newBlocks = blocks.filter((_, i) => i !== index);
        updateBlocks(newBlocks);
        if (index > 0) {
          setFocusedBlockId(blocks[index - 1].id);
        }
      }
    } else if (e.key === 'ArrowDown' && index < blocks.length - 1) {
      const selection = window.getSelection();
      const target = e.target as HTMLElement;
      if (selection && selection.anchorOffset === target.innerText.length) {
        setFocusedBlockId(blocks[index + 1].id);
      }
    } else if (e.key === 'Backspace') {
      const selection = window.getSelection();
      // Smart merging: if cursor is at the beginning of a block
      if (selection && selection.anchorOffset === 0 && index > 0) {
        const prevBlock = blocks[index - 1];
        if (['text', 'h1', 'h2', 'h3', 'bullet', 'number', 'quote'].includes(prevBlock.type) && 
            ['text', 'h1', 'h2', 'h3', 'bullet', 'number', 'quote'].includes(currentBlock.type)) {
          e.preventDefault();
          const newBlocks = [...blocks];
          const combinedContent = prevBlock.content + currentBlock.content;
          newBlocks[index - 1] = { ...prevBlock, content: combinedContent };
          newBlocks.splice(index, 1);
          updateBlocks(newBlocks);
          setFocusedBlockId(prevBlock.id);
          
          // Use timeout to set cursor position after focus
          setTimeout(() => {
            const el = document.getElementById(`block-${prevBlock.id}`);
            if (el) {
              const range = document.createRange();
              const sel = window.getSelection();
              // Try to find the text node. If content was empty, it might be the element itself.
              const targetNode = el.firstChild || el;
              const offset = Math.min(prevBlock.content.length, targetNode.textContent?.length || 0);
              range.setStart(targetNode, offset);
              range.collapse(true);
              sel?.removeAllRanges();
              sel?.addRange(range);
            }
          }, 0);
        } else if (currentBlock.content === '') {
          // Fallback to simple delete if cannot merge
          e.preventDefault();
          const newBlocks = blocks.filter((_, i) => i !== index);
          updateBlocks(newBlocks.length > 0 ? newBlocks : [{ id: generateId(), type: 'text', content: '' }]);
          setFocusedBlockId(blocks[index - 1].id);
        }
      }
    }
  };

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectionMenu({
        x: rect.left + rect.width / 2,
        y: rect.top < 60 ? rect.bottom + 10 : rect.top - 40
      });
    } else {
      setSelectionMenu(null);
    }
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    // If the click is on the direct container (empty space at the bottom)
    if (e.target === e.currentTarget) {
      const lastBlock = blocks[blocks.length - 1];
      if (!lastBlock || lastBlock.type !== 'text' || lastBlock.content.trim() !== '') {
        const newBlock: Block = { id: generateId(), type: 'text', content: '' };
        updateBlocks([...blocks, newBlock]);
        setFocusedBlockId(newBlock.id);
      } else {
        setFocusedBlockId(lastBlock.id);
      }
    }
  };

  const formatText = (command: string) => {
    document.execCommand(command, false);
    setSelectionMenu(null);
  };

  const changeBlockType = (id: string, type: BlockType) => {
    const newBlocks = blocks.map(b => {
      if (b.id === id) {
        const base = { ...b, type };
        if (type === 'table' && !b.tableData) {
          base.tableData = {
            headers: ['Column 1', 'Column 2'],
            rows: [['', ''], ['', '']]
          };
        }
        return base;
      }
      return b;
    });
    updateBlocks(newBlocks);
    setShowMenu(null);
  };

  const toggleTodo = (id: string) => {
    const newBlocks = blocks.map(b => b.id === id ? { ...b, checked: !b.checked } : b);
    updateBlocks(newBlocks);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, blockId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      
      if (data.url) {
        if (blockId) {
          const newBlocks = blocks.map(b => b.id === blockId ? { ...b, type: 'image' as BlockType, url: data.url, width: '100%' as const } : b);
          updateBlocks(newBlocks);
        } else {
          const newBlock: Block = {
            id: generateId(),
            type: 'image',
            content: '',
            url: data.url,
            level: 0,
            width: '100%'
          };
          updateBlocks([...blocks, newBlock]);
        }
      }
    } catch (err) {
      console.error('Upload failed:', err);
    }
  };

  const deleteBlock = (id: string) => {
    if (blocks.length <= 1) return;
    const newBlocks = blocks.filter(b => b.id !== id);
    updateBlocks(newBlocks);
    setShowMenu(null);
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Clear selection on Escape
      if (e.key === 'Escape') {
        setSelectedBlockIds([]);
        return;
      }

      // Handle Cmd+A (Select All)
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        // If an input or textarea is focused (like in a table), let default happen
        const activeEl = document.activeElement;
        if (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA') {
          return;
        }

        e.preventDefault();
        setSelectedBlockIds(blocks.map(b => b.id));
        setFocusedBlockId(null);
        // Remove focus from any contentEditable to show global selection
        if (activeEl instanceof HTMLElement) activeEl.blur();
      }

      // Handle Backspace/Delete for global selection
      if (selectedBlockIds.length > 0 && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
        deleteSelectedBlocks();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(null);
      }
      if (selectionMenuRef.current && !selectionMenuRef.current.contains(e.target as Node)) {
        setSelectionMenu(null);
      }
      
      // Clear selection if clicking outside blocks
      const editorEl = document.getElementById('block-editor-content');
      if (editorEl && !editorEl.contains(e.target as Node) && selectedBlockIds.length > 0) {
        setSelectedBlockIds([]);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [blocks, selectedBlockIds, deleteSelectedBlocks]);

  return (
    <div 
      id="block-editor-content"
      className="max-w-4xl mx-auto py-12 px-4 pb-[50vh] min-h-full cursor-text" 
      onMouseUp={handleMouseUp}
      onClick={handleContainerClick}
    >
      <Reorder.Group axis="y" values={blocks} onReorder={updateBlocks} className="space-y-1">
        {blocks.map((block, index) => (
          <Reorder.Item 
            key={block.id} 
            value={block}
            className={cn(
              "group relative flex items-start gap-2 transition-all duration-200 rounded-lg pr-2",
              selectedBlockIds.includes(block.id) && "bg-accent-primary/10 ring-1 ring-accent-primary/30",
              block.type === 'h1' && "mt-10 mb-4",
              block.type === 'h2' && "mt-8 mb-3",
              block.type === 'h3' && "mt-6 mb-2",
              block.type === 'text' && "my-1",
              block.type === 'bullet' && "my-0.5",
              block.type === 'number' && "my-0.5",
              block.type === 'todo' && "my-0.5",
              block.type === 'code' && "my-6",
              block.type === 'quote' && "my-6"
            )}
            onClick={(e) => {
              if (e.shiftKey) {
                e.preventDefault();
                setSelectedBlockIds(prev => prev.includes(block.id) ? prev.filter(id => id !== block.id) : [...prev, block.id]);
              } else if (selectedBlockIds.length > 0) {
                setSelectedBlockIds([]);
              }
            }}
            style={{ 
              paddingLeft: `${(block.level || 0) * 28 + (['bullet', 'number', 'todo'].includes(block.type) ? 24 : 0)}px` 
            }}
          >
            <div className="absolute -left-12 top-0 bottom-0 flex items-start pt-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-30">
              <div className="flex items-center gap-0.5">
                <div 
                  className="p-1 hover:bg-bg-tertiary rounded cursor-grab active:cursor-grabbing text-text-secondary/40 hover:text-text-secondary transition-colors"
                  onPointerDown={(e) => e.preventDefault()}
                >
                  <GripVertical size={14} />
                </div>
                <button 
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const menuWidth = 256; 
                    const menuHeight = 480; 
                    
                    let x = rect.left - menuWidth - 12;
                    let y = rect.top;
                    
                    // Flip to right if no space on left
                    if (x < 20) {
                      x = rect.right + 12;
                    }

                    // Smart vertical positioning
                    const spaceBelow = window.innerHeight - rect.bottom;
                    const spaceAbove = rect.top;

                    if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
                      // Open upwards
                      y = Math.max(20, rect.top - menuHeight);
                    } else {
                      // Open downwards (default), but ensure it doesn't go off screen
                      if (y + menuHeight > window.innerHeight) {
                        y = Math.max(20, window.innerHeight - menuHeight - 20);
                      }
                    }

                    setShowMenu({ id: block.id, x, y });
                  }}
                  className="p-1 hover:bg-bg-tertiary rounded text-text-secondary/40 hover:text-text-secondary transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 flex items-start min-w-0 group/block">
              {/* Indicator Container */}
              <div className="flex-shrink-0 w-6 flex justify-center items-start pt-1.5">
                {block.type === 'bullet' && (
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full mt-2",
                    (block.level || 0) % 2 === 0 
                      ? "bg-text-primary/60" 
                      : "border border-text-primary/40 bg-transparent"
                  )} />
                )}
                {block.type === 'number' && (
                  <div className="text-[15px] font-medium text-text-primary/60 text-right w-full pr-1.5 mt-0.5">
                    {(() => {
                      let count = 0;
                      for (let i = index; i >= 0; i--) {
                        if (blocks[i].type === 'number' && (blocks[i].level || 0) === (block.level || 0)) {
                          count++;
                        } else if ((blocks[i].level || 0) < (block.level || 0)) {
                          break;
                        }
                      }
                      return count;
                    })()}.
                  </div>
                )}
                {block.type === 'todo' && (
                  <button 
                    onClick={() => toggleTodo(block.id)}
                    className="text-accent-primary mt-1 hover:scale-105 transition-transform"
                  >
                    {block.checked ? <CheckSquare size={18} className="opacity-60" /> : <Square size={18} className="opacity-40" />}
                  </button>
                )}
                {block.type === 'image' && (
                  <div className="text-text-secondary/30 mt-1.5">
                    <ImageIcon size={14} />
                  </div>
                )}
                {block.type === 'table' && (
                  <div className="text-text-secondary/30 mt-1.5">
                    <TableIcon size={14} />
                  </div>
                )}
              </div>
              
              {block.type === 'image' ? (
                <div className="flex-1 space-y-2">
                  <div 
                    className="relative group/image rounded-xl overflow-hidden border border-border/50 bg-bg-tertiary/50 transition-all duration-300"
                    style={{ width: block.width || '100%' }}
                  >
                    <img 
                      src={block.url} 
                      alt={block.caption || "Uploaded image"} 
                      className="w-full h-auto max-h-[700px] object-contain"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover/image:opacity-100 transition-all">
                      <div className="flex items-center gap-0.5 bg-black/60 backdrop-blur-xl rounded-lg p-0.5 border border-white/10 shadow-2xl">
                        {(['25%', '50%', '75%', '100%'] as const).map((w) => (
                          <button
                            key={w}
                            onClick={() => {
                              const newBlocks = blocks.map(b => b.id === block.id ? { ...b, width: w } : b);
                              updateBlocks(newBlocks);
                            }}
                            className={cn(
                              "px-2 py-1 text-[10px] font-bold rounded-md transition-all",
                              (block.width || '100%') === w ? "bg-white text-black" : "text-white/60 hover:text-white hover:bg-white/10"
                            )}
                          >
                            {w}
                          </button>
                        ))}
                      </div>
                      <button 
                        onClick={() => deleteBlock(block.id)}
                        className="p-1.5 bg-black/60 hover:bg-red-500 text-white rounded-lg backdrop-blur-xl border border-white/10 shadow-2xl transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="Add a caption..."
                    value={block.caption || ''}
                    onChange={(e) => {
                      const newBlocks = blocks.map(b => b.id === block.id ? { ...b, caption: e.target.value } : b);
                      updateBlocks(newBlocks);
                    }}
                    className="w-full bg-transparent text-xs text-text-secondary/60 outline-none italic px-2 py-1"
                  />
                </div>
              ) : block.type === 'table' ? (
                <div className="flex-1 overflow-x-auto pb-4 group/table">
                  <div className="inline-block min-w-full align-middle">
                    <div className="overflow-hidden border border-border/50 rounded-xl bg-bg-tertiary/20">
                      <table className="min-w-full divide-y divide-border/50">
                        <thead className="bg-bg-tertiary/50">
                          <tr>
                            {block.tableData?.headers.map((header, hIdx) => (
                              <th key={hIdx} className="px-4 py-3 text-left text-xs font-bold text-text-secondary uppercase tracking-wider relative group/header border-r border-border/30 last:border-r-0">
                                <input
                                  type="text"
                                  value={header}
                                  onChange={(e) => {
                                    const newHeaders = [...(block.tableData?.headers || [])];
                                    newHeaders[hIdx] = e.target.value;
                                    const newBlocks = blocks.map(b => b.id === block.id ? { ...b, tableData: { ...b.tableData!, headers: newHeaders } } : b);
                                    updateBlocks(newBlocks);
                                  }}
                                  className="bg-transparent outline-none w-full"
                                />
                                <button
                                  onClick={() => {
                                    const newHeaders = (block.tableData?.headers || []).filter((_, i) => i !== hIdx);
                                    const newRows = (block.tableData?.rows || []).map(row => row.filter((_, i) => i !== hIdx));
                                    const newBlocks = blocks.map(b => b.id === block.id ? { ...b, tableData: { headers: newHeaders, rows: newRows } } : b);
                                    updateBlocks(newBlocks);
                                  }}
                                  className="absolute -top-2 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover/header:opacity-100 transition-opacity"
                                >
                                  <X size={10} />
                                </button>
                              </th>
                            ))}
                            <th className="w-10 px-2 py-3">
                              <button
                                onClick={() => {
                                  const newHeaders = [...(block.tableData?.headers || []), `Column ${(block.tableData?.headers.length || 0) + 1}`];
                                  const newRows = (block.tableData?.rows || []).map(row => [...row, '']);
                                  const newBlocks = blocks.map(b => b.id === block.id ? { ...b, tableData: { headers: newHeaders, rows: newRows } } : b);
                                  updateBlocks(newBlocks);
                                }}
                                className="p-1 hover:bg-accent-primary/10 text-accent-primary rounded-lg transition-colors"
                              >
                                <PlusCircle size={14} />
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {block.tableData?.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-bg-tertiary/30 transition-colors group/row divide-x divide-border/30">
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="px-4 py-3 text-sm text-text-primary">
                                  <textarea
                                    value={cell}
                                    onChange={(e) => {
                                      let val = e.target.value;
                                      // Bullet shortcut: "- " at start of line
                                      if (val.endsWith('- ')) {
                                        const lines = val.split('\n');
                                        if (lines[lines.length - 1] === '- ') {
                                          lines[lines.length - 1] = '• ';
                                          val = lines.join('\n');
                                        }
                                      }
                                      const newRows = [...(block.tableData?.rows || [])];
                                      newRows[rIdx] = [...newRows[rIdx]];
                                      newRows[rIdx][cIdx] = val;
                                      const newBlocks = blocks.map(b => b.id === block.id ? { ...b, tableData: { ...b.tableData!, rows: newRows } } : b);
                                      updateBlocks(newBlocks);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        addTableRow(block.id);
                                      } else if (e.key === 'ArrowDown' && rIdx === (block.tableData?.rows.length || 0) - 1) {
                                        // If at last row and press down, focus next block if exists
                                        if (index < blocks.length - 1) {
                                          setFocusedBlockId(blocks[index + 1].id);
                                        } else {
                                          // Create new block if it's the last block
                                          const newBlock: Block = { id: generateId(), type: 'text', content: '' };
                                          updateBlocks([...blocks, newBlock]);
                                          setFocusedBlockId(newBlock.id);
                                        }
                                      }
                                    }}
                                    rows={cell.split('\n').length || 1}
                                    className="bg-transparent outline-none w-full resize-none overflow-hidden py-0 block"
                                  />
                                </td>
                              ))}
                              <td className="w-10 px-2 py-3 text-center">
                                <button
                                  onClick={() => {
                                    const newRows = (block.tableData?.rows || []).filter((_, i) => i !== rIdx);
                                    const newBlocks = blocks.map(b => b.id === block.id ? { ...b, tableData: { ...b.tableData!, rows: newRows } } : b);
                                    updateBlocks(newBlocks);
                                  }}
                                  className="p-1 hover:bg-red-500/10 text-red-400 rounded-lg opacity-0 group-hover/row:opacity-100 transition-all"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <td colSpan={(block.tableData?.headers.length || 0) + 1} className="px-4 py-2">
                              <button
                                onClick={() => addTableRow(block.id)}
                                className="flex items-center gap-2 text-xs font-medium text-accent-primary hover:text-accent-primary/80 transition-colors"
                              >
                                <Plus size={14} /> Add row
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div 
                  contentEditable
                  suppressContentEditableWarning
                  onFocus={() => setFocusedBlockId(block.id)}
                  onInput={(e) => handleBlockChange(block.id, e.currentTarget.innerText)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  id={`block-${block.id}`}
                  ref={(el) => {
                    if (el && focusedBlockId === block.id && document.activeElement !== el) {
                      el.focus();
                      const range = document.createRange();
                      const sel = window.getSelection();
                      range.selectNodeContents(el);
                      range.collapse(false);
                      sel?.removeAllRanges();
                      sel?.addRange(range);
                    }
                    if (el && document.activeElement !== el) {
                      el.innerText = block.content;
                    }
                  }}
                  data-placeholder={block.content === '' ? (block.type === 'text' ? "Type '/' for commands..." : `Empty ${block.type} block`) : undefined}
                  className={cn(
                    "flex-1 outline-none py-1.5 break-words min-h-[1.5rem] transition-all duration-200 text-[16px] leading-relaxed relative",
                    block.content === '' && "before:content-[attr(data-placeholder)] before:text-text-secondary/30 before:pointer-events-none before:absolute",
                    block.type === 'h1' && "text-4xl font-extrabold tracking-tight text-text-primary",
                    block.type === 'h2' && "text-3xl font-bold tracking-tight text-text-primary/90",
                    block.type === 'h3' && "text-2xl font-bold tracking-tight text-text-primary/80",
                    block.type === 'quote' && "border-l-2 border-text-primary/20 pl-6 py-1 italic text-text-secondary/80",
                    block.type === 'code' && "font-mono bg-bg-tertiary/50 p-6 rounded-xl text-[14px] border border-border/50 shadow-sm",
                    block.type === 'todo' && block.checked && "line-through text-text-secondary/40"
                  )}
                />
              )}
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>

      {/* Bottom helper */}
      <div 
        className="group/bottom mt-8 py-4 px-8 cursor-text flex items-center gap-3 opacity-0 hover:opacity-60 transition-all duration-300 rounded-xl hover:bg-bg-tertiary/20"
        onClick={() => {
          const lastBlock = blocks[blocks.length - 1];
          if (!lastBlock || lastBlock.type !== 'text' || lastBlock.content.trim() !== '') {
            const newBlock: Block = { id: generateId(), type: 'text', content: '' };
            updateBlocks([...blocks, newBlock]);
            setFocusedBlockId(newBlock.id);
          } else {
            setFocusedBlockId(lastBlock.id);
          }
        }}
      >
        <div className="p-1 rounded-md bg-accent-primary/10 text-accent-primary opacity-0 group-hover/bottom:opacity-100 transition-opacity">
          <Plus size={14} />
        </div>
        <span className="text-sm text-text-secondary italic">Type '/' for commands or click to add a block...</span>
      </div>

      {/* Floating Menu (Turn into...) */}
      <AnimatePresence>
        {showMenu && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            style={{ position: 'fixed', left: showMenu.x, top: showMenu.y, zIndex: 50 }}
            className="w-64 glass-panel rounded-xl shadow-2xl border border-border p-2 overflow-hidden"
          >
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-secondary px-3 py-2">
              Turn into...
            </div>
            <div className="grid grid-cols-1 gap-0.5">
              <MenuButton icon={Type} label="Text" onClick={() => changeBlockType(showMenu.id, 'text')} />
              <MenuButton icon={Heading1} label="Heading 1" onClick={() => changeBlockType(showMenu.id, 'h1')} />
              <MenuButton icon={Heading2} label="Heading 2" onClick={() => changeBlockType(showMenu.id, 'h2')} />
              <MenuButton icon={Heading3} label="Heading 3" onClick={() => changeBlockType(showMenu.id, 'h3')} />
              <MenuButton icon={List} label="Bullet List" onClick={() => changeBlockType(showMenu.id, 'bullet')} />
              <MenuButton icon={ListOrdered} label="Numbered List" onClick={() => changeBlockType(showMenu.id, 'number')} />
              <MenuButton icon={CheckSquare} label="To-do List" onClick={() => changeBlockType(showMenu.id, 'todo')} />
              <MenuButton icon={Quote} label="Quote" onClick={() => changeBlockType(showMenu.id, 'quote')} />
              <MenuButton icon={Code} label="Code" onClick={() => changeBlockType(showMenu.id, 'code')} />
              <MenuButton icon={TableIcon} label="Table" onClick={() => changeBlockType(showMenu.id, 'table')} />
              <div className="relative">
                <MenuButton icon={ImageIcon} label="Image" onClick={() => {}} />
                <input 
                  type="file" 
                  accept="image/*" 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                  onChange={(e) => handleImageUpload(e, showMenu.id)}
                />
              </div>
            </div>
            <div className="border-t border-border my-1 pt-1">
              <MenuButton icon={Trash2} label="Delete Block" onClick={() => deleteBlock(showMenu.id)} className="text-red-400 hover:bg-red-400/10" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selection Floating Toolbar */}
      <AnimatePresence>
        {selectionMenu && (
          <motion.div
            ref={selectionMenuRef}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            style={{ 
              position: 'fixed', 
              left: selectionMenu.x, 
              top: selectionMenu.y, 
              transform: 'translateX(-50%)',
              zIndex: 100 
            }}
            className="flex items-center gap-1 bg-bg-secondary border border-border rounded-lg p-1 shadow-2xl backdrop-blur-md"
          >
            <ToolbarButton icon={Bold} label="Bold" onClick={() => formatText('bold')} />
            <ToolbarButton icon={Italic} label="Italic" onClick={() => formatText('italic')} />
            <ToolbarButton icon={Underline} label="Underline" onClick={() => formatText('underline')} />
            <div className="w-px h-4 bg-border mx-1" />
            <ToolbarButton icon={LinkIcon} label="Link" onClick={() => formatText('createLink')} />
          </motion.div>
        )}
      </AnimatePresence>

      {blocks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-text-secondary">
          <Sparkles className="w-12 h-12 mb-4 opacity-20" />
          <p>Start typing to create your first block</p>
        </div>
      )}
    </div>
  );
}

function MenuButton({ icon: Icon, label, onClick, className }: { icon: any, label: string, onClick: () => void, className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2 text-sm rounded-lg hover:bg-bg-tertiary transition-colors text-left",
        className
      )}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}

function ToolbarButton({ icon: Icon, label, onClick }: { icon: any, label: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-1.5 hover:bg-bg-tertiary rounded transition-colors"
      title={label}
    >
      <Icon size={14} />
    </button>
  );
}
