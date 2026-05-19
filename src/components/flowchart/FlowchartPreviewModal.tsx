import { useState, useRef, useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FlowchartNodeData } from '../FlowchartNode';
import { Check, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface FlowchartPreviewModalProps {
  nodes: Node<FlowchartNodeData>[];
  edges: Edge[];
  onConfirm: () => void;
  onCancel: () => void;
}

function renderShape(shape: string, color: string, size: number) {
  const s = size;
  const half = s / 2;
  switch (shape) {
    case 'oval':
      return <ellipse cx={half} cy={half} rx={half * 0.9} ry={half * 0.6} fill={color} />;
    case 'diamond':
      return <polygon points={`${half},2 ${s - 2},${half} ${half},${s - 2} 2,${half}`} fill={color} />;
    case 'parallelogram':
      return <polygon points={`${half * 0.3},2 ${s - 2},2 ${s - half * 0.3},${s - 2} 2,${s - 2}`} fill={color} />;
    case 'database':
      return (
        <g>
          <path d={`M2,${half} L2,${s - half * 0.4} Q${half},${s - 2} ${s - 2},${s - half * 0.4} L${s - 2},${half}`} fill={color} />
          <ellipse cx={half} cy={half} rx={half - 2} ry={half * 0.3} fill={color} />
        </g>
      );
    case 'document':
      return (
        <path d={`M2,2 L${s - half * 0.4},2 L${s - 2},${half * 0.6} L${s - 2},${s - 2} L2,${s - 2} Z`} fill={color} />
      );
    case 'cloud':
      return (
        <path d={`M${half * 0.6},${s - 2} Q2,${s - 4} 2,${half * 0.7} Q2,${half * 0.3} ${half},${half * 0.3} Q${half},2 ${half * 1.4},${half * 0.3} Q${s - 2},${half * 0.3} ${s - 2},${half * 0.6} Q${s - 2},${half * 1.1} ${half * 1.5},${half * 1.2} Q${half * 1.4},${s - 2} ${half * 0.6},${s - 2} Z`} fill={color} />
      );
    case 'circle':
      return <circle cx={half} cy={half} r={half - 2} fill={color} />;
    default:
      return <rect x={2} y={2} width={s - 4} height={s - 4} rx={4} ry={4} fill={color} />;
  }
}

export function FlowchartPreviewModal({
  nodes,
  edges,
  onConfirm,
  onCancel,
}: FlowchartPreviewModalProps) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOffset = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  if (nodes.length === 0) return null;

  const NODE_W = 160;
  const NODE_H = 60;
  const ICON_SIZE = 32;

  const xs = nodes.map(n => n.position.x);
  const ys = nodes.map(n => n.position.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs) + NODE_W;
  const maxY = Math.max(...ys) + NODE_H;
  const graphW = maxX - minX;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.max(0.3, Math.min(3, prev + delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    panOffset.current = { x: pan.x, y: pan.y };
  }, [scale, pan.x, pan.y]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setPan({
      x: panOffset.current.x + (e.clientX - panStart.current.x),
      y: panOffset.current.y + (e.clientY - panStart.current.y),
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  const zoomIn = () => setScale(prev => Math.min(3, prev + 0.2));
  const zoomOut = () => setScale(prev => Math.max(0.3, prev - 0.2));
  const resetView = () => { setScale(1); setPan({ x: 0, y: 0 }); };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-2xl h-[550px]">
        <DialogHeader>
          <DialogTitle>Preview Flowchart</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex-1 flex flex-col min-h-0">
          <div
            ref={containerRef}
            className="flex-1 rounded-lg border border-border overflow-hidden bg-[#1a1a1e] mb-4 relative"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: scale > 1 ? (isPanning.current ? 'grabbing' : 'grab') : 'default' }}
          >
            <div
              style={{
                transform: `scale(${scale}) translate(${pan.x / scale}px, ${pan.y / scale}px)`,
                transformOrigin: '0 0',
                width: graphW + 80,
                height: maxY - minY + 80,
              }}
            >
              <svg
                viewBox={`${minX - 40} ${minY - 40} ${graphW + 80} ${maxY - minY + 80}`}
                className="w-full h-full"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <marker id="arrow-preview" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,0 L10,5 L0,10 Z" fill="#b1b1b7" />
                  </marker>
                </defs>

                {edges.map((edge) => {
                  const source = nodes.find(n => n.id === edge.source);
                  const target = nodes.find(n => n.id === edge.target);
                  if (!source || !target) return null;

                  const sx = source.position.x + NODE_W / 2;
                  const sy = source.position.y + NODE_H;
                  const tx = target.position.x + NODE_W / 2;
                  const ty = target.position.y;
                  const cy = (sy + ty) / 2;

                  return (
                    <g key={edge.id}>
                      <path
                        d={`M${sx},${sy} C${sx},${cy} ${tx},${cy} ${tx},${ty}`}
                        fill="none"
                        stroke="#b1b1b7"
                        strokeWidth={2}
                        markerEnd="url(#arrow-preview)"
                      />
                      {edge.label && (
                        <text
                          x={(sx + tx) / 2}
                          y={cy - 8}
                          textAnchor="middle"
                          fill="#fff"
                          fontSize={11}
                          className="select-none"
                        >
                          {edge.label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {nodes.map((node) => (
                  <g key={node.id}>
                    <rect
                      x={node.position.x}
                      y={node.position.y}
                      width={NODE_W}
                      height={NODE_H}
                      rx={8}
                      ry={8}
                      fill={node.data.color || '#8b5cf6'}
                      fillOpacity={0.15}
                      stroke={node.data.color || '#8b5cf6'}
                      strokeWidth={2}
                      strokeOpacity={0.6}
                    />
                    <g transform={`translate(${node.position.x + 8}, ${node.position.y + (NODE_H - ICON_SIZE) / 2})`}>
                      {renderShape(node.data.shape || 'rectangle', node.data.color || '#8b5cf6', ICON_SIZE)}
                    </g>
                    <text
                      x={node.position.x + ICON_SIZE + 16}
                      y={node.position.y + NODE_H / 2}
                      dominantBaseline="central"
                      fill="#fff"
                      fontSize={12}
                      fontWeight={500}
                      className="select-none"
                    >
                      {node.data.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={zoomOut} className="size-8 p-0" title="Zoom out">
                <ZoomOut className="size-4" />
              </Button>
              <span className="text-xs text-muted-foreground w-8 text-center tabular-nums">{Math.round(scale * 100)}%</span>
              <Button variant="outline" size="sm" onClick={zoomIn} className="size-8 p-0" title="Zoom in">
                <ZoomIn className="size-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={resetView} className="size-8 p-0" title="Reset view">
                <RotateCcw className="size-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onCancel} className="gap-2">
                <X className="size-4" />
                Cancel
              </Button>
              <Button onClick={onConfirm} className="gap-2">
                <Check className="size-4" />
                Confirm Append
              </Button>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
