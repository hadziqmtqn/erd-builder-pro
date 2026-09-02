import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { databaseColumnToERD } from '@/lib/column-metadata';

const columnId = (handle?: string | null) => handle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');

export function keepsDbRelation(edge: Edge, connection: Pick<Edge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>) {
  return edge.source === connection.source
    && edge.target === connection.target
    && columnId(edge.sourceHandle) === columnId(connection.sourceHandle)
    && columnId(edge.targetHandle) === columnId(connection.targetHandle);
}

export function dbSchemaToCanvas(schema: any[], layout: any): { nodes: Node<Entity>[]; edges: Edge[] } {
  const positions = layout?.nodes || {};
  const referencedColumns = new Set(schema.flatMap((table: any) => (table.foreign_keys || [])
    .map((foreignKey: any) => `${foreignKey.ref_table}.${foreignKey.ref_column}`)));
  const nodes = schema.map((table: any, index) => {
    const saved = positions[table.table_name] || {};
    return {
      id: table.table_name,
      type: 'entity',
      position: { x: saved.x ?? (index % 4) * 280 + 50, y: saved.y ?? Math.floor(index / 4) * 220 + 50 },
      data: {
        id: table.table_name,
        name: table.table_name,
        x: saved.x ?? 0,
        y: saved.y ?? 0,
        color: saved.color ?? '#6b7280',
        columns: (table.columns || []).map((column: any) => ({
          ...databaseColumnToERD(column, `${table.table_name}.${column.name}`),
          _is_fk: (table.foreign_keys || []).some((foreignKey: any) => foreignKey.column === column.name),
          _is_ref: referencedColumns.has(`${table.table_name}.${column.name}`),
        })),
        collapsed: saved.collapsed ?? false,
        hidden_columns: saved.hidden_columns ?? [],
        note: saved.note ?? '',
        isReadOnly: true,
      } as Entity,
    };
  });
  const edges: Edge[] = [];
  for (const table of schema) {
    for (const foreignKey of table.foreign_keys || []) {
      const id = `${table.table_name}.${foreignKey.column}->${foreignKey.ref_table}.${foreignKey.ref_column}`;
      const saved = layout?.edgeHandles?.[id] || {};
      edges.push({
        id,
        source: table.table_name,
        target: foreignKey.ref_table,
        sourceHandle: saved.sourceHandle || `col-${table.table_name}.${foreignKey.column}-source`,
        targetHandle: saved.targetHandle || `col-${foreignKey.ref_table}.${foreignKey.ref_column}-target`,
        type: 'smoothstep',
        data: { constraint_name: foreignKey.constraint_name },
      });
    }
  }
  return { nodes, edges };
}

export function canvasLayout(nodes: Node<Entity>[], viewport: any, previous: any, edges?: Edge[]) {
  const positions = Object.fromEntries(nodes.map(node => [node.id, {
    x: node.position.x,
    y: node.position.y,
    color: node.data.color,
    collapsed: (node.data as any).collapsed ?? false,
    hidden_columns: (node.data as any).hidden_columns ?? [],
    note: (node.data as any).note ?? '',
  }]));
  const edgeHandles = edges && Object.fromEntries(edges.map(edge => [edge.id, {
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
  }]));
  return { ...previous, nodes: positions, viewport, ...(edgeHandles ? { edgeHandles } : {}), _type: 'production_db_positions' };
}
