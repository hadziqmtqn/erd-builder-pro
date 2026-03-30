import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { 
  Bold, Italic, List, ListOrdered, Table, Image as ImageIcon, 
  ChevronDown, ChevronUp, Type, Code, Quote, Link as LinkIcon,
  Save, Trash2, RotateCcw, Hash
} from 'lucide-react';
import { Note } from '../types';
import { cn } from '../lib/utils';

interface NotesEditorProps {
  note: Note;
  onSave: (note: Note) => void;
  onChange?: (content: string) => void;
  onDelete: (id: number) => void;
}

export default function NotesEditor({ note, onSave, onChange, onDelete }: NotesEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [isPreview, setIsPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
  }, [note.id]); // Only reset when the note ID changes

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    if (onChange) {
      onChange(newContent);
    }
  };

  const insertText = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);
    const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);

    handleContentChange(newText);
    
    // Reset focus and selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.url) {
        insertText(`![${file.name}](${data.url})`);
      }
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  const toolbarActions = [
    { icon: Bold, action: () => insertText('**', '**'), label: 'Bold' },
    { icon: Italic, action: () => insertText('_', '_'), label: 'Italic' },
    { icon: Hash, action: () => insertText('### '), label: 'Heading' },
    { icon: List, action: () => insertText('- '), label: 'Bullet List' },
    { icon: ListOrdered, action: () => insertText('1. '), label: 'Numbered List' },
    { icon: Quote, action: () => insertText('> '), label: 'Quote' },
    { icon: Code, action: () => insertText('`', '`'), label: 'Code' },
    { icon: LinkIcon, action: () => insertText('[', '](url)'), label: 'Link' },
    { 
      icon: Table, 
      action: () => insertText('\n| Header | Header |\n| --- | --- |\n| Cell | Cell |\n'), 
      label: 'Table' 
    },
    { 
      icon: ChevronDown, 
      action: () => insertText('<details>\n<summary>Toggle Title</summary>\n\nContent here\n\n</details>'), 
      label: 'Toggle' 
    },
  ];

  return (
    <div className="flex flex-col h-full bg-bg-primary text-text-primary">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-bg-secondary/50 backdrop-blur-sm">
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
            onClick={() => setIsPreview(!isPreview)}
            className="px-3 py-1.5 text-xs font-bold rounded-xl border border-border hover:bg-bg-tertiary transition-all"
          >
            {isPreview ? 'Edit' : 'Preview'}
          </button>
          <button
            onClick={() => onSave({ ...note, title, content })}
            className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold bg-accent-primary hover:bg-accent-secondary text-white rounded-xl transition-all shadow-lg shadow-accent-primary/20"
          >
            <Save size={14} />
            Save
          </button>
          <button
            onClick={() => onDelete(note.id)}
            className="p-2 text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      {!isPreview && (
        <div className="flex items-center gap-1 p-2 border-b border-border bg-bg-secondary/30 overflow-x-auto no-scrollbar">
          {toolbarActions.map((item, index) => (
            <button
              key={index}
              onClick={item.action}
              className="p-2 hover:bg-bg-tertiary rounded-lg transition-all"
              title={item.label}
            >
              <item.icon size={16} className="text-text-secondary" />
            </button>
          ))}
          <div className="w-px h-4 bg-border mx-1" />
          <label className="p-2 hover:bg-bg-tertiary rounded-lg transition-all cursor-pointer">
            <ImageIcon size={16} className="text-text-secondary" />
            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
          </label>
          
          {/* Roman/Alpha List Helpers */}
          <div className="w-px h-4 bg-border mx-1" />
          <button 
            onClick={() => insertText('I. ')} 
            className="px-2 py-1 text-[10px] font-bold hover:bg-bg-tertiary rounded-lg text-text-secondary"
            title="Roman List"
          >
            I.
          </button>
          <button 
            onClick={() => insertText('A. ')} 
            className="px-2 py-1 text-[10px] font-bold hover:bg-bg-tertiary rounded-lg text-text-secondary"
            title="Alphabetical List"
          >
            A.
          </button>
        </div>
      )}

      {/* Editor/Preview Area */}
      <div className="flex-1 overflow-hidden relative">
        {isPreview ? (
          <div className="h-full overflow-y-auto p-8 prose prose-invert prose-slate max-w-none prose-pre:bg-bg-tertiary prose-pre:border prose-pre:border-border">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]} 
              rehypePlugins={[rehypeRaw]}
            >
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            className="w-full h-full p-8 bg-transparent text-text-primary focus:outline-none resize-none font-mono text-sm leading-relaxed placeholder-text-secondary/30"
            placeholder="Start writing in Markdown..."
          />
        )}
      </div>
    </div>
  );
}
