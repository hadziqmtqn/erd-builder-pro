import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Drawing, DraftType } from '../types';
import { localPersistence } from '../lib/localPersistence';

export function useDrawings(isGuest: boolean = false) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [activeDrawingId, setActiveDrawingId] = useState<number | string | null>(null);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [drawingsTotal, setDrawingsTotal] = useState(0);
  const [hasMoreDrawings, setHasMoreFiles] = useState(false);
  const drawingsRef = useRef<Drawing[]>(drawings);

  // Keep ref in sync
  drawingsRef.current = drawings;

  const fetchDrawings = useCallback(async (isLoadMore = false, projectId: number | null | string = 'all', searchQuery = '') => {
    if (isGuest) {
      const localDrawings = await localPersistence.getAllResources('drawings');
      let filtered = localDrawings.filter(d => !d.is_deleted);
      if (projectId !== 'all') {
        filtered = filtered.filter(d => d.project_id === projectId);
      }
      if (searchQuery) {
        filtered = filtered.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase()));
      }
      setDrawings(filtered);
      setDrawingsTotal(filtered.length);
      setHasMoreFiles(false);
      return;
    }

    try {
      const offset = isLoadMore ? drawingsRef.current.length : 0;
      const projIdParam = (projectId === null || projectId === 'null') ? 'null' : projectId;
      const qParam = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`/api/drawings?limit=10&offset=${offset}&project_id=${projIdParam}${qParam}`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data !== undefined ? json.data : json;
        const total = json.total !== undefined ? json.total : (Array.isArray(data) ? data.length : 0);

        const drawingsListData = Array.isArray(data) ? data : [];
        if (isLoadMore) {
          setDrawings(prev => [...prev, ...drawingsListData]);
        } else {
          setDrawings(drawingsListData);
        }
        setDrawingsTotal(total);
        setHasMoreFiles((drawingsListData.length + offset) < total);
      }
    } catch (err) {
      console.error('Error fetching drawings:', err);
    }
  }, [isGuest]);

  const createDrawing = async (title: string, projectId?: number | string | null) => {
    if (isGuest) {
      const newDrawing: Drawing = {
        id: Math.random().toString(36).substr(2, 9),
        title,
        data: '',
        project_id: projectId || null,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      // @ts-ignore
      newDrawing.type = 'drawings';
      await localPersistence.saveResource(newDrawing);
      setDrawings(prev => [newDrawing, ...prev]);
      toast.success('Drawing created locally');
      return newDrawing;
    }

    try {
      const res = await fetch('/api/drawings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, project_id: projectId }),
      });
      if (res.ok) {
        const newDrawing = await res.json();
        setDrawings(prev => [newDrawing, ...prev]);
        toast.success('Drawing created successfully');
        return newDrawing;
      }
    } catch (err) {}
    return null;
  };

  const updateDrawing = async (id: number | string, title: string) => {
    if (isGuest) {
      const drawing = await localPersistence.getResource(id);
      if (drawing) {
        drawing.title = title;
        drawing.updated_at = new Date().toISOString();
        await localPersistence.saveResource(drawing);
        setDrawings(prev => prev.map(d => d.id === id ? { ...d, title } : d));
        toast.success('Drawing renamed locally');
      }
      return;
    }

    try {
      const res = await fetch(`/api/drawings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setDrawings(prev => prev.map(d => d.id === id ? { ...d, title } : d));
        toast.success('Drawing renamed successfully');
      }
    } catch (err) {}
  };

  const deleteDrawing = async (id: number | string) => {
    if (isGuest) {
      const drawing = await localPersistence.getResource(id);
      if (drawing) {
        drawing.is_deleted = true;
        drawing.deleted_at = new Date().toISOString();
        await localPersistence.saveResource(drawing);
        setDrawings(prev => prev.map(d => d.id === id ? { ...d, is_deleted: true } : d));
        if (activeDrawingId === id) setActiveDrawingId(null);
        toast.success('Drawing moved to local trash');
      }
      return;
    }

    try {
      const res = await fetch(`/api/drawings/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDrawings(prev => prev.map(d => d.id === id ? { ...d, is_deleted: true } : d));
        if (activeDrawingId === id) setActiveDrawingId(null);
        toast.success('Drawing moved to trash');
      }
    } catch (err) {}
  };

  const moveDrawingToProject = async (drawingId: number | string, projectId: number | string | null) => {
    if (isGuest) {
      const drawing = await localPersistence.getResource(drawingId);
      if (drawing) {
        drawing.project_id = projectId;
        await localPersistence.saveResource(drawing);
        setDrawings(prev => prev.map(d => d.id === drawingId ? { ...d, project_id: projectId } : d));
        toast.success('Drawing moved to project locally');
      }
      return true;
    }

    try {
      const res = await fetch(`/api/drawings/${drawingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (res.ok) {
        setDrawings(prev => prev.map(d => d.id === drawingId ? { ...d, project_id: projectId } : d));
        toast.success('Drawing moved to project');
        return true;
      }
    } catch (err) {}
    return false;
  };

  const saveDrawing = async (drawing: Drawing) => {
    if (!drawing.id) return false;
    setSaveStatus('saving');
    
    if (isGuest) {
      const localDrawing = await localPersistence.getResource(drawing.id);
      if (localDrawing) {
        localDrawing.data = drawing.data;
        localDrawing.updated_at = new Date().toISOString();
        await localPersistence.saveResource(localDrawing);
      }
      await localPersistence.saveDraft(DraftType.DRAWINGS, drawing.id, drawing.data || '', false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      return true;
    }

    try {
      await localPersistence.saveDraft(DraftType.DRAWINGS, drawing.id, drawing.data || '', true);
      const res = await fetch(`/api/drawings/${drawing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: drawing.title, data: drawing.data, project_id: drawing.project_id }),
      });
      if (res.ok) {
        await localPersistence.saveDraft(DraftType.DRAWINGS, drawing.id, drawing.data || '', false);
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

  const restoreDrawing = async (id: number | string) => {
    if (isGuest) {
      const drawing = await localPersistence.getResource(id);
      if (drawing) {
        drawing.is_deleted = false;
        drawing.deleted_at = undefined;
        await localPersistence.saveResource(drawing);
        fetchDrawings();
        toast.success('Drawing restored locally');
      }
      return;
    }

    try {
      const res = await fetch(`/api/drawings/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchDrawings();
        toast.success('Drawing restored successfully');
      }
    } catch (err) {}
  };

  const deleteDrawingPermanent = async (id: number | string) => {
    if (isGuest) {
      await localPersistence.deleteResource(id);
      await localPersistence.clearDraft(DraftType.DRAWINGS, id);
      toast.success('Drawing permanently deleted from local');
      return;
    }

    try {
      const res = await fetch(`/api/drawings/${id}/permanent`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Drawing permanently deleted');
      }
    } catch (err) {}
  };

  return {
    drawings,
    setDrawings,
    activeDrawingId,
    setActiveDrawingId,
    fetchDrawings,
    createDrawing,
    updateDrawing,
    deleteDrawing,
    moveDrawingToProject,
    saveDrawing,
    restoreDrawing,
    deleteDrawingPermanent,
    hasMoreDrawings,
    drawingsTotal,
    saveStatus
  };
}
