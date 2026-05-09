import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { 
  ReactFlowProvider,
  Edge,
} from '@xyflow/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { copyMarkdownToClipboard } from './lib/markdownUtils';

// Components
import { AppSidebar } from './components/app-sidebar';
import { FeedbackDialog } from "@/components/FeedbackDialog"
import { Login } from './components/Login';
import { MainHeader } from './components/MainHeader';
import { DeleteConfirmModal } from './components/modals/DeleteConfirmModal';
import { ImportNoteModal } from './components/modals/ImportNoteModal';
import { ExportNoteModal } from './components/modals/ExportNoteModal';
import { NoteExporter } from './lib/exporters/note-exporter';
import { MoveToTrashAlert } from './components/modals/MoveToTrashAlert';
import { DeleteEntityAlert } from './components/modals/DeleteEntityAlert';
import { RenameDocumentDialog } from './components/modals/RenameDocumentDialog';
import { DuplicateDocumentDialog } from './components/modals/DuplicateDocumentDialog';
import { TablePropertiesModal } from './components/modals/TablePropertiesModal';
import { RelationshipPropertiesModal } from './components/modals/RelationshipPropertiesModal';

import { ForbiddenView } from "./components/views/ForbiddenView";
import { WorkspaceContent } from '@/components/layout/WorkspaceContent';
import { NotesPage } from '@/components/pages/NotesPage';

// Layout Components
import { OfflineOverlay } from './components/layout/OfflineOverlay';
import { AppInitialization } from './components/layout/AppInitialization';
import { useAppMetadata } from './hooks/useAppMetadata';
import { useFileOperations } from './hooks/useFileOperations';
import { useActiveItemGuard } from './hooks/useActiveItemGuard';

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
import { useBroadcastChannel, BroadcastMessageType } from './hooks/useBroadcastChannel';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { useSidebarHandlers } from './hooks/useSidebarHandlers';
import { useTrashHandlers } from './hooks/useTrashHandlers';
import { useWorkspaceCallbacks } from './hooks/useWorkspaceCallbacks';
import { useAutoSave } from './hooks/useAutoSave';
import { useDiagramNavigation } from './hooks/useDiagramNavigation';
import { useNoteNavigation } from './hooks/useNoteNavigation';
import { useNoteChangeHandler } from './hooks/useNoteChangeHandler';

// Lib & Types
import { localPersistence } from './lib/localPersistence';
import { getSharePathInfo } from './lib/urlUtils';
import { toast } from 'sonner';
import { Entity, DraftType } from './types';

// UI
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

function AppContent() {
  const [view, setView] = useState<'erd' | 'notes' | 'drawings' | 'trash' | 'flowchart' | 'changelog' | 'backups'>(() => {
    if (typeof window === 'undefined' || getSharePathInfo()) return 'notes';
    return (localStorage.getItem('erd-builder-last-view') as any) || 'notes';
  });
  const [sidebarView, setSidebarView] = useState<'erd' | 'notes' | 'drawings' | 'flowchart' | 'changelog'>(() => {
    if (typeof window === 'undefined' || getSharePathInfo()) return 'notes';
    return (localStorage.getItem('erd-builder-last-sidebar-view') as any) || 'notes';
  });

  // Persist views
  useEffect(() => {
    if (getSharePathInfo()) return;
    localStorage.setItem('erd-builder-last-view', view);
    localStorage.setItem('erd-builder-last-sidebar-view', sidebarView);
  }, [sidebarView]);

  const navigate = useNavigate();
  const location = useLocation();

  const [isTablePropertiesOpen, setIsTablePropertiesOpen] = useState(false);

  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isPermanentDeleteConfirmOpen, setIsPermanentDeleteConfirmOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number | string, type: 'erd' | 'notes' | 'drawings' | 'project' } | null>(null);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameProjectId, setRenameProjectId] = useState<string>("none");
  const [isMoveToTrashAlertOpen, setIsMoveToTrashAlertOpen] = useState(false);
  const [isImportNoteModalOpen, setIsImportNoteModalOpen] = useState(false);
  const [isExportNoteModalOpen, setIsExportNoteModalOpen] = useState(false);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState("");
  
  // Safety Gate & Persistence State
  const isLocalSavingRef = useRef(false);
  const [isLocalSaving, setIsLocalSavingState] = useState(false);
  const setIsLocalSaving = useCallback((val: boolean) => { isLocalSavingRef.current = val; setIsLocalSavingState(val); }, []);
  const lastLoadedDiagramIdRef = useRef<number | string | null>(null);
  const lastLoadedNoteIdRef = useRef<number | string | null>(null);
  const lastLoadedDrawingIdRef = useRef<number | string | null>(null);
  const lastLoadedFlowchartIdRef = useRef<number | string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isIncomingSyncRef = useRef(false);
  const lastSaveCallRef = useRef<number>(0);
  const lastDiagramLoadTimestampRef = useRef<number>(0);
  const lastFocusFetchRef = useRef<number>(0);
  
  // 🛡️ Stable State Refs: Used to maintain handler identity without stale closures
  const notesRef = useRef<any[]>([]);
  const drawingsRef = useRef<any[]>([]);
  const flowchartsRef = useRef<any[]>([]);
  const nodesRef = useRef<any[]>([]);
  const edgesRef = useRef<any[]>([]);

  // Auto-save & Sync Timeouts
  // notesSaveTimeout + noteCloudSyncTimeoutRef → owned by useNoteChangeHandler
  const drawingsSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const flowchartsSaveTimeout = useRef<NodeJS.Timeout | null>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  
  // Custom Hooks
  const { isAuthenticated, isGuest, user, checkAuth, handleGuestLogin, handleLogout } = useAuth();
  const isOnline = useConnectionStatus();
  const { triggerDebouncedSync, isSyncing, syncError, syncDrafts, checkAndClearStaleDrafts, hasPendingSyncs } = useSyncService(isAuthenticated, isGuest);
  const { isInstallable, installApp } = usePWAInstall();
  const { handleExportSQL } = useSQLGenerator();
  const { handleExportImage, handleExportPDF } = useImageExporter();

  // Public Document Hook
  const {
    isPublicView, setIsPublicView, publicData, isPublicLoading, forbiddenDoc, fetchPublicDocument
  } = usePublicDocument(setView);

  // ERD Session Hook - moved after diagrams state to get access to activeDiagramId
  const { diagrams, setDiagrams, activeDiagramId, setActiveDiagramId,
    fetchDiagrams, createDiagram, updateDiagram, deleteDiagram, restoreDiagram, deleteDiagramPermanent, moveDiagramToProject, saveDiagram,
    hasMoreDiagrams, isLoading: isDiagramsLoading } = useDiagrams(isAuthenticated, view, isGuest);

  // 🔄 Circular Dependency Resolution: useERDSession needs broadcast functions from useRealtimeSync, 
  // but useRealtimeSync needs setNodes/setEdges from useERDSession.
  // We break this by using a Ref that late-binds the broadcast functions.
  const broadcastRef = useRef<{
    move: (id: string, x: number, y: number) => void;
    update: (id: string, data: Entity) => void;
    edges: (edges: Edge[]) => void;
  }>({
    move: () => {},
    update: () => {},
    edges: () => {},
  });

  const erdOptions = useMemo(() => ({
    broadcastNodeMove: (id: string, x: number, y: number) => broadcastRef.current.move(id, x, y),
    broadcastNodeUpdate: (id: string, data: Entity) => broadcastRef.current.update(id, data),
    broadcastEdgesUpdate: (edges: Edge[]) => broadcastRef.current.edges(edges),
    onEditEntity: (entityId: string) => {
      setIsTablePropertiesOpen(true);
    },
  }), []);

  const { 
    nodes, setNodes, onNodesChange,
    edges, setEdges, onEdgesChange,
    selectedNodeId, setSelectedNodeId,
    selectedEdgeId, setSelectedEdgeId,
    onConnect, addEntity, updateEntity, deleteEntity, handleEdgeUpdate, deleteEdge,
    handleDiagramSelect: selectDiagram, viewportRef,
    undo, redo, canUndo, canRedo, takeSnapshot, isItemLoading: isERDItemLoading, saveCounter,
    onNodeDragStop, onMoveEnd
  } = useERDSession(isPublicView, isGuest, isAuthenticated, setView, erdOptions);

  // Effective ID for realtime sync (works for both owner and public guest)
  const effectiveDiagramId = isPublicView ? publicData?.id : activeDiagramId;

  const { broadcastNodeMove, broadcastNodeUpdate, broadcastEdgesUpdate } = useRealtimeSync(
    effectiveDiagramId,
    setNodes,
    setEdges
  );

  // Update the broadcast Ref whenever functions change
  useEffect(() => {
    broadcastRef.current = {
      move: broadcastNodeMove,
      update: broadcastNodeUpdate,
      edges: broadcastEdgesUpdate,
    };
  }, [broadcastNodeMove, broadcastNodeUpdate, broadcastEdgesUpdate]);

  const { 
    notes, setNotes, activeNoteUid, setActiveNoteUid, bumpContentVersion, getContentVersion, fetchNotes, createNote, updateNote, deleteNote, moveNoteToProject, saveNote, restoreNote, deleteNotePermanent,
    hasMoreNotes, isLoading: isNotesLoading, isItemLoading: isNoteItemLoading, selectNote, duplicateNote
  } = useNotes(isGuest);
  
  const { 
    projects, 
    setProjects, 
    uncategorized,
    activeProjectId, 
    setActiveProjectId, 
    fetchProjects, 
    createProject, 
    updateProject, 
    deleteProject,
    restoreProject,
    deleteProjectPermanent,
    hasMoreProjects,
    isLoading: isProjectsLoading
  } = useProjects(isGuest);
  
  const { 
    drawings, setDrawings, activeDrawingId, setActiveDrawingId, fetchDrawings, createDrawing, updateDrawing, deleteDrawing, moveDrawingToProject, saveDrawing, restoreDrawing, deleteDrawingPermanent,
    hasMoreDrawings, isLoading: isDrawingsLoading, isItemLoading: isDrawingItemLoading, selectDrawing, duplicateDrawing
  } = useDrawings(isGuest);

  const {
    flowcharts, setFlowcharts, activeFlowchartId, setActiveFlowchartId, fetchFlowcharts, createFlowchart, updateFlowchart, deleteFlowchart, moveFlowchartToProject, saveFlowchart, restoreFlowchart, deleteFlowchartPermanent,
    hasMoreFlowcharts, isLoading: isFlowchartsLoading, isItemLoading: isFlowchartItemLoading, selectFlowchart
  } = useFlowcharts(isGuest);

  const { trashData, fetchTrash, isLoading: isTrashLoading } = useTrash(isGuest);

  const { broadcastMessage } = useBroadcastChannel(useCallback(async (message) => {
    if (message.type !== BroadcastMessageType.DRAFT_UPDATED) return;
    
    const { type: dataType, id } = message.payload;
    
    if (view === 'erd' && dataType === DraftType.ERD && String(id) === String(activeDiagramId)) {
      console.log("[Broadcast] Incoming sync: updating state from another tab");
      isIncomingSyncRef.current = true;
      // @ts-ignore
      window.currentSyncIsSilent = true;
      await selectDiagram(id, setActiveDiagramId, { silent: true });
      // @ts-ignore
      window.currentSyncIsSilent = false;
      setTimeout(() => { isIncomingSyncRef.current = false; }, 1000);
    } else if (view === 'notes' && dataType === DraftType.NOTES && String(id) === String(activeNoteUid)) {
      console.log("[Broadcast] Reloading Note from local draft updated in another tab");
      await selectNote(String(id), { silent: true });
    } else if (view === 'drawings' && dataType === DraftType.DRAWINGS && String(id) === String(activeDrawingId)) {
      console.log("[Broadcast] Reloading Drawing from local draft updated in another tab");
      await selectDrawing(id, { silent: true });
    } else if (view === 'flowchart' && dataType === DraftType.FLOWCHART && String(id) === String(activeFlowchartId)) {
      console.log("[Broadcast] Reloading Flowchart from local draft updated in another tab");
      await selectFlowchart(id, { silent: true });
    }
  }, [view, activeDiagramId, activeNoteUid, activeDrawingId, activeFlowchartId, selectDiagram, selectNote, selectDrawing, selectFlowchart, setActiveDiagramId]));

  // Sync refs with latest state
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { drawingsRef.current = drawings; }, [drawings]);
  useEffect(() => { flowchartsRef.current = flowcharts; }, [flowcharts]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // Handlers
  // Computed Values
  const {
    currentActiveId,
    activeDocument,
    initialShareSettings,
    activeNote,
    activeDrawing,
    activeFlowchart,
    featureLabel,
    activeFileName,
    activeProjectName,
    activeFileUid,
    hasActiveItem,
  } = useAppMetadata({
    view,
    isPublicView,
    publicData,
    activeDiagramId,
    activeNoteUid,
    activeDrawingId,
    activeFlowchartId,
    diagrams,
    notes,
    drawings,
    flowcharts,
    projects,
  });

  useEffect(() => {
    if (activeDrawingId && !isDrawingItemLoading) lastLoadedDrawingIdRef.current = activeDrawingId;
  }, [activeDrawingId, isDrawingItemLoading]);

  useEffect(() => {
    if (activeFlowchartId && !isFlowchartItemLoading) lastLoadedFlowchartIdRef.current = activeFlowchartId;
  }, [activeFlowchartId, isFlowchartItemLoading]);

  useActiveItemGuard({
    view,
    activeDiagramId,
    activeNoteUid,
    activeDrawingId,
    activeFlowchartId,
    diagrams,
    notes,
    drawings,
    flowcharts,
    projects,
    isPublicView,
    setActiveDiagramId,
    setActiveNoteUid,
    setActiveDrawingId,
    setActiveFlowchartId,
    setActiveProjectId,
  });

  const handleEntityUpdate = useCallback(async (updatedEntity: Entity, options?: { immediate?: boolean }) => {
    updateEntity(updatedEntity);
    
    if (options?.immediate) {
      // Clear any pending debounced auto-saves to prevent double sync
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        setIsLocalSaving(false);
      }

      // 1. Instant Local Save (IndexedDB)
      // We manually construct the nodes array because state updates are async
      const currentNodes = nodesRef.current.map(node => 
        node.id === updatedEntity.id ? { ...node, data: updatedEntity } : node
      );
      await saveDiagram(currentNodes, edgesRef.current, viewportRef.current);
      lastSaveCallRef.current = Date.now();
      
      // 2. Instant Cloud Sync (Supabase)
      syncDrafts();

      // 3. Broadcast update to other clients
      broadcastNodeUpdate(updatedEntity.id, updatedEntity);
    }
  }, [updateEntity, saveDiagram, viewportRef, syncDrafts, broadcastNodeUpdate]);

  // ── Note Change Handler ──
  // Extracted to useNoteChangeHandler: 2-stage debounce save (800ms local, 1600ms cloud),
  // timeout refs, content version tracking.
  const { handleNoteChange, notesSaveTimeout, noteCloudSyncTimeoutRef } = useNoteChangeHandler({
    activeNoteUid,
    isIncomingSyncRef,
    notesRef,
    lastLoadedNoteIdRef,
    lastSaveCallRef,
    bumpContentVersion,
    saveNote,
    setNotes,
    setIsLocalSaving,
    broadcastMessage,
    syncDrafts,
    isRefreshing,
    isNoteItemLoading,
  });

  const handleDrawingChange = useCallback((data: string) => {
    if (!activeDrawingId) return;
    
    // Prevent loop: If this change came from another tab's sync, DON'T save it back
    if (isIncomingSyncRef.current) return;

    const drawingId = activeDrawingId;
    setDrawings(prev => prev.map(d => String(d.id) === String(drawingId) ? { ...d, data } : d));
    
    setIsLocalSaving(true);
    if (drawingsSaveTimeout.current) clearTimeout(drawingsSaveTimeout.current);
    
    // SAFETY: Drawing ID Validation Guard
    if (lastLoadedDrawingIdRef.current !== activeDrawingId) return;

    drawingsSaveTimeout.current = setTimeout(async () => {
      // SAFETY: Wait if still loading/refreshing
      if (isRefreshing || isDrawingItemLoading) return;
      
      const currentDrawing = drawingsRef.current.find(d => String(d.id) === String(drawingId));
      if (!currentDrawing) return;
      
      await saveDrawing({
        ...currentDrawing,
        data
      } as any);
      
      lastSaveCallRef.current = Date.now();
      setIsLocalSaving(false);
      triggerDebouncedSync();
      broadcastMessage(BroadcastMessageType.DRAFT_UPDATED, DraftType.DRAWINGS, drawingId);
    }, 1500);
  }, [activeDrawingId, saveDrawing, setDrawings, triggerDebouncedSync, isRefreshing, isDrawingItemLoading, broadcastMessage]);

  const handleFlowchartChange = useCallback((nodesData: any[], edgesData: any[]) => {
    if (!activeFlowchartId) return;

    // Prevent loop: If this change came from another tab's sync, DON'T save it back
    if (isIncomingSyncRef.current) return;

    const flowchartId = activeFlowchartId;
    const dataString = JSON.stringify({ nodes: nodesData, edges: edgesData });
    setFlowcharts(prev => prev.map(f => String(f.id) === String(flowchartId) ? { ...f, data: dataString } : f));
    
    setIsLocalSaving(true);
    if (flowchartsSaveTimeout.current) clearTimeout(flowchartsSaveTimeout.current);
    
    // SAFETY: Flowchart ID Validation Guard
    if (lastLoadedFlowchartIdRef.current !== activeFlowchartId) return;

    flowchartsSaveTimeout.current = setTimeout(async () => {
      // SAFETY: Wait if still loading/refreshing
      if (isRefreshing || isFlowchartItemLoading) return;
      
      const currentFlowchart = flowchartsRef.current.find(f => String(f.id) === String(flowchartId));
      if (!currentFlowchart) return;
      
      await saveFlowchart({
        ...currentFlowchart,
        data: dataString
      } as any);
      
      lastSaveCallRef.current = Date.now();
      setIsLocalSaving(false);
      triggerDebouncedSync();
      broadcastMessage(BroadcastMessageType.DRAFT_UPDATED, DraftType.FLOWCHART, flowchartId);
    }, 1500);
  }, [activeFlowchartId, saveFlowchart, setFlowcharts, triggerDebouncedSync, isRefreshing, isFlowchartItemLoading, broadcastMessage]);

  const { saveTimeoutRef, flushPendingSaves } = useAutoSave({
    saveCounter,
    isLocalSavingRef,
    isIncomingSyncRef,
    lastLoadedDiagramIdRef,
    lastSaveCallRef,
    lastDiagramLoadTimestampRef,
    isAuthenticated,
    isGuest,
    view,
    isPublicView,
    activeDiagramId,
    nodes,
    edges,
    viewportRef,
    saveDiagram,
    setIsLocalSaving,
    triggerDebouncedSync,
    broadcastMessage,
    isRefreshing,
    isERDItemLoading,
    isDiagramsLoading,
    activeNoteUid,
    notes,
    saveNote,
    activeDrawingId,
    drawings,
    saveDrawing,
    activeFlowchartId,
    flowcharts,
    saveFlowchart,
    notesSaveTimeoutRef: notesSaveTimeout,
    drawingsSaveTimeoutRef: drawingsSaveTimeout,
    flowchartsSaveTimeoutRef: flowchartsSaveTimeout,
    syncDrafts,
  });

  // ── Diagram Navigation ──
  // Extracted to useDiagramNavigation: handleDiagramSelect, URL routing,
  // view cleanup, and diagram loaded tracking.
  const { handleDiagramSelect } = useDiagramNavigation({
    diagrams,
    activeDiagramId,
    setActiveDiagramId,
    view,
    setView,
    setSidebarView,
    setNodes,
    setEdges,
    selectDiagram,
    flushPendingSaves,
    isAuthenticated,
    isERDItemLoading,
    lastLoadedDiagramIdRef,
    lastDiagramLoadTimestampRef,
  });

  // ── Note Navigation ──
  // Extracted to useNoteNavigation: handleNoteSelect, URL routing,
  // view cleanup, and note loaded tracking.
  const { handleNoteSelect } = useNoteNavigation({
    notes,
    setNotes,
    activeNoteUid,
    setActiveNoteUid,
    view,
    setView,
    setSidebarView,
    selectNote,
    flushPendingSaves,
    isAuthenticated,
    getContentVersion,
    projects,
    lastLoadedNoteIdRef,
  });

  async function handleDrawingSelect(id: number | string) {
    if (activeDrawingId === id && view === 'drawings') return; 
    await flushPendingSaves();
    setView('drawings');
    // Clear current drawing data to avoid showing stale data while loading
    setDrawings(prev => prev.map(d => d.id === id ? { ...d, data: undefined } : d));
    await selectDrawing(id);
    lastLoadedDrawingIdRef.current = id;
  }

  async function handleFlowchartSelect(id: number | string) {
    if (activeFlowchartId === id && view === 'flowchart') return; 
    await flushPendingSaves();
    setView('flowchart');
    // Clear current flowchart data to avoid showing stale data while loading
    setFlowcharts(prev => prev.map(f => f.id === id ? { ...f, data: undefined } : f));
    await selectFlowchart(id);
    lastLoadedFlowchartIdRef.current = id;
  }

  async function handleProjectSelect(id: number | string | null) {
    await flushPendingSaves();
    setActiveProjectId(id);
  }

  const {
    handleExportMarkdown,
    handleImportMarkdown,
    handleCopyMarkdown,
    executeExportMarkdown,
    executeImportMarkdown,
  } = useFileOperations({
    activeNote,
    activeNoteUid,
    activeProjectId,
    createNote,
    saveNote,
    setActiveNoteUid,
    handleNoteChange,
    setIsExportNoteModalOpen,
    setIsImportNoteModalOpen,
  });

  // 🛡️ Sidebar Handlers (Memoized to maintain AppSidebar stability)
  const {
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
  } = useSidebarHandlers({
    createDiagram, updateDiagram, deleteDiagram,
    createNote, updateNote, deleteNote,
    createDrawing, updateDrawing, deleteDrawing,
    createFlowchart, updateFlowchart, deleteFlowchart,
    createProject, updateProject, deleteProject,
    moveDiagramToProject,
    moveNoteToProject, moveDrawingToProject, moveFlowchartToProject,
    fetchProjects, fetchDiagrams, fetchNotes, fetchDrawings, fetchFlowcharts, fetchTrash,
    handleDiagramSelect, handleNoteSelect, handleDrawingSelect, handleFlowchartSelect,
    searchQuery, activeProjectId,
    notesRef, copyMarkdownToClipboard,
    setIsImportNoteModalOpen, setIsExportNoteModalOpen,
  });


  // 🛡️ Header Handlers (Memoized to prevent flicker)
  const handleHeaderSettingsSaved = useCallback(() => {
    // Refresh the full project tree (single source of truth) instead of per-type flat endpoints
    fetchProjects(false, debouncedSearchQuery);
  }, [debouncedSearchQuery, fetchProjects]);

  const handleHeaderDelete = useCallback(() => {
    if (!currentActiveId) return;
    setIsMoveToTrashAlertOpen(true);
  }, [currentActiveId]);

  const handleHeaderRename = useCallback(() => {
    if (!activeDocument) return;
    setNewName(activeDocument.title || activeDocument.name || "");
    setRenameProjectId(activeDocument.project_id?.toString() || activeDocument.projectId?.toString() || "none");
    setIsRenameDialogOpen(true);
  }, [activeDocument]);

  const handleHeaderExportSQL = useCallback((dialect: 'postgresql' | 'mysql') => {
    if (activeDocument) {
      handleExportSQL(dialect, { name: activeFileName || 'Untitled' }, nodesRef.current, edgesRef.current);
    }
  }, [activeDocument, activeFileName, handleExportSQL]);

  const handleHeaderExportPDF = useCallback(() => {
    if (activeDocument) {
      handleExportPDF(activeFileName || 'Untitled');
    }
  }, [activeDocument, activeFileName, handleExportPDF]);

  const handleHeaderExportImage = useCallback(() => {
    if (activeDocument) {
      handleExportImage(activeFileName || 'Untitled');
    }
  }, [activeDocument, activeFileName, handleExportImage]);

  useUpdateCheck(() => handleViewChange('changelog'));

  useEffect(() => {
    const shareInfo = getSharePathInfo();
    if (shareInfo) {
      setIsPublicView(true);
      const savedToken = sessionStorage.getItem(`share_token_${shareInfo.uid}`);
      fetchPublicDocument(shareInfo.type, shareInfo.uid, setNodes, setEdges, savedToken || undefined);
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
      else if (view === 'notes' && activeNoteUid) { const n = notes.find(n => String(n.uid) === String(activeNoteUid)); if (n) saveNote(n); }
      else if (view === 'drawings' && activeDrawingId) { const d = drawings.find(d => String(d.id) === String(activeDrawingId)); if (d) saveDrawing(d); }
      else if (view === 'flowchart' && activeFlowchartId) { const f = flowcharts.find(f => String(f.id) === String(activeFlowchartId)); if (f) saveFlowchart(f); }
    }
  }, [isOnline, view, activeDiagramId, activeNoteUid, activeDrawingId, activeFlowchartId, nodes, edges]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');
    
    if (isAuthenticated && !isPublicView) {
      // One master fetch to rule them all (Sidebar Tree + Initial File Lists)
      fetchProjects(false, debouncedSearchQuery).then(json => {
        if (json && json.data) {
          // Aggregate all files from all projects + uncategorized to populate main states
          const allDiagrams = [
            ...json.data.flatMap((p: any) => p.diagrams || []),
            ...(json.uncategorized?.diagrams || [])
          ];
          const allNotes = [
            ...json.data.flatMap((p: any) => p.notes || []),
            ...(json.uncategorized?.notes || [])
          ];
          const allDrawings = [
            ...json.data.flatMap((p: any) => p.drawings || []),
            ...(json.uncategorized?.drawings || [])
          ];
          const allFlowcharts = [
            ...json.data.flatMap((p: any) => p.flowcharts || []),
            ...(json.uncategorized?.flowcharts || [])
          ];

          // Update main states to keep them in sync with the tree
          // IMPORTANT: Merge with existing data to preserve 'content', 'entities', etc. for active items
          setDiagrams(prev => {
            const currentMap = new Map(prev.map(d => [String(d.id), d]));
            return allDiagrams.map(newD => {
              const existing = currentMap.get(String(newD.id));
              if (existing) {
                return { ...newD, entities: existing.entities, relationships: existing.relationships };
              }
              return newD;
            });
          });

          setNotes(prev => {
            const idMap = new Map(prev.map(n => [String(n.id), n]));
            const uidMap = new Map(prev.map(n => [String(n.uid), n]));
            return allNotes.map(newN => {
              const existing = idMap.get(String(newN.id)) || uidMap.get(String(newN.uid));
              if (existing) {
                return { ...newN, content: existing.content };
              }
              return newN;
            });
          });

          setDrawings(prev => {
            const currentMap = new Map(prev.map(d => [String(d.id), d]));
            return allDrawings.map(newD => {
              const existing = currentMap.get(String(newD.id));
              if (existing) {
                return { ...newD, data: existing.data };
              }
              return newD;
            });
          });

          setFlowcharts(prev => {
            const currentMap = new Map(prev.map(f => [String(f.id), f]));
            return allFlowcharts.map(newF => {
              const existing = currentMap.get(String(newF.id));
              if (existing) {
                return { ...newF, data: existing.data };
              }
              return newF;
            });
          });
        }
      });
      
      // Still need trash as it's a different view
      if (view === 'trash') fetchTrash();
    }
  }, [isAuthenticated, fetchProjects, debouncedSearchQuery, isPublicView, view, fetchTrash, setDiagrams, setNotes, setDrawings, setFlowcharts]);

  // Cross-Tab Synchronization via Broadcast Channel

  // Conflict Resolution: Clear stale local drafts when cloud data is loaded
  useEffect(() => {
    if (isAuthenticated && !isGuest) {
      if (diagrams.length > 0) checkAndClearStaleDrafts(DraftType.ERD, diagrams);
      if (notes.length > 0) checkAndClearStaleDrafts(DraftType.NOTES, notes);
      if (drawings.length > 0) checkAndClearStaleDrafts(DraftType.DRAWINGS, drawings);
      if (flowcharts.length > 0) checkAndClearStaleDrafts(DraftType.FLOWCHART, flowcharts);
    }
  }, [diagrams, notes, drawings, flowcharts, isAuthenticated, isGuest, checkAndClearStaleDrafts]);

  // Safety Gate: Intercept tab close/reload if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isLocalSavingRef.current) {
        e.preventDefault();
        e.returnValue = ''; // Required by modern browsers to trigger the dialog
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Intelligent Fetch on Focus: Refresh data when returning to tab
  useEffect(() => {
    const handleFocus = async () => {
      // Only refresh if online, authenticated, not in public view, and not currently saving/syncing
      if (!isOnline || !isAuthenticated || isPublicView || isLocalSavingRef.current || isRefreshing || isSyncing) return;
      
      // Throttle: don't refresh more than once every 120 seconds (2 minutes)
      const now = Date.now();
      if (now - lastFocusFetchRef.current < 120000) return;
      
      // SAFETY: Don't refresh if we have a very recent local save (within 10 seconds)
      if (now - lastSaveCallRef.current < 10000) return;

      lastFocusFetchRef.current = now;

      try {
        // Refresh the full project tree (all files included) SILENTLY (no skeletons)
        // Using the single source of truth: /api/projects instead of per-type flat endpoints
        await fetchProjects(false, debouncedSearchQuery);
        
        if (view === 'erd') {
          if (activeDiagramId) {
            const draft = await localPersistence.getDraft(DraftType.ERD, activeDiagramId);
            const cloudItem = diagrams.find(d => String(d.id) === String(activeDiagramId));
            const isStale = cloudItem && draft && !draft.sync_pending && (new Date(cloudItem.updated_at).getTime() > draft.updated_at);
            
            if (isStale) {
              console.log("[FocusSync] Cloud is newer, reloading ERD...");
              setIsRefreshing(true); // Only show loader when we ARE certain we need to reload
              await localPersistence.deleteDraft(DraftType.ERD, activeDiagramId);
              await selectDiagram(activeDiagramId, setActiveDiagramId, { silent: true });
              setIsRefreshing(false);
            } else if (!(await localPersistence.hasPendingSync(DraftType.ERD, activeDiagramId))) {
              await selectDiagram(activeDiagramId, setActiveDiagramId, { silent: true });
            }
          }
        } else if (view === 'notes') {
          if (activeNoteUid) {
            const draft = await localPersistence.getDraft(DraftType.NOTES, activeNoteUid);
            const cloudItem = notes.find(n => String(n.uid) === String(activeNoteUid));
            const isStale = cloudItem && draft && !draft.sync_pending && (new Date(cloudItem.updated_at).getTime() > draft.updated_at);
            
            if (isStale) {
              console.log("[FocusSync] Cloud is newer, reloading Note...");
              setIsRefreshing(true);
              await localPersistence.deleteDraft(DraftType.NOTES, activeNoteUid);
              await selectNote(activeNoteUid, { silent: true, contentVersionAtStart: getContentVersion() });
              setIsRefreshing(false);
            } else if (!(await localPersistence.hasPendingSync(DraftType.NOTES, activeNoteUid))) {
              await selectNote(activeNoteUid, { silent: true, contentVersionAtStart: getContentVersion() });
            }
          }
        } else if (view === 'drawings') {
          if (activeDrawingId) {
            const draft = await localPersistence.getDraft(DraftType.DRAWINGS, activeDrawingId);
            const cloudItem = drawings.find(d => String(d.id) === String(activeDrawingId));
            const isStale = cloudItem && draft && !draft.sync_pending && (new Date(cloudItem.updated_at).getTime() > draft.updated_at);
            
            if (isStale) {
              await localPersistence.deleteDraft(DraftType.DRAWINGS, activeDrawingId);
              await selectDrawing(activeDrawingId, { silent: true });
            } else if (!(await localPersistence.hasPendingSync(DraftType.DRAWINGS, activeDrawingId))) {
              await selectDrawing(activeDrawingId, { silent: true });
            }
          }
        } else if (view === 'flowchart') {
          if (activeFlowchartId) {
            const draft = await localPersistence.getDraft(DraftType.FLOWCHART, activeFlowchartId);
            const cloudItem = flowcharts.find(f => String(f.id) === String(activeFlowchartId));
            const isStale = cloudItem && draft && !draft.sync_pending && (new Date(cloudItem.updated_at).getTime() > draft.updated_at);
            
            if (isStale) {
              await localPersistence.deleteDraft(DraftType.FLOWCHART, activeFlowchartId);
              await selectFlowchart(activeFlowchartId, { silent: true });
            } else if (!(await localPersistence.hasPendingSync(DraftType.FLOWCHART, activeFlowchartId))) {
              await selectFlowchart(activeFlowchartId, { silent: true });
            }
          }
        }
      } catch (err) {
        console.warn("Background refresh on focus failed:", err);
      } finally {
        setIsRefreshing(false);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [
    isOnline, isAuthenticated, isPublicView, isRefreshing, isSyncing,
    view, debouncedSearchQuery,
    activeDiagramId, activeNoteUid, activeDrawingId, activeFlowchartId,
    fetchProjects,
    selectDiagram, selectNote, selectDrawing, selectFlowchart,
    setActiveDiagramId,
    diagrams, notes, drawings, flowcharts,
    localPersistence,
    setIsRefreshing,
    getContentVersion,
  ]);

  // Handlers

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Global shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (hasPendingSyncs && !isSyncing && isOnline) {
          syncDrafts();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [hasPendingSyncs, isSyncing, isOnline, syncDrafts]);

  // Listen for NotesPage custom events to open/close modals
  useEffect(() => {
    const onOpenExport = () => setIsExportNoteModalOpen(true);
    const onOpenImport = () => setIsImportNoteModalOpen(true);
    window.addEventListener('notes:open-export-modal', onOpenExport);
    window.addEventListener('notes:open-import-modal', onOpenImport);
    return () => {
      window.removeEventListener('notes:open-export-modal', onOpenExport);
      window.removeEventListener('notes:open-import-modal', onOpenImport);
    };
  }, []);

  const handleViewChange = async (newView: typeof view) => {
    if (!isOnline && !isPublicView) {
      toast.error("Offline Mode: Navigation is disabled.", { duration: 5000 });
      return;
    }
    
    // Flush any pending changes before switching views
    if (newView !== view) {
      await flushPendingSaves();
    }

    setView(newView);
    if (newView !== 'trash' && newView !== 'changelog' && newView !== 'backups') {
      setSidebarView(newView);
    }
  };

  const confirmPermanentDelete = async () => {
    if (itemToDelete) {
      const { id, type } = itemToDelete;
      if (type === 'project') await deleteProjectPermanent(id);
      else if (type === 'erd') await deleteDiagramPermanent(id);
      else if (type === 'notes') await deleteNotePermanent(String(id));
      else if (type === 'drawings') await deleteDrawingPermanent(id);
      else if (type === 'flowchart') await deleteFlowchartPermanent(id);
      setIsPermanentDeleteConfirmOpen(false);
      setItemToDelete(null);
      await fetchTrash();
    }
  };

  const handleDuplicate = () => {
    if (!activeDocument) return;
    setDuplicateName(`${activeDocument.title || activeDocument.name} (Copy)`);
    setIsDuplicateDialogOpen(true);
  };

  const executeDuplicate = async () => {
    if (!activeDocument || !duplicateName.trim()) return;
    
    setIsRefreshing(true);
    try {
      if (view === 'notes') {
        const newNote = await duplicateNote(activeDocument.uid, duplicateName);
        if (newNote) {
          await handleNoteSelect(newNote.uid);
          // Refresh sidebar tree so the new note appears immediately
          fetchProjects(false, debouncedSearchQuery);
          toast.success("Note duplicated successfully");
        }
      } else if (view === 'drawings') {
        const newDrawing = await duplicateDrawing(activeDocument.id, duplicateName);
        if (newDrawing) {
          await handleDrawingSelect(newDrawing.id);
          // Refresh sidebar tree so the new drawing appears immediately
          fetchProjects(false, debouncedSearchQuery);
          toast.success("Drawing duplicated successfully");
        }
      } else {
        toast.info("Duplication for this document type is disabled.");
      }
    } catch (err) {
      console.error("Duplicate error:", err);
      toast.error("Failed to duplicate document.");
    } finally {
      setIsRefreshing(false);
      setIsDuplicateDialogOpen(false);
    }
  };

  const {
    handleNodeClick,
    handleNodeDoubleClick,
    handleEdgeClick,
    handlePaneClick,
    handleMove,
    handleOpenImportModal,
    handleWorkspaceExportSQL,
    handleWorkspaceExportPDF,
    handleWorkspaceExportImage,
    workspaceIsLoading,
    selectedEntity,
  } = useWorkspaceCallbacks({
    isPublicView, setSelectedNodeId, setSelectedEdgeId,
    setIsTablePropertiesOpen, setIsImportModalOpen,
    viewportRef,
    publicData, diagrams, activeDiagramId,
    handleExportSQL, handleExportPDF, handleExportImage,
    nodes, edges,
    view,
    isDiagramsLoading, isERDItemLoading,
    isNotesLoading, isNoteItemLoading,
    isDrawingsLoading, isDrawingItemLoading,
    isFlowchartsLoading, isFlowchartItemLoading,
    selectedNodeId,
  });

  const {
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
  } = useTrashHandlers({
    restoreProject, restoreDiagram, restoreNote, restoreDrawing, restoreFlowchart,
    fetchTrash, fetchProjects, fetchDiagrams, fetchNotes, fetchDrawings, fetchFlowcharts,
    debouncedSearchQuery,
    setItemToDelete, setIsPermanentDeleteConfirmOpen,
  });

  if (isAuthenticated === null && !isPublicView) return <AppInitialization type="init" />;
  if (isPublicLoading) return <AppInitialization type="public" view={view} />;

  if (forbiddenDoc) {
    const shareInfo = getSharePathInfo();
    return (
      <ForbiddenView 
        title={forbiddenDoc.title} message={forbiddenDoc.message} statusCode={forbiddenDoc.status} documentUid={shareInfo?.uid}
        onSubmitToken={async t => { if (shareInfo) { const s = await fetchPublicDocument(shareInfo.type, shareInfo.uid, setNodes, setEdges, t); if (s) sessionStorage.setItem(`share_token_${shareInfo.uid}`, t); else throw new Error("Invalid token"); } }}
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
          diagrams={diagrams} notes={notes} drawings={drawings} projects={projects} uncategorized={uncategorized} flowcharts={flowcharts}
          activeDiagramId={activeDiagramId} activeNoteUid={activeNoteUid} activeDrawingId={activeDrawingId} activeProjectId={activeProjectId} activeFlowchartId={activeFlowchartId}
          view={view}
          onDiagramSelect={handleDiagramSelect} onNoteSelect={handleNoteSelect} onDrawingSelect={handleDrawingSelect} onProjectSelect={handleProjectSelect} onFlowchartSelect={handleFlowchartSelect}

          onDiagramCreate={handleSidebarDiagramCreate}
          onNoteCreate={handleSidebarNoteCreate}
          onDrawingCreate={handleSidebarDrawingCreate}
          onFlowchartCreate={handleSidebarFlowchartCreate}
          onProjectCreate={handleSidebarProjectCreate}
          onProjectUpdate={handleSidebarProjectUpdate}
          onProjectDelete={handleSidebarProjectDelete}
          onDiagramUpdate={handleSidebarDiagramUpdate}
          onNoteUpdate={handleSidebarNoteUpdate}
          onDrawingUpdate={handleSidebarDrawingUpdate}
          onFlowchartUpdate={handleSidebarFlowchartUpdate}
          onDiagramDelete={handleSidebarDiagramDelete}
          onNoteDelete={handleSidebarNoteDelete}
          onDrawingDelete={handleSidebarDrawingDelete}
          onFlowchartDelete={handleSidebarFlowchartDelete}
          onLogout={handleLogout}
          onMoveDiagramToProject={handleSidebarMoveDiagramToProject}
          onMoveNoteToProject={handleSidebarMoveNoteToProject}
          onMoveDrawingToProject={handleSidebarMoveDrawingToProject}
          onMoveFlowchartToProject={handleSidebarMoveFlowchartToProject}
          sidebarView={sidebarView} onViewChange={handleViewChange}
          hasMoreProjects={hasMoreProjects} hasMoreDiagrams={hasMoreDiagrams} hasMoreNotes={hasMoreNotes} hasMoreDrawings={hasMoreDrawings} hasMoreFlowcharts={hasMoreFlowcharts}
          onLoadMoreProjects={handleSidebarLoadMoreProjects}
          onLoadMoreDiagrams={handleSidebarLoadMoreDiagrams}
          onLoadMoreNotes={handleSidebarLoadMoreNotes}
          onNoteCopyMarkdown={handleSidebarNoteCopyMarkdown}
          onNoteImportMarkdown={handleSidebarNoteImportMarkdown}
          onNoteExportMarkdown={handleSidebarNoteExportMarkdown}
          onLoadMoreDrawings={handleSidebarLoadMoreDrawings}
          onLoadMoreFlowcharts={handleSidebarLoadMoreFlowcharts}
          searchQuery={searchQuery} onSearchChange={setSearchQuery} user={user} isOnline={isOnline} isInstallable={isInstallable} onInstall={installApp}
          isProjectsLoading={isProjectsLoading}
          isDiagramsLoading={isDiagramsLoading}
          isNotesLoading={isNotesLoading}
          isDrawingsLoading={isDrawingsLoading}
          isFlowchartsLoading={isFlowchartsLoading}
          isTrashLoading={isTrashLoading}
        />
      )}

      <SidebarInset className={isPublicView ? "w-full" : ""}>
        <MainHeader 
          featureLabel={featureLabel} activeProjectName={activeProjectName} activeFileName={activeFileName} 
          view={view} hasActiveItem={isPublicView ? true : hasActiveItem} 
          syncError={syncError}
          isSyncing={isSyncing}
          isLocalSaving={isLocalSaving}
          isRefreshing={isRefreshing}
          hasPendingSyncs={hasPendingSyncs}
          onSave={syncDrafts}
          activeFileUid={activeFileUid} activeFileId={currentActiveId} initialShareSettings={initialShareSettings} isPublicView={isPublicView}
          onSettingsSaved={handleHeaderSettingsSaved}
          isOnline={isOnline}
          updatedAt={activeDocument?.updated_at}
          onDelete={handleHeaderDelete}
          onRename={handleHeaderRename}
          onExportSQL={handleHeaderExportSQL}
          onExportPDF={handleHeaderExportPDF}
          onExportImage={handleHeaderExportImage}
          onExportMarkdown={handleExportMarkdown}
          onCopyMarkdown={handleCopyMarkdown}
          onImportMarkdown={handleImportMarkdown}
          onDuplicate={handleDuplicate}
          isGuest={isGuest}
        />

        <NotesPage
          notes={notes}
          setNotes={setNotes}
          activeNoteUid={activeNoteUid}
          setActiveNoteUid={setActiveNoteUid}
          isAuthenticated={isAuthenticated}
          notesSaveTimeout={notesSaveTimeout}
          view={view}
          setView={setView}
          setSidebarView={setSidebarView}
        />

        <ImportNoteModal 
          isOpen={isImportNoteModalOpen} 
          onClose={() => setIsImportNoteModalOpen(false)}
          onImport={executeImportMarkdown}
        />

        <ExportNoteModal
          isOpen={isExportNoteModalOpen}
          onClose={() => setIsExportNoteModalOpen(false)}
          onExport={(format, options, pageSize) => {
            if (activeNote) {
              if (format === 'markdown') {
                executeExportMarkdown();
              } else if (format === 'pdf') {
                NoteExporter.exportToPDF(activeNote as any, options, pageSize);
              } else if (format === 'print') {
                NoteExporter.printNote(activeNote as any, options);
              } else if (format === 'word') {
                NoteExporter.exportToWord(activeNote as any, options);
              }
            }
          }}
        />

        <WorkspaceContent 
          view={view}
          nodes={nodes}
          edges={edges}
          activeDiagramId={activeDiagramId}
          isPublicView={isPublicView}
          publicData={publicData}
          isLoading={workspaceIsLoading}
          isReadOnly={isPublicView}
          hasActiveItem={hasActiveItem}

          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          selectedNodeId={selectedNodeId}
          addEntity={addEntity}
          undo={undo}
          redo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          takeSnapshot={takeSnapshot}
          onNodeDragStop={onNodeDragStop}
          onMoveEnd={onMoveEnd}

          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          onMove={handleMove}
          openImportModal={handleOpenImportModal}
          handleExportSQL={handleWorkspaceExportSQL}
          handleExportPDF={handleWorkspaceExportPDF}
          handleExportImage={handleWorkspaceExportImage}

          isImportModalOpen={isImportModalOpen}
          setIsImportModalOpen={setIsImportModalOpen}
          setNodes={setNodes}
          setEdges={setEdges}
          saveDiagram={saveDiagram}
          triggerDebouncedSync={triggerDebouncedSync}
          broadcastMessage={broadcastMessage}
          setIsLocalSaving={setIsLocalSaving}
          viewportRef={viewportRef}
          lastLoadedDiagramIdRef={lastLoadedDiagramIdRef}

          activeNote={activeNote}
          activeNoteUid={activeNoteUid}
          saveNote={saveNote}
          handleNoteChange={handleNoteChange}
          deleteNote={deleteNote}

          activeDrawing={activeDrawing}
          activeDrawingId={activeDrawingId}
          saveDrawing={saveDrawing}
          handleDrawingChange={handleDrawingChange}
          deleteDrawing={deleteDrawing}

          activeFlowchart={activeFlowchart}
          activeFlowchartId={activeFlowchartId}
          handleFlowchartChange={handleFlowchartChange}

          trashData={trashData}
          isTrashLoading={isTrashLoading}
          restoreProject={handleTrashRestoreProject}
          restoreDiagram={handleTrashRestoreDiagram}
          restoreNote={handleTrashRestoreNote}
          restoreDrawing={handleTrashRestoreDrawing}
          restoreFlowchart={handleTrashRestoreFlowchart}
          handleProjectPermanentDelete={handleTrashProjectPermanentDelete}
          handleDiagramPermanentDelete={handleTrashDiagramPermanentDelete}
          handleNotePermanentDelete={handleTrashNotePermanentDelete}
          handleDrawingPermanentDelete={handleTrashDrawingPermanentDelete}
          handleFlowchartPermanentDelete={handleTrashFlowchartPermanentDelete}
          fetchTrash={fetchTrash}
        />

        <FeedbackDialog />

        <DeleteConfirmModal isOpen={isPermanentDeleteConfirmOpen} onOpenChange={setIsPermanentDeleteConfirmOpen} onConfirm={confirmPermanentDelete} onCancel={() => setItemToDelete(null)} itemType={itemToDelete?.type || ''} />

        {/* Entity Properties Modal */}
        {!isPublicView && (
          <TablePropertiesModal
            isOpen={isTablePropertiesOpen && !!selectedNodeId}
            onOpenChange={setIsTablePropertiesOpen}
            selectedEntity={selectedEntity}
            handleEntityUpdate={handleEntityUpdate}
            deleteEntity={deleteEntity}
            setSelectedNodeId={setSelectedNodeId}
            setIsDeleteAlertOpen={setIsDeleteAlertOpen}
          />
        )}

        {/* Rename Dialog */}
        {!isPublicView && (
          <RenameDocumentDialog
            isOpen={isRenameDialogOpen}
            onOpenChange={setIsRenameDialogOpen}
            view={view}
            activeDocument={activeDocument}
            newName={newName}
            setNewName={setNewName}
            projects={projects}
            selectedProjectId={renameProjectId}
            setSelectedProjectId={setRenameProjectId}
            updateDiagram={updateDiagram}
            updateNote={updateNote}
            updateDrawing={updateDrawing}
            updateFlowchart={updateFlowchart}
            onMoveDiagramToProject={moveDiagramToProject}
            onMoveNoteToProject={moveNoteToProject}
            onMoveDrawingToProject={moveDrawingToProject}
            onMoveFlowchartToProject={moveFlowchartToProject}
            onRenameSuccess={fetchProjects}
          />
        )}

        {/* Move to Trash Confirmation Alert */}
        <MoveToTrashAlert
          isOpen={isMoveToTrashAlertOpen}
          onOpenChange={setIsMoveToTrashAlertOpen}
          activeDocument={activeDocument}
          view={view}
          deleteDiagram={deleteDiagram}
          deleteNote={deleteNote}
          deleteDrawing={deleteDrawing}
          deleteFlowchart={deleteFlowchart}
          fetchTrash={fetchTrash}
        />


        {/* Relationship Properties Modal */}
        {!isPublicView && (
          <RelationshipPropertiesModal
            isOpen={!!selectedEdgeId}
            onOpenChange={(open) => { if (!open) setSelectedEdgeId(null); }}
            selectedEdge={edges.find(e => e.id === selectedEdgeId) || null}
            nodes={nodes}
            handleEdgeUpdate={handleEdgeUpdate}
            deleteEdge={deleteEdge}
          />
        )}

        {/* Delete Confirmation Alert */}
        <DeleteEntityAlert
          isOpen={isDeleteAlertOpen}
          onOpenChange={setIsDeleteAlertOpen}
          selectedEntity={selectedEntity}
          deleteEntity={deleteEntity}
          setSelectedNodeId={setSelectedNodeId}
        />

        {/* Duplicate Document Dialog */}
        <DuplicateDocumentDialog
          isOpen={isDuplicateDialogOpen}
          onOpenChange={setIsDuplicateDialogOpen}
          view={view}
          duplicateName={duplicateName}
          setDuplicateName={setDuplicateName}
          executeDuplicate={executeDuplicate}
          isRefreshing={isRefreshing}
        />
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
