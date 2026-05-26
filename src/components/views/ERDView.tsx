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
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Undo2, Redo2 } from 'lucide-react';

import { Button } from "@/components/ui/button";
import EntityNode from '../EntityNode';
import { Entity } from '@/types';
import { useAIAction } from '@/contexts/AIActionContext';
import { applyToErdContent, ErdApplyResult } from '@/components/ai/actions/erdActions';
import { toast } from 'sonner';

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
  handleExportSQL: (dialect: 'postgresql' | 'mysql') => void;
  onNodeDragStop?: () => void;

  handleExportPDF: () => void;
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
}: ERDViewProps) => {

  const { registerContentHandler, setSelectionText, setActionContextData } = useAIAction();

  // ─── Multi-table selection ───────────────────────────
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);

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

  const styledEdges = React.useMemo(() => {
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

      const isConnectedToSelected = allSelectedIds.some(
        id => edge.source === id || edge.target === id
      );
      
      const shouldAnimate = isConnectedToSelected && allSelectedIds.length > 0;
      const newClassName = shouldAnimate
        ? `${edge.className || ''} edge-animated-active`.trim()
        : (edge.className || '');
      // Avoid creating a new object when className hasn't changed
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
        const cols = (n.data.columns || []).map((c: any) => `${c.name}: ${c.type}${c.is_pk ? ' PK' : ''}${c.is_nullable ? ' NULL' : ''}`);
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

  const defaultEdgeOptions = React.useMemo(() => ({
    type: 'smoothstep' as const,
    animated: false,
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

      if (actionId) {
        result = applyToErdContent(nodesRef.current, edgesRef.current, actionId, content, extra);
      } else {
        // Manual chat: try SQL DDL first, then column mutations
        result = applyToErdContent(nodesRef.current, edgesRef.current, 'erd-generate-sql', content, extra);
        if (!result) {
          result = applyToErdContent(nodesRef.current, edgesRef.current, 'erd-edit-column', content, extra);
        }
      }

      if (result) {
        takeSnapshotRef.current?.(nodesRef.current, edgesRef.current);
        setNodes(result.nodes);
        setEdges(result.edges);
        toast.success('Applied to diagram');
      } else {
        toast.error('No valid changes found in response');
      }
    }, ['append']);
    return unregister;
  }, [registerContentHandler, setNodes, setEdges]);

  React.useEffect(() => {
    const pendingDdl = localStorage.getItem('pending_create_erd_ddl');
    if (pendingDdl) {
      localStorage.removeItem('pending_create_erd_ddl');
      const result = applyToErdContent([], [], 'erd-generate-sql', pendingDdl);
      if (result) {
        takeSnapshotRef.current?.([], []);
        setNodes(result.nodes);
        setEdges(result.edges);
        toast.success('Applied generated architecture DDL to new diagram');
      }
    }
  }, [setNodes, setEdges]);

  return (
    <div className="flex-1 relative flex flex-col overflow-hidden border rounded-xl bg-muted/20" style={{ contain: 'paint layout' }}>


      {!isReadOnly && (
        <div className="absolute top-6 inset-x-0 z-10 flex justify-center pointer-events-none">
          <div className="flex items-center gap-1.5 p-1.5 bg-background/95 backdrop-blur-md border border-border/50 rounded-2xl shadow-2xl pointer-events-auto max-w-[95vw] overflow-x-auto no-scrollbar">
            <JumpToNode nodes={nodes} label="Table" />
            
            <div className="w-px h-6 bg-border mx-0.5" />
            
            <Button onClick={addEntity} size="sm" className="h-9 px-3 sm:px-4 font-bold shadow-lg shadow-primary/20 cursor-pointer">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Add Table</span>
            </Button>

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
          nodes={styledNodes}
          edges={styledEdges}
          onNodesChange={handleNodesChangeLocal}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClickLocal}
          onNodeDoubleClick={onNodeDoubleClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={handlePaneClickLocal}
          onMove={onMove}
          colorMode="dark"
          onlyRenderVisibleElements={true}
          nodesDraggable={!isReadOnly}
          nodesConnectable={!isReadOnly}
          elementsSelectable={!isReadOnly}
          onNodeDragStop={onNodeDragStop}
          onMoveEnd={onMoveEnd}
          minZoom={0.1}
          maxZoom={2.5}
          defaultEdgeOptions={defaultEdgeOptions}
        >

          <Background variant={BackgroundVariant.Lines} gap={50} size={1} color="#222" />
          <Controls position="bottom-left" showInteractive={false} />
        </ReactFlow>
      </div>
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
            ca2.sort_order !== cb2.sort_order || ca2.is_pk !== cb2.is_pk || ca2.is_nullable !== cb2.is_nullable) return false;
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
    prev.onMoveEnd === next.onMoveEnd
  );
});

