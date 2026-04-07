import React, { useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import ImageResize from 'tiptap-extension-resize-image';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { X, Check, PanelRight, ChevronFirst } from 'lucide-react';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state';
import { compressImage } from '../lib/image-compression';
import { cn } from '@/lib/utils';

const MenuBar = ({ editor }: { editor: any }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) {
    return null;
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // Compress image before upload (max 1280px width, 80% quality)
        const compressedFile = await compressImage(file, { maxWidth: 1280, quality: 0.8 });

        const formData = new FormData();
        formData.append('image', compressedFile);
        formData.append('feature', 'notes');

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Upload failed');
        }

        const data = await response.json();
        if (data.url) {
          editor.chain()
            .focus()
            .setImage({ src: data.url })
            .run();
          
          // Use a separate command to focus the end after the image and auto-paragraph are inserted
          editor.commands.focus('end');
        }
      } catch (error) {
        console.error('Error uploading image:', error);
        alert('Failed to upload image');
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleClass = (isActive: boolean) => 
    `px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary/40 text-secondary-foreground hover:bg-secondary/80'}`;

  return (
    <div className="flex flex-nowrap gap-2 items-center w-full overflow-x-auto custom-scrollbar pb-2 pt-1 px-1">
      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()} className={toggleClass(editor.isActive('bold'))}>
        Bold
      </button>
      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()} className={toggleClass(editor.isActive('italic'))}>
        Italic
      </button>
      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleStrike().run()} className={toggleClass(editor.isActive('strike'))}>
        Strike
      </button>

      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleCode().run()} className={toggleClass(editor.isActive('code'))}>
        Code
      </button>
      
      <div className="w-px h-6 bg-border mx-1 shrink-0" />

      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setParagraph().run()} className={toggleClass(editor.isActive('paragraph'))}>
        Paragraph
      </button>

      <div className="w-px h-6 bg-border mx-1 shrink-0" />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="px-3 py-1.5 text-sm font-medium rounded-md bg-secondary/40 text-secondary-foreground hover:bg-secondary/80 whitespace-nowrap">
            Heading
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="bg-popover border border-border p-2 rounded-md shadow-lg z-50 min-w-[150px] flex flex-col gap-1" sideOffset={5}>
            {[1, 2, 3, 4, 5].map((level) => (
              <DropdownMenu.Item 
                key={level}
                onSelect={() => editor.chain().focus().toggleHeading({ level: level as any }).run()} 
                className={`px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer ${editor.isActive('heading', { level }) ? 'bg-accent' : ''}`}
              >
                Heading {level}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="px-3 py-1.5 text-sm font-medium rounded-md bg-secondary/40 text-secondary-foreground hover:bg-secondary/80 whitespace-nowrap">
            List
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="bg-popover border border-border p-2 rounded-md shadow-lg z-50 min-w-[150px] flex flex-col gap-1" sideOffset={5}>
            <DropdownMenu.Item onSelect={() => editor.chain().focus().toggleBulletList().run()} className={`px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer ${editor.isActive('bulletList') ? 'bg-accent' : ''}`}>Bullet List</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => editor.chain().focus().toggleOrderedList().run()} className={`px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer ${editor.isActive('orderedList') ? 'bg-accent' : ''}`}>Numbered List</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => editor.chain().focus().toggleTaskList().run()} className={`px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer ${editor.isActive('taskList') ? 'bg-accent' : ''}`}>Task List</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBlockquote().run()} className={toggleClass(editor.isActive('blockquote'))}>
        Quote
      </button>

      <div className="w-px h-6 bg-border mx-1 shrink-0" />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="px-3 py-1.5 text-sm font-medium rounded-md bg-secondary/40 text-secondary-foreground hover:bg-secondary/80 whitespace-nowrap">
            Table Controls
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="bg-popover border border-border p-2 rounded-md shadow-lg z-50 min-w-[150px] flex flex-col gap-1" sideOffset={5}>
            <DropdownMenu.Item onSelect={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} className="px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer">Insert Table</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => editor.chain().focus().addColumnAfter().run()} className="px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer">+ Col</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => editor.chain().focus().deleteColumn().run()} className="px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer">- Col</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => editor.chain().focus().addRowAfter().run()} className="px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer">+ Row</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => editor.chain().focus().deleteRow().run()} className="px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer">- Row</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => editor.chain().focus().deleteTable().run()} className="px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer text-destructive">Del Table</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <div className="w-px h-6 bg-border mx-1 shrink-0" />

      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 text-sm font-medium rounded-md bg-secondary/40 text-secondary-foreground hover:bg-secondary/80 whitespace-nowrap">
        Image
      </button>
      <input 
        type="file" 
        accept="image/*" 
        ref={fileInputRef} 
        onChange={handleImageUpload} 
        className="hidden" 
      />

      <div className="w-px h-6 bg-border mx-1 shrink-0" />

      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().undo().run()} className="px-3 py-1.5 text-sm font-medium rounded-md bg-secondary/40 text-secondary-foreground hover:bg-secondary/80 whitespace-nowrap">
        Undo
      </button>
      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().redo().run()} className="px-3 py-1.5 text-sm font-medium rounded-md bg-secondary/40 text-secondary-foreground hover:bg-secondary/80 whitespace-nowrap">
        Redo
      </button>
    </div>
  );
};
// ... rest of file

interface TiptapEditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
}

interface HeadingInfo {
  text: string;
  level: number;
  pos: number;
}

// Custom extension to ensure an empty paragraph is always at the end
const TrailingNode = Extension.create({
  name: 'customTrailingNode',
  addOptions() {
    return {
      node: 'paragraph',
      notAfter: ['paragraph'],
      extraAfter: ['image', 'table', 'taskList'],
    };
  },
  addProseMirrorPlugins() {
    const pluginKey = new PluginKey(this.name);
    return [
      new Plugin({
        key: pluginKey,
        appendTransaction: (transactions, oldState, newState) => {
          const { doc, tr, schema } = newState;
          const { node, notAfter, extraAfter = [] } = this.options;
          const nodeType = schema.nodes[node];

          if (!nodeType) {
            return;
          }

          const lastChild = doc.lastChild;

          if (!lastChild || notAfter.includes(lastChild.type.name)) {
            return;
          }

          // If it's an extraAfter type (like image), or any other block that's not a paragraph
          return tr.insert(doc.content.size, nodeType.create());
        },
      }),
    ];
  },
});

const TiptapEditor = ({ initialContent = '', onChange }: TiptapEditorProps) => {
  const [headings, setHeadings] = React.useState<HeadingInfo[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const extensions = React.useMemo(() => [
    TextStyle,
    Color,
    StarterKit,
    TrailingNode,
    ImageResize.configure({
      inline: false,
    } as any),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({
      placeholder: 'Write something awesome...',
    }),
  ], []);

  const editor = useEditor({
    extensions,
    content: initialContent,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (onChange) {
        onChange(html);
      }

      // Extract headings for the outline
      const extracted: HeadingInfo[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading' && node.attrs.level <= 5) {
          extracted.push({
            text: node.textContent,
            level: node.attrs.level,
            pos: pos + 1 // Add 1 to pos to focus correctly
          });
        }
      });
      setHeadings(extracted);
    },
    editorProps: {
      attributes: {
        className: 'tiptap-editor-content focus:outline-none focus:ring-0 border-none outline-none min-h-[500px] pb-[150px] [&_img]:block [&_img]:mx-auto [&_img]:my-6 [&_.tiptap-extension-resize-image]:block [&_.tiptap-extension-resize-image]:mx-auto',
      },
    },
  });

  useEffect(() => {
    if (editor && typeof initialContent === 'string' && editor.getHTML() !== initialContent) {
      editor.commands.setContent(initialContent);
    }
    
    // Extract headings whenever editor is ready or content changes
    if (editor) {
      const extracted: HeadingInfo[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading' && node.attrs.level <= 5) {
          extracted.push({
            text: node.textContent,
            level: node.attrs.level,
            pos: pos + 1
          });
        }
      });
      setHeadings(extracted);
    }
  }, [initialContent, editor]);

  const scrollToHeading = (pos: number) => {
    if (editor) {
      editor.commands.focus(pos);
      // Wait a bit for focus to happen, then scroll if needed
      setTimeout(() => {
        const domAtPos = editor.view.domAtPos(pos);
        if (domAtPos.node instanceof HTMLElement) {
          domAtPos.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (domAtPos.node.parentElement) {
          domAtPos.node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* Toolbar - Always visible at the top */}
      <div className="flex-none bg-card border-b border-border p-2 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto">
          <MenuBar editor={editor} />
        </div>
      </div>

      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-visible custom-scrollbar bg-neutral-950/50 relative px-0 sm:px-6 md:px-24"
      >
        <div className="max-w-4xl mx-auto my-0 sm:my-12 p-4 sm:p-16 min-h-[calc(100vh-200px)] bg-card border-x border-b sm:border border-border/40 shadow-2xl rounded-none sm:rounded-xl relative group/outline-ctx">
          
          {/* Floating Outline Panel - Sticky centered in viewport */}
          <div className="absolute -right-12 top-0 h-full hidden md:block pointer-events-none z-40">
            <div className="sticky top-1/2 -translate-y-1/2 pointer-events-auto">
              <div className="group relative">
                {/* The "Handle" - THE ONLY TRIGGER AREA (Narrow) */}
                <div className="h-40 w-8 flex flex-col gap-2 justify-center items-center cursor-pointer bg-transparent border-r border-transparent hover:border-yellow-500/20">
                  <div className="w-1 h-12 rounded-full bg-yellow-500/20 group-hover:bg-yellow-500/60 transition-all duration-300" />
                  <div className="w-1 h-3 rounded-full bg-yellow-500/10 group-hover:bg-yellow-500/30 transition-all duration-300" />
                </div>

                {/* The Panel - Absolute positioned to the LEFT of handle with a hover bridge */}
                <div className="absolute right-full top-1/2 -translate-y-1/2 pr-3 opacity-0 translate-x-8 scale-95 group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 transition-all duration-300 pointer-events-none group-hover:pointer-events-auto origin-right">
                  <div className="bg-neutral-950/90 backdrop-blur-xl border border-yellow-500/20 rounded-2xl p-5 min-w-[200px] max-w-[280px] max-h-[80vh] overflow-y-auto custom-scrollbar shadow-[0_0_40px_-10px_rgba(234,179,8,0.15)] ring-1 ring-white/5">
                    {headings.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {headings.map((heading, i) => (
                          <button
                            key={`${heading.pos}-${i}`}
                            onClick={() => scrollToHeading(heading.pos)}
                            className={cn(
                              "text-left transition-all duration-200 group/item relative py-0.5 pr-4 rounded-sm hover:bg-yellow-500/10 uppercase tracking-wide text-[11px] font-bold text-yellow-500 cursor-pointer",
                              heading.level === 1 ? "mt-1" : 
                              heading.level === 2 ? "pl-1 opacity-90" : 
                              heading.level === 3 ? "pl-2 opacity-80" :
                              heading.level === 4 ? "pl-3 opacity-70" :
                              "pl-4 opacity-60"
                            )}
                          >
                            {/* Vertical indicator for H1 */}
                            {heading.level === 1 && (
                              <div className="absolute left-[-0.6rem] top-1/2 -translate-y-1/2 w-[2px] h-3 bg-yellow-500 group-hover/item:bg-yellow-400 transition-colors" />
                            )}
                            
                            <span className="block truncate transition-all duration-200 group-hover/item:translate-x-0.5">
                              {heading.text}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
                        <p className="text-[10px] font-medium uppercase tracking-widest text-yellow-500/50">Outline Empty</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {editor && (
            <BubbleMenu 
              editor={editor} 
              pluginKey="textMenu"
              shouldShow={({ from, to }) => from !== to}
              {...({ tippyOptions: { duration: 100, zIndex: 9999, placement: 'bottom-start', appendTo: () => document.body } } as any)} 
              className="flex gap-1 p-1 bg-popover border border-border shadow-lg rounded-md overflow-hidden"
            >
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().setParagraph().run()}
                className={`px-3 py-1 text-sm font-medium rounded-sm transition-colors ${editor.isActive('paragraph') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-popover-foreground'}`}
              >
                Paragraph
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={`px-3 py-1 text-sm font-medium rounded-sm transition-colors ${editor.isActive('bold') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-popover-foreground'}`}
              >
                Bold
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={`px-3 py-1 text-sm font-medium rounded-sm transition-colors ${editor.isActive('italic') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-popover-foreground'}`}
              >
                Italic
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleStrike().run()}
                className={`px-3 py-1 text-sm font-medium rounded-sm transition-colors ${editor.isActive('strike') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-popover-foreground'}`}
              >
                Strike
              </button>

              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger asChild>
                  <button className="px-3 py-1 text-sm font-medium rounded-sm transition-colors hover:bg-accent text-popover-foreground flex items-center gap-1">
                    Color
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content className="bg-popover border border-border p-1.5 rounded-lg shadow-lg z-[10000] min-w-[160px] flex flex-col" sideOffset={5} align="start">
                  <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Theme Colors</div>
                  {[
                    { name: 'Default', value: '' },
                    { name: 'Indigo', value: '#6366f1' },
                    { name: 'Purple', value: '#8b5cf6' },
                    { name: 'Pink', value: '#ec4899' },
                    { name: 'Blue', value: '#3b82f6' },
                    { name: 'Green', value: '#10b981' },
                    { name: 'Orange', value: '#f59e0b' },
                    { name: 'Red', value: '#ef4444' }
                  ].map(({ name, value }) => {
                    const isActive = value ? editor.isActive('textStyle', { color: value }) : (!editor.getAttributes('textStyle').color);
                    return (
                      <DropdownMenu.Item 
                        key={name}
                        onSelect={() => {
                          if (value) {
                            editor.chain().focus().setColor(value).run();
                          } else {
                            editor.chain().focus().unsetColor().run();
                          }
                        }}
                        className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent focus:bg-accent outline-none ${isActive ? 'bg-accent/50' : ''}`}
                      >
                        <div 
                          className="w-4 h-4 rounded-sm border border-border/50 shrink-0 flex items-center justify-center font-bold text-white text-[10px]" 
                          style={value ? { backgroundColor: value } : { backgroundColor: 'transparent' }}
                        >
                          {!value && <span className="text-foreground">A</span>}
                        </div>
                        <span className="flex-1">{name}</span>
                        {isActive && <Check className="w-3.5 h-3.5 opacity-70" />}
                      </DropdownMenu.Item>
                    );
                  })}
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </BubbleMenu>
          )}

          {editor && (
            <FloatingMenu editor={editor} {...({ tippyOptions: { duration: 100, zIndex: 9999, placement: 'bottom-start', appendTo: () => document.body } } as any)} className="flex gap-1 p-1 bg-popover border border-border shadow-lg rounded-md overflow-hidden">
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().setParagraph().run()}
                className={`px-3 py-1 text-sm font-medium rounded-sm transition-colors ${editor.isActive('paragraph') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-popover-foreground'}`}
              >
                Paragraph
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                className={`px-3 py-1 text-sm font-medium rounded-sm transition-colors ${editor.isActive('heading', { level: 1 }) ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-popover-foreground'}`}
              >
                H1
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                className={`px-3 py-1 text-sm font-medium rounded-sm transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-popover-foreground'}`}
              >
                H2
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={`px-3 py-1 text-sm font-medium rounded-sm transition-colors ${editor.isActive('bulletList') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-popover-foreground'}`}
              >
                Bullet List
              </button>
            </FloatingMenu>
          )}

          <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none tiptap-editor">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default TiptapEditor;
