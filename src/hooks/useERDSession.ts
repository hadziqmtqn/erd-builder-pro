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
import { Entity, Column, Diagram, DraftType, Relationship } from '../types';
import { localPersistence } from '../lib/localPersistence';
import { useUndoRedo } from './useUndoRedo';
import { buildErdIndexes, erdColumnKey, erdSourceColumnKey } from '../lib/erd-indexes';

/** Fix double "col-" prefix from buggy parseSQLToERD output.
 *  Works for any column ID format: "col-xxx", UUID, etc. */
function fixDoubleColPrefix(h: string | null | undefined): string | null | undefined {
  if (!h) return h;
  return h.replace(/^col-col-/, 'col-');
}

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

  const handleDiagramSelect = useCallback(async (id: number | string, setActiveDiagramId: (id: any) => void, options?: { silent?: boolean, isStale?: () => boolean }): Promise<any> => {
    // Prevent duplicate concurrent loads for the same ID
    if (loadingIdRef.current === id) return null;
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
          return null;
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
          return null;
        }
        data = await res.json();
      }
      
      if (!data || data.is_deleted) {
        setIsItemLoading(false);
        return null;
      }

      // Ensure entities and relationships are at least empty arrays
      if (!data.entities) data.entities = [];
      if (!data.relationships) data.relationships = [];

      setView('erd');
      clearHistory();

      let finalData = data;

      // Production DB diagram: fetch live schema + merge with saved positions
      // Detection: data.data exists and data.data._type === 'production_db_positions' and data.data.source exists
      const diagramData = (data as any).data;
      if (diagramData && diagramData._type === 'production_db_positions' && diagramData.source) {
        try {
          const source = diagramData.source;
          const schemaRes = await apiFetch('/api/diagrams/fetch-schema', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: source.type,
              host: source.host,
              port: source.port,
              user: source.user,
              password_encrypted: source.password_encrypted,
              database: source.database,
            }),
          });
          if (schemaRes.ok) {
            const schemaData = await schemaRes.json();
            const savedPositions = diagramData.nodes || {};

            // Convert fetched schema to entities with saved positions
            const liveEntities: Entity[] = (schemaData.schema || []).map((t: any) => {
              const saved = savedPositions[t.table_name] || {};
              return {
                id: t.table_name,
                name: t.table_name,
                x: saved.x ?? 0,
                y: saved.y ?? 0,
                color: saved.color ?? '#6b7280',
                columns: (t.columns || []).map((c: any) => ({
                  id: `${t.table_name}.${c.name}`,
                  name: c.name,
                  type: c.type,
                  is_pk: c.is_pk,
                  is_nullable: c.is_nullable,
                  _is_fk: (t.foreign_keys || []).some((fk: any) => fk.column === c.name),
                  sort_order: c.sort_order,
                })),
                collapsed: saved.collapsed ?? false,
                hidden_columns: saved.hidden_columns ?? [],
                note: saved.note ?? '',
              };
            });

            // Convert foreign keys to edges
            const liveEdges: Relationship[] = [];
            (schemaData.schema || []).forEach((t: any) => {
              (t.foreign_keys || []).forEach((fk: any) => {
                liveEdges.push({
                  id: crypto.randomUUID(),
                  source_entity_id: t.table_name,
                  target_entity_id: fk.ref_table,
                  source_column_id: `${t.table_name}.${fk.column}`,
                  target_column_id: `${fk.ref_table}.${fk.ref_column}`,
                  source_handle: `col-${t.table_name}.${fk.column}-source`,
                  target_handle: `col-${fk.ref_table}.${fk.ref_column}-target`,
                  label: '',
                  type: 'one-to-many',
                });
              });
            });

            finalData = {
              ...data,
              entities: liveEntities,
              relationships: liveEdges,
              viewport_x: diagramData.viewport?.x ?? data.viewport_x,
              viewport_y: diagramData.viewport?.y ?? data.viewport_y,
              viewport_zoom: diagramData.viewport?.zoom ?? data.viewport_zoom,
            };
          }
        } catch (err) {
          console.error('Failed to fetch live schema:', err);
          toast.error('Failed to load production DB schema');
        }
      }

      // Ensure entities and relationships are at least empty arrays
      if (!finalData.entities) finalData.entities = [];
      if (!finalData.relationships) finalData.relationships = [];

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
        
        // Always recalculate handles from positions — ignore stored suffix
        let sHandle = fixDoubleColPrefix(r.source_handle);
        let tHandle = fixDoubleColPrefix(r.target_handle);

        if (sourceEntity && targetEntity) {
          const sx = Number(sourceEntity.x) || 0;
          const tx = Number(targetEntity.x) || 0;
          // Strip col- prefix AND any stale -source/-target suffix from stored column IDs
          const colS = (r.source_column_id || '').replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
          const colT = (r.target_column_id || '').replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
          sHandle = colS ? (sx < tx ? `col-${colS}-source` : `col-${colS}-source-l`) : sHandle;
          tHandle = colT ? (sx < tx ? `col-${colT}-target` : `col-${colT}-target-r`) : tHandle;
        }

        const fallbackSrc = (r.source_column_id || '').replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
        const fallbackTgt = (r.target_column_id || '').replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');

        return {
          id: r.id,
          source: r.source_entity_id,
          target: r.target_entity_id,
          sourceHandle: sHandle || (fallbackSrc ? `col-${fallbackSrc}-source` : undefined),
          targetHandle: tHandle || (fallbackTgt ? `col-${fallbackTgt}-target` : undefined),
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

      return finalData;
    } catch (err) {
      setIsItemLoading(false);
    } finally {
      loadingIdRef.current = null;
    }
  }, [clearHistory, setNodes, setEdges, setSelectedNodeId, setViewport]);

  const extractColumnIdFromHandle = useCallback((handle?: string | null) => {
    if (!handle) return null;
    return handle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
  }, []);

  const getRelationKey = useCallback((edge: Edge) => {
    const sourceColId = extractColumnIdFromHandle(edge.sourceHandle);
    const targetColId = extractColumnIdFromHandle(edge.targetHandle);
    if (!sourceColId || !targetColId) return null;

    const endpointA = `${edge.source}:${sourceColId}`;
    const endpointB = `${edge.target}:${targetColId}`;
    return [endpointA, endpointB].sort().join('::');
  }, [extractColumnIdFromHandle]);

  const dedupeEdgesByRelation = useCallback((inputEdges: Edge[]) => {
    const seenKeys = new Set<string>();
    const rawEdges: Edge[] = [];
    let hasDuplicates = false;

    for (const edge of inputEdges) {
      const key = getRelationKey(edge);
      if (!key) {
        rawEdges.push(edge);
        continue;
      }

      if (seenKeys.has(key)) {
        hasDuplicates = true;
        continue;
      }

      seenKeys.add(key);
      rawEdges.push(edge);
    }

    return hasDuplicates ? rawEdges : inputEdges;
  }, [getRelationKey]);

  const onConnect: OnConnect = useCallback((params) => {
    if (isPublicView) return;

    const erdIndexes = buildErdIndexes(nodes, edges);
    const sourceNode = erdIndexes.nodesById.get(params.source);
    const targetNode = erdIndexes.nodesById.get(params.target);

    if (sourceNode && targetNode && params.sourceHandle && params.targetHandle) {
      const sourceColId = params.sourceHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
      const targetColId = params.targetHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');

      const sourceCol = erdIndexes.columnsByNodeAndId.get(erdColumnKey(sourceNode.id, sourceColId));
      const targetCol = erdIndexes.columnsByNodeAndId.get(erdColumnKey(targetNode.id, targetColId));

      if (sourceCol && targetCol && sourceCol.type !== targetCol.type) {
        toast.error(`Type Mismatch`, {
          description: `Cannot connect ${sourceCol.type} to ${targetCol.type}. Relationships must have matching data types.`,
          duration: 4000
        });
        return;
      }
    }

    const candidate = { ...params, animated: false, type: 'smoothstep', label: '1:N' } as Edge;
    const candidateKey = getRelationKey(candidate);
    if (candidateKey && sourceNode && targetNode) {
      // === EXACT DUPLICATE (same source col + same target col) ===
      // Block re-creating an identical relation. Use BOTH column ID and
      // column NAME to make the check robust against stale IDs.
      const cSrcId = extractColumnIdFromHandle(candidate.sourceHandle);
      const cTgtId = extractColumnIdFromHandle(candidate.targetHandle);
      const cSrcName = erdIndexes.columnsByNodeAndId.get(erdColumnKey(sourceNode.id, cSrcId || ''))?.name?.toLowerCase();
      const cTgtName = erdIndexes.columnsByNodeAndId.get(erdColumnKey(targetNode.id, cTgtId || ''))?.name?.toLowerCase();
      const cSrcNameKey = cSrcName ? `${candidate.source}:${cSrcName}` : null;
      const cTgtNameKey = cTgtName ? `${candidate.target}:${cTgtName}` : null;

      const duplicateById = !!candidateKey && erdIndexes.edgesByRelationKey.has(candidateKey);
      const duplicateByName = cSrcNameKey && cTgtNameKey
        ? erdIndexes.edgesByRelationName.has([cSrcNameKey, cTgtNameKey].sort().join('::'))
        : false;

      if (duplicateById || duplicateByName) {
        toast.info('Relation already exists');
        return;
      }

      // === STRICT FK RULE: 1 FK column = max 1 PK ===
      // Block polymorphic associations (one FK relating to two PKs).
      // Use column NAME (more reliable than ID) to identify the column.
      if (cSrcName) {
        const conflictingEdge = erdIndexes.edgesBySourceColumnName.get(
          erdSourceColumnKey(sourceNode.data.name, cSrcName),
        )?.[0];
        if (conflictingEdge) {
          const targetTable = erdIndexes.nodesById.get(conflictingEdge.target);
          toast.error('FK already related', {
            description: `This column is already related to ${targetTable?.data.name || 'another table'}. One FK column can only point to one PK.`,
            duration: 4000,
          });
          return;
        }
      }
    }

    takeSnapshot(nodes, edges);
    const newEdges = dedupeEdgesByRelation(addEdge(candidate, edges));
    setEdges(newEdges);
    options?.broadcastEdgesUpdate?.(newEdges);
  }, [setEdges, isPublicView, nodes, takeSnapshot, edges, options?.broadcastEdgesUpdate, dedupeEdgesByRelation, getRelationKey, extractColumnIdFromHandle]);

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
      color: '#6b7280',
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

  const duplicateEntity = useCallback((sourceId: string) => {
    const sourceNode = nodes.find(n => n.id === sourceId);
    if (!sourceNode) return;

    // Generate new entity ID
    const newId = Math.random().toString(36).substring(2, 11);
    // Get unique name (e.g., "users" -> "users_1" if "users" exists)
    const uniqueName = getUniqueName(sourceNode.data.name, nodes);

    // Deep clone columns with NEW column IDs so the duplicate is fully independent.
    // Reset _is_fk because the new entity has no outgoing edges.
    const clonedColumns: Column[] = sourceNode.data.columns.map((col) => ({
      id: Math.random().toString(36).substring(2, 11),
      name: col.name,
      type: col.type,
      is_pk: col.is_pk,
      is_nullable: col.is_nullable,
      enum_name: col.enum_name,
      enum_values: col.enum_values,
      sort_order: col.sort_order,
      _is_fk: false,
    }));

    // React Flow position is authoritative; data.x/y can lag behind after dragging.
    const duplicatePosition = {
      x: sourceNode.position.x + 36,
      y: sourceNode.position.y + 36,
    };
    const newEntity: Entity = {
      id: newId,
      name: uniqueName,
      x: duplicatePosition.x,
      y: duplicatePosition.y,
      color: sourceNode.data.color,
      columns: clonedColumns,
    };
    const newNode: Node<Entity> = {
      id: newId,
      type: 'entity',
      position: duplicatePosition,
      data: newEntity,
    };

    takeSnapshot(nodes, edges);
    setNodes((nds) => {
      const next = nds.concat(newNode);
      options?.broadcastNodeUpdate?.(newNode.id, newNode.data);
      return next;
    });
    setSelectedNodeId(newId);
    toast.success(`Duplicated as "${uniqueName}"`, {
      description: `${clonedColumns.length} column${clonedColumns.length === 1 ? '' : 's'} copied. Relationships were not duplicated.`,
    });
  }, [nodes, takeSnapshot, setNodes, setSelectedNodeId, options?.broadcastNodeUpdate]);

  const handleEdgeUpdate = (edgeId: string, label: string) => {
    takeSnapshot(nodes, edges);
    const nextEdges = edges.map((edge) => edge.id === edgeId ? { ...edge, label } : edge);
    setEdges(nextEdges);
    options?.broadcastEdgesUpdate?.(nextEdges);
  };

  const toggleEdgeSide = useCallback((handleId?: string | null) => {
    if (!handleId) return handleId;
    if (handleId.endsWith('-source')) return handleId.replace(/-source$/, '-source-l');
    if (handleId.endsWith('-source-l')) return handleId.replace(/-source-l$/, '-source');
    if (handleId.endsWith('-target')) return handleId.replace(/-target$/, '-target-r');
    if (handleId.endsWith('-target-r')) return handleId.replace(/-target-r$/, '-target');
    return handleId;
  }, []);

  const handleEdgeFlip = useCallback((edgeId: string) => {
    const edge = edges.find(e => e.id === edgeId);
    if (!edge) return;

    const nextEdges = edges.map((current) => {
      if (current.id !== edgeId) return current;
      return {
        ...current,
        sourceHandle: toggleEdgeSide(current.sourceHandle),
        targetHandle: toggleEdgeSide(current.targetHandle),
      };
    });

    takeSnapshot(nodes, edges);
    setEdges(nextEdges);
    options?.broadcastEdgesUpdate?.(nextEdges);
  }, [edges, nodes, setEdges, takeSnapshot, options?.broadcastEdgesUpdate, toggleEdgeSide]);

  const deleteEdge = (id: string) => {
    takeSnapshot(nodes, edges);
    const nextEdges = edges.filter((edge) => edge.id !== id);
    setEdges(nextEdges);
    options?.broadcastEdgesUpdate?.(nextEdges);
    setSelectedEdgeId(null);
  };

  const resolveEdgeHandles = useCallback((
    edge: Edge,
    sourceNode: Node<Entity>,
    targetNode: Node<Entity>,
  ): Edge => {
    const sourceColId = edge.sourceHandle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
    const targetColId = edge.targetHandle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');

    if (!sourceColId || !targetColId) return edge;

    const sourceCol = sourceNode.data.columns.find((c: any) => c.id === sourceColId);
    const targetCol = targetNode.data.columns.find((c: any) => c.id === targetColId);

    // Keep the semantic direction stable: arrows still point to the PK side.
    // When the user drags from PK → FK, flip the edge so FK → PK, AND
    // recompute the handle IDs with the correct `-source`/`-target` suffix
    // based on the (new) source/target X positions. Copying the old handles
    // verbatim leaves mismatched suffixes (e.g. `-target` on a source side),
    // which makes the edge invisible on the canvas even though it exists in state.
    if (sourceCol && targetCol && sourceCol.is_pk && !targetCol.is_pk) {
      const flippedSourceNode = targetNode; // homebases becomes new source
      const flippedTargetNode = sourceNode; // institutions becomes new target
      const flippedSourceColId = targetColId; // institution_id
      const flippedTargetColId = sourceColId; // id
      const sx = flippedSourceNode.position.x || 0;
      const tx = flippedTargetNode.position.x || 0;
      return {
        ...edge,
        source: edge.target,
        target: edge.source,
        sourceHandle: sx < tx
          ? `col-${flippedSourceColId}-source`
          : `col-${flippedSourceColId}-source-l`,
        targetHandle: sx < tx
          ? `col-${flippedTargetColId}-target`
          : `col-${flippedTargetColId}-target-r`,
      };
    }

    // Detect malformed handles left over from older flip logic — only flag
    // suffixes that are IMPOSSIBLE for the given side, not a user-chosen
    // alternative side. The source side allows `-source` OR `-source-l`
    // (right or left), and the target side allows `-target` OR `-target-r`.
    // Reconnecting an edge endpoint to a different side (onReconnect) must
    // be preserved here.
    const sourceHasImpossibleSuffix = edge.sourceHandle
      ? edge.sourceHandle.endsWith('-target') || edge.sourceHandle.endsWith('-target-r')
      : false;
    const targetHasImpossibleSuffix = edge.targetHandle
      ? edge.targetHandle.endsWith('-source') || edge.targetHandle.endsWith('-source-l')
      : false;

    // Preserve any user-selected handles IF both sides have valid suffixes
    // (including the side choice they picked via onReconnect).
    if (edge.sourceHandle && edge.targetHandle && !sourceHasImpossibleSuffix && !targetHasImpossibleSuffix) {
      return edge;
    }

    // Otherwise (malformed suffixes or missing handles), fall through to
    // recompute. The X position gives a sensible default side.
    const sx = sourceNode.position.x || 0;
    const tx = targetNode.position.x || 0;
    const defaultSourceSuffix = sx < tx ? '-source' : '-source-l';
    const defaultTargetSuffix = sx < tx ? '-target' : '-target-r';

    return {
      ...edge,
      sourceHandle: edge.sourceHandle
        ? edge.sourceHandle.replace(/-(source|target)(-(l|r))?$/, defaultSourceSuffix)
        : `col-${sourceColId}${defaultSourceSuffix}`,
      targetHandle: edge.targetHandle
        ? edge.targetHandle.replace(/-(source|target)(-(l|r))?$/, defaultTargetSuffix)
        : `col-${targetColId}${defaultTargetSuffix}`,
    };
  }, []);

  useEffect(() => {
    const edgeHash = JSON.stringify(edges.map(e => ({ s: e.source, sh: e.sourceHandle, t: e.target, th: e.targetHandle })));
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    
    // Only update if edges actually changed their geometry/connection
    setEdges(eds => {
      let isChanged = false;
      const newEds = eds.map(edge => {
        const sourceNode = nodesById.get(edge.source);
        const targetNode = nodesById.get(edge.target);
        if (!sourceNode || !targetNode) return edge;

        const resolved = resolveEdgeHandles(edge, sourceNode, targetNode);
        if (
          resolved.source !== edge.source ||
          resolved.target !== edge.target ||
          resolved.sourceHandle !== edge.sourceHandle ||
          resolved.targetHandle !== edge.targetHandle
        ) {
          isChanged = true;
          return resolved;
        }

        return edge;
      });
      
      const deduped = dedupeEdgesByRelation(isChanged ? newEds : eds);
      return deduped === eds ? eds : deduped;
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
            // A column cannot be both PK and FK. If it's marked as PK, force
            // the FK status off so the FK badge disappears from the UI.
            const isFk = !col.is_pk && nodeFks.has(col.id);
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
  }, [edges, resolveEdgeHandles, setNodes, setEdges, dedupeEdgesByRelation]);

  // Reconcile edge handles after a node finishes dragging.
  // Existing user-selected handles stay intact; only missing handles are filled in.
  const onNodeDragStop = useCallback(() => {
    const currentNodes = getNodes() as Node<Entity>[];
    const currentEdges = getEdges();
    const currentNodesById = new Map(currentNodes.map(node => [node.id, node]));
    
    setEdges(eds => {
      let isChanged = false;
      const newEds = eds.map(edge => {
        const sourceNode = currentNodesById.get(edge.source);
        const targetNode = currentNodesById.get(edge.target);
        if (!sourceNode || !targetNode) return edge;

        const resolved = resolveEdgeHandles(edge, sourceNode, targetNode);
        if (
          resolved.source !== edge.source ||
          resolved.target !== edge.target ||
          resolved.sourceHandle !== edge.sourceHandle ||
          resolved.targetHandle !== edge.targetHandle
        ) {
          isChanged = true;
          return resolved;
        }
        return edge;
      });
      const deduped = dedupeEdgesByRelation(isChanged ? newEds : eds);
      return deduped === eds ? eds : deduped;
    });
    
    takeSnapshot(currentNodes as Node<Entity>[], currentEdges);
  }, [setEdges, takeSnapshot, getNodes, getEdges, resolveEdgeHandles, dedupeEdgesByRelation]);

  const handleMoveEnd = useCallback((_: any, v: Viewport) => {
    if (!isPublicView && !isInitializingRef.current) {
      const prev = viewportRef.current;
      const hasChanged = 
        Math.abs((prev.x || 0) - v.x) > 0.5 || 
        Math.abs((prev.y || 0) - v.y) > 0.5 || 
        Math.abs((prev.zoom || 1) - v.zoom) > 0.001;
      if (hasChanged) {
        viewportRef.current = v;
      }
    }
  }, [isPublicView]);

  // ── ERD Keyboard Shortcuts (undo/redo) ──
  // Extracted from App.tsx global keydown handler — only active in erd view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingText = target?.matches('input, textarea, [contenteditable="true"]')
        || !!target?.closest('.cm-editor');
      if (isEditingText) return;

      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) handleRedo();
        } else {
          if (canUndo) handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault();
        if (canRedo) handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleUndo, handleRedo, canUndo, canRedo]);

  // ── ERD Custom Event Listener (deleteEntity) ──
  // Dispatched from EntityNode.tsx dropdown menu actions
  useEffect(() => {
    const onDeleteEntity = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      deleteEntity(detail);
    };
    window.addEventListener('deleteEntity', onDeleteEntity);
    return () => {
      window.removeEventListener('deleteEntity', onDeleteEntity);
    };
  }, [deleteEntity]);

  return {
    nodes, setNodes, onNodesChange: onNodesChangeWrapped,
    edges, setEdges, onEdgesChange: onEdgesChangeWrapped,
    selectedNodeId, setSelectedNodeId,
    selectedEdgeId, setSelectedEdgeId,
    onConnect,
    addEntity,
    duplicateEntity,
    updateEntity,
    deleteEntity,
    handleEdgeUpdate,
    handleEdgeFlip,
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
    onMoveEnd: handleMoveEnd,
    // Expose helpers for use in ERDView's onReconnect
    extractColumnIdFromHandle,
    getRelationKey,
    dedupeEdgesByRelation,
  };
}
