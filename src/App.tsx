import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { 
  ReactFlowProvider,
  Edge,
} from '@xyflow/react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { copyMarkdownToClipboard } from './lib/markdownUtils';

// Components
import { AppSidebar } from './components/app-sidebar';
import { FeedbackDialog } from "@/components/FeedbackDialog"
import { Login } from './components/Login';
import { MainHeader } from './components/MainHeader';
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
import { useFlowchartNavigation } from './hooks/useFlowchartNavigation';
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
  const isNotesDocumentRoute = /^\/notes\/[^/]+$/.test(location.pathname);
  const isERDDocumentRoute = /^\/diagrams\/[^/]+$/.test(location.pathname);
  const isDrawingsDocumentRoute = /^\/drawings\/[^/]+$/.test(location.pathname);
  const isFlowchartDocumentRoute = /^\/flowcharts\/[^/]+$/.test(location.pathname);

  const [isTablePropertiesOpen, setIsTablePropertiesOpen] = useState(false);

  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isPermanentDeleteConfirmOpen, setIsPermanentDeleteConfirmOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number | string, type: 'erd' | 'notes' | 'drawings' | 'flowchart' | 'project', uid?: string } | null>(null);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameProjectId, setRenameProjectId] = useState<string>("none");
  const [isMoveToTrashAlertOpen, setIsMoveToTrashAlertOpen] = useState(false);
  const [isImportNoteModalOpen, setIsImportNoteModalOpen] = useState(false);
  const [isExportNoteModalOpen, setIsExportNoteModalOpen] = useState(false);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState("");
  // Temp document target for editing from table view (where there's no activeDocument)
  const [editDialogNote, setEditDialogNote] = useState<any | null>(null);
  // Temp document target for deletion from table view (where there's no activeDocument)
  const [tableDeleteDoc, setTableDeleteDoc] = useState<any | null>(null);
  // Create document dialog (table view)
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogView, setCreateDialogView] = useState<string>('notes');
  
  // Safety Gate & Persistence State
  const isLocalSavingRef = useRef(false);
  const [isLocalSaving, setIsLocalSavingState] = useState(false);
  const setIsLocalSaving = useCallback((val: boolean) => { isLocalSavingRef.current = val; setIsLocalSavingState(val); }, []);
  const lastLoadedDiagramIdRef = useRef<number | string | null>(null);
  const lastLoadedNoteIdRef = useRef<number | string | null>(null);
  const lastLoadedDrawingIdRef = useRef<string | null>(null);
  const lastLoadedFlowchartIdRef = useRef<number | string | null>(null);
  const lastProcessedDrawingUrlRef = useRef('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isIncomingSyncRef = useRef(false);
  const lastSaveCallRef = useRef<number>(0);
  const lastDiagramLoadTimestampRef = useRef<number>(0);
  const lastFocusFetchRef = useRef<number>(0);
  const initialFetchDoneRef = useRef(false);
  
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

  // Table View URL Params
  const [tableSearchParams, setTableSearchParams] = useSearchParams();
  const selectedWorkspaceUid = tableSearchParams.get('workspace') || null;
  const handleWorkspaceFilter = useCallback((uid: string | null) => {
    setTableSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (uid) {
        next.set('view', 'table');
        next.set('workspace', uid);
      } else {
        next.delete('workspace');
      }
      next.delete('page');
      return next;
    }, { replace: true });
  }, [setTableSearchParams]);
  
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
  const { diagrams, activeDiagramId, setActiveDiagramId,
    fetchDiagrams, createDiagram, updateDiagram, deleteDiagram, restoreDiagram, deleteDiagramPermanent, moveDiagramToProject, saveDiagram,
    diagramsTotal, isLoading: isDiagramsLoading } = useDiagrams(isAuthenticated, view, isGuest);

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
    onEditEntity: () => {
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
    notesTotal, isLoading: isNotesLoading, isItemLoading: isNoteItemLoading, selectNote, duplicateNote
  } = useNotes(isGuest);
  
  const { 
    projects, 
    activeProjectId, 
    setActiveProjectId, 
    fetchProjects, 
    createProject, 
    updateProject, 
    deleteProject,
    restoreProject,
    deleteProjectPermanent,
    isLoading: isProjectsLoading
  } = useProjects(isGuest);
  
  const { 
    drawings, setDrawings, activeDrawingUid: activeDrawingId, setActiveDrawingUid: setActiveDrawingId, fetchDrawings, createDrawing, updateDrawing, deleteDrawing, moveDrawingToProject, saveDrawing, restoreDrawing, deleteDrawingPermanent,
    drawingsTotal,
    isLoading: isDrawingsLoading, isItemLoading: isDrawingItemLoading, selectDrawing, duplicateDrawing
  } = useDrawings(isGuest);

  const {
    flowcharts, setFlowcharts, activeFlowchartId, setActiveFlowchartId, fetchFlowcharts, createFlowchart, updateFlowchart, deleteFlowchart, moveFlowchartToProject, saveFlowchart, restoreFlowchart, deleteFlowchartPermanent, flowchartsTotal,
    isLoading: isFlowchartsLoading, isItemLoading: isFlowchartItemLoading, selectFlowchart
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
      await selectDrawing(String(id), { silent: true });
    } else if (view === 'flowchart' && dataType === DraftType.FLOWCHART && String(id) === String(activeFlowchartId)) {
      console.log("[Broadcast] Reloading Flowchart from local draft updated in another tab");
      await selectFlowchart(String(id), { silent: true });
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
    activeDiagram,
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
  const { handleNoteChange, notesSaveTimeout } = useNoteChangeHandler({
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
    setDrawings(prev => prev.map(d => String(d.uid ?? d.id) === String(drawingId) ? { ...d, data } : d));
    
    setIsLocalSaving(true);
    if (drawingsSaveTimeout.current) clearTimeout(drawingsSaveTimeout.current);
    
    // SAFETY: Drawing ID Validation Guard
    if (lastLoadedDrawingIdRef.current !== activeDrawingId) return;

    drawingsSaveTimeout.current = setTimeout(async () => {
      // SAFETY: Wait if still loading/refreshing
      if (isRefreshing || isDrawingItemLoading) return;
      
      const currentDrawing = drawingsRef.current.find(d => String(d.uid ?? d.id) === String(drawingId));
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
    
    // Skip if data hasn't actually changed (prevents re-render loop)
    setFlowcharts(prev => {
      const existing = prev.find(f => String(f.uid ?? f.id) === String(flowchartId));
      if (existing && existing.data === dataString) return prev;
      return prev.map(f => String(f.uid ?? f.id) === String(flowchartId) ? { ...f, data: dataString } : f);
    });
    
    setIsLocalSaving(true);
    if (flowchartsSaveTimeout.current) clearTimeout(flowchartsSaveTimeout.current);
    
    // SAFETY: Flowchart ID Validation Guard
    if (lastLoadedFlowchartIdRef.current !== activeFlowchartId) return;

    flowchartsSaveTimeout.current = setTimeout(async () => {
      // SAFETY: Wait if still loading/refreshing
      if (isRefreshing || isFlowchartItemLoading) return;
      
      const currentFlowchart = flowchartsRef.current.find(f => String(f.uid ?? f.id) === String(flowchartId));
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

  // ── Flowchart Navigation ──
  // Extracted to useFlowchartNavigation: handleFlowchartSelect, URL routing,
  // view cleanup, and flowchart loaded tracking.
  const { handleFlowchartSelect } = useFlowchartNavigation({
    flowcharts,
    setFlowcharts,
    activeFlowchartId,
    setActiveFlowchartId,
    view,
    setView,
    setSidebarView,
    selectFlowchart,
    flushPendingSaves,
    isAuthenticated,
    projects,
    lastLoadedFlowchartIdRef,
  });

  async function handleDrawingSelect(uid: string) {
    if (activeDrawingId === uid && view === 'drawings') return; 
    await flushPendingSaves();
    setView('drawings');
    // Clear current drawing data to avoid showing stale data while loading
    setDrawings(prev => prev.map(d => String(d.uid ?? d.id) === uid ? { ...d, data: undefined } : d));
    lastProcessedDrawingUrlRef.current = '/drawings/' + uid;
    navigate('/drawings/' + uid, { replace: true });
    await selectDrawing(uid);
    lastLoadedDrawingIdRef.current = uid;
  }

  // ── URL Routing for /drawings/:uid ──
  // Handles page refresh on a drawings URL
  useEffect(() => {
    if (!isAuthenticated || getSharePathInfo()) return;
    if (lastProcessedDrawingUrlRef.current === location.pathname) return;
    const m = location.pathname.match(/^\/drawings\/([^/]+)/);
    if (m) {
      lastProcessedDrawingUrlRef.current = location.pathname;
      handleDrawingSelect(m[1]);
    }
  }, [isAuthenticated, location.pathname]);


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
    const currentProject = projects?.find((proj: any) => String(proj.id) === String(activeDocument.project_id) || String(proj.uid) === String(activeDocument.project_id) || String(proj.uid) === String(activeDocument.projects?.uid));
    setRenameProjectId(currentProject ? String(currentProject.id) : "none");
    setIsRenameDialogOpen(true);
  }, [activeDocument, projects]);

  // Open RenameDocumentDialog for a document from table view (no activeDocument)
  const handleOpenEditDocument = useCallback((uid: string) => {
    let doc: any = null;
    if (view === 'notes') {
      doc = notes?.find((n: any) => n.uid === uid || String(n.id) === uid);
    } else if (view === 'erd') {
      doc = diagrams?.find((d: any) => d.uid === uid || String(d.id) === uid);
    } else if (view === 'drawings') {
      doc = drawings?.find((d: any) => d.uid === uid || String(d.id) === uid);
    } else if (view === 'flowchart') {
      doc = flowcharts?.find((f: any) => f.uid === uid || String(f.id) === uid);
    }
    if (!doc) return;
    setEditDialogNote(doc);
    setNewName(doc.title || doc.name || '');
    const currentProject = projects?.find((proj: any) => String(proj.id) === String(doc.project_id) || String(proj.uid) === String(doc.project_id) || String(proj.uid) === String(doc.projects?.uid));
    setRenameProjectId(currentProject ? String(currentProject.id) : 'none');
    setIsRenameDialogOpen(true);
  }, [view, notes, diagrams, drawings, flowcharts, projects]);

  // Open RenameDocumentDialog for creating a document from table view
  const handleOpenCreateDocument = useCallback((featureView: string) => {
    setNewName('');
    // Pre-select current workspace filter if it matches a known project
    if (selectedWorkspaceUid) {
      const p = projects?.find((proj: any) => proj.uid === selectedWorkspaceUid);
      if (p) {
        setRenameProjectId(String(p.id));
      } else {
        setRenameProjectId('none');
      }
    } else {
      setRenameProjectId('none');
    }
    setCreateDialogView(featureView);
    setCreateDialogOpen(true);
    setEditDialogNote(null);
  }, [selectedWorkspaceUid, projects]);

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
      else if (view === 'drawings' && activeDrawingId) { const d = drawings.find(d => String(d.uid ?? d.id) === String(activeDrawingId)); if (d) saveDrawing(d); }
      else if (view === 'flowchart' && activeFlowchartId) { const f = flowcharts.find(f => String(f.uid ?? f.id) === String(activeFlowchartId)); if (f) saveFlowchart(f); }
    }
  }, [isOnline, view, activeDiagramId, activeNoteUid, activeDrawingId, activeFlowchartId, nodes, edges]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Apply dark mode
  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');
  }, []);

  // Initial data fetch — only runs once on mount (or on auth gain)
  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    if (!isAuthenticated || isPublicView) return;

    initialFetchDoneRef.current = true;
    lastFocusFetchRef.current = Date.now();

    fetchProjects(false, '');
  }, [isAuthenticated, isPublicView, fetchProjects]);

  // Focus-sync: fetch trash when switching to trash view (depend only on view)
  useEffect(() => {
    if (view === 'trash' && isAuthenticated && !isPublicView) {
      fetchTrash();
    }
  }, [view, isAuthenticated, isPublicView, fetchTrash]);

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
        // Only check stale drafts for active document — no full project refetch
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
            const cloudItem = drawings.find(d => String(d.uid ?? d.id) === String(activeDrawingId));
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
            const cloudItem = flowcharts.find(f => String(f.uid ?? f.id) === String(activeFlowchartId));
            const isStale = cloudItem && draft && !draft.sync_pending && (new Date(cloudItem.updated_at).getTime() > draft.updated_at);
            
            if (isStale) {
              await localPersistence.deleteDraft(DraftType.FLOWCHART, activeFlowchartId);
              await selectFlowchart(String(activeFlowchartId), { silent: true });
            } else if (!(await localPersistence.hasPendingSync(DraftType.FLOWCHART, activeFlowchartId))) {
              await selectFlowchart(String(activeFlowchartId), { silent: true });
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
    view,
    activeDiagramId, activeNoteUid, activeDrawingId, activeFlowchartId,
    selectDiagram, selectNote, selectDrawing, selectFlowchart,
    setActiveDiagramId,
    diagrams, notes, drawings, flowcharts,
    localPersistence,
    setIsRefreshing,
    getContentVersion,
  ]);

  // 🗂 Server-side pagination: fetch notes from dedicated endpoint when table params change
  useEffect(() => {
    const isTableMode = view === 'notes' && !hasActiveItem;
    if (!isTableMode) return;
    if (!isAuthenticated || isPublicView) return;

    // Map workspace UUID → numeric project ID for the API
    let projId: string | number | null = 'all';
    if (selectedWorkspaceUid) {
      const p = projects?.find((proj: any) => proj.uid === selectedWorkspaceUid);
      projId = p ? p.id : null;
    }

    const pageNum = parseInt(tableSearchParams.get('page') || '1', 10);

    fetchNotes(false, projId, '', null, 10, pageNum);
  }, [view, hasActiveItem, selectedWorkspaceUid, tableSearchParams, projects, fetchNotes, isAuthenticated, isPublicView]);

  // 🗂 Server-side pagination: fetch diagrams from dedicated endpoint when table params change
  useEffect(() => {
    const isTableMode = view === 'erd' && !hasActiveItem;
    if (!isTableMode) return;
    if (!isAuthenticated || isPublicView) return;

    let projId: string | number | null = 'all';
    if (selectedWorkspaceUid) {
      const p = projects?.find((proj: any) => proj.uid === selectedWorkspaceUid);
      projId = p ? p.id : null;
    }

    const pageNum = parseInt(tableSearchParams.get('page') || '1', 10);

    fetchDiagrams(false, projId, '', null, 10, pageNum);
  }, [view, hasActiveItem, selectedWorkspaceUid, tableSearchParams, projects, fetchDiagrams, isAuthenticated, isPublicView]);

  // 🗂 Server-side pagination: fetch flowcharts from dedicated endpoint when table params change
  useEffect(() => {
    const isTableMode = view === 'flowchart' && !hasActiveItem;
    if (!isTableMode) return;
    if (!isAuthenticated || isPublicView) return;

    let projId: string | number | null = 'all';
    if (selectedWorkspaceUid) {
      const p = projects?.find((proj: any) => proj.uid === selectedWorkspaceUid);
      projId = p ? p.id : null;
    }

    const pageNum = parseInt(tableSearchParams.get('page') || '1', 10);

    fetchFlowcharts(false, projId, '', null, 10, { page: pageNum });
  }, [view, hasActiveItem, selectedWorkspaceUid, tableSearchParams, projects, fetchFlowcharts, isAuthenticated, isPublicView]);

  // 🗂 Server-side pagination: fetch drawings from dedicated endpoint when table params change
  useEffect(() => {
    const isTableMode = view === 'drawings' && !hasActiveItem;
    if (!isTableMode) return;
    if (!isAuthenticated || isPublicView) return;

    let projId: string | number | null = 'all';
    if (selectedWorkspaceUid) {
      const p = projects?.find((proj: any) => proj.uid === selectedWorkspaceUid);
      projId = p ? p.id : null;
    }

    const pageNum = parseInt(tableSearchParams.get('page') || '1', 10);

    fetchDrawings(false, projId, '', null, 10, pageNum, { silent: true });
  }, [view, hasActiveItem, selectedWorkspaceUid, tableSearchParams, projects, fetchDrawings, isAuthenticated, isPublicView]);

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

  const handleViewChange = async (newView: typeof view, showTable?: boolean, workspaceUid?: string | null) => {
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

    // "Show Table" mode: clear active document and navigate to table view list
    if (showTable) {
      setActiveNoteUid(null);
      setActiveDrawingId(null);
      setActiveDiagramId(null);
      setActiveFlowchartId(null);
      let tableUrl = '/?view=table&feature=' + newView;
      if (workspaceUid) tableUrl += '&workspace=' + workspaceUid;
      if (tableUrl !== location.pathname + location.search) {
        navigate(tableUrl, { replace: true });
      }
      return;
    }

    // Navigate to the correct URL when switching views (the active document is preserved)
    if (!getSharePathInfo()) {
      let targetUrl: string | null = null;
      if (newView === 'notes' && activeNoteUid) targetUrl = '/notes/' + activeNoteUid;
      else if (newView === 'flowchart' && activeFlowchart) targetUrl = '/flowcharts/' + (activeFlowchart.uid || activeFlowchartId);
      else if (newView === 'erd' && activeDiagramId) targetUrl = '/diagrams/' + activeDiagramId;
      else if (newView === 'drawings' && activeDrawingId) targetUrl = '/drawings/' + activeDrawingId;
      else if (newView !== 'trash' && newView !== 'changelog' && newView !== 'backups') targetUrl = '/';
      
      if (targetUrl && targetUrl !== location.pathname) {
        navigate(targetUrl, { replace: true });
      }
    }
  };

  const confirmPermanentDelete = async () => {
    if (itemToDelete) {
      const { id, type, uid } = itemToDelete;
      if (type === 'project') await deleteProjectPermanent(id);
      else if (type === 'erd') await deleteDiagramPermanent(id);
      else if (type === 'notes') await deleteNotePermanent(String(id));
      else if (type === 'drawings') await deleteDrawingPermanent(uid || String(id));
      else if (type === 'flowchart') await deleteFlowchartPermanent(uid || String(id));
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
        const newDrawing = await duplicateDrawing(activeDocument.uid, duplicateName);
        if (newDrawing) {
          await handleDrawingSelect(newDrawing.uid);
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
          view={view}
          projects={projects}
          onViewChange={handleViewChange}
          onNoteSelect={handleNoteSelect}
          onDrawingSelect={handleDrawingSelect}
          onProjectCreate={handleSidebarProjectCreate}
          onProjectUpdate={handleSidebarProjectUpdate}
          onProjectDelete={handleSidebarProjectDelete}
          onLogout={handleLogout}
          onWorkspaceFilter={handleWorkspaceFilter}
          selectedWorkspaceUid={selectedWorkspaceUid}
          searchQuery={searchQuery} onSearchChange={setSearchQuery} user={user} isOnline={isOnline} isInstallable={isInstallable} onInstall={installApp}
          isProjectsLoading={isProjectsLoading}
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
          activeDiagram={activeDiagram}
          isNotesDocumentRoute={isNotesDocumentRoute}
          isERDDocumentRoute={isERDDocumentRoute}
          isDrawingsDocumentRoute={isDrawingsDocumentRoute}
          isFlowchartDocumentRoute={isFlowchartDocumentRoute}

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
          notes={notes}
          notesTotal={notesTotal}
          projects={projects}
          onNoteCreate={() => handleOpenCreateDocument('notes')}
          onNoteSelect={handleNoteSelect}
          selectedWorkspaceUid={selectedWorkspaceUid}
          tablePage={parseInt(tableSearchParams.get('page') || '1', 10)}
          onTablePageChange={(p) => {
            const params = new URLSearchParams(tableSearchParams);
            params.set('page', String(p));
            setTableSearchParams(params, { replace: true });
          }}
          onWorkspaceClick={(uid) => {
            const params = new URLSearchParams(tableSearchParams);
            if (uid) {
              params.set('workspace', uid);
            } else {
              params.delete('workspace');
            }
            params.set('page', '1');
            setTableSearchParams(params, { replace: true });
          }}
          onOpenEditDocument={(uid) => handleOpenEditDocument(uid)}
          onDeleteNote={async (uid) => {
            const note = notes?.find((n: any) => n.uid === uid || String(n.id) === uid);
            if (note) {
              setTableDeleteDoc(note);
              setIsMoveToTrashAlertOpen(true);
            }
          }}

          diagrams={diagrams}
          diagramsTotal={diagramsTotal}
          onDiagramCreate={() => handleOpenCreateDocument('erd')}
          onDiagramSelect={handleDiagramSelect}
          onDeleteDiagram={async (uid) => {
            const diagram = diagrams?.find((d: any) => d.uid === uid || String(d.id) === uid);
            if (diagram) {
              setTableDeleteDoc(diagram);
              setIsMoveToTrashAlertOpen(true);
            }
          }}

          flowcharts={flowcharts}
          flowchartsTotal={flowchartsTotal}
          onFlowchartCreate={() => handleOpenCreateDocument('flowchart')}
          onFlowchartSelect={handleFlowchartSelect}
          onDeleteFlowchart={async (uid) => {
            const flowchart = flowcharts?.find((f: any) => f.uid === uid || String(f.id) === uid);
            if (flowchart) {
              setTableDeleteDoc(flowchart);
              setIsMoveToTrashAlertOpen(true);
            }
          }}

          activeDrawing={activeDrawing}
          activeDrawingId={activeDrawingId}
          drawings={drawings}
          drawingsTotal={drawingsTotal}
          onDrawingCreate={() => handleOpenCreateDocument('drawings')}
          onDrawingSelect={handleDrawingSelect}
          onDeleteDrawing={async (uid) => {
            const drawing = drawings?.find((d: any) => d.uid === uid || String(d.id) === uid);
            if (drawing) {
              setTableDeleteDoc(drawing);
              setIsMoveToTrashAlertOpen(true);
            }
          }}
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

        <MoveToTrashAlert
          isOpen={isPermanentDeleteConfirmOpen}
          onOpenChange={setIsPermanentDeleteConfirmOpen}
          mode="permanent-delete"
          itemType={itemToDelete?.type || ''}
          onConfirm={confirmPermanentDelete}
          onAfterDelete={undefined}
        />

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
            onOpenChange={(open) => { setIsRenameDialogOpen(open); if (!open) setEditDialogNote(null); }}
            view={view}
            activeDocument={editDialogNote ?? activeDocument}
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
            onRenameSuccess={undefined}
          />
        )}

        {/* Create Document Dialog (from table view) */}
        {!isPublicView && (
          <RenameDocumentDialog
            isOpen={createDialogOpen}
            onOpenChange={(open) => { setCreateDialogOpen(open); }}
            mode="create"
            view={createDialogView}
            activeDocument={null}
            newName={newName}
            setNewName={setNewName}
            projects={projects}
            selectedProjectId={renameProjectId}
            setSelectedProjectId={setRenameProjectId}
            onCreate={(title, projectId) => {
              const viewCb = createDialogView;
              if (viewCb === 'notes') {
                handleSidebarNoteCreate(title, projectId);
              } else if (viewCb === 'erd') {
                handleSidebarDiagramCreate(title, projectId);
              } else if (viewCb === 'drawings') {
                handleSidebarDrawingCreate(title, projectId);
              } else if (viewCb === 'flowchart') {
                handleSidebarFlowchartCreate(title, projectId);
              }
            }}
            onRenameSuccess={undefined}
          />
        )}

        {/* Move to Trash Confirmation Alert */}
        <MoveToTrashAlert
          isOpen={isMoveToTrashAlertOpen}
          onOpenChange={(open) => { setIsMoveToTrashAlertOpen(open); if (!open) setTableDeleteDoc(null); }}
          activeDocument={tableDeleteDoc ?? activeDocument}
          view={view}
          deleteDiagram={deleteDiagram}
          deleteNote={deleteNote}
          deleteDrawing={deleteDrawing}
          deleteFlowchart={deleteFlowchart}
          fetchTrash={fetchTrash}
          onAfterDelete={() => { setTableDeleteDoc(null); handleViewChange(view, true); }}
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
