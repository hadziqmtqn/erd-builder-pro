import React, { useState, useEffect, useRef } from 'react';
import { Note } from '../types';
import TiptapEditor from './TiptapEditor';

interface NotesEditorProps {
  note: Note;
  onSave: (note: Note) => void;
  onChange?: (content: string) => void;
  onDelete: (uid: string) => void;
  isReadOnly?: boolean;
}

export default function NotesEditor({ note, onSave, onChange, onDelete, isReadOnly = false }: NotesEditorProps) {
  const [content, setContent] = useState(note.content ?? '');
  // Guard: once user edits, don't overwrite from prop (prevents API/IndexedDB 
  // responses from wiping out in-flight user edits during selectNote)
  const hasUserEditedRef = useRef(false);

  useEffect(() => {
    // Only sync from prop if the user hasn't started editing. Once they type,
    // their local state takes precedence — the async selectNote callback may
    // still be resolving and would overwrite their changes.
    if (!hasUserEditedRef.current) {
      setContent(note.content ?? '');
    }
  }, [note.content]);

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    hasUserEditedRef.current = true;
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
