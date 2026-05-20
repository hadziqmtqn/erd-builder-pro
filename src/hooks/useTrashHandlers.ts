import { useCallback } from 'react';
import { toast } from 'sonner';

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
  trashData: { projects: any[] };
}

/** Check if the given document's project is also in the trash, and show a blocking warning toast if so. Returns true if the restore should be blocked. */
function warnIfProjectDeleted(file: any, deletedProjects: any[]): boolean {
  if (!file?.project_id || !deletedProjects?.length) return false;
  const deletedProject = deletedProjects.find(
    (p: any) => String(p.id) === String(file.project_id) || String(p.uid) === String(file.project_id)
  );
  if (deletedProject) {
    const projectName = deletedProject.name || 'Unknown';
    const fileName = file.name || file.title || '';
    toast.warning(
      `"${fileName}" belongs to "${projectName}" which is also in the trash. ` +
      `Restore "${projectName}" first, then restore this file.`,
      { duration: 6000 }
    );
    return true;
  }
  return false;
}

export function useTrashHandlers(params: UseTrashHandlersParams) {
  const {
    restoreProject, restoreDiagram, restoreNote, restoreDrawing, restoreFlowchart,
    fetchTrash, fetchProjects, fetchDiagrams, fetchNotes, fetchDrawings, fetchFlowcharts,
    debouncedSearchQuery,
    setItemToDelete, setIsPermanentDeleteConfirmOpen,
    trashData,
  } = params;

  const deletedProjects = trashData?.projects || [];

  const handleTrashRestoreProject = useCallback(async (id: any) => {
    await restoreProject(id);
    await fetchTrash();
    await fetchProjects();
  }, [restoreProject, fetchTrash, fetchProjects]);

  /** Restore a diagram, warning if its project is also deleted. Accepts file object or numeric ID. */
  const handleTrashRestoreDiagram = useCallback(async (file: any) => {
    const id = typeof file === 'object' ? file.id : file;
    if (warnIfProjectDeleted(file, deletedProjects)) return;
    await restoreDiagram(id);
    await fetchTrash();
    await fetchProjects();
    await fetchDiagrams(false, 'all', debouncedSearchQuery, null, 50, undefined, { silent: true });
  }, [restoreDiagram, fetchTrash, fetchProjects, fetchDiagrams, debouncedSearchQuery, deletedProjects]);

  /** Restore a note, warning if its project is also deleted. Accepts file object or numeric ID. */
  const handleTrashRestoreNote = useCallback(async (file: any) => {
    const id = typeof file === 'object' ? (file.uid ?? file.id) : file;
    if (warnIfProjectDeleted(file, deletedProjects)) return;
    await restoreNote(id);
    await fetchTrash();
    await fetchProjects();
    await fetchNotes(false, 'all', debouncedSearchQuery, null, 50, undefined, { silent: true });
  }, [restoreNote, fetchTrash, fetchProjects, fetchNotes, debouncedSearchQuery, deletedProjects]);

  /** Restore a drawing, warning if its project is also deleted. Accepts file object or numeric ID. */
  const handleTrashRestoreDrawing = useCallback(async (file: any) => {
    const id = typeof file === 'object' ? (file.uid ?? file.id) : file;
    if (warnIfProjectDeleted(file, deletedProjects)) return;
    await restoreDrawing(id);
    await fetchTrash();
    await fetchProjects();
    await fetchDrawings(false, 'all', debouncedSearchQuery, null, 50, undefined, { silent: true });
  }, [restoreDrawing, fetchTrash, fetchProjects, fetchDrawings, debouncedSearchQuery, deletedProjects]);

  /** Restore a flowchart, warning if its project is also deleted. Accepts file object or numeric ID. */
  const handleTrashRestoreFlowchart = useCallback(async (file: any) => {
    const id = typeof file === 'object' ? (file.uid ?? file.id) : file;
    if (warnIfProjectDeleted(file, deletedProjects)) return;
    await restoreFlowchart(id);
    await fetchTrash();
    await fetchProjects();
    await fetchFlowcharts(false, 'all', debouncedSearchQuery, null, 50, undefined, { silent: true });
  }, [restoreFlowchart, fetchTrash, fetchProjects, fetchFlowcharts, debouncedSearchQuery, deletedProjects]);

  const handleTrashProjectPermanentDelete = useCallback((file: any) => {
    const id = typeof file === 'object' ? file.id : file;
    setItemToDelete({ id, type: 'project' });
    setIsPermanentDeleteConfirmOpen(true);
  }, [setItemToDelete, setIsPermanentDeleteConfirmOpen]);

  const handleTrashDiagramPermanentDelete = useCallback((file: any) => {
    const id = typeof file === 'object' ? file.id : file;
    const uid = typeof file === 'object' ? file.uid : undefined;
    setItemToDelete({ id, uid, type: 'erd' });
    setIsPermanentDeleteConfirmOpen(true);
  }, [setItemToDelete, setIsPermanentDeleteConfirmOpen]);

  const handleTrashNotePermanentDelete = useCallback((file: any) => {
    const id = typeof file === 'object' ? file.id : file;
    const uid = typeof file === 'object' ? file.uid : undefined;
    setItemToDelete({ id, uid, type: 'notes' });
    setIsPermanentDeleteConfirmOpen(true);
  }, [setItemToDelete, setIsPermanentDeleteConfirmOpen]);

  const handleTrashDrawingPermanentDelete = useCallback((file: any) => {
    const id = typeof file === 'object' ? file.id : file;
    const uid = typeof file === 'object' ? file.uid : undefined;
    setItemToDelete({ id, uid, type: 'drawings' });
    setIsPermanentDeleteConfirmOpen(true);
  }, [setItemToDelete, setIsPermanentDeleteConfirmOpen]);

  const handleTrashFlowchartPermanentDelete = useCallback((file: any) => {
    const id = typeof file === 'object' ? file.id : file;
    const uid = typeof file === 'object' ? file.uid : undefined;
    setItemToDelete({ id, uid, type: 'flowchart' as any });
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
