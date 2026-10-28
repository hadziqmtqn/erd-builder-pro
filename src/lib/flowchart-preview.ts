import type { Edge, Node } from '@xyflow/react';
import type { FlowchartNodeData } from '@/components/FlowchartNode';
import { autoLayoutFlowchart } from './autoLayoutFlowchart';

export type FlowchartCanvas = { nodes: Node<FlowchartNodeData>[]; edges: Edge[] };
export type FlowchartChange = { kind: 'Shape' | 'Connector'; status: 'Added' | 'Removed' | 'Changed'; label: string; detail: string };
const labelKey = (node: Node<FlowchartNodeData>) => node.data.label.trim().toLowerCase();

export function appendFlowchart(before: FlowchartCanvas, addition: FlowchartCanvas): FlowchartCanvas {
  const used = new Set([...before.nodes, ...before.edges].map(item => item.id));
  const unique = (id: string) => {
    let candidate = id, suffix = 1;
    while (used.has(candidate)) candidate = `${id}-${suffix++}`;
    used.add(candidate);
    return candidate;
  };
  const mapping = new Map(addition.nodes.map(node => [node.id, unique(node.id)]));
  return autoLayoutFlowchart(
    [...before.nodes, ...addition.nodes.map(node => ({ ...node, id: mapping.get(node.id)! }))],
    [...before.edges, ...addition.edges.map(edge => ({ ...edge, id: unique(edge.id), source: mapping.get(edge.source)!, target: mapping.get(edge.target)! }))],
  );
}

export function replaceFlowchartGroup(before: FlowchartCanvas, addition: FlowchartCanvas, section: string) {
  const removed = new Set(before.nodes.filter(node => node.data.section === section).map(node => node.id));
  const queue = [...removed];
  for (let i = 0; i < queue.length; i++) for (const edge of before.edges) {
    if (edge.source === queue[i] && !removed.has(edge.target)) { removed.add(edge.target); queue.push(edge.target); }
  }
  return appendFlowchart({ nodes: before.nodes.filter(node => !removed.has(node.id)), edges: before.edges.filter(edge => !removed.has(edge.source) && !removed.has(edge.target)) }, addition);
}

export function compareFlowcharts(before: FlowchartCanvas, after: FlowchartCanvas): FlowchartChange[] {
  const changes: FlowchartChange[] = [];
  const unmatched = new Set(before.nodes);
  const matchedIds = new Map<string, string>();
  for (const node of after.nodes) {
    const old = [...unmatched].find(candidate => candidate.id === node.id)
      ?? [...unmatched].find(candidate => labelKey(candidate) === labelKey(node));
    if (!old) { changes.push({ kind: 'Shape', status: 'Added', label: node.data.label, detail: node.data.shape }); continue; }
    unmatched.delete(old);
    matchedIds.set(node.id, old.id);
    const fields = ['label', 'shape', 'color', 'section'] as const;
    const details = fields.filter(key => (old.data[key] ?? '') !== (node.data[key] ?? '')).map(key => `${key}: ${old.data[key] || '(empty)'} → ${node.data[key] || '(empty)'}`);
    if (details.length) changes.push({ kind: 'Shape', status: 'Changed', label: node.data.label, detail: details.join('; ') });
  }
  for (const node of unmatched) changes.push({ kind: 'Shape', status: 'Removed', label: node.data.label, detail: node.data.shape });

  const oldEdges = new Set(before.edges);
  const marker = (value: Edge['markerEnd']) => typeof value === 'string' ? value : value?.type ?? '';
  const properties = (edge: Edge) => ({ label: String(edge.label ?? ''), line: edge.type ?? 'smoothstep', dashed: String(edge.style?.strokeDasharray ?? ''), animated: Boolean(edge.animated), start: marker(edge.markerStart), end: marker(edge.markerEnd) });
  const edgeName = (edge: Edge, nodes: FlowchartCanvas['nodes']) => `${nodes.find(node => node.id === edge.source)?.data.label ?? edge.source} → ${nodes.find(node => node.id === edge.target)?.data.label ?? edge.target}`;
  for (const edge of after.edges) {
    const source = matchedIds.get(edge.source), target = matchedIds.get(edge.target);
    const candidates = [...oldEdges].filter(old => old.source === source && old.target === target);
    const old = candidates.find(old => JSON.stringify(properties(old)) === JSON.stringify(properties(edge))) ?? candidates[0];
    if (!old) { changes.push({ kind: 'Connector', status: 'Added', label: edgeName(edge, after.nodes), detail: String(edge.label ?? '') }); continue; }
    oldEdges.delete(old);
    const prev = properties(old), next = properties(edge);
    const details = (Object.keys(next) as (keyof typeof next)[]).filter(key => prev[key] !== next[key]).map(key => `${key}: ${prev[key] || '(empty)'} → ${next[key] || '(empty)'}`);
    if (details.length) changes.push({ kind: 'Connector', status: 'Changed', label: edgeName(edge, after.nodes), detail: details.join('; ') });
  }
  for (const edge of oldEdges) changes.push({ kind: 'Connector', status: 'Removed', label: edgeName(edge, before.nodes), detail: String(edge.label ?? '') });
  return changes;
}
