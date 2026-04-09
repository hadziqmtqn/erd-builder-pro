import React from 'react';
import { Skeleton } from '../ui/skeleton';
import NotesEditor from '../NotesEditor';

interface NotesViewProps {
  activeNoteId: number | string | null;
  activeNote: any;
  saveNote: (note: any) => Promise<boolean | void>;
  handleNoteChange: (content: string) => void;
  deleteNote: (id: number | string) => Promise<void>;
  isReadOnly?: boolean;
  isLoading?: boolean;
}

export const NotesView = React.memo(({
  activeNoteId,
  activeNote,
  saveNote,
  handleNoteChange,
  deleteNote,
  isReadOnly = false,
  isLoading = false
}: NotesViewProps) => {
  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-8 border rounded-xl bg-background">
        <Skeleton className="h-10 w-3/4 rounded-lg" />
        <div className="space-y-2 pt-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="space-y-2 pt-8">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    );
  }

  if (!activeNote) return null;
  
  return (
    <div className="flex-1 border rounded-xl overflow-hidden bg-background">
      <NotesEditor 
        key={activeNoteId} 
        note={activeNote} 
        onSave={saveNote} 
        onChange={handleNoteChange} 
        onDelete={deleteNote} 
        isReadOnly={isReadOnly}
      />
    </div>
  );
});
