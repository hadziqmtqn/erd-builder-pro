import React, { useCallback } from 'react';
import NotesEditor from '../NotesEditor';
import { AIActionButton } from '@/components/ai/AIActionButton';
import { useAIAction } from '@/contexts/AIActionContext';
import { AIAction } from '@/components/ai/AIActions';
import { applyToNoteContent } from '@/components/ai/actions';

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
  const { sendAction } = useAIAction();

  // ─── Handle AI action: build prompt and set up auto-apply callback ──
  const handleAIAction = useCallback((action: AIAction, ctx: Record<string, any>) => {
    const prompt = action.buildPrompt(ctx);

    const onResult = (response: string) => {
      if (!activeNote) return;
      const newContent = applyToNoteContent(activeNote.content || '', action.id, response);
      saveNote({ ...activeNote, content: newContent });
    };

    sendAction(prompt, action.id, onResult);
  }, [activeNote, saveNote, sendAction]);

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
      {/* AI action button — floating above the editor */}
      {!isReadOnly && (
        <div className="absolute top-4 right-4 z-10">
          <AIActionButton
            viewType="notes"
            context={{
              title: activeNote?.title || '',
              content: typeof activeNote?.content === 'string' ? activeNote.content : '',
            }}
            onAction={handleAIAction}
            iconOnly
          />
        </div>
      )}
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
