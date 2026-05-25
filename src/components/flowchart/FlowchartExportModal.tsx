import { useState, useCallback } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MarkerType,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FlowchartNodeData } from '../FlowchartNode';
import FlowchartNode from '../FlowchartNode';
import { Download, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { generateFlowchartSVG, downloadSVG } from '@/lib/generateFlowchartSVG';
import { toast } from 'sonner';

interface FlowchartExportModalProps {
  nodes: Node<FlowchartNodeData>[];
  edges: Edge[];
  filename: string;
  onCancel: () => void;
}

const nodeTypes = { custom: FlowchartNode };

const defaultEdgeOptions = {
  type: 'smoothstep' as const,
  style: { stroke: '#b1b1b7' },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' },
};

export function FlowchartExportModal({
  nodes: initialNodes,
  edges: initialEdges,
  filename,
  onCancel,
}: FlowchartExportModalProps) {
  const [nodes] = useState(initialNodes);
  const [edges] = useState(initialEdges);

  const onNodesChange = useCallback(() => {}, []);
  const onEdgesChange = useCallback(() => {}, []);

  const handleDownload = useCallback(() => {
    const svg = generateFlowchartSVG(nodes, edges);
    if (!svg) {
      toast.error('No nodes to export');
      return;
    }
    downloadSVG(svg, filename);
    toast.success('Flowchart exported as SVG');
    onCancel();
  }, [nodes, edges, filename, onCancel]);

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-3xl h-[600px]">
        <DialogHeader>
          <DialogTitle>Export Flowchart</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 rounded-lg border border-border overflow-hidden bg-muted/10 mb-4 relative">
            <ReactFlowProvider>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                defaultEdgeOptions={defaultEdgeOptions}
                fitView
                colorMode="dark"
                onlyRenderVisibleElements={true}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                minZoom={0.1}
                maxZoom={2.5}
                panOnDrag={false}
                zoomOnScroll={false}
                zoomOnPinch={false}
                zoomOnDoubleClick={false}
              >
                <Background variant={BackgroundVariant.Lines} gap={50} size={1} color="#222" />
              </ReactFlow>
            </ReactFlowProvider>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground tabular-nums">Preview</span>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onCancel} className="gap-2">
                <X className="size-4" />
                Cancel
              </Button>
              <Button onClick={handleDownload} className="gap-2">
                <Download className="size-4" />
                Download SVG
              </Button>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
