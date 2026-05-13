import { useCallback } from 'react';

export interface UseTrashHandlersParams {
  restoreProject: (id: any) => Promise<void>;
  restoreDiagram: (id: any) => Promise<void>;
  restoreNote: (id: any) => Promise<void>;
  restoreDrawing: (id: any) => Promise<void>;
  restoreFlowchart: (id: any) => Promise<void>;
  fetchTrash: () => Promise<void>;
  fetchProjects: (loadMore?: boolean, searchQuery?: string) => Promise<void>;
  fetchDiagrams: (...args: any[]) => Promise<void>;
  fetchNotes: (...args: any[]) => Promise<void>;
  fetchDrawings: (...args: any[]) => Promise<void>;
  fetchFlowcharts: (...args: any[]) => Promise<void>;
  debouncedSearchQuery: string;
  setItemToDelete: (value: any) => void;
  setIsPermanentDeleteConfirmOpen: (open: boolean) => void;
}

export function useTrashHandlers(params: UseTrashHandlersParams) {
  const {
    restoreProject, restoreDiagram, restoreNote, restoreDrawing, restoreFlowchart,
    fetchTrash, fetchProjects, fetchDiagrams, fetchNotes, fetchDrawings, fetchFlowcharts,
    debouncedSearchQuery,
    setItemToDelete, setIsPermanentDeleteConfirmOpen,
  } = params;

  const handleTrashRestoreProject = useCallback(async (id: any) => {
    await restoreProject(id);
    await fetchTrash();
    await fetchProjects();
  }, [restoreProject, fetchTrash, fetchProjects]);

  const handleTrashRestoreDiagram = useCallback(async (id: any) => {
    await restoreDiagram(id);
    await fetchTrash();
    await fetchProjects();
    await fetchDiagrams(false, 'all', debouncedSearchQuery, null, 50, undefined, { silent: true });
  }, [restoreDiagram, fetchTrash, fetchProjects, fetchDiagrams, debouncedSearchQuery]);

  const handleTrashRestoreNote = useCallback(async (id: any) => {
    await restoreNote(id);
    await fetchTrash();
    await fetchProjects();
    await fetchNotes(false, 'all', debouncedSearchQuery, null, 50, undefined, { silent: true });
  }, [restoreNote, fetchTrash, fetchProjects, fetchNotes, debouncedSearchQuery]);

  const handleTrashRestoreDrawing = useCallback(async (id: any) => {
    await restoreDrawing(id);
    await fetchTrash();
    await fetchProjects();
    await fetchDrawings(false, 'all', debouncedSearchQuery, null, 50, undefined, { silent: true });
  }, [restoreDrawing, fetchTrash, fetchProjects, fetchDrawings, debouncedSearchQuery]);

  const handleTrashRestoreFlowchart = useCallback(async (id: any) => {
    await restoreFlowchart(id);
    await fetchTrash();
    await fetchProjects();
    await fetchFlowcharts(false, 'all', debouncedSearchQuery, null, 50, undefined, { silent: true });
  }, [restoreFlowchart, fetchTrash, fetchProjects, fetchFlowcharts, debouncedSearchQuery]);

  const handleTrashProjectPermanentDelete = useCallback((id: any) => {
    setItemToDelete({ id, type: 'project' });
    setIsPermanentDeleteConfirmOpen(true);
  }, [setItemToDelete, setIsPermanentDeleteConfirmOpen]);

  const handleTrashDiagramPermanentDelete = useCallback((id: any) => {
    setItemToDelete({ id, type: 'erd' });
    setIsPermanentDeleteConfirmOpen(true);
  }, [setItemToDelete, setIsPermanentDeleteConfirmOpen]);

  const handleTrashNotePermanentDelete = useCallback((id: any) => {
    setItemToDelete({ id, type: 'notes' });
    setIsPermanentDeleteConfirmOpen(true);
  }, [setItemToDelete, setIsPermanentDeleteConfirmOpen]);

  const handleTrashDrawingPermanentDelete = useCallback((id: any) => {
    setItemToDelete({ id, type: 'drawings' });
    setIsPermanentDeleteConfirmOpen(true);
  }, [setItemToDelete, setIsPermanentDeleteConfirmOpen]);

  const handleTrashFlowchartPermanentDelete = useCallback((id: any) => {
    setItemToDelete({ id, type: 'flowchart' as any });
    setIsPermanentDeleteConfirmOpen(true);
  }, [setItemToDelete, setIsPermanentDeleteConfirmOpen]);

  return {
    handleTrashRestoreProject,
    handleTrashRestoreDiagram,
    handleTrashRestoreNote,
    handleTrashRestoreDrawing,
    handleTrashRestoreFlowchart,
    handleTrashProjectPermanentDelete,
    handleTrashDiagramPermanentDelete,
    handleTrashNotePermanentDelete,
    handleTrashDrawingPermanentDelete,
    handleTrashFlowchartPermanentDelete,
  };
}
