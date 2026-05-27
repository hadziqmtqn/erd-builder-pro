import React, { Suspense, useEffect, useRef } from 'react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useParams } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';

const NotesView = React.lazy(() => import('@/components/views/NotesView').then(m => ({ default: m.NotesView })));

export function NoteEditorRoute() {
  const ctx = useWorkspace();
  const { id } = useParams<{ id: string }>();

  const {
    activeNote, activeNoteUid, saveNote, handleNoteChange, deleteNote,
    isPublicView, isLoading, isNoteItemLoading, handleNoteSelect,
  } = ctx;

  // Safety net: URL has id but context hasn't synced yet
  const processedUrlRef = useRef(false);
  useEffect(() => {
    if (isPublicView || !id) return;
    if (processedUrlRef.current) return;
    if (activeNoteUid === id) {
      processedUrlRef.current = true;
      return;
    }
    if (!activeNoteUid) {
      processedUrlRef.current = true;
      handleNoteSelect(id);
    }
  }, [id, activeNoteUid, isPublicView, handleNoteSelect]);

  if (!isPublicView && !activeNoteUid) {
    if (id && !processedUrlRef.current) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading note...</p>
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <p className="text-sm font-medium text-muted-foreground">Select a note to view</p>
      </div>
    );
  }

  if (!activeNote && !isNoteItemLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <FileQuestion className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <p className="text-sm font-medium text-muted-foreground">Note not found</p>
        <p className="text-xs text-muted-foreground/60 mt-1">This note may have been deleted or is no longer available.</p>
      </div>
    );
  }

  if (!activeNote) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
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
        isLoading={isNoteItemLoading}
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
