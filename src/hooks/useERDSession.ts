import { useState, useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '../lib/api';
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
import { useRealtimeSync } from './useRealtimeSync';

export function useERDSession(
  isPublicView: boolean,
  isGuest: boolean,
  isAuthenticated: boolean | null,
  setView: (view: any) => void,
  options?: {
    broadcastNodeMove?: (id: string, x: number, y: number) => void;
    broadcastNodeUpdate?: (id: string, data: Entity) => void;
    broadcastEdgesUpdate?: (edges: Edge[]) => void;
    onEditEntity?: (entityId: string) => void;
    onDeleteEntity?: (entityId: string) => void;
  }
) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<Entity>>([]);
  const [isItemLoading, setIsItemLoading] = useState(false);
  const [saveCounter, setSaveCounter] = useState(0);
  
  // Ref for previous edges to avoid redundant node updates
  const lastEdgesHash = useRef<string>("");

  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const { setViewport, fitView, getNodes, getEdges } = useReactFlow();

  // Wrapped onNodesChange to broadcast movement
  const onNodesChangeWrapped = useCallback((changes: any) => {
    onNodesChange(changes);
    
    // Broadcast movement
    changes.forEach((change: any) => {
      if (change.type === 'position' && change.position) {
        options?.broadcastNodeMove?.(change.id, change.position.x, change.position.y);
      }
    });
  }, [onNodesChange, options?.broadcastNodeMove]);

  // Wrapped onEdgesChange
  const onEdgesChangeWrapped = useCallback((changes: any) => {
    onEdgesChange(changes);
    // Broadcast edges update after change
    setTimeout(() => {
      options?.broadcastEdgesUpdate?.(edges);
    }, 0);
  }, [onEdgesChange, options?.broadcastEdgesUpdate, edges]);
  
  // Undo/Redo Hook
  const { takeSnapshot: rawTakeSnapshot, undo, redo, canUndo, canRedo, clearHistory } = useUndoRedo();

  // Wrapped takeSnapshot that also marks data as dirty for auto-save
  const takeSnapshot = useCallback((n: Node<Entity>[], e: Edge[]) => {
    rawTakeSnapshot(n, e);
    setSaveCounter(prev => prev + 1);
  }, [rawTakeSnapshot]);

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

  const isInitializingRef = useRef(false);

  const isGuestRef = useRef(isGuest);
  useEffect(() => { isGuestRef.current = isGuest; }, [isGuest]);
  const isGuestCheck = (): boolean =>
    isGuestRef.current || sessionStorage.getItem('auth_mode') === 'guest';

  const loadingIdRef = useRef<string | number | null>(null);

  const handleDiagramSelect = useCallback(async (id: number | string, setActiveDiagramId: (id: any) => void, options?: { silent?: boolean, isStale?: () => boolean }) => {
    // Prevent duplicate concurrent loads for the same ID
    if (loadingIdRef.current === id) return;
    loadingIdRef.current = id;

    if (!options?.silent) {
      setIsItemLoading(true);
      isInitializingRef.current = true;
      // Update active ID immediately to satisfy routing checks and prevent duplicate triggers from parent
      setActiveDiagramId(id);
      // Clear current view to avoid showing stale data from previous diagram
      setNodes([]);
      setEdges([]);
    }
    try {
      const draft = await localPersistence.getDraft(DraftType.ERD, id);
      let data: Diagram;

      if (isGuestCheck()) {
        let localData = await localPersistence.getResource(id);
        // id bisa berupa uid (UUID) karena sidebar pass `item.uid ?? item.id`.
        // IndexedDB store menggunakan `id` sebagai keyPath, jadi fallback cari by uid.
        if (!localData) {
          const allDiagrams = await localPersistence.getAllResources('erd');
          localData = allDiagrams.find((d: any) => d.uid === id) || null;
        }
        if (!localData) {
          setIsItemLoading(false);
          loadingIdRef.current = null;
          return;
        }
        data = localData;
      } else {
        const res = await apiFetch(`/api/diagrams/${id}`);
        if (!res.ok) {
          const errText = await res.text();
          console.error(`Failed to fetch diagram ${id}:`, res.status, errText);
          toast.error("Failed to load diagram details");
          setIsItemLoading(false);
          loadingIdRef.current = null;
          return;
        }
        data = await res.json();
      }
      
      if (!data || data.is_deleted) {
        setIsItemLoading(false);
        return;
      }

      // Ensure entities and relationships are at least empty arrays
      if (!data.entities) data.entities = [];
      if (!data.relationships) data.relationships = [];

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
          if (!(window as any).currentSyncIsSilent) {
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
          const sx = Number(sourceEntity.x) || 0;
          const tx = Number(targetEntity.x) || 0;
          sHandle = sx < tx ? `col-${r.source_column_id}-source` : `col-${r.source_column_id}-source-l`;
        }

        if (!tHandle && sourceEntity && targetEntity) {
          const sx = Number(sourceEntity.x) || 0;
          const tx = Number(targetEntity.x) || 0;
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

      // === STALE GUARD: If the user has navigated to a different diagram    ===
      // === while this fetch was in-flight, discard to prevent stale data    ===
      // === overwriting the correct diagram's canvas.                        ===
      if (options?.isStale && options.isStale()) return;

      // === UUID CORRECTION: After the diagram data is loaded, ensure        ===
      // === activeDiagramId uses the UUID (uid), not the numeric id that may ===
      // === have been passed from the URL (race condition on initial load).  ===
      if (finalData.uid && String(finalData.uid) !== String(id)) {
        setActiveDiagramId(finalData.uid);
      }

      // === PENDING DDL GUARD: When a pending DDL (from Create/Update ERD      ===
      // === from SQL) was applied by ERDView's effect while this fetch was    ===
      // === in-flight, don't overwrite the DDL-applied data with empty server ===
      // === data (the diagram was just created and has no entities yet).      ===
      setNodes(prev => prev.length > 0 ? prev : flowNodes);
      setEdges(prev => prev.length > 0 ? prev : flowEdges);
      setSelectedNodeId(null);

      // === Apply saved viewport BEFORE hiding loading overlay ===
      // This prevents a visible snap/flash from (0,0) to the correct position
      const vx = finalData.viewport_x;
      const vy = finalData.viewport_y;
      const vz = finalData.viewport_zoom;
      const hasSavedViewport = vx !== undefined && vy !== undefined && vz && (vx !== 0 || vy !== 0);
      if (hasSavedViewport) {
        setViewport({ x: vx, y: vy, zoom: vz }, { duration: 0 });
        viewportRef.current = { x: vx, y: vy, zoom: vz };
      }

      // Now hide loading — viewport is already in the correct position
      setIsItemLoading(false);

      if (!hasSavedViewport && flowNodes.length > 0) {
        // No saved viewport — fit view after React Flow has rendered nodes
        setTimeout(() => fitView({ padding: 0.2, duration: 0 }), 100);
      }
      if (!finalData.viewport_x && flowNodes.length === 0) {
        setTimeout(() => setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 0 }), 100);
      }

      // Allow auto-save only after everything is settled
      setTimeout(() => {
        isInitializingRef.current = false;
      }, 2000);
    } catch (err) {
      setIsItemLoading(false);
    } finally {
      loadingIdRef.current = null;
    }
  }, [clearHistory, setNodes, setEdges, setSelectedNodeId, setViewport]);

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
    const newEdges = addEdge({ ...params, animated: false, type: 'smoothstep', label: '1:N' }, edges);
    setEdges(newEdges);
    options?.broadcastEdgesUpdate?.(newEdges);
  }, [setEdges, isPublicView, nodes, takeSnapshot, edges, options?.broadcastEdgesUpdate]);

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
    const id = Math.random().toString(36).substring(2, 11);
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
        { id: Math.random().toString(36).substring(2, 11), name: 'id', type: 'INT', is_pk: true, is_nullable: false, sort_order: 0 }
      ],
    };
    const newNode: Node<Entity> = { id, type: 'entity', position: { x: newEntity.x, y: newEntity.y }, data: newEntity };
    takeSnapshot(nodes, edges);
    setNodes((nds) => {
      const next = nds.concat(newNode);
      options?.broadcastNodeUpdate?.(newNode.id, newNode.data);
      return next;
    });
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
      const newNodes = nds.map((node) => {
        if (node.id === updatedEntity.id) {
          options?.broadcastNodeUpdate?.(node.id, updatedEntity);
          return { ...node, data: updatedEntity };
        }
        return node;
      });
      
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
          const nextEdges = eds.filter(e => !invalidEdgeIds.includes(e.id));
          options?.broadcastEdgesUpdate?.(nextEdges);
          return nextEdges;
        }
        return [...eds];
      });
      
      return newNodes;
    });
  }, [setNodes, setEdges, takeSnapshot, nodes, edges, options?.broadcastNodeUpdate, options?.broadcastEdgesUpdate]);

  const deleteEntity = useCallback((id: string) => {
    takeSnapshot(nodes, edges);
    setNodes((nds) => nds.filter((node) => node.id !== id));
    const nextEdges = edges.filter((edge) => edge.source !== id && edge.target !== id);
    setEdges(nextEdges);
    options?.broadcastEdgesUpdate?.(nextEdges);
    setSelectedNodeId(null);
    options?.onDeleteEntity?.(id);
  }, [setNodes, setEdges, takeSnapshot, nodes, edges, options?.broadcastEdgesUpdate, options?.onDeleteEntity]);

  const handleEdgeUpdate = (edgeId: string, label: string) => {
    takeSnapshot(nodes, edges);
    const nextEdges = edges.map((edge) => edge.id === edgeId ? { ...edge, label } : edge);
    setEdges(nextEdges);
    options?.broadcastEdgesUpdate?.(nextEdges);
  };

  const deleteEdge = (id: string) => {
    takeSnapshot(nodes, edges);
    const nextEdges = edges.filter((edge) => edge.id !== id);
    setEdges(nextEdges);
    options?.broadcastEdgesUpdate?.(nextEdges);
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

        const sourceCol = sourceNode.data.columns.find((c: any) => c.id === sourceColId);
        const targetCol = targetNode.data.columns.find((c: any) => c.id === targetColId);

        // Step 1: Fix direction — arrow should point TO the PK column.
        // If source column is PK and target is NOT PK, edge direction is reversed.
        if (sourceCol && targetCol && sourceCol.is_pk && !targetCol.is_pk) {
          isChanged = true;
          return {
            ...edge,
            source: edge.target,
            target: edge.source,
            sourceHandle: `col-${targetColId}-source`,
            targetHandle: `col-${sourceColId}-target`,
          };
        }
        
        // Step 2: Smart positioning — choose the nearest handle based on node positions.
        // For edge paths to look clean, the handle on the SIDE FACING the other node is used.
        const sx = sourceNode.position.x || 0;
        const tx = targetNode.position.x || 0;
        const smartSourceHandle = sx < tx ? `col-${sourceColId}-source` : `col-${sourceColId}-source-l`;
        const smartTargetHandle = sx < tx ? `col-${targetColId}-target` : `col-${targetColId}-target-r`;
        
        if (edge.sourceHandle !== smartSourceHandle || edge.targetHandle !== smartTargetHandle) {
          isChanged = true;
          return { ...edge, sourceHandle: smartSourceHandle, targetHandle: smartTargetHandle };
        }
        
        return edge;
      });
      
      return isChanged ? newEds : eds;
    });

    // Centralized FK Detection (optimized — avoids JSON.stringify)
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
          let nodeChanged = false;
          const newColumns = node.data.columns.map(col => {
            const isFk = nodeFks.has(col.id);
            if (col._is_fk !== isFk) nodeChanged = true;
            return { ...col, _is_fk: isFk };
          });

          if (nodeChanged) {
            anyNodeDataChanged = true;
            return { ...node, data: { ...node.data, columns: newColumns } };
          }
          return node;
        });

        return anyNodeDataChanged ? nextNodes : nds;
      });
    }
  }, [nodes, edges, setNodes, setEdges]);

  // Auto-reposition edge handles when a node finishes dragging
  const onNodeDragStop = useCallback(() => {
    const currentNodes = getNodes();
    const currentEdges = getEdges();
    
    setEdges(eds => {
      let isChanged = false;
      const newEds = eds.map(edge => {
        const sourceNode = currentNodes.find(n => n.id === edge.source);
        const targetNode = currentNodes.find(n => n.id === edge.target);
        if (!sourceNode || !targetNode) return edge;

        const sourceColId = edge.sourceHandle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
        const targetColId = edge.targetHandle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
        if (!sourceColId || !targetColId) return edge;

        const sx = sourceNode.position.x || 0;
        const tx = targetNode.position.x || 0;
        const smartSourceHandle = sx < tx ? `col-${sourceColId}-source` : `col-${sourceColId}-source-l`;
        const smartTargetHandle = sx < tx ? `col-${targetColId}-target` : `col-${targetColId}-target-r`;

        if (edge.sourceHandle !== smartSourceHandle || edge.targetHandle !== smartTargetHandle) {
          isChanged = true;
          return { ...edge, sourceHandle: smartSourceHandle, targetHandle: smartTargetHandle };
        }
        return edge;
      });
      return isChanged ? newEds : eds;
    });
    
    takeSnapshot(currentNodes as Node<Entity>[], currentEdges);
  }, [setEdges, takeSnapshot, getNodes, getEdges]);

  const handleMoveEnd = useCallback((_: any, v: Viewport) => {
    // Only trigger save if user is not a public visitor AND not initializing
    if (!isPublicView && !isInitializingRef.current) {
      // Avoid saving if viewport hasn't significantly changed (prevents accidental saves on click)
      const prev = viewportRef.current;
      const hasChanged = 
        Math.abs((prev.x || 0) - v.x) > 0.5 || 
        Math.abs((prev.y || 0) - v.y) > 0.5 || 
        Math.abs((prev.zoom || 1) - v.zoom) > 0.001;

      if (hasChanged) {
        viewportRef.current = v;
        setSaveCounter(prevCounter => prevCounter + 1);
      }
    }
  }, [isPublicView]);

  // ── ERD Keyboard Shortcuts (undo/redo) ──
  // Extracted from App.tsx global keydown handler — only active in erd view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          if (canRedo) handleRedo();
        } else {
          if (canUndo) handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        if (canRedo) handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleUndo, handleRedo, canUndo, canRedo]);

  // ── ERD Custom Event Listeners (editEntity / deleteEntity) ──
  // Dispatched from EntityNode.tsx dropdown menu actions
  // Extracted from App.tsx to keep ERD concerns co-located
  useEffect(() => {
    const onEditEntity = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSelectedNodeId(detail);
      options?.onEditEntity?.(detail);
    };
    const onDeleteEntity = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      deleteEntity(detail);
    };
    window.addEventListener('editEntity', onEditEntity);
    window.addEventListener('deleteEntity', onDeleteEntity);
    return () => {
      window.removeEventListener('editEntity', onEditEntity);
      window.removeEventListener('deleteEntity', onDeleteEntity);
    };
  }, [setSelectedNodeId, deleteEntity, options?.onEditEntity]);

  return {
    nodes, setNodes, onNodesChange: onNodesChangeWrapped,
    edges, setEdges, onEdgesChange: onEdgesChangeWrapped,
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
    saveCounter,
    onNodeDragStop,
    onMoveEnd: handleMoveEnd
  };
}
