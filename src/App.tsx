import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { 
  Edge, 
  Node,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import TurndownService from 'turndown';
import { marked } from 'marked';

// Components
import { AppSidebar } from './components/app-sidebar';
import { FeedbackDialog } from "@/components/FeedbackDialog"
import { Login } from './components/Login';
import { MainHeader } from './components/MainHeader';
import { DeleteConfirmModal } from './components/modals/DeleteConfirmModal';
import { ImportSQLModal } from './components/modals/ImportSQLModal';
import { ImportNoteModal } from './components/modals/ImportNoteModal';
import { ExportNoteModal } from './components/modals/ExportNoteModal';
import { NoteExporter } from './lib/exporters/note-exporter';
import { NoteImporter } from './lib/importers/note-importer';
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
import { BackupsView } from './components/views/BackupsView';

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
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Trash2, AlertTriangle } from 'lucide-react';
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
  }, [view, sidebarView]);

  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isPermanentDeleteConfirmOpen, setIsPermanentDeleteConfirmOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number | string, type: 'erd' | 'notes' | 'drawings' | 'project' } | null>(null);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [isMoveToTrashAlertOpen, setIsMoveToTrashAlertOpen] = useState(false);
  const [isImportNoteModalOpen, setIsImportNoteModalOpen] = useState(false);
  const [isExportNoteModalOpen, setIsExportNoteModalOpen] = useState(false);
  
  // Safety Gate & Persistence State
  const [isLocalSaving, setIsLocalSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastSaveCallRef = useRef<number>(0);
  const lastFocusFetchRef = useRef<number>(0);


  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  
  // Custom Hooks
  const { isAuthenticated, isGuest, user, checkAuth, handleGuestLogin, handleLogout } = useAuth();
  const isOnline = useConnectionStatus();
  const { triggerDebouncedSync, isSyncing, syncError, syncDrafts, checkAndClearStaleDrafts } = useSyncService(isAuthenticated, isGuest);
  const { isInstallable, installApp } = usePWAInstall();
  const { handleExportSQL } = useSQLGenerator();
  const { handleExportImage, handleExportPDF } = useImageExporter();


  // ERD Session Hook
  const { 
    nodes, setNodes, onNodesChange,
    edges, setEdges, onEdgesChange,
    selectedNodeId, setSelectedNodeId,
    selectedEdgeId, setSelectedEdgeId,
    onConnect, addEntity, updateEntity, deleteEntity, handleEdgeUpdate, deleteEdge,
    handleDiagramSelect: selectDiagram, viewportRef,
    undo, redo, canUndo, canRedo, takeSnapshot, isItemLoading: isERDItemLoading
  } = useERDSession(false, isGuest, isAuthenticated, setView);


  // Public Document Hook
  const {
    isPublicView, setIsPublicView, publicData, isPublicLoading, forbiddenDoc, fetchPublicDocument
  } = usePublicDocument(setView, setNodes, setEdges);

  // Domain Hooks
  const { 
    diagrams, setDiagrams, activeDiagramId, setActiveDiagramId,
    fetchDiagrams, createDiagram, updateDiagram, deleteDiagram, restoreDiagram, deleteDiagramPermanent, moveDiagramToProject, saveDiagram,
    hasMoreDiagrams, isLoading: isDiagramsLoading
  } = useDiagrams(isAuthenticated, view, isGuest);


  const { 
    notes, setNotesList, activeNoteId, setActiveNoteId, fetchNotes, createNote, updateNote, deleteNote, moveNoteToProject, saveNote, restoreNote, deleteNotePermanent,
    hasMoreNotes, isLoading: isNotesLoading, isItemLoading: isNoteItemLoading, selectNote
  } = useNotes(isGuest);
  
  const { 
    projects, activeProjectId, setActiveProjectId, fetchProjects, createProject, updateProject, deleteProject, restoreProject, deleteProjectPermanent,
    hasMoreProjects, isLoading: isProjectsLoading
  } = useProjects(isGuest);
  
  const { 
    drawings, setDrawings, activeDrawingId, setActiveDrawingId, fetchDrawings, createDrawing, updateDrawing, deleteDrawing, moveDrawingToProject, saveDrawing, restoreDrawing, deleteDrawingPermanent,
    hasMoreDrawings, isLoading: isDrawingsLoading, isItemLoading: isDrawingItemLoading, selectDrawing
  } = useDrawings(isGuest);

  const {
    flowcharts, setFlowcharts, activeFlowchartId, setActiveFlowchartId, fetchFlowcharts, createFlowchart, updateFlowchart, deleteFlowchart, moveFlowchartToProject, saveFlowchart, restoreFlowchart, deleteFlowchartPermanent,
    hasMoreFlowcharts, isLoading: isFlowchartsLoading, isItemLoading: isFlowchartItemLoading, selectFlowchart
  } = useFlowcharts(isGuest);

  const { trashData, fetchTrash, isLoading: isTrashLoading } = useTrash(isGuest);

  // Handlers
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
    const doc = docArr.find(d => String(d.id) === String(id));
    if (!doc) return undefined;
    return { is_public: !!doc.is_public, share_token: doc.share_token, expiry_date: doc.expiry_date };
  }, [view, isPublicView, publicData, diagrams, notes, drawings, flowcharts, activeDiagramId, activeNoteId, activeDrawingId, activeFlowchartId]);



  const activeDocument = useMemo(() => {
    if (isPublicView) return publicData;
    const docArr = view === 'erd' ? diagrams : view === 'notes' ? notes : view === 'drawings' ? drawings : flowcharts;
    const id = currentActiveId;
    return docArr.find(d => String(d.id) === String(id));
  }, [view, currentActiveId, diagrams, notes, drawings, flowcharts, isPublicView, publicData]);

  const hasActiveItem = !!activeDocument;

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
      if (view === 'erd' && activeDiagramId) activeItem = diagrams.find(f => String(f.id) === String(activeDiagramId));
      else if (view === 'notes' && activeNoteId) activeItem = notes.find(n => String(n.id) === String(activeNoteId));
      else if (view === 'drawings' && activeDrawingId) activeItem = drawings.find(d => String(d.id) === String(activeDrawingId));
      else if (view === 'flowchart' && activeFlowchartId) activeItem = flowcharts.find(f => String(f.id) === String(activeFlowchartId));

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
      else if (view === 'notes' && activeNoteId) { const n = notes.find(n => String(n.id) === String(activeNoteId)); if (n) saveNote(n); }
      else if (view === 'drawings' && activeDrawingId) { const d = drawings.find(d => String(d.id) === String(activeDrawingId)); if (d) saveDrawing(d); }
      else if (view === 'flowchart' && activeFlowchartId) { const f = flowcharts.find(f => String(f.id) === String(activeFlowchartId)); if (f) saveFlowchart(f); }
    }
  }, [isOnline, view, activeDiagramId, activeNoteId, activeDrawingId, activeFlowchartId, nodes, edges]);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');
    if (isAuthenticated && !isPublicView) {
      // Always fetch projects as they are context providers for the sidebar
      fetchProjects(false, debouncedSearchQuery);
    }
  }, [isAuthenticated, fetchProjects, debouncedSearchQuery, isPublicView]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Optimized Lazy Loading: Only fetch data for the active view
  useEffect(() => {
    if (isAuthenticated && !isPublicView) {
      const pid = activeProjectId === null ? 'all' : activeProjectId;
      
      // We fetch more items (50) for the sidebar to ensure Shared/Private grouping is robust
      if (view === 'erd') fetchDiagrams(false, pid, debouncedSearchQuery, null, 50);
      else if (view === 'notes') fetchNotes(false, pid, debouncedSearchQuery, null, 50);
      else if (view === 'drawings') fetchDrawings(false, pid, debouncedSearchQuery, null, 50);
      else if (view === 'flowchart') fetchFlowcharts(false, pid, debouncedSearchQuery, null, 50);
      else if (view === 'trash') fetchTrash();
    }
  }, [isAuthenticated, activeProjectId, debouncedSearchQuery, fetchDiagrams, fetchNotes, fetchDrawings, fetchFlowcharts, fetchTrash, isPublicView, view]);

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
      if (isLocalSaving) {
        e.preventDefault();
        e.returnValue = ''; // Required by modern browsers to trigger the dialog
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isLocalSaving]);

  // Intelligent Fetch on Focus: Refresh data when returning to tab
  useEffect(() => {
    const handleFocus = async () => {
      // Only refresh if online, authenticated, not in public view, and not currently saving/syncing
      if (!isOnline || !isAuthenticated || isPublicView || isLocalSaving || isRefreshing || isSyncing) return;
      
      // Throttle: don't refresh more than once every 120 seconds (2 minutes)
      const now = Date.now();
      if (now - lastFocusFetchRef.current < 120000) return;

      // SAFETY: Don't refresh if we have a very recent local save (within 5 seconds)
      // to avoid overwriting "fresh" edits that might not have reached the cloud yet
      if (now - lastSaveCallRef.current < 5000) return;

      lastFocusFetchRef.current = now;

      setIsRefreshing(true);
      try {
        const pid = activeProjectId === null ? 'all' : activeProjectId;
        
        // Refresh the list and the active item SILENTLY (no skeletons)
        if (view === 'erd') {
          await fetchDiagrams(false, pid, debouncedSearchQuery, null, 50, { silent: true });
          if (activeDiagramId) {
            const hasPending = await localPersistence.hasPendingSync(DraftType.ERD, activeDiagramId);
            if (!hasPending) await selectDiagram(activeDiagramId, setActiveDiagramId, { silent: true });
          }
        } else if (view === 'notes') {
          await fetchNotes(false, pid, debouncedSearchQuery, null, 50, { silent: true });
          if (activeNoteId) {
            const hasPending = await localPersistence.hasPendingSync(DraftType.NOTES, activeNoteId);
            if (!hasPending) await selectNote(activeNoteId, { silent: true });
          }
        } else if (view === 'drawings') {
          await fetchDrawings(false, pid, debouncedSearchQuery, null, 50, { silent: true });
          if (activeDrawingId) {
            const hasPending = await localPersistence.hasPendingSync(DraftType.DRAWINGS, activeDrawingId);
            if (!hasPending) await selectDrawing(activeDrawingId, { silent: true });
          }
        } else if (view === 'flowchart') {
          await fetchFlowcharts(false, pid, debouncedSearchQuery, null, 50, { silent: true });
          if (activeFlowchartId) {
            const hasPending = await localPersistence.hasPendingSync(DraftType.FLOWCHART, activeFlowchartId);
            if (!hasPending) await selectFlowchart(activeFlowchartId, { silent: true });
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
    isOnline, isAuthenticated, isPublicView, isLocalSaving, isRefreshing, isSyncing,
    view, activeProjectId, debouncedSearchQuery,
    activeDiagramId, activeNoteId, activeDrawingId, activeFlowchartId,
    fetchDiagrams, fetchNotes, fetchDrawings, fetchFlowcharts,
    selectDiagram, selectNote, selectDrawing, selectFlowchart,
    setActiveDiagramId
  ]);

  // Emergency Flush: Save immediately when switching tabs or minimizing
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isLocalSaving) {
        // Trigger all active saves immediately
        if (view === 'erd' && activeDiagramId) {
          saveDiagram(nodes, edges, viewportRef.current).then(() => {
            setIsLocalSaving(false);
            triggerDebouncedSync();
          });
        } else if (view === 'notes' && activeNoteId) {
          const n = notes.find(n => String(n.id) === String(activeNoteId));
          if (n) {
            saveNote(n).then(() => {
              setIsLocalSaving(false);
              triggerDebouncedSync();
            });
          }
        } else if (view === 'drawings' && activeDrawingId) {
          const d = drawings.find(d => String(d.id) === String(activeDrawingId));
          if (d) {
            saveDrawing(d).then(() => {
              setIsLocalSaving(false);
              triggerDebouncedSync();
            });
          }
        } else if (view === 'flowchart' && activeFlowchartId) {
          const f = flowcharts.find(f => String(f.id) === String(activeFlowchartId));
          if (f) {
            saveFlowchart(f).then(() => {
              setIsLocalSaving(false);
              triggerDebouncedSync();
            });
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [view, activeDiagramId, activeNoteId, activeDrawingId, activeFlowchartId, nodes, edges, isLocalSaving, saveDiagram, saveNote, saveDrawing, saveFlowchart, triggerDebouncedSync, notes, drawings, flowcharts]);

  // ERD Auto-save
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (activeDiagramId && (isAuthenticated || isGuest) && view === 'erd' && !isPublicView) {
      setIsLocalSaving(true);
      saveTimeoutRef.current = setTimeout(async () => {
        await saveDiagram(nodes, edges, viewportRef.current);
        lastSaveCallRef.current = Date.now();
        setIsLocalSaving(false);
        triggerDebouncedSync();
      }, 800);
    }
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [nodes, edges, activeDiagramId, isAuthenticated, isGuest, view, saveDiagram, isPublicView, triggerDebouncedSync]);

  // Handlers
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
      const currentNodes = nodes.map(node => 
        node.id === updatedEntity.id ? { ...node, data: updatedEntity } : node
      );
      await saveDiagram(currentNodes, edges, viewportRef.current);
      lastSaveCallRef.current = Date.now();
      
      // 2. Instant Cloud Sync (Supabase)
      syncDrafts();
    }
  }, [updateEntity, nodes, edges, saveDiagram, viewportRef, syncDrafts]);

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
      // Global shortcuts based on view
      if (view === 'erd') {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          if (e.shiftKey) {
            if (canRedo) redo();
          } else {
            if (canUndo) undo();
          }
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
          if (canRedo) redo();
        }
      } else if (view === 'notes') {
        // Notes specific shortcuts - only active when a note is open
        if (!activeNoteId) return;

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
          e.preventDefault();
          setIsExportNoteModalOpen(true);
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
          e.preventDefault();
          setIsImportNoteModalOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [view, activeNoteId, undo, redo, canUndo, canRedo, setIsExportNoteModalOpen, setIsImportNoteModalOpen]);


  const handleNoteSelect = async (id: number | string) => {
    setView('notes');
    await selectNote(id);
  };

  const handleDrawingSelect = async (id: number | string) => {
    setView('drawings');
    await selectDrawing(id);
  };

  const handleFlowchartSelect = async (id: number | string) => {
    setView('flowchart');
    await selectFlowchart(id);
  };

  const notesSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const handleNoteChange = useCallback((content: string) => {
    if (!activeNoteId) return;
    const noteId = activeNoteId;
    setNotesList(prev => prev.map(n => n.id === noteId ? { ...n, content } : n));
    
    setIsLocalSaving(true);
    if (notesSaveTimeout.current) clearTimeout(notesSaveTimeout.current);
    
    // Capture metadata at the time of change to avoid stale closure issues in the timeout
    const currentNote = notes.find(n => String(n.id) === String(noteId));
    const title = currentNote?.title || '';
    const project_id = currentNote?.project_id || null;

    notesSaveTimeout.current = setTimeout(async () => {
      await saveNote({
        id: noteId, content, title, project_id
      } as any);
      lastSaveCallRef.current = Date.now();
      setIsLocalSaving(false);
      triggerDebouncedSync();
    }, 800);
  }, [activeNoteId, notes, saveNote, setNotesList, triggerDebouncedSync]);

  const drawingsSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const handleDrawingChange = useCallback((data: string) => {
    if (!activeDrawingId) return;
    const drawingId = activeDrawingId;
    setDrawings(prev => prev.map(d => String(d.id) === String(drawingId) ? { ...d, data } : d));
    
    setIsLocalSaving(true);
    if (drawingsSaveTimeout.current) clearTimeout(drawingsSaveTimeout.current);
    
    // Capture metadata at the time of change to avoid stale closure issues in the timeout
    const currentDrawing = drawings.find(d => String(d.id) === String(drawingId));
    const title = currentDrawing?.title || '';
    const project_id = currentDrawing?.project_id || null;

    drawingsSaveTimeout.current = setTimeout(async () => {
      await saveDrawing({
        id: drawingId, data, title, project_id
      } as any);
      lastSaveCallRef.current = Date.now();
      setIsLocalSaving(false);
      triggerDebouncedSync();
    }, 1500);
  }, [activeDrawingId, drawings, saveDrawing, setDrawings, triggerDebouncedSync]);
  
  const flowchartsSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const handleFlowchartChange = useCallback((nodesData: any[], edgesData: any[]) => {
    if (!activeFlowchartId) return;
    const flowchartId = activeFlowchartId;
    const dataString = JSON.stringify({ nodes: nodesData, edges: edgesData });
    setFlowcharts(prev => prev.map(f => String(f.id) === String(flowchartId) ? { ...f, data: dataString } : f));
    
    setIsLocalSaving(true);
    if (flowchartsSaveTimeout.current) clearTimeout(flowchartsSaveTimeout.current);
    
    // Capture metadata at the time of change to avoid stale closure issues in the timeout
    const currentFlowchart = flowcharts.find(f => String(f.id) === String(flowchartId));
    const title = currentFlowchart?.title || '';
    const project_id = currentFlowchart?.project_id || null;

    flowchartsSaveTimeout.current = setTimeout(async () => {
      await saveFlowchart({
        id: flowchartId, data: dataString, title, project_id
      } as any);
      lastSaveCallRef.current = Date.now();
      setIsLocalSaving(false);
      triggerDebouncedSync();
    }, 800);
  }, [activeFlowchartId, flowcharts, saveFlowchart, setFlowcharts, triggerDebouncedSync]);

  const handleViewChange = (newView: typeof view) => {
    if (!isOnline && !isPublicView) {
      toast.error("Offline Mode: Navigation is disabled.", { duration: 5000 });
      return;
    }
    setView(newView);
    if (newView !== 'trash' && newView !== 'changelog' && newView !== 'backups') {
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
  
  const featureLabel = isPublicView ? `Public Shared ${view}` : (view === 'erd' ? 'Diagrams' : view === 'notes' ? 'Notes' : view === 'drawings' ? 'Drawings' : view === 'flowchart' ? 'Flowcharts' : view === 'changelog' ? 'Changelog' : view === 'backups' ? 'Backups' : 'Trash Bin');
  const activeFileName = isPublicView ? (publicData?.name || publicData?.title || 'Shared Document') : (view === 'erd' ? activeDiagram?.name : view === 'notes' ? activeNote?.title : view === 'drawings' ? activeDrawing?.title : view === 'flowchart' ? activeFlowchart?.title : null);
  const activeProjectName = isPublicView ? publicData?.projects?.name : (view === 'erd' ? activeDiagram?.projects?.name : view === 'notes' ? activeNote?.projects?.name : view === 'drawings' ? activeDrawing?.projects?.name : view === 'flowchart' ? activeFlowchart?.projects?.name : null);
  const activeFileUid = isPublicView ? publicData?.uid : (view === 'erd' ? activeDiagram?.uid : view === 'notes' ? activeNote?.uid : view === 'drawings' ? activeDrawing?.uid : view === 'flowchart' ? activeFlowchart?.uid : undefined);

  const handleExportMarkdown = useCallback(() => {
    setIsExportNoteModalOpen(true);
  }, []);

  const handleImportMarkdown = useCallback(() => {
    setIsImportNoteModalOpen(true);
  }, []);

  const executeExportMarkdown = useCallback(() => {
    if (!activeNote) return;
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-'
    });

    // Custom rule for Task Lists (GFM standard)
    turndownService.addRule('taskList', {
      filter: (node) => 
        node.nodeName === 'LI' && 
        node.parentElement?.getAttribute('data-type') === 'taskList',
      replacement: (content, node) => {
        const checked = (node as HTMLElement).getAttribute('data-checked') === 'true';
        return `- [${checked ? 'x' : ' '}] ${content.trim()}\n`;
      }
    });

    // Custom rule for Tables (GFM standard)
    turndownService.addRule('table', {
      filter: 'table',
      replacement: (content) => `\n\n${content}\n\n`
    });

    turndownService.addRule('tableRow', {
      filter: 'tr',
      replacement: (content, node) => {
        let separator = '';
        const parent = node.parentElement;
        
        // If this is the first row of a header or the first row of a table (fallback)
        // we need to add the Markdown table separator line (|---|---|...)
        const isHeaderRow = parent?.nodeName === 'THEAD' || 
                           (!parent?.querySelector('thead') && node === parent?.firstElementChild);

        if (isHeaderRow) {
          const cellCount = (node as HTMLElement).querySelectorAll('th, td').length;
          separator = '|' + '---|'.repeat(cellCount) + '\n';
        }
        
        return '|' + content + '\n' + separator;
      }
    });

    turndownService.addRule('tableCell', {
      filter: ['th', 'td'],
      replacement: (content) => ` ${content.trim()} |`
    });
    
    // Add custom rule for tables if used in Tiptap
    const markdown = turndownService.turndown(activeNote.content);
    const fileName = `${(activeNote.title || 'Note').replace(/\s+/g, '_').toLowerCase()}.md`;
    
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Note exported to Markdown");
  }, [activeNote]);

  const executeImportMarkdown = useCallback(async (file: File) => {
    const toastId = toast.loading(`Importing ${file.name}...`);
    try {
      let html = '';
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension === 'docx') {
        html = await NoteImporter.convertDocxToHtml(file);
      } else if (extension === 'doc') {
        html = await NoteImporter.convertDocToHtml(file);
      } else {
        // Use the centralized importer for Markdown (handles task lists, images, etc.)
        html = await NoteImporter.convertMarkdownToHtml(file);
      }
      
      if (!activeNoteId) {
        // No note active, create a new one
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        const newNote = await createNote(baseName, activeProjectId === 'all' ? null : activeProjectId);
        if (newNote) {
          // Update the content of the newly created note using saveNote
          await saveNote({ ...newNote, content: html });
          setActiveNoteId(newNote.id);
          toast.success(`Created new note from ${file.name}`, { id: toastId });
        }
      } else {
        // Append instead of overwrite
        const currentContent = activeNote?.content || '';
        const separator = currentContent ? '<p></p>' : '';
        const newContent = currentContent + separator + html;
        
        handleNoteChange(newContent);
        toast.success(`${file.name} imported successfully`, { id: toastId });
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to import file", { id: toastId });
    }
  }, [activeNoteId, activeNote, activeProjectId, createNote, updateNote, setActiveNoteId, handleNoteChange]);

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
          onDiagramSelect={handleDiagramSelect} onNoteSelect={handleNoteSelect} onDrawingSelect={handleDrawingSelect} onFlowchartSelect={handleFlowchartSelect} onProjectSelect={setActiveProjectId}
          onDiagramCreate={async (n, pid) => { const f = await createDiagram(n, pid ? Number(pid) : null); if (f) handleDiagramSelect(f.id); }}
          onNoteCreate={async (t, pid) => { const n = await createNote(t, pid ? Number(pid) : null); if (n) handleNoteSelect(n.id); }}
          onDrawingCreate={async (t, pid) => { const d = await createDrawing(t, pid ? Number(pid) : null); if (d) handleDrawingSelect(d.id); }}
          onFlowchartCreate={async (t, pid) => { const f = await createFlowchart(t, pid ? Number(pid) : null); if (f) handleFlowchartSelect(f.id); }}
          onProjectCreate={createProject} onProjectUpdate={updateProject} onProjectDelete={id => { deleteProject(id); fetchTrash(); }}
          onDiagramUpdate={updateDiagram} onNoteUpdate={updateNote} onDrawingUpdate={updateDrawing} onFlowchartUpdate={updateFlowchart}
          onDiagramDelete={id => { deleteDiagram(id); fetchTrash(); }} onNoteDelete={id => { deleteNote(id); fetchTrash(); }} onDrawingDelete={id => { deleteDrawing(id); fetchTrash(); }} onFlowchartDelete={id => { deleteFlowchart(id); fetchTrash(); }}
          onLogout={handleLogout}
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
          view={view} hasActiveItem={isPublicView ? true : hasActiveItem} 
          syncError={syncError}
          isSyncing={isSyncing}
          isRefreshing={isRefreshing}
          activeFileUid={activeFileUid} activeFileId={currentActiveId} initialShareSettings={initialShareSettings} isPublicView={isPublicView}
          onSettingsSaved={() => { const pid = activeProjectId === null ? 'all' : activeProjectId; if (view === 'erd') fetchDiagrams(false, pid, debouncedSearchQuery); else if (view === 'notes') fetchNotes(false, pid, debouncedSearchQuery); else if (view === 'drawings') fetchDrawings(false, pid, debouncedSearchQuery); else if (view === 'flowchart') fetchFlowcharts(false, pid, debouncedSearchQuery); }}
          isOnline={isOnline}
          updatedAt={activeDocument?.updated_at}
          onDelete={() => {
            if (!currentActiveId) return;
            setIsMoveToTrashAlertOpen(true);
          }}
          onRename={() => {
            if (!activeDocument) return;
            setNewName(activeDocument.title || activeDocument.name || "");
            setIsRenameDialogOpen(true);
          }}
          onExportSQL={(dialect) => {
            if (activeDocument) {
              handleExportSQL(dialect, { name: activeFileName || 'Untitled' }, nodes, edges);
            }
          }}
          onExportPDF={() => {
            if (activeDocument) {
              handleExportPDF(activeFileName || 'Untitled');
            }
          }}
          onExportImage={() => {
            if (activeDocument) {
              handleExportImage(activeFileName || 'Untitled');
            }
          }}
          onExportMarkdown={handleExportMarkdown}
          onImportMarkdown={handleImportMarkdown}
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
                NoteExporter.printNote(activeNote as any);
              } else if (format === 'word') {
                NoteExporter.exportToWord(activeNote as any, options);
              }
            }
          }}
        />

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 min-h-0 overflow-hidden">
          {!hasActiveItem && view !== 'trash' && view !== 'changelog' && view !== 'backups' && !isPublicView ? <WelcomeView /> : (
            <>
              {view === 'erd' && (isPublicView ? publicData : activeDiagramId) && (
                <ERDView 
                  isLoading={isDiagramsLoading || isERDItemLoading}
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
                  handleExportPDF={() => {
                    const targetName = isPublicView ? (publicData?.name || 'Shared') : (diagrams.find(f => f.id === activeDiagramId)?.name || 'Diagram');
                    handleExportPDF(targetName);
                  }}
                  handleExportImage={() => {
                    const targetName = isPublicView ? (publicData?.name || 'Shared') : (diagrams.find(f => f.id === activeDiagramId)?.name || 'Diagram');
                    handleExportImage(targetName);
                  }}
                  isReadOnly={isPublicView}
                  undo={undo}
                  redo={redo}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  takeSnapshot={takeSnapshot}
                />
              )}
              {view === 'backups' && (
                <BackupsView />
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
              {view === 'notes' && activeNote && <NotesView isLoading={isNotesLoading || isNoteItemLoading} activeNoteId={isPublicView ? null : activeNoteId} activeNote={activeNote} saveNote={saveNote} handleNoteChange={handleNoteChange} deleteNote={deleteNote} isReadOnly={isPublicView} />}
              {view === 'drawings' && activeDrawing && <DrawingsView isLoading={isDrawingsLoading || isDrawingItemLoading} activeDrawingId={isPublicView ? null : activeDrawingId} activeDrawing={activeDrawing} saveDrawing={saveDrawing} handleDrawingChange={handleDrawingChange} deleteDrawing={deleteDrawing} isReadOnly={isPublicView} />}
              {view === 'flowchart' && activeFlowchart && <FlowchartView isLoading={isFlowchartsLoading || isFlowchartItemLoading} activeFlowchartId={activeFlowchartId} activeFlowchart={activeFlowchart} handleFlowchartChange={handleFlowchartChange} isReadOnly={isPublicView} />}
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
              isLoading={isTrashLoading}
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
                  onUpdateEntity={handleEntityUpdate} 
                  onDeleteEntity={(id) => {
                    deleteEntity(id);
                    setSelectedNodeId(null);
                  }} 
                />
              </DialogBody>
            </DialogContent>
          </Dialog>
        )}

        {/* Rename Dialog */}
        {!isPublicView && (
          <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Rename Document</DialogTitle>
                <DialogDescription>
                  Enter a new name for your {view === 'erd' ? 'diagram' : view === 'notes' ? 'note' : view === 'drawings' ? 'drawing' : 'flowchart'}.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="rename-input" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      New Name
                    </label>
                    <input
                      id="rename-input"
                      type="text"
                      className="w-full flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-all focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newName.trim()) {
                          const id = activeDocument?.id;
                          if (id) {
                            if (view === 'erd') updateDiagram(id, newName);
                            else if (view === 'notes') updateNote(id, newName);
                            else if (view === 'drawings') updateDrawing(id, newName);
                            else if (view === 'flowchart') updateFlowchart(id, newName);
                            setIsRenameDialogOpen(false);
                          }
                        }
                      }}
                      autoFocus
                    />
                  </div>
                </div>
              </DialogBody>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" className="h-9" />}>
                  Cancel
                </DialogClose>
                <Button 
                  disabled={!newName.trim() || newName === (activeDocument?.title || activeDocument?.name)}
                  onClick={() => {
                    const id = activeDocument?.id;
                    if (id && newName.trim()) {
                      if (view === 'erd') updateDiagram(id, newName);
                      else if (view === 'notes') updateNote(id, newName);
                      else if (view === 'drawings') updateDrawing(id, newName);
                      else if (view === 'flowchart') updateFlowchart(id, newName);
                      setIsRenameDialogOpen(false);
                    }
                  }}
                  className="h-9 px-6"
                >
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Move to Trash Confirmation Alert */}
        <AlertDialog open={isMoveToTrashAlertOpen} onOpenChange={setIsMoveToTrashAlertOpen}>
          <AlertDialogContent size="sm" className="max-w-[400px]">
            <AlertDialogHeader className="flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
                <Trash2 className="w-6 h-6 text-destructive" />
              </div>
              <AlertDialogTitle className="text-xl sm:text-center">Move to Trash?</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogBody className="text-center">
              <AlertDialogDescription>
                Are you sure you want to move "{activeDocument?.title || activeDocument?.name || 'this item'}" to trash?
                <br />
                You can restore it later from the trash bin.
              </AlertDialogDescription>
            </AlertDialogBody>
            <AlertDialogFooter className="sm:justify-center flex-col sm:flex-row gap-2 mt-2">
              <AlertDialogCancel className="mt-0 w-full sm:w-auto">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => {
                  if (currentActiveId) {
                    if (view === 'erd') deleteDiagram(currentActiveId);
                    else if (view === 'notes') deleteNote(currentActiveId);
                    else if (view === 'drawings') deleteDrawing(currentActiveId);
                    else if (view === 'flowchart') deleteFlowchart(currentActiveId);
                    fetchTrash();
                    setIsMoveToTrashAlertOpen(false);
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto"
              >
                Move to Trash
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
          <AlertDialogContent size="sm" className="max-w-[400px]">
            <AlertDialogHeader className="flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <AlertDialogTitle className="text-xl sm:text-center">Delete Table</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogBody className="text-center">
              <AlertDialogDescription>
                Are you sure you want to delete the table "{selectedEntity?.name}"?
                <br />
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogBody>
            <AlertDialogFooter className="sm:justify-center flex-col sm:flex-row gap-2 mt-2">
              <AlertDialogCancel className="mt-0 w-full sm:w-auto">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => {
                  if (selectedEntity) {
                    deleteEntity(selectedEntity.id);
                    setSelectedNodeId(null);
                    setIsDeleteAlertOpen(false);
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto"
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
