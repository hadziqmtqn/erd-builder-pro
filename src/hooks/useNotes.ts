import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Note, DraftType } from '../types';
import { localPersistence } from '../lib/localPersistence';

export function useNotes(isGuest: boolean = false) {
  const [notes, setNotesList] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<number | string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isItemLoading, setIsItemLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [notesTotal, setNotesTotal] = useState(0);
  const [hasMoreNotes, setHasMoreNotes] = useState(false);
  const notesRef = useRef<Note[]>(notes);

  // Keep ref in sync
  notesRef.current = notes;

  const fetchNotes = useCallback(async (isLoadMore = false, projectId: number | null | string = 'all', searchQuery = '') => {
    if (isGuest) {
      const localNotes = await localPersistence.getAllResources('notes');
      let filtered = localNotes.filter(n => !n.is_deleted);
      if (projectId !== 'all') {
        filtered = filtered.filter(n => n.project_id === projectId);
      }
      if (searchQuery) {
        filtered = filtered.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase()));
      }
      setNotesList(filtered);
      setNotesTotal(filtered.length);
      setHasMoreNotes(false);
      return;
    }

    setIsLoading(true);
    try {
      const offset = isLoadMore ? notesRef.current.length : 0;
      const projIdParam = (projectId === null || projectId === 'null') ? 'null' : projectId;
      const qParam = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`/api/notes?limit=10&offset=${offset}&project_id=${projIdParam}${qParam}`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data !== undefined ? json.data : (Array.isArray(json) ? json : []);
        const total = json.total !== undefined ? json.total : (Array.isArray(data) ? data.length : 0);
        
        const notesListData = Array.isArray(data) ? data : [];
        if (isLoadMore) {
          setNotesList(prev => [...prev, ...notesListData]);
        } else {
          setNotesList(notesListData);
        }
        setNotesTotal(total);
        setHasMoreNotes((notesListData.length + offset) < total);
      } else {
        const errText = await res.text();
        console.error(`Failed to fetch notes: ${res.status} ${res.statusText}`, errText);
      }
    } catch (err) {
      console.error('Error in fetchNotes:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isGuest]); 

  const createNote = async (title: string, projectId?: number | string | null) => {
    if (isGuest) {
      const newNote: Note = {
        id: Math.random().toString(36).substr(2, 9),
        title,
        content: '',
        project_id: projectId || null,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      // @ts-ignore
      newNote.type = 'notes';
      await localPersistence.saveResource(newNote);
      setNotesList(prev => [newNote, ...prev]);
      toast.success('Note created locally');
      return newNote;
    }

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
      }
    } catch (err) {
      console.error('Error creating note:', err);
    }
    return null;
  };

  const updateNote = async (id: number | string, title: string) => {
    if (isGuest) {
      const note = await localPersistence.getResource(id);
      if (note) {
        note.title = title;
        note.updated_at = new Date().toISOString();
        await localPersistence.saveResource(note);
        setNotesList(prev => prev.map(n => n.id === id ? { ...n, title } : n));
        toast.success('Note renamed locally');
      }
      return;
    }

    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setNotesList(prev => prev.map(n => n.id === id ? { ...n, title } : n));
        toast.success('Note renamed successfully');
      }
    } catch (err) {}
  };

  const deleteNote = async (id: number | string) => {
    if (isGuest) {
      const note = await localPersistence.getResource(id);
      if (note) {
        note.is_deleted = true;
        note.deleted_at = new Date().toISOString();
        await localPersistence.saveResource(note);
        setNotesList(prev => prev.map(n => n.id === id ? { ...n, is_deleted: true } : n));
        if (activeNoteId === id) setActiveNoteId(null);
        toast.success('Note moved to local trash');
      }
      return;
    }

    try {
      const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotesList(prev => prev.map(n => n.id === id ? { ...n, is_deleted: true } : n));
        if (activeNoteId === id) setActiveNoteId(null);
        toast.success('Note moved to trash');
      }
    } catch (err) {}
  };

  const moveNoteToProject = async (noteId: number | string, projectId: number | string | null) => {
    if (isGuest) {
      const note = await localPersistence.getResource(noteId);
      if (note) {
        note.project_id = projectId;
        await localPersistence.saveResource(note);
        setNotesList(prev => prev.map(n => n.id === noteId ? { ...n, project_id: projectId } : n));
        toast.success('Note moved to project locally');
      }
      return true;
    }

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
      }
    } catch (err) {}
    return false;
  };

  const saveNote = async (note: Note) => {
    if (!note.id) return false;
    setSaveStatus('saving');
    
    if (isGuest) {
      const localNote = await localPersistence.getResource(note.id);
      if (localNote) {
        localNote.content = note.content;
        localNote.updated_at = new Date().toISOString();
        await localPersistence.saveResource(localNote);
      }
      await localPersistence.saveDraft(DraftType.NOTES, note.id, JSON.stringify({ content: note.content }), false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      return true;
    }

    try {
      await localPersistence.saveDraft(DraftType.NOTES, note.id, JSON.stringify({ content: note.content }), true);
      
      const res = await fetch(`/api/notes/${note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: note.content, title: note.title, project_id: note.project_id }),
      });
      
      if (res.ok) {
        await localPersistence.saveDraft(DraftType.NOTES, note.id, JSON.stringify({ content: note.content }), false);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
        return true;
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      setSaveStatus('error');
    }
    return false;
  };

  const restoreNote = async (id: number | string) => {
    if (isGuest) {
      const note = await localPersistence.getResource(id);
      if (note) {
        note.is_deleted = false;
        note.deleted_at = undefined;
        await localPersistence.saveResource(note);
        fetchNotes();
        toast.success('Note restored locally');
      }
      return;
    }

    try {
      const res = await fetch(`/api/notes/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchNotes();
        toast.success('Note restored successfully');
      }
    } catch (err) {}
  };

  const deleteNotePermanent = async (id: number | string) => {
    if (isGuest) {
      await localPersistence.deleteResource(id);
      await localPersistence.clearDraft(DraftType.NOTES, id);
      toast.success('Note permanently deleted from local');
      return;
    }

    try {
      const res = await fetch(`/api/notes/${id}/permanent`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Note permanently deleted');
      }
    } catch (err) {}
  };

  const selectNote = async (id: number | string) => {
    const note = notes.find(n => n.id === id);
    if (note?.is_deleted) return;
    
    setIsItemLoading(true);
    try {
      const draft = await localPersistence.getDraft(DraftType.NOTES, id);
      if (draft && draft.sync_pending) {
        try {
          const parsed = JSON.parse(draft.data);
          setNotesList(prev => prev.map(n => n.id === id ? { ...n, content: parsed.content } : n));
          toast.info("Loaded unsynced local note draft");
        } catch (e) {}
      }
      setActiveNoteId(id);
    } finally {
      setIsItemLoading(false);
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
    saveStatus,
    isLoading,
    isItemLoading,
    selectNote
  };
}
