import React, { useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { useAIAction } from '@/contexts/AIActionContext';
import { apiFetch, getAuthToken } from '@/lib/api';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import ImageResize from 'tiptap-extension-resize-image';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Table } from '@tiptap/extension-table';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import { SmartTableRow, SmartTableCell, SmartTableHeader, SmartTableEngine } from '../lib/tiptap/smart-table';
import TiptapLink from '@tiptap/extension-link';
import TiptapImage from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';

import { compressImage } from '../lib/image-compression';
import { SlashMenu } from './SlashMenu';
import { AnimatePresence } from 'framer-motion';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { NoteImporter } from '../lib/importers/note-importer';

import {
  LucideIconExtension,
  IconSpaceReset,
  ToggleExtension,
  Badge,
  CalendarNode,
  CustomKeyboardShortcuts,
  TrailingNode
} from './editor/extensions';

import { TextBubbleMenu } from './editor/menus/TextBubbleMenu';
import { TableBubbleMenu } from './editor/menus/TableBubbleMenu';
import { DocumentOutline, HeadingInfo } from './editor/panels/DocumentOutline';
import { LinkDialog } from './editor/dialogs/LinkDialog';

interface TiptapEditorProps {
  content: string;
  onChange?: (content: string) => void;
  isReadOnly?: boolean;
  /** When true, selection text is NOT synced to AI context (e.g. Notes — selection is for editing, not AI) */
  disableAISelection?: boolean;
}

export function TiptapEditor({ content, onChange, isReadOnly = false, disableAISelection = false }: TiptapEditorProps) {
  const { setSelectionText } = useAIAction();
  const [headings, setHeadings] = React.useState<HeadingInfo[]>([]);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState('');
  const [selectionVersion, setSelectionVersion] = React.useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const compressedFile = await compressImage(file, { maxWidth: 1280, quality: 0.8 });

        const formData = new FormData();
        formData.append('image', compressedFile);
        formData.append('feature', 'notes');

        const response = await apiFetch('/api/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        const data = await response.json();
        
        if (!response.ok) {
          console.error('Upload failed:', data);
          throw new Error(data.error || 'Upload failed');
        }

        if (data.url) {
          // Sanitize URL - remove escaped newlines
          let cleanUrl = data.url.replace(/\\n/g, '').replace(/\\r/g, '').trim();
          
          // For proxy/serve URLs (private S3), append auth token for cross-origin image loading
          if (cleanUrl.includes('/api/serve/') || cleanUrl.includes('/api/storage/proxy')) {
            const token = getAuthToken();
            if (token) {
              cleanUrl += (cleanUrl.includes('?') ? '&' : '?') + `token=${encodeURIComponent(token)}`;
            }
          }
          
          editor?.chain()
            .focus()
            .setImage({ src: cleanUrl })
            .run();

          editor?.commands.focus('end');
        }
      } catch (error) {
        console.error('Error uploading image:', error);
        alert('Failed to upload image: ' + (error as Error).message);
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const [slashMenu, setSlashMenu] = React.useState<{
    isOpen: boolean;
    query: string;
    range: { from: number; to: number };
    coords: { top: number; left: number; bottom: number };
  }>({
    isOpen: false,
    query: '',
    range: { from: 0, to: 0 },
    coords: { top: 0, left: 0, bottom: 0 }
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const extensions = React.useMemo(() => [
    TextStyle,
    Color,
    Badge,
    ToggleExtension,
    StarterKit.configure({
      link: false,
      underline: false,
    }),
    TrailingNode,
    ImageResize.configure({
      inline: false,
    } as Record<string, any>),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    SmartTableRow,
    SmartTableHeader,
    SmartTableCell,
    Table.configure({
      resizable: true,
      lastColumnResizable: false,
    }),
    SmartTableEngine,
    TextAlign.configure({
      types: ['heading', 'paragraph', 'tableCell', 'tableHeader'],
    }),
    Placeholder.configure({
      includeChildren: true,
      placeholder: ({ node, editor }) => {
        if (editor.isEmpty) {
          return "Type '/' for commands or start writing...";
        }
        if (node.type.name === 'paragraph') {
          return "Text";
        }
        return "";
      },
    }),
    TiptapImage.configure({
      inline: true,
      allowBase64: true,
    }),
    LucideIconExtension,
    IconSpaceReset,
    TiptapLink.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'text-primary underline cursor-pointer',
      },
    }),
    Underline,
    CalendarNode,
    CustomKeyboardShortcuts,
  ], []);

  const editor = useEditor({
    extensions,
    content,
    editable: !isReadOnly,
    editorProps: {
      attributes: {
        className: 'tiptap-editor-content focus:outline-none focus:ring-0 border-none outline-none min-h-[500px] pb-[350px] [&_img]:block [&_img]:mx-auto [&_img]:my-6 [&_.tiptap-extension-resize-image]:block [&_.tiptap-extension-resize-image]:mx-auto [&_code]:text-indigo-300',
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain');
        const html = event.clipboardData?.getData('text/html');

        const isMarkdownTable = /\|[\s-]*:?---[:\s-]*\|/.test(text || '');
        const isMarkdownGeneral = text ? /^\s*#|^\s*[-*+] |^\s*\||\[.*\]\(.*\)|(\*\*|__).*(\*\*|__)|`.*`|^\|.*\|/m.test(text) : false;

        // Detect Excel/Sheets/Table paste
        const isTablePaste = html && (
          html.includes('google-sheets-html-origin') || 
          html.includes('office:excel') || 
          html.includes('mso-') || 
          (html.includes('<table') && (html.includes('style=') || html.includes('width=')))
        );

        if (isTablePaste && html) {
          (async () => {
            try {
              // Strip all inline styles, classes, and presentation attributes to ensure clean look
              const cleanHtml = DOMPurify.sanitize(html, {
                FORBID_ATTR: ['style', 'class', 'width', 'height', 'bgcolor', 'valign', 'align'],
                ADD_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td', 'p', 'span', 'b', 'i', 'strong', 'em', 'ul', 'ol', 'li'],
                ADD_ATTR: ['colspan', 'rowspan'] // Preserve structural attributes
              });
              
              // Normalize structure via NoteImporter (ensures thead/tbody etc)
              const processedHtml = await NoteImporter.processHtmlForEditor(cleanHtml);
              
              if (editor) {
                editor.commands.insertContent(processedHtml);
              }
            } catch (error) {
              console.error('Error processing table paste:', error);
            }
          })();
          return true;
        }

        // If it's already HTML (but not a spreadsheet table), we usually let Tiptap handle it, 
        // UNLESS it looks like a markdown table (which Tiptap might not parse well from plain text)
        if (html && !isMarkdownTable) return false;

        if (text && (isMarkdownGeneral || isMarkdownTable)) {
            // We use an async IIFE because handlePaste expects a boolean return but processing might be async
            (async () => {
              try {
                // Parse markdown to HTML
                const parsedHtml = await marked.parse(text);
                
                // Use NoteImporter's robust processing (handles tables, task lists, etc.)
                const processedHtml = await NoteImporter.processHtmlForEditor(parsedHtml);
                
                // Final sanitize
                const cleanHtml = DOMPurify.sanitize(processedHtml, {
                  ADD_ATTR: ['data-type', 'data-checked'], // Allow Tiptap specific attributes
                  ADD_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td']
                });
                
                if (editor) {
                  editor.commands.insertContent(cleanHtml);
                }
              } catch (error) {
                console.error('Error parsing markdown on paste:', error);
                // Fallback to default paste if parsing fails
                document.execCommand('insertText', false, text);
              }
            })();
            return true; // We handled the paste
        }
        return false;
      }
    },
  });

  // ─── Selection tracking ──────────────────────────────
  const selectionTextRef = useRef<string | null>(null);

  // Clear AI selection context when this editor is in a non-AI context (e.g. Notes)
  useEffect(() => {
    if (disableAISelection) {
      setSelectionText(null);
      selectionTextRef.current = null;
    }
  }, [disableAISelection, setSelectionText]);

  useEffect(() => {
    if (!editor) return;

    const handleSelectionUpdate = () => {
      setSelectionVersion(v => v + 1);

      const { from, to, empty } = editor.state.selection;
      if (!empty && !disableAISelection) {
        const text = editor.state.doc.textBetween(from, to, ' ');
        if (selectionTextRef.current !== text) {
          selectionTextRef.current = text;
          setSelectionText(text);
        }
      }

      setSlashMenu(prev => {
        if (prev.isOpen) return { ...prev, isOpen: false };
        return prev;
      });
    };

    const handleFocus = () => {
      setSelectionVersion(v => v + 1);
    };

    const handleBlur = () => {
      setSelectionVersion(v => v + 1);
    };

    editor.on('selectionUpdate', handleSelectionUpdate);
    editor.on('focus', handleFocus);
    editor.on('blur', handleBlur);

    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
      editor.off('focus', handleFocus);
      editor.off('blur', handleBlur);
    };
  }, [editor, setSelectionText, disableAISelection]);

  useEffect(() => {
    if (editor && typeof content === 'string' && editor.getHTML() !== content) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  useEffect(() => {
    if (!editor) return;

    const extractHeadings = () => {
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
    };

    const handleUpdate = () => {
      if (onChange) {
        onChange(editor.getHTML());
      }

      extractHeadings();

      // Slash Menu Logic
      const { selection } = editor.state;
      const { $from } = selection;
      
      const textFromStartContent = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
      const slashIndex = textFromStartContent.lastIndexOf('/');

      if (slashIndex !== -1) {
        const query = textFromStartContent.slice(slashIndex + 1);
        const charBeforeSlash = textFromStartContent[slashIndex - 1];
        const isValidBoundary = !charBeforeSlash || /\s/.test(charBeforeSlash) || charBeforeSlash === '\ufffc';
        
        if (isValidBoundary) {
          if (!query.includes(' ')) {
            const from = $from.pos - (textFromStartContent.length - slashIndex);
            const to = $from.pos;
            const coords = editor.view.coordsAtPos(from);
            
            setSlashMenu({ isOpen: true, query, range: { from, to }, coords });
            return;
          }
        }
      }

      setSlashMenu(prev => {
        if (prev.isOpen) return { ...prev, isOpen: false };
        return prev;
      });
    };

    editor.on('update', handleUpdate);
    extractHeadings();
    return () => {
      editor.off('update', handleUpdate);
    };
  }, [editor, onChange]);

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
      <input
        type="file"
        id="tiptap-image-upload"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleImageUpload}
        className="hidden"
      />

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-visible custom-scrollbar bg-background relative px-4 sm:px-6 md:px-24"
      >
        <div className="max-w-4xl mx-auto my-0 sm:my-12 p-4 sm:p-16 min-h-[calc(100vh-200px)] bg-card border-x border-b sm:border border-border/40 shadow-none rounded-none sm:rounded-xl relative tiptap-editor-lined">

          <DocumentOutline headings={headings} scrollToHeading={scrollToHeading} editor={editor} />

          {editor && !isReadOnly && (
            <>
              <TextBubbleMenu editor={editor} openLinkDialog={openLinkDialog} showSendToAIButton={disableAISelection} />
              <TableBubbleMenu editor={editor} />
            </>
          )}

          <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none tiptap-editor prose-code:before:content-none prose-code:after:content-none prose-blockquote:before:content-none prose-blockquote:after:content-none">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      <LinkDialog
        isOpen={isLinkDialogOpen}
        onOpenChange={setIsLinkDialogOpen}
        url={linkUrl}
        onUrlChange={setLinkUrl}
        onSubmit={handleLinkSubmit}
      />

      <AnimatePresence>
        {slashMenu.isOpen && (
          <SlashMenu 
            editor={editor}
            query={slashMenu.query}
            range={slashMenu.range}
            coords={slashMenu.coords}
            onClose={() => setSlashMenu(prev => ({ ...prev, isOpen: false }))}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default TiptapEditor;
