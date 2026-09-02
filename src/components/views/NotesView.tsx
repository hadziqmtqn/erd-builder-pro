import React, { useEffect, useState, useRef } from 'react';
import NotesEditor from '../NotesEditor';
import { DiffPreviewModal } from '@/components/modals/DiffPreviewModal';

import { useAIAction } from '@/contexts/AIActionContext';

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { toast } from 'sonner';
import { getMarkdownFromHtml } from '@/lib/markdownUtils';
import { NoteImporter } from '@/lib/importers/note-importer';
import { applyToNoteContent } from '@/components/ai/actions/notesActions';
import { stripAiFluff } from '@/components/ai/chatUtils';
import { NotesHistoryPreview } from '@/components/history/NotesHistoryPreview';
import { NOTE_HISTORY_PREVIEW_EVENT } from '@/lib/note-history-diff';
import { useWorkspace } from '@/providers/WorkspaceContext';
import { useSidebar } from '@/components/ui/sidebar';
import { NotesCompanionWorkspace, type CompanionPane } from '@/components/notes/NotesCompanionWorkspace';
import { NOTES_COMPANION_EVENT } from '@/components/editor/extensions/CompanionReference';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';

const NotesCompanionPane = React.lazy(() => import('@/components/notes/NotesCompanionPane').then(module => ({ default: module.NotesCompanionPane })));

interface NotesViewProps {
  activeNoteUid: string | null;
  activeNote: any;
  saveNote: (note: any) => Promise<boolean | void>;
  handleNoteChange: (content: string) => void;
  deleteNote: (uid: string) => Promise<void>;
  isReadOnly?: boolean;
  isLoading?: boolean;
}

export const NotesView = React.memo(({
  activeNoteUid,
  activeNote,
  saveNote,
  handleNoteChange,
  deleteNote,
  isReadOnly = false,
  isLoading = false
}: NotesViewProps) => {
  const { registerContentHandler } = useAIAction();
  const navigate = useNavigate();
  const { diagrams, flowcharts, drawings, activeProjectId } = useWorkspace();
  const { setOpen: setSidebarOpen } = useSidebar();
  const confirmLockRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [historyPreview, setHistoryPreview] = useState<{ content: string; version: number } | null>(null);
  const preAiContentRef = useRef<string | null>(null);
  const [companionPanes, setCompanionPanes] = useState<CompanionPane[]>([]);
  const [companionRequest, setCompanionRequest] = useState<{ type: CompanionPane['type']; editor: any; range: { from: number; to: number } } | null>(null);
  const [selectedCompanionUid, setSelectedCompanionUid] = useState('');

  const companionFiles = React.useMemo(() => {
    const projectId = activeNote?.project_id ?? activeNote?.projectId ?? activeProjectId;
    const belongsToActiveProject = (file: any) => String(file.project_id ?? file.projectId) === String(projectId);
    return {
      erd: diagrams.filter(belongsToActiveProject).map(file => ({ uid: String(file.uid ?? file.id), title: file.name || 'Untitled' })),
      flowchart: flowcharts.filter(belongsToActiveProject).map(file => ({ uid: String(file.uid ?? file.id), title: file.title || 'Untitled' })),
      drawing: drawings.filter(belongsToActiveProject).map(file => ({ uid: String(file.uid ?? file.id), title: file.title || 'Untitled' })),
    };
  }, [activeNote, activeProjectId, diagrams, drawings, flowcharts]);

  const openCompanion = React.useCallback((type: CompanionPane['type'], uid: string, title?: string) => {
    const files = companionFiles[type];
    const file = files.find(item => item.uid === String(uid));
    setCompanionPanes(current => {
      if (current.some(pane => pane.type === type && pane.uid === String(uid))) return current;
      return [{ type, uid: String(uid), title: title || file?.title || 'Unavailable file' }];
    });
  }, [companionFiles]);

  useEffect(() => {
    if (companionPanes.length) setSidebarOpen(false);
  }, [companionPanes.length, setSidebarOpen]);

  useEffect(() => {
    setCompanionPanes([]);
    setCompanionRequest(null);
  }, [activeNoteUid]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: CompanionPane['type']; uid?: string; title?: string }>).detail;
      if (detail?.type && detail.uid) openCompanion(detail.type, detail.uid, detail.title);
    };
    window.addEventListener(NOTES_COMPANION_EVENT, onOpen);
    return () => window.removeEventListener(NOTES_COMPANION_EVENT, onOpen);
  }, [openCompanion]);

  useEffect(() => {
    setHistoryPreview(null);
    const handleHistoryPreview = (event: Event) => {
      const detail = (event as CustomEvent<{ content?: string; version?: number }>).detail;
      setHistoryPreview(detail?.content !== undefined ? {
        content: detail.content,
        version: Number(detail.version) || 0,
      } : null);
    };
    window.addEventListener(NOTE_HISTORY_PREVIEW_EVENT, handleHistoryPreview);
    return () => window.removeEventListener(NOTE_HISTORY_PREVIEW_EVENT, handleHistoryPreview);
  }, [activeNoteUid]);

  const showSkeleton = isLoading || (activeNote && activeNote.content == null);
  const [pendingChange, setPendingChange] = useState<{
    content: string;
    strategy: 'replace' | 'append';
    originalContent: string;
    originalHtml: string;
    newHtml: string;
    actionId?: string;
  } | null>(null);

  useEffect(() => {
    if (!activeNote || isReadOnly) return;

    const cleanup = registerContentHandler(async (content: string, strategy: 'replace' | 'append', actionId?: string) => {
      const currentContent = typeof activeNote.content === 'string' ? activeNote.content : '';

      // Strip AI preamble + footer fluff before processing
      const cleanedContent = stripAiFluff(content);

      let parsedHtml = cleanedContent;
      try {
        parsedHtml = await marked.parse(cleanedContent, { gfm: true, breaks: true });
        parsedHtml = await NoteImporter.processHtmlForEditor(parsedHtml);
      } catch {}

      setPendingChange({ content: cleanedContent, strategy, originalContent: currentContent, originalHtml: currentContent, newHtml: parsedHtml, actionId });
    });

    return cleanup;
  }, [activeNote, isReadOnly, registerContentHandler]);

  useEffect(() => {
    if (!activeNote || isReadOnly) return;

    const applyPendingContent = async () => {
      const pendingContent = localStorage.getItem('pending_note_content');
      const pendingStrategy = localStorage.getItem('pending_note_strategy');
      if (!pendingContent || !pendingStrategy) return;

      localStorage.removeItem('pending_note_content');
      localStorage.removeItem('pending_note_strategy');

      const currentContent = typeof activeNote.content === 'string' ? activeNote.content : '';

      // Strip AI preamble + footer fluff
      const cleanedPending = stripAiFluff(pendingContent);

      let parsedContent = cleanedPending;
      try {
        parsedContent = await marked.parse(cleanedPending, { gfm: true, breaks: true });
        parsedContent = await NoteImporter.processHtmlForEditor(parsedContent);
      } catch {}

      parsedContent = DOMPurify.sanitize(parsedContent, {
        ADD_TAGS: ['iframe', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'ul', 'ol', 'li', 'hr', 'br', 'p', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'code', 'pre', 'blockquote', 'img'],
        ADD_ATTR: ['data-type', 'data-checked', 'src', 'alt', 'href', 'target', 'rel', 'colspan', 'rowspan', 'style'],
      });

      let newContent = '';
      if (pendingStrategy === 'replace') {
        newContent = parsedContent;
      } else {
        const separator = currentContent.trim() ? '<br><hr><br>' : '';
        newContent = currentContent + separator + parsedContent;
      }

      handleNoteChange(newContent);
      await saveNote({ ...activeNote, content: newContent });
    };

    // Check localStorage on mount (300ms delay for note data to settle)
    const mountTimer = setTimeout(() => applyPendingContent(), 300);

    const handlePendingEvent = () => {
      clearTimeout(mountTimer);
      applyPendingContent();
    };

    window.addEventListener('apply-pending-note', handlePendingEvent);
    return () => {
      clearTimeout(mountTimer);
      window.removeEventListener('apply-pending-note', handlePendingEvent);
    };
  }, [activeNote, isReadOnly, handleNoteChange, saveNote]);

  const handleConfirmChange = async () => {
    if (!pendingChange) return;
    if (confirmLockRef.current) return;
    confirmLockRef.current = true;
    setIsSaving(true);

    const { content, strategy, originalContent, actionId } = pendingChange;

    let parsedContent = content;
    try {
      if (actionId) {
        const markdownContent = getMarkdownFromHtml(originalContent);
        const merged = applyToNoteContent(markdownContent, actionId, content);
        parsedContent = await marked.parse(merged, { gfm: true, breaks: true });
      } else {
        const cleaned = stripAiFluff(content);
        parsedContent = await marked.parse(cleaned, { gfm: true, breaks: true });
      }
      parsedContent = await NoteImporter.processHtmlForEditor(parsedContent);
    } catch (err) {
      console.error('Failed to parse markdown', err);
    }

    parsedContent = DOMPurify.sanitize(parsedContent, {
      ADD_TAGS: ['iframe', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'ul', 'ol', 'li', 'hr', 'br', 'p', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'code', 'pre', 'blockquote', 'img'],
      ADD_ATTR: ['data-type', 'data-checked', 'src', 'alt', 'href', 'target', 'rel', 'colspan', 'rowspan', 'style'],
    });

    let newContent = '';
    if (actionId) {
      newContent = parsedContent;
    } else if (strategy === 'replace') {
      newContent = parsedContent;
    } else {
      const separator = originalContent.trim() ? '<br><hr><br>' : '';
      newContent = originalContent + separator + parsedContent;
    }

    handleNoteChange(newContent);

    // Save pre-AI content for undo
    preAiContentRef.current = originalContent;

    try {
      const result = await saveNote({ ...activeNote, content: newContent });
      if (result !== false) {
        setPendingChange(null);
        toast('AI change applied', {
          action: {
            label: 'Undo',
            onClick: () => {
              const prev = preAiContentRef.current;
              if (prev) {
                handleNoteChange(prev);
                saveNote({ ...activeNote, content: prev });
              }
            },
          },
        });
      } else {
        toast.error('Failed to save AI content. Please try again.');
      }
    } catch {
      toast.error('Failed to save AI content. Please try again.');
    } finally {
      setIsSaving(false);
      confirmLockRef.current = false;
    }
  };

  if (showSkeleton) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground/60 animate-pulse">Loading...</span>
        </div>
      </div>
    );
  }


  if (!activeNote) return null;
  
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border bg-background">

      <div className={`h-full min-h-0 ${historyPreview ? 'hidden' : ''}`} aria-hidden={Boolean(historyPreview)}>
        <NotesCompanionWorkspace
          panes={companionPanes}
          onClose={closed => setCompanionPanes(current => current.filter(pane => pane.type !== closed.type || pane.uid !== closed.uid))}
          onOpenFull={pane => navigate(`/${pane.type === 'erd' ? 'diagrams' : pane.type === 'flowchart' ? 'flowcharts' : 'drawings'}/${pane.uid}?pid=${encodeURIComponent(String(activeNote.project_id ?? activeNote.projectId ?? activeProjectId ?? ''))}`)}
          note={<NotesEditor
            note={activeNote}
            onSave={saveNote}
            onChange={handleNoteChange}
            onDelete={deleteNote}
            isReadOnly={isReadOnly}
            compactLayout={companionPanes.length > 0}
            onRequestCompanion={(type, editor, range) => {
              setSelectedCompanionUid('');
              setCompanionRequest({ type, editor, range });
            }}
          />}
          renderPane={pane => (
            <React.Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading preview...</div>}>
              <NotesCompanionPane pane={pane} />
            </React.Suspense>
          )}
        />
      </div>

      {historyPreview && (
        <div className="absolute inset-0 z-10 bg-background">
          <NotesHistoryPreview
            currentContent={String(activeNote.content || '')}
            historicalContent={historyPreview.content}
            version={historyPreview.version}
          />
        </div>
      )}

      {companionRequest && (
        <Dialog open onOpenChange={open => { if (!open) setCompanionRequest(null); }}>
          <DialogContent size="sm">
            <DialogHeader><DialogTitle>Open {companionRequest.type === 'erd' ? 'ERD' : companionRequest.type === 'flowchart' ? 'Flowchart' : 'Drawing'} preview</DialogTitle></DialogHeader>
            <DialogBody className="space-y-4">
              <Select value={selectedCompanionUid} onValueChange={value => setSelectedCompanionUid(value || '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a file from this project">
                    {companionFiles[companionRequest.type].find(file => file.uid === selectedCompanionUid)?.title}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {companionFiles[companionRequest.type].map(file => <SelectItem key={file.uid} value={file.uid}>{file.title}</SelectItem>)}
                </SelectContent>
              </Select>
              <button
                type="button"
                className="h-9 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
                disabled={!selectedCompanionUid}
                onClick={() => {
                  const file = companionFiles[companionRequest.type].find(item => item.uid === selectedCompanionUid);
                  if (!file) return;
                  companionRequest.editor.chain().focus().deleteRange(companionRequest.range).insertContent({
                    type: 'companionReference', attrs: { targetType: companionRequest.type, targetUid: file.uid, title: file.title },
                  }).run();
                  openCompanion(companionRequest.type, file.uid, file.title);
                  setCompanionRequest(null);
                }}
              >Open preview</button>
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
      
      {pendingChange && (() => {
        const label: Record<string, string> = {
          replace: 'Replace All',
          append: 'Append',
        };
        return (
          <DiffPreviewModal
            isOpen={!!pendingChange}
            strategyLabel={label[pendingChange.strategy] || ''}
            originalHtml={pendingChange.originalHtml}
            newHtml={pendingChange.newHtml}
            onConfirm={handleConfirmChange}
            onCancel={() => setPendingChange(null)}
            isSaving={isSaving}
          />
        );
      })()}
    </div>
  );
});
