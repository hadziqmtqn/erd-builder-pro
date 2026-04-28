import { useState, useCallback, useRef, useEffect } from 'react';
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
import { Entity, Diagram, DraftType } from '../types';
import { localPersistence } from '../lib/localPersistence';
import { useUndoRedo } from './useUndoRedo';

export function useERDSession(
  isPublicView: boolean,
  isGuest: boolean,
  isAuthenticated: boolean,
  setView: (view: any) => void
) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<Entity>>([]);
  const [isItemLoading, setIsItemLoading] = useState(false);
  const [saveCounter, setSaveCounter] = useState(0);
  
  // Ref for previous edges to avoid redundant node updates
  const lastEdgesHash = useRef<string>("");

  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const { setViewport } = useReactFlow();

  // Watch for nodes/edges changes to increment save counter
  useEffect(() => {
    setSaveCounter(prev => prev + 1);
  }, [nodes, edges]);
  
  // Undo/Redo Hook
  const { takeSnapshot, undo, redo, canUndo, canRedo, clearHistory } = useUndoRedo();

  const handleUndo = useCallback(() => {
    const prev = undo(nodes, edges);
    if (prev) {
      setNodes(prev.nodes);
      setEdges(prev.edges);
    }
  }, [undo, nodes, edges, setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    const next = redo(nodes, edges);
    if (next) {
      setNodes(next.nodes);
      setEdges(next.edges);
    }
  }, [redo, nodes, edges, setNodes, setEdges]);

  const handleDiagramSelect = async (id: number | string, setActiveDiagramId: (id: any) => void, options?: { silent?: boolean }) => {
    if (!options?.silent) setIsItemLoading(true);
    try {
      const draft = await localPersistence.getDraft(DraftType.ERD, id);
      let data: Diagram;

      if (isGuest) {
        const localData = await localPersistence.getResource(id);
        if (!localData) return;
        data = localData;
      } else {
        const res = await fetch(`/api/diagrams/${id}`);
        if (res.status === 401) return;
        data = await res.json();
      }
      
      if (data.is_deleted) return;

      setActiveDiagramId(id);
      setView('erd');
      clearHistory();

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
              target_handle: e.targetHandle || undefined,
              label: e.label
            })), 
            viewport_x: parsedDraft.viewport.x, 
            viewport_y: parsedDraft.viewport.y, 
            viewport_zoom: parsedDraft.viewport.zoom 
          };
          // Only show toast if not a silent reload
          // @ts-ignore - options might be passed from App.tsx
          if (!window.currentSyncIsSilent) {
            toast.info("Loaded unsynced local draft", { duration: 2000 });
          }
        } catch (e) {}
      }

      const flowNodes: Node<Entity>[] = finalData.entities.map(e => {
        return {
          id: e.id,
          type: 'entity',
          position: { x: e.x, y: e.y },
          data: e,
        };
      });

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
          animated: false,
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
    } catch (err) {} finally {
      setIsItemLoading(false);
    }
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

    takeSnapshot(nodes, edges);
    setEdges((eds) => addEdge({ ...params, animated: false, type: 'smoothstep', label: '1:N' }, eds));
  }, [setEdges, isPublicView, nodes, takeSnapshot, edges]);

  const getUniqueName = (baseName: string, currentNodes: Node<Entity>[]) => {
    let name = baseName;
    let counter = 1;
    while (currentNodes.some(n => n.data.name.toLowerCase() === name.toLowerCase())) {
      name = `${baseName}_${counter}`;
      counter++;
    }
    return name;
  };

  const addEntity = () => {
    const id = Math.random().toString(36).substr(2, 9);
    const uniqueName = getUniqueName('NewTable', nodes);

    // Calculate the center of the current viewport
    const { x, y, zoom } = viewportRef.current;
    
    // Convert screen center to flow coordinates
    // We adjust for the sidebar (approx 260px in the current layout)
    const centerX = -x / zoom + (window.innerWidth - 260) / (2 * zoom);
    const centerY = -y / zoom + window.innerHeight / (2 * zoom);
    
    const newEntity: Entity = {
      id,
      name: uniqueName,
      x: centerX - 100, // Center the table (approx 200px width)
      y: centerY - 50,
      color: '#6366f1',
      columns: [
        { id: Math.random().toString(36).substr(2, 9), name: 'id', type: 'INT', is_pk: true, is_nullable: false, sort_order: 0 }
      ],
    };
    const newNode: Node<Entity> = { id, type: 'entity', position: { x: newEntity.x, y: newEntity.y }, data: newEntity };
    takeSnapshot(nodes, edges);
    setNodes((nds) => nds.concat(newNode));
  };

  const updateEntity = useCallback((updatedEntity: Entity) => {
    // Check for duplicate name (excluding itself)
    const nameExists = nodes.some(n => 
      n.id !== updatedEntity.id && 
      n.data.name.toLowerCase() === updatedEntity.name.toLowerCase()
    );

    if (nameExists) {
      toast.error("Duplicate Table Name", {
        description: `A table with the name "${updatedEntity.name}" already exists.`,
      });
      return;
    }

    takeSnapshot(nodes, edges);
    setNodes((nds) => {
      const newNodes = nds.map((node) => node.id === updatedEntity.id ? { ...node, data: updatedEntity } : node);
      
      setEdges((eds) => {
        const invalidEdgeIds: string[] = [];
        
        eds.forEach(edge => {
          if (edge.source === updatedEntity.id || edge.target === updatedEntity.id) {
            const sourceNode = newNodes.find(n => n.id === edge.source);
            const targetNode = newNodes.find(n => n.id === edge.target);
            
            if (sourceNode && targetNode && edge.sourceHandle && edge.targetHandle) {
               const sourceColId = edge.sourceHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
               const targetColId = edge.targetHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
               
               const sourceCol = sourceNode.data.columns.find((c: any) => c.id === sourceColId);
               const targetCol = targetNode.data.columns.find((c: any) => c.id === targetColId);
               
               if (sourceCol && targetCol && sourceCol.type !== targetCol.type) {
                 invalidEdgeIds.push(edge.id);
               }
            }
          }
        });
        
        if (invalidEdgeIds.length > 0) {
          setTimeout(() => {
            toast.warning("Relations Removed", {
              description: "Some relations were automatically deleted because the column types no longer matched.",
              duration: 5000
            });
          }, 0);
          return eds.filter(e => !invalidEdgeIds.includes(e.id));
        }
        return [...eds];
      });
      
      return newNodes;
    });
  }, [setNodes, setEdges, takeSnapshot, nodes, edges]);

  const deleteEntity = useCallback((id: string) => {
    takeSnapshot(nodes, edges);
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedNodeId(null);
  }, [setNodes, setEdges, takeSnapshot, nodes, edges]);

  const handleEdgeUpdate = (edgeId: string, label: string) => {
    takeSnapshot(nodes, edges);
    setEdges((eds) => eds.map((edge) => edge.id === edgeId ? { ...edge, label } : edge));
  };

  const deleteEdge = (id: string) => {
    takeSnapshot(nodes, edges);
    setEdges((eds) => eds.filter((edge) => edge.id !== id));
    setSelectedEdgeId(null);
  };

  useEffect(() => {
    const edgeHash = JSON.stringify(edges.map(e => ({ s: e.source, sh: e.sourceHandle, t: e.target, th: e.targetHandle })));
    
    // Only update if edges actually changed their geometry/connection
    setEdges(eds => {
      let isChanged = false;
      const newEds = eds.map(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        if (!sourceNode || !targetNode) return edge;
        
        const sourceColId = edge.sourceHandle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
        const targetColId = edge.targetHandle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
        
        if (!sourceColId || !targetColId) return edge;

        const sx = sourceNode.position.x;
        const tx = targetNode.position.x;
        
        const newSourceHandle = sx < tx ? `col-${sourceColId}-source` : `col-${sourceColId}-source-l`;
        const newTargetHandle = sx < tx ? `col-${targetColId}-target` : `col-${targetColId}-target-r`;
        
        if (edge.sourceHandle !== newSourceHandle || edge.targetHandle !== newTargetHandle) {
          isChanged = true;
          return { ...edge, sourceHandle: newSourceHandle, targetHandle: newTargetHandle };
        }
        return edge;
      });
      
      return isChanged ? newEds : eds;
    });

    // Centralized FK Detection
    if (edgeHash !== lastEdgesHash.current) {
      lastEdgesHash.current = edgeHash;
      
      setNodes(nds => {
        const fkMap: Record<string, Set<string>> = {};
        edges.forEach(e => {
          if (!fkMap[e.source]) fkMap[e.source] = new Set();
          const colId = e.sourceHandle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
          if (colId) fkMap[e.source].add(colId);
        });

        let anyNodeDataChanged = false;
        const nextNodes = nds.map(node => {
          const nodeFks = fkMap[node.id] || new Set();
          const newColumns = node.data.columns.map(col => ({
            ...col,
            _is_fk: nodeFks.has(col.id)
          }));

          // Check if FK status actually changed for this node
          const hasChanged = JSON.stringify(newColumns) !== JSON.stringify(node.data.columns);
          if (hasChanged) {
            anyNodeDataChanged = true;
            return { ...node, data: { ...node.data, columns: newColumns } };
          }
          return node;
        });

        return anyNodeDataChanged ? nextNodes : nds;
      });
    }
  }, [nodes, edges, setNodes, setEdges]);

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
    handleDiagramSelect,
    viewportRef,
    undo: handleUndo,
    redo: handleRedo,
    canUndo,
    canRedo,
    takeSnapshot,
    isItemLoading,
    saveCounter
  };
}
