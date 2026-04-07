import React from 'react';
import NotesEditor from '../NotesEditor';

interface NotesViewProps {
  activeNoteId: number | null;
  activeNote: any;
  saveNote: (note: any) => Promise<boolean | void>;
  handleNoteChange: (content: string) => void;
  deleteNote: (id: number) => Promise<void>;
  isReadOnly?: boolean;
}

export function NotesView({
  activeNoteId,
  activeNote,
  saveNote,
  handleNoteChange,
  deleteNote,
  isReadOnly = false
}: NotesViewProps) {
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
}
