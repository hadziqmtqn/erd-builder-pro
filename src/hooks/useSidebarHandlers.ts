import { useCallback } from 'react';

export interface UseSidebarHandlersParams {
  createDiagram: (n: string, pid?: number | string | null) => Promise<any>;
  updateDiagram: (id: number | string, n: string, opts?: any) => Promise<any>;
  deleteDiagram: (id: number | string) => Promise<any>;
  createNote: (t: string, pid?: number | string | null) => Promise<any>;
  updateNote: (uid: string, t: string, opts?: any) => Promise<any>;
  deleteNote: (uid: string) => Promise<any>;
  createDrawing: (t: string, pid?: number | string | null) => Promise<any>;
  updateDrawing: (id: number | string, t: string, opts?: any) => Promise<any>;
  deleteDrawing: (id: number | string) => Promise<any>;
  createFlowchart: (t: string, pid?: number | string | null) => Promise<any>;
  updateFlowchart: (id: number | string, t: string, opts?: any) => Promise<any>;
  deleteFlowchart: (id: number | string) => Promise<any>;
  createProject: (n: string) => Promise<any>;
  updateProject: (id: number | string, n: string) => Promise<any>;
  deleteProject: (id: number | string) => Promise<any>;
  moveDiagramToProject: (id: number | string, pid: number | string | null, opts?: any) => Promise<any>;
  moveNoteToProject: (uid: string, pid: number | string | null, opts?: any) => Promise<any>;
  moveDrawingToProject: (id: number | string, pid: number | string | null, opts?: any) => Promise<any>;
  moveFlowchartToProject: (id: number | string, pid: number | string | null, opts?: any) => Promise<any>;
  fetchProjects: (loadMore?: boolean, searchQuery?: string) => Promise<void>;
  fetchDiagrams: (loadMore?: boolean, projectId?: any, searchQuery?: string) => Promise<void>;
  fetchNotes: (loadMore?: boolean, projectId?: any, searchQuery?: string) => Promise<void>;
  fetchDrawings: (loadMore?: boolean, projectId?: any, searchQuery?: string) => Promise<void>;
  fetchFlowcharts: (loadMore?: boolean, projectId?: any, searchQuery?: string) => Promise<void>;
  fetchTrash: () => Promise<void>;
  handleDiagramSelect: (id: any) => void;
  handleNoteSelect: (id: any) => void;
  handleDrawingSelect: (id: any) => void;
  handleFlowchartSelect: (id: any) => void;
  searchQuery: string;
  activeProjectId: number | string | null;
  notesRef: React.MutableRefObject<any[]>;
  copyMarkdownToClipboard: (content: string) => Promise<void>;
  setIsImportNoteModalOpen: (open: boolean) => void;
  setIsExportNoteModalOpen: (open: boolean) => void;
}

export function useSidebarHandlers(params: UseSidebarHandlersParams) {
  const {
    createDiagram, updateDiagram, deleteDiagram,
    createNote, updateNote, deleteNote,
    createDrawing, updateDrawing, deleteDrawing,
    createFlowchart, updateFlowchart, deleteFlowchart,
    createProject, updateProject, deleteProject,
    moveDiagramToProject, moveNoteToProject, moveDrawingToProject, moveFlowchartToProject,
    fetchProjects, fetchDiagrams, fetchNotes, fetchDrawings, fetchFlowcharts, fetchTrash,
    handleDiagramSelect, handleNoteSelect, handleDrawingSelect, handleFlowchartSelect,
    searchQuery, activeProjectId,
    notesRef, copyMarkdownToClipboard,
    setIsImportNoteModalOpen, setIsExportNoteModalOpen,
  } = params;

  const handleSidebarDiagramCreate = useCallback(async (n: string, pid?: number | string | null) => {
    const d = await createDiagram(n, pid);
    if (d) {
      await fetchProjects();
      handleDiagramSelect(d.id);
    }
  }, [createDiagram, fetchProjects, handleDiagramSelect]);

  const handleSidebarNoteCreate = useCallback(async (t: string, pid?: number | string | null) => {
    const n = await createNote(t, pid);
    if (n) {
      await fetchProjects();
      handleNoteSelect(n.uid);
    }
  }, [createNote, fetchProjects, handleNoteSelect]);

  const handleSidebarDrawingCreate = useCallback(async (t: string, pid?: number | string | null) => {
    const d = await createDrawing(t, pid);
    if (d) {
      await fetchProjects();
      handleDrawingSelect(d.id);
    }
  }, [createDrawing, fetchProjects, handleDrawingSelect]);

  const handleSidebarFlowchartCreate = useCallback(async (t: string, pid?: number | string | null) => {
    const f = await createFlowchart(t, pid);
    if (f) {
      await fetchProjects();
      handleFlowchartSelect(f.id);
    }
  }, [createFlowchart, fetchProjects, handleFlowchartSelect]);

  const handleSidebarProjectCreate = useCallback(async (n: string) => {
    await createProject(n);
    await fetchProjects();
  }, [createProject, fetchProjects]);

  const handleSidebarProjectUpdate = useCallback(async (id: number | string, n: string) => {
    await updateProject(id, n);
    await fetchProjects();
  }, [updateProject, fetchProjects]);

  const handleSidebarProjectDelete = useCallback(async (id: number | string) => {
    await deleteProject(id);
    await fetchTrash();
    await fetchProjects();
  }, [deleteProject, fetchTrash, fetchProjects]);

  const handleSidebarDiagramUpdate = useCallback(async (id: number | string, n: string, opts?: any) => {
    await updateDiagram(id, n, opts);
    await fetchProjects();
  }, [updateDiagram, fetchProjects]);

  const handleSidebarNoteUpdate = useCallback(async (id: number | string, t: string, opts?: any) => {
    await updateNote(String(id), t, opts);
    await fetchProjects();
  }, [updateNote, fetchProjects]);

  const handleSidebarDrawingUpdate = useCallback(async (id: number | string, t: string, opts?: any) => {
    await updateDrawing(id, t, opts);
    await fetchProjects();
  }, [updateDrawing, fetchProjects]);

  const handleSidebarFlowchartUpdate = useCallback(async (id: number | string, t: string, opts?: any) => {
    await updateFlowchart(id, t, opts);
    await fetchProjects();
  }, [updateFlowchart, fetchProjects]);

  const handleSidebarDiagramDelete = useCallback(async (id: number | string) => {
    await deleteDiagram(id);
    await fetchTrash();
    await fetchProjects();
  }, [deleteDiagram, fetchTrash, fetchProjects]);

  const handleSidebarNoteDelete = useCallback(async (id: number | string) => {
    await deleteNote(String(id));
    await fetchTrash();
    await fetchProjects();
  }, [deleteNote, fetchTrash, fetchProjects]);

  const handleSidebarDrawingDelete = useCallback(async (id: number | string) => {
    await deleteDrawing(id);
    await fetchTrash();
    await fetchProjects();
  }, [deleteDrawing, fetchTrash, fetchProjects]);

  const handleSidebarFlowchartDelete = useCallback(async (id: number | string) => {
    await deleteFlowchart(id);
    await fetchTrash();
    await fetchProjects();
  }, [deleteFlowchart, fetchTrash, fetchProjects]);

  const handleSidebarMoveDiagramToProject = useCallback(async (id: number | string, pid: number | string | null, opts?: any) => {
    await moveDiagramToProject(id, pid, opts);
    await fetchProjects();
  }, [moveDiagramToProject, fetchProjects]);

  const handleSidebarMoveNoteToProject = useCallback(async (id: number | string, pid: number | string | null, opts?: any) => {
    await moveNoteToProject(String(id), pid, opts);
    await fetchProjects();
  }, [moveNoteToProject, fetchProjects]);

  const handleSidebarMoveDrawingToProject = useCallback(async (id: number | string, pid: number | string | null, opts?: any) => {
    await moveDrawingToProject(id, pid, opts);
    await fetchProjects();
  }, [moveDrawingToProject, fetchProjects]);

  const handleSidebarMoveFlowchartToProject = useCallback(async (id: number | string, pid: number | string | null, opts?: any) => {
    await moveFlowchartToProject(id, pid, opts);
    await fetchProjects();
  }, [moveFlowchartToProject, fetchProjects]);

  const handleSidebarLoadMoreProjects = useCallback(() => fetchProjects(true, searchQuery), [fetchProjects, searchQuery]);
  const handleSidebarLoadMoreDiagrams = useCallback(
    () => fetchDiagrams(true, activeProjectId === null ? 'all' : activeProjectId, searchQuery),
    [fetchDiagrams, activeProjectId, searchQuery],
  );
  const handleSidebarLoadMoreNotes = useCallback(
    () => fetchNotes(true, activeProjectId === null ? 'all' : activeProjectId, searchQuery),
    [fetchNotes, activeProjectId, searchQuery],
  );
  const handleSidebarLoadMoreDrawings = useCallback(
    () => fetchDrawings(true, activeProjectId === null ? 'all' : activeProjectId, searchQuery),
    [fetchDrawings, activeProjectId, searchQuery],
  );
  const handleSidebarLoadMoreFlowcharts = useCallback(
    () => fetchFlowcharts(true, activeProjectId === null ? 'all' : activeProjectId, searchQuery),
    [fetchFlowcharts, activeProjectId, searchQuery],
  );

  const handleSidebarNoteCopyMarkdown = useCallback(async (id: number | string) => {
    const note = notesRef.current.find((n: any) => String(n.uid) === String(id));
    if (note) await copyMarkdownToClipboard(note.content || '');
  }, [notesRef, copyMarkdownToClipboard]);

  const handleSidebarNoteImportMarkdown = useCallback((id: number | string) => {
    handleNoteSelect(id);
    setTimeout(() => setIsImportNoteModalOpen(true), 100);
  }, [handleNoteSelect, setIsImportNoteModalOpen]);

  const handleSidebarNoteExportMarkdown = useCallback((id: number | string) => {
    handleNoteSelect(id);
    setTimeout(() => setIsExportNoteModalOpen(true), 100);
  }, [handleNoteSelect, setIsExportNoteModalOpen]);

  return {
    handleSidebarDiagramCreate,
    handleSidebarNoteCreate,
    handleSidebarDrawingCreate,
    handleSidebarFlowchartCreate,
    handleSidebarProjectCreate,
    handleSidebarProjectUpdate,
    handleSidebarProjectDelete,
    handleSidebarDiagramUpdate,
    handleSidebarNoteUpdate,
    handleSidebarDrawingUpdate,
    handleSidebarFlowchartUpdate,
    handleSidebarDiagramDelete,
    handleSidebarNoteDelete,
    handleSidebarDrawingDelete,
    handleSidebarFlowchartDelete,
    handleSidebarMoveDiagramToProject,
    handleSidebarMoveNoteToProject,
    handleSidebarMoveDrawingToProject,
    handleSidebarMoveFlowchartToProject,
    handleSidebarLoadMoreProjects,
    handleSidebarLoadMoreDiagrams,
    handleSidebarLoadMoreNotes,
    handleSidebarLoadMoreDrawings,
    handleSidebarLoadMoreFlowcharts,
    handleSidebarNoteCopyMarkdown,
    handleSidebarNoteImportMarkdown,
    handleSidebarNoteExportMarkdown,
  };
}
