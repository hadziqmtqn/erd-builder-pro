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
import { Plus, MousePointer2, Share2, Download, Database, Lock, User, Mail } from 'lucide-react';
import { Toaster, toast } from 'sonner';

import Sidebar from './components/Sidebar';
import PropertiesPanel from './components/PropertiesPanel';
import EntityNode from './components/EntityNode';
import { FileData, Entity, Relationship } from './types';
import { cn } from './lib/utils';

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
        toast.success('Logged in successfully');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Invalid credentials');
      }
    } catch (err) {
      console.error('Login error:', err);
      toast.error('Network error - check server connection');
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
  const [files, setFiles] = useState<FileData[]>([]);
  const [activeFileId, setActiveFileId] = useState<number | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<Entity>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        setIsAuthenticated(true);
        fetchFiles();
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
      if (data.length > 0 && !activeFileId) {
        handleFileSelect(data[0].id);
      }
    } catch (err) {
      toast.error('Failed to load files');
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
      setActiveFileId(id);

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
      toast.error('Failed to load diagram');
    }
  };

  // Auto-save logic
  const saveDiagram = useCallback(async () => {
    if (!activeFileId || !isAuthenticated) return;
    setIsSaving(true);

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
      }
    } catch (err) {
      toast.error('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  }, [activeFileId, nodes, edges, isAuthenticated]);

  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (activeFileId && isAuthenticated) {
      saveTimeoutRef.current = setTimeout(saveDiagram, 1000);
    }
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [nodes, edges, saveDiagram, activeFileId, isAuthenticated]);

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

  const createFile = async (name: string) => {
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      const newFile = await res.json();
      setFiles([newFile, ...files]);
      handleFileSelect(newFile.id);
      toast.success('File created');
    } catch (err) {
      toast.error('Failed to create file');
    }
  };

  const deleteFile = async (id: number) => {
    if (!confirm('Are you sure you want to delete this diagram?')) return;
    try {
      const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      setFiles(files.filter(f => f.id !== id));
      if (activeFileId === id) {
        setActiveFileId(null);
        setNodes([]);
        setEdges([]);
      }
      toast.success('File deleted');
    } catch (err) {
      toast.error('Failed to delete file');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      setIsAuthenticated(false);
      setFiles([]);
      setActiveFileId(null);
      setNodes([]);
      setEdges([]);
      toast.success('Logged out');
    } catch (err) {
      toast.error('Logout failed');
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

  return (
    <div className="flex h-screen w-screen bg-bg-primary overflow-hidden">
      <Toaster position="top-right" theme="dark" />
      
      <Sidebar 
        files={files} 
        activeFileId={activeFileId}
        onFileSelect={handleFileSelect}
        onFileCreate={createFile}
        onFileDelete={deleteFile}
        onLogout={handleLogout}
        isSaving={isSaving}
      />

      <main className="flex-1 relative flex flex-col">
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
      </main>

      <PropertiesPanel 
        selectedEntity={selectedEntity}
        onUpdateEntity={updateEntity}
        onDeleteEntity={deleteEntity}
      />
    </div>
  );
}
