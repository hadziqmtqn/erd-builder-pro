import { Relationship } from '../types';
import { RELATIONSHIP_TYPES } from './utils';

export function getForeignKeyConstraintName(tableName: string, columnName: string) {
  return `fk_${tableName}_${columnName}`.toLowerCase();
}

export function edgeToRelationship(edge: any): Relationship {
  const data = edge.data || {};
  const columnId = (handle?: string | null) => handle
    ? handle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '')
    : undefined;

  return {
    id: edge.id,
    source_entity_id: edge.source,
    target_entity_id: edge.target,
    source_column_id: columnId(edge.sourceHandle),
    target_column_id: columnId(edge.targetHandle),
    source_handle: edge.sourceHandle || undefined,
    target_handle: edge.targetHandle || undefined,
    type: RELATIONSHIP_TYPES.find(type => type.label === edge.label || type.shortLabel === edge.label)?.value || 'one-to-many',
    label: edge.label as string,
    on_delete: data.on_delete ?? edge.on_delete,
    on_update: data.on_update ?? edge.on_update,
    constraint_name: data.constraint_name ?? edge.constraint_name,
  };
}
