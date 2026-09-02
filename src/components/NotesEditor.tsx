import React, { useState, useEffect, useRef } from 'react';
import { Note } from '../types';
import TiptapEditor from './TiptapEditor';

interface NotesEditorProps {
  note: Note;
  onSave: (note: Note) => void;
  onChange?: (content: string) => void;
  onDelete: (uid: string) => void;
  isReadOnly?: boolean;
  compactLayout?: boolean;
  onRequestCompanion?: (type: 'erd' | 'flowchart' | 'drawing', editor: any, range: { from: number; to: number }) => void;
}

export default function NotesEditor({ note, onSave, onChange, onDelete, isReadOnly = false, compactLayout = false, onRequestCompanion }: NotesEditorProps) {
  const handleContentChange = (newContent: string) => {
    // This is called by TiptapEditor whenever its internal content changes.
    // We simply pass it up to the parent (NotesView) for saving.
    if (onChange) {
      onChange(newContent);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* Block Editor Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <TiptapEditor 
          content={note.content ?? ''} 
          onChange={handleContentChange} 
          isReadOnly={isReadOnly}
          disableAISelection
          targetProjectId={note.project_id ?? (note as any).projectId ?? null}
          noteTitle={note.title}
          compactLayout={compactLayout}
          onRequestCompanion={onRequestCompanion}
        />
      </div>
    </div>
  );
}
