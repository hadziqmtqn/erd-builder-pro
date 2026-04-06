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
import { X, Check } from 'lucide-react';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { compressImage } from '../lib/image-compression';

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

// Custom extension to ensure an empty paragraph is always at the end
const TrailingNode = Extension.create({
  name: 'trailingNode',
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
  }, [initialContent, editor]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* Toolbar - Always visible at the top */}
      <div className="flex-none bg-card border-b border-border p-2 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto">
          <MenuBar editor={editor} />
        </div>
      </div>

      {/* Scrollable Editor Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto p-6 sm:p-12">
          
          {editor && (
            <BubbleMenu 
              editor={editor} 
              shouldShow={({ editor }) => editor.isActive('image')}
              {...({ tippyOptions: { duration: 100, zIndex: 9999, placement: 'bottom-start', appendTo: () => document.body } } as any)} 
              className="flex gap-1 p-1 bg-popover border border-border shadow-lg rounded-md overflow-hidden"
            >
              {[25, 50, 75, 100].map((width) => (
                <button
                  key={width}
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => editor.chain().focus().updateAttributes('image', { width: `${width}%` }).run()}
                  className="px-3 py-1 text-xs font-semibold rounded-sm transition-colors hover:bg-accent text-popover-foreground flex items-center"
                >
                  {width}% Wide
                </button>
              ))}
              <div className="w-px h-4 bg-border mx-1 shrink-0 my-auto" />
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().deleteSelection().run()}
                className="px-3 py-1 text-xs font-semibold rounded-sm transition-colors hover:bg-destructive hover:text-destructive-foreground text-destructive flex items-center"
              >
                Delete
              </button>
            </BubbleMenu>
          )}

          {editor && (
            <BubbleMenu 
              editor={editor} 
              shouldShow={({ editor, from, to }) => {
                // Only show if there's a text selection and no image active
                return from !== to && !editor.isActive('image');
              }}
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
};

export default TiptapEditor;
