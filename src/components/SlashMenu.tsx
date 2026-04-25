import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Heading1, Heading2, Heading3, Heading4,
  List, ListOrdered, CheckSquare, 
  Quote, Code, Table as TableIcon, 
  Image as ImageIcon, Smile, 
  Minus, Type, Search, ChevronRight,
  ChevronLeft, Undo, Redo, Columns,
  Table as TableHeader, AlertCircle,
  Hash, Layout, Trash2, ChevronDown, Tag
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface SlashMenuItem {
  title: string;
  icon: React.ReactNode;
  shortcut?: string;
  category?: string;
  command?: (editor: any, range: { from: number; to: number }) => void;
  children?: SlashMenuItem[];
  customView?: 'icon-search';
}

interface SlashMenuProps {
  editor: any;
  query: string;
  range: { from: number; to: number };
  onClose: () => void;
  coords: { top: number; left: number; bottom: number };
}

const CATEGORIES = ["Basic blocks", "Lists", "Media", "Organization", "Advanced", "History"];

const MAIN_ITEMS: SlashMenuItem[] = [
  // Basic blocks
  { title: 'Text', icon: <Type className="w-4 h-4" />, shortcut: 'T', category: 'Basic blocks', command: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run() },
  { title: 'Heading 1', icon: <Heading1 className="w-4 h-4" />, shortcut: '#', category: 'Basic blocks', command: (editor, range) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run() },
  { title: 'Heading 2', icon: <Heading2 className="w-4 h-4" />, shortcut: '##', category: 'Basic blocks', command: (editor, range) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run() },
  { title: 'Heading 3', icon: <Heading3 className="w-4 h-4" />, shortcut: '###', category: 'Basic blocks', command: (editor, range) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run() },
  { title: 'Heading 4', icon: <Heading4 className="w-4 h-4" />, shortcut: '####', category: 'Basic blocks', command: (editor, range) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 4 }).run() },
  { title: 'Badge', icon: <Tag className="w-4 h-4" />, category: 'Basic blocks', command: (editor, range) => editor.chain().focus().deleteRange(range).toggleBadge().run() },
  { title: 'Divider', icon: <Minus className="w-4 h-4" />, shortcut: '---', category: 'Basic blocks', command: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
  
  // Lists
  { title: 'Bulleted list', icon: <List className="w-4 h-4" />, shortcut: '-', category: 'Lists', command: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run() },
  { title: 'Numbered list', icon: <ListOrdered className="w-4 h-4" />, shortcut: '1.', category: 'Lists', command: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
  { title: 'To-do list', icon: <CheckSquare className="w-4 h-4" />, shortcut: '[]', category: 'Lists', command: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run() },
  
  // Media
  { title: 'Image', icon: <ImageIcon className="w-4 h-4" />, category: 'Media', command: (editor, range) => { 
    editor.chain().focus().deleteRange(range).run(); 
    const input = document.getElementById('tiptap-image-upload') as HTMLInputElement;
    if (input) input.click();
  }},
  { title: 'Lucide Icon', icon: <Smile className="w-4 h-4" />, category: 'Media', customView: 'icon-search' },

  // Organization
  { title: 'Blockquote', icon: <Quote className="w-4 h-4" />, shortcut: '>', category: 'Organization', command: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run() },
  { title: 'Toggle Section', icon: <ChevronDown className="w-4 h-4" />, category: 'Organization', command: (editor, range) => editor.chain().focus().deleteRange(range).setToggle().run() },
  { title: 'Code block', icon: <Code className="w-4 h-4" />, shortcut: '```', category: 'Organization', command: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run() },

  // Advanced / Table Submenu
  { 
    title: 'Table Actions', 
    icon: <TableIcon className="w-4 h-4" />, 
    category: 'Advanced',
    children: [
      { title: 'Insert Table', icon: <Layout className="w-4 h-4" />, command: (editor, range) => editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
      { title: 'Add Column', icon: <Columns className="w-4 h-4" />, command: (editor) => editor.chain().focus().addColumnAfter().run() },
      { title: 'Delete Column', icon: <Columns className="w-4 h-4 text-destructive" />, command: (editor) => editor.chain().focus().deleteColumn().run() },
      { title: 'Add Row', icon: <Layout className="w-4 h-4" />, command: (editor) => editor.chain().focus().addRowAfter().run() },
      { title: 'Delete Row', icon: <Layout className="w-4 h-4 text-destructive" />, command: (editor) => editor.chain().focus().deleteRow().run() },
      { title: 'Delete Table', icon: <Trash2 className="w-4 h-4 text-destructive" />, command: (editor, range) => editor.chain().focus().deleteTable().run() },
    ]
  },

  // History
  { title: 'Undo', icon: <Undo className="w-4 h-4" />, shortcut: '⌘Z', category: 'History', command: (editor, range) => { editor.chain().focus().deleteRange(range).run(); editor.commands.undo(); } },
  { title: 'Redo', icon: <Redo className="w-4 h-4" />, shortcut: '⌘Y', category: 'History', command: (editor, range) => { editor.chain().focus().deleteRange(range).run(); editor.commands.redo(); } },
];

export const SlashMenu: React.FC<SlashMenuProps> = ({ 
  editor, 
  query, 
  range, 
  onClose,
  coords 
}) => {
  const [indexStack, setIndexStack] = useState<number[]>([0]);
  const selectedIndex = indexStack[indexStack.length - 1] || 0;

  const setSelectedIndex = (val: number | ((prev: number) => number)) => {
    setIndexStack(prev => {
      const copy = [...prev];
      const top = copy[copy.length - 1] || 0;
      copy[copy.length - 1] = typeof val === 'function' ? val(top) : val;
      return copy;
    });
  };

  const [navStack, setNavStack] = useState<(SlashMenuItem[] | 'icon-search')[]>([MAIN_ITEMS]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const currentItems = navStack[navStack.length - 1];
  const isSubMenu = navStack.length > 1;

  const filteredItems = useMemo(() => {
    if (currentItems === 'icon-search') return [];
    
    const q = query.toLowerCase();
    // If searching, we search across all levels for flat access (like Notion)
    if (q.length > 0) {
      const flattened: SlashMenuItem[] = [];
      const collect = (items: SlashMenuItem[]) => {
        items.forEach(item => {
          if (item.command || item.customView) flattened.push(item);
          if (item.children) collect(item.children);
        });
      };
      
      if (Array.isArray(MAIN_ITEMS)) {
        collect(MAIN_ITEMS);
      }
      return flattened.filter(item => item.title.toLowerCase().includes(q));
    }
    return Array.isArray(currentItems) ? currentItems : [];
  }, [query, currentItems]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (currentItems === 'icon-search') return; // Handled by IconSearchView
      
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
          if (item.customView) {
            setNavStack([...navStack, item.customView]);
            setIndexStack(prev => [...prev, 0]);
          } else if (item.children) {
            setNavStack([...navStack, item.children]);
            setIndexStack(prev => [...prev, 0]);
          } else if (item.command) {
            item.command(editor, range);
            onClose();
          }
        }
      } else if (e.key === 'Backspace' && query === '' && isSubMenu) {
        e.preventDefault();
        setNavStack(prev => prev.slice(0, -1));
        setIndexStack(prev => prev.slice(0, -1));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [filteredItems, selectedIndex, editor, range, onClose, navStack, query, isSubMenu, currentItems]);


  useEffect(() => {
    if (scrollContainerRef.current) {
      const selectedElement = scrollContainerRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const [isFlipped, setIsFlipped] = useState(false);
  useEffect(() => {
    const menuHeight = 350;
    const spaceBelow = window.innerHeight - coords.bottom;
    setIsFlipped(spaceBelow < menuHeight && coords.top > menuHeight);
  }, [coords]);

  const style: React.CSSProperties = {
    position: 'fixed',
    top: isFlipped ? coords.top - 8 : coords.bottom + 8,
    left: coords.left,
    zIndex: 9999,
    transform: isFlipped ? 'translateY(-100%)' : 'none',
  };

  if (currentItems === 'icon-search') {
    return createPortal(
      <div style={style}>
        <motion.div 
          initial={{ opacity: 0, y: isFlipped ? 10 : -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-64 h-[350px] bg-popover/95 backdrop-blur-xl border border-border shadow-2xl rounded-lg overflow-hidden flex flex-col"
        >
          <IconSearchView 
            editor={editor} 
            range={range} 
            onClose={onClose} 
            onBack={() => {
              setNavStack(prev => prev.slice(0, -1));
              setIndexStack(prev => prev.slice(0, -1));
            }} 
          />
        </motion.div>
      </div>,
      document.body
    );
  }

  if (filteredItems.length === 0) return null;

  // Group items by category if not searching
  const itemsToRender = query.length === 0 && !isSubMenu ? (
    CATEGORIES.map(cat => {
      const catItems = filteredItems.filter(i => i.category === cat);
      if (catItems.length === 0) return null;
      return (
        <div key={cat} className="space-y-0.5 mb-2 last:mb-0">
          <div className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60">{cat}</div>
          {catItems.map((item, index) => {
            const globalIndex = filteredItems.indexOf(item);
            return <ItemRow key={item.title} item={item} isSelected={globalIndex === selectedIndex} index={globalIndex} onClick={() => {
              if (item.customView) {
                setNavStack([...navStack, item.customView]);
                setIndexStack(prev => [...prev, 0]);
              } else if (item.children) {
                setNavStack([...navStack, item.children]);
                setIndexStack(prev => [...prev, 0]);
              } else if (item.command) { 
                item.command(editor, range); 
                onClose(); 
              }
            }} />;
          })}
        </div>
      );
    })
  ) : (
    filteredItems.map((item, index) => (
      <ItemRow key={item.title} item={item} isSelected={index === selectedIndex} index={index} onClick={() => {
        if (item.customView) {
          setNavStack([...navStack, item.customView]);
          setIndexStack(prev => [...prev, 0]);
        } else if (item.children) {
          setNavStack([...navStack, item.children]);
          setIndexStack(prev => [...prev, 0]);
        } else if (item.command) { 
          item.command(editor, range); 
          onClose(); 
        }
      }} />
    ))
  );

  return createPortal(
    <div style={style}>
      <motion.div 
        initial={{ opacity: 0, y: isFlipped ? 10 : -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-64 max-h-[400px] overflow-hidden bg-popover/95 backdrop-blur-xl border border-border shadow-2xl rounded-lg flex flex-col"
      >
        {isSubMenu && (
          <button 
            onClick={() => {
              setNavStack(prev => prev.slice(0, -1));
              setIndexStack(prev => prev.slice(0, -1));
            }}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-muted transition-colors border-b border-border/50 text-muted-foreground"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to menu
          </button>
        )}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto custom-scrollbar p-1"
        >
          {itemsToRender}
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

const ItemRow = ({ item, isSelected, index, onClick }: { item: SlashMenuItem, isSelected: boolean, index: number, onClick: () => void }) => (
  <button
    data-index={index}
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left transition-all duration-100 group relative",
      isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50 text-foreground/80"
    )}
  >
    <div className={cn(
      "w-6 h-6 rounded border border-border/50 flex items-center justify-center shrink-0 transition-colors",
      isSelected ? "bg-background shadow-sm" : "bg-muted/50 group-hover:bg-background"
    )}>
      {item.icon}
    </div>
    <span className="text-sm font-medium flex-1 truncate">{item.title}</span>
    {item.shortcut && !item.children && !item.customView && (
      <span className="text-[10px] font-mono opacity-40 ml-auto">{item.shortcut}</span>
    )}
    {(item.children || item.customView) && (
      <ChevronRight className="w-3 h-3 opacity-40 ml-auto" />
    )}
  </button>
);

const Trash2Placeholder = ({ className }: { className?: string }) => <Trash2 className={className} />;


const IconSearchView = ({ 
  editor, 
  range, 
  onClose, 
  onBack 
}: { 
  editor: any; 
  range: { from: number; to: number }; 
  onClose: () => void; 
  onBack: () => void; 
}) => {
  const [search, setSearch] = useState('');
  const [recentIcons, setRecentIcons] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('tiptap-recent-icons');
    if (saved) {
      try { setRecentIcons(JSON.parse(saved)); } catch (e) { }
    }
    setTimeout(() => {
      if (inputRef.current) inputRef.current.focus();
    }, 50);
  }, []);

  const saveRecentIcon = (name: string) => {
    const updated = [name, ...recentIcons.filter(i => i !== name)].slice(0, 12);
    setRecentIcons(updated);
    localStorage.setItem('tiptap-recent-icons', JSON.stringify(updated));
  };

  const allIconNames = useMemo(() => {
    // @ts-ignore
    return Object.keys(LucideIcons).filter(key =>
      /^[A-Z]/.test(key) && key !== 'Icon' && key !== 'LucideIcon' && key !== 'createLucideIcon'
    );
  }, []);

  const POPULAR_ICONS = ["Star", "Heart", "Check", "X", "Info", "AlertTriangle", "Settings", "User", "Mail", "Home", "Trash", "Edit", "Camera", "Image", "Link", "Plus", "Minus", "ArrowRight"];

  const filteredIcons = useMemo(() => {
    if (search.length < 2) return [];
    const q = search.toLowerCase();
    return allIconNames.filter(name => {
      const lower = name.toLowerCase();
      return lower.includes(q) || name.replace(/([A-Z])/g, ' $1').toLowerCase().includes(q);
    }).slice(0, 36);
  }, [search, allIconNames]);

  const displayedIcons = search.length < 2 
    ? (recentIcons.length > 0 ? recentIcons : POPULAR_ICONS) 
    : filteredIcons;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 6, displayedIcons.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 6, 0));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, displayedIcons.length - 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selectedName = displayedIcons[selectedIndex];
        if (selectedName) insertIcon(selectedName);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Backspace' && search === '') {
        e.preventDefault();
        onBack();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [displayedIcons, selectedIndex, search, onClose, onBack]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [displayedIcons.length, search]);

  const insertIcon = (name: string) => {
    try {
      editor.chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'lucideIcon',
          attrs: { name }
        })
        .run();
      saveRecentIcon(name);
    } catch (err) {
      console.error("Failed to insert icon:", err);
    } finally {
      onClose();
    }
  };

  return (
    <>
      <div className="p-2 border-b border-border/50 flex flex-col gap-2 shrink-0">
        <button 
          onClick={onBack}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold hover:bg-muted transition-colors rounded text-muted-foreground w-fit"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to menu
        </button>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search icons..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-2 text-xs bg-muted/50 border-none rounded focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {displayedIcons.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5 px-1">
              {search.length < 2 && recentIcons.length > 0 ? 'Recently Used' : search.length < 2 ? 'Popular Icons' : 'Search Results'}
            </div>
            <div className="grid grid-cols-6 gap-0.5">
              {displayedIcons.map((name, idx) => {
                // @ts-ignore
                const Icon = LucideIcons[name] || LucideIcons.HelpCircle;
                const isSelected = selectedIndex === idx;
                return (
                  <button
                    key={name + idx}
                    onClick={() => insertIcon(name)}
                    className={cn(
                      "w-[34px] h-[34px] flex items-center justify-center rounded transition-all",
                      isSelected ? "bg-primary text-primary-foreground scale-110 shadow-md relative z-10" : "hover:bg-accent text-foreground hover:scale-105"
                    )}
                    title={name}
                  >
                    <Icon size={18} strokeWidth={2} fill="currentColor" fillOpacity={0.2} />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {search.length > 0 && search.length < 2 && (
             <div className="text-center py-6 text-[10px] uppercase font-bold tracking-widest text-muted-foreground/50">Keep typing...</div>
        )}
        
        {search.length >= 2 && filteredIcons.length === 0 && (
          <div className="text-center py-6 text-xs italic text-muted-foreground">No icons found</div>
        )}
      </div>
    </>
  );
};
