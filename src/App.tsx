import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  Edge, 
  Node,
  BackgroundVariant,
  OnConnect,
  Viewport,
  useReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  getViewportForBounds
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Download, ChevronDown, Database, Trash, StickyNote, PenTool, Menu, Folder } from 'lucide-react';

// Components
import { AppSidebar } from './components/app-sidebar';
import PropertiesPanel from './components/PropertiesPanel';
import EntityNode from './components/EntityNode';
import NotesEditor from './components/NotesEditor';
import ExcalidrawEditor from './components/ExcalidrawEditor';
import { Login } from './components/Login';

// Hooks
import { useAuth } from './hooks/useAuth';
import { useFiles } from './hooks/useFiles';
import { useNotes } from './hooks/useNotes';
import { useProjects } from './hooks/useProjects';
import { useDrawings } from './hooks/useDrawings';
import { useTrash } from './hooks/useTrash';

// Types
import { Entity, FileData } from './types';

// UI
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCcw, Trash2 as TrashIcon } from 'lucide-react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup
} from "@/components/ui/dropdown-menu";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"

const nodeTypes = {
  entity: EntityNode,
};

const initialNodes: Node<Entity>[] = [];
const initialEdges: Edge[] = [];

function AppContent() {
  const [view, setView] = useState<'erd' | 'notes' | 'drawings' | 'trash'>('notes');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isPermanentDeleteConfirmOpen, setIsPermanentDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number, type: 'erd' | 'notes' | 'drawings' | 'project' } | null>(null);
  
  // Hooks
  const { isAuthenticated, checkAuth, handleLogout } = useAuth();
  const { 
    files, activeFileId, setActiveFileId, saveStatus, setSaveStatus,
    fetchFiles, createFile, updateFile, deleteFile, restoreFile, deleteFilePermanent, moveFileToProject, saveDiagram 
  } = useFiles(isAuthenticated, view);
  
  const { 
    notes, setNotesList, activeNoteId, setActiveNoteId, fetchNotes, createNote, updateNote, deleteNote, moveNoteToProject, saveNote, restoreNote, deleteNotePermanent 
  } = useNotes();
  
  const { 
    projects, activeProjectId, setActiveProjectId, fetchProjects, createProject, updateProject, deleteProject, restoreProject, deleteProjectPermanent 
  } = useProjects();
  
  const { 
    drawings, setDrawings, activeDrawingId, setActiveDrawingId, fetchDrawings, createDrawing, updateDrawing, deleteDrawing, moveDrawingToProject, saveDrawing, restoreDrawing, deleteDrawingPermanent 
  } = useDrawings();
  
  const { trashData, fetchTrash } = useTrash();

  // React Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<Entity>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const noteSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const drawingSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { setViewport } = useReactFlow();

  // Initialization
  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');

    if (isAuthenticated) {
      fetchFiles();
      fetchNotes();
      fetchDrawings();
      fetchProjects();
      fetchTrash();
    }
  }, [isAuthenticated, fetchFiles, fetchNotes, fetchDrawings, fetchProjects, fetchTrash]);

  // ERD Selection Logic
  const handleFileSelect = async (id: number) => {
    try {
      const res = await fetch(`/api/files/${id}`);
      if (res.status === 401) {
        return;
      }
      const data: FileData = await res.json();
      if (data.is_deleted) return;

      setActiveFileId(id);
      setView('erd');

      const flowNodes: Node<Entity>[] = data.entities.map(e => ({
        id: e.id,
        type: 'entity',
        position: { x: e.x, y: e.y },
        data: e,
      }));

      const flowEdges: Edge[] = data.relationships.map(r => ({
        id: r.id,
        source: r.source_entity_id,
        target: r.target_entity_id,
        sourceHandle: r.source_column_id ? `col-${r.source_column_id}-source` : undefined,
        targetHandle: r.target_column_id ? `col-${r.target_column_id}-target` : undefined,
        label: r.label,
        type: 'smoothstep',
        animated: true,
      }));

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

  const deleteEntity = (id: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedNodeId(null);
  };

  // Auto-save ERD
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (activeFileId && isAuthenticated && view === 'erd') {
      saveTimeoutRef.current = setTimeout(() => saveDiagram(nodes, edges, viewportRef.current), 1000);
    }
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [nodes, edges, activeFileId, isAuthenticated, view, saveDiagram]);

  // Note Selection
  const handleNoteSelect = async (id: number) => {
    const note = notes.find(n => n.id === id);
    if (note?.is_deleted) return;
    setActiveNoteId(id);
    setView('notes');
  };

  // Drawing Selection
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

  // Note Change
  const handleNoteChange = useCallback((content: string) => {
    if (!activeNoteId) return;
    
    // Update local state immediately to avoid desync
    setNotesList(prev => prev.map(n => n.id === activeNoteId ? { ...n, content } : n));
    
    if (noteSaveTimeoutRef.current) clearTimeout(noteSaveTimeoutRef.current);
    noteSaveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      // Use functional update to get latest notes from the hook's state
      const success = await saveNote({
        id: activeNoteId,
        content,
        title: notes.find(n => n.id === activeNoteId)?.title || '',
        project_id: notes.find(n => n.id === activeNoteId)?.project_id || null
      } as any);
      
      if (success) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    }, 1000);
  }, [activeNoteId, notes, saveNote, setNotesList, setSaveStatus]);

  // Drawing Change
  const handleDrawingChange = useCallback((data: string) => {
    if (!activeDrawingId) return;
    
    // Update local state immediately to avoid desync
    setDrawings(prev => prev.map(d => d.id === activeDrawingId ? { ...d, data } : d));

    if (drawingSaveTimeoutRef.current) clearTimeout(drawingSaveTimeoutRef.current);
    drawingSaveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      // Use functional update or pass arguments directly since data is already fresh
      const success = await saveDrawing({
        id: activeDrawingId,
        data,
        title: drawings.find(d => d.id === activeDrawingId)?.title || '',
        project_id: drawings.find(d => d.id === activeDrawingId)?.project_id || null
      } as any);

      if (success) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    }, 1000);
  }, [activeDrawingId, drawings, saveDrawing, setDrawings, setSaveStatus]);
    
  // --- Creation Handlers (with auto-select) ---
  const handleFileCreate = async (name: string, projectId?: number | null) => {
    const newFile = await createFile(name, projectId);
    if (newFile) {
      handleFileSelect(newFile.id);
    }
  };

  const handleNoteCreate = async (title: string, projectId?: number | null) => {
    const newNote = await createNote(title, projectId);
    if (newNote) {
      handleNoteSelect(newNote.id);
    }
  };

  const handleDrawingCreate = async (title: string, projectId?: number | null) => {
    const newDrawing = await createDrawing(title, projectId);
    if (newDrawing) {
      handleDrawingSelect(newDrawing.id);
    }
  };

  // --- Sync Handlers (Trash & domain sync) ---
  const handleFileDelete = async (id: number) => {
    await deleteFile(id);
    fetchTrash();
  };

  const handleNoteDelete = async (id: number) => {
    await deleteNote(id);
    fetchTrash();
  };

  const handleDrawingDelete = async (id: number) => {
    await deleteDrawing(id);
    fetchTrash();
  };

  const handleProjectDelete = async (id: number) => {
    const success = await deleteProject(id);
    if (success) fetchTrash();
  };

  const handleFileRestore = async (id: number) => {
    await restoreFile(id);
    fetchTrash();
    fetchFiles();
  };

  const handleNoteRestore = async (id: number) => {
    await restoreNote(id);
    fetchTrash();
    fetchNotes();
  };

  const handleDrawingRestore = async (id: number) => {
    await restoreDrawing(id);
    fetchTrash();
    fetchDrawings();
  };

  const handleProjectRestore = async (id: number) => {
    await restoreProject(id);
    fetchTrash();
    fetchProjects();
  };

  const handleFilePermanentDelete = (id: number) => {
    setItemToDelete({ id, type: 'erd' });
    setIsPermanentDeleteConfirmOpen(true);
  };

  const handleNotePermanentDelete = (id: number) => {
    setItemToDelete({ id, type: 'notes' });
    setIsPermanentDeleteConfirmOpen(true);
  };

  const handleDrawingPermanentDelete = (id: number) => {
    setItemToDelete({ id, type: 'drawings' });
    setIsPermanentDeleteConfirmOpen(true);
  };

  const handleProjectPermanentDelete = (id: number) => {
    setItemToDelete({ id, type: 'project' });
    setIsPermanentDeleteConfirmOpen(true);
  };

  const confirmPermanentDelete = async () => {
    if (itemToDelete) {
      if (itemToDelete.type === 'project') await deleteProjectPermanent(itemToDelete.id);
      else if (itemToDelete.type === 'erd') await deleteFilePermanent(itemToDelete.id);
      else if (itemToDelete.type === 'notes') await deleteNotePermanent(itemToDelete.id);
      else if (itemToDelete.type === 'drawings') await deleteDrawingPermanent(itemToDelete.id);
      
      setIsPermanentDeleteConfirmOpen(false);
      setItemToDelete(null);
      fetchTrash();
    }
  };
  // --- End Sync Handlers ---

  // SQL Export
  const handleExportSQL = (dialect: 'postgresql' | 'mysql') => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (!activeFile) return;
    
    const entities: Entity[] = nodes.map(n => n.data as Entity);
    const relationships = edges.map(e => ({
      source: e.source,
      target: e.target,
      sourceCol: e.sourceHandle?.replace('col-', '').replace('-source', ''),
      targetCol: e.targetHandle?.replace('col-', '').replace('-target', '')
    }));

    let sql = `-- ERD Export: ${activeFile.name}\n-- Dialect: ${dialect}\n\n`;
    
    entities.forEach(entity => {
      sql += `CREATE TABLE ${entity.name} (\n`;
      entity.columns.forEach((col, i) => {
        sql += `  ${col.name} ${col.type}${col.is_pk ? ' PRIMARY KEY' : ''}${col.is_nullable ? '' : ' NOT NULL'}${i === entity.columns.length - 1 ? '' : ','}\n`;
      });
      sql += `);\n\n`;
    });

    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeFile.name.toLowerCase().replace(/\s+/g, '_')}_schema.sql`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isAuthenticated === null) {
    return <div className="h-screen w-screen bg-background flex items-center justify-center"><div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!isAuthenticated) {
    return <Login onLogin={() => checkAuth()} />;
  }

  const activeNote = notes.find(n => n.id === activeNoteId);
  const activeDrawing = drawings.find(d => d.id === activeDrawingId);
  const selectedEntity = nodes.find(n => n.id === selectedNodeId)?.data as Entity || null;

  const sidebarProps = {
    files, notes, drawings, projects, trashData,
    activeFileId, activeNoteId, activeDrawingId, activeProjectId,
    view, onViewChange: setView,
    onFileSelect: handleFileSelect, onNoteSelect: handleNoteSelect, onDrawingSelect: handleDrawingSelect, onProjectSelect: setActiveProjectId,
    onFileCreate: handleFileCreate, onNoteCreate: handleNoteCreate, onDrawingCreate: handleDrawingCreate, onProjectCreate: createProject,
    onProjectUpdate: updateProject, onProjectDelete: handleProjectDelete, onProjectRestore: handleProjectRestore,
    onFileUpdate: updateFile, onNoteUpdate: updateNote, onDrawingUpdate: updateDrawing,
    onFileDelete: handleFileDelete, onNoteDelete: handleNoteDelete, onDrawingDelete: handleDrawingDelete,
    onFileRestore: handleFileRestore, onNoteRestore: handleNoteRestore, onDrawingRestore: handleDrawingRestore,
    onFilePermanentDelete: handleFilePermanentDelete, onNotePermanentDelete: handleNotePermanentDelete, onDrawingPermanentDelete: handleDrawingPermanentDelete, onProjectPermanentDelete: handleProjectPermanentDelete,
    onLogout: handleLogout, saveStatus,
    onMoveFileToProject: moveFileToProject, onMoveNoteToProject: moveNoteToProject, onMoveDrawingToProject: moveDrawingToProject
  };

  return (
    <SidebarProvider>
      <AppSidebar {...sidebarProps} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">
                    {activeProjectId ? projects.find(p => p.id === activeProjectId)?.name : "Workspace"}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {view === 'erd' ? (files.find(f => f.id === activeFileId)?.name || 'ERD Pro') : view === 'notes' ? activeNote?.title : view === 'drawings' ? activeDrawing?.title : 'ERD Pro'}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="ml-auto px-4 flex items-center gap-2">
            {saveStatus === 'saving' && <span className="text-[10px] text-muted-foreground animate-pulse">Saving...</span>}
            {saveStatus === 'saved' && <span className="text-[10px] text-primary">Saved</span>}
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-hidden">
          {view === 'erd' && activeFileId && (
            <div className="flex-1 relative flex flex-col overflow-hidden border rounded-xl bg-muted/20">
              <div className="absolute top-6 inset-x-0 z-10 flex justify-center pointer-events-none">
                <div className="flex items-center gap-2 p-1.5 bg-background/80 backdrop-blur-md border border-border/50 rounded-2xl shadow-2xl pointer-events-auto">
                  <Button onClick={addEntity} size="sm" className="h-9 px-4 font-bold shadow-lg shadow-primary/20"><Plus className="w-4 h-4 mr-2" />Add Table</Button>
                  <div className="w-px h-6 bg-border mx-1" />
                  <DropdownMenu>
                    <DropdownMenuTrigger render={
                      <Button variant="ghost" size="sm" className="h-9 px-4 font-bold text-muted-foreground hover:text-foreground">
                        <Download className="w-4 h-4 mr-2" />
                        Export
                        <ChevronDown className="w-3 h-3 ml-1" />
                      </Button>
                    } />
                    <DropdownMenuContent align="end" className="w-48 p-1">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 py-1.5">SQL Format</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleExportSQL('postgresql')} className="flex items-center gap-3 px-3 py-2 text-xs font-semibold"><Database size={14} className="text-blue-400" />To PostgreSQL</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExportSQL('mysql')} className="flex items-center gap-3 px-3 py-2 text-xs font-semibold"><Database size={14} className="text-orange-400" />To MySQL</DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="flex-1">
                <ReactFlow
                  nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={nodeTypes}
                  onNodeClick={(event, node) => { if (!(event.target as HTMLElement).closest('.nodrag')) setSelectedNodeId(node.id); }}
                  onPaneClick={() => setSelectedNodeId(null)}
                  onMove={(_, viewport) => { viewportRef.current = viewport; }}
                  colorMode="dark"
                >
                  <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
                  <Controls position="bottom-right" showInteractive={false} />
                </ReactFlow>
              </div>
            </div>
          )}

          {view === 'notes' && activeNote && (
            <div className="flex-1 border rounded-xl overflow-hidden bg-background">
              <NotesEditor key={activeNoteId} note={activeNote} onSave={saveNote} onChange={handleNoteChange} onDelete={deleteNote} />
            </div>
          )}

          {view === 'drawings' && activeDrawing && (
            <div className="flex-1 border rounded-xl overflow-hidden bg-background">
              <ExcalidrawEditor key={activeDrawingId} drawing={activeDrawing} onSave={saveDrawing} onChange={handleDrawingChange} onDelete={deleteDrawing} />
            </div>
          )}

          {view === 'trash' && (
            <div className="flex-1 flex flex-col overflow-hidden border rounded-xl bg-background">
              <div className="p-6 border-b">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Trash size={24} className="text-muted-foreground" />
                  Trash Bin
                </h2>
                <p className="text-sm text-muted-foreground">Manage your deleted files and projects. Items can be restored or permanently deleted.</p>
              </div>
              <ScrollArea className="flex-1 p-6">
                <div className="space-y-12">
                  {/* Diagrams Table */}
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Database size={18} className="text-blue-400" />
                        Diagrams
                      </h3>
                      <Badge variant="outline">{trashData.files.length} Items</Badge>
                    </div>
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Deleted At</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {trashData.files.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No deleted diagrams</TableCell>
                            </TableRow>
                          ) : (
                            trashData.files.map((file) => (
                              <TableRow key={file.id}>
                                <TableCell className="font-medium">{file.name}</TableCell>
                                <TableCell className="text-muted-foreground text-xs">{new Date(file.updated_at).toLocaleString()}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button variant="outline" size="sm" onClick={() => { restoreFile(file.id); fetchTrash(); }}>
                                      <RefreshCcw size={14} className="mr-1" /> Restore
                                    </Button>
                                    <Button variant="destructive" size="sm" onClick={() => handleFilePermanentDelete(file.id)}>
                                      <TrashIcon size={14} className="mr-1" /> Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </section>

                  {/* Notes Table */}
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <StickyNote size={18} className="text-yellow-400" />
                        Notes
                      </h3>
                      <Badge variant="outline">{trashData.notes.length} Items</Badge>
                    </div>
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead>Deleted At</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {trashData.notes.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No deleted notes</TableCell>
                            </TableRow>
                          ) : (
                            trashData.notes.map((note) => (
                              <TableRow key={note.id}>
                                <TableCell className="font-medium">{note.title}</TableCell>
                                <TableCell className="text-muted-foreground text-xs">{new Date(note.updated_at).toLocaleString()}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button variant="outline" size="sm" onClick={() => { restoreNote(note.id); fetchTrash(); }}>
                                      <RefreshCcw size={14} className="mr-1" /> Restore
                                    </Button>
                                    <Button variant="destructive" size="sm" onClick={() => handleNotePermanentDelete(note.id)}>
                                      <TrashIcon size={14} className="mr-1" /> Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </section>

                  {/* Drawings Table */}
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <PenTool size={18} className="text-purple-400" />
                        Drawings
                      </h3>
                      <Badge variant="outline">{trashData.drawings.length} Items</Badge>
                    </div>
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead>Deleted At</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {trashData.drawings.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No deleted drawings</TableCell>
                            </TableRow>
                          ) : (
                            trashData.drawings.map((drawing) => (
                              <TableRow key={drawing.id}>
                                <TableCell className="font-medium">{drawing.title}</TableCell>
                                <TableCell className="text-muted-foreground text-xs">{new Date(drawing.updated_at).toLocaleString()}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button variant="outline" size="sm" onClick={() => { restoreDrawing(drawing.id); fetchTrash(); }}>
                                      <RefreshCcw size={14} className="mr-1" /> Restore
                                    </Button>
                                    <Button variant="destructive" size="sm" onClick={() => handleDrawingPermanentDelete(drawing.id)}>
                                      <TrashIcon size={14} className="mr-1" /> Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </section>

                  {/* Projects Table */}
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Folder size={18} className="text-orange-400" />
                        Projects
                      </h3>
                      <Badge variant="outline">{trashData.projects.length} Items</Badge>
                    </div>
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Deleted At</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {trashData.projects.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No deleted projects</TableCell>
                            </TableRow>
                          ) : (
                            trashData.projects.map((project) => (
                              <TableRow key={project.id}>
                                <TableCell className="font-medium">{project.name}</TableCell>
                                <TableCell className="text-muted-foreground text-xs">{new Date(project.created_at).toLocaleString()}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button variant="outline" size="sm" onClick={() => { restoreProject(project.id); fetchTrash(); }}>
                                      <RefreshCcw size={14} className="mr-1" /> Restore
                                    </Button>
                                    <Button variant="destructive" size="sm" onClick={() => handleProjectPermanentDelete(project.id)}>
                                      <TrashIcon size={14} className="mr-1" /> Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </section>
                </div>
              </ScrollArea>
            </div>
          )}

          {((view === 'erd' && !activeFileId) || (view === 'notes' && !activeNoteId) || (view === 'drawings' && !activeDrawingId)) && (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center border rounded-xl bg-muted/10">
              <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center mb-6"><Database size={40} className="opacity-20" /></div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Welcome to ERD Builder Pro</h2>
              <p className="max-w-md text-sm leading-relaxed">Select a project or file from the sidebar to start designing your database schema, taking notes, or sketching ideas.</p>
            </div>
          )}
        </div>
        <Dialog open={!!selectedNodeId} onOpenChange={(open) => !open && setSelectedNodeId(null)}>
          <DialogContent className="p-0 sm:max-w-md max-h-[90vh] overflow-hidden flex flex-col border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl">
            <PropertiesPanel selectedEntity={selectedEntity} onUpdateEntity={updateEntity} onDeleteEntity={deleteEntity} onClose={() => setSelectedNodeId(null)} />
          </DialogContent>
        </Dialog>

        <AlertDialog open={isPermanentDeleteConfirmOpen} onOpenChange={setIsPermanentDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the item from our servers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmPermanentDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Permanently Delete
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
