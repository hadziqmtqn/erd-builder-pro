import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';

export function canvasFingerprint(nodes: Node<Entity>[], edges: Edge[]): string {
  const columns = nodes.map(node =>
    `${node.data.name}:${node.data.columns.map(column => `${column.name}:${column.type}:${column.enum_name || ''}:${column.enum_values || ''}:${column.comment || ''}:${column.max_length || ''}:${column.numeric_precision || ''}:${column.numeric_scale || ''}:${column.is_pk}:${column.is_nullable}:${column.default_value || ''}:${column.is_unique || false}`).join(',')}`
  ).sort().join('|');
  const metadata = nodes.map(node => JSON.stringify({
    table: node.data.name,
    comment: node.data.comment || '',
    constraints: (node.data.constraints || []).map(constraint => ({
      kind: constraint.kind,
      name: constraint.name || '',
      columns: (constraint.column_ids || []).map(id => node.data.columns.find(column => column.id === id)?.name || id).sort(),
      expression: constraint.expression || '',
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    indexes: (node.data.indexes || []).map(index => ({
      name: index.name,
      unique: Boolean(index.is_unique),
      algorithm: index.algorithm || '',
      columns: (index.column_ids || []).map(id => node.data.columns.find(column => column.id === id)?.name || id).sort(),
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  })).sort().join('|');
  const relationMetadata = edges.map(edge => JSON.stringify({
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    on_delete: (edge.data as any)?.on_delete || '',
    on_update: (edge.data as any)?.on_update || '',
    constraint_name: (edge.data as any)?.constraint_name || '',
  })).sort().join('|');

  return `${columns}|${metadata}|${relationMetadata}`;
}

export function isStructurallyComplete(text: string): boolean {
  let depth = 0;
  for (const character of text) {
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0 && /\bTable\b/i.test(text);
}
