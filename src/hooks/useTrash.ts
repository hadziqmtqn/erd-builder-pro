import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { FileData, Note, Drawing, Flowchart, Project } from '../types';

export function useTrash() {
  const [trashData, setTrashData] = useState<{
    files: FileData[];
    notes: Note[];
    drawings: Drawing[];
    flowcharts: Flowchart[];
    projects: Project[];
  }>({ files: [], notes: [], drawings: [], flowcharts: [], projects: [] });

  const fetchTrash = useCallback(async () => {
    try {
      const res = await fetch('/api/trash');
      if (res.ok) {
        const data = await res.json();
        const sortedData = {
          files: Array.isArray(data.files) ? data.files.sort((a: any, b: any) => b.id - a.id) : [],
          notes: Array.isArray(data.notes) ? data.notes.sort((a: any, b: any) => b.id - a.id) : [],
          drawings: Array.isArray(data.drawings) ? data.drawings.sort((a: any, b: any) => b.id - a.id) : [],
          flowcharts: Array.isArray(data.flowcharts) ? data.flowcharts.sort((a: any, b: any) => b.id - a.id) : [],
          projects: Array.isArray(data.projects) ? data.projects.sort((a: any, b: any) => b.id - a.id) : [],
        };
        setTrashData(sortedData);
      }
    } catch (err) {
      console.error('Error fetching trash:', err);
    }
  }, []);

  const restoreNote = async (id: number) => {
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

  const restoreDrawing = async (id: number) => {
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

  const restoreFlowchart = async (id: number) => {
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
    restoreFlowchart
  };
}
