import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  Panel, 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  Connection, 
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
import { Plus, Download, ChevronDown, Database, Lock, User, Mail, Trash, StickyNote } from 'lucide-react';
import Sidebar from './components/Sidebar';
import PropertiesPanel from './components/PropertiesPanel';
import EntityNode from './components/EntityNode';
import NotesEditor from './components/NotesEditor';
import ExcalidrawEditor from './components/ExcalidrawEditor';
import { FileData, Entity, Relationship, Project, Note, Drawing } from './types';
import { cn } from './lib/utils';
import { PenTool, LogOut, Settings, Menu, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const nodeTypes = {
  entity: EntityNode,
};

const initialNodes: Node<Entity>[] = [];
const initialEdges: Edge[] = [];

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [adminEmail, setAdminEmail] = useState('admin@example.com');

  useEffect(() => {
    fetch('/api/auth-config')
      .then(res => res.json())
      .then(data => setAdminEmail(data.adminEmail))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        onLogin();
        toast.success("Welcome back!");
      } else {
        const data = await res.json();
        toast.error(data.error || "Login failed");
      }
    } catch (err) {
      console.error('Login error:', err);
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-border/50 shadow-2xl animate-in fade-in zoom-in duration-300">
        <CardHeader className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-xl shadow-primary/20">
            <Database className="w-10 h-10 text-primary-foreground" />
          </div>
          <div className="text-center">
            <CardTitle className="text-2xl font-bold tracking-tight">ERD Builder Pro</CardTitle>
            <CardDescription>Please sign in to continue</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={adminEmail}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full font-bold h-12"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// Main App Component
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [view, setView] = useState<'erd' | 'notes' | 'drawings' | 'trash'>('notes');
  const [files, setFiles] = useState<FileData[]>([]);
  const [notes, setNotesList] = useState<Note[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [trashData, setTrashData] = useState<{
    files: FileData[];
    notes: Note[];
    drawings: Drawing[];
    projects: Project[];
  }>({ files: [], notes: [], drawings: [], projects: [] });
  const [activeFileId, setActiveFileId] = useState<number | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [activeDrawingId, setActiveDrawingId] = useState<number | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<Entity>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const noteSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const drawingSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const { setViewport, fitView, getNodes } = useReactFlow();

  useEffect(() => {
    // Force dark mode on the root element
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');

    const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as globalThis.Node)) {
        setShowExportDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        setIsAuthenticated(true);
        fetchInitialData();
      } else {
        setIsAuthenticated(false);
      }
    } catch (err) {
      setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const fetchInitialData = async () => {
    await Promise.all([
      fetchFiles(),
      fetchNotes(),
      fetchDrawings(),
      fetchProjects(),
      fetchTrash()
    ]);
  };

  // Fetch Trash
  const fetchTrash = async () => {
    try {
      const res = await fetch('/api/trash');
      if (res.ok) {
        const data = await res.json();
        setTrashData(data);
      }
    } catch (err) {
      console.error('Error fetching trash:', err);
    }
  };

  // Fetch Files
  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setFiles(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching files:', err);
    }
  };

  // Fetch Notes
  const fetchNotes = async () => {
    try {
      const res = await fetch('/api/notes');
      if (res.ok) {
        const data = await res.json();
        setNotesList(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
    }
  };

  // Fetch Drawings
  const fetchDrawings = async () => {
    try {
      const res = await fetch('/api/drawings');
      if (res.ok) {
        const data = await res.json();
        setDrawings(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching drawings:', err);
    }
  };

  // Fetch Projects
  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  };

  // Load File Data
  const handleFileSelect = async (id: number) => {
    try {
      const res = await fetch(`/api/files/${id}`);
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      const data: FileData = await res.json();
      
      if (data.is_deleted) {
        return;
      }

      setActiveFileId(id);
      setView('erd');

      const flowNodes: Node<Entity>[] = data.entities.map(e => ({
        id: e.id,
        type: 'entity',
        position: { x: e.x, y: e.y },
        data: e,
      }));

      const flowEdges: Edge[] = data.relationships.map(r => {
        const edge: Edge = {
          id: r.id,
          source: r.source_entity_id,
          target: r.target_entity_id,
          sourceHandle: r.source_column_id ? `col-${r.source_column_id}-source` : undefined,
          targetHandle: r.target_column_id ? `col-${r.target_column_id}-target` : undefined,
          label: r.label,
          type: 'smoothstep',
          animated: true,
        };
        return edge;
      });

      if (process.env.NODE_ENV !== 'production' || window.location.hostname !== 'localhost') {
        console.log('Restored ERD Edges:', flowEdges.map(e => ({ id: e.id, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })));
      }

      setNodes(flowNodes);
      setEdges(flowEdges);
      setSelectedNodeId(null);

      // Restore viewport
      if (data.viewport_x !== undefined && data.viewport_y !== undefined && data.viewport_zoom) {
        setViewport({ x: data.viewport_x, y: data.viewport_y, zoom: data.viewport_zoom }, { duration: 800 });
        viewportRef.current = { x: data.viewport_x, y: data.viewport_y, zoom: data.viewport_zoom };
      } else {
        // Default view if no saved viewport
        setTimeout(() => setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 800 }), 100);
      }
    } catch (err) {
    }
  };

  // Load Note Data
  const handleNoteSelect = async (id: number) => {
    const note = notes.find(n => n.id === id) || await (await fetch(`/api/notes/${id}`)).json();
    if (note.is_deleted) {
      return;
    }
    setActiveNoteId(id);
    setView('notes');
  };

  // Load Drawing Data
  const handleDrawingSelect = async (id: number) => {
    try {
      const res = await fetch(`/api/drawings/${id}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache'
        }
      });
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      const drawing: Drawing = await res.json();
      if (drawing.is_deleted) {
        return;
      }
      // Update local state with the latest data from server
      setDrawings(prev => {
        const exists = prev.find(d => d.id === id);
        if (exists) {
          return prev.map(d => d.id === id ? drawing : d);
        }
        return [...prev, drawing];
      });
      setActiveDrawingId(id);
      setView('drawings');
    } catch (err) {
      console.error("Failed to load drawing", err);
    }
  };

  // Auto-save logic for ERD
  const saveDiagram = useCallback(async () => {
    if (!activeFileId || !isAuthenticated || view !== 'erd') return;
    setSaveStatus('saving');

    const entities: Entity[] = nodes.map(n => ({
      ...n.data,
      x: n.position.x,
      y: n.position.y,
    })) as Entity[];

    const relationships: Relationship[] = edges.map(e => ({
      id: e.id,
      source_entity_id: e.source,
      target_entity_id: e.target,
      source_column_id: e.sourceHandle ? e.sourceHandle.replace('col-', '').replace('-source', '').replace('-target', '') : undefined,
      target_column_id: e.targetHandle ? e.targetHandle.replace('col-', '').replace('-source', '').replace('-target', '') : undefined,
      type: 'one-to-many',
      label: e.label as string,
    }));

    if (process.env.NODE_ENV !== 'production' || window.location.hostname !== 'localhost') {
      console.log('Saving Relationships:', relationships);
    }

    try {
      const res = await fetch(`/api/save/${activeFileId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entities, relationships, viewport: viewportRef.current }),
      });
      if (res.status === 401) {
        setIsAuthenticated(false);
      } else if (res.ok) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (err) {
      setSaveStatus('error');
    }
  }, [activeFileId, nodes, edges, isAuthenticated, view]);

  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (activeFileId && isAuthenticated && view === 'erd') {
      saveTimeoutRef.current = setTimeout(saveDiagram, 1000);
    }
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [nodes, edges, saveDiagram, activeFileId, isAuthenticated, view]);

  // Actions
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

    const newNode: Node<Entity> = {
      id,
      type: 'entity',
      position: { x: newEntity.x, y: newEntity.y },
      data: newEntity,
    };

    setNodes((nds) => nds.concat(newNode));
  };

  const updateEntity = (updatedEntity: Entity) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === updatedEntity.id) {
          return { ...node, data: updatedEntity };
        }
        return node;
      })
    );
  };

  const deleteEntity = (id: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedNodeId(null);
  };

  const createFile = async (name: string, projectId?: number | null) => {
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, project_id: projectId }),
      });
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      const newFile = await res.json();
      setFiles([newFile, ...files]);
      handleFileSelect(newFile.id);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const createNote = async (title: string, projectId?: number | null) => {
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, project_id: projectId }),
      });
      const newNote = await res.json();
      setNotesList([newNote, ...notes]);
      handleNoteSelect(newNote.id);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const createDrawing = async (title: string, projectId?: number | null) => {
    try {
      const res = await fetch('/api/drawings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, project_id: projectId }),
      });
      const newDrawing = await res.json();
      setDrawings([newDrawing, ...drawings]);
      handleDrawingSelect(newDrawing.id);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const createProject = async (name: string) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const newProject = await res.json();
      setProjects([...projects, newProject]);
      setActiveProjectId(newProject.id);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const updateProject = async (id: number, name: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setProjects(projects.map(p => p.id === id ? { ...p, name } : p));
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const deleteProject = async (id: number) => {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects(projects.map(p => p.id === id ? { ...p, is_deleted: true } : p));
        if (activeProjectId === id) {
          setActiveProjectId(null);
        }
        // Refresh data to hide files belonging to deleted project
        fetchInitialData();
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const restoreProject = async (id: number) => {
    try {
      const res = await fetch(`/api/projects/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        setProjects(projects.map(p => p.id === id ? { ...p, is_deleted: false } : p));
        fetchInitialData();
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const updateFile = async (id: number, name: string) => {
    try {
      const res = await fetch(`/api/files/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setFiles(files.map(f => f.id === id ? { ...f, name } : f));
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const updateNote = async (id: number, title: string) => {
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setNotesList(notes.map(n => n.id === id ? { ...n, title } : n));
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const updateDrawing = async (id: number, title: string) => {
    try {
      const res = await fetch(`/api/drawings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setDrawings(drawings.map(d => d.id === id ? { ...d, title } : d));
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const deleteFile = async (id: number) => {
    try {
      const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      setFiles(files.map(f => f.id === id ? { ...f, is_deleted: true } : f));
      if (activeFileId === id) {
        setActiveFileId(null);
        setNodes([]);
        setEdges([]);
      }
      fetchTrash();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const deleteNote = async (id: number) => {
    try {
      await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      setNotesList(notes.map(n => n.id === id ? { ...n, is_deleted: true } : n));
      if (activeNoteId === id) {
        setActiveNoteId(null);
      }
      fetchTrash();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const deleteDrawing = async (id: number) => {
    try {
      await fetch(`/api/drawings/${id}`, { method: 'DELETE' });
      setDrawings(drawings.map(d => d.id === id ? { ...d, is_deleted: true } : d));
      if (activeDrawingId === id) {
        setActiveDrawingId(null);
      }
      fetchTrash();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const deleteFilePermanent = async (id: number) => {
    try {
      await fetch(`/api/files/${id}/permanent`, { method: 'DELETE' });
      fetchTrash();
    } catch (err) {}
  };

  const deleteNotePermanent = async (id: number) => {
    try {
      await fetch(`/api/notes/${id}/permanent`, { method: 'DELETE' });
      fetchTrash();
    } catch (err) {}
  };

  const deleteDrawingPermanent = async (id: number) => {
    try {
      await fetch(`/api/drawings/${id}/permanent`, { method: 'DELETE' });
      fetchTrash();
    } catch (err) {}
  };

  const deleteProjectPermanent = async (id: number) => {
    try {
      // Assuming there's an endpoint for permanent project delete, if not I'll add it to server.ts
      await fetch(`/api/projects/${id}/permanent`, { method: 'DELETE' });
      fetchTrash();
    } catch (err) {}
  };

  const restoreFile = async (id: number) => {
    try {
      await fetch(`/api/files/${id}/restore`, { method: 'POST' });
      setFiles(files.map(f => f.id === id ? { ...f, is_deleted: false } : f));
      fetchTrash();
      handleFileSelect(id);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const restoreNote = async (id: number) => {
    try {
      await fetch(`/api/notes/${id}/restore`, { method: 'POST' });
      setNotesList(notes.map(n => n.id === id ? { ...n, is_deleted: false } : n));
      fetchTrash();
      handleNoteSelect(id);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const restoreDrawing = async (id: number) => {
    try {
      await fetch(`/api/drawings/${id}/restore`, { method: 'POST' });
      setDrawings(drawings.map(d => d.id === id ? { ...d, is_deleted: false } : d));
      fetchTrash();
      handleDrawingSelect(id);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const saveNote = useCallback(async (updatedNote: Note) => {
    setSaveStatus('saving');
    try {
      await fetch(`/api/notes/${updatedNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedNote),
      });
      setNotesList(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
    }
  }, []);

  const saveDrawing = useCallback(async (updatedDrawing: Drawing) => {
    setSaveStatus('saving');
    try {
      await fetch(`/api/drawings/${updatedDrawing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedDrawing),
      });
      setDrawings(prev => prev.map(d => d.id === updatedDrawing.id ? updatedDrawing : d));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
    }
  }, []);

  const moveFileToProject = async (fileId: number, projectId: number | null) => {
    try {
      const response = await fetch(`/api/files/${fileId}/project`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (response.ok) {
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, project_id: projectId } : f));
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (error) {
      console.error('Error moving file:', error);
      setSaveStatus('error');
    }
  };

  const moveNoteToProject = async (noteId: number, projectId: number | null) => {
    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...notes.find(n => n.id === noteId), project_id: projectId }),
      });
      if (response.ok) {
        setNotesList(prev => prev.map(n => n.id === noteId ? { ...n, project_id: projectId } : n));
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (error) {
      console.error('Error moving note:', error);
      setSaveStatus('error');
    }
  };

  const moveDrawingToProject = async (drawingId: number, projectId: number | null) => {
    try {
      const response = await fetch(`/api/drawings/${drawingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...drawings.find(d => d.id === drawingId), project_id: projectId }),
      });
      if (response.ok) {
        setDrawings(prev => prev.map(d => d.id === drawingId ? { ...d, project_id: projectId } : d));
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (error) {
      console.error('Error moving drawing:', error);
      setSaveStatus('error');
    }
  };

  const handleExportSQL = (dialect: 'mysql' | 'postgresql') => {
    if (!activeFileId) return;
    const currentFile = files.find(f => f.id === activeFileId);
    if (!currentFile) return;

    let sql = `-- ERD Builder Pro Export\n-- Database: ${dialect === 'mysql' ? 'MySQL' : 'PostgreSQL'}\n-- Generated: ${new Date().toLocaleString()}\n\n`;

    // 1. Create Tables
    nodes.forEach(node => {
      const entity = node.data as Entity;
      sql += `CREATE TABLE ${entity.name} (\n`;
      
      let hasAutoIncrement = false;
      const columnDefs = entity.columns.map(col => {
        let def = `  ${col.name} `;
        
        // Type mapping
        let type = col.type.toUpperCase();
        if (dialect === 'postgresql') {
          if (col.is_pk && type === 'INT' && !hasAutoIncrement) {
             type = 'SERIAL';
             hasAutoIncrement = true;
          } else if (type === 'VARCHAR') type = 'VARCHAR(255)';
        } else {
          if (type === 'VARCHAR') type = 'VARCHAR(255)';
        }
        
        def += type;
        
        if (!col.is_nullable) def += ' NOT NULL';
        if (col.is_pk && dialect === 'mysql') def += ' PRIMARY KEY';
        if (col.is_pk && dialect === 'mysql' && type === 'INT' && !hasAutoIncrement) {
          def += ' AUTO_INCREMENT';
          hasAutoIncrement = true;
        }
        
        return def;
      });

      if (dialect === 'postgresql') {
        const pks = entity.columns.filter(c => c.is_pk).map(c => c.name);
        if (pks.length > 0) {
          columnDefs.push(`  PRIMARY KEY (${pks.join(', ')})`);
        }
      }

      sql += columnDefs.join(',\n');
      sql += `\n);\n\n`;
    });

    // 2. Add Foreign Keys
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return;

      const sourceColId = edge.sourceHandle?.replace('col-', '').replace('-source', '').replace('-target', '');
      const targetColId = edge.targetHandle?.replace('col-', '').replace('-source', '').replace('-target', '');

      const sourceCol = sourceNode.data.columns.find((c: any) => c.id === sourceColId)?.name;
      const targetCol = targetNode.data.columns.find((c: any) => c.id === targetColId)?.name;

      if (sourceCol && targetCol) {
        sql += `ALTER TABLE ${sourceNode.data.name} ADD CONSTRAINT fk_${sourceNode.data.name}_${edge.id.substring(0,4)} \n`;
        sql += `  FOREIGN KEY (${sourceCol}) REFERENCES ${targetNode.data.name}(${targetCol});\n\n`;
      }
    });

    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentFile.name.replace(/\s+/g, '_')}_${dialect}.sql`;
    a.click();
    URL.revokeObjectURL(url);
    
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
    setShowExportDropdown(false);
  };

  // Auto-save logic for notes
  const handleNoteChange = useCallback((content: string) => {
    if (!activeNoteId) return;
    
    // Update local state immediately
    setNotesList(prev => prev.map(n => n.id === activeNoteId ? { ...n, content } : n));
    
    // Debounce save
    if (noteSaveTimeoutRef.current) clearTimeout(noteSaveTimeoutRef.current);
    noteSaveTimeoutRef.current = setTimeout(() => {
      setNotesList(currentNotes => {
        const note = currentNotes.find(n => n.id === activeNoteId);
        if (note) {
          saveNote({ ...note, content });
        }
        return currentNotes;
      });
    }, 1000);
  }, [activeNoteId, saveNote]);

  // Auto-save logic for drawings
  // Cleanup timeouts on unmount or id change
  useEffect(() => {
    return () => {
      if (drawingSaveTimeoutRef.current) {
        clearTimeout(drawingSaveTimeoutRef.current);
      }
    };
  }, [activeDrawingId]);

  const handleDrawingChange = useCallback((data: string) => {
    if (!activeDrawingId) return;

    // Update local state immediately
    setDrawings(prev => prev.map(d => d.id === activeDrawingId ? { ...d, data } : d));

    // Debounce save
    if (drawingSaveTimeoutRef.current) clearTimeout(drawingSaveTimeoutRef.current);
    drawingSaveTimeoutRef.current = setTimeout(() => {
      // Use functional update or ref to get latest drawings to avoid dependency on drawings array
      setDrawings(currentDrawings => {
        const drawing = currentDrawings.find(d => d.id === activeDrawingId);
        if (drawing) {
          saveDrawing({ ...drawing, data });
        }
        return currentDrawings;
      });
    }, 1000);
  }, [activeDrawingId, saveDrawing]);

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      setIsAuthenticated(false);
      setFiles([]);
      setNotesList([]);
      setProjects([]);
      setActiveFileId(null);
      setActiveNoteId(null);
      setNodes([]);
      setEdges([]);
    } catch (err) {
    }
  };

  if (isAuthenticated === null) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={() => checkAuth()} />;
  }

  const selectedEntity = nodes.find(n => n.id === selectedNodeId)?.data as Entity || null;
  const activeNote = notes.find(n => n.id === activeNoteId);
  const activeDrawing = drawings.find(d => d.id === activeDrawingId);

  const sidebarProps = {
    files,
    notes,
    drawings,
    projects,
    trashData,
    activeFileId,
    activeNoteId,
    activeDrawingId,
    activeProjectId,
    view,
    onViewChange: setView,
    onFileSelect: handleFileSelect,
    onNoteSelect: handleNoteSelect,
    onDrawingSelect: handleDrawingSelect,
    onProjectSelect: setActiveProjectId,
    onFileCreate: createFile,
    onNoteCreate: createNote,
    onDrawingCreate: createDrawing,
    onProjectCreate: createProject,
    onProjectUpdate: updateProject,
    onProjectDelete: deleteProject,
    onProjectRestore: restoreProject,
    onFileUpdate: updateFile,
    onNoteUpdate: updateNote,
    onDrawingUpdate: updateDrawing,
    onFileDelete: deleteFile,
    onNoteDelete: deleteNote,
    onDrawingDelete: deleteDrawing,
    onFileRestore: restoreFile,
    onNoteRestore: restoreNote,
    onDrawingRestore: restoreDrawing,
    onFilePermanentDelete: deleteFilePermanent,
    onNotePermanentDelete: deleteNotePermanent,
    onDrawingPermanentDelete: deleteDrawingPermanent,
    onProjectPermanentDelete: deleteProjectPermanent,
    onLogout: handleLogout,
    saveStatus,
    onMoveFileToProject: moveFileToProject,
    onMoveNoteToProject: moveNoteToProject,
    onMoveDrawingToProject: moveDrawingToProject,
  };

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar {...sidebarProps} />
      </div>

      <div className="flex-1 relative flex overflow-hidden">
        <main className="flex-1 relative flex flex-col overflow-hidden">
          {/* Header */}
          <header className="flex items-center justify-between px-4 lg:pl-16 h-14 border-b border-border bg-background/80 backdrop-blur-md z-20">
            <div className="flex items-center gap-2">
              <Sheet>
                <SheetTrigger
                  render={
                    <Button variant="ghost" size="icon" className="md:hidden">
                      <Menu className="w-5 h-5" />
                    </Button>
                  }
                />
                <SheetContent side="left" className="p-0 w-80 border-r-border/50">
                  <Sidebar {...sidebarProps} />
                </SheetContent>
              </Sheet>
              <div className="flex items-center gap-2">
                {view === 'erd' && <Database className="w-5 h-5 text-primary" />}
                {view === 'notes' && <StickyNote className="w-5 h-5 text-primary" />}
                {view === 'drawings' && <PenTool className="w-5 h-5 text-primary" />}
                <span className="font-bold text-sm tracking-tight">
                  {view === 'erd' ? (files.find(f => f.id === activeFileId)?.name || 'ERD Pro') : view === 'notes' ? activeNote?.title : view === 'drawings' ? activeDrawing?.title : 'ERD Pro'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saveStatus === 'saving' && <span className="text-[10px] text-muted-foreground animate-pulse">Saving...</span>}
              {saveStatus === 'saved' && <span className="text-[10px] text-primary">Saved</span>}
            </div>
          </header>

          {view === 'erd' && activeFileId && (
            <div className="flex-1 relative flex flex-col overflow-hidden">
              {/* Toolbar - Positioned relative to the ERD workspace container */}
              <div className="absolute top-6 inset-x-0 z-10 flex justify-center pointer-events-none">
                <div className="flex items-center gap-2 p-1.5 bg-background/80 backdrop-blur-md border border-border/50 rounded-2xl shadow-2xl pointer-events-auto">
                  <Button 
                    onClick={addEntity}
                    size="sm"
                    className="h-9 px-4 font-bold shadow-lg shadow-primary/20"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Add Table</span>
                    <span className="sm:hidden">Table</span>
                  </Button>
                
                  <div className="w-px h-6 bg-border mx-1" />
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="sm" className="h-9 px-4 font-bold text-muted-foreground hover:text-foreground">
                          <Download className="w-4 h-4 mr-2" />
                          Export
                          <ChevronDown className="w-3 h-3 ml-1 transition-transform" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-48 p-1">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 py-1.5">SQL Format</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleExportSQL('postgresql')}
                          className="flex items-center gap-3 px-3 py-2 text-xs font-semibold"
                        >
                          <Database size={14} className="text-blue-400" />
                          To PostgreSQL
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleExportSQL('mysql')}
                          className="flex items-center gap-3 px-3 py-2 text-xs font-semibold"
                        >
                          <Database size={14} className="text-orange-400" />
                          To MySQL
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Canvas */}
              <div className="flex-1">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  nodeTypes={nodeTypes}
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  onPaneClick={() => setSelectedNodeId(null)}
                  onMove={(_, viewport) => {
                    viewportRef.current = viewport;
                  }}
                  onMoveEnd={(_, viewport) => {
                    viewportRef.current = viewport;
                    if (activeFileId && isAuthenticated && view === 'erd') {
                      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
                      saveTimeoutRef.current = setTimeout(saveDiagram, 1000);
                    }
                  }}
                  colorMode="dark"
                >
                  <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
                  <Controls position="bottom-right" showInteractive={false} />
                </ReactFlow>
              </div>
            </div>
          )}

          {view === 'notes' && activeNote && (
            <NotesEditor 
              note={activeNote} 
              onSave={saveNote} 
              onChange={handleNoteChange}
              onDelete={deleteNote} 
            />
          )}

          {view === 'drawings' && activeDrawing && (
            <ExcalidrawEditor
              key={activeDrawingId}
              drawing={activeDrawing}
              onSave={saveDrawing}
              onChange={handleDrawingChange}
              onDelete={deleteDrawing}
            />
          )}

          {view === 'trash' && (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <Trash size={48} className="mb-4 opacity-20" />
              <h2 className="text-xl font-bold mb-2">Trash Bin</h2>
              <p className="text-sm">Select an item from the sidebar to restore it.</p>
            </div>
          )}

          {!activeFileId && !activeNoteId && !activeDrawingId && view !== 'trash' && (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
              <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center mb-6">
                <Database size={40} className="opacity-20" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Welcome to ERD Builder Pro</h2>
              <p className="max-w-md text-sm leading-relaxed">
                Select a project or file from the sidebar to start designing your database schema, taking notes, or sketching ideas.
              </p>
            </div>
          )}

          {/* The toolbar has been moved inside the ERD view container */}
        </main>

        {/* Properties Panel - Modal */}
        <Dialog open={!!selectedNodeId} onOpenChange={(open) => !open && setSelectedNodeId(null)}>
          <DialogContent showCloseButton={false} className="p-0 sm:max-w-md max-h-[90vh] overflow-hidden flex flex-col border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl">
            <PropertiesPanel 
              selectedEntity={selectedEntity} 
              onUpdateEntity={updateEntity}
              onDeleteEntity={deleteEntity}
              onClose={() => setSelectedNodeId(null)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
