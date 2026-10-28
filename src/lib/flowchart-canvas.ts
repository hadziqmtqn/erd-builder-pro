import type { Edge, Node } from '@xyflow/react';
import type { FlowchartNodeData } from '@/components/FlowchartNode';

/** Persisted imports can have numeric or missing edge IDs; React Flow requires strings. */
export function normalizeFlowchartCanvas(nodes: Node<FlowchartNodeData>[], edges: Edge[]) {
  const normalizedNodes = nodes.map(node => ({ ...node, id: String(node.id) }));
  const ids = new Set(normalizedNodes.map(node => node.id));
  const seen = new Set<string>();
  const normalizedEdges = edges.filter(edge => ids.has(String(edge.source)) && ids.has(String(edge.target))).map((edge, index) => {
    let id = String(edge.id ?? `connector-${index}`);
    while (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);
    return { ...edge, id, source: String(edge.source), target: String(edge.target) };
  });
  return { nodes: normalizedNodes, edges: normalizedEdges };
}

/** Applies React Flow select changes to a list of selected ids, keeping the same array when nothing changed. */
export function applySelectChanges(ids: string[], changes: { id: string; selected: boolean }[]): string[] {
  const next = new Set(ids);
  for (const change of changes) {
    if (change.selected) next.add(change.id);
    else next.delete(change.id);
  }
  return next.size === ids.length && ids.every(id => next.has(id)) ? ids : [...next];
}

/**
 * Top-left position for a new symbol centred on `center` (canvas coordinates). Adding several without panning
 * would stack them exactly, so each one steps down-right until its spot is free.
 */
export function newSymbolPosition(center: { x: number; y: number }, nodes: { position: { x: number; y: number } }[]) {
  const position = { x: Math.round(center.x - 80), y: Math.round(center.y - 35) };
  while (nodes.some(node => Math.abs(node.position.x - position.x) < 1 && Math.abs(node.position.y - position.y) < 1)) {
    position.x += 24;
    position.y += 24;
  }
  return position;
}
