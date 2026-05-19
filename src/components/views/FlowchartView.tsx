import React, { useCallback, useState, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';

import FlowchartNode, { FlowchartNodeData } from '../FlowchartNode';
import { initialNodes, initialEdges } from '../flowchart/flowchartConstants';
import { Flowchart } from '@/types';
import { AddSymbolModal } from '../flowchart/AddSymbolModal';
import { SymbolPropertiesModal } from '../flowchart/SymbolPropertiesModal';
import { ConnectorPropertiesModal } from '../flowchart/ConnectorPropertiesModal';
import { JumpToNode } from '../JumpToNode';
import { useAIAction } from '@/contexts/AIActionContext';
import { applyToFlowchartContent } from '@/components/ai/actions/flowchartActions';

const nodeTypes = {
  custom: FlowchartNode,
};

interface FlowchartViewProps {
  activeFlowchartId: number | string | null;
  activeFlowchart: Flowchart;
  handleFlowchartChange: (nodes: any[], edges: any[]) => void;
  isReadOnly?: boolean;
  isLoading?: boolean;
}

export const FlowchartView = React.memo(({ 
  activeFlowchartId, 
  activeFlowchart, 
  handleFlowchartChange, 
  isReadOnly = false,
  isLoading = false 
}: FlowchartViewProps) => {
  // ── Hooks FIRST (before any conditional return — Rule of Hooks) ──
  const { registerContentHandler, setActionContextData } = useAIAction();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowchartNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [isAddingNode, setIsAddingNode] = useState(false);
  const [newNodeData, setNewNodeData] = useState<FlowchartNodeData>({
    label: 'New Symbol',
    shape: 'rectangle',
    color: '#8b5cf6',
  });
  const initialLoadRef = React.useRef(true);
  const isParsingFromDataRef = React.useRef(false);
  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const parseFlowchartData = (raw: any) => {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  // ── Derived (guaranteed stable number of hooks) ──
  const showLoader = isLoading && (!activeFlowchart || !activeFlowchart.data);

  // Initialize from db or use defaults
  // Depend on activeFlowchain.data instead of just id,
  // because data arrives async after selectFlowchart completes
  useEffect(() => {
    isParsingFromDataRef.current = true;
    initialLoadRef.current = true;
    try {
      const parsed = parseFlowchartData(activeFlowchart.data) || { nodes: [], edges: [] };
      const nodesData = (parsed.nodes && parsed.nodes.length > 0) ? parsed.nodes : initialNodes;
      const edgesData = (parsed.edges && parsed.edges.length > 0) ? parsed.edges : initialEdges;
      
      setNodes(nodesData);
      setEdges(edgesData);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    } catch {
      setNodes(initialNodes);
      setEdges(initialEdges);
    }

    // Reset flag setelah render cycle selesai — ini biar auto-save trigger
    // effect bisa detek bahwa perubahan nodes/edges berasal dari parsing data,
    // bukan dari user edit.
    const timer = setTimeout(() => {
      isParsingFromDataRef.current = false;
      initialLoadRef.current = false;
    }, 2000);
    return () => {
      clearTimeout(timer);
      isParsingFromDataRef.current = false;
    };
  }, [activeFlowchartId, activeFlowchart.data]); // ← re-run when data loads asynchronously

  const handleFlowchartChangeRef = React.useRef(handleFlowchartChange);
  useEffect(() => {
    handleFlowchartChangeRef.current = handleFlowchartChange;
  }, [handleFlowchartChange]);

  // Trigger autosave internally when local state changes (skip initial load & data parsing)
  useEffect(() => {
    if (initialLoadRef.current || isParsingFromDataRef.current) {
      return;
    }
    if (nodes.length > 0 || edges.length > 0) {
      handleFlowchartChangeRef.current(nodes, edges);
    }
  }, [nodes, edges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({
      ...params,
      type: 'smoothstep',
      style: { stroke: '#b1b1b7' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' },
      animated: false,
    } as Edge, eds)),
    [setEdges],
  );

  const confirmAddSymbol = () => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNode: Node<FlowchartNodeData> = {
      id,
      type: 'custom',
      position: { x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 100 },
      data: { ...newNodeData },
    };
    setNodes((nds) => nds.concat(newNode));
    setIsAddingNode(false);
  };

  const updateNodeData = (updates: Partial<FlowchartNodeData>) => {
    if (!selectedNodeId) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNodeId) {
          return { ...n, data: { ...n.data, ...updates } };
        }
        return n;
      })
    );
  };

  const updateEdgeData = (updates: Partial<Edge>) => {
    if (!selectedEdgeId) return;
    setEdges((eds) =>
      eds.map((e) => {
        if (e.id === selectedEdgeId) {
          return { ...e, ...updates };
        }
        return e;
      })
    );
  };

  const deleteEdge = () => {
    if (!selectedEdgeId) return;
    setEdges((eds) => eds.filter(e => e.id !== selectedEdgeId));
    setSelectedEdgeId(null);
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);

  // Derived Edge Properties
  const isDashed = selectedEdge?.animated === true || selectedEdge?.style?.strokeDasharray === '5,5';
  
  let arrowType = 'end';
  if (selectedEdge?.markerStart && selectedEdge?.markerEnd) arrowType = 'both';
  else if (selectedEdge?.markerStart && !selectedEdge?.markerEnd) arrowType = 'start';
  else if (!selectedEdge?.markerStart && !selectedEdge?.markerEnd) arrowType = 'none';

  const handleEdgeTypeChange = (val: string) => {
    if (val === 'dashed') updateEdgeData({ animated: false, style: { ...selectedEdge?.style, strokeDasharray: '5,5' } });
    else updateEdgeData({ animated: false, style: { ...selectedEdge?.style, strokeDasharray: undefined } });
  };

  const handleArrowChange = (val: string) => {
    const color = (selectedEdge?.style?.stroke as string) || '#b1b1b7';
    const marker = { type: MarkerType.ArrowClosed, color };
    
    if (val === 'none') updateEdgeData({ markerStart: undefined, markerEnd: undefined });
    else if (val === 'start') updateEdgeData({ markerStart: marker, markerEnd: undefined });
    else if (val === 'end') updateEdgeData({ markerStart: undefined, markerEnd: marker });
    else if (val === 'both') updateEdgeData({ markerStart: marker, markerEnd: marker });
  };

  const handleEdgeLabelChange = (val: string) => {
    if (val.trim() === '') {
      updateEdgeData({ label: undefined });
    } else {
      updateEdgeData({ 
        label: val, 
        labelBgStyle: { fill: '#1e1e24' }, 
        labelStyle: { fill: '#fff' } 
      });
    }
  };

  const memoizedNodes = useMemo(() => nodes.map((n) => ({ ...n, selected: n.id === selectedNodeId })), [nodes, selectedNodeId]);

  const handleNodesChange = useCallback(
    (changes: any[]) => {
      // Ignore pure selection updates so a click that only opens the symbol modal
      // does not count as a content edit and does not trigger autosave.
      const dataChanges = changes.filter((change) => change.type !== 'select');
      if (dataChanges.length === 0) return;
      onNodesChange(dataChanges);
    },
    [onNodesChange],
  );

  // Sync AI action context (for ChatInput dropdown actions)
  useEffect(() => {
    setActionContextData({
      nodes: nodesRef.current,
      edges: edgesRef.current,
    });
  }, [nodes, edges, setActionContextData]);

  // AI Content Handler
  useEffect(() => {
    const unregister = registerContentHandler((content, strategy) => {
      if (strategy === 'append') {
        const result = applyToFlowchartContent(nodes, edges, content);
        if (result) {
          setNodes(result.nodes);
          setEdges(result.edges);
          return true;
        }
      }
      return false;
    }, ['append']);

    return unregister;
  }, [registerContentHandler, nodes, edges, setNodes, setEdges]);
  
  const memoizedEdges = useMemo(() => edges.map(e => {
    const isHovered = e.id === hoveredEdgeId;
    const isSelected = e.id === selectedEdgeId;
    const active = isHovered || isSelected;

    const baseColor = (e.style?.stroke as string) || '#b1b1b7';
    const interactiveColor = active ? '#ffffff' : baseColor;
    const interactiveWidth = active ? 2.5 : 1.5;

    const overrideMarker = (marker: any) => {
      if (!marker) return undefined;
      if (typeof marker === 'string') return marker;
      return { ...marker, color: interactiveColor, width: 14, height: 14 };
    };

    return {
      ...e,
      selected: isSelected,
      style: { ...e.style, stroke: interactiveColor, strokeWidth: interactiveWidth, cursor: 'pointer', transition: 'stroke 0.2s, stroke-width 0.2s' },
      markerEnd: overrideMarker(e.markerEnd),
      markerStart: overrideMarker(e.markerStart),
    };
  }), [edges, hoveredEdgeId, selectedEdgeId]);

  // ── EARLY RETURN (setelah semua hooks) ──
  if (showLoader) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <Loader2 className="w-10 h-10 text-primary animate-spin opacity-50" />
        <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading flowchart...</p>
      </div>
    );
  }

  return (
    <Card className="w-full h-full border-0 rounded-none bg-muted/20 flex flex-col overflow-hidden relative">
      
      {/* Top Bar */}
      {!isReadOnly && (
        <div className="absolute top-6 inset-x-0 z-10 flex justify-center pointer-events-none">
          <div className="flex items-center gap-1.5 p-1.5 bg-background/95 backdrop-blur-md border border-border/50 rounded-2xl shadow-2xl pointer-events-auto max-w-[95vw] overflow-x-auto no-scrollbar">
            <JumpToNode nodes={nodes} label="Symbol" />
            <div className="w-px h-6 bg-border mx-0.5" />
            <Button onClick={() => setIsAddingNode(true)} size="sm" className="h-9 px-3 sm:px-4 font-bold shadow-lg shadow-primary/20 cursor-pointer">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Add Symbol</span>
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 w-full h-full relative">
        <ReactFlow
          nodes={memoizedNodes}
          edges={memoizedEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(e, node) => setSelectedNodeId(node.id)}
          onEdgeClick={(e, edge) => setSelectedEdgeId(edge.id)}
          onEdgeMouseEnter={(e, edge) => setHoveredEdgeId(edge.id)}
          onEdgeMouseLeave={() => setHoveredEdgeId(null)}
          onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
          fitView
          colorMode="dark"
          onlyRenderVisibleElements={true}
          nodesDraggable={!isReadOnly}
          nodesConnectable={!isReadOnly}
          elementsSelectable={!isReadOnly}
          minZoom={0.1}
          maxZoom={2.5}
        >
          <Controls className="bg-background/95 border-border shadow-md" showInteractive={!isReadOnly} />
          <Background variant={BackgroundVariant.Lines} gap={50} size={1} color="#222" />
        </ReactFlow>
      </div>

      {!isReadOnly && (
        <>
          <AddSymbolModal 
            isOpen={isAddingNode}
            onOpenChange={setIsAddingNode}
            nodeData={newNodeData}
            onNodeDataChange={setNewNodeData}
            onConfirm={confirmAddSymbol}
          />

          <SymbolPropertiesModal
            selectedNodeId={selectedNodeId}
            onClose={() => setSelectedNodeId(null)}
            selectedNode={selectedNode}
            onUpdateNodeData={updateNodeData}
          />

          <ConnectorPropertiesModal
            selectedEdgeId={selectedEdgeId}
            onClose={() => setSelectedEdgeId(null)}
            selectedEdge={selectedEdge}
            isDashed={isDashed}
            arrowType={arrowType}
            onEdgeTypeChange={handleEdgeTypeChange}
            onArrowChange={handleArrowChange}
            onLabelChange={handleEdgeLabelChange}
            onDeleteEdge={deleteEdge}
          />
        </>
      )}
    </Card>
  );
});
