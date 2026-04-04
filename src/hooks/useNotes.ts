import { useState, useCallback, useRef } from 'react';
import { Note } from '../types';

export function useNotes() {
  const [notes, setNotesList] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);

  const [notesTotal, setNotesTotal] = useState(0);
  const [hasMoreNotes, setHasMoreNotes] = useState(false);
  const notesRef = useRef<Note[]>(notes);

  // Keep ref in sync
  notesRef.current = notes;

  const fetchNotes = useCallback(async (isLoadMore = false) => {
    try {
      const offset = isLoadMore ? notesRef.current.length : 0;
      const res = await fetch(`/api/notes?limit=10&offset=${offset}`);
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
        return newNote;
      }
    } catch (err) {
      console.error('Error creating note:', err);
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
      }
    } catch (err) {
      console.error('Error updating note:', err);
    }
  };

  const deleteNote = async (id: number) => {
    try {
      const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotesList(prev => prev.map(n => n.id === id ? { ...n, is_deleted: true } : n));
        if (activeNoteId === id) setActiveNoteId(null);
      }
    } catch (err) {
      console.error('Error deleting note:', err);
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
        return true;
      }
    } catch (err) {
      console.error('Error moving note:', err);
    }
    return false;
  };

  const saveNote = async (note: Note) => {
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: note.title, content: note.content, project_id: note.project_id }),
      });
      if (res.ok) {
        return true;
      }
    } catch (err) {
      console.error('Error saving note:', err);
    }
    return false;
  };

  const restoreNote = async (id: number) => {
    try {
      const res = await fetch(`/api/notes/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchNotes();
      }
    } catch (err) {}
  };

  const deleteNotePermanent = async (id: number) => {
    try {
      await fetch(`/api/notes/${id}/permanent`, { method: 'DELETE' });
    } catch (err) {}
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
    notesTotal
  };
}
