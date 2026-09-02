import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';

export const ERD_HISTORY_PREVIEW_EVENT = 'erd-history-preview';

export type ErdHistoryPreview = {
  nodes: Node<Entity>[];
  edges: Edge[];
  version: number;
};

export function diagramSnapshotToCanvas(snapshot: Record<string, any>): Pick<ErdHistoryPreview, 'nodes' | 'edges'> {
  const entities = Array.isArray(snapshot.entities) ? snapshot.entities : [];
  const relationships = Array.isArray(snapshot.relationships) ? snapshot.relationships : [];
  const nodes: Node<Entity>[] = entities.map((entity: any) => {
    const id = String(entity.id);
    return {
      id,
      type: 'entity',
      position: { x: Number(entity.x) || 0, y: Number(entity.y) || 0 },
      data: {
        ...entity,
        id,
        x: Number(entity.x) || 0,
        y: Number(entity.y) || 0,
        color: entity.color || '#6b7280',
        columns: (Array.isArray(entity.columns) ? entity.columns : []).map((column: any) => ({
          ...column,
          id: String(column.id),
          _entity_id: id,
        })),
      },
    };
  });
  const edges: Edge[] = relationships.map((relationship: any) => ({
    id: String(relationship.id),
    source: String(relationship.source_entity_id),
    target: String(relationship.target_entity_id),
    sourceHandle: relationship.source_handle || undefined,
    targetHandle: relationship.target_handle || undefined,
    label: relationship.label || undefined,
    type: 'smoothstep',
    data: {
      on_delete: relationship.on_delete,
      on_update: relationship.on_update,
      constraint_name: relationship.constraint_name,
    },
  }));
  return { nodes, edges };
}
