import React, { useEffect, useState } from 'react';
import NotesEditor from '../NotesEditor';
import { DiffPreviewModal } from '@/components/modals/DiffPreviewModal';

import { useAIAction } from '@/contexts/AIActionContext';
import { htmlToAIText } from '@/lib/notes/html-to-ai-text';

import { marked } from 'marked';

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
  
  const showSkeleton = isLoading;  const [pendingChange, setPendingChange] = useState<{content: string, strategy: 'replace' | 'append'} | null>(null);

  useEffect(() => {
    if (!activeNote || isReadOnly) return;

    const cleanup = registerContentHandler(async (content: string, strategy: 'replace' | 'append') => {
      setPendingChange({ content, strategy });
    });

    return cleanup;
  }, [activeNote, isReadOnly, registerContentHandler]);

  const handleConfirmChange = async () => {
    if (!pendingChange) return;
    const { content, strategy } = pendingChange;
    
    let newContent = '';
    let parsedContent = content;
    try {
      parsedContent = await marked.parse(content);
    } catch (err) {
      console.error('Failed to parse markdown', err);
    }

    const currentContent = typeof activeNote.content === 'string' ? activeNote.content : '';

    if (strategy === 'replace') {
      newContent = parsedContent;
    } else {
      const separator = currentContent.trim() ? '<br><hr><br>' : '';
      newContent = currentContent + separator + parsedContent;
    }
    
    handleNoteChange(newContent);
    saveNote({ ...activeNote, content: newContent });
    setPendingChange(null);
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
        const currentContent = typeof activeNote.content === 'string' ? activeNote.content : '';
        const plainTextContent = htmlToAIText(currentContent);
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
