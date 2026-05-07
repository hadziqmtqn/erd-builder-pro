import React from 'react';
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
import { Plus, Download, ChevronDown, Database, Undo2, Redo2, Image as ImageIcon, FileCode, Upload, FileText, Loader2 } from 'lucide-react';

import { Button } from "@/components/ui/button";
import EntityNode from '../EntityNode';
import { Entity } from '@/types';

const nodeTypes = {
  entity: EntityNode,
};

interface ERDViewProps {
  nodes: Node<Entity>[];
  edges: Edge[];
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
  handleExportSQL,

  handleExportPDF,
  handleExportImage,
  isReadOnly = false,

  undo,
  redo,
  canUndo,
  canRedo,
  takeSnapshot,
  isLoading = false,
  selectedNodeId,
  onNodeDragStop,
  onMoveEnd
}: ERDViewProps) => {
  const showLoadingOverlay = isLoading && nodes.length === 0;

  const styledEdges = React.useMemo(() => {
    return edges.map(edge => {
      const baseEdge = {
        ...edge,
        type: 'smoothstep', // Force curved bezier style
        markerEnd: {
          type: MarkerType.Arrow,
          width: 15,
          height: 15,
        },
      };
      
      if (selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId)) {
        return {
          ...baseEdge,
          className: `${edge.className || ''} edge-animated-active`,
        };
      }
      return baseEdge;
    });
  }, [edges, selectedNodeId]);

  return (
    <div className="flex-1 relative flex flex-col overflow-hidden border rounded-xl bg-muted/20" style={{ contain: 'paint layout' }}>
      {/* Loading overlay - keeps ReactFlow mounted underneath */}
      {showLoadingOverlay && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-muted/10 backdrop-blur-[1px]">
          <Loader2 className="w-10 h-10 text-primary animate-spin opacity-60" />
          <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading diagram...</p>
        </div>
      )}

      {!isReadOnly && (
        <div className="absolute top-6 inset-x-0 z-10 flex justify-center pointer-events-none">
          <div className="flex items-center gap-1.5 p-1.5 bg-background/95 backdrop-blur-md border border-border/50 rounded-2xl shadow-2xl pointer-events-auto max-w-[95vw] overflow-x-auto no-scrollbar">
            <JumpToNode nodes={nodes} />
            
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
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={styledEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
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
  const loadingFlickered = prev.isLoading !== next.isLoading;
  const hasData = next.nodes.length > 0;
  const shouldIgnoreLoading = loadingFlickered && hasData;

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

