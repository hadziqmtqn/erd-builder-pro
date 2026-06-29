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
  const confirmLockRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const preAiContentRef = useRef<string | null>(null);

  const showSkeleton = isLoading;
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
    <div className="flex-1 border rounded-xl overflow-hidden bg-background relative">

      <NotesEditor 
        key={activeNoteUid} 
        note={activeNote} 
        onSave={saveNote} 
        onChange={handleNoteChange} 
        onDelete={deleteNote} 
        isReadOnly={isReadOnly}
      />
      
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
