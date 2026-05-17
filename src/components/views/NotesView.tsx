import React, { useCallback, useEffect } from 'react';
import NotesEditor from '../NotesEditor';

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
  const { registerContentHandler } = useAIAction();
  const aiReadableNoteContent = useMemo(
    () => htmlToAIText(typeof activeNote?.content === 'string' ? activeNote.content : ''),
    [activeNote?.content]
  );

  // ─── Register Global Manual Content Handler ───
  useEffect(() => {
    if (!activeNote || isReadOnly) return;

    const cleanup = registerContentHandler(async (content: string, strategy: 'replace' | 'append') => {
      let newContent = '';
      
      // Attempt to parse markdown to HTML since Tiptap expects HTML
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
      }
      
      // Update locally to bypass save debouncing latency for this explicit user action
      handleNoteChange(newContent);
      saveNote({ ...activeNote, content: newContent });
    });

    return cleanup;
  }, [activeNote, isReadOnly, registerContentHandler, saveNote]);



  // Show skeleton during initial load — covers both cached and uncached notes.
  // The guard (!activeNote || activeNote.content === undefined) was removed so the
  // spinner appears even when cached content is available, matching focus-sync behavior.
  const showSkeleton = isLoading;

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
    </div>
  );
});
