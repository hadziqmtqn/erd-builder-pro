import { useState, useCallback, useRef } from 'react';
import { 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  Node, 
  Edge, 
  OnConnect, 
  Viewport, 
  useReactFlow 
} from '@xyflow/react';
import { toast } from 'sonner';
import { Entity, FileData, DraftType } from '../types';
import { localPersistence } from '../lib/localPersistence';

export function useERDSession(
  isPublicView: boolean,
  isGuest: boolean,
  isAuthenticated: boolean,
  setView: (view: any) => void
) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<Entity>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const { setViewport } = useReactFlow();

  const handleFileSelect = async (id: number | string, setActiveFileId: (id: any) => void) => {
    try {
      const draft = await localPersistence.getDraft(DraftType.ERD, id);
      let data: FileData;

      if (isGuest) {
        const localData = await localPersistence.getResource(id);
        if (!localData) return;
        data = localData;
      } else {
        const res = await fetch(`/api/files/${id}`);
        if (res.status === 401) return;
        data = await res.json();
      }
      
      if (data.is_deleted) return;

      setActiveFileId(id);
      setView('erd');

      let finalData = data;
      if (draft && draft.sync_pending) {
        try {
          const parsedDraft = JSON.parse(draft.data);
          finalData = { 
            ...data, 
            entities: parsedDraft.nodes.map((n: any) => ({ ...n.data, x: n.position.x, y: n.position.y })), 
            relationships: parsedDraft.edges.map((e: any) => ({
              id: e.id,
              source_entity_id: e.source,
              target_entity_id: e.target,
              source_column_id: e.sourceHandle ? e.sourceHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') : undefined,
              target_column_id: e.targetHandle ? e.targetHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') : undefined,
              source_handle: e.sourceHandle || undefined,
              target_handle: e.target_handle || undefined,
              label: e.label
            })), 
            viewport_x: parsedDraft.viewport.x, 
            viewport_y: parsedDraft.viewport.y, 
            viewport_zoom: parsedDraft.viewport.zoom 
          };
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

        if (!sHandle && sourceEntity && targetEntity) {
          const sx = Number(sourceEntity.x);
          const tx = Number(targetEntity.x);
          sHandle = sx < tx ? `col-${r.source_column_id}-source` : `col-${r.source_column_id}-source-l`;
        }

        if (!tHandle && sourceEntity && targetEntity) {
          const sx = Number(sourceEntity.x);
          const tx = Number(targetEntity.x);
          tHandle = sx < tx ? `col-${r.target_column_id}-target` : `col-${r.target_column_id}-target-r`;
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

      if (finalData.viewport_x !== undefined && finalData.viewport_y !== undefined && finalData.viewport_zoom) {
        setViewport({ x: finalData.viewport_x, y: finalData.viewport_y, zoom: finalData.viewport_zoom }, { duration: 800 });
        viewportRef.current = { x: finalData.viewport_x, y: finalData.viewport_y, zoom: finalData.viewport_zoom };
      } else {
        setTimeout(() => setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 800 }), 100);
      }
    } catch (err) {}
  };

  const onConnect: OnConnect = useCallback((params) => {
    if (isPublicView) return;

    const sourceNode = nodes.find(n => n.id === params.source);
    const targetNode = nodes.find(n => n.id === params.target);
    
    if (sourceNode && targetNode && params.sourceHandle && params.targetHandle) {
      const sourceColId = params.sourceHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
      const targetColId = params.targetHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
      
      const sourceCol = sourceNode.data.columns.find((c: any) => c.id === sourceColId);
      const targetCol = targetNode.data.columns.find((c: any) => c.id === targetColId);
      
      if (sourceCol && targetCol && sourceCol.type !== targetCol.type) {
        toast.error(`Type Mismatch`, {
          description: `Cannot connect ${sourceCol.type} to ${targetCol.type}. Relationships must have matching data types.`,
          duration: 4000
        });
        return;
      }
    }

    setEdges((eds) => addEdge({ ...params, animated: true, type: 'smoothstep', label: '1:N' }, eds));
  }, [setEdges, isPublicView, nodes]);

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
  }, [setNodes, setEdges]);

  const handleEdgeUpdate = (edgeId: string, label: string) => {
    setEdges((eds) => eds.map((edge) => edge.id === edgeId ? { ...edge, label } : edge));
  };

  const deleteEdge = (id: string) => {
    setEdges((eds) => eds.filter((edge) => edge.id !== id));
    setSelectedEdgeId(null);
  };

  return {
    nodes, setNodes, onNodesChange,
    edges, setEdges, onEdgesChange,
    selectedNodeId, setSelectedNodeId,
    selectedEdgeId, setSelectedEdgeId,
    onConnect,
    addEntity,
    updateEntity,
    deleteEntity,
    handleEdgeUpdate,
    deleteEdge,
    handleFileSelect,
    viewportRef
  };
}
