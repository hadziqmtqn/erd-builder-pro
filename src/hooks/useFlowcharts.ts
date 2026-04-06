import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Flowchart, DraftType } from '../types';
import { localPersistence } from '../lib/localPersistence';

export function useFlowcharts() {
  const [flowcharts, setFlowcharts] = useState<Flowchart[]>([]);
  const [activeFlowchartId, setActiveFlowchartId] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [flowchartsTotal, setFlowchartsTotal] = useState(0);
  const [hasMoreFlowcharts, setHasMoreFlowcharts] = useState(false);
  const flowchartsRef = useRef<Flowchart[]>(flowcharts);

  // Keep ref in sync
  flowchartsRef.current = flowcharts;

  const fetchFlowcharts = useCallback(async (isLoadMore = false, projectId: number | null | string = 'all', searchQuery = '') => {
    try {
      const offset = isLoadMore ? flowchartsRef.current.length : 0;
      const projIdParam = (projectId === null || projectId === 'null') ? 'null' : projectId;
      const qParam = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`/api/flowcharts?limit=10&offset=${offset}&project_id=${projIdParam}${qParam}`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data !== undefined ? json.data : json; // Fallback to raw array
        const total = json.total !== undefined ? json.total : (Array.isArray(data) ? data.length : 0);

        const flowchartsListData = Array.isArray(data) ? data : [];
        if (isLoadMore) {
          setFlowcharts(prev => [...prev, ...flowchartsListData]);
        } else {
          setFlowcharts(flowchartsListData);
        }
        setFlowchartsTotal(total);
        setHasMoreFlowcharts((flowchartsListData.length + offset) < total);
      }
    } catch (err) {
      console.error('Error fetching flowcharts:', err);
    }
  }, []); // Stable dependency array

  const createFlowchart = async (title: string, projectId?: number | null) => {
    try {
      const res = await fetch('/api/flowcharts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, project_id: projectId }),
      });
      if (res.ok) {
        const newFlowchart = await res.json();
        setFlowcharts(prev => [newFlowchart, ...prev]);
        toast.success('Flowchart created successfully');
        return newFlowchart;
      } else {
        toast.error('Failed to create flowchart');
      }
    } catch (err) {
      console.error('Error creating flowchart:', err);
      toast.error('Error creating flowchart');
    }
    return null;
  };

  const updateFlowchart = async (id: number, title: string) => {
    try {
      const res = await fetch(`/api/flowcharts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setFlowcharts(prev => prev.map(f => f.id === id ? { ...f, title } : f));
        toast.success('Flowchart renamed successfully');
      } else {
        toast.error('Failed to rename flowchart');
      }
    } catch (err) {
      console.error('Error updating flowchart:', err);
      toast.error('Error renaming flowchart');
    }
  };

  const deleteFlowchart = async (id: number) => {
    try {
      const res = await fetch(`/api/flowcharts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFlowcharts(prev => prev.map(f => f.id === id ? { ...f, is_deleted: true } : f));
        if (activeFlowchartId === id) setActiveFlowchartId(null);
        toast.success('Flowchart moved to trash');
      } else {
        toast.error('Failed to delete flowchart');
      }
    } catch (err) {
      console.error('Error deleting flowchart:', err);
      toast.error('Error deleting flowchart');
    }
  };

  const moveFlowchartToProject = async (flowchartId: number, projectId: number | null) => {
    try {
      const res = await fetch(`/api/flowcharts/${flowchartId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (res.ok) {
        setFlowcharts(prev => prev.map(f => f.id === flowchartId ? { ...f, project_id: projectId } : f));
        toast.success('Flowchart moved to project');
        return true;
      } else {
        toast.error('Failed to move flowchart');
      }
    } catch (err) {
      console.error('Error moving flowchart:', err);
      toast.error('Error moving flowchart');
    }
    return false;
  };

  const saveFlowchart = async (flowchart: Flowchart) => {
    setSaveStatus('saving');
    
    // Save to local IndexedDB first
    try {
      await localPersistence.saveDraft(DraftType.FLOWCHART, flowchart.id, flowchart.data || '', true);
    } catch (e) {
      console.warn('Local draft save failed', e);
    }

    // Try to save to server only if online
    if (navigator.onLine) {
      try {
        const res = await fetch(`/api/flowcharts/${flowchart.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: flowchart.title, data: flowchart.data, project_id: flowchart.project_id }),
        });
        if (res.ok) {
          // Clear sync pending
          await localPersistence.saveDraft(DraftType.FLOWCHART, flowchart.id, flowchart.data || '', false);
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
          return true;
        } else {
          setSaveStatus('error');
        }
      } catch (err) {
        console.error('Error saving flowchart to server:', err);
        setSaveStatus('error');
      }
    } else {
      // Offline: just stay in saving/saved state locally
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
    return false;
  };

  const restoreFlowchart = async (id: number) => {
    try {
      const res = await fetch(`/api/flowcharts/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchFlowcharts();
        toast.success('Flowchart restored successfully');
      } else {
        toast.error('Failed to restore flowchart');
      }
    } catch (err) {
      toast.error('Error restoring flowchart');
    }
  };

  const deleteFlowchartPermanent = async (id: number) => {
    try {
      const res = await fetch(`/api/flowcharts/${id}/permanent`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Flowchart permanently deleted');
      } else {
        toast.error('Failed to permanently delete flowchart');
      }
    } catch (err) {
      toast.error('Error permanently deleting flowchart');
    }
  };

  return {
    flowcharts,
    setFlowcharts,
    activeFlowchartId,
    setActiveFlowchartId,
    fetchFlowcharts,
    createFlowchart,
    updateFlowchart,
    deleteFlowchart,
    moveFlowchartToProject,
    saveFlowchart,
    restoreFlowchart,
    deleteFlowchartPermanent,
    hasMoreFlowcharts,
    flowchartsTotal,
    saveStatus
  };
}
