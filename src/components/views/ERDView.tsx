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
  ConnectionLineType,
  useReactFlow,
  addEdge,
  reconnectEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Upload, Undo2, Redo2, LayoutGrid, RefreshCw, Database, Download, FolderGit2 } from 'lucide-react';

import { Button } from "@/components/ui/button";
import EntityNode from '../diagram/EntityNode';
import { SchemaDiffOverlay } from '../diagram/SchemaDiffOverlay';
import { Entity } from '@/types';
import { useAIAction } from '@/contexts/AIActionContext';
import { applyToErdContent, ErdApplyResult } from '@/components/ai/actions/erdActions';
import { toast } from 'sonner';
import { computeSchemaDiff, DiffResult } from '@/lib/schema-diff';
import { mergeSchemaChanges } from '@/lib/schema-merge';
import { useWorkspace } from '@/providers/WorkspaceContext';
import { apiFetch, isInstalledApp } from '@/lib/api';
import { EyeOff, Monitor } from 'lucide-react';
import { buildErdIndexes, erdColumnKey, erdSourceColumnKey } from '@/lib/erd-indexes';
import { databaseColumnToERD } from '@/lib/column-metadata';
import { keepsDbRelation } from '@/lib/db-client-schema';
import { ERD_HISTORY_PREVIEW_EVENT, type ErdHistoryPreview } from '@/lib/history-diagram';
import { ERD_REPOSITORY_APPLIED_EVENT, ERD_REPOSITORY_PREVIEW_EVENT, type RepositoryPreview } from '@/lib/repository-preview';
import { erdToDBML } from '@/lib/dbml-converter';

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
  isDbClient?: boolean;
  sourceConnectionId?: number;

  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  takeSnapshot?: (nodes: Node<Entity>[], edges: Edge[]) => void;
  isLoading?: boolean;
  selectedNodeId?: string | null;
  onMoveEnd?: (e: any, v: any) => void;
  saveDiagram?: (nodes: Node<Entity>[], edges: Edge[], viewport: any, options?: { dbmlSource?: string }) => Promise<void>;
  triggerDebouncedSync?: () => void;
  pendingErdDiffTrigger?: number;
  // Exposed helpers from useERDSession for onReconnect validation
  extractColumnIdFromHandle?: (handle?: string | null) => string | null;
  getRelationKey?: (edge: Edge) => string | null;
  dedupeEdgesByRelation?: (edges: Edge[]) => Edge[];
  onEdgeReconnect?: (edges: Edge[]) => void;
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
  handleExportImage,
  isReadOnly = false,
  isDbClient = false,
  sourceConnectionId,

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
  onEdgeReconnect,
}: ERDViewProps) => {

  const { registerContentHandler, setSelectionText, setActionContextData, setRightPanelMode } = useAIAction();
  const { getViewport } = useReactFlow();
  const { resolvedTheme } = useWorkspace();
  const bgColor = resolvedTheme === 'dark' ? '#222' : '#ccc';
  const isProductionDb = isDbClient;

  const [isSyncing, setIsSyncing] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const lowDetailRef = React.useRef(false);

  const handleMoveLocal = useCallback((event: any, viewport: any) => {
    const lowDetail = viewport.zoom < 0.35;
    if (lowDetail !== lowDetailRef.current) {
      lowDetailRef.current = lowDetail;
      canvasRef.current?.classList.toggle('erd-canvas-low-detail', lowDetail);
    }
    onMove(event, viewport);
  }, [onMove]);


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
    source: 'proposal' | 'history' | 'repository' | 'repository-compare';
    version?: number;
    sourceLabel?: string;
    commit?: string;
    dbmlSource?: string;
  } | null>(null);
  const [approvedChangeIds, setApprovedChangeIds] = useState<string[]>([]);
  const [showChecklist, setShowChecklist] = useState(false);

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
      const isConnectedToSelected = hasSelection && allSelectedIds.some(
        id => edge.source === id || edge.target === id
      );
      const edgeColor = isConnectedToSelected || edge.selected
        ? 'var(--edge-selected)'
        : 'var(--edge-color)';
      const baseEdge = {
        ...edge,
        type: 'smoothstep',
        style: {
          ...edge.style,
          stroke: edgeColor,
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.Arrow,
          color: edgeColor,
          width: 10,
          height: 10,
        },
      };

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
  const startDiff = useCallback((origNodes: Node<Entity>[], origEdges: Edge[], propNodes: Node<Entity>[], propEdges: Edge[], options: { source?: 'proposal' | 'history' | 'repository' | 'repository-compare'; version?: number; sourceLabel?: string; commit?: string; dbmlSource?: string } = {}) => {
    const diffData = computeSchemaDiff(origNodes, origEdges, propNodes, propEdges);
    const source = options.source || 'proposal';
    if (diffData.changes.length === 0) {
      setPendingDiff(null);
      toast.success(source.startsWith('repository') ? 'Repository schema matches the comparison source' : 'No schema changes found');
      return;
    }
    setApprovedChangeIds(diffData.changes.map(change => change.id));
    setPendingDiff({
      originalNodes: origNodes,
      originalEdges: origEdges,
      proposedNodes: propNodes,
      proposedEdges: propEdges,
      diffNodes: diffData.nodes,
      diffEdges: diffData.edges,
      diffResult: diffData,
      source,
      version: options.version,
      sourceLabel: options.sourceLabel,
      commit: options.commit,
      dbmlSource: options.dbmlSource,
    });
    setShowChecklist(source !== 'proposal');
  }, []);

  React.useEffect(() => {
    const previewHistory = (event: Event) => {
      const preview = (event as CustomEvent<ErdHistoryPreview | undefined>).detail;
      if (!preview) {
        setPendingDiff(current => current?.source === 'history' ? null : current);
        return;
      }
      startDiff(nodesRef.current, edgesRef.current, preview.nodes, preview.edges, { source: 'history', version: preview.version });
    };
    window.addEventListener(ERD_HISTORY_PREVIEW_EVENT, previewHistory);
    return () => window.removeEventListener(ERD_HISTORY_PREVIEW_EVENT, previewHistory);
  }, [startDiff]);

  React.useEffect(() => {
    const previewRepository = (event: Event) => {
      const preview = (event as CustomEvent<RepositoryPreview | undefined>).detail;
      if (!preview) {
        setPendingDiff(current => current?.source.startsWith('repository') ? null : current);
        return;
      }
      startDiff(
        preview.originalNodes || nodesRef.current,
        preview.originalEdges || edgesRef.current,
        preview.proposedNodes,
        preview.proposedEdges,
        {
          source: preview.canApply ? 'repository' : 'repository-compare',
          sourceLabel: preview.sourceLabel,
          commit: preview.commit,
          dbmlSource: preview.dbmlSource,
        },
      );
    };
    window.addEventListener(ERD_REPOSITORY_PREVIEW_EVENT, previewRepository);
    return () => window.removeEventListener(ERD_REPOSITORY_PREVIEW_EVENT, previewRepository);
  }, [startDiff]);
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
            color: '#6b7280',
            columns: (t.columns || []).map((c: any) => databaseColumnToERD(c, crypto.randomUUID())),
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
          if (newEdges.some(e =>
            e.source === sourceId &&
            e.target === targetId &&
            e.sourceHandle === `col-${srcColId}-source` &&
            e.targetHandle === `col-${tgtColId}-target`
          )) return;
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
    if (pendingDiff?.source === 'history') {
      setRightPanelMode('closed');
      toast.info('Version preview closed');
    } else if (pendingDiff?.source.startsWith('repository')) {
      toast.info('Repository preview closed');
    } else {
      toast.info('AI schema update rejected');
    }
  }, [pendingDiff?.source, setRightPanelMode]);

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
    toast.success(pendingDiff.source === 'repository' ? 'Repository schema merged successfully' : 'AI changes merged successfully!');
    if (saveDiagram) {
      const repositoryDbml = pendingDiff.source === 'repository'
        ? approvedChangeIds.length === diffResult.changes.length && pendingDiff.dbmlSource
          ? pendingDiff.dbmlSource
          : erdToDBML(finalNodes, finalEdges)
        : undefined;
      const saveOptions = repositoryDbml
        ? { dbmlSource: repositoryDbml }
        : undefined;
      saveDiagram(finalNodes, finalEdges, getViewport(), saveOptions).then(() => {
        triggerDebouncedSync?.();
        if (pendingDiff.source === 'repository') {
          window.dispatchEvent(new CustomEvent(ERD_REPOSITORY_APPLIED_EVENT, { detail: { dbmlSource: repositoryDbml, commit: pendingDiff.commit } }));
        }
      }).catch(err => console.error('Error saving after merge:', err));
    }
  }, [pendingDiff, approvedChangeIds, setNodes, setEdges, saveDiagram, triggerDebouncedSync, getViewport]);

  const defaultEdgeOptions = React.useMemo(() => ({
    type: 'smoothstep' as const,
    animated: false,
    reconnectable: !isReadOnly || isProductionDb,
    style: {
      stroke: 'var(--edge-color)',
      strokeWidth: 2,
    },
    markerEnd: {
      type: MarkerType.Arrow,
      color: 'var(--edge-color)',
      width: 10,
      height: 10,
    },
  }), [isProductionDb, isReadOnly]);

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
            {!isReadOnly && !isProductionDb && isInstalledApp() && (
              <Button onClick={() => setRightPanelMode('repository')} variant="outline" size="sm" className="h-9 px-3 border-border hover:bg-muted bg-muted/50 text-xs font-semibold cursor-pointer">
                <FolderGit2 className="w-3.5 h-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Repository</span>
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

            {isProductionDb && (
              <Button onClick={handleExportImage} variant="outline" size="sm" className="h-9 px-3 border-border hover:bg-muted bg-muted/50 text-xs font-semibold cursor-pointer" title="Export SVG">
                <Download className="w-3.5 h-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Export SVG</span>
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
      <div ref={canvasRef} className="flex-1">
        <ReactFlow
          nodes={pendingDiff ? diffNodesWithMode : styledNodes}
          edges={pendingDiff ? pendingDiff.diffEdges : styledEdges}
          onNodesChange={handleNodesChangeLocal}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnectStart={() => { if (isProductionDb) setIsReconnecting(true); }}
          onReconnectEnd={() => setIsReconnecting(false)}
          onReconnect={(oldEdge, connection) => {
            if (pendingDiff) return;
            if (!connection.sourceHandle || !connection.targetHandle) return;
            if (isProductionDb) {
              if (!keepsDbRelation(oldEdge, connection)) {
                toast.info('Only the connector position can be changed');
                return;
              }
              const nextEdges = reconnectEdge(oldEdge, connection, edges);
              setEdges(nextEdges);
              onEdgeReconnect?.(nextEdges);
              return;
            }
            if (isReadOnly) return;
            const erdIndexes = buildErdIndexes(nodes, edges);
            const sourceNode = erdIndexes.nodesById.get(connection.source);
            const targetNode = erdIndexes.nodesById.get(connection.target);
            if (sourceNode && targetNode) {
              const srcId = String(connection.sourceHandle).replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
              const tgtId = String(connection.targetHandle).replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
              const srcCol = erdIndexes.columnsByNodeAndId.get(erdColumnKey(sourceNode.id, srcId));
              const tgtCol = erdIndexes.columnsByNodeAndId.get(erdColumnKey(targetNode.id, tgtId));
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

                  const newKey = `${[connection.source, connection.target].sort().join(':')}:${[srcColId, tgtColId].sort().join(':')}`;
                  const isDuplicateById = erdIndexes.edgesByRelationKey.get(newKey)?.some(edge => edge.id !== oldEdge.id) ?? false;
                  const relationNameKey = cSrcNameKey && cTgtNameKey
                    ? [cSrcNameKey, cTgtNameKey].sort().join('::')
                    : null;
                  const isDuplicateByName = relationNameKey
                    ? erdIndexes.edgesByRelationName.get(relationNameKey)?.some(edge => edge.id !== oldEdge.id) ?? false
                    : false;
                  const isDuplicate = isDuplicateById || isDuplicateByName;

                  if (isDuplicate) {
                    toast.info('Relation already exists');
                    return;
                  }
                }
              }

              // ─── FK already related check ──────────────────────────
              if (extractColumnIdFromHandle && srcCol?.name) {
                const conflictingEdge = erdIndexes.edgesBySourceColumnName
                  .get(erdSourceColumnKey(sourceNode.data.name, srcCol.name))
                  ?.find(edge => edge.id !== oldEdge.id);
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
          onMove={handleMoveLocal}
          colorMode={resolvedTheme}
          onlyRenderVisibleElements={true}
          // Production DB ERD stays read-only for schema edits, but table positions are editable.
          nodesDraggable={!pendingDiff && (!isReadOnly || isProductionDb)}
          nodesConnectable={!pendingDiff && (!isReadOnly || (isProductionDb && isReconnecting))}
          elementsSelectable={!pendingDiff && (!isReadOnly || isProductionDb)}
          edgesReconnectable={!pendingDiff && (!isReadOnly || isProductionDb)}
          onNodeDragStop={onNodeDragStop}
          onMoveEnd={onMoveEnd}
          minZoom={0.1}
          maxZoom={2.5}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionLineStyle={defaultEdgeOptions.style}
          deleteKeyCode={null}
        >

          <Background variant={BackgroundVariant.Lines} gap={50} size={1} color={bgColor} />
          <Controls position="bottom-left" showInteractive={false} />
        </ReactFlow>
      </div>

      {pendingDiff && <SchemaDiffOverlay
        diff={pendingDiff.diffResult}
        approvedIds={approvedChangeIds}
        showChecklist={showChecklist}
        label={pendingDiff.source === 'history' ? `Version ${pendingDiff.version} Preview`
          : pendingDiff.source === 'repository-compare' ? `Git Comparison · ${pendingDiff.sourceLabel}`
            : pendingDiff.source === 'repository' ? `Repository Schema · ${pendingDiff.sourceLabel}`
              : undefined}
        rejectLabel={pendingDiff.source === 'proposal' ? 'Reject All' : 'Close Preview'}
        canMerge={pendingDiff.source !== 'history' && pendingDiff.source !== 'repository-compare'}
        selectable={pendingDiff.source !== 'history' && pendingDiff.source !== 'repository-compare'}
        checklistTitle={pendingDiff.source === 'history' ? 'Changes in this version:' : 'Select changes to merge:'}
        onApprovedIdsChange={setApprovedChangeIds}
        onShowChecklistChange={setShowChecklist}
        onReject={handleRejectAll}
        onMerge={handleApplyMerge}
      />}
    </div>
  );
};

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
