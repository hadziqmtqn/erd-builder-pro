import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  Edge, 
  Node,
  OnConnect,
  Viewport,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion } from "framer-motion";
import { Database, Trash2 } from 'lucide-react';
import { Button } from "@/components/ui/button";

// Components
import { AppSidebar } from './components/app-sidebar';
import { Login } from './components/Login';
import { MainHeader } from './components/MainHeader';
import { DeleteConfirmModal } from './components/modals/DeleteConfirmModal';
import PropertiesPanel from './components/PropertiesPanel';

// Views
import { ERDView } from './components/views/ERDView';
import { NotesView } from './components/views/NotesView';
import { DrawingsView } from './components/views/DrawingsView';
import { TrashView } from './components/views/TrashView';
import { WelcomeView } from './components/views/WelcomeView';
import { FlowchartView } from './components/views/FlowchartView';

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
import { localPersistence } from './lib/localPersistence';
import { toast } from 'sonner';

// Types
import { Entity, FileData, DraftType } from './types';

// UI
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

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

const initialNodes: Node<Entity>[] = [];
const initialEdges: Edge[] = [];

function AppContent() {
  const [view, setView] = useState<'erd' | 'notes' | 'drawings' | 'trash' | 'flowchart'>('notes');
  const [sidebarView, setSidebarView] = useState<'erd' | 'notes' | 'drawings' | 'flowchart'>('notes');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isPermanentDeleteConfirmOpen, setIsPermanentDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number, type: 'erd' | 'notes' | 'drawings' | 'project' } | null>(null);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  
  // Hooks
  const { isAuthenticated, user, checkAuth, handleLogout } = useAuth();
  
  const { 
    files, activeFileId, setActiveFileId, saveStatus, setSaveStatus,
    fetchFiles, createFile, updateFile, deleteFile, restoreFile, deleteFilePermanent, moveFileToProject, saveDiagram,
    hasMoreFiles
  } = useFiles(isAuthenticated, view);
  
  const { 
    notes, setNotesList, activeNoteId, setActiveNoteId, fetchNotes, createNote, updateNote, deleteNote, moveNoteToProject, saveNote, restoreNote, deleteNotePermanent,
    hasMoreNotes, saveStatus: notesSaveStatus
  } = useNotes();
  
  const { 
    projects, activeProjectId, setActiveProjectId, fetchProjects, createProject, updateProject, deleteProject, restoreProject, deleteProjectPermanent,
    hasMoreProjects
  } = useProjects();
  
  const { 
    drawings, setDrawings, activeDrawingId, setActiveDrawingId, fetchDrawings, createDrawing, updateDrawing, deleteDrawing, moveDrawingToProject, saveDrawing, restoreDrawing, deleteDrawingPermanent,
    hasMoreDrawings, saveStatus: drawingsSaveStatus
  } = useDrawings();

  const {
    flowcharts, setFlowcharts, activeFlowchartId, setActiveFlowchartId, fetchFlowcharts, createFlowchart, updateFlowchart, deleteFlowchart, moveFlowchartToProject, saveFlowchart, restoreFlowchart, deleteFlowchartPermanent,
    hasMoreFlowcharts, saveStatus: flowchartsSaveStatus
  } = useFlowcharts();

  const { trashData, fetchTrash } = useTrash();
  const isOnline = useConnectionStatus();
  useSyncService(isAuthenticated);
  const { isInstallable, installApp } = usePWAInstall();

  // Show install notification
  useEffect(() => {
    if (isInstallable) {
      const hasSeenToast = sessionStorage.getItem('pwa-install-toast-shown');
      if (!hasSeenToast) {
        toast("✨ Enhance your experience", {
          description: "Install ERD Builder Pro as a desktop app for offline access and better performance.",
          action: {
            label: "Install",
            onClick: () => installApp(),
          },
          duration: 10000,
        });
        sessionStorage.setItem('pwa-install-toast-shown', 'true');
      }
    }
  }, [isInstallable, installApp]);

  // React Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<Entity>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const noteSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const drawingSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const flowchartSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { setViewport } = useReactFlow();

  const currentSaveStatus = useMemo(() => {
    if (view === 'erd') return saveStatus;
    if (view === 'notes') return notesSaveStatus;
    if (view === 'drawings') return drawingsSaveStatus;
    if (view === 'flowchart') return flowchartsSaveStatus;
    return 'idle';
  }, [view, saveStatus, notesSaveStatus, drawingsSaveStatus, flowchartsSaveStatus]);

  const hasActiveItem = useMemo(() => {
    if (view === 'erd') return !!activeFileId;
    if (view === 'notes') return !!activeNoteId;
    if (view === 'drawings') return !!activeDrawingId;
    if (view === 'flowchart') return !!activeFlowchartId;
    return false;
  }, [view, activeFileId, activeNoteId, activeDrawingId, activeFlowchartId]);

  // Memoize selected entity for properties panel
  const selectedEntity = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find((n) => n.id === selectedNodeId);
    return node ? (node.data as Entity) : null;
  }, [nodes, selectedNodeId]);

  // Initialization
  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');

    if (isAuthenticated) {
      fetchProjects(false, debouncedSearchQuery);
      fetchTrash();
    }
  }, [isAuthenticated, fetchProjects, fetchTrash, debouncedSearchQuery]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Refetch items when project or search query changes
  useEffect(() => {
    if (isAuthenticated) {
      // @ts-ignore
      fetchFiles(false, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery);
      // @ts-ignore
      fetchNotes(false, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery);
      // @ts-ignore
      fetchDrawings(false, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery);
      // @ts-ignore
      fetchFlowcharts(false, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery);
    }
  }, [isAuthenticated, activeProjectId, debouncedSearchQuery, fetchFiles, fetchNotes, fetchDrawings, fetchFlowcharts]);

  // ERD Selection Logic
  const handleFileSelect = async (id: number) => {
    try {
      // Check for local unsynced draft first
      const draft = await localPersistence.getDraft(DraftType.ERD, id);
      
      const res = await fetch(`/api/files/${id}`);
      if (res.status === 401) return;
      const data: FileData = await res.json();
      
      if (data.is_deleted) return;

      setActiveFileId(id);
      setView('erd');

      // Use draft data if it exists and is unsynced
      let finalData = data;
      if (draft && draft.sync_pending) {
        try {
          const parsedDraft = JSON.parse(draft.data);
          // @ts-ignore
          finalData = { ...data, entities: parsedDraft.nodes.map(n => ({ ...n.data, x: n.position.x, y: n.position.y })), relationships: parsedDraft.edges.map(e => ({
            id: e.id,
            source_entity_id: e.source,
            target_entity_id: e.target,
            source_column_id: e.sourceHandle ? e.sourceHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') : undefined,
            target_column_id: e.targetHandle ? e.targetHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') : undefined,
            source_handle: e.sourceHandle || undefined,
            target_handle: e.targetHandle || undefined,
            label: e.label
          })), viewport_x: parsedDraft.viewport.x, viewport_y: parsedDraft.viewport.y, viewport_zoom: parsedDraft.viewport.zoom };
          toast.info("Loaded unsynced local draft");
        } catch (e) {}
      }

      const flowNodes: Node<Entity>[] = finalData.entities.map(e => ({
        id: e.id,
        type: 'entity',
        position: { x: e.x, y: e.y },
        data: e,
      }));

      const flowEdges: Edge[] = finalData.relationships.map(r => {
        const sourceEntity = finalData.entities.find(e => e.id === r.source_entity_id);
        const targetEntity = finalData.entities.find(e => e.id === r.target_entity_id);
        
        let sHandle = r.source_handle;
        let tHandle = r.target_handle;

        // Smart Heuristic: If no specific handle saved, find the most logical orientation
        if (!sHandle && sourceEntity && targetEntity) {
          if (sourceEntity.x < targetEntity.x) {
            sHandle = `col-${r.source_column_id}-source`; // Right side
          } else {
            sHandle = `col-${r.source_column_id}-source-l`; // Left side
          }
        }

        if (!tHandle && sourceEntity && targetEntity) {
          if (sourceEntity.x < targetEntity.x) {
            tHandle = `col-${r.target_column_id}-target`; // Left side
          } else {
            tHandle = `col-${r.target_column_id}-target-r`; // Right side
          }
        }

        return {
          id: r.id,
          source: r.source_entity_id,
          target: r.target_entity_id,
          sourceHandle: sHandle || (r.source_column_id ? `col-${r.source_column_id}-source` : undefined),
          targetHandle: tHandle || (r.target_column_id ? `col-${r.target_column_id}-target` : undefined),
          label: r.label,
          type: 'smoothstep',
          animated: true,
        };
      });

      setNodes(flowNodes);
      setEdges(flowEdges);
      setSelectedNodeId(null);

      if (data.viewport_x !== undefined && data.viewport_y !== undefined && data.viewport_zoom) {
        setViewport({ x: data.viewport_x, y: data.viewport_y, zoom: data.viewport_zoom }, { duration: 800 });
        viewportRef.current = { x: data.viewport_x, y: data.viewport_y, zoom: data.viewport_zoom };
      } else {
        setTimeout(() => setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 800 }), 100);
      }
    } catch (err) {}
  };

  // ERD Actions
  const onConnect: OnConnect = useCallback((params) => {
    setEdges((eds) => addEdge({ ...params, animated: true, type: 'smoothstep' }, eds));
  }, [setEdges]);

  const addEntity = () => {
    const id = Math.random().toString(36).substr(2, 9);
    const newEntity: Entity = {
      id,
      name: 'NewTable',
      x: Math.random() * 400,
      y: Math.random() * 400,
      color: '#6366f1',
      columns: [
        { id: Math.random().toString(36).substr(2, 9), name: 'id', type: 'INT', is_pk: true, is_nullable: false }
      ],
    };
    const newNode: Node<Entity> = { id, type: 'entity', position: { x: newEntity.x, y: newEntity.y }, data: newEntity };
    setNodes((nds) => nds.concat(newNode));
  };

  const updateEntity = (updatedEntity: Entity) => {
    setNodes((nds) => nds.map((node) => node.id === updatedEntity.id ? { ...node, data: updatedEntity } : node));
  };

  const deleteEntity = useCallback((id: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedNodeId(null);
  }, [setNodes, setEdges, setSelectedNodeId]);

  // Handle custom events from EntityNode
  useEffect(() => {
    const handleEditEntity = (e: any) => {
      setSelectedNodeId(e.detail);
    };
    const handleDeleteEntity = (e: any) => {
      deleteEntity(e.detail);
    };

    window.addEventListener('editEntity', handleEditEntity);
    window.addEventListener('deleteEntity', handleDeleteEntity);

    return () => {
      window.removeEventListener('editEntity', handleEditEntity);
      window.removeEventListener('deleteEntity', handleDeleteEntity);
    };
  }, [deleteEntity]);

  // Auto-save ERD
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (activeFileId && isAuthenticated && view === 'erd') {
      saveTimeoutRef.current = setTimeout(() => saveDiagram(nodes, edges, viewportRef.current), 3000);
    }
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [nodes, edges, activeFileId, isAuthenticated, view, saveDiagram]);

  // Selection Handlers
  const handleNoteSelect = async (id: number) => {
    const note = notes.find(n => n.id === id);
    if (note?.is_deleted) return;
    
    // Check for local draft
    const draft = await localPersistence.getDraft(DraftType.NOTES, id);
    if (draft && draft.sync_pending) {
      try {
        const parsed = JSON.parse(draft.data);
        setNotesList(prev => prev.map(n => n.id === id ? { ...n, content: parsed.content } : n));
        toast.info("Loaded unsynced local note draft");
      } catch (e) {}
    }

    setActiveNoteId(id);
    setView('notes');
  };

  const handleDrawingSelect = async (id: number) => {
    try {
      const res = await fetch(`/api/drawings/${id}`);
      if (!res.ok) return;
      const drawing = await res.json();
      if (drawing.is_deleted) return;
      setActiveDrawingId(id);
      setView('drawings');
    } catch (err) {}
  };

  const handleFlowchartSelect = async (id: number) => {
    try {
      const res = await fetch(`/api/flowcharts/${id}`);
      if (!res.ok) return;
      const flowchart = await res.json();
      if (flowchart.is_deleted) return;
      setActiveFlowchartId(id);
      setView('flowchart');
    } catch (err) {}
  };

  // Change Handlers
  const handleNoteChange = useCallback((content: string) => {
    if (!activeNoteId) return;
    setNotesList(prev => prev.map(n => n.id === activeNoteId ? { ...n, content } : n));
    if (noteSaveTimeoutRef.current) clearTimeout(noteSaveTimeoutRef.current);
    noteSaveTimeoutRef.current = setTimeout(async () => {
      await saveNote({
        id: activeNoteId,
        content,
        title: notes.find(n => n.id === activeNoteId)?.title || '',
        project_id: notes.find(n => n.id === activeNoteId)?.project_id || null
      } as any);
    }, 3000);
  }, [activeNoteId, notes, saveNote, setNotesList]);

  const handleDrawingChange = useCallback((data: string) => {
    if (!activeDrawingId) return;
    setDrawings(prev => prev.map(d => d.id === activeDrawingId ? { ...d, data } : d));
    if (drawingSaveTimeoutRef.current) clearTimeout(drawingSaveTimeoutRef.current);
    drawingSaveTimeoutRef.current = setTimeout(async () => {
      await saveDrawing({
        id: activeDrawingId,
        data,
        title: drawings.find(d => d.id === activeDrawingId)?.title || '',
        project_id: drawings.find(d => d.id === activeDrawingId)?.project_id || null
      } as any);
    }, 3000);
  }, [activeDrawingId, drawings, saveDrawing, setDrawings]);
  
  const handleFlowchartChange = useCallback((nodes: any[], edges: any[]) => {
    if (!activeFlowchartId) return;
    const data = JSON.stringify({ nodes, edges });
    setFlowcharts(prev => prev.map(f => f.id === activeFlowchartId ? { ...f, data } : f));
    if (flowchartSaveTimeoutRef.current) clearTimeout(flowchartSaveTimeoutRef.current);
    flowchartSaveTimeoutRef.current = setTimeout(async () => {
      await saveFlowchart({
        id: activeFlowchartId,
        data,
        title: flowcharts.find(f => f.id === activeFlowchartId)?.title || '',
        project_id: flowcharts.find(f => f.id === activeFlowchartId)?.project_id || null
      } as any);
    }, 3000);
  }, [activeFlowchartId, flowcharts, saveFlowchart, setFlowcharts]);
    
  // Creation Handlers
  const handleFileCreate = async (name: string, projectId?: number | null) => {
    const newFile = await createFile(name, projectId);
    if (newFile) handleFileSelect(newFile.id);
  };

  const handleNoteCreate = async (title: string, projectId?: number | null) => {
    const newNote = await createNote(title, projectId);
    if (newNote) handleNoteSelect(newNote.id);
  };

  const handleDrawingCreate = async (title: string, projectId?: number | null) => {
    const newDrawing = await createDrawing(title, projectId);
    if (newDrawing) handleDrawingSelect(newDrawing.id);
  };

  const handleFlowchartCreate = async (title: string, projectId?: number | null) => {
    const newFlowchart = await createFlowchart(title, projectId);
    if (newFlowchart) handleFlowchartSelect(newFlowchart.id);
  };

  // Sync Handlers
  const handleFileDelete = async (id: number) => { await deleteFile(id); fetchTrash(); };
  const handleNoteDelete = async (id: number) => { await deleteNote(id); fetchTrash(); };
  const handleDrawingDelete = async (id: number) => { await deleteDrawing(id); fetchTrash(); };
  const handleFlowchartDelete = async (id: number) => { await deleteFlowchart(id); fetchTrash(); };
  const handleProjectDelete = async (id: number) => { if (await deleteProject(id)) fetchTrash(); };

  const handleFileRestore = async (id: number) => { await restoreFile(id); fetchTrash(); fetchFiles(); };
  const handleNoteRestore = async (id: number) => { await restoreNote(id); fetchTrash(); fetchNotes(); };
  const handleDrawingRestore = async (id: number) => { await restoreDrawing(id); fetchTrash(); fetchDrawings(); };
  const handleFlowchartRestore = async (id: number) => { await restoreFlowchart(id); fetchTrash(); fetchFlowcharts(); };
  const handleProjectRestore = async (id: number) => { await restoreProject(id); fetchTrash(); fetchProjects(); };

  const handleFilePermanentDelete = (id: number) => { setItemToDelete({ id, type: 'erd' }); setIsPermanentDeleteConfirmOpen(true); };
  const handleNotePermanentDelete = (id: number) => { setItemToDelete({ id, type: 'notes' }); setIsPermanentDeleteConfirmOpen(true); };
  const handleDrawingPermanentDelete = (id: number) => { setItemToDelete({ id, type: 'drawings' }); setIsPermanentDeleteConfirmOpen(true); };
  const handleFlowchartPermanentDelete = (id: number) => { setItemToDelete({ id, type: 'flowchart' as any }); setIsPermanentDeleteConfirmOpen(true); };
  const handleProjectPermanentDelete = (id: number) => { setItemToDelete({ id, type: 'project' }); setIsPermanentDeleteConfirmOpen(true); };

  const confirmPermanentDelete = async () => {
    if (itemToDelete) {
      if (itemToDelete.type === 'project') await deleteProjectPermanent(itemToDelete.id);
      else if (itemToDelete.type === 'erd') await deleteFilePermanent(itemToDelete.id);
      else if (itemToDelete.type === 'notes') await deleteNotePermanent(itemToDelete.id);
      else if (itemToDelete.type === 'drawings') await deleteDrawingPermanent(itemToDelete.id);
      else if (itemToDelete.type === ('flowchart' as any)) await deleteFlowchartPermanent(itemToDelete.id);
      setIsPermanentDeleteConfirmOpen(false);
      setItemToDelete(null);
      fetchTrash();
    }
  };

  // SQL Export
  const handleExportSQL = (dialect: 'postgresql' | 'mysql') => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (!activeFile) return;
    const entities: Entity[] = nodes.map(n => n.data as Entity);
    const entityMap = new Map(entities.map(e => [e.id, e]));
    let sql = `-- ERD Export: ${activeFile.name}\n-- Dialect: ${dialect}\n\n`;
    entities.forEach(entity => {
      sql += `CREATE TABLE ${entity.name} (\n`;
      entity.columns.forEach((col, i) => {
        sql += `  ${col.name} ${col.type}${col.is_pk ? ' PRIMARY KEY' : ''}${col.is_nullable ? '' : ' NOT NULL'}${i === entity.columns.length - 1 ? '' : ','}\n`;
      });
      sql += `);\n\n`;
    });
    const relationshipsGenerated = new Set<string>();
    edges.forEach(edge => {
      const sourceEntity = entityMap.get(edge.source);
      const targetEntity = entityMap.get(edge.target);
      if (sourceEntity && targetEntity) {
        const sourceColId = edge.sourceHandle?.replace('col-', '').replace('-source-l', '').replace('-source', '');
        const targetColId = edge.targetHandle?.replace('col-', '').replace('-target-r', '').replace('-target', '');
        const sourceColumn = sourceEntity.columns.find(c => c.id === sourceColId);
        const targetColumn = targetEntity.columns.find(c => c.id === targetColId);
        if (sourceColumn && targetColumn) {
          const constraintName = `fk_${sourceEntity.name}_${sourceColumn.name}`.toLowerCase();
          const relKey = `${sourceEntity.name}.${sourceColumn.name}->${targetEntity.name}.${targetColumn.name}`;
          if (!relationshipsGenerated.has(relKey)) {
            sql += `ALTER TABLE ${sourceEntity.name} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${sourceColumn.name}) REFERENCES ${targetEntity.name}(${targetColumn.name});\n`;
            relationshipsGenerated.add(relKey);
          }
        }
      }
    });

    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeFile.name.toLowerCase().replace(/\s+/g, '_')}_schema.sql`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render initialization or login states
  if (isAuthenticated === null) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center gap-6 overflow-hidden">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative">
          <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center shadow-2xl shadow-primary/40">
            <Database className="w-10 h-10 text-primary-foreground animate-bounce" />
          </div>
          <div className="absolute -inset-4 border-2 border-primary/20 rounded-3xl animate-[spin_3s_linear_infinite]" />
        </motion.div>
        <div className="text-center z-10">
          <h2 className="text-xl font-bold text-white mb-2">Preparing your workspace...</h2>
          <div className="flex items-center justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <motion.div key={i} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }} className="w-1.5 h-1.5 rounded-full bg-primary" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={() => checkAuth()} />;
  }

  // Derive component-level props
  const activeNote = notes.find(n => n.id === activeNoteId);
  const activeDrawing = drawings.find(d => d.id === activeDrawingId);
  const activeFlowchart = flowcharts.find(f => f.id === activeFlowchartId);
  const activeFile = files.find(f => f.id === activeFileId);
  
  const featureLabel = view === 'erd' ? 'Diagrams' : view === 'notes' ? 'Notes' : view === 'drawings' ? 'Drawings' : view === 'flowchart' ? 'Flowcharts' : 'Trash Bin';
  const activeFileName = view === 'erd' ? activeFile?.name : view === 'notes' ? activeNote?.title : view === 'drawings' ? activeDrawing?.title : view === 'flowchart' ? activeFlowchart?.title : null;
  const activeProjectName = view === 'erd' ? activeFile?.projects?.name : view === 'notes' ? activeNote?.projects?.name : view === 'drawings' ? activeDrawing?.projects?.name : view === 'flowchart' ? activeFlowchart?.projects?.name : null;

  const handleViewChange = (newView: typeof view) => {
    if (!isOnline) {
      toast.error("Offline Mode: Navigation is disabled to prevent data mismatch.", {
        description: "Please restore your connection to switch between documents.",
        duration: 5000,
      });
      return;
    }
    setView(newView);
    if (newView !== 'trash') setSidebarView(newView);
  };

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      {/* Offline Overlay */}
      {!isOnline && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center pointer-events-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md w-full p-8 bg-card border border-destructive/20 rounded-3xl shadow-2xl text-center space-y-6"
          >
            <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Database className="w-8 h-8 text-destructive" />
              </motion.div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">Offline Connection lost</h2>
              <p className="text-muted-foreground text-balanced lowercase first-letter:uppercase">
                koneksi internet terputus. jangan khawatir, fitur **autosave** lokal kami tetap aktif menyimpan perubahan di perangkat anda. namun, demi keamanan data, anda tidak dapat beralih halaman hingga koneksi kembali normal.
              </p>
            </div>
            <div className="pt-4 flex flex-col gap-3">
              <div className="flex items-center justify-center gap-2 text-xs font-medium text-destructive animate-pulse">
                <span className="w-2 h-2 rounded-full bg-destructive" />
                waiting for reconnection...
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <AppSidebar 
        files={files} notes={notes} drawings={drawings} flowcharts={flowcharts} projects={projects} trashData={trashData}
        activeFileId={activeFileId} activeNoteId={activeNoteId} activeDrawingId={activeDrawingId} activeFlowchartId={activeFlowchartId} activeProjectId={activeProjectId} view={view}
        onFileSelect={handleFileSelect} onNoteSelect={handleNoteSelect} onDrawingSelect={handleDrawingSelect} onFlowchartSelect={handleFlowchartSelect} onProjectSelect={setActiveProjectId}
        onFileCreate={handleFileCreate} onNoteCreate={handleNoteCreate} onDrawingCreate={handleDrawingCreate} onFlowchartCreate={handleFlowchartCreate} onProjectCreate={createProject}
        onProjectUpdate={updateProject} onProjectDelete={handleProjectDelete} onProjectRestore={handleProjectRestore}
        onFileUpdate={updateFile} onNoteUpdate={updateNote} onDrawingUpdate={updateDrawing} onFlowchartUpdate={updateFlowchart}
        onFileDelete={handleFileDelete} onNoteDelete={handleNoteDelete} onDrawingDelete={handleDrawingDelete} onFlowchartDelete={handleFlowchartDelete}
        onFileRestore={handleFileRestore} onNoteRestore={handleNoteRestore} onDrawingRestore={handleDrawingRestore} onFlowchartRestore={handleFlowchartRestore}
        onFilePermanentDelete={handleFilePermanentDelete} onNotePermanentDelete={handleNotePermanentDelete} onDrawingPermanentDelete={handleDrawingPermanentDelete} onFlowchartPermanentDelete={handleFlowchartPermanentDelete} onProjectPermanentDelete={handleProjectPermanentDelete}
        onLogout={handleLogout} saveStatus={saveStatus}
        onMoveFileToProject={moveFileToProject} onMoveNoteToProject={moveNoteToProject} onMoveDrawingToProject={moveDrawingToProject} onMoveFlowchartToProject={moveFlowchartToProject}
        sidebarView={sidebarView}
        onViewChange={handleViewChange}
        hasMoreProjects={hasMoreProjects} hasMoreFiles={hasMoreFiles} hasMoreNotes={hasMoreNotes} hasMoreDrawings={hasMoreDrawings} hasMoreFlowcharts={hasMoreFlowcharts}
        onLoadMoreProjects={() => fetchProjects(true, debouncedSearchQuery)}
        onLoadMoreFiles={() => fetchFiles(true, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery)}
        onLoadMoreNotes={() => fetchNotes(true, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery)}
        onLoadMoreDrawings={() => fetchDrawings(true, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery)}
        onLoadMoreFlowcharts={() => fetchFlowcharts(true, activeProjectId === null ? 'all' : activeProjectId, debouncedSearchQuery)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        user={user}
        isOnline={isOnline}
        isInstallable={isInstallable}
        onInstall={installApp}
      />
      <SidebarInset>
        <MainHeader 
          featureLabel={featureLabel} activeProjectName={activeProjectName} activeFileName={activeFileName} 
          view={view} hasActiveItem={hasActiveItem} currentSaveStatus={currentSaveStatus}
        />

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 min-h-0 overflow-hidden">
          {!hasActiveItem && view !== 'trash' ? (
            <WelcomeView />
          ) : (
            <>
              {view === 'erd' && activeFileId && (
                <ERDView 
                  nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
                  onNodeClick={(event, node) => { if (!(event.target as HTMLElement).closest('.nodrag')) setSelectedNodeId(node.id); }}
                  onPaneClick={() => setSelectedNodeId(null)}
                  onMove={(_, viewport) => { viewportRef.current = viewport; }}
                  addEntity={addEntity} handleExportSQL={handleExportSQL}
                />
              )}

              {view === 'notes' && activeNote && (
                <NotesView activeNoteId={activeNoteId} activeNote={activeNote} saveNote={saveNote} handleNoteChange={handleNoteChange} deleteNote={deleteNote} />
              )}

              {view === 'drawings' && activeDrawing && (
                <DrawingsView activeDrawingId={activeDrawingId} activeDrawing={activeDrawing} saveDrawing={saveDrawing} handleDrawingChange={handleDrawingChange} deleteDrawing={deleteDrawing} />
              )}

              {view === 'flowchart' && activeFlowchart && (
                <FlowchartView 
                  activeFlowchartId={activeFlowchartId}
                  activeFlowchart={activeFlowchart}
                  handleFlowchartChange={handleFlowchartChange}
                />
              )}
            </>
          )}

          {view === 'trash' && (
            <TrashView 
              trashData={trashData} restoreProject={restoreProject} restoreFile={handleFileRestore} restoreNote={handleNoteRestore} restoreDrawing={handleDrawingRestore} restoreFlowchart={handleFlowchartRestore}
              fetchTrash={fetchTrash} handleProjectPermanentDelete={handleProjectPermanentDelete} handleFilePermanentDelete={handleFilePermanentDelete}
              handleNotePermanentDelete={handleNotePermanentDelete} handleDrawingPermanentDelete={handleDrawingPermanentDelete} handleFlowchartPermanentDelete={handleFlowchartPermanentDelete}
            />
          )}
        </div>

        <DeleteConfirmModal 
          isOpen={isPermanentDeleteConfirmOpen} onOpenChange={setIsPermanentDeleteConfirmOpen} 
          onConfirm={confirmPermanentDelete} onCancel={() => setItemToDelete(null)}
          itemType={itemToDelete?.type || ''}
        />

        {/* Entity Properties Modal */}
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
