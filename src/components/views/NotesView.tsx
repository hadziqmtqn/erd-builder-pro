import React, { useCallback, useEffect, useState } from 'react';
import NotesEditor from '../NotesEditor';
import { DiffPreviewModal } from '@/components/modals/DiffPreviewModal';

import { useAIAction } from '@/contexts/AIActionContext';
import { AIAction } from '@/components/ai/AIActions';
import { applyToNoteContent } from '@/components/ai/actions';
import { htmlToAIText } from '@/lib/notes/html-to-ai-text';

import { marked } from 'marked';
import { useMemo } from 'react';

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
  const { registerContentHandler, replaceSelectedText, selectionText } = useAIAction();
  const aiReadableNoteContent = useMemo(
    () => htmlToAIText(typeof activeNote?.content === 'string' ? activeNote.content : ''),
    [activeNote?.content]
  );
  
  const showSkeleton = isLoading;  const [pendingChange, setPendingChange] = useState<{content: string, strategy: 'replace' | 'append' | 'replace-selection'} | null>(null);

  useEffect(() => {
    if (!activeNote || isReadOnly) return;

    const cleanup = registerContentHandler(async (content: string, strategy: 'replace' | 'append' | 'replace-selection') => {
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

    if (strategy === 'replace') {
      newContent = parsedContent;
    } else if (strategy === 'append') {
      const currentContent = typeof activeNote.content === 'string' ? activeNote.content : '';
      const separator = currentContent.trim() ? '<br><hr><br>' : '';
      newContent = currentContent + separator + parsedContent;
    } else if (strategy === 'replace-selection') {
      const updatedHtml = replaceSelectedText?.(parsedContent);
      if (updatedHtml) {
        handleNoteChange(updatedHtml);
        saveNote({ ...activeNote, content: updatedHtml });
      }
      setPendingChange(null);
      return;
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
          'replace-selection': 'Replace Selected',
        };
        const finalText = pendingChange.strategy === 'append'
          ? plainTextContent + '\n\n---\n\n' + pendingChange.content
          : pendingChange.strategy === 'replace-selection' && selectionText
            ? plainTextContent.replace(selectionText, pendingChange.content)
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
