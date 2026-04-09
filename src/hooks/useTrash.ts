import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Diagram, Note, Drawing, Flowchart, Project } from '../types';
import { localPersistence } from '../lib/localPersistence';

export function useTrash(isGuest: boolean = false) {
  const [trashData, setTrashData] = useState<{
    diagrams: Diagram[];
    notes: Note[];
    drawings: Drawing[];
    flowcharts: Flowchart[];
    projects: Project[];
  }>({ diagrams: [], notes: [], drawings: [], flowcharts: [], projects: [] });
  const [isLoading, setIsLoading] = useState(false);

  const fetchTrash = useCallback(async () => {
    if (isGuest) {
      try {
        const [files, notes, drawings, flowchart, projects] = await Promise.all([
          localPersistence.getAllResources('erd'),
          localPersistence.getAllResources('notes'),
          localPersistence.getAllResources('drawings'),
          localPersistence.getAllResources('flowchart'),
          localPersistence.getAllResources('project'),
        ]);

        const filterDeleted = (list: any[]) => list.filter(item => item.is_deleted);
        
        setTrashData({
          diagrams: filterDeleted(files),
          notes: filterDeleted(notes),
          drawings: filterDeleted(drawings),
          flowcharts: filterDeleted(flowchart),
          projects: filterDeleted(projects),
        });
      } catch (err) {
        console.error('Error fetching guest trash:', err);
      }
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/trash');
      if (res.ok) {
        const data = await res.json();
        const sortedData = {
          diagrams: Array.isArray(data.diagrams) ? data.diagrams.sort((a: any, b: any) => b.id - a.id) : [],
          notes: Array.isArray(data.notes) ? data.notes.sort((a: any, b: any) => b.id - a.id) : [],
          drawings: Array.isArray(data.drawings) ? data.drawings.sort((a: any, b: any) => b.id - a.id) : [],
          flowcharts: Array.isArray(data.flowcharts) ? data.flowcharts.sort((a: any, b: any) => b.id - a.id) : [],
          projects: Array.isArray(data.projects) ? data.projects.sort((a: any, b: any) => b.id - a.id) : [],
        };
        setTrashData(sortedData);
      }
    } catch (err) {
      console.error('Error fetching trash:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isGuest]);

  const restoreResource = async (id: number | string) => {
    if (isGuest) {
      const item = await localPersistence.getResource(id);
      if (item) {
        item.is_deleted = false;
        item.deleted_at = undefined;
        await localPersistence.saveResource(item);
        fetchTrash();
        toast.success('Restored successfully locally');
        return true;
      }
      return false;
    }
    return false;
  };

  const restoreNote = async (id: number | string) => {
    if (isGuest) return restoreResource(id);
    try {
      const res = await fetch(`/api/notes/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchTrash();
        toast.success('Note restored successfully');
      } else {
        toast.error('Failed to restore note');
      }
    } catch (err) {
      toast.error('Error restoring note');
    }
  };

  const restoreDrawing = async (id: number | string) => {
    if (isGuest) return restoreResource(id);
    try {
      const res = await fetch(`/api/drawings/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchTrash();
        toast.success('Drawing restored successfully');
      } else {
        toast.error('Failed to restore drawing');
      }
    } catch (err) {
      toast.error('Error restoring drawing');
    }
  };

  const restoreFlowchart = async (id: number | string) => {
    if (isGuest) return restoreResource(id);
    try {
      const res = await fetch(`/api/flowcharts/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchTrash();
        toast.success('Flowchart restored successfully');
      } else {
        toast.error('Failed to restore flowchart');
      }
    } catch (err) {
      toast.error('Error restoring flowchart');
    }
  };

  return {
    trashData,
    setTrashData,
    fetchTrash,
    restoreNote,
    restoreDrawing,
    restoreFlowchart,
    isLoading
  };
}
