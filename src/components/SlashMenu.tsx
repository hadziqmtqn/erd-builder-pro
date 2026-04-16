import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Heading1, Heading2, Heading3, 
  List, ListOrdered, CheckSquare, 
  Quote, Code, Table as TableIcon, 
  Image as ImageIcon, Smile, 
  Minus, Type, Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface SlashMenuItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (editor: any, range: { from: number; to: number }) => void;
  category: string;
}

interface SlashMenuProps {
  editor: any;
  query: string;
  range: { from: number; to: number };
  onClose: () => void;
  coords: { top: number; left: number; bottom: number };
}

const SLASH_ITEMS: SlashMenuItem[] = [
  {
    title: 'Text',
    description: 'Just start typing with plain text.',
    icon: <Type className="w-4 h-4" />,
    category: 'Basic',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    title: 'Heading 1',
    description: 'Big section heading.',
    icon: <Heading1 className="w-4 h-4" />,
    category: 'Basic',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
    },
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading.',
    icon: <Heading2 className="w-4 h-4" />,
    category: 'Basic',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
    },
  },
  {
    title: 'Heading 3',
    description: 'Small section heading.',
    icon: <Heading3 className="w-4 h-4" />,
    category: 'Basic',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
    },
  },
  {
    title: 'Bullet List',
    description: 'Create a simple bulleted list.',
    icon: <List className="w-4 h-4" />,
    category: 'Lists',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: 'Numbered List',
    description: 'Create a list with numbering.',
    icon: <ListOrdered className="w-4 h-4" />,
    category: 'Lists',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: 'Task List',
    description: 'Track tasks with checkboxes.',
    icon: <CheckSquare className="w-4 h-4" />,
    category: 'Lists',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: 'Blockquote',
    description: 'Capture a quote.',
    icon: <Quote className="w-4 h-4" />,
    category: 'Organization',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: 'Code Block',
    description: 'Code snippet with syntax highlighting.',
    icon: <Code className="w-4 h-4" />,
    category: 'Organization',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: 'Table',
    description: 'Insert a 3x3 table.',
    icon: <TableIcon className="w-4 h-4" />,
    category: 'Organization',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    title: 'Image',
    description: 'Upload or insert an image.',
    icon: <ImageIcon className="w-4 h-4" />,
    category: 'Media',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      // We can't easily trigger the file input here without ref passing, 
      // so we'll just show the placeholder for now or prompt.
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (input) input.click();
    },
  },
  {
    title: 'Lucide Icon',
    description: 'Insert a searchable icon.',
    icon: <Smile className="w-4 h-4" />,
    category: 'Media',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      // This is tricky as IconSelector is a component. 
      // We'll just trigger the Icon button in the MenuBar.
      const iconBtn = document.querySelector('[data-icon-selector-trigger]') as HTMLButtonElement;
      if (iconBtn) iconBtn.click();
    },
  },
  {
    title: 'Horizontal Rule',
    description: 'Insert a horizontal divider.',
    icon: <Minus className="w-4 h-4" />,
    category: 'Basic',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
];

export const SlashMenu: React.FC<SlashMenuProps> = ({ 
  editor, 
  query, 
  range, 
  onClose,
  coords 
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const filteredItems = useMemo(() => {
    const q = query.toLowerCase();
    return SLASH_ITEMS.filter(item => 
      item.title.toLowerCase().includes(q) || 
      item.category.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filteredItems[selectedIndex];
        if (item) {
          item.command(editor, range);
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [filteredItems, selectedIndex, editor, range, onClose]);

  // Auto-scroll logic
  useEffect(() => {
    if (scrollContainerRef.current) {
      const selectedElement = scrollContainerRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }
  }, [selectedIndex]);

  // Positioning logic
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    // Check if there's enough space below the cursor
    const menuHeight = 400; // Estimated max height
    const spaceBelow = window.innerHeight - coords.bottom;
    
    if (spaceBelow < menuHeight && coords.top > menuHeight) {
      setIsFlipped(true);
    } else {
      setIsFlipped(false);
    }
  }, [coords]);

  const style: React.CSSProperties = {
    position: 'fixed',
    top: isFlipped ? coords.top - 8 : coords.bottom + 8,
    left: coords.left,
    zIndex: 9999,
    transform: isFlipped ? 'translateY(-100%)' : 'none',
  };

  if (filteredItems.length === 0) return null;

  return createPortal(
    <div style={style}>
      <motion.div 
        initial={{ opacity: 0, y: isFlipped ? 10 : -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-72 max-h-96 overflow-hidden bg-popover/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl flex flex-col"
      >
        <div className="p-2 border-b border-border/50 bg-muted/30 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Commands</span>
          {query && <span className="ml-auto text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">/{query}</span>}
        </div>

        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto custom-scrollbar p-1.5"
        >
          {filteredItems.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                key={item.title}
                onClick={() => {
                  item.command(editor, range);
                  onClose();
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-200 group",
                  isSelected ? "bg-primary text-primary-foreground shadow-md scale-[1.02]" : "hover:bg-accent text-foreground/80"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition-colors",
                  isSelected ? "bg-primary-foreground/20" : "bg-muted group-hover:bg-background"
                )}>
                  {item.icon}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold truncate">{item.title}</span>
                  <span className={cn(
                    "text-[10px] truncate leading-tight",
                    isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}>
                    {item.description}
                  </span>
                </div>
                {isSelected && (
                  <div className="ml-auto flex items-center gap-1 text-[10px] font-mono opacity-50">
                    <span>↵</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-2 border-t border-border/50 bg-muted/10 flex items-center justify-between text-[10px] text-muted-foreground font-medium">
          <div className="flex items-center gap-2">
            <span className="bg-muted px-1 rounded border border-border/50">↑↓</span> to navigate
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-muted px-1 rounded border border-border/50">Enter</span> to select
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};
