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
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

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
          editor.chain().focus().setImage({ src: data.url }).run();
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

const TiptapEditor = ({ initialContent = '', onChange }: TiptapEditorProps) => {
  const [, setUpdateTrigger] = React.useState(0);
  const editor = useEditor({
    extensions: [
      StarterKit,
      ImageResize.configure({
        inline: true,
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
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (onChange) {
        onChange(html);
      }
    },
    onSelectionUpdate: ({ editor }) => {
      // This forces a re-render on selection change to update toolbar active states
      setUpdateTrigger(prev => prev + 1);
    },
    onTransaction: () => {
      // This ensures re-render even for transactions without selection changes
      setUpdateTrigger(prev => prev + 1);
    },
    editorProps: {
      attributes: {
        className: 'tiptap-editor-content focus:outline-none focus:ring-0 border-none outline-none min-h-[500px]',
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
            <BubbleMenu editor={editor} {...({ tippyOptions: { duration: 100, zIndex: 50 } } as any)} className="flex gap-1 p-1 bg-popover border border-border shadow-lg rounded-md overflow-hidden">
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
            </BubbleMenu>
          )}

          {editor && (
            <FloatingMenu editor={editor} {...({ tippyOptions: { duration: 100, zIndex: 50 } } as any)} className="flex gap-1 p-1 bg-popover border border-border shadow-lg rounded-md overflow-hidden">
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
