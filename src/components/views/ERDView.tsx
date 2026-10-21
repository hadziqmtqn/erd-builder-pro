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
  Viewport,
  MarkerType,
  Position,
  ConnectionLineType,
  useReactFlow,
  reconnectEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { MessageCircle } from 'lucide-react';

import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import EntityNode from '../diagram/EntityNode';
import { CommentMarker, ERDCommentsProvider, OPEN_COMMENT_EVENT, PrepareCommentAnchor, type CommentAnchor, type ERDCommentsConfig } from '../diagram/ERDComments';
import { SchemaDiffOverlay } from '../diagram/SchemaDiffOverlay';
import { Entity } from '@/types';
import { useAIAction } from '@/contexts/AIActionContext';
import { applyToErdContent, ErdApplyResult } from '@/components/ai/actions/erdActions';
import { toast } from 'sonner';
import { computeSchemaDiff, DiffResult } from '@/lib/schema-diff';
import { mergeSchemaChanges } from '@/lib/schema-merge';
import { useWorkspace } from '@/providers/WorkspaceContext';
import { storedHasAnchor } from '@/lib/fileComments';
import { EyeOff, Monitor } from 'lucide-react';
import { buildErdIndexes, erdColumnKey, erdSourceColumnKey } from '@/lib/erd-indexes';
import { canvasLayout, dbSchemaToCanvas, keepsDbRelation } from '@/lib/db-client-schema';
import { useDatabaseSchemaSync } from '@/hooks/useDatabaseSchemaSync';
import { styleErdEdges } from '@/lib/erd-edge-style';
import { ERD_HISTORY_PREVIEW_EVENT, type ErdHistoryPreview } from '@/lib/history-diagram';
import { ERD_REPOSITORY_APPLIED_EVENT, ERD_REPOSITORY_PREVIEW_EVENT, type RepositoryPreview } from '@/lib/repository-preview';
import { erdToDBML } from '@/lib/dbml-converter';
import { constrainDbClientChanges, constrainTableChanges, tableSize } from '@/lib/erd-geometry';
import { ERDRoutedEdge, ERDRoutingContext } from '@/components/diagram/ERDRoutedEdge';
import { ERDEdgeLabels } from '@/components/diagram/ERDEdgeLabels';
import { useSettledERDCanvasSnapshot } from '@/contexts/ERDCanvasContext';
import { sameCanvasItems } from '@/lib/erd-canvas-equality';

const nodeTypes = {
  entity: EntityNode,
};
const fitViewOptions = { padding: 0.3 };

function CommentableEdge(props: EdgeProps) {
  const offset = 16;
  const x = props.sourceX + (props.sourcePosition === Position.Right ? offset : props.sourcePosition === Position.Left ? -offset : 0);
  const y = props.sourceY + (props.sourcePosition === Position.Bottom ? offset : props.sourcePosition === Position.Top ? -offset : 0);
  return <>
    <ERDRoutedEdge {...props} />
    <EdgeLabelRenderer>
      <div className="nodrag nopan pointer-events-auto absolute" style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}>
        <CommentMarker anchor={{ type: 'relationship', id: props.id }} />
      </div>
    </EdgeLabelRenderer>
  </>;
}

const edgeTypes = { commentable: CommentableEdge, smoothstep: ERDRoutedEdge };

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
  onDatabaseSchemaApplied?: (nodes: Node<Entity>[], edges: Edge[]) => void;
  handleExportSQL: (dialect: 'postgresql' | 'mysql') => void;
  onNodeDragStop?: () => void;

  handleExportImage: () => void;
  isReadOnly?: boolean;
  isDbClient?: boolean;
  isActive?: boolean;
  sourceConnectionId?: number;

  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  takeSnapshot?: (nodes: Node<Entity>[], edges: Edge[]) => void;
  isLoading?: boolean;
  selectedNodeId?: string | null;
  onMoveEnd?: (e: any, v: any) => void;
  initialViewport?: Viewport;
  saveDiagram?: (nodes: Node<Entity>[], edges: Edge[], viewport: any, options?: { dbmlSource?: string }) => Promise<void | boolean>;
  triggerDebouncedSync?: () => void;
  pendingErdDiffTrigger?: number;
  // Exposed helpers from useERDSession for onReconnect validation
  extractColumnIdFromHandle?: (handle?: string | null) => string | null;
  getRelationKey?: (edge: Edge) => string | null;
  dedupeEdgesByRelation?: (edges: Edge[]) => Edge[];
  onEdgeReconnect?: (edges: Edge[]) => void;
  comments?: ERDCommentsConfig;
  /** Refresh button next to Jump to Table, shown for view-only Team files (DATA-004). */
  onRefresh?: () => void;
  isRefreshingDocument?: boolean;
}


import { ERDToolbar } from '@/components/diagram/ERDToolbar';
import { useEditorActive } from '@/contexts/FileSessionContext';

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
  onDatabaseSchemaApplied,
  handleExportImage,
  isReadOnly = false,
  isDbClient = false,
  isActive = true,
  sourceConnectionId,

  undo,
  redo,
  canUndo,
  canRedo,
  takeSnapshot,
  selectedNodeId,
  onNodeDragStop,
  onMoveEnd,
  initialViewport,
  isLoading,
  saveDiagram,
  triggerDebouncedSync,
  pendingErdDiffTrigger,
  extractColumnIdFromHandle,
  getRelationKey,
  dedupeEdgesByRelation,
  onEdgeReconnect,
  comments,
  onRefresh,
  isRefreshingDocument = false,
}: ERDViewProps) => {

  const { registerContentHandler, setSelectionText, setActionContextData, setRightPanelMode } = useAIAction();
  const editorActive = useEditorActive();
  const { getViewport, getNodes, getEdges, setViewport, setCenter } = useReactFlow();
  const { resolvedTheme, activeDiagram, syncDrafts, hasPendingSyncs, isLocalSaving } = useWorkspace();
  const bgColor = resolvedTheme === 'dark' ? '#222' : '#ccc';
  const isProductionDb = isDbClient;

  // The server rejects a comment anchor it has not saved yet (a table or relationship added moments ago),
  // so before a new thread starts, save the canvas and push it unless the server already has that item.
  const prepareAnchor = async (anchor: CommentAnchor) => {
    const onCanvas = (anchor.type === 'table' ? getNodes() : getEdges()) as Array<{ id: string }>;
    if (isReadOnly || isProductionDb || !saveDiagram || !onCanvas.some((item) => item.id === anchor.id)) return;
    if (storedHasAnchor(activeDiagram?.data, anchor) && !isLocalSaving && !hasPendingSyncs) return;
    await saveDiagram(getNodes() as Node<Entity>[], getEdges(), getViewport());
    await syncDrafts();
  };

  const [isReconnecting, setIsReconnecting] = useState(false);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const handleEdgeMouseEnterLocal = useCallback((_: React.MouseEvent, edge: Edge) => setHoveredEdgeId(edge.id), []);
  const handleEdgeMouseLeaveLocal = useCallback(() => setHoveredEdgeId(null), []);
  const [edgeContextMenu, setEdgeContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const edgeContextMenuAnchor = React.useMemo(() => edgeContextMenu ? {
    getBoundingClientRect: () => new DOMRect(edgeContextMenu.x, edgeContextMenu.y, 0, 0),
  } : null, [edgeContextMenu]);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const lowDetailRef = React.useRef(false);

  const handleEdgeContextMenuLocal = useCallback((event: React.MouseEvent, edge: Edge) => {
    if (!comments) return;
    event.preventDefault();
    setEdgeContextMenu({ x: event.clientX, y: event.clientY, id: edge.id });
  }, [comments]);

  const handleEdgeComment = useCallback(() => {
    if (!edgeContextMenu) return;
    window.dispatchEvent(new CustomEvent(OPEN_COMMENT_EVENT, { detail: { type: 'relationship', id: edgeContextMenu.id } }));
    setEdgeContextMenu(null);
  }, [edgeContextMenu]);

  const handleMoveLocal = useCallback((event: any, viewport: any) => {
    const lowDetail = viewport.zoom < 0.35;
    if (lowDetail !== lowDetailRef.current) {
      lowDetailRef.current = lowDetail;
      canvasRef.current?.classList.toggle('erd-canvas-low-detail', lowDetail);
    }
    onMove(event, viewport);
  }, [onMove]);

  const handleDiscussionAnchorSelected = useCallback((type: "general" | "table" | "relationship", id: string | null) => {
    if (!id || type === "general") return;
    const currentNodes = getNodes() as Node<Entity>[];
    const centerOf = (node: Node<Entity>) => ({
      x: node.position.x + (node.measured?.width ?? node.width ?? 180) / 2,
      y: node.position.y + (node.measured?.height ?? node.height ?? 120) / 2,
    });
    if (type === "table") {
      const node = currentNodes.find((item) => item.id === id);
      if (node) {
        const center = centerOf(node);
        void setCenter(center.x, center.y, { zoom: getViewport().zoom, duration: 0 });
      }
      return;
    }
    const edge = (getEdges() as Edge[]).find((item) => item.id === id);
    if (!edge) return;
    const source = currentNodes.find((node) => node.id === edge.source);
    const target = currentNodes.find((node) => node.id === edge.target);
    if (!source || !target) return;
    const from = centerOf(source);
    const to = centerOf(target);
    void setCenter((from.x + to.x) / 2, (from.y + to.y) / 2, { zoom: getViewport().zoom, duration: 0 });
  }, [getEdges, getNodes, getViewport, setCenter]);

  React.useEffect(() => {
    const onDiscussionAnchorSelected = (event: Event) => {
      const detail = (event as CustomEvent<{ fileId?: string; type?: "general" | "table" | "relationship"; id?: string | null }>).detail;
      if (detail?.fileId ? String(activeDiagram?.uid ?? activeDiagram?.id) !== detail.fileId : !editorActive()) return;
      if (!detail?.type) return;
      handleDiscussionAnchorSelected(detail.type, detail.id ?? null);
    };
    window.addEventListener('erd-discussion-anchor-selected', onDiscussionAnchorSelected);
    return () => window.removeEventListener('erd-discussion-anchor-selected', onDiscussionAnchorSelected);
  }, [handleDiscussionAnchorSelected, activeDiagram?.uid, activeDiagram?.id]);

  const saveCanvasAfterNodeDrag = useCallback(() => {
    if (!saveDiagram) return;
    const currentNodes = getNodes() as Node<Entity>[];
    if (currentNodes.length === 0) return;

    void saveDiagram(currentNodes, getEdges(), getViewport())
      .then(() => triggerDebouncedSync?.())
      .catch(error => console.error('Error saving ERD after node drag:', error));
  }, [getEdges, getNodes, getViewport, saveDiagram, triggerDebouncedSync]);

  const handleNodeDragStopLocal = useCallback(() => {
    onNodeDragStop?.();
    if (!saveDiagram) return;

    // React Flow applies the final position before the next paint. Saving on
    // that frame keeps the node positions and viewport from different renders.
    requestAnimationFrame(saveCanvasAfterNodeDrag);
  }, [onNodeDragStop, saveCanvasAfterNodeDrag, saveDiagram]);

  React.useEffect(() => {
    if (isLoading || !initialViewport) return;
    const frame = requestAnimationFrame(() => {
      void setViewport(initialViewport, { duration: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [initialViewport, isLoading, setViewport]);


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
    source: 'proposal' | 'history' | 'repository' | 'repository-compare' | 'database';
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

  const hasComments = Boolean(comments);
  const styledEdges = React.useMemo(() => styleErdEdges(edges, allSelectedIds, hoveredEdgeId).map(edge => hasComments ? { ...edge, type: 'commentable' } : edge), [edges, allSelectedIds, hasComments, hoveredEdgeId]);
  const styledDiffEdges = React.useMemo(
    () => pendingDiff ? styleErdEdges(pendingDiff.diffEdges) : [],
    [pendingDiff],
  );

  // Filter out selection-only changes to avoid unnecessary re-renders from React Flow
  const handleNodesChangeLocal = useCallback(
    (changes: any[]) => {
      const dataChanges = changes.filter((change: any) => change.type !== 'select');
      if (dataChanges.length === 0) return;
      const safeChanges = isProductionDb ? constrainDbClientChanges(dataChanges, nodesRef.current)
        : isReadOnly ? dataChanges : constrainTableChanges(dataChanges, nodesRef.current);
      onNodesChange(safeChanges);
      if (safeChanges !== dataChanges && dataChanges.some(change => change.type === 'dimensions')) {
        requestAnimationFrame(() => { onNodeDragStop?.(); saveCanvasAfterNodeDrag(); });
      }
    },
    [onNodesChange, isReadOnly, isProductionDb, onNodeDragStop, saveCanvasAfterNodeDrag],
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
    if (!isActive) { setSelectionText(null); return; }
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
  }, [allSelectedIds, setSelectionText, isActive]);

  React.useEffect(() => {
    if (!isActive) return;
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
  }, [selectedNodeId, allSelectedIds, setActionContextData, isActive]);
  const takeSnapshotRef = React.useRef(takeSnapshot);
  takeSnapshotRef.current = takeSnapshot;
  const handleNodeDragStartLocal = useCallback(() => {
    takeSnapshotRef.current?.(nodesRef.current, edgesRef.current);
  }, []);

  // Stable reconnect handlers: React Flow passes these to every edge, so inline functions re-rendered all edges on each drag frame.
  const handleReconnectStart = useCallback(() => { if (isProductionDb) setIsReconnecting(true); }, [isProductionDb]);
  const handleReconnectEnd = useCallback(() => setIsReconnecting(false), []);
  const handleReconnect = useCallback((oldEdge: Edge, connection: Connection) => {
    if (pendingDiff) return;
    if (!connection.sourceHandle || !connection.targetHandle) return;
    if (isProductionDb) {
      if (!keepsDbRelation(oldEdge, connection)) {
        toast.info('Only the connector position can be changed');
        return;
      }
      const nextEdges = reconnectEdge(oldEdge, connection, edgesRef.current);
      setEdges(nextEdges);
      onEdgeReconnect?.(nextEdges);
      return;
    }
    if (isReadOnly) return;
    const erdIndexes = buildErdIndexes(nodesRef.current, edgesRef.current);
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
    takeSnapshotRef.current?.(nodesRef.current, edgesRef.current);
    const newEds = reconnectEdge(oldEdge, connection, edgesRef.current);
    const deduped = dedupeEdgesByRelation ? dedupeEdgesByRelation(newEds) : newEds;
    setEdges(deduped);
  }, [pendingDiff, isProductionDb, isReadOnly, setEdges, onEdgeReconnect, extractColumnIdFromHandle, getRelationKey, dedupeEdgesByRelation]);

  // ─── Visual Schema Diffing Callbacks ────────────────
  const startDiff = useCallback((origNodes: Node<Entity>[], origEdges: Edge[], propNodes: Node<Entity>[], propEdges: Edge[], options: { source?: 'proposal' | 'history' | 'repository' | 'repository-compare' | 'database'; version?: number; sourceLabel?: string; commit?: string; dbmlSource?: string } = {}) => {
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
      if (isProductionDb) return;
      if (!editorActive()) return;
      const preview = (event as CustomEvent<ErdHistoryPreview | undefined>).detail;
      if (!preview) {
        setPendingDiff(current => current?.source === 'history' ? null : current);
        return;
      }
      startDiff(nodesRef.current, edgesRef.current, preview.nodes, preview.edges, { source: 'history', version: preview.version });
    };
    window.addEventListener(ERD_HISTORY_PREVIEW_EVENT, previewHistory);
    return () => window.removeEventListener(ERD_HISTORY_PREVIEW_EVENT, previewHistory);
  }, [startDiff, isProductionDb]);

  React.useEffect(() => {
    const previewRepository = (event: Event) => {
      if (isProductionDb) return;
      if (!editorActive()) return;
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
  }, [startDiff, isProductionDb]);
  const { sync: handleSync, isSyncing } = useDatabaseSchemaSync(isActive ? sourceConnectionId : undefined, data => {
    const canvas = dbSchemaToCanvas(data.schema, canvasLayout(nodesRef.current, getViewport(), {}, edgesRef.current));
    startDiff(nodesRef.current, edgesRef.current, canvas.nodes, canvas.edges, { source: 'database' });
  });

  const handleRejectAll = useCallback(() => {
    setPendingDiff(null);
    if (pendingDiff?.source === 'history') {
      setRightPanelMode('closed');
      toast.info('Version preview closed');
    } else if (pendingDiff?.source.startsWith('repository')) {
      toast.info('Repository preview closed');
    } else {
      toast.info(pendingDiff?.source === 'database' ? 'Database schema preview closed' : 'AI schema update rejected');
    }
  }, [pendingDiff?.source, setRightPanelMode]);

  const handleApplyMerge = useCallback(() => {
    if (!pendingDiff) return;
    if (isReadOnly && !(isProductionDb && pendingDiff.source === 'database')) return;

    const { originalNodes, originalEdges, proposedNodes, proposedEdges, diffResult } = pendingDiff;
    const { nodes: finalNodes, edges: finalEdges } = mergeSchemaChanges(
      originalNodes, originalEdges, proposedNodes, proposedEdges, diffResult, approvedChangeIds,
    );

    takeSnapshotRef.current?.(nodesRef.current, edgesRef.current);
    setNodes(finalNodes);
    setEdges(finalEdges);
    setPendingDiff(null);
    if (pendingDiff.source === 'database') onDatabaseSchemaApplied?.(finalNodes, finalEdges);
    toast.success(pendingDiff.source === 'database' ? 'Database schema view updated' : pendingDiff.source === 'repository' ? 'Repository schema merged successfully' : 'AI changes merged successfully!');
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
  }, [pendingDiff, approvedChangeIds, setNodes, setEdges, saveDiagram, triggerDebouncedSync, getViewport, isReadOnly, isProductionDb, onDatabaseSchemaApplied]);

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
    if (isReadOnly || isProductionDb) return;
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
  }, [registerContentHandler, startDiff, isReadOnly, isProductionDb]);

  React.useEffect(() => {
    if (isReadOnly || isProductionDb) return;
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
  }, [setNodes, setEdges, startDiff, saveDiagram, triggerDebouncedSync, isReadOnly, isProductionDb]);

  // ─── Handle pending UPDATE schema ──
  // Unlike create, update waits for server data to load first (nodes.length > 0),
  // then shows the diff/merge UI so the user can selectively merge changes.
  // pendingErdDiffTrigger allows re-processing when already on the same page.
  React.useEffect(() => {
    if (isReadOnly || isProductionDb) return;
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
  }, [nodes, startDiff, pendingErdDiffTrigger, isReadOnly, isProductionDb]);

  const content = (
    <div className="flex-1 relative flex flex-col overflow-hidden border rounded-xl bg-muted/20" style={{ contain: 'paint layout' }}>
      <PrepareCommentAnchor prepare={prepareAnchor} />

      {isReadOnly && isProductionDb && (
        <div className="absolute bottom-4 inset-x-0 z-20 flex justify-center pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg pointer-events-auto text-sm text-amber-700 dark:text-amber-400 shadow-lg">
            <EyeOff className="h-4 w-4 shrink-0" />
            <span>Schema is read-only. Layout changes do not modify the database.</span>
          </div>
        </div>
      )}

      {!pendingDiff && <ERDToolbar
        nodes={nodes} isReadOnly={isReadOnly} isProductionDb={isProductionDb}
        addEntity={addEntity} onImportSQL={onImportSQL} onAutoLayout={onAutoLayout}
        onRefresh={onRefresh} isRefreshingDocument={isRefreshingDocument}
        setRightPanelMode={setRightPanelMode} handleSync={handleSync} isSyncing={isSyncing}
        handleExportImage={handleExportImage} undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo}
      />}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-[1px] transition-opacity duration-150">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}
      <div ref={canvasRef} className="flex-1">
        <ReactFlow
          id={isProductionDb ? `db-client-${sourceConnectionId}` : activeDiagram?.uid ? `erd-${activeDiagram.uid}` : undefined}
          nodes={pendingDiff ? diffNodesWithMode : styledNodes}
          edges={pendingDiff ? styledDiffEdges : styledEdges}
          onNodesChange={handleNodesChangeLocal}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnectStart={handleReconnectStart}
          onReconnectEnd={handleReconnectEnd}
          onReconnect={handleReconnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={handleNodeClickLocal}
          onNodeDoubleClick={onNodeDoubleClick}
          onEdgeClick={onEdgeClick}
          onEdgeMouseEnter={handleEdgeMouseEnterLocal}
          onEdgeMouseLeave={handleEdgeMouseLeaveLocal}
          onEdgeContextMenu={comments && !pendingDiff ? handleEdgeContextMenuLocal : undefined}
          onPaneClick={handlePaneClickLocal}
          onMove={handleMoveLocal}
          colorMode={resolvedTheme}
          onlyRenderVisibleElements={true}
          // Production DB ERD stays read-only for schema edits, but table positions are editable.
          nodesDraggable={!pendingDiff && (!isReadOnly || isProductionDb)}
          nodesConnectable={!pendingDiff && (!isReadOnly || (isProductionDb && isReconnecting))}
          elementsSelectable={!pendingDiff && (!isReadOnly || isProductionDb)}
          edgesReconnectable={!pendingDiff && (!isReadOnly || isProductionDb)}
          onNodeDragStart={handleNodeDragStartLocal}
          onNodeDragStop={handleNodeDragStopLocal}
          onMoveEnd={onMoveEnd}
          minZoom={0.1}
          maxZoom={2.5}
          defaultEdgeOptions={defaultEdgeOptions}
          defaultViewport={initialViewport}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionLineStyle={defaultEdgeOptions.style}
          deleteKeyCode={null}
        >

          <Background variant={BackgroundVariant.Lines} gap={50} size={1} color={bgColor} />
          <Controls position="bottom-left" showInteractive={false} fitViewOptions={fitViewOptions} />
        </ReactFlow>
      </div>

      {edgeContextMenu && (
        <ContextMenu open onOpenChange={(next) => { if (!next) setEdgeContextMenu(null); }}>
          <ContextMenuTrigger
            className="fixed size-px opacity-0"
            style={{ left: edgeContextMenu.x, top: edgeContextMenu.y }}
            onContextMenu={(event) => event.preventDefault()}
          />
          <ContextMenuContent anchor={edgeContextMenuAnchor}>
            <ContextMenuItem onClick={handleEdgeComment}>
              <MessageCircle aria-hidden="true" />
              Comment
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}

      {pendingDiff && <SchemaDiffOverlay
        diff={pendingDiff.diffResult}
        approvedIds={approvedChangeIds}
        showChecklist={showChecklist}
        label={pendingDiff.source === 'history' ? `Version ${pendingDiff.version} Preview`
          : pendingDiff.source === 'repository-compare' ? `Git Comparison · ${pendingDiff.sourceLabel}`
            : pendingDiff.source === 'repository' ? `Repository Schema · ${pendingDiff.sourceLabel}`
              : undefined}
        rejectLabel={pendingDiff.source === 'proposal' ? 'Reject All' : 'Close Preview'}
        canMerge={(!isReadOnly || (isProductionDb && pendingDiff.source === 'database')) && pendingDiff.source !== 'history' && pendingDiff.source !== 'repository-compare'}
        selectable={(!isReadOnly || (isProductionDb && pendingDiff.source === 'database')) && pendingDiff.source !== 'history' && pendingDiff.source !== 'repository-compare'}
        checklistTitle={pendingDiff.source === 'history' ? 'Changes in this version:' : 'Select changes to merge:'}
        onApprovedIdsChange={setApprovedChangeIds}
        onShowChecklistChange={setShowChecklist}
        onReject={handleRejectAll}
        onMerge={handleApplyMerge}
      />}
    </div>
  );
  const routingNodes = pendingDiff ? diffNodesWithMode : nodes;
  const settledCanvas = useSettledERDCanvasSnapshot(React.useMemo(() => ({ nodes: routingNodes, edges }), [routingNodes, edges]));
  const obstacles = React.useMemo(() => settledCanvas.nodes.map(node => ({ id: node.id, ...node.position, ...tableSize(node) })), [settledCanvas.nodes]);
  const activeEdgeId = hoveredEdgeId ?? edges.find(edge => edge.selected)?.id ?? null;
  const routedContent = <ERDRoutingContext.Provider value={obstacles}>
    <ERDEdgeLabels nodes={settledCanvas.nodes} edges={pendingDiff ? styledDiffEdges : settledCanvas.edges} tables={obstacles} activeId={activeEdgeId}>
      {content}
    </ERDEdgeLabels>
  </ERDRoutingContext.Provider>;
  return comments ? <ERDCommentsProvider config={comments}>{routedContent}</ERDCommentsProvider> : routedContent;
};

// Custom comparator: skip function props to prevent unnecessary re-renders
// from App.tsx's inline callbacks (save/sync cycle triggers re-render but
// shouldn't cause ReactFlow to re-initialize)
export const ERDView = React.memo(ERDViewComponent, (prev, next) => {
  // If we already have nodes, don't re-render just because isLoading flickers
  const loadingFlickered = prev.isLoading !== next.isLoading;
  const hasData = next.nodes.length > 0;
  const wasEmptyBefore = prev.nodes.length === 0;
  const shouldIgnoreLoading = loadingFlickered && hasData && !wasEmptyBefore;
  const sameViewport = prev.initialViewport?.x === next.initialViewport?.x &&
    prev.initialViewport?.y === next.initialViewport?.y &&
    prev.initialViewport?.zoom === next.initialViewport?.zoom;

  return (
    sameCanvasItems(prev.nodes, next.nodes) &&
    sameCanvasItems(prev.edges, next.edges) &&
    (shouldIgnoreLoading || prev.isLoading === next.isLoading) &&
    prev.isReadOnly === next.isReadOnly &&
    prev.isDbClient === next.isDbClient && prev.sourceConnectionId === next.sourceConnectionId &&
    prev.isActive === next.isActive &&
    prev.onAutoLayout === next.onAutoLayout && prev.onDatabaseSchemaApplied === next.onDatabaseSchemaApplied &&
    prev.onRefresh === next.onRefresh && prev.isRefreshingDocument === next.isRefreshingDocument &&
    prev.comments?.projectId === next.comments?.projectId && prev.comments?.teamId === next.comments?.teamId && prev.comments?.fileId === next.comments?.fileId && prev.comments?.userId === next.comments?.userId &&
    sameViewport &&
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
