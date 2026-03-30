import React, { useState, useEffect } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { Note } from '../types';
import BlockEditor from './BlockEditor';
import ConfirmModal from './ConfirmModal';

interface NotesEditorProps {
  note: Note;
  onSave: (note: Note) => void;
  onChange?: (content: string) => void;
  onDelete: (id: number) => void;
}

export default function NotesEditor({ note, onSave, onChange, onDelete }: NotesEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
  }, [note.id]);

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    if (onChange) {
      onChange(newContent);
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-primary text-text-primary overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-bg-secondary/50 backdrop-blur-sm z-20">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => onSave({ ...note, title, content })}
          className="text-xl font-bold bg-transparent border-none focus:outline-none w-full text-text-primary placeholder-text-secondary"
          placeholder="Note Title"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSave({ ...note, title, content })}
            className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold bg-accent-primary hover:bg-accent-secondary text-white rounded-xl transition-all shadow-lg shadow-accent-primary/20"
          >
            <Save size={14} />
            Save
          </button>
          <button
            onClick={() => setIsConfirmOpen(true)}
            className="p-2 text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={isConfirmOpen}
        title="Delete Note"
        message={`Are you sure you want to move "${note.title}" to the trash?`}
        onConfirm={() => {
          onDelete(note.id);
          setIsConfirmOpen(false);
        }}
        onCancel={() => setIsConfirmOpen(false)}
      />

      {/* Block Editor Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <BlockEditor 
          noteId={note.id}
          initialContent={content} 
          onChange={handleContentChange} 
        />
      </div>
    </div>
  );
}
