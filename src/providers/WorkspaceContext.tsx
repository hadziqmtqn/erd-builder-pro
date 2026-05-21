import React, { createContext, useContext } from 'react';
import { Node, Edge, OnNodesChange, OnEdgesChange, OnConnect } from '@xyflow/react';
import { BroadcastMessageType } from '../hooks/useBroadcastChannel';
import { Entity, AppView } from '../types';

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
  isDiagramsLoading: boolean;
  isNotesLoading: boolean;
  isDrawingsLoading: boolean;
  isFlowchartsLoading: boolean;
  isLoading: boolean;
  isTrashLoading: boolean;
  isLocalSaving: boolean;
  isRefreshing: boolean;
  isSyncing: boolean;
  isOnline: boolean;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  fileSearchQuery: string;
  setFileSearchQuery: (q: string) => void;
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

  // Settings Modal
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  settingsTab: string;
  setSettingsTab: (tab: string) => void;

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

  // Pagination
  tableSearchParams: URLSearchParams;
  setTableSearchParams: any;
  tablePage: number;
  triggerTableRefresh: () => void;
  tableLoadingState: 'idle' | 'loading';
  setTableLoadingState: (state: 'idle' | 'loading') => void;

  // Page-specific breadcrumb (set by Page components like DashboardPage, NotesPage, etc.)
  breadcrumbLabel: string | null;
  setBreadcrumbLabel: (label: string | null) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
