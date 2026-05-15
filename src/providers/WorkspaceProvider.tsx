import React, {
  useState, useCallback, useEffect, useMemo, useRef, createContext, useContext,
} from 'react';
import {
  Node, Edge, OnNodesChange, OnEdgesChange, OnConnect,
} from '@xyflow/react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { copyMarkdownToClipboard } from '../lib/markdownUtils';

// Components
import { NotesPage } from '@/components/pages/NotesPage';

// Hooks
import { useAuth } from '../hooks/useAuth';
import { useDiagrams } from '../hooks/useDiagrams';
import { useNotes } from '../hooks/useNotes';
import { useProjects } from '../hooks/useProjects';
import { useDrawings } from '../hooks/useDrawings';
import { useFlowcharts } from '../hooks/useFlowcharts';
import { useTrash } from '../hooks/useTrash';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import { useSyncService } from '../hooks/useSyncService';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { useERDSession } from '../hooks/useERDSession';
import { useSQLGenerator } from '../hooks/useSQLGenerator';
import { useUpdateCheck } from '../hooks/useUpdateCheck';
import { useImageExporter } from '../hooks/useImageExporter';
import {
  useBroadcastChannel, BroadcastMessageType,
} from '../hooks/useBroadcastChannel';
import { useSidebarHandlers } from '../hooks/useSidebarHandlers';
import { useTrashHandlers } from '../hooks/useTrashHandlers';
import { useWorkspaceCallbacks } from '../hooks/useWorkspaceCallbacks';
import { useAutoSave } from '../hooks/useAutoSave';
import { useDiagramNavigation } from '../hooks/useDiagramNavigation';
import { useNoteNavigation } from '../hooks/useNoteNavigation';
import { useFlowchartNavigation } from '../hooks/useFlowchartNavigation';
import { useNoteChangeHandler } from '../hooks/useNoteChangeHandler';
import { useDrawingChangeHandler } from '../hooks/useDrawingChangeHandler';
import { useFlowchartChangeHandler } from '../hooks/useFlowchartChangeHandler';
import { useFocusSync } from '../hooks/useFocusSync';
import { useTableViewPagination } from '../hooks/useTableViewPagination';
import { useDocumentActions } from '../hooks/useDocumentActions';
import { useAppMetadata } from '../hooks/useAppMetadata';
import { useFileOperations } from '../hooks/useFileOperations';
import { useActiveItemGuard } from '../hooks/useActiveItemGuard';

// Lib & Types
import { getSharePathInfo } from '../lib/urlUtils';
import { toast } from 'sonner';
import { Entity, DraftType, AppView } from '../types';

// ──────────────────────────────────────────────────────
// View derivation from URL (replaces useState + effect)
// ──────────────────────────────────────────────────────
function deriveViewFromPath(pathname: string): AppView {
  if (pathname === '/trash') return 'trash';
  if (pathname === '/ai-settings') return 'ai-settings';
  if (pathname === '/backups') return 'backups';
  if (pathname === '/changelog') return 'changelog';
  if (pathname.startsWith('/table/')) {
    const match = pathname.match(/^\/table\/([^/]+)$/);
    if (match) {
      const valid = ['erd', 'notes', 'drawings', 'flowchart'];
      if (valid.includes(match[1])) return match[1] as AppView;
    }
  }
  if (pathname.startsWith('/notes/')) return 'notes';
  if (pathname.startsWith('/diagrams/')) return 'erd';
  if (pathname.startsWith('/drawings/')) return 'drawings';
  if (pathname.startsWith('/flowcharts/')) return 'flowchart';
  return (localStorage.getItem('erd-builder-last-view') as AppView) || 'notes';
}

function deriveSidebarView(view: AppView): AppView {
  const sidebarFeatures: AppView[] = ['erd', 'notes', 'drawings', 'flowchart'];
  return sidebarFeatures.includes(view) ? view : 'notes';
}

// ──────────────────────────────────────────────────────
// Context type
// ──────────────────────────────────────────────────────
export interface WorkspaceContextValue {
  // Auth
  user: any;
  isGuest: boolean;
  handleLogout: () => void;

  // Derived view
  view: AppView;
  sidebarView: AppView;

  // Public
  isPublicView: boolean;
  setIsPublicView: (v: boolean) => void;
  publicData: any;
  isPublicLoading: boolean;
  forbiddenDoc: any;
  fetchPublicDocument: any;

  // Data
  diagrams: any[];
  notes: any[];
  drawings: any[];
  flowcharts: any[];
  projects: any[];
  trashData: { diagrams: any[]; notes: any[]; drawings: any[]; flowcharts: any[]; projects: any[] };
  nodes: Node<Entity>[];
  edges: Edge[];
  setNodes: (nodes: Node<Entity>[] | ((prev: Node<Entity>[]) => Node<Entity>[])) => void;
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;

  // Active IDs
  activeDiagramId: any;
  setActiveDiagramId: (id: any) => void;
  activeNoteUid: string | null;
  setActiveNoteUid: (uid: string | null) => void;
  activeDrawingId: any;
  setActiveDrawingId: (id: any) => void;
  activeFlowchartId: any;
  setActiveFlowchartId: (id: any) => void;
  activeProjectId: any;
  setActiveProjectId: (id: any) => void;

  // Loading
  isProjectsLoading: boolean;
  isLoading: boolean;
  isTrashLoading: boolean;
  isLocalSaving: boolean;
  isRefreshing: boolean;
  isSyncing: boolean;
  isOnline: boolean;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  debouncedSearchQuery: string;
  fileSearchQuery: string;
  setFileSearchQuery: (q: string) => void;
  debouncedFileSearchQuery: string;
  fileSearchRef: React.RefObject<HTMLInputElement | null>;

  // Pagination
  selectedWorkspaceUid: string | null;
  handleWorkspaceFilter: (uid: string | null) => void;

  // Computed
  activeDocument: any;
  activeNote: any;
  activeDiagram: any;
  activeDrawing: any;
  activeFlowchart: any;
  hasActiveItem: boolean;
  activeFileName: string;
  activeFileUid: string;
  activeProjectName: string;
  featureLabel: string;
  initialShareSettings: any;
  currentActiveId: any;
  isNotesDocumentRoute: boolean;
  isERDDocumentRoute: boolean;
  isDrawingsDocumentRoute: boolean;
  isFlowchartDocumentRoute: boolean;

  // Navigation
  handleViewChange: (view: AppView, showTable?: boolean, workspaceUid?: string | null) => Promise<void>;
  handleNoteSelect: (uid: string) => Promise<void>;
  handleDiagramSelect: (id: any) => Promise<void>;
  handleDrawingSelect: (uid: string) => Promise<void>;
  handleFlowchartSelect: (id: any) => Promise<void>;

  // Content
  handleNoteChange: (content: string) => void;
  handleDrawingChange: (data: string) => void;
  handleFlowchartChange: (nodes: any[], edges: any[]) => void;
  handleEntityUpdate: (entity: Entity, options?: { immediate?: boolean }) => Promise<void>;

  // Sidebar
  handleSidebarDiagramCreate: (title: string, projectId?: string | null) => Promise<void>;
  handleSidebarNoteCreate: (title: string, projectId?: string | null) => Promise<void>;
  handleSidebarDrawingCreate: (title: string, projectId?: string | null) => Promise<void>;
  handleSidebarFlowchartCreate: (title: string, projectId?: string | null) => Promise<void>;
  handleSidebarProjectCreate: (name: string) => Promise<void>;
  handleSidebarProjectUpdate: (id: any, data: any) => Promise<void>;
  handleSidebarProjectDelete: (id: any) => Promise<void>;

  // Modals
  isMoveToTrashAlertOpen: boolean;
  setIsMoveToTrashAlertOpen: (open: boolean) => void;
  isDeleteAlertOpen: boolean;
  setIsDeleteAlertOpen: (open: boolean) => void;
  isRenameDialogOpen: boolean;
  setIsRenameDialogOpen: (open: boolean) => void;
  isDuplicateDialogOpen: boolean;
  setIsDuplicateDialogOpen: (open: boolean) => void;
  isImportModalOpen: boolean;
  setIsImportModalOpen: (open: boolean) => void;
  isTablePropertiesOpen: boolean;
  setIsTablePropertiesOpen: (open: boolean) => void;
  isPermanentDeleteConfirmOpen: boolean;
  setIsPermanentDeleteConfirmOpen: (open: boolean) => void;
  isImportNoteModalOpen: boolean;
  setIsImportNoteModalOpen: (open: boolean) => void;
  isExportNoteModalOpen: boolean;
  setIsExportNoteModalOpen: (open: boolean) => void;
  newName: string;
  setNewName: (n: string) => void;
  renameProjectId: string;
  setRenameProjectId: (id: string) => void;
  duplicateName: string;
  setDuplicateName: (n: string) => void;
  itemToDelete: any;
  setItemToDelete: (item: any) => void;
  createDialogOpen: boolean;
  setCreateDialogOpen: (open: boolean) => void;
  createDialogView: string;
  setCreateDialogView: (v: string) => void;
  editDialogNote: any;
  setEditDialogNote: (n: any) => void;
  tableDeleteDoc: any;
  setTableDeleteDoc: (d: any) => void;

  // Header
  handleHeaderDelete: () => void;
  handleHeaderRename: () => void;
  handleHeaderSettingsSaved: () => void;
  handleHeaderExportSQL: (dialect: 'postgresql' | 'mysql') => void;
  handleHeaderExportPDF: () => void;
  handleHeaderExportImage: () => void;
  handleExportMarkdown: () => void;
  handleCopyMarkdown: () => void;
  handleImportMarkdown: () => void;
  handleDuplicate: () => void;
  executeDuplicate: () => Promise<void>;

  // Document actions
  handleOpenEditDocument: (uid: string) => void;
  handleOpenCreateDocument: (v: string) => void;

  // ERD
  onNodesChange: OnNodesChange<Node<Entity>>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  selectedEdgeId: string | null;
  setSelectedEdgeId: (id: string | null) => void;
  selectedEntity: any;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  addEntity: () => void;
  deleteEntity: (id: string) => void;
  deleteEdge: (id: string) => void;
  handleEdgeUpdate: (edgeId: string, label: string) => void;
  handleNodeClick: any;
  handleNodeDoubleClick: any;
  handleEdgeClick: any;
  handlePaneClick: any;
  handleMove: any;
  handleOpenImportModal: () => void;
  handleWorkspaceExportSQL: any;
  handleWorkspaceExportPDF: any;
  handleWorkspaceExportImage: any;
  takeSnapshot: any;
  onNodeDragStop: any;
  onMoveEnd: any;

  // Refs
  viewportRef: any;
  lastLoadedDiagramIdRef: React.MutableRefObject<any>;

  // Sync
  syncDrafts: () => Promise<void>;
  triggerDebouncedSync: () => void;
  broadcastMessage: (type: BroadcastMessageType, entityType: string, id: string | number) => void;
  setIsLocalSaving: (v: boolean) => void;
  hasPendingSyncs: boolean;
  syncError: boolean;
  isInstallable: boolean;
  installApp: () => void;

  // Trash
  handleTrashRestoreProject: (id: any) => Promise<void>;
  handleTrashRestoreDiagram: (id: any) => Promise<void>;
  handleTrashRestoreNote: (id: any) => Promise<void>;
  handleTrashRestoreDrawing: (id: any) => Promise<void>;
  handleTrashRestoreFlowchart: (id: any) => Promise<void>;
  handleTrashProjectPermanentDelete: (id: any) => void;
  handleTrashDiagramPermanentDelete: (id: any) => void;
  handleTrashNotePermanentDelete: (id: any) => void;
  handleTrashDrawingPermanentDelete: (id: any) => void;
  handleTrashFlowchartPermanentDelete: (id: any) => void;
  fetchTrash: () => Promise<void>;

  // Perm delete
  confirmPermanentDelete: () => Promise<void>;

  // CRUD
  saveDiagram: (nodes: Node<Entity>[], edges: Edge[], viewport: any) => Promise<void>;
  saveNote: (note: any) => Promise<boolean>;
  saveDrawing: (drawing: any) => Promise<boolean>;
  saveFlowchart: (flowchart: any) => Promise<boolean>;
  updateDiagram: any;
  updateNote: any;
  updateDrawing: any;
  updateFlowchart: any;
  moveDiagramToProject: (id: any, projectId: string | number | null) => Promise<boolean | undefined>;
  moveNoteToProject: (id: any, projectId: string | number | null) => Promise<boolean | undefined>;
  moveDrawingToProject: (id: any, projectId: string | number | null) => Promise<boolean | undefined>;
  moveFlowchartToProject: (id: any, projectId: string | number | null) => Promise<boolean | undefined>;
  deleteDiagram: any;
  deleteNote: any;
  deleteDrawing: any;
  deleteFlowchart: any;
  fetchProjects: any;
  fetchDiagrams: any;
  fetchNotes: any;
  fetchDrawings: any;
  fetchFlowcharts: any;

  // Counts
  notesTotal: number;
  diagramsTotal: number;
  drawingsTotal: number;
  flowchartsTotal: number;
  workspaceIsLoading: boolean;

  // Pagination
  tableSearchParams: URLSearchParams;
  setTableSearchParams: any;
  tablePage: number;

  // NotesPage side-effect refs
  notesSaveTimeout: React.MutableRefObject<any>;
  drawingsSaveTimeoutRef: React.MutableRefObject<any>;
  flowchartsSaveTimeoutRef: React.MutableRefObject<any>;

  // Last loaded refs (for auto-save)
  lastLoadedNoteIdRef: React.MutableRefObject<any>;
  lastLoadedDrawingIdRef: React.MutableRefObject<any>;
  lastLoadedFlowchartIdRef: React.MutableRefObject<any>;

  // Stable refs
  nodesRef: React.MutableRefObject<any[]>;
  edgesRef: React.MutableRefObject<any[]>;
  notesRef: React.MutableRefObject<any[]>;
  drawingsRef: React.MutableRefObject<any[]>;
  flowchartsRef: React.MutableRefObject<any[]>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// ──────────────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────
// Provider props
// ──────────────────────────────────────────────────────
interface WorkspaceProviderProps {
  children: React.ReactNode;
  isPublicView: boolean;
  publicData: any;
  isPublicLoading: boolean;
  forbiddenDoc: any;
  fetchPublicDocument: any;
  setIsPublicView: (v: boolean) => void;
  handleLogout: () => Promise<void>;
}

export function WorkspaceProvider({
  children,
  isPublicView: _isPublicView,
  publicData: _publicData,
  isPublicLoading: _isPublicLoading,
  forbiddenDoc: _forbiddenDoc,
  fetchPublicDocument: _fetchPublicDocument,
  setIsPublicView: _setIsPublicView,
  handleLogout: _handleLogout,
}: WorkspaceProviderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [tableSearchParams, setTableSearchParams] = useSearchParams();

  // ── Derived view from URL ──
  const view = useMemo(() => deriveViewFromPath(location.pathname), [location.pathname]);
  const [sidebarViewState, setSidebarViewState] = useState<AppView>(() => {
    const saved = localStorage.getItem('erd-builder-last-sidebar-view') as AppView;
    return saved || 'notes';
  });
  const sidebarView = useMemo(() => {
    const sidebarFeatures: AppView[] = ['erd', 'notes', 'drawings', 'flowchart'];
    if (sidebarFeatures.includes(view)) {
      localStorage.setItem('erd-builder-last-sidebar-view', view);
      return view;
    }
    return sidebarViewState;
  }, [view, sidebarViewState]);

  // Persist last view
  useEffect(() => {
    if (!getSharePathInfo()) {
      localStorage.setItem('erd-builder-last-view', view);
    }
  }, [view]);

  // Route-type booleans
  const isNotesDocumentRoute = /^\/notes\/[^/]+$/.test(location.pathname);
  const isERDDocumentRoute = /^\/diagrams\/[^/]+$/.test(location.pathname);
  const isDrawingsDocumentRoute = /^\/drawings\/[^/]+$/.test(location.pathname);
  const isFlowchartDocumentRoute = /^\/flowcharts\/[^/]+$/.test(location.pathname);

  // ── Modal States ──
  const [isTablePropertiesOpen, setIsTablePropertiesOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isPermanentDeleteConfirmOpen, setIsPermanentDeleteConfirmOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number | string; type: string; uid?: string } | null>(null);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameProjectId, setRenameProjectId] = useState('none');
  const [isMoveToTrashAlertOpen, setIsMoveToTrashAlertOpen] = useState(false);
  const [isImportNoteModalOpen, setIsImportNoteModalOpen] = useState(false);
  const [isExportNoteModalOpen, setIsExportNoteModalOpen] = useState(false);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const [editDialogNote, setEditDialogNote] = useState<any | null>(null);
  const [tableDeleteDoc, setTableDeleteDoc] = useState<any | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogView, setCreateDialogView] = useState('notes');

  // ── Safety Gate & Persistence State ──
  const isLocalSavingRef = useRef(false);
  const [isLocalSaving, setIsLocalSavingState] = useState(false);
  const setIsLocalSaving = useCallback(
    (val: boolean) => { isLocalSavingRef.current = val; setIsLocalSavingState(val); },
    [],
  );
  const lastLoadedDiagramIdRef = useRef<any>(null);
  const lastLoadedNoteIdRef = useRef<any>(null);
  const lastLoadedDrawingIdRef = useRef<string | null>(null);
  const lastLoadedFlowchartIdRef = useRef<any>(null);
  const lastProcessedDrawingUrlRef = useRef('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isIncomingSyncRef = useRef(false);
  const lastSaveCallRef = useRef(0);
  const lastDiagramLoadTimestampRef = useRef(0);
  const initialFetchDoneRef = useRef(false);

  // Stable state refs
  const notesRef = useRef<any[]>([]);
  const drawingsRef = useRef<any[]>([]);
  const flowchartsRef = useRef<any[]>([]);
  const nodesRef = useRef<any[]>([]);
  const edgesRef = useRef<any[]>([]);

  // ── Search State ──
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const fileSearchRef = useRef<HTMLInputElement | null>(null);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [debouncedFileSearchQuery, setDebouncedFileSearchQuery] = useState('');

  // ── Compatibility adapters (navigation hooks still call setView/setSidebarView) ──
  // In the new architecture, view is derived from route — setView is a no-op
  const setViewCompat = useCallback((_v: any) => {}, []);
  const setSidebarViewCompat = useCallback(
    (v: any) => { setSidebarViewState(v); },
    [],
  );

  // ── Hooks ──
  const { isAuthenticated, isGuest, user, checkAuth, handleGuestLogin } = useAuth();
  const isOnline = useConnectionStatus();
  const { triggerDebouncedSync, isSyncing, syncError, syncDrafts, checkAndClearStaleDrafts, hasPendingSyncs } = useSyncService(isAuthenticated, isGuest);
  const { isInstallable, installApp } = usePWAInstall();
  const { handleExportSQL } = useSQLGenerator();
  const { handleExportImage, handleExportPDF } = useImageExporter();

  // Use props instead of local hook
  const isPublicView = _isPublicView;
  const publicData = _publicData;
  const isPublicLoading = _isPublicLoading;
  const forbiddenDoc = _forbiddenDoc;
  const fetchPublicDocument = _fetchPublicDocument;
  const setIsPublicView = _setIsPublicView;

  const {
    diagrams, activeDiagramId, setActiveDiagramId,
    fetchDiagrams, createDiagram, updateDiagram, deleteDiagram, restoreDiagram, deleteDiagramPermanent, moveDiagramToProject, saveDiagram,
    diagramsTotal, isLoading: isDiagramsLoading,
  } = useDiagrams(isAuthenticated, view, isGuest);

  // ERD Session
  const broadcastRef = useRef<{
    move: (id: string, x: number, y: number) => void;
    update: (id: string, data: Entity) => void;
    edges: (edges: Edge[]) => void;
  }>({ move: () => {}, update: () => {}, edges: () => {} });

  const erdOptions = useMemo(() => ({
    broadcastNodeMove: (id: string, x: number, y: number) => broadcastRef.current.move(id, x, y),
    broadcastNodeUpdate: (id: string, data: Entity) => broadcastRef.current.update(id, data),
    broadcastEdgesUpdate: (edges: Edge[]) => broadcastRef.current.edges(edges),
    onEditEntity: () => { setIsTablePropertiesOpen(true); },
  }), []);

  const {
    nodes, setNodes, onNodesChange,
    edges, setEdges, onEdgesChange,
    selectedNodeId, setSelectedNodeId,
    selectedEdgeId, setSelectedEdgeId,
    onConnect, addEntity, updateEntity, deleteEntity, handleEdgeUpdate, deleteEdge,
    handleDiagramSelect: selectDiagram, viewportRef,
    undo, redo, canUndo, canRedo, takeSnapshot, isItemLoading: isERDItemLoading, saveCounter,
    onNodeDragStop, onMoveEnd,
  } = useERDSession(isPublicView, isGuest, isAuthenticated, () => {}, erdOptions);

  // Effective ID for realtime sync
  const effectiveDiagramId = isPublicView ? publicData?.id : activeDiagramId;

  const { broadcastNodeMove, broadcastNodeUpdate, broadcastEdgesUpdate } = useRealtimeSync(
    effectiveDiagramId, setNodes, setEdges,
  );

  useEffect(() => {
    broadcastRef.current = {
      move: broadcastNodeMove,
      update: broadcastNodeUpdate,
      edges: broadcastEdgesUpdate,
    };
  }, [broadcastNodeMove, broadcastNodeUpdate, broadcastEdgesUpdate]);

  const {
    notes, setNotes, activeNoteUid, setActiveNoteUid, bumpContentVersion, getContentVersion,
    fetchNotes, createNote, updateNote, deleteNote, moveNoteToProject, saveNote,
    restoreNote, deleteNotePermanent,
    notesTotal, isLoading: isNotesLoading, isItemLoading: isNoteItemLoading, selectNote, duplicateNote,
  } = useNotes(isGuest);

  const {
    projects, activeProjectId, setActiveProjectId, fetchProjects,
    createProject, updateProject, deleteProject,
    restoreProject, deleteProjectPermanent,
    isLoading: isProjectsLoading,
  } = useProjects(isGuest);

  const {
    drawings, setDrawings, activeDrawingUid: activeDrawingId, setActiveDrawingUid: setActiveDrawingId,
    fetchDrawings, createDrawing, updateDrawing, deleteDrawing, moveDrawingToProject, saveDrawing,
    restoreDrawing, deleteDrawingPermanent,
    drawingsTotal,
    isLoading: isDrawingsLoading, isItemLoading: isDrawingItemLoading, selectDrawing, duplicateDrawing,
  } = useDrawings(isGuest);

  const {
    flowcharts, setFlowcharts, activeFlowchartId, setActiveFlowchartId,
    fetchFlowcharts, createFlowchart, updateFlowchart, deleteFlowchart, moveFlowchartToProject, saveFlowchart,
    restoreFlowchart, deleteFlowchartPermanent, flowchartsTotal,
    isLoading: isFlowchartsLoading, isItemLoading: isFlowchartItemLoading, selectFlowchart,
  } = useFlowcharts(isGuest);

  const { trashData, fetchTrash, isLoading: isTrashLoading } = useTrash(isGuest);

  // ── Broadcast ──
  const { broadcastMessage } = useBroadcastChannel(useCallback(async (message) => {
    if (message.type !== BroadcastMessageType.DRAFT_UPDATED) return;
    const { type: dataType, id } = message.payload;
    if (view === 'erd' && dataType === DraftType.ERD && String(id) === String(activeDiagramId)) {
      console.log('[Broadcast] Incoming sync: updating state from another tab');
      isIncomingSyncRef.current = true;
      (window as any).currentSyncIsSilent = true;
      await selectDiagram(id, setActiveDiagramId, { silent: true });
      (window as any).currentSyncIsSilent = false;
      setTimeout(() => { isIncomingSyncRef.current = false; }, 1000);
    } else if (view === 'notes' && dataType === DraftType.NOTES && String(id) === String(activeNoteUid)) {
      console.log('[Broadcast] Reloading Note from local draft updated in another tab');
      await selectNote(String(id), { silent: true });
    } else if (view === 'drawings' && dataType === DraftType.DRAWINGS && String(id) === String(activeDrawingId)) {
      console.log('[Broadcast] Reloading Drawing from local draft updated in another tab');
      await selectDrawing(String(id), { silent: true });
    } else if (view === 'flowchart' && dataType === DraftType.FLOWCHART && String(id) === String(activeFlowchartId)) {
      console.log('[Broadcast] Reloading Flowchart from local draft updated in another tab');
      await selectFlowchart(String(id), { silent: true });
    }
  }, [view, activeDiagramId, activeNoteUid, activeDrawingId, activeFlowchartId, selectDiagram, selectNote, selectDrawing, selectFlowchart, setActiveDiagramId]));

  // Sync refs with latest state
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { drawingsRef.current = drawings; }, [drawings]);
  useEffect(() => { flowchartsRef.current = flowcharts; }, [flowcharts]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // ── Computed values ──
  const {
    currentActiveId, activeDocument, initialShareSettings,
    activeNote, activeDrawing, activeFlowchart,
    featureLabel, activeFileName, activeProjectName,
    activeFileUid, hasActiveItem, activeDiagram,
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

  // Last loaded refs
  useEffect(() => {
    if (activeDrawingId && !isDrawingItemLoading) lastLoadedDrawingIdRef.current = activeDrawingId;
  }, [activeDrawingId, isDrawingItemLoading]);
  useEffect(() => {
    if (activeFlowchartId && !isFlowchartItemLoading) lastLoadedFlowchartIdRef.current = activeFlowchartId;
  }, [activeFlowchartId, isFlowchartItemLoading]);

  // Active item guard
  useActiveItemGuard({
    view, activeDiagramId, activeNoteUid, activeDrawingId, activeFlowchartId,
    diagrams, notes, drawings, flowcharts, projects,
    isPublicView,
    setActiveDiagramId, setActiveNoteUid, setActiveDrawingId, setActiveFlowchartId,
    setActiveProjectId,
  });

  // ── Handlers ──
  const handleEntityUpdate = useCallback(async (updatedEntity: Entity, options?: { immediate?: boolean }) => {
    updateEntity(updatedEntity);
    if (options?.immediate) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        setIsLocalSaving(false);
      }
      const currentNodes = nodesRef.current.map(node =>
        node.id === updatedEntity.id ? { ...node, data: updatedEntity } : node,
      );
      await saveDiagram(currentNodes, edgesRef.current, viewportRef.current);
      lastSaveCallRef.current = Date.now();
      syncDrafts();
      broadcastNodeUpdate(updatedEntity.id, updatedEntity);
    }
  }, [updateEntity, saveDiagram, viewportRef, syncDrafts, broadcastNodeUpdate]);

  const { handleNoteChange, notesSaveTimeout } = useNoteChangeHandler({
    activeNoteUid, isIncomingSyncRef, notesRef, lastLoadedNoteIdRef,
    lastSaveCallRef, bumpContentVersion, saveNote, setNotes,
    setIsLocalSaving, broadcastMessage, syncDrafts, isRefreshing, isNoteItemLoading,
  });

  const { handleDrawingChange, drawingsSaveTimeoutRef } = useDrawingChangeHandler({
    activeDrawingId, isIncomingSyncRef, drawingsRef, lastLoadedDrawingIdRef,
    lastSaveCallRef, setIsLocalSaving, saveDrawing, setDrawings,
    broadcastMessage, triggerDebouncedSync, isRefreshing, isDrawingItemLoading,
  });

  const { handleFlowchartChange, flowchartsSaveTimeoutRef } = useFlowchartChangeHandler({
    activeFlowchartId, isIncomingSyncRef, flowchartsRef, lastLoadedFlowchartIdRef,
    lastSaveCallRef, setIsLocalSaving, saveFlowchart, setFlowcharts,
    broadcastMessage, triggerDebouncedSync, isRefreshing, isFlowchartItemLoading,
  });

  const { saveTimeoutRef, flushPendingSaves } = useAutoSave({
    saveCounter, isLocalSavingRef, isIncomingSyncRef, lastLoadedDiagramIdRef,
    lastSaveCallRef, lastDiagramLoadTimestampRef, isAuthenticated, isGuest,
    view, isPublicView, activeDiagramId, nodes, edges, viewportRef,
    saveDiagram, setIsLocalSaving, triggerDebouncedSync, broadcastMessage,
    isRefreshing, isERDItemLoading, isDiagramsLoading,
    activeNoteUid, notes, saveNote,
    activeDrawingId, drawings, saveDrawing,
    activeFlowchartId, flowcharts, saveFlowchart,
    notesSaveTimeoutRef: notesSaveTimeout,
    drawingsSaveTimeoutRef,
    flowchartsSaveTimeoutRef,
    syncDrafts,
  });

  // ── Navigation hooks ──
  const { handleDiagramSelect } = useDiagramNavigation({
    diagrams, activeDiagramId, setActiveDiagramId, view,
    setView: setViewCompat, setSidebarView: setSidebarViewCompat,
    setNodes, setEdges,
    selectDiagram, flushPendingSaves, isAuthenticated, isERDItemLoading,
    lastLoadedDiagramIdRef, lastDiagramLoadTimestampRef,
  });

  const { handleNoteSelect } = useNoteNavigation({
    notes, setNotes, activeNoteUid, setActiveNoteUid, view,
    setView: setViewCompat, setSidebarView: setSidebarViewCompat,
    selectNote, flushPendingSaves, isAuthenticated, getContentVersion, projects, lastLoadedNoteIdRef,
  });

  const { handleFlowchartSelect } = useFlowchartNavigation({
    flowcharts, setFlowcharts, activeFlowchartId, setActiveFlowchartId, view,
    setView: setViewCompat, setSidebarView: setSidebarViewCompat,
    selectFlowchart, flushPendingSaves, isAuthenticated, projects, lastLoadedFlowchartIdRef,
  });

  async function handleDrawingSelect(uid: string) {
    if (activeDrawingId === uid && view === 'drawings') return;
    await flushPendingSaves();
    setSidebarViewState('drawings' as any);
    setDrawings(prev => prev.map(d => String(d.uid ?? d.id) === uid ? { ...d, data: undefined } : d));
    lastProcessedDrawingUrlRef.current = '/drawings/' + uid;
    navigate('/drawings/' + uid, { replace: true });
    await selectDrawing(uid);
    lastLoadedDrawingIdRef.current = uid;
  }

  // URL routing for /drawings/:uid
  useEffect(() => {
    if (!isAuthenticated || getSharePathInfo()) return;
    if (lastProcessedDrawingUrlRef.current === location.pathname) return;
    const m = location.pathname.match(/^\/drawings\/([^/]+)/);
    if (m) {
      lastProcessedDrawingUrlRef.current = location.pathname;
      handleDrawingSelect(m[1]);
    }
  }, [isAuthenticated, location.pathname, handleDrawingSelect]);

  // ── File operations ──
  const {
    handleExportMarkdown, handleImportMarkdown, handleCopyMarkdown,
    executeExportMarkdown, executeImportMarkdown,
  } = useFileOperations({
    activeNote, activeNoteUid, activeProjectId, createNote, saveNote,
    setActiveNoteUid, handleNoteChange, setIsExportNoteModalOpen, setIsImportNoteModalOpen,
  });

  // ── Sidebar handlers ──
  const {
    handleSidebarDiagramCreate, handleSidebarNoteCreate,
    handleSidebarDrawingCreate, handleSidebarFlowchartCreate,
    handleSidebarProjectCreate, handleSidebarProjectUpdate, handleSidebarProjectDelete,
  } = useSidebarHandlers({
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
  });

  // ── Header handlers ──
  const handleHeaderSettingsSaved = useCallback(() => {
    fetchProjects(false, debouncedSearchQuery);
  }, [debouncedSearchQuery, fetchProjects]);

  const handleHeaderDelete = useCallback(() => {
    if (!currentActiveId) return;
    setIsMoveToTrashAlertOpen(true);
  }, [currentActiveId]);

  const handleHeaderRename = useCallback(() => {
    if (!activeDocument) return;
    setNewName(activeDocument.title || activeDocument.name || '');
    const currentProject = projects?.find(
      (proj: any) => String(proj.id) === String(activeDocument.project_id)
        || String(proj.uid) === String(activeDocument.project_id)
        || String(proj.uid) === String(activeDocument.projects?.uid),
    );
    setRenameProjectId(currentProject ? String(currentProject.id) : 'none');
    setIsRenameDialogOpen(true);
  }, [activeDocument, projects]);

  const { handleOpenEditDocument, handleOpenCreateDocument } = useDocumentActions({
    view, notes, diagrams, drawings, flowcharts, projects,
    selectedWorkspaceUid: tableSearchParams.get('workspace'),
    setEditDialogNote, setNewName, setRenameProjectId,
    setIsRenameDialogOpen, setCreateDialogOpen, setCreateDialogView,
  });

  const handleHeaderExportSQL = useCallback((dialect: 'postgresql' | 'mysql') => {
    if (activeDocument) {
      handleExportSQL(dialect, { name: activeFileName || 'Untitled' }, nodesRef.current, edgesRef.current);
    }
  }, [activeDocument, activeFileName, handleExportSQL]);

  const handleHeaderExportPDF = useCallback(() => {
    if (activeDocument) handleExportPDF(activeFileName || 'Untitled');
  }, [activeDocument, activeFileName, handleExportPDF]);

  const handleHeaderExportImage = useCallback(() => {
    if (activeDocument) handleExportImage(activeFileName || 'Untitled');
  }, [activeDocument, activeFileName, handleExportImage]);

  // Update check
  useUpdateCheck(() => handleViewChange('changelog'));

  // ── Side Effects ──
  // PWA install toast + public doc detection
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
        toast('✨ Enhance your experience', {
          description: 'Install ERD Builder Pro as a desktop app for offline access and better performance.',
          action: { label: 'Install', onClick: () => installApp() },
          duration: 10000,
        });
        sessionStorage.setItem('pwa-install-toast-shown', 'true');
      }
    }
  }, [isInstallable, installApp]);

  // Offline auto-save
  useEffect(() => {
    if (!isOnline && !isPublicView) {
      if (view === 'erd' && activeDiagramId) saveDiagram(nodes, edges, viewportRef.current);
      else if (view === 'notes' && activeNoteUid) {
        const n = notes.find(n => String(n.uid) === String(activeNoteUid));
        if (n) saveNote(n);
      } else if (view === 'drawings' && activeDrawingId) {
        const d = drawings.find(d => String(d.uid ?? d.id) === String(activeDrawingId));
        if (d) saveDrawing(d);
      } else if (view === 'flowchart' && activeFlowchartId) {
        const f = flowcharts.find(f => String(f.uid ?? f.id) === String(activeFlowchartId));
        if (f) saveFlowchart(f);
      }
    }
  }, [isOnline, view, activeDiagramId, activeNoteUid, activeDrawingId, activeFlowchartId, nodes, edges]);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFileSearchQuery(fileSearchQuery), 300);
    return () => clearTimeout(timer);
  }, [fileSearchQuery]);

  // Fetch projects on search query change
  useEffect(() => {
    if (isAuthenticated && !isPublicView) {
      fetchProjects(false, debouncedSearchQuery);
    }
  }, [debouncedSearchQuery, fetchProjects, isAuthenticated, isPublicView]);

  // Dark mode
  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');
  }, []);

  // Initial data fetch
  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    if (!isAuthenticated || isPublicView) return;
    initialFetchDoneRef.current = true;
    fetchProjects(false, '');
    fetchDiagrams();
    fetchNotes();
    fetchDrawings();
    fetchFlowcharts();
  }, [isAuthenticated, isPublicView, fetchProjects, fetchDiagrams, fetchNotes, fetchDrawings, fetchFlowcharts]);

  // Fetch trash on trash view
  useEffect(() => {
    if (view === 'trash' && isAuthenticated && !isPublicView) {
      fetchTrash();
    }
  }, [view, isAuthenticated, isPublicView, fetchTrash]);

  // Clear stale drafts
  useEffect(() => {
    if (isAuthenticated && !isGuest) {
      if (diagrams.length > 0) checkAndClearStaleDrafts(DraftType.ERD, diagrams);
      if (notes.length > 0) checkAndClearStaleDrafts(DraftType.NOTES, notes);
      if (drawings.length > 0) checkAndClearStaleDrafts(DraftType.DRAWINGS, drawings);
      if (flowcharts.length > 0) checkAndClearStaleDrafts(DraftType.FLOWCHART, flowcharts);
    }
  }, [diagrams, notes, drawings, flowcharts, isAuthenticated, isGuest, checkAndClearStaleDrafts]);

  // Beforeunload safety gate
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isLocalSavingRef.current) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Focus sync
  useFocusSync({
    isOnline, isAuthenticated, isPublicView, isRefreshing, isSyncing, view,
    activeDiagramId, activeNoteUid, activeDrawingId, activeFlowchartId,
    selectDiagram, selectNote, selectDrawing, selectFlowchart, setActiveDiagramId,
    diagrams, notes, drawings, flowcharts, setIsRefreshing, getContentVersion, lastSaveCallRef,
  });

  // Table view pagination
  useTableViewPagination({
    view, hasActiveItem, isAuthenticated, isPublicView,
    selectedWorkspaceUid: tableSearchParams.get('workspace'),
    tableSearchParams, projects,
    fileSearchQuery: debouncedFileSearchQuery,
    fetchNotes, fetchDiagrams, fetchFlowcharts, fetchDrawings,
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (hasPendingSyncs && !isSyncing && isOnline) syncDrafts();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        if (!hasActiveItem && !isPublicView && isAuthenticated) {
          e.preventDefault();
          fileSearchRef.current?.focus();
          fileSearchRef.current?.select();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [hasPendingSyncs, isSyncing, isOnline, syncDrafts, hasActiveItem, isPublicView, isAuthenticated]);

  // NotesPage custom events
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

  // ── handleViewChange ──
  const handleViewChange = useCallback(async (newView: AppView, showTable?: boolean, workspaceUid?: string | null) => {
    if (!isOnline && !isPublicView) {
      toast.error('Offline Mode: Navigation is disabled.', { duration: 5000 });
      return;
    }
    if (newView !== view) {
      await flushPendingSaves();
    }
    if (newView !== 'trash' && newView !== 'changelog' && newView !== 'backups' && newView !== 'ai-settings') {
      setSidebarViewState(newView as any);
    }
    if (showTable) {
      setActiveNoteUid(null);
      setActiveDrawingId(null);
      setActiveDiagramId(null);
      setActiveFlowchartId(null);
      let tableUrl = '/table/' + newView;
      if (workspaceUid) tableUrl += '?workspace=' + encodeURIComponent(workspaceUid);
      if (tableUrl !== location.pathname + location.search) {
        navigate(tableUrl, { replace: true });
      }
      return;
    }
    if (!getSharePathInfo()) {
      let targetUrl: string | null = null;
      if (newView === 'notes' && activeNoteUid) targetUrl = '/notes/' + activeNoteUid;
      else if (newView === 'flowchart' && activeFlowchart) targetUrl = '/flowcharts/' + (activeFlowchart.uid || activeFlowchartId);
      else if (newView === 'erd' && activeDiagramId) targetUrl = '/diagrams/' + activeDiagramId;
      else if (newView === 'drawings' && activeDrawingId) targetUrl = '/drawings/' + activeDrawingId;
      else if (newView === 'trash') targetUrl = '/trash';
      else if (newView === 'ai-settings') targetUrl = '/ai-settings';
      else if (newView === 'backups') targetUrl = '/backups';
      else if (newView === 'changelog') targetUrl = '/changelog';
      else targetUrl = '/';
      if (targetUrl && targetUrl !== location.pathname + location.search) {
        navigate(targetUrl, { replace: true });
      }
    }
  }, [view, isOnline, isPublicView, flushPendingSaves, location.pathname, location.search, navigate, activeNoteUid, activeFlowchart, activeFlowchartId, activeDiagramId, activeDrawingId]);

  // ── Permanent DELETE handler ──
  const confirmPermanentDelete = useCallback(async () => {
    if (itemToDelete) {
      const { id, type, uid } = itemToDelete;
      if (type === 'project') await deleteProjectPermanent(id);
      else if (type === 'erd') await deleteDiagramPermanent(uid || String(id));
      else if (type === 'notes') await deleteNotePermanent(uid || String(id));
      else if (type === 'drawings') await deleteDrawingPermanent(uid || String(id));
      else if (type === 'flowchart') await deleteFlowchartPermanent(uid || String(id));
      setIsPermanentDeleteConfirmOpen(false);
      setItemToDelete(null);
      await fetchTrash();
    }
  }, [itemToDelete, deleteProjectPermanent, deleteDiagramPermanent, deleteNotePermanent, deleteDrawingPermanent, deleteFlowchartPermanent, fetchTrash]);

  // ── Duplicate ──
  const handleDuplicate = useCallback(() => {
    if (!activeDocument) return;
    setDuplicateName(`${activeDocument.title || activeDocument.name} (Copy)`);
    setIsDuplicateDialogOpen(true);
  }, [activeDocument]);

  const executeDuplicate = useCallback(async () => {
    if (!activeDocument || !duplicateName.trim()) return;
    setIsRefreshing(true);
    try {
      if (view === 'notes') {
        const newNote = await duplicateNote(activeDocument.uid, duplicateName);
        if (newNote) {
          await handleNoteSelect(newNote.uid);
          fetchProjects(false, debouncedSearchQuery);
          toast.success('Note duplicated successfully');
        }
      } else if (view === 'drawings') {
        const newDrawing = await duplicateDrawing(activeDocument.uid, duplicateName);
        if (newDrawing) {
          await handleDrawingSelect(newDrawing.uid);
          fetchProjects(false, debouncedSearchQuery);
          toast.success('Drawing duplicated successfully');
        }
      } else {
        toast.info('Duplication for this document type is disabled.');
      }
    } catch (err) {
      console.error('Duplicate error:', err);
      toast.error('Failed to duplicate document.');
    } finally {
      setIsRefreshing(false);
      setIsDuplicateDialogOpen(false);
    }
  }, [activeDocument, duplicateName, view, duplicateNote, duplicateDrawing, handleNoteSelect, handleDrawingSelect, fetchProjects, debouncedSearchQuery]);

  // ── Workspace callbacks ──
  const {
    handleNodeClick, handleNodeDoubleClick, handleEdgeClick, handlePaneClick,
    handleMove, handleOpenImportModal, handleWorkspaceExportSQL,
    handleWorkspaceExportPDF, handleWorkspaceExportImage,
    workspaceIsLoading, selectedEntity,
  } = useWorkspaceCallbacks({
    isPublicView, setSelectedNodeId, setSelectedEdgeId,
    setIsTablePropertiesOpen, setIsImportModalOpen,
    viewportRef, publicData, diagrams, activeDiagramId,
    handleExportSQL, handleExportPDF, handleExportImage,
    nodes, edges, view,
    isDiagramsLoading, isERDItemLoading,
    isNotesLoading, isNoteItemLoading,
    isDrawingsLoading, isDrawingItemLoading,
    isFlowchartsLoading, isFlowchartItemLoading,
    selectedNodeId,
  });

  // ── Trash handlers ──
  const {
    handleTrashRestoreProject, handleTrashRestoreDiagram, handleTrashRestoreNote,
    handleTrashRestoreDrawing, handleTrashRestoreFlowchart,
    handleTrashProjectPermanentDelete, handleTrashDiagramPermanentDelete,
    handleTrashNotePermanentDelete, handleTrashDrawingPermanentDelete,
    handleTrashFlowchartPermanentDelete,
  } = useTrashHandlers({
    restoreProject, restoreDiagram, restoreNote, restoreDrawing, restoreFlowchart,
    fetchTrash, fetchProjects, fetchDiagrams, fetchNotes, fetchDrawings, fetchFlowcharts,
    debouncedSearchQuery,
    setItemToDelete, setIsPermanentDeleteConfirmOpen,
    trashData,
  });

  // ── Pagination handle ──
  const handleWorkspaceFilter = useCallback((uid: string | null) => {
    setTableSearchParams((prev: URLSearchParams) => {
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

  const tablePage = parseInt(tableSearchParams.get('page') || '1', 10);

  // ── Context value ──
  const ctx = useMemo<WorkspaceContextValue>(() => ({
    user,
    isGuest,
    handleLogout: _handleLogout,

    view,
    sidebarView,

    isPublicView,
    setIsPublicView,
    publicData,
    isPublicLoading,
    forbiddenDoc,
    fetchPublicDocument,

    diagrams, notes, drawings, flowcharts, projects, trashData, nodes, edges, setNodes, setEdges,

    activeDiagramId, setActiveDiagramId,
    activeNoteUid, setActiveNoteUid,
    activeDrawingId, setActiveDrawingId,
    activeFlowchartId, setActiveFlowchartId,
    activeProjectId, setActiveProjectId,

    isLoading: isDiagramsLoading || isNotesLoading || isDrawingsLoading || isFlowchartsLoading || isProjectsLoading,
    isProjectsLoading,
    isLocalSaving,
    isRefreshing,
    isSyncing,
    isOnline,

    searchQuery, setSearchQuery,
    debouncedSearchQuery,
    fileSearchQuery, setFileSearchQuery,
    debouncedFileSearchQuery,
    fileSearchRef,

    selectedWorkspaceUid: tableSearchParams.get('workspace'),
    handleWorkspaceFilter,

    activeDocument, activeNote, activeDiagram, activeDrawing, activeFlowchart,
    hasActiveItem, activeFileName, activeFileUid, activeProjectName,
    featureLabel, initialShareSettings, currentActiveId,
    isNotesDocumentRoute, isERDDocumentRoute, isDrawingsDocumentRoute, isFlowchartDocumentRoute,

    handleViewChange, handleNoteSelect, handleDiagramSelect, handleDrawingSelect, handleFlowchartSelect,
    handleNoteChange, handleDrawingChange, handleFlowchartChange, handleEntityUpdate,

    handleSidebarDiagramCreate, handleSidebarNoteCreate, handleSidebarDrawingCreate,
    handleSidebarFlowchartCreate, handleSidebarProjectCreate, handleSidebarProjectUpdate, handleSidebarProjectDelete,

    isMoveToTrashAlertOpen, setIsMoveToTrashAlertOpen,
    isDeleteAlertOpen, setIsDeleteAlertOpen,
    isRenameDialogOpen, setIsRenameDialogOpen,
    isDuplicateDialogOpen, setIsDuplicateDialogOpen,
    isImportModalOpen, setIsImportModalOpen,
    isTablePropertiesOpen, setIsTablePropertiesOpen,
    isPermanentDeleteConfirmOpen, setIsPermanentDeleteConfirmOpen,
    isImportNoteModalOpen, setIsImportNoteModalOpen,
    isExportNoteModalOpen, setIsExportNoteModalOpen,
    newName, setNewName,
    renameProjectId, setRenameProjectId,
    duplicateName, setDuplicateName,
    itemToDelete, setItemToDelete,
    createDialogOpen, setCreateDialogOpen,
    createDialogView, setCreateDialogView,
    editDialogNote, setEditDialogNote,
    tableDeleteDoc, setTableDeleteDoc,

    handleHeaderDelete, handleHeaderRename, handleHeaderSettingsSaved,
    handleHeaderExportSQL, handleHeaderExportPDF, handleHeaderExportImage,
    handleExportMarkdown, handleCopyMarkdown, handleImportMarkdown,
    handleDuplicate, executeDuplicate,

    handleOpenEditDocument, handleOpenCreateDocument,

    onNodesChange, onEdgesChange, onConnect,
    selectedNodeId, setSelectedNodeId, selectedEdgeId, setSelectedEdgeId,
    selectedEntity, canUndo, canRedo, undo, redo, addEntity, deleteEntity, deleteEdge, handleEdgeUpdate,
    handleNodeClick, handleNodeDoubleClick, handleEdgeClick, handlePaneClick,
    handleMove, handleOpenImportModal,
    handleWorkspaceExportSQL, handleWorkspaceExportPDF, handleWorkspaceExportImage,
    takeSnapshot, onNodeDragStop, onMoveEnd,

    viewportRef, lastLoadedDiagramIdRef,

    syncDrafts, triggerDebouncedSync, broadcastMessage, setIsLocalSaving, hasPendingSyncs, syncError,
    isInstallable, installApp,

    handleTrashRestoreProject, handleTrashRestoreDiagram, handleTrashRestoreNote,
    handleTrashRestoreDrawing, handleTrashRestoreFlowchart,
    handleTrashProjectPermanentDelete, handleTrashDiagramPermanentDelete,
    handleTrashNotePermanentDelete, handleTrashDrawingPermanentDelete,
    handleTrashFlowchartPermanentDelete, fetchTrash, isTrashLoading,

    confirmPermanentDelete,

    saveDiagram, saveNote, saveDrawing, saveFlowchart,
    updateDiagram, updateNote, updateDrawing, updateFlowchart,
    deleteDiagram, deleteNote, deleteDrawing, deleteFlowchart,
    moveDiagramToProject, moveNoteToProject, moveDrawingToProject, moveFlowchartToProject,
    fetchProjects, fetchDiagrams, fetchNotes, fetchDrawings, fetchFlowcharts,

    notesTotal, diagramsTotal, drawingsTotal, flowchartsTotal,
    workspaceIsLoading,

    tableSearchParams, setTableSearchParams, tablePage,

    notesSaveTimeout, drawingsSaveTimeoutRef, flowchartsSaveTimeoutRef,
    lastLoadedNoteIdRef, lastLoadedDrawingIdRef, lastLoadedFlowchartIdRef,
    nodesRef, edgesRef, notesRef, drawingsRef, flowchartsRef,
  }), [
    user, isGuest, _handleLogout, view, sidebarView,
    isPublicView, setIsPublicView, publicData, isPublicLoading, forbiddenDoc, fetchPublicDocument,
    diagrams, notes, drawings, flowcharts, projects, trashData, nodes, edges, setNodes, setEdges,
    activeDiagramId, setActiveDiagramId, activeNoteUid, setActiveNoteUid,
    activeDrawingId, setActiveDrawingId, activeFlowchartId, setActiveFlowchartId,
    activeProjectId, setActiveProjectId,
    isDiagramsLoading, isNotesLoading, isDrawingsLoading, isFlowchartsLoading, isProjectsLoading,
    isLocalSaving, isRefreshing, isSyncing, isOnline,
    searchQuery, setSearchQuery, debouncedSearchQuery,
    fileSearchQuery, setFileSearchQuery, debouncedFileSearchQuery, fileSearchRef,
    tableSearchParams, handleWorkspaceFilter,
    activeDocument, activeNote, activeDiagram, activeDrawing, activeFlowchart,
    hasActiveItem, activeFileName, activeFileUid, activeProjectName,
    featureLabel, initialShareSettings, currentActiveId,
    isNotesDocumentRoute, isERDDocumentRoute, isDrawingsDocumentRoute, isFlowchartDocumentRoute,
    // Navigation/Content/Entity handlers — stable enough via hooks
    handleViewChange, handleNoteSelect, handleDiagramSelect, handleDrawingSelect, handleFlowchartSelect,
    handleNoteChange, handleDrawingChange, handleFlowchartChange, handleEntityUpdate,
    // Sidebar handlers
    handleSidebarDiagramCreate, handleSidebarNoteCreate, handleSidebarDrawingCreate,
    handleSidebarFlowchartCreate, handleSidebarProjectCreate, handleSidebarProjectUpdate, handleSidebarProjectDelete,
    // Modal states — all booleans/strings
    isMoveToTrashAlertOpen, setIsMoveToTrashAlertOpen,
    isDeleteAlertOpen, setIsDeleteAlertOpen,
    isRenameDialogOpen, setIsRenameDialogOpen,
    isDuplicateDialogOpen, setIsDuplicateDialogOpen,
    isImportModalOpen, setIsImportModalOpen,
    isTablePropertiesOpen, setIsTablePropertiesOpen,
    isPermanentDeleteConfirmOpen, setIsPermanentDeleteConfirmOpen,
    isImportNoteModalOpen, setIsImportNoteModalOpen,
    isExportNoteModalOpen, setIsExportNoteModalOpen,
    newName, setNewName, renameProjectId, setRenameProjectId,
    duplicateName, setDuplicateName,
    itemToDelete, setItemToDelete,
    createDialogOpen, setCreateDialogOpen, createDialogView, setCreateDialogView,
    editDialogNote, setEditDialogNote, tableDeleteDoc, setTableDeleteDoc,
    // Header handlers
    handleHeaderDelete, handleHeaderRename, handleHeaderSettingsSaved,
    handleHeaderExportSQL, handleHeaderExportPDF, handleHeaderExportImage,
    handleExportMarkdown, handleCopyMarkdown, handleImportMarkdown,
    handleDuplicate, executeDuplicate,
    handleOpenEditDocument, handleOpenCreateDocument,
    // ERD helpers
    onNodesChange, onEdgesChange, onConnect,
    selectedNodeId, setSelectedNodeId, selectedEdgeId, setSelectedEdgeId,
    selectedEntity, canUndo, canRedo, undo, redo, addEntity, deleteEntity, deleteEdge, handleEdgeUpdate,
    handleNodeClick, handleNodeDoubleClick, handleEdgeClick, handlePaneClick,
    handleMove, handleOpenImportModal,
    handleWorkspaceExportSQL, handleWorkspaceExportPDF, handleWorkspaceExportImage,
    takeSnapshot, onNodeDragStop, onMoveEnd,
    viewportRef, lastLoadedDiagramIdRef,
    syncDrafts, triggerDebouncedSync, broadcastMessage, setIsLocalSaving, hasPendingSyncs, syncError,
    isInstallable, installApp,
    handleTrashRestoreProject, handleTrashRestoreDiagram, handleTrashRestoreNote,
    handleTrashRestoreDrawing, handleTrashRestoreFlowchart,
    handleTrashProjectPermanentDelete, handleTrashDiagramPermanentDelete,
    handleTrashNotePermanentDelete, handleTrashDrawingPermanentDelete,
    handleTrashFlowchartPermanentDelete, fetchTrash, isTrashLoading,
    confirmPermanentDelete,
    saveDiagram, saveNote, saveDrawing, saveFlowchart,
    updateDiagram, updateNote, updateDrawing, updateFlowchart,
    deleteDiagram, deleteNote, deleteDrawing, deleteFlowchart,
    moveDiagramToProject, moveNoteToProject, moveDrawingToProject, moveFlowchartToProject,
    fetchProjects, fetchDiagrams, fetchNotes, fetchDrawings, fetchFlowcharts,
    notesTotal, diagramsTotal, drawingsTotal, flowchartsTotal, workspaceIsLoading,
    tablePage,
    notesSaveTimeout, drawingsSaveTimeoutRef, flowchartsSaveTimeoutRef,
    lastLoadedNoteIdRef, lastLoadedDrawingIdRef, lastLoadedFlowchartIdRef,
    nodesRef, edgesRef, notesRef, drawingsRef, flowchartsRef,
  ]);

  return (
    <WorkspaceContext.Provider value={ctx}>
      <NotesPage
        notes={notes}
        setNotes={setNotes}
        activeNoteUid={activeNoteUid}
        setActiveNoteUid={setActiveNoteUid}
        isAuthenticated={isAuthenticated}
        notesSaveTimeout={notesSaveTimeout}
        view={view}
        setView={setViewCompat}
        setSidebarView={setSidebarViewCompat}
      />
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
