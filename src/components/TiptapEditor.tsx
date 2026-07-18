import React, { useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
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

const MARKDOWN_PATTERNS = [
  /^\s{0,3}#{1,6}\s+\S/m,
  /^\s{0,3}(?:[-*+])\s+\S/m,
  /^\s{0,3}\d+\.\s+\S/m,
  /^\s{0,3}>\s+\S/m,
  /^\s{0,3}```[\s\S]*?^\s{0,3}```/m,
  /^\s{0,3}[-*_]{3,}\s*$/m,
  /^\s{0,3}- \[[ xX]\]\s+\S/m,
  /\[[^\]]+\]\([^)]+\)/,
  /(?:^|[^\w])(?:\*\*|__)[^\n]+(?:\*\*|__)(?:[^\w]|$)/,
  /(?:^|[^\w])~~[^\n]+~~(?:[^\w]|$)/,
  /`[^`\n]+`/,
];

function isMarkdownTable(text: string): boolean {
  const lines = text.trim().split(/\r?\n/);
  return lines.some((line, index) => {
    if (index === 0) return false;
    const previous = lines[index - 1];
    return previous.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  });
}

function isLikelyMarkdown(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (isMarkdownTable(trimmed)) return true;
  return MARKDOWN_PATTERNS.some(pattern => pattern.test(trimmed));
}

function unwrapMarkdownFence(text: string): string {
  const match = text.trim().match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  if (!match) return text;
  const inner = match[1].trim();
  return isLikelyMarkdown(inner) ? inner : text;
}

function insertHtmlIntoView(view: EditorView, html: string): void {
  const container = document.createElement('div');
  container.innerHTML = html;
  const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(container);
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
}

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
        const markdownText = text ? unwrapMarkdownFence(text) : '';

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
              
              insertHtmlIntoView(view, processedHtml);
            } catch (error) {
              console.error('Error processing table paste:', error);
            }
          })();
          return true;
        }

        if (markdownText && isLikelyMarkdown(markdownText)) {
            // We use an async IIFE because handlePaste expects a boolean return but processing might be async
            (async () => {
              try {
                // Parse markdown to HTML
                const parsedHtml = await marked.parse(markdownText, { gfm: true, breaks: true });
                
                // Use NoteImporter's robust processing (handles tables, task lists, etc.)
                const processedHtml = await NoteImporter.processHtmlForEditor(parsedHtml);
                
                // Final sanitize
                const cleanHtml = DOMPurify.sanitize(processedHtml, {
                  ADD_ATTR: ['data-type', 'data-checked'], // Allow Tiptap specific attributes
                  ADD_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td']
                });
                
                insertHtmlIntoView(view, cleanHtml);
              } catch (error) {
                console.error('Error parsing markdown on paste:', error);
                // Fallback to default paste if parsing fails
                view.dispatch(view.state.tr.insertText(markdownText));
              }
            })();
            return true; // We handled the paste
        }

        // If it's already HTML and does not look like Markdown source, let Tiptap
        // preserve the existing rich clipboard structure.
        if (html) return false;

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

  // Normalize HTML for comparison — preserves format attrs (style) but strips
  // Tiptap normalization noise (empty class, whitespace). Used to detect real
  // content changes including format-only edits like text alignment.
  const htmlContent = (html: string) =>
    html.replace(/\s*class=""\s*/g, '').replace(/\s+/g, ' ').trim();

  const recentLocalContentRef = useRef<string[]>([]);
  const rememberLocalContent = React.useCallback((html: string) => {
    const normalized = htmlContent(html);
    recentLocalContentRef.current = [
      normalized,
      ...recentLocalContentRef.current.filter(item => item !== normalized),
    ].slice(0, 20);
  }, []);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (typeof content !== 'string') return;

    const currentHtml = editor.getHTML();
    if (currentHtml === content) return;

    const normalizedIncoming = htmlContent(content);

    // Autosave writes the same local edits back into React state after async
    // persistence. Re-applying that content with setContent resets ProseMirror
    // selection and can throw the caret to another paragraph while the user is
    // still typing.
    if (recentLocalContentRef.current.includes(normalizedIncoming)) {
      return;
    }

    // If the only difference is serializer noise, keep the live editor document
    // untouched so selection stays exactly where the user left it.
    if (htmlContent(currentHtml) === normalizedIncoming) {
      return;
    }

    editor.commands.setContent(content, { emitUpdate: false });
  }, [editor, content]);

  // Debounce ref for onChange — prevents cascading re-renders on every keystroke
  const onChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track the content prop value on every render — used in handleUpdate to skip
  // saves when editor content matches the prop (external sync, not user edit).
  const contentPropRef = useRef<string>(content ?? '');
  contentPropRef.current = content ?? '';

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
      // Skip if normalized HTML matches prop — this update came from
      // an external content sync, not a user edit. Uses HTML comparison
      // (not plain text) so format-only edits (alignment) are detected.
      if (htmlContent(editor.getHTML()) === htmlContent(contentPropRef.current)) {
        extractHeadings();
        return;
      }

      // Debounce onChange to avoid firing on every keystroke.
      // The parent (handleNoteChange) also has its own 400ms debounce for the actual save.
      // This prevents the cascading re-render chain: keystroke → onChange →
      // re-render → saveNote recreated → handleNoteChange recreated → this effect re-runs.
      if (onChangeTimeoutRef.current) {
        clearTimeout(onChangeTimeoutRef.current);
      }
      onChangeTimeoutRef.current = setTimeout(() => {
        if (onChange) {
          const latestHtml = editor.getHTML();
          rememberLocalContent(latestHtml);
          onChange(latestHtml);
        }
      }, 150);

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
      if (onChangeTimeoutRef.current) {
        clearTimeout(onChangeTimeoutRef.current);
      }
    };
  }, [editor, onChange, rememberLocalContent]);

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

          <DocumentOutline headings={headings} scrollToHeading={scrollToHeading} />

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
