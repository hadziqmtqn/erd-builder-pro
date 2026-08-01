import React, { useCallback, useState } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  BackgroundVariant,
  OnConnect,
  OnNodesChange,
  OnEdgesChange,
  Node,
  Edge,
  MarkerType,
  useReactFlow,
  addEdge,
  reconnectEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Upload, Undo2, Redo2, LayoutGrid, RefreshCw, Database } from 'lucide-react';

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import EntityNode from '../diagram/EntityNode';
import { Entity } from '@/types';
import { useAIAction } from '@/contexts/AIActionContext';
import { applyToErdContent, ErdApplyResult } from '@/components/ai/actions/erdActions';
import { toast } from 'sonner';
import { computeSchemaDiff, DiffResult, type SchemaDiffChange } from '@/lib/schema-diff';
import { mergeSchemaChanges } from '@/lib/schema-merge';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/providers/WorkspaceContext';
import { apiFetch } from '@/lib/api';
import { EyeOff, Monitor } from 'lucide-react';

const nodeTypes = {
  entity: EntityNode,
};

interface ERDViewProps {
  nodes: Node<Entity>[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node<Entity>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onNodesChange: OnNodesChange<Node<Entity>>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onNodeDoubleClick?: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
  onPaneClick: () => void;
  onMove: (event: any, viewport: any) => void;
  addEntity: () => void;
  onImportSQL?: () => void;
  onAutoLayout?: () => void;
  handleExportSQL: (dialect: 'postgresql' | 'mysql') => void;
  onNodeDragStop?: () => void;

  handleExportImage: () => void;
  isReadOnly?: boolean;

  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  takeSnapshot?: (nodes: Node<Entity>[], edges: Edge[]) => void;
  isLoading?: boolean;
  selectedNodeId?: string | null;
  onMoveEnd?: (e: any, v: any) => void;
  saveDiagram?: (nodes: Node<Entity>[], edges: Edge[], viewport: any) => Promise<void>;
  triggerDebouncedSync?: () => void;
  pendingErdDiffTrigger?: number;
  // Exposed helpers from useERDSession for onReconnect validation
  extractColumnIdFromHandle?: (handle?: string | null) => string | null;
  getRelationKey?: (edge: Edge) => string | null;
  dedupeEdgesByRelation?: (edges: Edge[]) => Edge[];
}


import { JumpToNode } from '../JumpToNode';

const ERDViewComponent = ({
  nodes,
  edges,
  setNodes,
  setEdges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onNodeDoubleClick,
  onEdgeClick,
  onPaneClick,
  onMove,
  addEntity,
  onImportSQL,
  onAutoLayout,
  isReadOnly = false,

  undo,
  redo,
  canUndo,
  canRedo,
  takeSnapshot,
  selectedNodeId,
  onNodeDragStop,
  onMoveEnd,
  isLoading,
  saveDiagram,
  triggerDebouncedSync,
  pendingErdDiffTrigger,
  extractColumnIdFromHandle,
  getRelationKey,
  dedupeEdgesByRelation,
}: ERDViewProps) => {

  const { registerContentHandler, setSelectionText, setActionContextData, setRightPanelMode } = useAIAction();
  const { getViewport } = useReactFlow();
  const { resolvedTheme, activeDocument } = useWorkspace();
  const bgColor = resolvedTheme === 'dark' ? '#222' : '#ccc';
  const isProductionDb = activeDocument?.source_type === 'production_db';
  const sourceConnectionId = activeDocument?.source_connection_id as number | undefined;

  const [isSyncing, setIsSyncing] = useState(false);


  // ─── Multi-table selection ───────────────────────────
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);

  // ─── Visual Schema Diffing States ────────────────────
  const [pendingDiff, setPendingDiff] = useState<{
    originalNodes: Node<Entity>[];
    originalEdges: Edge[];
    proposedNodes: Node<Entity>[];
    proposedEdges: Edge[];
    diffNodes: Node<Entity>[];
    diffEdges: Edge[];
    diffResult: DiffResult;
  } | null>(null);
  const [approvedChangeIds, setApprovedChangeIds] = useState<string[]>([]);
  const [showChecklist, setShowChecklist] = useState(false);

  // Memoized diff-derived values — prevent filter/map re-run on every ReactFlow render
  const diffChanges = pendingDiff?.diffResult.changes ?? [];
  const allChangedIds = diffChanges.map(change => change.id);
  const diffNewCount = pendingDiff?.diffResult.newCount ?? 0;
  const diffModCount = pendingDiff?.diffResult.modifiedCount ?? 0;
  const diffDelCount = pendingDiff?.diffResult.deletedCount ?? 0;
  const diffKindSummary = React.useMemo(() => ['table', 'column', 'relation'].map(kind => {
    const count = diffChanges.filter(change => change.kind === kind).length;
    return count ? `${count} ${kind}${count === 1 ? '' : 's'}` : null;
  }).filter(Boolean).join(' · '), [diffChanges]);
  const groupedDiffChanges = React.useMemo(() => {
    const groups = new Map<string, SchemaDiffChange[]>();
    for (const change of diffChanges) {
      const table = changeTableName(change);
      groups.set(table, [...(groups.get(table) || []), change]);
    }
    return [...groups];
  }, [diffChanges]);

  const handleNodeClickLocal = useCallback((e: React.MouseEvent, n: Node) => {
    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      setMultiSelectedIds(prev => {
        const exists = prev.includes(n.id);
        return exists ? prev.filter(id => id !== n.id) : [...prev, n.id];
      });
      return;
    }
    setMultiSelectedIds([]);
    onNodeClick(e, n);
  }, [onNodeClick]);

  const handlePaneClickLocal = useCallback(() => {
    setMultiSelectedIds([]);
    onPaneClick();
  }, [onPaneClick]);

  // Collect all visually-selected node IDs (multi-select + primary)
  const allSelectedIds = React.useMemo(() => {
    if (multiSelectedIds.length > 0) return multiSelectedIds;
    if (selectedNodeId) return [selectedNodeId];
    return [];
  }, [multiSelectedIds, selectedNodeId]);

  const styledNodes = React.useMemo(() => {
    return nodes.map(node => {
      const selected = allSelectedIds.includes(node.id);
      // Use !! to normalize undefined/null to boolean — avoids creating wrappers
      // for all nodes on the first drag after setNodes() (which may lack `selected`)
      if (!!node.selected === selected) return node;
      return { ...node, selected };
    });
  }, [nodes, allSelectedIds]);

  const diffNodesWithMode = React.useMemo(() => {
    if (!pendingDiff) return [];
    return pendingDiff.diffNodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        isDiffMode: true
      }
    }));
  }, [pendingDiff]);

  const styledEdges = React.useMemo(() => {
    const hasSelection = allSelectedIds.length > 0;

    return edges.map(edge => {
      const baseEdge = {
        ...edge,
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.Arrow,
          width: 15,
          height: 15,
        },
      };

      const isConnectedToSelected = hasSelection && allSelectedIds.some(
        id => edge.source === id || edge.target === id
      );

      // Build class list from existing + computed classes
      const classes: string[] = [];
      if (edge.className) classes.push(edge.className);

      if (isConnectedToSelected) {
        classes.push('edge-animated-active');
      } else if (hasSelection) {
        classes.push('edge-dimmed');
      }

      const newClassName = classes.join(' ');
      if (baseEdge.className === newClassName) return baseEdge;
      return { ...baseEdge, className: newClassName };
    });
  }, [edges, allSelectedIds]);

  // Filter out selection-only changes to avoid unnecessary re-renders from React Flow
  const handleNodesChangeLocal = useCallback(
    (changes: any[]) => {
      const dataChanges = changes.filter((change: any) => change.type !== 'select');
      if (dataChanges.length === 0) return;
      onNodesChange(dataChanges);
    },
    [onNodesChange],
  );

  // ─── Refs for callback stability ──────────────────────
  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  const selectedNodeIdRef = React.useRef(selectedNodeId);
  const allSelectedIdsRef = React.useRef(allSelectedIds);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  selectedNodeIdRef.current = selectedNodeId;
  allSelectedIdsRef.current = allSelectedIds;

  // ─── Send selected tables context to AI ──────────────
  // Only fires when selection (set of IDs) changes — NOT on position changes during drag
  React.useEffect(() => {
    if (allSelectedIds.length > 0) {
      const selectedNodes = allSelectedIds
        .map(id => nodesRef.current.find(n => n.id === id))
        .filter((n): n is Node<Entity> => !!n);
      if (selectedNodes.length === 0) return;

      const tableDetails = selectedNodes.map(n => {
        const name = n.data.name || n.data.label || n.id;
        const cols = (n.data.columns || []).map((c: any) => `${c.name}: ${c.type}${c.max_length ? `(${c.max_length})` : ''}${c.numeric_precision ? `(${c.numeric_precision}${c.numeric_scale !== null && c.numeric_scale !== undefined ? `,${c.numeric_scale}` : ''})` : ''}${c.is_pk ? ' PK' : ''}${c.is_nullable ? ' NULL' : ''}${c.comment ? ` -- ${c.comment}` : ''}`);
        return `${name} (${cols.join(', ')})`;
      }).join('; ');
      setSelectionText(`Tables: ${tableDetails}`);
    } else {
      setSelectionText(null);
    }
  }, [allSelectedIds, setSelectionText]);

  React.useEffect(() => {
    const primaryNode = selectedNodeId ? nodesRef.current.find(n => n.id === selectedNodeId) ?? null : null;
    const multiSelected = allSelectedIds
      .map(id => nodesRef.current.find(n => n.id === id))
      .filter((n): n is Node<Entity> => !!n);
    setActionContextData({
      nodes: nodesRef.current,
      edges: edgesRef.current,
      selectedNode: primaryNode,
      multiSelectedNodes: multiSelected,
    });
  }, [selectedNodeId, allSelectedIds, setActionContextData]);
  const takeSnapshotRef = React.useRef(takeSnapshot);
  takeSnapshotRef.current = takeSnapshot;

  // ─── Visual Schema Diffing Callbacks ────────────────
  const startDiff = useCallback((origNodes: Node<Entity>[], origEdges: Edge[], propNodes: Node<Entity>[], propEdges: Edge[]) => {
    const diffData = computeSchemaDiff(origNodes, origEdges, propNodes, propEdges);
    setApprovedChangeIds(diffData.changes.map(change => change.id));
    setPendingDiff({
      originalNodes: origNodes,
      originalEdges: origEdges,
      proposedNodes: propNodes,
      proposedEdges: propEdges,
      diffNodes: diffData.nodes,
      diffEdges: diffData.edges,
      diffResult: diffData,
    });
    setShowChecklist(false);
  }, []);
  const handleSync = useCallback(async () => {
    if (!sourceConnectionId) return;
    setIsSyncing(true);
    try {
      const res = await apiFetch(`/api/catalogs/${sourceConnectionId}/schema`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to sync schema' }));
        toast.error(err.error || 'Failed to sync schema');
        return;
      }
      const data = await res.json();
      const tables: any[] = data.schema || [];

      // Convert tables to Node<Entity>[]
      const idMap = new Map<string, string>();
      const newNodes: Node<Entity>[] = tables.map((t: any, i: number) => {
        const nodeId = crypto.randomUUID();
        idMap.set(t.table_name, nodeId);
        return {
          id: nodeId,
          type: 'entity',
          position: { x: (i % 4) * 280 + 50, y: Math.floor(i / 4) * 200 + 50 },
          data: {
            id: nodeId,
            name: t.table_name,
            x: (i % 4) * 280 + 50,
            y: Math.floor(i / 4) * 200 + 50,
            color: '#4f46e5',
            columns: (t.columns || []).map((c: any) => ({
              id: crypto.randomUUID(),
              name: c.name,
              type: c.type,
              is_pk: !!c.is_pk,
              is_nullable: !!c.is_nullable,
              enum_values: c.enum_values ?? null,
              comment: c.comment || '',
              max_length: c.max_length ?? null,
              numeric_precision: c.numeric_precision ?? null,
              numeric_scale: c.numeric_scale ?? null,
              sort_order: c.sort_order || 0,
              _is_fk: false,
            })),
          },
        };
      });

      // Build edges from foreign_keys
      const columnIdMap = new Map<string, string>();
      newNodes.forEach(n => {
        n.data.columns.forEach(c => {
          columnIdMap.set(`${n.data.name}.${c.name}`, c.id);
        });
      });
      const newEdges: Edge[] = [];
      tables.forEach((t: any) => {
        const sourceId = idMap.get(t.table_name);
        if (!sourceId) return;
        (t.foreign_keys || []).forEach((fk: any) => {
          const targetId = idMap.get(fk.ref_table);
          if (!targetId) return;
          const srcColId = columnIdMap.get(`${t.table_name}.${fk.column}`);
          const tgtColId = columnIdMap.get(`${fk.ref_table}.${fk.ref_column}`);
          if (!srcColId || !tgtColId) return;
          if (newEdges.some(e => e.source === sourceId && e.target === targetId)) return;
          newEdges.push({
            id: crypto.randomUUID(),
            source: sourceId,
            target: targetId,
            sourceHandle: `col-${srcColId}-source`,
            targetHandle: `col-${tgtColId}-target`,
            type: 'smoothstep',
          });
        });
      });

      startDiff(nodesRef.current, edgesRef.current, newNodes, newEdges);
      toast.success(`Fetched ${tables.length} tables from production DB`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to sync schema');
    } finally {
      setIsSyncing(false);
    }
  }, [sourceConnectionId, startDiff]);

  const handleRejectAll = useCallback(() => {
    setPendingDiff(null);
    toast.info('AI schema update rejected');
  }, []);

  const handleApplyMerge = useCallback(() => {
    if (!pendingDiff) return;

    const { originalNodes, originalEdges, proposedNodes, proposedEdges, diffResult } = pendingDiff;
    const { nodes: finalNodes, edges: finalEdges } = mergeSchemaChanges(
      originalNodes, originalEdges, proposedNodes, proposedEdges, diffResult, approvedChangeIds,
    );

    takeSnapshotRef.current?.(nodesRef.current, edgesRef.current);
    setNodes(finalNodes);
    setEdges(finalEdges);
    setPendingDiff(null);
    toast.success('AI changes merged successfully!');
    if (saveDiagram) {
      saveDiagram(finalNodes, finalEdges, getViewport()).then(() => {
        triggerDebouncedSync?.();
      }).catch(err => console.error('Error saving after merge:', err));
    }
  }, [pendingDiff, approvedChangeIds, setNodes, setEdges, saveDiagram, triggerDebouncedSync, getViewport]);

  const defaultEdgeOptions = React.useMemo(() => ({
    type: 'smoothstep' as const,
    animated: false,
    reconnectable: true,
    markerEnd: {
      type: MarkerType.Arrow,
      width: 15,
      height: 15,
    },
  }), []);

  // ─── AI Content Handler: apply AI responses back to ERD diagram ──
  React.useEffect(() => {
    const unregister = registerContentHandler((content: string, _strategy: 'replace' | 'append', actionId?: string) => {
      if (!content) return;

      let result: ErdApplyResult | null = null;

      const extra = {
        selectedNodeId: selectedNodeIdRef.current,
        selectedNodeIds: allSelectedIdsRef.current,
      };

      try {
        if (actionId) {
          result = applyToErdContent(nodesRef.current, edgesRef.current, actionId, content, extra);
        } else {
          // Manual chat: try schema content (DBML first, SQL fallback), then column mutations
          result = applyToErdContent(nodesRef.current, edgesRef.current, 'erd-generate-sql', content, extra);
          if (!result) {
            result = applyToErdContent(nodesRef.current, edgesRef.current, 'erd-edit-column', content, extra);
          }
        }
      } catch (error: any) {
        toast.error('Invalid ERD schema in AI response', {
          description: error?.message || 'Fix the DBML/SQL block and try Append again.',
        });
        return;
      }

      if (result) {
        startDiff(nodesRef.current, edgesRef.current, result.nodes, result.edges);
      } else {
        toast.error('No valid changes found in response');
      }
    }, ['append']);
    return unregister;
  }, [registerContentHandler, startDiff]);

  React.useEffect(() => {
    const pendingSchema = localStorage.getItem('pending_create_erd_schema')
      || localStorage.getItem('pending_create_erd_ddl');
    if (pendingSchema) {
      localStorage.removeItem('pending_create_erd_schema');
      localStorage.removeItem('pending_create_erd_ddl');
      const result = applyToErdContent(nodesRef.current, edgesRef.current, 'erd-generate-sql', pendingSchema);
      if (result) {
        if (nodesRef.current.length === 0) {
          takeSnapshotRef.current?.([], []);
          setNodes(result.nodes);
          setEdges(result.edges);
          if (saveDiagram) {
            saveDiagram(result.nodes, result.edges, { x: 0, y: 0, zoom: 1 }).then(() => {
              // Trigger cloud sync immediately — saveDiagram only saves to IndexedDB draft,
              // and the auto-save effect has a 2-second guard that blocks newly created diagrams.
              triggerDebouncedSync?.();
            }).catch(err => {
              console.error('Error saving generated diagram:', err);
            });
          }
          toast.success('Applied generated schema to new diagram');
        } else {
          startDiff(nodesRef.current, edgesRef.current, result.nodes, result.edges);
        }
      }
    }
  }, [setNodes, setEdges, startDiff, saveDiagram, triggerDebouncedSync]);

  // ─── Handle pending UPDATE schema ──
  // Unlike create, update waits for server data to load first (nodes.length > 0),
  // then shows the diff/merge UI so the user can selectively merge changes.
  // pendingErdDiffTrigger allows re-processing when already on the same page.
  React.useEffect(() => {
    const pendingUpdateSchema = localStorage.getItem('pending_update_erd_schema')
      || localStorage.getItem('pending_update_erd_ddl');
    if (!pendingUpdateSchema) return;

    // Wait for server data to load — nodes will be empty during navigation,
    // then populated once selectDiagram completes
    if (nodes.length === 0) return;

    // Consume the pending schema
    localStorage.removeItem('pending_update_erd_schema');
    localStorage.removeItem('pending_update_erd_ddl');

    const result = applyToErdContent(nodesRef.current, edgesRef.current, 'erd-generate-sql', pendingUpdateSchema);
    if (result) {
      // Use the visual diff/merge UI to compare existing data with proposed schema
      startDiff(nodesRef.current, edgesRef.current, result.nodes, result.edges);
      toast.info('Review the schema changes and merge when ready');
    } else {
      toast.error('Could not parse the schema for diff');
    }
  }, [nodes, startDiff, pendingErdDiffTrigger]);

  return (
    <div className="flex-1 relative flex flex-col overflow-hidden border rounded-xl bg-muted/20" style={{ contain: 'paint layout' }}>

      {isReadOnly && isProductionDb && (
        <div className="absolute bottom-4 inset-x-0 z-20 flex justify-center pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg pointer-events-auto text-sm text-amber-700 dark:text-amber-400 shadow-lg">
            <EyeOff className="h-4 w-4 shrink-0" />
            <span>Read-only — imported from production database. Switch to desktop app to modify.</span>
          </div>
        </div>
      )}

      {!pendingDiff && (
        <div className="absolute top-6 inset-x-0 z-10 flex justify-center pointer-events-none">
          <div className="flex items-center gap-1.5 p-1.5 bg-background/95 backdrop-blur-md border border-border/50 rounded-2xl shadow-2xl pointer-events-auto max-w-[95vw] overflow-x-auto no-scrollbar">
            <JumpToNode nodes={nodes} label="Table" />
            {!isReadOnly && <div className="w-px h-6 bg-border mx-0.5" />}
            
            {!isReadOnly && (
              <Button onClick={addEntity} size="sm" className="h-9 px-3 sm:px-4 font-bold shadow-lg shadow-primary/20 cursor-pointer">
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Add Table</span>
              </Button>
            )}
            {!isReadOnly && (
              <Button onClick={onImportSQL} variant="outline" size="sm" className="h-9 px-3 border-border hover:bg-muted bg-muted/50 text-xs font-semibold cursor-pointer">
                <Upload className="w-3.5 h-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Import SQL</span>
              </Button>
            )}
            {!isProductionDb && (
              <Button onClick={() => setRightPanelMode('dbml')} variant="outline" size="sm" className="h-9 px-3 border-border hover:bg-muted bg-muted/50 text-xs font-semibold cursor-pointer">
                <Database className="w-3.5 h-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">DBML</span>
              </Button>
            )}
            <Button onClick={onAutoLayout} variant="outline" size="sm" className="h-9 px-3 border-border hover:bg-muted bg-muted/50 text-xs font-semibold cursor-pointer">
              <LayoutGrid className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Auto Layout</span>
            </Button>

            {isProductionDb && (
              <Button onClick={handleSync} variant="outline" size="sm" className="h-9 px-3 border-amber-500/50 hover:bg-amber-500/10 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-xs font-semibold cursor-pointer" disabled={isSyncing}>
                <RefreshCw className={`w-3.5 h-3.5 sm:mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync'}</span>
              </Button>
            )}

            {!isReadOnly && (
              <div className="flex items-center gap-0.5 ml-auto">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={undo} 
                  disabled={!canUndo}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={redo} 
                  disabled={!canRedo}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-[1px] transition-opacity duration-150">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}
      <div className="flex-1">
        <ReactFlow
          nodes={pendingDiff ? diffNodesWithMode : styledNodes}
          edges={pendingDiff ? pendingDiff.diffEdges : styledEdges}
          onNodesChange={handleNodesChangeLocal}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={(oldEdge, connection) => {
            if (!connection.sourceHandle || !connection.targetHandle) return;
            const sourceNode = nodes.find(n => n.id === connection.source);
            const targetNode = nodes.find(n => n.id === connection.target);
            if (sourceNode && targetNode) {
              const srcId = String(connection.sourceHandle).replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
              const tgtId = String(connection.targetHandle).replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
              const srcCol = sourceNode.data.columns.find((c: any) => String(c.id ?? c.uid) === srcId);
              const tgtCol = targetNode.data.columns.find((c: any) => String(c.id ?? c.uid) === tgtId);
              if (srcCol && tgtCol && srcCol.type !== tgtCol.type) {
                toast.error('Type Mismatch', { description: `Cannot reconnect ${srcCol.type} to ${tgtCol.type}` });
                return;
              }

              // ─── Duplicate relation check ────────────────────────────
              if (extractColumnIdFromHandle && getRelationKey) {
                const srcColId = extractColumnIdFromHandle(connection.sourceHandle);
                const tgtColId = extractColumnIdFromHandle(connection.targetHandle);
                if (srcColId && tgtColId) {
                  const srcName = srcCol?.name?.toLowerCase();
                  const tgtName = tgtCol?.name?.toLowerCase();
                  const cSrcNameKey = srcName ? `${connection.source}:${srcName}` : null;
                  const cTgtNameKey = tgtName ? `${connection.target}:${tgtName}` : null;

                  const isDuplicate = edges.some(edge => {
                    if (edge.id === oldEdge.id) return false; // skip self
                    const key = getRelationKey(edge);
                    if (!key) return false;
                    // Check by ID key
                    const newKey = `${[connection.source, connection.target].sort().join(':')}:${[srcColId, tgtColId].sort().join(':')}`;
                    if (key === newKey) return true;
                    // Check by name key (symmetric)
                    if (cSrcNameKey && cTgtNameKey) {
                      const eSrcNode = nodes.find(n => n.id === edge.source);
                      const eTgtNode = nodes.find(n => n.id === edge.target);
                      if (eSrcNode && eTgtNode) {
                        const eSrcId2 = extractColumnIdFromHandle(edge.sourceHandle);
                        const eTgtId2 = extractColumnIdFromHandle(edge.targetHandle);
                        const eSrcName = eSrcNode.data.columns.find((c: any) => c.id === eSrcId2)?.name?.toLowerCase();
                        const eTgtName = eTgtNode.data.columns.find((c: any) => c.id === eTgtId2)?.name?.toLowerCase();
                        if (eSrcName && eTgtName) {
                          const eSrcNameKey = `${edge.source}:${eSrcName}`;
                          const eTgtNameKey = `${edge.target}:${eTgtName}`;
                          return (eSrcNameKey === cSrcNameKey && eTgtNameKey === cTgtNameKey) ||
                                 (eSrcNameKey === cTgtNameKey && eTgtNameKey === cSrcNameKey);
                        }
                      }
                    }
                    return false;
                  });

                  if (isDuplicate) {
                    toast.info('Relation already exists');
                    return;
                  }
                }
              }

              // ─── FK already related check ──────────────────────────
              if (extractColumnIdFromHandle && srcCol?.name) {
                const srcColId = extractColumnIdFromHandle(connection.sourceHandle);
                const srcNameKey = `${sourceNode.data.name.toLowerCase()}:${srcCol.name.toLowerCase()}`;
                const conflictingEdge = edges.find(edge => {
                  if (edge.id === oldEdge.id) return false;
                  const eSrcNode = nodes.find(n => n.id === edge.source);
                  if (!eSrcNode) return false;
                  const eSrcId2 = extractColumnIdFromHandle(edge.sourceHandle);
                  if (!eSrcId2) return false;
                  const eSrcName = eSrcNode.data.columns.find((c: any) => c.id === eSrcId2)?.name?.toLowerCase();
                  if (!eSrcName) return false;
                  return `${eSrcNode.data.name.toLowerCase()}:${eSrcName}` === srcNameKey;
                });
                if (conflictingEdge) {
                  const targetTable = nodes.find(n => n.id === conflictingEdge.target);
                  toast.error('FK already related', {
                    description: `This column is already related to ${targetTable?.data.name || 'another table'}. One FK column can only point to one PK.`,
                    duration: 4000,
                  });
                  return;
                }
              }
            }
            takeSnapshot?.(nodes, edges);
            const newEds = reconnectEdge(oldEdge, connection, edges);
            const deduped = dedupeEdgesByRelation ? dedupeEdgesByRelation(newEds) : newEds;
            setEdges(deduped);
          }}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClickLocal}
          onNodeDoubleClick={onNodeDoubleClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={handlePaneClickLocal}
          onMove={onMove}
          colorMode={resolvedTheme}
          onlyRenderVisibleElements={true}
          nodesDraggable={!isReadOnly && !pendingDiff}
          nodesConnectable={!isReadOnly && !pendingDiff}
          elementsSelectable={!isReadOnly && !pendingDiff}
          onNodeDragStop={onNodeDragStop}
          onMoveEnd={onMoveEnd}
          minZoom={0.1}
          maxZoom={2.5}
          defaultEdgeOptions={defaultEdgeOptions}
          deleteKeyCode={null}
        >

          <Background variant={BackgroundVariant.Lines} gap={50} size={1} color={bgColor} />
          <Controls position="bottom-left" showInteractive={false} />
        </ReactFlow>
      </div>

      {/* Floating Diff Merge Panel */}
      {pendingDiff && (
        <div className="absolute bottom-6 inset-x-0 z-50 flex flex-col items-center justify-center gap-2.5 pointer-events-none">
          {/* Checklist opens above the bottom toolbar. */}
          {showChecklist && (
            <div className="w-[min(560px,calc(100vw-2rem))] bg-popover/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl pointer-events-auto p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Select changes to merge:</span>
                <button
                  onClick={() => {
                    setApprovedChangeIds(approvedChangeIds.length === allChangedIds.length ? [] : [...allChangedIds]);
                  }}
                  className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground underline font-medium"
                >
                  {approvedChangeIds.length === allChangedIds.length ? 'Unselect All' : 'Select All'}
                </button>
              </div>

              <div className="max-h-75 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                {groupedDiffChanges.map(([table, changes]) => (
                  <section key={table} className="overflow-hidden rounded-lg border border-border">
                    <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-2">
                      <span className="text-xs font-semibold text-foreground">{table}</span>
                      <span className="text-[10px] text-muted-foreground">{changes.length} change{changes.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(72px,auto)_auto] gap-3 border-b border-border px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      <span />
                      <span>Column</span>
                      <span>Type</span>
                      <span>Change</span>
                    </div>
                    <div className="divide-y divide-border">
                      {changes.map(change => {
                        const isChecked = approvedChangeIds.includes(change.id);
                        return (
                          <label key={change.id} className={cn(
                            "grid grid-cols-[auto_minmax(0,1fr)_minmax(72px,auto)_auto] items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                            isChecked ? "bg-background text-foreground hover:bg-muted/50" : "bg-muted/20 text-muted-foreground hover:bg-muted/40",
                          )}>
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => setApprovedChangeIds(prev => prev.includes(change.id) ? prev.filter(id => id !== change.id) : [...prev, change.id])}
                              className="border-border bg-transparent data-checked:border-emerald-500 data-checked:bg-emerald-500"
                            />
                            <span className="min-w-0 truncate text-sm font-medium">{changeFieldName(change)}</span>
                            <code className="truncate font-mono text-xs text-muted-foreground">{changeType(change)}</code>
                            <span className={cn(
                              "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                              change.state === 'new' && "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                              change.state === 'deleted' && "border-destructive/30 bg-destructive/10 text-destructive",
                              change.state === 'modified' && "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                            )}>{change.state}</span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )}

          {/* Main Diff Bar */}
          <div className="flex items-center gap-4 p-2.5 bg-popover/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl pointer-events-auto max-w-[95vw]">
            <div className="flex items-center gap-2 px-2.5 text-foreground">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">AI Schema Proposal</span>
              <div className="h-4 w-px bg-border mx-2" />
              <div className="flex gap-2 text-[11px] font-bold">
                {diffNewCount > 0 && (
                  <span className="text-emerald-400">{diffNewCount} New</span>
                )}
                {diffModCount > 0 && (
                  <span className="text-amber-400">{diffModCount} Mod</span>
                )}
                {diffDelCount > 0 && (
                  <span className="text-red-400">{diffDelCount} Del</span>
                )}
              </div>
              {diffKindSummary && <span className="text-[10px] text-muted-foreground">{diffKindSummary}</span>}
            </div>

            <div className="h-6 w-px bg-border" />

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowChecklist(!showChecklist)}
              >
                Review Changes
              </Button>
              <Button
                variant="destructive"
                onClick={handleRejectAll}
              >
                Reject All
              </Button>
              <Button
                onClick={handleApplyMerge}
              >
                Merge Selected
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function changeTableName(change: SchemaDiffChange) {
  if (change.kind === 'column') {
    const path = change.id.replace(/^column:/, '');
    return path.slice(0, path.lastIndexOf('.'));
  }
  if (change.kind === 'relation') return change.label.split('.')[0];
  return change.label;
}

function changeFieldName(change: SchemaDiffChange) {
  if (change.kind === 'column') return change.label.slice(change.label.lastIndexOf('.') + 1);
  if (change.kind === 'table') return 'Table definition';
  return change.label;
}

function changeType(change: SchemaDiffChange) {
  if (change.kind === 'table') return 'TABLE';
  if (change.kind === 'relation') return 'FK';
  const column = change.proposed ?? change.current;
  return column && 'is_pk' in column ? column.type : '—';
}

// Custom comparator: skip function props to prevent unnecessary re-renders
// from App.tsx's inline callbacks (save/sync cycle triggers re-render but
// shouldn't cause ReactFlow to re-initialize)
function nodesEqual(a: Node<Entity>[], b: Node<Entity>[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const na = a[i], nb = b[i];
    if (na.id !== nb.id || na.position?.x !== nb.position?.x || na.position?.y !== nb.position?.y) return false;
    if (na.selected !== nb.selected) return false;
    if (na.data?.name !== nb.data?.name || na.data?.color !== nb.data?.color) return false;
    const ca = na.data?.columns, cb = nb.data?.columns;
    if (!ca !== !cb) return false;
    if (ca && cb && ca.length !== cb.length) return false;
    if (ca && cb) {
      for (let j = 0; j < ca.length; j++) {
        const ca2 = ca[j], cb2 = cb[j];
        if (ca2.id !== cb2.id || ca2.name !== cb2.name || ca2.type !== cb2.type ||
            ca2.sort_order !== cb2.sort_order || ca2.is_pk !== cb2.is_pk || ca2.is_nullable !== cb2.is_nullable ||
            ca2.comment !== cb2.comment || ca2.max_length !== cb2.max_length ||
            ca2.numeric_precision !== cb2.numeric_precision || ca2.numeric_scale !== cb2.numeric_scale) return false;
      }
    }
  }
  return true;
}

function edgesEqual(a: Edge[], b: Edge[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ea = a[i], eb = b[i];
    if (ea.id !== eb.id || ea.source !== eb.source || ea.target !== eb.target ||
        ea.sourceHandle !== eb.sourceHandle || ea.targetHandle !== eb.targetHandle ||
        ea.label !== eb.label || ea.selected !== eb.selected) return false;
  }
  return true;
}

export const ERDView = React.memo(ERDViewComponent, (prev, next) => {
  // If we already have nodes, don't re-render just because isLoading flickers
  const loadingFlickered = prev.isLoading !== next.isLoading;
  const hasData = next.nodes.length > 0;
  const wasEmptyBefore = prev.nodes.length === 0;
  const shouldIgnoreLoading = loadingFlickered && hasData && !wasEmptyBefore;

  return (
    nodesEqual(prev.nodes, next.nodes) &&
    edgesEqual(prev.edges, next.edges) &&
    (shouldIgnoreLoading || prev.isLoading === next.isLoading) &&
    prev.isReadOnly === next.isReadOnly &&
    prev.selectedNodeId === next.selectedNodeId &&
    prev.canUndo === next.canUndo &&
    prev.canRedo === next.canRedo &&
    prev.onMoveEnd === next.onMoveEnd &&
    prev.pendingErdDiffTrigger === next.pendingErdDiffTrigger &&
    prev.extractColumnIdFromHandle === next.extractColumnIdFromHandle &&
    prev.getRelationKey === next.getRelationKey &&
    prev.dedupeEdgesByRelation === next.dedupeEdgesByRelation
  );
});
