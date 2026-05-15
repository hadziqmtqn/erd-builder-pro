import React, { Suspense } from 'react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useParams } from 'react-router-dom';

const NotesView = React.lazy(() => import('@/components/views/NotesView').then(m => ({ default: m.NotesView })));

export function NoteEditorRoute() {
  const ctx = useWorkspace();
  const { id } = useParams<{ id: string }>();

  const {
    activeNote, activeNoteUid, saveNote, handleNoteChange, deleteNote,
    isPublicView, isLoading,
  } = ctx;

  if (!isPublicView && !activeNoteUid) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <p className="text-sm font-medium text-muted-foreground">Select a note to view</p>
      </div>
    );
  }

  if (!activeNote) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin opacity-50" />
        <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading note...</p>
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground/60 animate-pulse">Loading note...</span>
        </div>
      </div>
    }>
      <NotesView
        isLoading={isLoading}
        activeNoteUid={isPublicView ? null : activeNoteUid}
        activeNote={activeNote}
        saveNote={saveNote}
        handleNoteChange={handleNoteChange}
        deleteNote={deleteNote}
        isReadOnly={isPublicView}
      />
    </Suspense>
  );
}
