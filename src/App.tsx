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
  applyNodeChanges,
  applyEdgeChanges,
  OnNodesChange,
  OnEdgesChange,
  OnConnect
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, MousePointer2, Share2, Download, Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { Toaster, toast } from 'sonner';

import Sidebar from './components/Sidebar';
import PropertiesPanel from './components/PropertiesPanel';
import EntityNode from './components/EntityNode';
import { FileData, Entity, Relationship, Column } from './types';
import { cn } from './lib/utils';

const nodeTypes = {
  entity: EntityNode,
};

const initialNodes: Node<Entity>[] = [];
const initialEdges: Edge[] = [];

export default function App() {
  const [files, setFiles] = useState<FileData[]>([]);
  const [activeFileId, setActiveFileId] = useState<number | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<Entity>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch Files
  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      setFiles(data);
      if (data.length > 0 && !activeFileId) {
        handleFileSelect(data[0].id);
      }
    } catch (err) {
      toast.error('Failed to load files');
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  // Load File Data
  const handleFileSelect = async (id: number) => {
    try {
      const res = await fetch(`/api/files/${id}`);
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
    if (!activeFileId) return;
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
      await fetch(`/api/save/${activeFileId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entities, relationships }),
      });
    } catch (err) {
      toast.error('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  }, [activeFileId, nodes, edges]);

  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (activeFileId) {
      saveTimeoutRef.current = setTimeout(saveDiagram, 1000);
    }
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [nodes, edges, saveDiagram, activeFileId]);

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
      await fetch(`/api/files/${id}`, { method: 'DELETE' });
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
