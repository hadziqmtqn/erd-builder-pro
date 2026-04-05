import { Edge, Node, MarkerType } from '@xyflow/react';
import { FlowchartNodeData } from '../FlowchartNode';

export const initialNodes: Node<FlowchartNodeData>[] = [
  { id: '1', type: 'custom', data: { label: 'Start Setup', shape: 'oval', color: '#6366f1' }, position: { x: 271, y: 50 } },
  { id: '2', type: 'custom', data: { label: 'Initialize App', shape: 'rectangle', color: '#8b5cf6' }, position: { x: 275, y: 200 } },
  { id: '3', type: 'custom', data: { label: 'Database Connected?', shape: 'diamond', color: '#eab308' }, position: { x: 244, y: 350 } },
  { id: '4', type: 'custom', data: { label: 'Fetch Data', shape: 'parallelogram', color: '#8b5cf6' }, position: { x: 65, y: 550 } },
  { id: '5', type: 'custom', data: { label: 'Show Error', shape: 'rectangle', color: '#ef4444' }, position: { x: 480, y: 550 } },
  { id: '6', type: 'custom', data: { label: 'End', shape: 'oval', color: '#6366f1' }, position: { x: 280, y: 750 } },
];

export const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', sourceHandle: 'bottom', targetHandle: 'top', type: 'smoothstep', animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' }, style: { stroke: '#b1b1b7' } },
  { id: 'e2-3', source: '2', target: '3', sourceHandle: 'bottom', targetHandle: 'top', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' }, style: { stroke: '#b1b1b7' } },
  { id: 'e3-4', source: '3', target: '4', sourceHandle: 'left', targetHandle: 'top', type: 'smoothstep', label: 'Yes', labelBgStyle: { fill: '#1e1e24' }, labelStyle: { fill: '#fff' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' }, style: { stroke: '#b1b1b7' } },
  { id: 'e3-5', source: '3', target: '5', sourceHandle: 'right', targetHandle: 'top', type: 'smoothstep', label: 'No', labelBgStyle: { fill: '#1e1e24' }, labelStyle: { fill: '#fff' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' }, style: { stroke: '#b1b1b7' } },
  { id: 'e4-6', source: '4', target: '6', sourceHandle: 'bottom', targetHandle: 'left', type: 'smoothstep', animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' }, style: { stroke: '#b1b1b7' } },
  { id: 'e5-6', source: '5', target: '6', sourceHandle: 'bottom', targetHandle: 'right', type: 'smoothstep', animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' }, style: { stroke: '#b1b1b7' } },
];

export const COLOR_PALETTE = [
  '#6366f1', '#8b5cf6', '#ef4444', '#eab308', 
  '#22c55e', '#a855f7', '#ec4899', '#0ea5e9'
];

export const SHAPE_LABELS: Record<string, string> = {
  rectangle: 'Rectangle (Process)',
  oval: 'Oval (Start/End)',
  diamond: 'Diamond (Decision)',
  parallelogram: 'Parallelogram (Input/Output)',
  database: 'Cylinder (Database)',
  document: 'Document',
  cloud: 'Cloud (External System)',
  circle: 'Circle (Connector)'
};

export const LINE_STYLE_LABELS: Record<string, string> = {
  solid: 'Solid Line',
  dashed: 'Dashed Line'
};

export const ARROW_STYLE_LABELS: Record<string, string> = {
  end: 'Arrow at End',
  start: 'Arrow at Start (Reverse)',
  both: 'Arrows Both Ends',
  none: 'No Arrows (Line only)'
};
