import type { Edge, Node } from '@xyflow/react';
import type { Column, Entity } from '../../shared/types';

export const erdColumnKey = (nodeId: string, columnId: string) => `${nodeId}\u0000${columnId}`;
export const erdSourceColumnKey = (tableName: string, columnName: string) =>
  `${tableName.toLowerCase()}\u0000${columnName.toLowerCase()}`;

export interface ErdIndexes {
  nodesById: Map<string, Node<Entity>>;
  columnsByNodeAndId: Map<string, Column>;
  edgesByRelationKey: Map<string, Edge[]>;
  edgesByRelationName: Map<string, Edge[]>;
  edgesBySourceColumnName: Map<string, Edge[]>;
}

function addEdge(index: Map<string, Edge[]>, key: string | null, edge: Edge) {
  if (!key) return;
  const edges = index.get(key);
  if (edges) edges.push(edge);
  else index.set(key, [edge]);
}

function columnIdFromHandle(handle?: string | null) {
  return handle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') || null;
}

function relationKey(edge: Edge) {
  const sourceColumnId = columnIdFromHandle(edge.sourceHandle);
  const targetColumnId = columnIdFromHandle(edge.targetHandle);
  if (!sourceColumnId || !targetColumnId) return null;
  return [`${edge.source}:${sourceColumnId}`, `${edge.target}:${targetColumnId}`].sort().join('::');
}

export function buildErdIndexes(nodes: Node<Entity>[], edges: Edge[]): ErdIndexes {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const columnsByNodeAndId = new Map<string, Column>();

  for (const node of nodes) {
    for (const column of node.data.columns) {
      const ids = [String(column.id)];
      const legacyUid = (column as Column & { uid?: string }).uid;
      if (legacyUid && legacyUid !== column.id) ids.push(String(legacyUid));
      for (const id of ids) columnsByNodeAndId.set(erdColumnKey(node.id, id), column);
    }
  }

  const edgesByRelationKey = new Map<string, Edge[]>();
  const edgesByRelationName = new Map<string, Edge[]>();
  const edgesBySourceColumnName = new Map<string, Edge[]>();

  for (const edge of edges) {
    addEdge(edgesByRelationKey, relationKey(edge), edge);

    const sourceColumnId = columnIdFromHandle(edge.sourceHandle);
    const targetColumnId = columnIdFromHandle(edge.targetHandle);
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    const sourceColumn = sourceColumnId && sourceNode
      ? columnsByNodeAndId.get(erdColumnKey(sourceNode.id, sourceColumnId))
      : undefined;
    const targetColumn = targetColumnId && targetNode
      ? columnsByNodeAndId.get(erdColumnKey(targetNode.id, targetColumnId))
      : undefined;

    if (!sourceNode || !targetNode || !sourceColumn || !targetColumn) continue;

    const sourceName = sourceColumn.name.toLowerCase();
    const targetName = targetColumn.name.toLowerCase();
    addEdge(
      edgesByRelationName,
      [`${sourceNode.id}:${sourceName}`, `${targetNode.id}:${targetName}`].sort().join('::'),
      edge,
    );
    addEdge(edgesBySourceColumnName, erdSourceColumnKey(sourceNode.data.name, sourceName), edge);
  }

  return { nodesById, columnsByNodeAndId, edgesByRelationKey, edgesByRelationName, edgesBySourceColumnName };
}
