import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';

export const ERD_REPOSITORY_PREVIEW_EVENT = 'erd-builder:repository-preview';
export const ERD_REPOSITORY_APPLIED_EVENT = 'erd-builder:repository-applied';

export interface RepositoryPreview {
  originalNodes?: Node<Entity>[];
  originalEdges?: Edge[];
  proposedNodes: Node<Entity>[];
  proposedEdges: Edge[];
  sourceLabel: string;
  commit: string;
  dbmlSource?: string;
  canApply: boolean;
}

export function showRepositoryPreview(preview: RepositoryPreview) {
  window.dispatchEvent(new CustomEvent(ERD_REPOSITORY_PREVIEW_EVENT, { detail: preview }));
}

export function closeRepositoryPreview() {
  window.dispatchEvent(new CustomEvent(ERD_REPOSITORY_PREVIEW_EVENT));
}
