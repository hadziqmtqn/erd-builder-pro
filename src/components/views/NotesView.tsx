import React, { useEffect, useState, useRef } from 'react';
import NotesEditor from '../NotesEditor';
import { DiffPreviewModal } from '@/components/modals/DiffPreviewModal';

import { useAIAction } from '@/contexts/AIActionContext';
import { htmlToAIText } from '@/lib/notes/html-to-ai-text';

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { toast } from 'sonner';

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
  
  const showSkeleton = isLoading;
  const [pendingChange, setPendingChange] = useState<{
    content: string;
    strategy: 'replace' | 'append';
    originalContent: string;
  } | null>(null);

  useEffect(() => {
    if (!activeNote || isReadOnly) return;

    const cleanup = registerContentHandler(async (content: string, strategy: 'replace' | 'append') => {
      const currentContent = typeof activeNote.content === 'string' ? activeNote.content : '';
      setPendingChange({ content, strategy, originalContent: currentContent });
    });

    return cleanup;
  }, [activeNote, isReadOnly, registerContentHandler]);

  const handleConfirmChange = async () => {
    if (!pendingChange) return;
    if (confirmLockRef.current) return;
    confirmLockRef.current = true;

    const { content, strategy, originalContent } = pendingChange;

    let parsedContent = content;
    try {
      parsedContent = await marked.parse(content);
    } catch (err) {
      console.error('Failed to parse markdown', err);
    }

    parsedContent = DOMPurify.sanitize(parsedContent);

    let newContent = '';
    if (strategy === 'replace') {
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
        const plainTextContent = htmlToAIText(pendingChange.originalContent);
        const label: Record<string, string> = {
          replace: 'Replace All',
          append: 'Append',
        };
        const finalText = pendingChange.strategy === 'append'
          ? plainTextContent + '\n\n---\n\n' + pendingChange.content
          : pendingChange.content;
        return (
          <DiffPreviewModal
            isOpen={!!pendingChange}
            strategyLabel={label[pendingChange.strategy] || ''}
            originalText={plainTextContent}
            newText={finalText}
            onConfirm={handleConfirmChange}
            onCancel={() => setPendingChange(null)}
          />
        );
      })()}
    </div>
  );
});
