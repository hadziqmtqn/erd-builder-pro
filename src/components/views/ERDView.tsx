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
import { Plus, Undo2, Redo2, Image as Upload } from 'lucide-react';

import { Button } from "@/components/ui/button";
import EntityNode from '../EntityNode';
import { Entity } from '@/types';
import { useAIAction } from '@/contexts/AIActionContext';
import { applyToErdContent } from '@/components/ai/actions';
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
  openImportModal: () => void;
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
  openImportModal,
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

  const allSelectedNodes = React.useMemo(() => {
    return allSelectedIds
      .map(id => nodes.find(n => n.id === id))
      .filter((n): n is Node<Entity> => !!n);
  }, [allSelectedIds, nodes]);

  const styledNodes = React.useMemo(() => {
    return nodes.map(node => ({
      ...node,
      selected: allSelectedIds.includes(node.id),
    }));
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
      
      if (allSelectedIds.length > 0 && isConnectedToSelected) {
        return {
          ...baseEdge,
          className: `${edge.className || ''} edge-animated-active`,
        };
      }
      return baseEdge;
    });
  }, [edges, allSelectedIds]);

  // ─── Send selected tables context to AI ──────────────
  React.useEffect(() => {
    if (allSelectedNodes.length > 0) {
      const tableDetails = allSelectedNodes.map(n => {
        const name = n.data.name || n.data.label || n.id;
        const cols = (n.data.columns || []).map((c: any) => `${c.name}: ${c.type}${c.is_pk ? ' PK' : ''}${c.is_nullable ? ' NULL' : ''}`);
        return `${name} (${cols.join(', ')})`;
      }).join('; ');
      setSelectionText(`Tables: ${tableDetails}`);
    } else {
      setSelectionText(null);
    }
  }, [allSelectedNodes, setSelectionText]);

  React.useEffect(() => {
    const primaryNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) ?? null : null;
    setActionContextData({ nodes, edges, selectedNode: primaryNode, multiSelectedNodes: allSelectedNodes });
  }, [nodes, edges, selectedNodeId, allSelectedNodes, setActionContextData]);

  // ─── Refs for callback stability ──────────────────────
  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  const selectedNodeIdRef = React.useRef(selectedNodeId);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  selectedNodeIdRef.current = selectedNodeId;
  const takeSnapshotRef = React.useRef(takeSnapshot);
  takeSnapshotRef.current = takeSnapshot;

  // ─── AI Content Handler: apply AI responses back to ERD diagram ──
  React.useEffect(() => {
    const unregister = registerContentHandler((content: string, _strategy: 'replace' | 'append', actionId?: string) => {
      const result = applyToErdContent(nodesRef.current, edgesRef.current, actionId || 'erd-edit-column', content, {
        selectedNodeId: selectedNodeIdRef.current,
      });
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
            
            <Button onClick={openImportModal} variant="outline" size="sm" className="h-9 px-3 sm:px-4 font-bold text-muted-foreground border-border/50 hover:bg-muted/50">
              <Upload className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Import SQL</span>
            </Button>

            <div className="w-px h-6 bg-border mx-0.5" />

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
          onNodesChange={onNodesChange}
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
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: false,
            markerEnd: {
              type: MarkerType.Arrow,
              width: 15,
              height: 15,
            },
          }}
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
export const ERDView = React.memo(ERDViewComponent, (prev, next) => {
  // Optimization: If we already have nodes, don't re-render just because isLoading flickers
  // (e.g. during a background sync). This prevents the ReactFlow canvas from "blinking".
  // NOTE: When switching diagrams (prev.nodes was empty / fresh load), we MUST allow the
  // isLoading→false transition to render — otherwise spinner never disappears (#2).
  const loadingFlickered = prev.isLoading !== next.isLoading;
  const hasData = next.nodes.length > 0;
  const wasEmptyBefore = prev.nodes.length === 0;
  const shouldIgnoreLoading = loadingFlickered && hasData && !wasEmptyBefore;

  // Structural check for nodes and edges to handle reference changes during sync
  const nodesChanged = prev.nodes !== next.nodes && (
    prev.nodes.length !== next.nodes.length ||
    JSON.stringify(prev.nodes.map(n => ({ id: n.id, data: n.data, pos: n.position }))) !== 
    JSON.stringify(next.nodes.map(n => ({ id: n.id, data: n.data, pos: n.position })))
  );

  const edgesChanged = prev.edges !== next.edges && (
    prev.edges.length !== next.edges.length ||
    JSON.stringify(prev.edges) !== JSON.stringify(next.edges)
  );

  return (
    !nodesChanged &&
    !edgesChanged &&
    (shouldIgnoreLoading || prev.isLoading === next.isLoading) &&
    prev.isReadOnly === next.isReadOnly &&
    prev.selectedNodeId === next.selectedNodeId &&
    prev.canUndo === next.canUndo &&
    prev.canRedo === next.canRedo
  );
});

