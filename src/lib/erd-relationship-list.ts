import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { RELATIONSHIP_TYPES } from './utils';

export interface ERDRelationshipRow {
  id: string;
  fromNodeId: string;
  fromTable: string;
  fromColumn: string;
  toNodeId: string;
  toTable: string;
  toColumn: string;
  type: string;
  constraintName?: string;
}

const columnIdFromHandle = (handle?: string | null) =>
  handle ? handle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') : null;

function endpoint(node: Node<Entity>, handle?: string | null) {
  const columnId = columnIdFromHandle(handle);
  const column = columnId ? node.data.columns.find(item => item.id === columnId) : undefined;
  return { nodeId: node.id, table: node.data.name, column: column?.name ?? columnId ?? '', isPk: !!column?.is_pk };
}

export function buildERDRelationshipRows(nodes: Node<Entity>[], edges: Edge[]): ERDRelationshipRow[] {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const defaultType = RELATIONSHIP_TYPES[1].shortLabel;

  return edges.flatMap(edge => {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    if (!sourceNode || !targetNode) return [];

    const source = endpoint(sourceNode, edge.sourceHandle);
    const target = endpoint(targetNode, edge.targetHandle);
    // Edges drawn from a PK column keep the PK as source; onConnect uses the same rule to find the FK side.
    const [from, to] = source.isPk && !target.isPk ? [target, source] : [source, target];
    const type = RELATIONSHIP_TYPES.find(item => item.shortLabel === edge.label)?.shortLabel ?? defaultType;
    const constraintName = String((edge.data as Record<string, unknown> | undefined)?.constraint_name ?? '').trim();

    return [{
      id: edge.id,
      fromNodeId: from.nodeId,
      fromTable: from.table,
      fromColumn: from.column,
      toNodeId: to.nodeId,
      toTable: to.table,
      toColumn: to.column,
      type,
      ...(constraintName ? { constraintName } : {}),
    }];
  });
}

export function filterERDRelationships(rows: ERDRelationshipRow[], search: string) {
  const query = search.trim().toLowerCase();
  return rows
    .filter(row => !query || `${row.fromTable}.${row.fromColumn} ${row.toTable}.${row.toColumn}`.toLowerCase().includes(query))
    .sort((a, b) => a.fromTable.localeCompare(b.fromTable)
      || a.fromColumn.localeCompare(b.fromColumn)
      || a.toTable.localeCompare(b.toTable));
}
