import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Flowchart, DraftType } from '../types';
import { localPersistence } from '../lib/localPersistence';

export function useFlowcharts(isGuest: boolean = false) {
  const [flowcharts, setFlowcharts] = useState<Flowchart[]>([]);
  const [activeFlowchartId, setActiveFlowchartId] = useState<number | string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [flowchartsTotal, setFlowchartsTotal] = useState(0);
  const [hasMoreFlowcharts, setHasMoreFlowcharts] = useState(false);
  const flowchartsRef = useRef<Flowchart[]>(flowcharts);

  // Keep ref in sync
  flowchartsRef.current = flowcharts;

  const fetchFlowcharts = useCallback(async (isLoadMore = false, projectId: number | null | string = 'all', searchQuery = '') => {
    if (isGuest) {
      const localFlowcharts = await localPersistence.getAllResources('flowchart');
      let filtered = localFlowcharts.filter(f => !f.is_deleted);
      if (projectId !== 'all') {
        filtered = filtered.filter(f => f.project_id === projectId);
      }
      if (searchQuery) {
        filtered = filtered.filter(f => f.title.toLowerCase().includes(searchQuery.toLowerCase()));
      }
      setFlowcharts(filtered);
      setFlowchartsTotal(filtered.length);
      setHasMoreFlowcharts(false);
      return;
    }

    try {
      const offset = isLoadMore ? flowchartsRef.current.length : 0;
      const projIdParam = (projectId === null || projectId === 'null') ? 'null' : projectId;
      const qParam = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`/api/flowcharts?limit=10&offset=${offset}&project_id=${projIdParam}${qParam}`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data !== undefined ? json.data : json;
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
  }, [isGuest]);

  const createFlowchart = async (title: string, projectId?: number | string | null) => {
    if (isGuest) {
      const newFlowchart: Flowchart = {
        id: Math.random().toString(36).substr(2, 9),
        title,
        data: '',
        project_id: projectId || null,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      // @ts-ignore
      newFlowchart.type = 'flowchart';
      await localPersistence.saveResource(newFlowchart);
      setFlowcharts(prev => [newFlowchart, ...prev]);
      toast.success('Flowchart created locally');
      return newFlowchart;
    }

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
      }
    } catch (err) {}
    return null;
  };

  const updateFlowchart = async (id: number | string, title: string) => {
    if (isGuest) {
      const flowchart = await localPersistence.getResource(id);
      if (flowchart) {
        flowchart.title = title;
        flowchart.updated_at = new Date().toISOString();
        await localPersistence.saveResource(flowchart);
        setFlowcharts(prev => prev.map(f => f.id === id ? { ...f, title } : f));
        toast.success('Flowchart renamed locally');
      }
      return;
    }

    try {
      const res = await fetch(`/api/flowcharts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setFlowcharts(prev => prev.map(f => f.id === id ? { ...f, title } : f));
        toast.success('Flowchart renamed successfully');
      }
    } catch (err) {}
  };

  const deleteFlowchart = async (id: number | string) => {
    if (isGuest) {
      const flowchart = await localPersistence.getResource(id);
      if (flowchart) {
        flowchart.is_deleted = true;
        flowchart.deleted_at = new Date().toISOString();
        await localPersistence.saveResource(flowchart);
        setFlowcharts(prev => prev.map(f => f.id === id ? { ...f, is_deleted: true } : f));
        if (activeFlowchartId === id) setActiveFlowchartId(null);
        toast.success('Flowchart moved to local trash');
      }
      return;
    }

    try {
      const res = await fetch(`/api/flowcharts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFlowcharts(prev => prev.map(f => f.id === id ? { ...f, is_deleted: true } : f));
        if (activeFlowchartId === id) setActiveFlowchartId(null);
        toast.success('Flowchart moved to trash');
      }
    } catch (err) {}
  };

  const moveFlowchartToProject = async (flowchartId: number | string, projectId: number | string | null) => {
    if (isGuest) {
      const flowchart = await localPersistence.getResource(flowchartId);
      if (flowchart) {
        flowchart.project_id = projectId;
        await localPersistence.saveResource(flowchart);
        setFlowcharts(prev => prev.map(f => f.id === flowchartId ? { ...f, project_id: projectId } : f));
        toast.success('Flowchart moved to project locally');
      }
      return true;
    }

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
      }
    } catch (err) {}
    return false;
  };

  const saveFlowchart = async (flowchart: Flowchart) => {
    if (!flowchart.id) return false;
    setSaveStatus('saving');
    
    if (isGuest) {
      const localFlowchart = await localPersistence.getResource(flowchart.id);
      if (localFlowchart) {
        localFlowchart.data = flowchart.data;
        localFlowchart.updated_at = new Date().toISOString();
        await localPersistence.saveResource(localFlowchart);
      }
      await localPersistence.saveDraft(DraftType.FLOWCHART, flowchart.id, flowchart.data || '', false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      return true;
    }

    try {
      await localPersistence.saveDraft(DraftType.FLOWCHART, flowchart.id, flowchart.data || '', true);
      const res = await fetch(`/api/flowcharts/${flowchart.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: flowchart.title, data: flowchart.data, project_id: flowchart.project_id }),
      });
      if (res.ok) {
        await localPersistence.saveDraft(DraftType.FLOWCHART, flowchart.id, flowchart.data || '', false);
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

  const restoreFlowchart = async (id: number | string) => {
    if (isGuest) {
      const flowchart = await localPersistence.getResource(id);
      if (flowchart) {
        flowchart.is_deleted = false;
        flowchart.deleted_at = undefined;
        await localPersistence.saveResource(flowchart);
        fetchFlowcharts();
        toast.success('Flowchart restored locally');
      }
      return;
    }

    try {
      const res = await fetch(`/api/flowcharts/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchFlowcharts();
        toast.success('Flowchart restored successfully');
      }
    } catch (err) {}
  };

  const deleteFlowchartPermanent = async (id: number | string) => {
    if (isGuest) {
      await localPersistence.deleteResource(id);
      await localPersistence.clearDraft(DraftType.FLOWCHART, id);
      toast.success('Flowchart permanently deleted from local');
      return;
    }

    try {
      const res = await fetch(`/api/flowcharts/${id}/permanent`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Flowchart permanently deleted');
      }
    } catch (err) {}
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
