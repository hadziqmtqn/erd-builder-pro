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
  OnConnect
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, MousePointer2, Share2, Download, Database, Lock, User, Mail, Trash } from 'lucide-react';
import Sidebar from './components/Sidebar';
import PropertiesPanel from './components/PropertiesPanel';
import EntityNode from './components/EntityNode';
import NotesEditor from './components/NotesEditor';
import ExcalidrawEditor from './components/ExcalidrawEditor';
import { FileData, Entity, Relationship, Project, Note, Drawing } from './types';
import { cn } from './lib/utils';
import { PenTool } from 'lucide-react';

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
      } else {
        const data = await res.json();
      }
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md glass-panel rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-accent-primary flex items-center justify-center mb-4 shadow-xl shadow-accent-primary/20">
            <Database className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">ERD Builder Pro</h1>
          <p className="text-text-secondary text-sm">Please sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-secondary ml-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={adminEmail}
                className="w-full bg-bg-tertiary border border-border rounded-2xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/50 transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-secondary ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-bg-tertiary border border-border rounded-2xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/50 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent-primary hover:bg-accent-secondary disabled:opacity-50 text-white font-bold py-4 rounded-2xl shadow-lg shadow-accent-primary/20 transition-all active:scale-[0.98]"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Removed hints for production feel */}
      </div>
    </div>
  );
}

// Main App Component
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [view, setView] = useState<'erd' | 'notes' | 'drawings' | 'trash'>('erd');
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
      const data = await res.json();
      setFiles(data);
    } catch (err) {
    }
  };

  // Fetch Notes
  const fetchNotes = async () => {
    try {
      const res = await fetch('/api/notes');
      const data = await res.json();
      setNotesList(data);
    } catch (err) {
    }
  };

  // Fetch Drawings
  const fetchDrawings = async () => {
    try {
      const res = await fetch('/api/drawings');
      const data = await res.json();
      setDrawings(data);
    } catch (err) {
    }
  };

  // Fetch Projects
  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data);
    } catch (err) {
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

      const flowEdges: Edge[] = data.relationships.map(r => ({
        id: r.id,
        source: r.source_entity_id,
        target: r.target_entity_id,
        label: r.label,
        type: 'smoothstep',
        animated: true,
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);
      setSelectedNodeId(null);
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
      type: 'one-to-many',
      label: e.label as string,
    }));

    try {
      const res = await fetch(`/api/save/${activeFileId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entities, relationships }),
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
      <div className="h-screen w-screen bg-bg-primary flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={() => checkAuth()} />;
  }

  const selectedEntity = nodes.find(n => n.id === selectedNodeId)?.data as Entity || null;
  const activeNote = notes.find(n => n.id === activeNoteId);
  const activeDrawing = drawings.find(d => d.id === activeDrawingId);

  return (
    <div className="flex h-screen w-screen bg-bg-primary overflow-hidden">
      <Sidebar 
        files={files}
        notes={notes}
        drawings={drawings}
        projects={projects}
        trashData={trashData}
        activeFileId={activeFileId}
        activeNoteId={activeNoteId}
        activeDrawingId={activeDrawingId}
        activeProjectId={activeProjectId}
        view={view}
        onViewChange={setView}
        onFileSelect={handleFileSelect}
        onNoteSelect={handleNoteSelect}
        onDrawingSelect={handleDrawingSelect}
        onProjectSelect={setActiveProjectId}
        onFileCreate={createFile}
        onNoteCreate={createNote}
        onDrawingCreate={createDrawing}
        onProjectCreate={createProject}
        onProjectUpdate={updateProject}
        onProjectDelete={deleteProject}
        onProjectRestore={restoreProject}
        onFileUpdate={updateFile}
        onNoteUpdate={updateNote}
        onDrawingUpdate={updateDrawing}
        onFileDelete={deleteFile}
        onNoteDelete={deleteNote}
        onDrawingDelete={deleteDrawing}
        onFileRestore={restoreFile}
        onNoteRestore={restoreNote}
        onDrawingRestore={restoreDrawing}
        onFilePermanentDelete={deleteFilePermanent}
        onNotePermanentDelete={deleteNotePermanent}
        onDrawingPermanentDelete={deleteDrawingPermanent}
        onProjectPermanentDelete={deleteProjectPermanent}
        onLogout={handleLogout}
        saveStatus={saveStatus}
        onMoveFileToProject={moveFileToProject}
        onMoveNoteToProject={moveNoteToProject}
        onMoveDrawingToProject={moveDrawingToProject}
      />

      <main className="flex-1 relative flex flex-col overflow-hidden">
        {view === 'erd' && activeFileId && (
          <>
            {/* Toolbar */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 p-1.5 glass-panel rounded-2xl shadow-2xl">
              <button 
                onClick={addEntity}
                className="flex items-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-secondary text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-accent-primary/20"
              >
                <Plus className="w-4 h-4" />
                Add Table
              </button>
              <div className="w-px h-6 bg-border mx-1" />
              <button className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-xl transition-all">
                <MousePointer2 className="w-4 h-4" />
              </button>
              <button className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-xl transition-all">
                <Share2 className="w-4 h-4" />
              </button>
              <button className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-xl transition-all">
                <Download className="w-4 h-4" />
              </button>
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
                fitView
                colorMode="dark"
              >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#2d2d3d" />
                <Controls position="bottom-right" showInteractive={false} />
              </ReactFlow>
            </div>
          </>
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
          <div className="flex-1 flex flex-col items-center justify-center text-text-secondary">
            <Trash size={48} className="mb-4 opacity-20" />
            <h2 className="text-xl font-bold mb-2">Trash Bin</h2>
            <p className="text-sm">Select an item from the sidebar to restore it.</p>
          </div>
        )}

        {((view === 'erd' && !activeFileId) || (view === 'notes' && !activeNoteId) || (view === 'drawings' && !activeDrawingId)) && (
          <div className="flex-1 flex flex-col items-center justify-center text-text-secondary">
            <Database size={48} className="mb-4 opacity-20" />
            <h2 className="text-xl font-bold mb-2">Select or Create a {view === 'erd' ? 'Diagram' : view === 'notes' ? 'Note' : 'Drawing'}</h2>
            <p className="text-sm">Use the sidebar to manage your projects and files.</p>
          </div>
        )}
      </main>

      {view === 'erd' && (
        <PropertiesPanel 
          selectedEntity={selectedEntity}
          onUpdateEntity={updateEntity}
          onDeleteEntity={deleteEntity}
        />
      )}
    </div>
  );
}
