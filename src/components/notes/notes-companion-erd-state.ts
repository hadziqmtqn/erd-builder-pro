import { type Edge, type Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { styleErdEdges } from '@/lib/erd-edge-style';

function parseData(value: unknown) {
  if (!value) return null;
  try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; }
}

function normalizeColumn(column: any) {
  return {
    ...column,
    id: String(column.id),
    is_pk: column.is_pk ?? column.isPk ?? false,
    is_nullable: column.is_nullable ?? column.isNullable ?? true,
    is_unique: column.is_unique ?? column.isUnique ?? false,
    default_value: column.default_value ?? column.defaultValue ?? null,
    enum_values: column.enum_values ?? column.enumValues ?? '',
    max_length: column.max_length ?? column.maxLength ?? null,
    numeric_precision: column.numeric_precision ?? column.numericPrecision ?? null,
    numeric_scale: column.numeric_scale ?? column.numericScale ?? null,
    sort_order: column.sort_order ?? column.sortOrder ?? 0,
  };
}

function normalizeEntity(entity: any) {
  const data = entity.data ?? entity;
  const id = String(entity.id ?? data.id);
  const x = entity.position?.x ?? entity.x ?? data.x ?? 0;
  const y = entity.position?.y ?? entity.y ?? data.y ?? 0;
  return {
    id,
    type: 'entity' as const,
    position: { x, y },
    data: {
      ...data,
      _notesCompanion: true,
      id,
      name: data.name ?? entity.name ?? 'Untitled',
      x,
      y,
      color: data.color ?? entity.color ?? '#6366f1',
      columns: (data.columns ?? entity.columns ?? []).map(normalizeColumn),
    },
  };
}

export function diagramState(document: any) {
  const legacy = parseData(document.data) as any;
  const entities = Array.isArray(document.entities) && document.entities.length
    ? document.entities
    : Array.isArray(legacy?.nodes) ? legacy.nodes : [];
  const relationships = Array.isArray(document.relationships) && document.relationships.length
    ? document.relationships
    : Array.isArray(legacy?.edges) ? legacy.edges : [];
  const nodes = entities.map(normalizeEntity) as Node<Entity>[];
  const nodeById = new Map<string, Node<Entity>>(nodes.map(node => [node.id, node]));
  return {
    nodes,
    edges: relationships.map((relationship: any) => {
      const source = String(relationship.source ?? relationship.source_entity_id ?? relationship.sourceEntityId ?? '');
      const target = String(relationship.target ?? relationship.target_entity_id ?? relationship.targetEntityId ?? '');
      const sourceColumn = relationship.sourceHandle ?? relationship.source_handle ?? relationship.sourceColumnId ?? relationship.source_column_id;
      const targetColumn = relationship.targetHandle ?? relationship.target_handle ?? relationship.targetColumnId ?? relationship.target_column_id;
      const sourceNode = nodeById.get(source);
      const targetNode = nodeById.get(target);
      const sourceOnLeft = (sourceNode?.position.x ?? 0) < (targetNode?.position.x ?? 0);
      const sourceHandle = String(sourceColumn || '').startsWith('col-')
        ? sourceColumn
        : sourceColumn ? `col-${sourceColumn}-${sourceOnLeft ? 'source' : 'source-l'}` : undefined;
      const targetHandle = String(targetColumn || '').startsWith('col-')
        ? targetColumn
        : targetColumn ? `col-${targetColumn}-${sourceOnLeft ? 'target' : 'target-r'}` : undefined;
      return {
        ...relationship,
        id: String(relationship.id),
        source,
        target,
        sourceHandle,
        targetHandle,
        label: relationship.label,
        type: relationship.type ?? 'smoothstep',
        data: {
          ...(relationship.data || {}),
          on_delete: relationship.on_delete ?? relationship.onDelete,
          on_update: relationship.on_update ?? relationship.onUpdate,
          constraint_name: relationship.constraint_name ?? relationship.constraintName,
        },
      };
    }),
  } as { nodes: Node<Entity>[]; edges: Edge[] };
}

export function styleCompanionEdges(edges: Edge[], selectedNodeId: string | null) {
  return styleErdEdges(edges, selectedNodeId ? [selectedNodeId] : []);
}
