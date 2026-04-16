import React, { useRef, useEffect } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
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
import TiptapLink from '@tiptap/extension-link';

import { 
  Check, 
  ChevronRight, 
  ChevronDown, 
  Search,
  BookOpen,
  Database, 
  Trash2, 
  Share2,
  X, 
  PanelRight, 
  ChevronFirst,
  Bold,
  Italic,
  Strikethrough,
  Pilcrow,
  Link,
  Palette,
  Code2
} from 'lucide-react';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogBody,
} from "@/components/ui/dialog";
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state';
import { compressImage } from '../lib/image-compression';
import { cn } from '@/lib/utils';

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ListTree } from 'lucide-react';

const MenuBar = ({ editor, onOpenLinkDialog }: { editor: any, onOpenLinkDialog: () => void }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) {
    return null;
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
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
      {/* 1. Structural / Block Styles */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
            editor.isActive('heading') 
              ? 'bg-primary text-primary-foreground shadow-sm' 
              : 'bg-secondary/40 text-secondary-foreground hover:bg-secondary/80'
          )}>
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

      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setParagraph().run()} className={toggleClass(editor.isActive('paragraph'))}>
        Paragraph
      </button>

      <div className="w-px h-6 bg-border mx-1 shrink-0" />

      {/* 2. Text Formatting */}
      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()} className={toggleClass(editor.isActive('bold'))}>
        Bold
      </button>
      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()} className={toggleClass(editor.isActive('italic'))}>
        Italic
      </button>
      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleStrike().run()} className={toggleClass(editor.isActive('strike'))}>
        Strike
      </button>

      <div className="w-px h-6 bg-border mx-1 shrink-0" />

      {/* 3. Lists & Organization */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
            (editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList'))
              ? 'bg-primary text-primary-foreground shadow-sm' 
              : 'bg-secondary/40 text-secondary-foreground hover:bg-secondary/80'
          )}>
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

      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setToggle().run()} className={toggleClass(editor.isActive('toggle'))}>
        Toggle
      </button>
      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBlockquote().run()} className={toggleClass(editor.isActive('blockquote'))}>
        Quote
      </button>

      <div className="w-px h-6 bg-border mx-1 shrink-0" />

      {/* 4. Media & Links */}
      <button 
        type="button" 
        onPointerDown={(e) => e.preventDefault()} 
        onClick={onOpenLinkDialog} 
        className={cn(toggleClass(editor.isActive('link')), "whitespace-nowrap")}
      >
        Link
      </button>
      {editor.isActive('link') && (
        <button 
          type="button" 
          onPointerDown={(e) => e.preventDefault()} 
          onClick={() => editor.chain().focus().unsetLink().run()} 
          className={cn(toggleClass(false), "text-destructive hover:bg-destructive/10 whitespace-nowrap")}
        >
          Unlink
        </button>
      )}

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

      {/* 5. Code & Specialized Blocks */}
      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleCode().run()} className={toggleClass(editor.isActive('code'))}>
        Code
      </button>
      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={toggleClass(editor.isActive('codeBlock'))}>
        Code Block
      </button>

      <div className="w-px h-6 bg-border mx-1 shrink-0" />

      {/* 6. Advanced Controls */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
            editor.isActive('table')
              ? 'bg-primary text-primary-foreground shadow-sm' 
              : 'bg-secondary/40 text-secondary-foreground hover:bg-secondary/80'
          )}>
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

      {/* 7. History */}
      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().undo().run()} className="px-3 py-1.5 text-sm font-medium rounded-md bg-secondary/40 text-secondary-foreground hover:bg-secondary/80 whitespace-nowrap">
        Undo
      </button>
      <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().redo().run()} className="px-3 py-1.5 text-sm font-medium rounded-md bg-secondary/40 text-secondary-foreground hover:bg-secondary/80 whitespace-nowrap">
        Redo
      </button>
    </div>
  );
};

interface TiptapEditorProps {
  content: string;
  onChange?: (content: string) => void;
  isReadOnly?: boolean;
}

interface HeadingInfo {
  text: string;
  level: number;
  pos: number;
}

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

          return tr.insert(doc.content.size, nodeType.create());
        },
      }),
    ];
  },
});

const ToggleExtension = Node.create({
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
      setToggle: () => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: { open: true, title: 'Toggle Section' },
          content: [{ type: 'paragraph' }]
        });
      },
    } as any;
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

export function TiptapEditor({ content, onChange, isReadOnly = false }: TiptapEditorProps) {
  const [headings, setHeadings] = React.useState<HeadingInfo[]>([]);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState('');
  const [selectionVersion, setSelectionVersion] = React.useState(0);
  const [showOutline, setShowOutline] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const extensions = React.useMemo(() => [
    TextStyle,
    Color,
    ToggleExtension,
    StarterKit.configure({
      link: false,
    }),
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
    TiptapLink.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'text-primary underline cursor-pointer',
      },
    }),
  ], []);

  const editor = useEditor({
    extensions,
    content,
    editable: !isReadOnly,
    onUpdate({ editor }) {
      if (onChange) {
        onChange(editor.getHTML());
      }
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
    },
    onSelectionUpdate() {
      setSelectionVersion(v => v + 1);
    },
    onFocus() {
      setSelectionVersion(v => v + 1);
    },
    onBlur() {
      setSelectionVersion(v => v + 1);
    },
    editorProps: {
      attributes: {
        className: 'tiptap-editor-content focus:outline-none focus:ring-0 border-none outline-none min-h-[500px] pb-[150px] [&_img]:block [&_img]:mx-auto [&_img]:my-6 [&_.tiptap-extension-resize-image]:block [&_.tiptap-extension-resize-image]:mx-auto [&_code]:text-indigo-300',
      },
    },
  });

  useEffect(() => {
    if (editor && typeof content === 'string' && editor.getHTML() !== content) {
      editor.commands.setContent(content);
    }
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
  }, [content, editor]);

  const openLinkDialog = () => {
    if (editor) {
      const previousUrl = editor.getAttributes('link').href || '';
      setLinkUrl(previousUrl);
      setIsLinkDialogOpen(true);
    }
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editor) {
      if (linkUrl === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
      } else {
        editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
      }
      setIsLinkDialogOpen(false);
    }
  };

  const scrollToHeading = (pos: number) => {
    if (editor) {
      editor.commands.focus(pos);
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
      {!isReadOnly && (
        <div className="flex-none bg-card border-b border-border p-2 z-10 shadow-sm">
          <div className="max-w-4xl mx-auto">
            <MenuBar editor={editor} onOpenLinkDialog={openLinkDialog} />
          </div>
        </div>
      )}

      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-visible custom-scrollbar bg-neutral-950/50 relative px-4 sm:px-6 md:px-24"
      >
        <div className="max-w-4xl mx-auto my-0 sm:my-12 p-4 sm:p-16 min-h-[calc(100vh-200px)] bg-card border-x border-b sm:border border-border/40 shadow-2xl rounded-none sm:rounded-xl relative">
          
          {/* Floating Outline Panel Using Standard Shadcn UI Patterns */}
          <div className="absolute -right-14 top-0 h-full hidden md:block z-40">
            <div className="sticky top-1/2 -translate-y-1/2">
              <TooltipProvider delay={0}>
                <HoverCard openDelay={100} closeDelay={300}>
                   <Tooltip>
                    <TooltipTrigger render={<div className="flex items-center justify-center" />}>
                      <HoverCardTrigger asChild>
                        <Button 
                          variant="secondary" 
                          size="icon" 
                          className="h-10 w-10 rounded-full shadow-lg border border-border/50 bg-background/80 backdrop-blur-sm hover:bg-accent transition-all duration-300"
                        >
                          <ListTree className="w-5 h-5 text-muted-foreground" />
                        </Button>
                      </HoverCardTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>Document Outline</p>
                    </TooltipContent>
                  </Tooltip>

                  <HoverCardContent 
                    side="left" 
                    align="center" 
                    sideOffset={15}
                    className="w-[300px] bg-popover/95 backdrop-blur-xl border-border rounded-lg p-5 shadow-2xl"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b pb-2">
                        <h4 className="text-sm font-semibold tracking-tight">Navigation</h4>
                        <span className="text-[10px] text-muted-foreground uppercase font-medium">Headings</span>
                      </div>
                      
                      {headings.length > 0 ? (
                        <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                          {headings.map((heading, i) => (
                            <button
                              key={`${heading.pos}-${i}`}
                              onClick={() => scrollToHeading(heading.pos)}
                              className={cn(
                                "text-left transition-all duration-200 py-1.5 px-3 rounded-md hover:bg-accent text-sm font-medium text-foreground/80 hover:text-foreground truncate",
                                heading.level === 1 ? "text-primary font-bold bg-primary/5" : 
                                heading.level === 2 ? "pl-4 text-foreground/70" : 
                                heading.level === 3 ? "pl-7 text-foreground/60 scale-95 origin-left" :
                                heading.level === 4 ? "pl-10 text-foreground/50 scale-90 origin-left" :
                                "pl-12 text-foreground/40 scale-90 origin-left"
                              )}
                            >
                              {heading.text}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground/50">
                          <p className="text-xs italic">No headings found</p>
                        </div>
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </TooltipProvider>
            </div>
          </div>

          {editor && !isReadOnly && (
            <BubbleMenu 
              editor={editor} 
              pluginKey="textMenu"
              shouldShow={({ editor, state }) => {
                return editor.isFocused && editor.isEditable && !state.selection.empty;
              }}
              {...({ tippyOptions: { duration: 100, zIndex: 9999, placement: 'bottom-start', appendTo: () => document.body } } as any)} 
              className="flex gap-1 p-1 bg-popover border border-border shadow-lg rounded-md overflow-hidden"
            >
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().setParagraph().run()}
                className={`h-8 w-8 flex items-center justify-center rounded-sm transition-colors ${editor.isActive('paragraph') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-popover-foreground'}`}
              >
                <Pilcrow className="w-4 h-4" />
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={`h-8 w-8 flex items-center justify-center rounded-sm transition-colors ${editor.isActive('bold') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-popover-foreground'}`}
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={`h-8 w-8 flex items-center justify-center rounded-sm transition-colors ${editor.isActive('italic') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-popover-foreground'}`}
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleStrike().run()}
                className={`h-8 w-8 flex items-center justify-center rounded-sm transition-colors ${editor.isActive('strike') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-popover-foreground'}`}
              >
                <Strikethrough className="w-4 h-4" />
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                className={`h-8 w-8 flex items-center justify-center rounded-sm transition-colors ${editor.isActive('codeBlock') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-popover-foreground'}`}
              >
                <Code2 className="w-4 h-4" />
              </button>

              <div className="w-[1px] h-4 bg-border mx-0.5 self-center" />

              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={openLinkDialog}
                className={`h-8 w-8 flex items-center justify-center rounded-sm transition-colors ${editor.isActive('link') ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-popover-foreground text-primary'}`}
              >
                <Link className="w-4 h-4" />
              </button>

              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger asChild>
                  <button className="h-8 w-8 flex items-center justify-center rounded-sm transition-colors hover:bg-accent text-popover-foreground">
                    <Palette className="w-4 h-4" />
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
                          if (value) editor.chain().focus().setColor(value).run();
                          else editor.chain().focus().unsetColor().run();
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

          <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none tiptap-editor prose-code:before:content-none prose-code:after:content-none prose-blockquote:before:content-none prose-blockquote:after:content-none">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Link</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleLinkSubmit}>
            <DialogBody>
              <div className="grid gap-4 py-2">
                <div className="space-y-2">
                  <label htmlFor="url" className="text-sm font-medium">URL</label>
                  <Input
                    id="url"
                    type="url"
                    placeholder="https://example.com"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsLinkDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TiptapEditor;
