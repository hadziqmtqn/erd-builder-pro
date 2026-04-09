import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { 
  Edge, 
  Node,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Components
import { AppSidebar } from './components/app-sidebar';
import { FeedbackDialog } from "@/components/FeedbackDialog"
import { Login } from './components/Login';
import { MainHeader } from './components/MainHeader';
import { DeleteConfirmModal } from './components/modals/DeleteConfirmModal';
import { ImportSQLModal } from './components/modals/ImportSQLModal';
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
import { useDiagrams } from './hooks/useDiagrams';
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
import { useUpdateCheck } from './hooks/useUpdateCheck';
import { useImageExporter } from './hooks/useImageExporter';


// Views
import { ChangelogView } from './components/views/ChangelogView';

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
  AlertDialogBody,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
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
  const [view, setView] = useState<'erd' | 'notes' | 'drawings' | 'trash' | 'flowchart' | 'changelog'>('notes');
  const [sidebarView, setSidebarView] = useState<'erd' | 'notes' | 'drawings' | 'flowchart' | 'changelog'>('notes');

  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isPermanentDeleteConfirmOpen, setIsPermanentDeleteConfirmOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
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
  const { handleExportImage } = useImageExporter();


  // ERD Session Hook
  const { 
    nodes, setNodes, onNodesChange,
    edges, setEdges, onEdgesChange,
    selectedNodeId, setSelectedNodeId,
    selectedEdgeId, setSelectedEdgeId,
    onConnect, addEntity, updateEntity, deleteEntity, handleEdgeUpdate, deleteEdge,
    handleDiagramSelect: selectDiagram, viewportRef,
    undo, redo, canUndo, canRedo, takeSnapshot
  } = useERDSession(false, isGuest, isAuthenticated, setView);


  // Public Document Hook
  const {
    isPublicView, setIsPublicView, publicData, isPublicLoading, forbiddenDoc, fetchPublicDocument
  } = usePublicDocument(setView, setNodes, setEdges);

  // Domain Hooks
  const { 
    diagrams, activeDiagramId, setActiveDiagramId, saveStatus,
    fetchDiagrams, createDiagram, updateDiagram, deleteDiagram, restoreDiagram, deleteDiagramPermanent, moveDiagramToProject, saveDiagram,
    hasMoreDiagrams
  } = useDiagrams(isAuthenticated, view, isGuest);

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
    const viewMap = { erd: activeDiagramId, notes: activeNoteId, drawings: activeDrawingId, flowchart: activeFlowchartId };
    return viewMap[view as keyof typeof viewMap];
  }, [view, isPublicView, activeDiagramId, activeNoteId, activeDrawingId, activeFlowchartId]);

  const initialShareSettings = useMemo(() => {
    if (isPublicView) return publicData ? { is_public: !!publicData.is_public, share_token: publicData.share_token, expiry_date: publicData.expiry_date } : undefined;
    const docArr = view === 'erd' ? diagrams : view === 'notes' ? notes : view === 'drawings' ? drawings : flowcharts;
    const id = view === 'erd' ? activeDiagramId : view === 'notes' ? activeNoteId : view === 'drawings' ? activeDrawingId : activeFlowchartId;
    // @ts-ignore
    const doc = docArr.find(d => d.id === id);
    if (!doc) return undefined;
    return { is_public: !!doc.is_public, share_token: doc.share_token, expiry_date: doc.expiry_date };
  }, [view, isPublicView, publicData, diagrams, notes, drawings, flowcharts, activeDiagramId, activeNoteId, activeDrawingId, activeFlowchartId]);

  const currentSaveStatus = useMemo(() => {
    const statusMap = { erd: saveStatus, notes: notesSaveStatus, drawings: drawingsSaveStatus, flowchart: flowchartsSaveStatus };
    return statusMap[view as keyof typeof statusMap] || 'idle';
  }, [view, saveStatus, notesSaveStatus, drawingsSaveStatus, flowchartsSaveStatus]);

  const hasActiveItem = useMemo(() => {
    const activeMap = { erd: !!activeDiagramId, notes: !!activeNoteId, drawings: !!activeDrawingId, flowchart: !!activeFlowchartId };
    return activeMap[view as keyof typeof activeMap] || false;
  }, [view, activeDiagramId, activeNoteId, activeDrawingId, activeFlowchartId]);

  const selectedEntity = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find((n) => n.id === selectedNodeId);
    return node ? (node.data as Entity) : null;
  }, [nodes, selectedNodeId]);

  // Sync active states with deletion status
  useEffect(() => {
    if (isPublicView) return;

    const checkActiveItemHealth = () => {
      // Find the current active object based on view
      let activeItem: any = null;
      if (view === 'erd' && activeDiagramId) activeItem = diagrams.find(f => f.id === activeDiagramId);
      else if (view === 'notes' && activeNoteId) activeItem = notes.find(n => n.id === activeNoteId);
      else if (view === 'drawings' && activeDrawingId) activeItem = drawings.find(d => d.id === activeDrawingId);
      else if (view === 'flowchart' && activeFlowchartId) activeItem = flowcharts.find(f => f.id === activeFlowchartId);

      if (activeItem && activeItem.is_deleted) {
        // Current file is deleted, reset it
        if (view === 'erd') setActiveDiagramId(null);
        else if (view === 'notes') setActiveNoteId(null);
        else if (view === 'drawings') setActiveDrawingId(null);
        else if (view === 'flowchart') setActiveFlowchartId(null);
        
        toast.info("Document closed because it was moved to trash.");
        return;
      }

      // If active item belongs to a project, check if that project is deleted
      if (activeItem && activeItem.project_id) {
        const parentProject = projects.find(p => String(p.id) === String(activeItem.project_id));
        if (parentProject && parentProject.is_deleted) {
          // Parent project is deleted, reset everything
          setActiveProjectId(null);
          setActiveDiagramId(null);
          setActiveNoteId(null);
          setActiveDrawingId(null);
          setActiveFlowchartId(null);
          toast.warning("Project was deleted. Closing current document.");
        }
      }
    };

    checkActiveItemHealth();
  }, [view, activeDiagramId, activeNoteId, activeDrawingId, activeFlowchartId, diagrams, notes, drawings, flowcharts, projects, isPublicView]);
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
      if (view === 'erd' && activeDiagramId) saveDiagram(nodes, edges, viewportRef.current);
      else if (view === 'notes' && activeNoteId) { const n = notes.find(n => n.id === activeNoteId); if (n) saveNote(n); }
      else if (view === 'drawings' && activeDrawingId) { const d = drawings.find(d => d.id === activeDrawingId); if (d) saveDrawing(d); }
      else if (view === 'flowchart' && activeFlowchartId) { const f = flowcharts.find(f => f.id === activeFlowchartId); if (f) saveFlowchart(f); }
    }
  }, [isOnline, view, activeDiagramId, activeNoteId, activeDrawingId, activeFlowchartId, nodes, edges]);

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
      fetchDiagrams(false, pid, debouncedSearchQuery);
      // @ts-ignore
      fetchNotes(false, pid, debouncedSearchQuery);
      // @ts-ignore
      fetchDrawings(false, pid, debouncedSearchQuery);
      // @ts-ignore
      fetchFlowcharts(false, pid, debouncedSearchQuery);
    }
  }, [isAuthenticated, activeProjectId, debouncedSearchQuery, fetchDiagrams, fetchNotes, fetchDrawings, fetchFlowcharts, isPublicView]);

  // ERD Auto-save
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (activeDiagramId && isAuthenticated && view === 'erd' && !isPublicView) {
      saveTimeoutRef.current = setTimeout(() => saveDiagram(nodes, edges, viewportRef.current), 3000);
    }
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [nodes, edges, activeDiagramId, isAuthenticated, view, saveDiagram, isPublicView]);

  // Handlers
  const handleDiagramSelect = (id: number | string) => selectDiagram(id, setActiveDiagramId);
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (view !== 'erd') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          if (canRedo) redo();
        } else {
          if (canUndo) undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        if (canRedo) redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, undo, redo, canUndo, canRedo]);


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
    if (newView !== 'trash' && newView !== 'changelog') {
      setSidebarView(newView);
    }
  };

  useUpdateCheck(() => handleViewChange('changelog'));

  const confirmPermanentDelete = async () => {
    if (itemToDelete) {
      const { id, type } = itemToDelete;
      if (type === 'project') await deleteProjectPermanent(id);
      else if (type === 'erd') await deleteDiagramPermanent(id);
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
  const activeDiagram = isPublicView ? publicData : diagrams.find(f => f.id === activeDiagramId);
  
  const featureLabel = isPublicView ? `Public Shared ${view}` : (view === 'erd' ? 'Diagrams' : view === 'notes' ? 'Notes' : view === 'drawings' ? 'Drawings' : view === 'flowchart' ? 'Flowcharts' : view === 'changelog' ? 'Changelog' : 'Trash Bin');
  const activeFileName = isPublicView ? (publicData?.name || publicData?.title || 'Shared Document') : (view === 'erd' ? activeDiagram?.name : view === 'notes' ? activeNote?.title : view === 'drawings' ? activeDrawing?.title : view === 'flowchart' ? activeFlowchart?.title : null);
  const activeProjectName = isPublicView ? publicData?.projects?.name : (view === 'erd' ? activeDiagram?.projects?.name : view === 'notes' ? activeNote?.projects?.name : view === 'drawings' ? activeDrawing?.projects?.name : view === 'flowchart' ? activeFlowchart?.projects?.name : null);
  const activeFileUid = isPublicView ? publicData?.uid : (view === 'erd' ? activeDiagram?.uid : view === 'notes' ? activeNote?.uid : view === 'drawings' ? activeDrawing?.uid : view === 'flowchart' ? activeFlowchart?.uid : undefined);

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
          diagrams={diagrams} notes={notes} drawings={drawings} flowcharts={flowcharts} projects={projects}
          activeDiagramId={activeDiagramId} activeNoteId={activeNoteId} activeDrawingId={activeDrawingId} activeFlowchartId={activeFlowchartId} activeProjectId={activeProjectId} view={view}
          onDiagramSelect={handleDiagramSelect} onNoteSelect={handleSelectionSelect} onDrawingSelect={handleSelectionSelect} onFlowchartSelect={handleSelectionSelect} onProjectSelect={setActiveProjectId}
          onDiagramCreate={async (n, pid) => { const f = await createDiagram(n, pid ? Number(pid) : null); if (f) handleDiagramSelect(f.id); }}
          onNoteCreate={async (t, pid) => { const n = await createNote(t, pid ? Number(pid) : null); if (n) handleSelectionSelect(n.id); }}
          onDrawingCreate={async (t, pid) => { const d = await createDrawing(t, pid ? Number(pid) : null); if (d) handleSelectionSelect(d.id); }}
          onFlowchartCreate={async (t, pid) => { const f = await createFlowchart(t, pid ? Number(pid) : null); if (f) handleSelectionSelect(f.id); }}
          onProjectCreate={createProject} onProjectUpdate={updateProject} onProjectDelete={id => { deleteProject(id); fetchTrash(); }}
          onDiagramUpdate={updateDiagram} onNoteUpdate={updateNote} onDrawingUpdate={updateDrawing} onFlowchartUpdate={updateFlowchart}
          onDiagramDelete={id => { deleteDiagram(id); fetchTrash(); }} onNoteDelete={id => { deleteNote(id); fetchTrash(); }} onDrawingDelete={id => { deleteDrawing(id); fetchTrash(); }} onFlowchartDelete={id => { deleteFlowchart(id); fetchTrash(); }}
          onLogout={handleLogout} saveStatus={saveStatus}
          onMoveDiagramToProject={moveDiagramToProject} onMoveNoteToProject={moveNoteToProject} onMoveDrawingToProject={moveDrawingToProject} onMoveFlowchartToProject={moveFlowchartToProject}
          sidebarView={sidebarView} onViewChange={handleViewChange}
          hasMoreProjects={hasMoreProjects} hasMoreDiagrams={hasMoreDiagrams} hasMoreNotes={hasMoreNotes} hasMoreDrawings={hasMoreDrawings} hasMoreFlowcharts={hasMoreFlowcharts}
          onLoadMoreProjects={() => fetchProjects(true, debouncedSearchQuery)} onLoadMoreDiagrams={() => fetchDiagrams(true, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery)}
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
          onSettingsSaved={() => { const pid = activeProjectId === null ? 'all' : activeProjectId; if (view === 'erd') fetchDiagrams(false, pid, debouncedSearchQuery); else if (view === 'notes') fetchNotes(false, pid, debouncedSearchQuery); else if (view === 'drawings') fetchDrawings(false, pid, debouncedSearchQuery); else if (view === 'flowchart') fetchFlowcharts(false, pid, debouncedSearchQuery); }}
          isOnline={isOnline}
        />

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 min-h-0 overflow-hidden">
          {!hasActiveItem && view !== 'trash' && view !== 'changelog' && !isPublicView ? <WelcomeView /> : (
            <>
              {view === 'erd' && (isPublicView ? publicData : activeDiagramId) && (
                <ERDView 
                  nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
                  onNodeClick={(e, n) => { if (!isPublicView && !(e.target as HTMLElement).closest('.nodrag')) setSelectedNodeId(n.id); }}
                  onEdgeClick={(_, e) => { if (!isPublicView) setSelectedEdgeId(e.id); }}
                  onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
                  onMove={(_, v) => { viewportRef.current = v; }}
                  addEntity={addEntity}
                  openImportModal={() => setIsImportModalOpen(true)}
                  handleExportSQL={dialect => {
                    const target = isPublicView ? publicData : diagrams.find(f => f.id === activeDiagramId);
                    if (target) handleExportSQL(dialect, target, nodes, edges);
                  }}
                  handleExportImage={(format) => {
                    const targetName = isPublicView ? (publicData?.name || 'Shared') : (diagrams.find(f => f.id === activeDiagramId)?.name || 'Diagram');
                    handleExportImage(format, targetName);
                  }}
                  isReadOnly={isPublicView}
                  undo={undo}
                  redo={redo}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  takeSnapshot={takeSnapshot}
                />
              )}
              {view === 'erd' && (
                <ImportSQLModal 
                  isOpen={isImportModalOpen}
                  onOpenChange={setIsImportModalOpen}
                  onImport={(newNodes, newEdges) => {
                    takeSnapshot(nodes, edges);
                    
                    // Handle duplicate names during import
                    const processedNodes = [...newNodes];
                    const existingNames = nodes.map(n => n.data.name.toLowerCase());
                    
                    processedNodes.forEach(newNode => {
                      let originalName = newNode.data.name;
                      let name = originalName;
                      let counter = 1;
                      
                      // Check against existing nodes OR nodes already processed in this import
                      while (
                        existingNames.includes(name.toLowerCase()) || 
                        processedNodes.some(pn => pn !== newNode && pn.data.name.toLowerCase() === name.toLowerCase())
                      ) {
                        name = `${originalName}_imported_${counter}`;
                        counter++;
                      }
                      
                      if (name !== originalName) {
                        newNode.data.name = name;
                      }
                    });

                    setNodes(nds => [...nds, ...processedNodes]);
                    setEdges(eds => [...eds, ...newEdges]);
                  }}
                />
              )}
              {view === 'notes' && activeNote && <NotesView activeNoteId={isPublicView ? null : activeNoteId} activeNote={activeNote} saveNote={saveNote} handleNoteChange={handleNoteChange} deleteNote={deleteNote} isReadOnly={isPublicView} />}
              {view === 'drawings' && activeDrawing && <DrawingsView activeDrawingId={isPublicView ? null : activeDrawingId} activeDrawing={activeDrawing} saveDrawing={saveDrawing} handleDrawingChange={handleDrawingChange} deleteDrawing={deleteDrawing} isReadOnly={isPublicView} />}
              {view === 'flowchart' && activeFlowchart && <FlowchartView activeFlowchartId={activeFlowchartId} activeFlowchart={activeFlowchart} handleFlowchartChange={handleFlowchartChange} isReadOnly={isPublicView} />}
              {view === 'changelog' && <ChangelogView />}
            </>
          )}
          {view === 'trash' && (
            <TrashView 
              trashData={trashData} 
              restoreProject={async (id) => { await restoreProject(id); fetchTrash(); fetchProjects(); }} 
              restoreDiagram={async (id) => { await restoreDiagram(id); fetchTrash(); fetchDiagrams(false, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery); }} 
              restoreNote={async (id) => { await restoreNote(id); fetchTrash(); fetchNotes(false, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery); }} 
              restoreDrawing={async (id) => { await restoreDrawing(id); fetchTrash(); fetchDrawings(false, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery); }} 
              restoreFlowchart={async (id) => { await restoreFlowchart(id); fetchTrash(); fetchFlowcharts(false, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery); }} 
              fetchTrash={fetchTrash} 
              handleProjectPermanentDelete={id => { setItemToDelete({ id, type: 'project' }); setIsPermanentDeleteConfirmOpen(true); }} 
              handleDiagramPermanentDelete={id => { setItemToDelete({ id, type: 'erd' }); setIsPermanentDeleteConfirmOpen(true); }} 
              handleNotePermanentDelete={id => { setItemToDelete({ id, type: 'notes' }); setIsPermanentDeleteConfirmOpen(true); }} 
              handleDrawingPermanentDelete={id => { setItemToDelete({ id, type: 'drawings' }); setIsPermanentDeleteConfirmOpen(true); }} 
              handleFlowchartPermanentDelete={id => { setItemToDelete({ id, type: 'flowchart' as any }); setIsPermanentDeleteConfirmOpen(true); }} 
            />
          )}
        </div>

        <FeedbackDialog />

        <DeleteConfirmModal isOpen={isPermanentDeleteConfirmOpen} onOpenChange={setIsPermanentDeleteConfirmOpen} onConfirm={confirmPermanentDelete} onCancel={() => setItemToDelete(null)} itemType={itemToDelete?.type || ''} />

        {/* Entity Properties Modal */}
        {!isPublicView && (
          <Dialog open={!!selectedNodeId} onOpenChange={(open) => { if (!open) setSelectedNodeId(null); }}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <div className="flex items-center justify-between pr-8">
                  <div className="space-y-1 text-left">
                    <DialogTitle>Table Properties</DialogTitle>
                    <DialogDescription>
                      Customize your table name, theme, and column definitions.
                    </DialogDescription>
                  </div>
                  <Button 
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsDeleteAlertOpen(true)}
                    className="text-destructive hover:bg-destructive/10 -mr-2 shadow-none"
                    title="Delete Table"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </DialogHeader>
              
              <DialogBody>
                <PropertiesPanel 
                  selectedEntity={selectedEntity} 
                  onUpdateEntity={updateEntity} 
                  onDeleteEntity={(id) => {
                    deleteEntity(id);
                    setSelectedNodeId(null);
                  }} 
                />
              </DialogBody>
            </DialogContent>
          </Dialog>
        )}

        {/* Relationship Properties Modal */}
        {!isPublicView && (
          <Dialog open={!!selectedEdgeId} onOpenChange={(open) => { if (!open) setSelectedEdgeId(null); }}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Relationship Properties</DialogTitle>
                <DialogDescription>
                  Set the cardinality between these two tables.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <RelationshipPropertiesPanel 
                  selectedEdge={edges.find(e => e.id === selectedEdgeId) || null} 
                  nodes={nodes} 
                  onUpdateEdge={handleEdgeUpdate} 
                  onDeleteEdge={deleteEdge}
                />
              </DialogBody>
            </DialogContent>
          </Dialog>
        )}

        {/* Delete Confirmation Alert */}
        <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Table</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogBody>
              <AlertDialogDescription>
                Are you sure you want to delete the table "{selectedEntity?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogBody>
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
