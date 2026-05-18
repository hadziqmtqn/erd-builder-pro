import React, { useEffect, useState, useRef } from 'react';
import NotesEditor from '../NotesEditor';
import { DiffPreviewModal } from '@/components/modals/DiffPreviewModal';

import { useAIAction } from '@/contexts/AIActionContext';

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { toast } from 'sonner';
import { getMarkdownFromHtml } from '@/lib/markdownUtils';
import { applyToNoteContent } from '@/components/ai/actions/notesActions';

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

      let parsedHtml = content;
      try {
        parsedHtml = await marked.parse(content);
      } catch {}

      setPendingChange({ content, strategy, originalContent: currentContent, originalHtml: currentContent, newHtml: parsedHtml, actionId });
    });

    return cleanup;
  }, [activeNote, isReadOnly, registerContentHandler]);

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
        parsedContent = await marked.parse(merged);
      } else {
        parsedContent = await marked.parse(content);
      }
    } catch (err) {
      console.error('Failed to parse markdown', err);
    }

    parsedContent = DOMPurify.sanitize(parsedContent);

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

    try {
      const result = await saveNote({ ...activeNote, content: newContent });
      if (result !== false) {
        setPendingChange(null);
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
