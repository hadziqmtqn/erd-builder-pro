import type { Edge } from '@xyflow/react';

/**
 * The right panel lives outside each file pane's ReactFlowProvider, so it cannot move the canvas itself.
 * It asks with this event and the focused pane's ERDView does the work (see useERDCanvasFocus).
 */
export const ERD_CANVAS_FOCUS_EVENT = 'erd-canvas-focus';

export interface ERDCanvasFocusRequest {
  type: 'table' | 'relationship';
  id: string;
}

export const ERD_FOCUS_MIN_ZOOM = 0.5;
export const ERD_FOCUS_MAX_ZOOM = 1.2;

export function requestERDCanvasFocus(request: ERDCanvasFocusRequest) {
  window.dispatchEvent(new CustomEvent<ERDCanvasFocusRequest>(ERD_CANVAS_FOCUS_EVENT, { detail: request }));
}

export function getERDTableNeighbourIds(nodeId: string, edges: Edge[]): string[] {
  const neighbours = new Set<string>();
  for (const edge of edges) {
    if (edge.source === nodeId && edge.target !== nodeId) neighbours.add(edge.target);
    if (edge.target === nodeId && edge.source !== nodeId) neighbours.add(edge.source);
  }
  return [...neighbours];
}
