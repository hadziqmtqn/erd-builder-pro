import React, { useCallback, useState, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
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
import { Plus } from 'lucide-react';

import FlowchartNode, { FlowchartNodeData } from '../FlowchartNode';
import { initialNodes, initialEdges } from '../flowchart/flowchartConstants';
import { Flowchart } from '@/types';
import { AddSymbolModal } from '../flowchart/AddSymbolModal';
import { SymbolPropertiesModal } from '../flowchart/SymbolPropertiesModal';
import { ConnectorPropertiesModal } from '../flowchart/ConnectorPropertiesModal';

const nodeTypes = {
  custom: FlowchartNode,
};

interface FlowchartViewProps {
  activeFlowchartId: number;
  activeFlowchart: Flowchart;
  handleFlowchartChange: (nodes: any[], edges: any[]) => void;
}

export function FlowchartView({ activeFlowchartId, activeFlowchart, handleFlowchartChange }: FlowchartViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowchartNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Initialize from db or use defaults
  useEffect(() => {
    try {
      const parsed = JSON.parse(activeFlowchart.data || '{"nodes":[], "edges":[]}');
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
  }, [activeFlowchartId]); // Only trigger when switching flowcharts

  const handleFlowchartChangeRef = React.useRef(handleFlowchartChange);
  useEffect(() => {
    handleFlowchartChangeRef.current = handleFlowchartChange;
  }, [handleFlowchartChange]);

  // Trigger autosave internally when local state changes
  useEffect(() => {
    if (nodes.length > 0 || edges.length > 0) {
      handleFlowchartChangeRef.current(nodes, edges);
    }
  }, [nodes, edges]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // Add Node State
  const [isAddingNode, setIsAddingNode] = useState(false);
  const [newNodeData, setNewNodeData] = useState<FlowchartNodeData>({
    label: 'New Symbol',
    shape: 'rectangle',
    color: '#8b5cf6',
  });

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge({
      ...params,
      style: { stroke: '#b1b1b7' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' },
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
    if (val === 'dashed') updateEdgeData({ animated: true, style: { ...selectedEdge?.style, strokeDasharray: '5,5' } });
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

  return (
    <Card className="w-full h-full border-0 rounded-none bg-muted/20 flex flex-col overflow-hidden relative">
      
      {/* Top Bar */}
      <div className="absolute top-6 inset-x-0 z-10 flex justify-center pointer-events-none">
        <div className="flex items-center gap-2 p-1.5 bg-background border border-border/50 rounded-2xl shadow-2xl pointer-events-auto">
          <Button onClick={() => setIsAddingNode(true)} size="sm" className="h-9 px-4 font-bold shadow-lg shadow-primary/20 cursor-pointer">
            <Plus className="w-4 h-4 mr-2" />
            Add Symbol
          </Button>
        </div>
      </div>

      <div className="flex-1 w-full h-full relative">
        <ReactFlow
          nodes={nodes.map((n) => ({ ...n, selected: n.id === selectedNodeId }))}
          edges={edges.map(e => {
            const isHovered = e.id === hoveredEdgeId;
            const isSelected = e.id === selectedEdgeId;
            const active = isHovered || isSelected;

            const baseColor = (e.style?.stroke as string) || '#b1b1b7';
            const interactiveColor = active ? '#ffffff' : baseColor;
            const interactiveWidth = active ? 2.5 : 1.5;

            const overrideMarker = (marker: any) => {
              if (!marker) return undefined;
              if (typeof marker === 'string') return marker;
              // width: 14, height: 14 yields smaller distinct arrows
              return { ...marker, color: interactiveColor, width: 14, height: 14 };
            };

            return {
              ...e,
              selected: isSelected,
              style: { ...e.style, stroke: interactiveColor, strokeWidth: interactiveWidth, cursor: 'pointer', transition: 'stroke 0.2s, stroke-width 0.2s' },
              markerEnd: overrideMarker(e.markerEnd),
              markerStart: overrideMarker(e.markerStart),
            };
          })}
          onNodesChange={onNodesChange}
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
        >
          <Controls className="bg-background/95 border-border shadow-md" />
          <Background variant={BackgroundVariant.Lines} gap={50} size={1} color="#222" />
        </ReactFlow>
      </div>

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
    </Card>
  );
}
