import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Note } from '../types';

export function useNotes() {
  const [notes, setNotesList] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [notesTotal, setNotesTotal] = useState(0);
  const [hasMoreNotes, setHasMoreNotes] = useState(false);
  const notesRef = useRef<Note[]>(notes);

  // Keep ref in sync
  notesRef.current = notes;

  const fetchNotes = useCallback(async (isLoadMore = false, projectId: number | null | string = 'all', searchQuery = '') => {
    try {
      const offset = isLoadMore ? notesRef.current.length : 0;
      const projIdParam = (projectId === null || projectId === 'null') ? 'null' : projectId;
      const qParam = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`/api/notes?limit=10&offset=${offset}&project_id=${projIdParam}${qParam}`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data !== undefined ? json.data : json; // Fallback to raw array
        const total = json.total !== undefined ? json.total : (Array.isArray(data) ? data.length : 0);

        const notesListData = Array.isArray(data) ? data : [];
        if (isLoadMore) {
          setNotesList(prev => [...prev, ...notesListData]);
        } else {
          setNotesList(notesListData);
        }
        setNotesTotal(total);
        setHasMoreNotes((notesListData.length + offset) < total);
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
    }
  }, []); // Stable dependency array

  const createNote = async (title: string, projectId?: number | null) => {
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, project_id: projectId }),
      });
      if (res.ok) {
        const newNote = await res.json();
        setNotesList(prev => [newNote, ...prev]);
        toast.success('Note created successfully');
        return newNote;
      } else {
        toast.error('Failed to create note');
      }
    } catch (err) {
      console.error('Error creating note:', err);
      toast.error('Error creating note');
    }
    return null;
  };

  const updateNote = async (id: number, title: string) => {
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setNotesList(prev => prev.map(n => n.id === id ? { ...n, title } : n));
        toast.success('Note renamed successfully');
      } else {
        toast.error('Failed to rename note');
      }
    } catch (err) {
      console.error('Error updating note:', err);
      toast.error('Error renaming note');
    }
  };

  const deleteNote = async (id: number) => {
    try {
      const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotesList(prev => prev.map(n => n.id === id ? { ...n, is_deleted: true } : n));
        if (activeNoteId === id) setActiveNoteId(null);
        toast.success('Note moved to trash');
      } else {
        toast.error('Failed to delete note');
      }
    } catch (err) {
      console.error('Error deleting note:', err);
      toast.error('Error deleting note');
    }
  };

  const moveNoteToProject = async (noteId: number, projectId: number | null) => {
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (res.ok) {
        setNotesList(prev => prev.map(n => n.id === noteId ? { ...n, project_id: projectId } : n));
        toast.success('Note moved to project');
        return true;
      } else {
        toast.error('Failed to move note');
      }
    } catch (err) {
      console.error('Error moving note:', err);
      toast.error('Error moving note');
    }
    return false;
  };

  const saveNote = async (note: Note) => {
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: note.title, content: note.content, project_id: note.project_id }),
      });
      if (res.ok) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
        return true;
      } else {
        setSaveStatus('error');
        toast.error('Failed to save note');
      }
    } catch (err) {
      console.error('Error saving note:', err);
      setSaveStatus('error');
      toast.error('Error saving note');
    }
    return false;
  };

  const restoreNote = async (id: number) => {
    try {
      const res = await fetch(`/api/notes/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchNotes();
        toast.success('Note restored successfully');
      } else {
        toast.error('Failed to restore note');
      }
    } catch (err) {
      toast.error('Error restoring note');
    }
  };

  const deleteNotePermanent = async (id: number) => {
    try {
      const res = await fetch(`/api/notes/${id}/permanent`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Note permanently deleted');
      } else {
        toast.error('Failed to permanently delete note');
      }
    } catch (err) {
      toast.error('Error permanently deleting note');
    }
  };

  return {
    notes,
    setNotesList,
    activeNoteId,
    setActiveNoteId,
    fetchNotes,
    createNote,
    updateNote,
    deleteNote,
    moveNoteToProject,
    saveNote,
    restoreNote,
    deleteNotePermanent,
    hasMoreNotes,
    notesTotal,
    saveStatus
  };
}
