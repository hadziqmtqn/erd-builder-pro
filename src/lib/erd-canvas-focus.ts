import type { Edge } from '@xyflow/react';

export const ERD_FOCUS_MIN_ZOOM = 0.5;
export const ERD_FOCUS_MAX_ZOOM = 1.2;

export function getERDTableNeighbourIds(nodeId: string, edges: Edge[]): string[] {
  const neighbours = new Set<string>();
  for (const edge of edges) {
    if (edge.source === nodeId && edge.target !== nodeId) neighbours.add(edge.target);
    if (edge.target === nodeId && edge.source !== nodeId) neighbours.add(edge.source);
  }
  return [...neighbours];
}
