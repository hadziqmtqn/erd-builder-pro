import React, { useRef, useEffect, useMemo, useCallback } from 'react';
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
import { FileMentionMenu, FileMentionOption } from './editor/FileMentionMenu';
import { useWorkspace } from '@/providers/WorkspaceContext';
import { useNavigate } from 'react-router-dom';
import { localPersistence } from '@/lib/localPersistence';

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
  const navigate = useNavigate();
  const { notes, diagrams, flowcharts, drawings, projects, isGuest } = useWorkspace();
  const [headings, setHeadings] = React.useState<HeadingInfo[]>([]);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mentionMenu, setMentionMenu] = React.useState<{
    isOpen: boolean;
    query: string;
    range: { from: number; to: number };
    coords: { top: number; left: number; bottom: number };
    selectedIndex: number;
  }>({
    isOpen: false,
    query: '',
    range: { from: 0, to: 0 },
    coords: { top: 0, left: 0, bottom: 0 },
    selectedIndex: 0,
  });

  const [loadedMentionFiles, setLoadedMentionFiles] = React.useState<FileMentionOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadMentionFiles = async () => {
      try {
        if (isGuest) {
          const [localDiagrams, localNotes, localDrawings, localFlowcharts, localProjects] = await Promise.all([
            localPersistence.getAllResources('erd'),
            localPersistence.getAllResources('notes'),
            localPersistence.getAllResources('drawings'),
            localPersistence.getAllResources('flowchart'),
            localPersistence.getAllResources('project'),
          ]);
          const projectNames = new Map(localProjects.map((project: any) => [String(project.id), project.name]));
          const mapLocal = (items: any[], type: FileMentionOption['type'], nameField: string) => items
            .filter(item => !(item.is_deleted ?? item.isDeleted))
            .map(item => {
              const uid = String(item.uid ?? item.id);
              return {
                name: item[nameField] || 'Untitled',
                type,
                uid,
                href: `/${type === 'note' ? 'notes' : type === 'diagram' ? 'diagrams' : `${type}s`}/${uid}`,
                workspaceName: projectNames.get(String(item.project_id ?? item.projectId)) || null,
              };
            });
          if (!cancelled) setLoadedMentionFiles([
            ...mapLocal(localNotes, 'note', 'title'),
            ...mapLocal(localDiagrams, 'diagram', 'name'),
            ...mapLocal(localFlowcharts, 'flowchart', 'title'),
            ...mapLocal(localDrawings, 'drawing', 'title'),
          ]);
          return;
        }

        const response = await apiFetch('/api/search/files');
        const json = response.ok ? await response.json() : { data: [] };
        if (!cancelled) {
          setLoadedMentionFiles(Array.isArray(json.data) ? json.data.map((file: any) => ({
            name: file.name || 'Untitled',
            type: file.type,
            uid: String(file.uid ?? file.id),
            href: `/${file.type === 'note' ? 'notes' : file.type === 'diagram' ? 'diagrams' : `${file.type}s`}/${file.uid ?? file.id}`,
            workspaceName: file.workspaceName,
          })) : []);
        }
      } catch {
        if (!cancelled) setLoadedMentionFiles([]);
      }
    };

    loadMentionFiles();
    return () => { cancelled = true; };
  }, [isGuest]);

  const mentionFiles = useMemo<FileMentionOption[]>(() => {
    const files = [...loadedMentionFiles];
    const addContextFiles = (items: any[], type: FileMentionOption['type'], nameField: string) => {
      for (const item of items) {
        if (item.is_deleted) continue;
        const uid = String(item.uid ?? item.id);
        if (files.some(file => file.type === type && file.uid === uid)) continue;
        files.push({
          name: item[nameField] || 'Untitled',
          type,
          uid,
          href: `/${type === 'note' ? 'notes' : type === 'diagram' ? 'diagrams' : `${type}s`}/${uid}`,
          workspaceName: projects.find(project => String(project.id) === String(item.project_id))?.name,
        });
      }
    };
    addContextFiles(notes, 'note', 'title');
    addContextFiles(diagrams, 'diagram', 'name');
    addContextFiles(flowcharts, 'flowchart', 'title');
    addContextFiles(drawings, 'drawing', 'title');
    return files.sort((a, b) => a.name.localeCompare(b.name));
  }, [loadedMentionFiles, notes, diagrams, flowcharts, drawings, projects]);

  const filteredMentionFiles = useMemo(() => {
    const query = mentionMenu.query.trim().toLowerCase();
    return mentionFiles.filter(file => file.name.toLowerCase().includes(query));
  }, [mentionFiles, mentionMenu.query]);
  
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
        className: 'tiptap-editor-content focus:outline-none focus:ring-0 border-none outline-none min-h-[500px] pb-[350px] [&_img]:block [&_img]:mx-auto [&_img]:my-6 [&_.tiptap-extension-resize-image]:block [&_.tiptap-extension-resize-image]:mx-auto [&_code]:text-primary',
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
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target;
        if (!(target instanceof HTMLAnchorElement)) return false;
        const href = target.getAttribute('href');
        if (!href?.startsWith('/')) return false;
        event.preventDefault();
        navigate(href);
        return true;
      },
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

    editor.on('selectionUpdate', handleSelectionUpdate);

    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
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
      const atIndex = textFromStartContent.lastIndexOf('@');
      if (atIndex !== -1) {
        const query = textFromStartContent.slice(atIndex + 1);
        const charBeforeAt = textFromStartContent[atIndex - 1];
        const isValidBoundary = !charBeforeAt || /\s/.test(charBeforeAt) || charBeforeAt === '\ufffc';
        const from = $from.pos - (textFromStartContent.length - atIndex);
        const coords = editor.view.coordsAtPos(from);
        const matches = mentionFiles.filter(file => file.name.toLowerCase().includes(query.trim().toLowerCase()));
        if (isValidBoundary && !query.includes('\n')) {
          setSlashMenu(prev => prev.isOpen ? { ...prev, isOpen: false } : prev);
          setMentionMenu(prev => ({
            ...prev,
            isOpen: true,
            query,
            range: { from, to: $from.pos },
            coords,
            selectedIndex: matches.length ? Math.min(prev.selectedIndex, matches.length - 1) : 0,
          }));
          return;
        }
      }

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
            
            setMentionMenu(prev => prev.isOpen ? { ...prev, isOpen: false } : prev);
            setSlashMenu({ isOpen: true, query, range: { from, to }, coords });
            return;
          }
        }
      }

      setSlashMenu(prev => {
        if (prev.isOpen) return { ...prev, isOpen: false };
        return prev;
      });
      setMentionMenu(prev => prev.isOpen ? { ...prev, isOpen: false } : prev);
    };

    editor.on('update', handleUpdate);
    extractHeadings();
    return () => {
      editor.off('update', handleUpdate);
      if (onChangeTimeoutRef.current) {
        clearTimeout(onChangeTimeoutRef.current);
      }
    };
  }, [editor, onChange, rememberLocalContent, mentionFiles]);

  const selectMention = useCallback((file: FileMentionOption) => {
    if (!editor) return;
    const { from } = mentionMenu.range;
    const text = `@${file.name}`;
    editor.chain()
      .focus()
      .deleteRange(mentionMenu.range)
      .insertContent(text)
      .setTextSelection({ from, to: from + text.length })
      .setLink({
        href: file.href,
        class: 'text-primary underline cursor-pointer font-medium bg-primary/10 rounded px-0.5',
      })
      .setTextSelection(from + text.length)
      .insertContent(' ')
      .run();
    setMentionMenu(prev => ({ ...prev, isOpen: false }));
  }, [editor, mentionMenu.range]);

  useEffect(() => {
    if (!mentionMenu.isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setMentionMenu(prev => ({ ...prev, selectedIndex: Math.min(prev.selectedIndex + 1, filteredMentionFiles.length - 1) }));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setMentionMenu(prev => ({ ...prev, selectedIndex: Math.max(prev.selectedIndex - 1, 0) }));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const file = filteredMentionFiles[mentionMenu.selectedIndex];
        if (file) selectMention(file);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setMentionMenu(prev => ({ ...prev, isOpen: false }));
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest('[data-file-mention-menu]')) {
        setMentionMenu(prev => ({ ...prev, isOpen: false }));
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [mentionMenu.isOpen, mentionMenu.selectedIndex, filteredMentionFiles, selectMention]);

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
        {mentionMenu.isOpen && (
          <FileMentionMenu
            options={filteredMentionFiles}
            selectedIndex={mentionMenu.selectedIndex}
            coords={mentionMenu.coords}
            onSelect={selectMention}
            onHover={(selectedIndex) => setMentionMenu(prev => ({ ...prev, selectedIndex }))}
          />
        )}
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
