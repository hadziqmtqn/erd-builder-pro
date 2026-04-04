import { useState, useCallback, useRef } from 'react';
import { Drawing } from '../types';

export function useDrawings() {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [activeDrawingId, setActiveDrawingId] = useState<number | null>(null);

  const [drawingsTotal, setDrawingsTotal] = useState(0);
  const [hasMoreDrawings, setHasMoreDrawings] = useState(false);
  const drawingsRef = useRef<Drawing[]>(drawings);

  // Keep ref in sync
  drawingsRef.current = drawings;

  const fetchDrawings = useCallback(async (isLoadMore = false) => {
    try {
      const offset = isLoadMore ? drawingsRef.current.length : 0;
      const res = await fetch(`/api/drawings?limit=10&offset=${offset}`);
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
        return newDrawing;
      }
    } catch (err) {
      console.error('Error creating drawing:', err);
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
      }
    } catch (err) {
      console.error('Error updating drawing:', err);
    }
  };

  const deleteDrawing = async (id: number) => {
    try {
      const res = await fetch(`/api/drawings/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDrawings(prev => prev.map(d => d.id === id ? { ...d, is_deleted: true } : d));
        if (activeDrawingId === id) setActiveDrawingId(null);
      }
    } catch (err) {
      console.error('Error deleting drawing:', err);
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
        return true;
      }
    } catch (err) {
      console.error('Error moving drawing:', err);
    }
    return false;
  };

  const saveDrawing = async (drawing: Drawing) => {
    try {
      const res = await fetch(`/api/drawings/${drawing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: drawing.title, data: drawing.data, project_id: drawing.project_id }),
      });
      if (res.ok) {
        return true;
      }
    } catch (err) {
      console.error('Error saving drawing:', err);
    }
    return false;
  };

  const restoreDrawing = async (id: number) => {
    try {
      const res = await fetch(`/api/drawings/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchDrawings();
      }
    } catch (err) {}
  };

  const deleteDrawingPermanent = async (id: number) => {
    try {
      await fetch(`/api/drawings/${id}/permanent`, { method: 'DELETE' });
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
    drawingsTotal
  };
}
