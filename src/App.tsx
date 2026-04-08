import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { 
  Edge, 
  Node,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Components
import { AppSidebar } from './components/app-sidebar';
import { Login } from './components/Login';
import { MainHeader } from './components/MainHeader';
import { DeleteConfirmModal } from './components/modals/DeleteConfirmModal';
import PropertiesPanel from './components/PropertiesPanel';
import RelationshipPropertiesPanel from './components/RelationshipPropertiesPanel';

// Views
import { ERDView } from './components/views/ERDView';
import { NotesView } from './components/views/NotesView';
import { DrawingsView } from './components/views/DrawingsView';
import { TrashView } from './components/views/TrashView';
import { WelcomeView } from './components/views/WelcomeView';
import { FlowchartView } from './components/views/FlowchartView';
import { ForbiddenView } from "./components/views/ForbiddenView";

// Layout Components
import { OfflineOverlay } from './components/layout/OfflineOverlay';
import { AppInitialization } from './components/layout/AppInitialization';

// Hooks
import { useAuth } from './hooks/useAuth';
import { useFiles } from './hooks/useFiles';
import { useNotes } from './hooks/useNotes';
import { useProjects } from './hooks/useProjects';
import { useDrawings } from './hooks/useDrawings';
import { useFlowcharts } from './hooks/useFlowcharts';
import { useTrash } from './hooks/useTrash';
import { useConnectionStatus } from './hooks/useConnectionStatus';
import { useSyncService } from './hooks/useSyncService';
import { usePWAInstall } from './hooks/usePWAInstall';
import { usePublicDocument } from './hooks/usePublicDocument';
import { useERDSession } from './hooks/useERDSession';
import { useSQLGenerator } from './hooks/useSQLGenerator';

// Lib & Types
import { localPersistence } from './lib/localPersistence';
import { toast } from 'sonner';
import { Entity, DraftType } from './types';

// UI
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';


// Helper to check for share routes
const getSharePathInfo = () => {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  const match = path.match(/^\/share\/(erd|notes|drawings|flowchart)\/([^/]+)/);
  if (match) {
    return { type: match[1] as any, uid: match[2] };
  }
  return null;
};

function AppContent() {
  const [view, setView] = useState<'erd' | 'notes' | 'drawings' | 'trash' | 'flowchart'>('notes');
  const [sidebarView, setSidebarView] = useState<'erd' | 'notes' | 'drawings' | 'flowchart'>('notes');
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isPermanentDeleteConfirmOpen, setIsPermanentDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number | string, type: 'erd' | 'notes' | 'drawings' | 'project' } | null>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  
  // Custom Hooks
  const { isAuthenticated, isGuest, user, checkAuth, handleGuestLogin, handleLogout } = useAuth();
  const isOnline = useConnectionStatus();
  useSyncService(isAuthenticated, isGuest);
  const { isInstallable, installApp } = usePWAInstall();
  const { handleExportSQL } = useSQLGenerator();

  // ERD Session Hook
  const { 
    nodes, setNodes, onNodesChange,
    edges, setEdges, onEdgesChange,
    selectedNodeId, setSelectedNodeId,
    selectedEdgeId, setSelectedEdgeId,
    onConnect, addEntity, updateEntity, deleteEntity, handleEdgeUpdate, deleteEdge,
    handleFileSelect: selectFile, viewportRef
  } = useERDSession(false, isGuest, isAuthenticated, setView);

  // Public Document Hook
  const {
    isPublicView, setIsPublicView, publicData, isPublicLoading, forbiddenDoc, fetchPublicDocument
  } = usePublicDocument(setView, setNodes, setEdges);

  // Domain Hooks
  const { 
    files, activeFileId, setActiveFileId, saveStatus,
    fetchFiles, createFile, updateFile, deleteFile, restoreFile, deleteFilePermanent, moveFileToProject, saveDiagram,
    hasMoreFiles
  } = useFiles(isAuthenticated, view, isGuest);

  const { 
    notes, setNotesList, activeNoteId, setActiveNoteId, fetchNotes, createNote, updateNote, deleteNote, moveNoteToProject, saveNote, restoreNote, deleteNotePermanent,
    hasMoreNotes, saveStatus: notesSaveStatus
  } = useNotes(isGuest);
  
  const { 
    projects, activeProjectId, setActiveProjectId, fetchProjects, createProject, updateProject, deleteProject, restoreProject, deleteProjectPermanent,
    hasMoreProjects
  } = useProjects(isGuest);
  
  const { 
    drawings, setDrawings, activeDrawingId, setActiveDrawingId, fetchDrawings, createDrawing, updateDrawing, deleteDrawing, moveDrawingToProject, saveDrawing, restoreDrawing, deleteDrawingPermanent,
    hasMoreDrawings, saveStatus: drawingsSaveStatus
  } = useDrawings(isGuest);

  const {
    flowcharts, setFlowcharts, activeFlowchartId, setActiveFlowchartId, fetchFlowcharts, createFlowchart, updateFlowchart, deleteFlowchart, moveFlowchartToProject, saveFlowchart, restoreFlowchart, deleteFlowchartPermanent,
    hasMoreFlowcharts, saveStatus: flowchartsSaveStatus
  } = useFlowcharts(isGuest);

  const { trashData, fetchTrash } = useTrash(isGuest);

  // Computed Values
  const currentActiveId = useMemo(() => {
    if (isPublicView) return undefined;
    const viewMap = { erd: activeFileId, notes: activeNoteId, drawings: activeDrawingId, flowchart: activeFlowchartId };
    return viewMap[view as keyof typeof viewMap];
  }, [view, isPublicView, activeFileId, activeNoteId, activeDrawingId, activeFlowchartId]);

  const initialShareSettings = useMemo(() => {
    if (isPublicView) return publicData ? { is_public: !!publicData.is_public, share_token: publicData.share_token, expiry_date: publicData.expiry_date } : undefined;
    const docArr = view === 'erd' ? files : view === 'notes' ? notes : view === 'drawings' ? drawings : flowcharts;
    const id = view === 'erd' ? activeFileId : view === 'notes' ? activeNoteId : view === 'drawings' ? activeDrawingId : activeFlowchartId;
    // @ts-ignore
    const doc = docArr.find(d => d.id === id);
    if (!doc) return undefined;
    return { is_public: !!doc.is_public, share_token: doc.share_token, expiry_date: doc.expiry_date };
  }, [view, isPublicView, publicData, files, notes, drawings, flowcharts, activeFileId, activeNoteId, activeDrawingId, activeFlowchartId]);

  const currentSaveStatus = useMemo(() => {
    const statusMap = { erd: saveStatus, notes: notesSaveStatus, drawings: drawingsSaveStatus, flowchart: flowchartsSaveStatus };
    return statusMap[view as keyof typeof statusMap] || 'idle';
  }, [view, saveStatus, notesSaveStatus, drawingsSaveStatus, flowchartsSaveStatus]);

  const hasActiveItem = useMemo(() => {
    const activeMap = { erd: !!activeFileId, notes: !!activeNoteId, drawings: !!activeDrawingId, flowchart: !!activeFlowchartId };
    return activeMap[view as keyof typeof activeMap] || false;
  }, [view, activeFileId, activeNoteId, activeDrawingId, activeFlowchartId]);

  const selectedEntity = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find((n) => n.id === selectedNodeId);
    return node ? (node.data as Entity) : null;
  }, [nodes, selectedNodeId]);

  // Effects
  useEffect(() => {
    const shareInfo = getSharePathInfo();
    if (shareInfo) {
      setIsPublicView(true);
      const savedToken = sessionStorage.getItem(`share_token_${shareInfo.uid}`);
      fetchPublicDocument(shareInfo.type, shareInfo.uid, savedToken || undefined);
    }

    if (isInstallable) {
      const hasSeenToast = sessionStorage.getItem('pwa-install-toast-shown');
      if (!hasSeenToast) {
        toast("✨ Enhance your experience", {
          description: "Install ERD Builder Pro as a desktop app for offline access and better performance.",
          action: { label: "Install", onClick: () => installApp() },
          duration: 10000,
        });
        sessionStorage.setItem('pwa-install-toast-shown', 'true');
      }
    }
  }, [isInstallable, installApp]);

  useEffect(() => {
    if (!isOnline && !isPublicView) {
      if (view === 'erd' && activeFileId) saveDiagram(nodes, edges, viewportRef.current);
      else if (view === 'notes' && activeNoteId) { const n = notes.find(n => n.id === activeNoteId); if (n) saveNote(n); }
      else if (view === 'drawings' && activeDrawingId) { const d = drawings.find(d => d.id === activeDrawingId); if (d) saveDrawing(d); }
      else if (view === 'flowchart' && activeFlowchartId) { const f = flowcharts.find(f => f.id === activeFlowchartId); if (f) saveFlowchart(f); }
    }
  }, [isOnline, view, activeFileId, activeNoteId, activeDrawingId, activeFlowchartId, nodes, edges]);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');
    if (isAuthenticated && !isPublicView) {
      fetchProjects(false, debouncedSearchQuery);
      fetchTrash();
    }
  }, [isAuthenticated, fetchProjects, fetchTrash, debouncedSearchQuery, isPublicView]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (isAuthenticated && !isPublicView) {
      const pid = activeProjectId === null ? 'all' : activeProjectId;
      // @ts-ignore
      fetchFiles(false, pid, debouncedSearchQuery);
      // @ts-ignore
      fetchNotes(false, pid, debouncedSearchQuery);
      // @ts-ignore
      fetchDrawings(false, pid, debouncedSearchQuery);
      // @ts-ignore
      fetchFlowcharts(false, pid, debouncedSearchQuery);
    }
  }, [isAuthenticated, activeProjectId, debouncedSearchQuery, fetchFiles, fetchNotes, fetchDrawings, fetchFlowcharts, isPublicView]);

  // ERD Auto-save
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (activeFileId && isAuthenticated && view === 'erd' && !isPublicView) {
      saveTimeoutRef.current = setTimeout(() => saveDiagram(nodes, edges, viewportRef.current), 3000);
    }
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [nodes, edges, activeFileId, isAuthenticated, view, saveDiagram, isPublicView]);

  // Handlers
  const handleFileSelect = (id: number | string) => selectFile(id, setActiveFileId);
  const handleEditEntity = useCallback((e: any) => setSelectedNodeId(e.detail), [setSelectedNodeId]);
  const handleDeleteEntity = useCallback((e: any) => deleteEntity(e.detail), [deleteEntity]);

  useEffect(() => {
    window.addEventListener('editEntity', handleEditEntity);
    window.addEventListener('deleteEntity', handleDeleteEntity);
    return () => {
      window.removeEventListener('editEntity', handleEditEntity);
      window.removeEventListener('deleteEntity', handleDeleteEntity);
    };
  }, [handleEditEntity, handleDeleteEntity]);

  const handleSelectionSelect = async (id: number | string) => {
    if (view === 'notes') {
      const note = notes.find(n => n.id === id);
      if (note?.is_deleted) return;
      const draft = await localPersistence.getDraft(DraftType.NOTES, id);
      if (draft && draft.sync_pending) {
        try {
          const parsed = JSON.parse(draft.data);
          setNotesList(prev => prev.map(n => n.id === id ? { ...n, content: parsed.content } : n));
          toast.info("Loaded unsynced local note draft");
        } catch (e) {}
      }
      setActiveNoteId(id);
    } else if (view === 'drawings') {
      if (isGuest) {
        const localData = await localPersistence.getResource(id);
        if (!localData || localData.is_deleted) return;
        setActiveDrawingId(id);
      } else {
        fetch(`/api/drawings/${id}`).then(res => { if (res.ok) res.json().then(d => { if (!d.is_deleted) setActiveDrawingId(id); }); });
      }
    } else if (view === 'flowchart') {
      if (isGuest) {
        const localData = await localPersistence.getResource(id);
        if (!localData || localData.is_deleted) return;
        setActiveFlowchartId(id);
      } else {
        fetch(`/api/flowcharts/${id}`).then(res => { if (res.ok) res.json().then(f => { if (!f.is_deleted) setActiveFlowchartId(id); }); });
      }
    }
  };

  const handleNoteChange = useCallback((content: string) => {
    if (!activeNoteId) return;
    setNotesList(prev => prev.map(n => n.id === activeNoteId ? { ...n, content } : n));
    saveNote({
      id: activeNoteId, content, title: notes.find(n => n.id === activeNoteId)?.title || '',
      project_id: notes.find(n => n.id === activeNoteId)?.project_id || null
    } as any);
  }, [activeNoteId, notes, saveNote, setNotesList]);

  const handleDrawingChange = useCallback((data: string) => {
    if (!activeDrawingId) return;
    setDrawings(prev => prev.map(d => d.id === activeDrawingId ? { ...d, data } : d));
    saveDrawing({
      id: activeDrawingId, data, title: drawings.find(d => d.id === activeDrawingId)?.title || '',
      project_id: drawings.find(d => d.id === activeDrawingId)?.project_id || null
    } as any);
  }, [activeDrawingId, drawings, saveDrawing, setDrawings]);
  
  const handleFlowchartChange = useCallback((nodesData: any[], edgesData: any[]) => {
    if (!activeFlowchartId) return;
    const dataString = JSON.stringify({ nodes: nodesData, edges: edgesData });
    setFlowcharts(prev => prev.map(f => f.id === activeFlowchartId ? { ...f, data: dataString } : f));
    saveFlowchart({
      id: activeFlowchartId, data: dataString, title: flowcharts.find(f => f.id === activeFlowchartId)?.title || '',
      project_id: flowcharts.find(f => f.id === activeFlowchartId)?.project_id || null
    } as any);
  }, [activeFlowchartId, flowcharts, saveFlowchart, setFlowcharts]);

  const handleViewChange = (newView: typeof view) => {
    if (!isOnline && !isPublicView) {
      toast.error("Offline Mode: Navigation is disabled.", { duration: 5000 });
      return;
    }
    setView(newView);
    if (newView !== 'trash') setSidebarView(newView);
  };

  const confirmPermanentDelete = async () => {
    if (itemToDelete) {
      const { id, type } = itemToDelete;
      if (type === 'project') await deleteProjectPermanent(id);
      else if (type === 'erd') await deleteFilePermanent(id);
      else if (type === 'notes') await deleteNotePermanent(id);
      else if (type === 'drawings') await deleteDrawingPermanent(id);
      else if (type === 'project' as any) await deleteFlowchartPermanent(id);
      setIsPermanentDeleteConfirmOpen(false);
      setItemToDelete(null);
      fetchTrash();
    }
  };

  const activeNote = isPublicView ? publicData : notes.find(n => n.id === activeNoteId);
  const activeDrawing = isPublicView ? publicData : drawings.find(d => d.id === activeDrawingId);
  const activeFlowchart = isPublicView ? publicData : flowcharts.find(f => f.id === activeFlowchartId);
  const activeFile = isPublicView ? publicData : files.find(f => f.id === activeFileId);
  
  const featureLabel = isPublicView ? `Public Shared ${view}` : (view === 'erd' ? 'Diagrams' : view === 'notes' ? 'Notes' : view === 'drawings' ? 'Drawings' : view === 'flowchart' ? 'Flowcharts' : 'Trash Bin');
  const activeFileName = isPublicView ? (publicData?.name || publicData?.title || 'Shared Document') : (view === 'erd' ? activeFile?.name : view === 'notes' ? activeNote?.title : view === 'drawings' ? activeDrawing?.title : view === 'flowchart' ? activeFlowchart?.title : null);
  const activeProjectName = isPublicView ? publicData?.projects?.name : (view === 'erd' ? activeFile?.projects?.name : view === 'notes' ? activeNote?.projects?.name : view === 'drawings' ? activeDrawing?.projects?.name : view === 'flowchart' ? activeFlowchart?.projects?.name : null);
  const activeFileUid = isPublicView ? publicData?.uid : (view === 'erd' ? activeFile?.uid : view === 'notes' ? activeNote?.uid : view === 'drawings' ? activeDrawing?.uid : view === 'flowchart' ? activeFlowchart?.uid : undefined);

  if (isAuthenticated === null && !isPublicView) return <AppInitialization type="init" />;
  if (isPublicLoading) return <AppInitialization type="public" view={view} />;

  if (forbiddenDoc) {
    const shareInfo = getSharePathInfo();
    return (
      <ForbiddenView 
        title={forbiddenDoc.title} message={forbiddenDoc.message} statusCode={forbiddenDoc.status} documentUid={shareInfo?.uid}
        onSubmitToken={async t => { if (shareInfo) { const s = await fetchPublicDocument(shareInfo.type, shareInfo.uid, t); if (s) sessionStorage.setItem(`share_token_${shareInfo.uid}`, t); else throw new Error("Invalid token"); } }}
        onReturn={() => window.location.href = '/'}
      />
    );
  }

  if (!isAuthenticated && !isPublicView) return <Login onLogin={() => checkAuth()} onGuestLogin={handleGuestLogin} />;

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      {!isOnline && !isPublicView && <OfflineOverlay />}

      {!isPublicView && (
        <AppSidebar 
          files={files} notes={notes} drawings={drawings} flowcharts={flowcharts} projects={projects} trashData={trashData}
          activeFileId={activeFileId} activeNoteId={activeNoteId} activeDrawingId={activeDrawingId} activeFlowchartId={activeFlowchartId} activeProjectId={activeProjectId} view={view}
          onFileSelect={handleFileSelect} onNoteSelect={handleSelectionSelect} onDrawingSelect={handleSelectionSelect} onFlowchartSelect={handleSelectionSelect} onProjectSelect={setActiveProjectId}
          onFileCreate={async (n, pid) => { const f = await createFile(n, pid ? Number(pid) : null); if (f) handleFileSelect(f.id); }}
          onNoteCreate={async (t, pid) => { const n = await createNote(t, pid ? Number(pid) : null); if (n) handleSelectionSelect(n.id); }}
          onDrawingCreate={async (t, pid) => { const d = await createDrawing(t, pid ? Number(pid) : null); if (d) handleSelectionSelect(d.id); }}
          onFlowchartCreate={async (t, pid) => { const f = await createFlowchart(t, pid ? Number(pid) : null); if (f) handleSelectionSelect(f.id); }}
          onProjectCreate={createProject} onProjectUpdate={updateProject} onProjectDelete={id => { deleteProject(id); fetchTrash(); }} onProjectRestore={id => { restoreProject(id); fetchTrash(); fetchProjects(); }}
          onFileUpdate={updateFile} onNoteUpdate={updateNote} onDrawingUpdate={updateDrawing} onFlowchartUpdate={updateFlowchart}
          onFileDelete={id => { deleteFile(id); fetchTrash(); }} onNoteDelete={id => { deleteNote(id); fetchTrash(); }} onDrawingDelete={id => { deleteDrawing(id); fetchTrash(); }} onFlowchartDelete={id => { deleteFlowchart(id); fetchTrash(); }}
          onFileRestore={id => { restoreFile(id); fetchTrash(); fetchFiles(); }} onNoteRestore={id => { restoreNote(id); fetchTrash(); fetchNotes(); }} onDrawingRestore={id => { restoreDrawing(id); fetchTrash(); fetchDrawings(); }} onFlowchartRestore={id => { restoreFlowchart(id); fetchTrash(); fetchFlowcharts(); }}
          onFilePermanentDelete={id => { setItemToDelete({ id, type: 'erd' }); setIsPermanentDeleteConfirmOpen(true); }}
          onNotePermanentDelete={id => { setItemToDelete({ id, type: 'notes' }); setIsPermanentDeleteConfirmOpen(true); }}
          onDrawingPermanentDelete={id => { setItemToDelete({ id, type: 'drawings' }); setIsPermanentDeleteConfirmOpen(true); }}
          onFlowchartPermanentDelete={id => { setItemToDelete({ id, type: 'flowchart' as any }); setIsPermanentDeleteConfirmOpen(true); }}
          onProjectPermanentDelete={id => { setItemToDelete({ id, type: 'project' }); setIsPermanentDeleteConfirmOpen(true); }}
          onLogout={handleLogout} saveStatus={saveStatus}
          onMoveFileToProject={moveFileToProject} onMoveNoteToProject={moveNoteToProject} onMoveDrawingToProject={moveDrawingToProject} onMoveFlowchartToProject={moveFlowchartToProject}
          sidebarView={sidebarView} onViewChange={handleViewChange}
          hasMoreProjects={hasMoreProjects} hasMoreFiles={hasMoreFiles} hasMoreNotes={hasMoreNotes} hasMoreDrawings={hasMoreDrawings} hasMoreFlowcharts={hasMoreFlowcharts}
          onLoadMoreProjects={() => fetchProjects(true, debouncedSearchQuery)} onLoadMoreFiles={() => fetchFiles(true, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery)}
          onLoadMoreNotes={() => fetchNotes(true, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery)} onLoadMoreDrawings={() => fetchDrawings(true, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery)}
          onLoadMoreFlowcharts={() => fetchFlowcharts(true, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery)}
          searchQuery={searchQuery} onSearchChange={setSearchQuery} user={user} isOnline={isOnline} isInstallable={isInstallable} onInstall={installApp}
        />
      )}

      <SidebarInset className={isPublicView ? "w-full" : ""}>
        <MainHeader 
          featureLabel={featureLabel} activeProjectName={activeProjectName} activeFileName={activeFileName} 
          view={view as any} hasActiveItem={isPublicView ? true : hasActiveItem} 
          currentSaveStatus={isPublicView ? 'saved' : currentSaveStatus}
          activeFileUid={activeFileUid} activeFileId={currentActiveId} initialShareSettings={initialShareSettings} isPublicView={isPublicView}
          onSettingsSaved={() => { const pid = activeProjectId === null ? 'all' : activeProjectId; if (view === 'erd') fetchFiles(false, pid, debouncedSearchQuery); else if (view === 'notes') fetchNotes(false, pid, debouncedSearchQuery); else if (view === 'drawings') fetchDrawings(false, pid, debouncedSearchQuery); else if (view === 'flowchart') fetchFlowcharts(false, pid, debouncedSearchQuery); }}
          isOnline={isOnline}
        />

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 min-h-0 overflow-hidden">
          {!hasActiveItem && view !== 'trash' && !isPublicView ? <WelcomeView /> : (
            <>
              {view === 'erd' && (isPublicView ? publicData : activeFileId) && (
                <ERDView 
                  nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
                  onNodeClick={(e, n) => { if (!isPublicView && !(e.target as HTMLElement).closest('.nodrag')) setSelectedNodeId(n.id); }}
                  onEdgeClick={(_, e) => { if (!isPublicView) setSelectedEdgeId(e.id); }}
                  onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
                  onMove={(_, v) => { viewportRef.current = v; }}
                  addEntity={addEntity} handleExportSQL={dialect => {
                    const target = isPublicView ? publicData : files.find(f => f.id === activeFileId);
                    if (target) handleExportSQL(dialect, target, nodes, edges);
                  }}
                  isReadOnly={isPublicView}
                />
              )}
              {view === 'notes' && activeNote && <NotesView activeNoteId={isPublicView ? null : activeNoteId} activeNote={activeNote} saveNote={saveNote} handleNoteChange={handleNoteChange} deleteNote={deleteNote} isReadOnly={isPublicView} />}
              {view === 'drawings' && activeDrawing && <DrawingsView activeDrawingId={isPublicView ? null : activeDrawingId} activeDrawing={activeDrawing} saveDrawing={saveDrawing} handleDrawingChange={handleDrawingChange} deleteDrawing={deleteDrawing} isReadOnly={isPublicView} />}
              {view === 'flowchart' && activeFlowchart && <FlowchartView activeFlowchartId={isPublicView ? null : activeFlowchartId} activeFlowchart={activeFlowchart} handleFlowchartChange={handleFlowchartChange} isReadOnly={isPublicView} />}
            </>
          )}
          {view === 'trash' && (
            <TrashView 
              trashData={trashData} 
              restoreProject={async (id) => { await restoreProject(id); fetchTrash(); fetchProjects(); }} 
              restoreFile={async (id) => { await restoreFile(id); fetchTrash(); fetchFiles(false, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery); }} 
              restoreNote={async (id) => { await restoreNote(id); fetchTrash(); fetchNotes(false, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery); }} 
              restoreDrawing={async (id) => { await restoreDrawing(id); fetchTrash(); fetchDrawings(false, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery); }} 
              restoreFlowchart={async (id) => { await restoreFlowchart(id); fetchTrash(); fetchFlowcharts(false, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery); }} 
              fetchTrash={fetchTrash} 
              handleProjectPermanentDelete={id => { setItemToDelete({ id, type: 'project' }); setIsPermanentDeleteConfirmOpen(true); }} 
              handleFilePermanentDelete={id => { setItemToDelete({ id, type: 'erd' }); setIsPermanentDeleteConfirmOpen(true); }} 
              handleNotePermanentDelete={id => { setItemToDelete({ id, type: 'notes' }); setIsPermanentDeleteConfirmOpen(true); }} 
              handleDrawingPermanentDelete={id => { setItemToDelete({ id, type: 'drawings' }); setIsPermanentDeleteConfirmOpen(true); }} 
              handleFlowchartPermanentDelete={id => { setItemToDelete({ id, type: 'flowchart' as any }); setIsPermanentDeleteConfirmOpen(true); }} 
            />
          )}
        </div>

        <DeleteConfirmModal isOpen={isPermanentDeleteConfirmOpen} onOpenChange={setIsPermanentDeleteConfirmOpen} onConfirm={confirmPermanentDelete} onCancel={() => setItemToDelete(null)} itemType={itemToDelete?.type || ''} />

        {/* Entity Properties Modal */}
        {!isPublicView && (
          <Dialog open={!!selectedNodeId} onOpenChange={(open) => { if (!open) setSelectedNodeId(null); }}>
            <DialogContent className="sm:max-w-sm w-full border-white/10 bg-[#0f0f14] shadow-2xl">
              <DialogHeader className="shrink-0 mb-4">
                <div className="flex items-center justify-between pr-8">
                  <div className="space-y-1 text-left">
                    <DialogTitle className="text-xl font-bold tracking-tight">Table Properties</DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                      Customize your table name, theme, and column definitions.
                    </DialogDescription>
                  </div>
                  <Button 
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsDeleteAlertOpen(true)}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mr-2"
                    title="Delete Table"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </DialogHeader>
              
              <div className="-mx-4 px-4 max-h-[65vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent space-y-8">
                <PropertiesPanel 
                  selectedEntity={selectedEntity} 
                  onUpdateEntity={updateEntity} 
                  onDeleteEntity={(id) => {
                    deleteEntity(id);
                    setSelectedNodeId(null);
                  }} 
                />
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Relationship Properties Modal */}
        {!isPublicView && (
          <Dialog open={!!selectedEdgeId} onOpenChange={(open) => { if (!open) setSelectedEdgeId(null); }}>
            <DialogContent className="sm:max-w-sm w-full border-white/10 bg-[#0f0f14] shadow-2xl">
              <DialogHeader className="shrink-0 mb-2">
                <DialogTitle className="text-xl font-bold tracking-tight">Relationship Properties</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Set the cardinality between these two tables.
                </DialogDescription>
              </DialogHeader>
              <RelationshipPropertiesPanel 
                selectedEdge={edges.find(e => e.id === selectedEdgeId) || null} 
                nodes={nodes} 
                onUpdateEdge={handleEdgeUpdate} 
                onDeleteEdge={deleteEdge}
              />
            </DialogContent>
          </Dialog>
        )}

        {/* Delete Confirmation Alert */}
        <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Table</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the table "{selectedEntity?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => {
                  if (selectedEntity) {
                    deleteEntity(selectedEntity.id);
                    setSelectedNodeId(null);
                    setIsDeleteAlertOpen(false);
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppContent />
    </ReactFlowProvider>
  );
}
