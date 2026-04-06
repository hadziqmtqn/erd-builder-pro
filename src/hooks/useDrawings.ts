import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Drawing, DraftType } from '../types';
import { localPersistence } from '../lib/localPersistence';

export function useDrawings() {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [activeDrawingId, setActiveDrawingId] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [drawingsTotal, setDrawingsTotal] = useState(0);
  const [hasMoreDrawings, setHasMoreDrawings] = useState(false);
  const drawingsRef = useRef<Drawing[]>(drawings);

  // Keep ref in sync
  drawingsRef.current = drawings;

  const fetchDrawings = useCallback(async (isLoadMore = false, projectId: number | null | string = 'all', searchQuery = '') => {
    try {
      const offset = isLoadMore ? drawingsRef.current.length : 0;
      const projIdParam = (projectId === null || projectId === 'null') ? 'null' : projectId;
      const qParam = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`/api/drawings?limit=10&offset=${offset}&project_id=${projIdParam}${qParam}`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data !== undefined ? json.data : json; // Fallback to raw array
        const total = json.total !== undefined ? json.total : (Array.isArray(data) ? data.length : 0);

        const drawingsListData = Array.isArray(data) ? data : [];
        if (isLoadMore) {
          setDrawings(prev => [...prev, ...drawingsListData]);
        } else {
          setDrawings(drawingsListData);
        }
        setDrawingsTotal(total);
        setHasMoreDrawings((drawingsListData.length + offset) < total);
      }
    } catch (err) {
      console.error('Error fetching drawings:', err);
    }
  }, []); // Stable dependency array

  const createDrawing = async (title: string, projectId?: number | null) => {
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
      } else {
        toast.error('Failed to create drawing');
      }
    } catch (err) {
      console.error('Error creating drawing:', err);
      toast.error('Error creating drawing');
    }
    return null;
  };

  const updateDrawing = async (id: number, title: string) => {
    try {
      const res = await fetch(`/api/drawings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setDrawings(prev => prev.map(d => d.id === id ? { ...d, title } : d));
        toast.success('Drawing renamed successfully');
      } else {
        toast.error('Failed to rename drawing');
      }
    } catch (err) {
      console.error('Error updating drawing:', err);
      toast.error('Error renaming drawing');
    }
  };

  const deleteDrawing = async (id: number) => {
    try {
      const res = await fetch(`/api/drawings/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDrawings(prev => prev.map(d => d.id === id ? { ...d, is_deleted: true } : d));
        if (activeDrawingId === id) setActiveDrawingId(null);
        toast.success('Drawing moved to trash');
      } else {
        toast.error('Failed to delete drawing');
      }
    } catch (err) {
      console.error('Error deleting drawing:', err);
      toast.error('Error deleting drawing');
    }
  };

  const moveDrawingToProject = async (drawingId: number, projectId: number | null) => {
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
      } else {
        toast.error('Failed to move drawing');
      }
    } catch (err) {
      console.error('Error moving drawing:', err);
      toast.error('Error moving drawing');
    }
    return false;
  };

  const saveDrawing = async (drawing: Drawing) => {
    setSaveStatus('saving');
    
    // Save to local IndexedDB first
    try {
      await localPersistence.saveDraft(DraftType.DRAWINGS, drawing.id, drawing.data || '', true);
    } catch (e) {
      console.warn('Local draft save failed', e);
    }

    // Try to save to server only if online
    if (navigator.onLine) {
      try {
        const res = await fetch(`/api/drawings/${drawing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: drawing.title, data: drawing.data, project_id: drawing.project_id }),
        });
        if (res.ok) {
          // Clear sync pending
          await localPersistence.saveDraft(DraftType.DRAWINGS, drawing.id, drawing.data || '', false);
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
          return true;
        } else {
          setSaveStatus('error');
        }
      } catch (err) {
        console.error('Error saving drawing to server:', err);
        setSaveStatus('error');
      }
    } else {
      // Offline: just stay in saving/saved state locally
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
    return false;
  };

  const restoreDrawing = async (id: number) => {
    try {
      const res = await fetch(`/api/drawings/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchDrawings();
        toast.success('Drawing restored successfully');
      } else {
        toast.error('Failed to restore drawing');
      }
    } catch (err) {
      toast.error('Error restoring drawing');
    }
  };

  const deleteDrawingPermanent = async (id: number) => {
    try {
      const res = await fetch(`/api/drawings/${id}/permanent`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Drawing permanently deleted');
      } else {
        toast.error('Failed to permanently delete drawing');
      }
    } catch (err) {
      toast.error('Error permanently deleting drawing');
    }
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
