import type { Node, Edge } from '@xyflow/react';
import type { Entity } from '@/types';

export function readPendingERDCanvas(draft: { sync_pending?: boolean; data: string } | null | undefined): { nodes: Node<Entity>[]; edges: Edge[] } | null {
  if (!draft?.sync_pending) return null;
  try {
    const data = JSON.parse(draft.data);
    if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) return null;
    return { nodes: data.nodes, edges: data.edges };
  } catch {
    return null;
  }
}
