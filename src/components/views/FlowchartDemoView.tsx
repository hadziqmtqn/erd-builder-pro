import React, { useCallback, useState } from 'react';
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
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import FlowchartNode, { FlowchartNodeData, FlowchartShape } from '../FlowchartNode';

const nodeTypes = {
  custom: FlowchartNode,
};

const initialNodes: Node<FlowchartNodeData>[] = [
  { id: '1', type: 'custom', data: { label: 'Start Setup', shape: 'oval', color: '#6366f1' }, position: { x: 250, y: 50 } },
  { id: '2', type: 'custom', data: { label: 'Initialize App', shape: 'rectangle', color: '#8b5cf6' }, position: { x: 250, y: 200 } },
  { id: '3', type: 'custom', data: { label: 'Database Connected?', shape: 'diamond', color: '#eab308' }, position: { x: 250, y: 350 } },
  { id: '4', type: 'custom', data: { label: 'Fetch Data', shape: 'parallelogram', color: '#8b5cf6' }, position: { x: 100, y: 550 } },
  { id: '5', type: 'custom', data: { label: 'Show Error', shape: 'rectangle', color: '#ef4444' }, position: { x: 400, y: 550 } },
  { id: '6', type: 'custom', data: { label: 'End', shape: 'oval', color: '#6366f1' }, position: { x: 250, y: 750 } },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', sourceHandle: 'bottom', targetHandle: 'top', animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' }, style: { stroke: '#b1b1b7' } },
  { id: 'e2-3', source: '2', target: '3', sourceHandle: 'bottom', targetHandle: 'top', markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' }, style: { stroke: '#b1b1b7' } },
  { id: 'e3-4', source: '3', target: '4', sourceHandle: 'left', targetHandle: 'top', label: 'Yes', labelBgStyle: { fill: '#1e1e24' }, labelStyle: { fill: '#fff' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' }, style: { stroke: '#b1b1b7' } },
  { id: 'e3-5', source: '3', target: '5', sourceHandle: 'right', targetHandle: 'top', label: 'No', labelBgStyle: { fill: '#1e1e24' }, labelStyle: { fill: '#fff' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' }, style: { stroke: '#b1b1b7' } },
  { id: 'e4-6', source: '4', target: '6', sourceHandle: 'bottom', targetHandle: 'left', animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' }, style: { stroke: '#b1b1b7' } },
  { id: 'e5-6', source: '5', target: '6', sourceHandle: 'bottom', targetHandle: 'right', animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' }, style: { stroke: '#b1b1b7' } },
];

const COLOR_PALETTE = [
  '#6366f1', '#8b5cf6', '#ef4444', '#eab308', 
  '#22c55e', '#a855f7', '#ec4899', '#0ea5e9'
];

export function FlowchartDemoView() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowchartNodeData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

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

  return (
    <Card className="w-full h-full border-0 rounded-none bg-muted/20 flex flex-col overflow-hidden relative">
      
      {/* Top Bar */}
      <div className="absolute top-6 inset-x-0 z-10 flex justify-center pointer-events-none">
        <div className="flex items-center gap-2 p-1.5 bg-background border border-border/50 rounded-2xl shadow-2xl pointer-events-auto">
          <Button onClick={() => setIsAddingNode(true)} size="sm" className="h-9 px-4 font-bold shadow-lg shadow-primary/20">
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
          <MiniMap 
            nodeColor={(n) => {
              if (n.data?.color) return n.data.color as string;
              return '#8b5cf6';
            }}
            maskColor="rgba(0, 0, 0, 0.7)"
            className="bg-background border-border"
          />
          <Background variant={BackgroundVariant.Lines} gap={50} size={1} color="#222" />
        </ReactFlow>
      </div>

      {/* Add Symbol Modal */}
      <Dialog open={isAddingNode} onOpenChange={setIsAddingNode}>
        <DialogContent className="sm:max-w-sm w-full border-white/10 bg-[#0f0f14] shadow-2xl">
          <DialogHeader className="shrink-0 mb-4">
            <DialogTitle className="text-xl font-bold tracking-tight">Create New Symbol</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure the symbol before placing it on the canvas.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input 
                value={newNodeData.label}
                onChange={(e) => setNewNodeData({ ...newNodeData, label: e.target.value })}
                placeholder="Enter symbol label"
                className="bg-black/50 border-white/10 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label>Shape Type</Label>
              <Select 
                value={newNodeData.shape} 
                onValueChange={(val: FlowchartShape) => setNewNodeData({ ...newNodeData, shape: val })}
              >
                <SelectTrigger className="w-full bg-black/50 border-white/10 text-white">
                  <SelectValue placeholder="Select a shape" />
                </SelectTrigger>
                <SelectContent className="bg-[#1e1e24] border-white/10 text-white">
                  <SelectItem value="rectangle">Rectangle (Process)</SelectItem>
                  <SelectItem value="oval">Oval (Start/End)</SelectItem>
                  <SelectItem value="diamond">Diamond (Decision)</SelectItem>
                  <SelectItem value="parallelogram">Parallelogram (Input/Output)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${newNodeData.color === color ? 'border-white scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewNodeData({ ...newNodeData, color })}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" className="border-white/10" onClick={() => setIsAddingNode(false)}>Cancel</Button>
            <Button onClick={confirmAddSymbol} className="bg-primary text-primary-foreground">Add to Flowchart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Symbol Properties ReactFlow Modal */}
      <Dialog open={!!selectedNodeId} onOpenChange={(open) => { if (!open) setSelectedNodeId(null); }}>
        <DialogContent className="sm:max-w-sm w-full border-white/10 bg-[#0f0f14] shadow-2xl">
          <DialogHeader className="shrink-0 mb-4">
            <DialogTitle className="text-xl font-bold tracking-tight">Symbol Properties</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Customize the name, shape, and color of this symbol.
            </DialogDescription>
          </DialogHeader>
          
          {selectedNode && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Label</Label>
                <Input 
                  value={selectedNode.data.label}
                  onChange={(e) => updateNodeData({ label: e.target.value })}
                  placeholder="Enter symbol label"
                  className="bg-black/50 border-white/10 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label>Shape Type</Label>
                <Select 
                  value={selectedNode.data.shape} 
                  onValueChange={(val: FlowchartShape) => updateNodeData({ shape: val })}
                >
                  <SelectTrigger className="w-full bg-black/50 border-white/10 text-white">
                    <SelectValue placeholder="Select a shape" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1e1e24] border-white/10 text-white">
                    <SelectItem value="rectangle">Rectangle (Process)</SelectItem>
                    <SelectItem value="oval">Oval (Start/End)</SelectItem>
                    <SelectItem value="diamond">Diamond (Decision)</SelectItem>
                    <SelectItem value="parallelogram">Parallelogram (Input/Output)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${selectedNode.data.color === color ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                      onClick={() => updateNodeData({ color })}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edge Properties Modal */}
      <Dialog open={!!selectedEdgeId} onOpenChange={(open) => { if (!open) setSelectedEdgeId(null); }}>
        <DialogContent className="sm:max-w-sm w-full border-white/10 bg-[#0f0f14] shadow-2xl">
          <DialogHeader className="shrink-0 mb-4">
            <div className="flex items-center justify-between pr-8">
              <div className="space-y-1 text-left">
                <DialogTitle className="text-xl font-bold tracking-tight">Connector Properties</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Format the line style and arrows.
                </DialogDescription>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={deleteEdge}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mr-2"
                title="Delete Connector"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </DialogHeader>
          
          {selectedEdge && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Line Style</Label>
                <Select value={isDashed ? 'dashed' : 'solid'} onValueChange={handleEdgeTypeChange}>
                  <SelectTrigger className="w-full bg-black/50 border-white/10 text-white">
                    <SelectValue placeholder="Select line style" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1e1e24] border-white/10 text-white">
                    <SelectItem value="solid">Solid Line</SelectItem>
                    <SelectItem value="dashed">Dashed Line</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Arrow Style</Label>
                <Select value={arrowType} onValueChange={handleArrowChange}>
                  <SelectTrigger className="w-full bg-black/50 border-white/10 text-white">
                    <SelectValue placeholder="Select arrow style" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1e1e24] border-white/10 text-white">
                    <SelectItem value="end">Arrow at End</SelectItem>
                    <SelectItem value="start">Arrow at Start (Reverse)</SelectItem>
                    <SelectItem value="both">Arrows Both Ends</SelectItem>
                    <SelectItem value="none">No Arrows (Line only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
