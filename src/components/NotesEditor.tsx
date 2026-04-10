import React, { useState, useEffect } from 'react';
import { Note } from '../types';
import TiptapEditor from './TiptapEditor';

interface NotesEditorProps {
  note: Note;
  onSave: (note: Note) => void;
  onChange?: (content: string) => void;
  onDelete: (id: number) => void;
  isReadOnly?: boolean;
}

export default function NotesEditor({ note, onSave, onChange, onDelete, isReadOnly = false }: NotesEditorProps) {
  const [content, setContent] = useState(note.content);

  useEffect(() => {
    setContent(note.content);
  }, [note.content]);

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    if (onChange) {
      onChange(newContent);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* Block Editor Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <TiptapEditor 
          content={content} 
          onChange={handleContentChange} 
          isReadOnly={isReadOnly}
        />
      </div>
    </div>
  );
}
