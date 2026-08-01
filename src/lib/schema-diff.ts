import { Edge, Node } from '@xyflow/react';
import { Column, Entity } from '@/types';

export type DiffState = 'new' | 'modified' | 'deleted';
export type SchemaChangeKind = 'table' | 'column' | 'relation';

export interface SchemaDiffChange {
  id: string;
  kind: SchemaChangeKind;
  state: DiffState;
  label: string;
  current?: Node<Entity> | Column | Edge;
  proposed?: Node<Entity> | Column | Edge;
}

export interface DiffResult {
  nodes: Node<Entity>[];
  edges: Edge[];
  changes: SchemaDiffChange[];
  newCount: number;
  modifiedCount: number;
  deletedCount: number;
}

const key = (value: string) => value.trim().toLowerCase();
const columnIdFromHandle = (handle?: string | null) => handle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
const columnFromHandle = (node: Node<Entity>, handle?: string | null) =>
  node.data.columns.find(column => String(column.id) === columnIdFromHandle(handle));

export function relationKey(edge: Edge, nodes: Node<Entity>[]): string | null {
  const source = nodes.find(node => node.id === edge.source);
  const target = nodes.find(node => node.id === edge.target);
  if (!source || !target) return null;
  const sourceColumn = columnFromHandle(source, edge.sourceHandle);
  const targetColumn = columnFromHandle(target, edge.targetHandle);
  if (!sourceColumn || !targetColumn) return null;
  return `${key(source.data.name)}.${key(sourceColumn.name)}>${key(target.data.name)}.${key(targetColumn.name)}`;
}

function columnChanged(current: Column, proposed: Column) {
  return current.type.toLowerCase() !== proposed.type.toLowerCase()
    || !!current.is_pk !== !!proposed.is_pk
    || !!current.is_nullable !== !!proposed.is_nullable
    || (current.comment || '') !== (proposed.comment || '')
    || (current.max_length ?? null) !== (proposed.max_length ?? null)
    || (current.numeric_precision ?? null) !== (proposed.numeric_precision ?? null)
    || (current.numeric_scale ?? null) !== (proposed.numeric_scale ?? null)
    || (current.enum_name || '') !== (proposed.enum_name || '')
    || (current.enum_values || '') !== (proposed.enum_values || '');
}

export function computeSchemaDiff(
  currentNodes: Node<Entity>[],
  currentEdges: Edge[],
  proposedNodes: Node<Entity>[],
  proposedEdges: Edge[],
): DiffResult {
  const changes: SchemaDiffChange[] = [];
  const currentByName = new Map(currentNodes.map(node => [key(node.data.name), node]));
  const proposedByName = new Map(proposedNodes.map(node => [key(node.data.name), node]));
  const allNames = new Set([...currentByName.keys(), ...proposedByName.keys()]);
  const nodes: Node<Entity>[] = [];

  for (const name of allNames) {
    const current = currentByName.get(name);
    const proposed = proposedByName.get(name);
    const tableChangeId = `table:${name}`;
    if (!current && proposed) {
      changes.push({ id: tableChangeId, kind: 'table', state: 'new', label: proposed.data.name, proposed });
      nodes.push({ ...proposed, data: { ...proposed.data, diffState: 'new' } });
      continue;
    }
    if (current && !proposed) {
      changes.push({ id: tableChangeId, kind: 'table', state: 'deleted', label: current.data.name, current });
      nodes.push({ ...current, data: { ...current.data, columns: current.data.columns.map(column => ({ ...column, diffState: 'deleted' })), diffState: 'deleted' } });
      continue;
    }
    if (!current || !proposed) continue;

    const currentColumns = new Map(current.data.columns.map(column => [key(column.name), column]));
    const proposedColumns = new Map(proposed.data.columns.map(column => [key(column.name), column]));
    const columnNames = new Set([...currentColumns.keys(), ...proposedColumns.keys()]);
    let changed = false;
    const columns: (Column & { diffState?: DiffState })[] = [];

    for (const columnName of columnNames) {
      const before = currentColumns.get(columnName);
      const after = proposedColumns.get(columnName);
      const id = `column:${name}.${columnName}`;
      const label = `${current.data.name}.${before?.name || after?.name || columnName}`;
      if (!before && after) {
        changed = true;
        changes.push({ id, kind: 'column', state: 'new', label, proposed: after });
        columns.push({ ...after, diffState: 'new' });
      } else if (before && !after) {
        changed = true;
        changes.push({ id, kind: 'column', state: 'deleted', label, current: before });
        columns.push({ ...before, diffState: 'deleted' });
      } else if (before && after && columnChanged(before, after)) {
        changed = true;
        changes.push({ id, kind: 'column', state: 'modified', label, current: before, proposed: after });
        columns.push({ ...after, diffState: 'new' });
      } else if (before) {
        columns.push(before);
      }
    }
    nodes.push({ ...current, data: { ...current.data, columns, diffState: changed ? 'modified' : undefined } });
  }

  const currentRelations = new Map(currentEdges.flatMap(edge => {
    const relation = relationKey(edge, currentNodes);
    return relation ? [[relation, edge] as const] : [];
  }));
  const proposedRelations = new Map(proposedEdges.flatMap(edge => {
    const relation = relationKey(edge, proposedNodes);
    return relation ? [[relation, edge] as const] : [];
  }));
  const relationNames = new Set([...currentRelations.keys(), ...proposedRelations.keys()]);
  for (const relation of relationNames) {
    const current = currentRelations.get(relation);
    const proposed = proposedRelations.get(relation);
    const id = `relation:${relation}`;
    if (!current && proposed) changes.push({ id, kind: 'relation', state: 'new', label: relation, proposed });
    else if (current && !proposed) changes.push({ id, kind: 'relation', state: 'deleted', label: relation, current });
    else if (current && proposed && (current.label || '') !== (proposed.label || '')) {
      changes.push({ id, kind: 'relation', state: 'modified', label: relation, current, proposed });
    }
  }

  return {
    nodes,
    edges: proposedEdges,
    changes,
    newCount: changes.filter(change => change.state === 'new').length,
    modifiedCount: changes.filter(change => change.state === 'modified').length,
    deletedCount: changes.filter(change => change.state === 'deleted').length,
  };
}
