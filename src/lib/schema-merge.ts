import { Edge, Node } from '@xyflow/react';
import { Column, Entity } from '@/types';
import { DiffResult, relationKey } from './schema-diff';

const key = (value: string) => value.trim().toLowerCase();
const columnIdFromHandle = (handle?: string | null) => handle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
const handleWithColumn = (handle: string | null | undefined, columnId: string, side: 'source' | 'target') =>
  `col-${columnId}${handle?.match(/-(source|target)(-(l|r))?$/)?.[0] || `-${side}`}`;

function edgeForFinalNodes(edge: Edge, proposedNodes: Node<Entity>[], finalNodes: Node<Entity>[]): Edge | null {
  const source = proposedNodes.find(node => node.id === edge.source);
  const target = proposedNodes.find(node => node.id === edge.target);
  const sourceColumn = source?.data.columns.find(column => column.id === columnIdFromHandle(edge.sourceHandle));
  const targetColumn = target?.data.columns.find(column => column.id === columnIdFromHandle(edge.targetHandle));
  const finalSource = source && finalNodes.find(node => key(node.data.name) === key(source.data.name));
  const finalTarget = target && finalNodes.find(node => key(node.data.name) === key(target.data.name));
  const finalSourceColumn = finalSource && sourceColumn && finalSource.data.columns.find(column => key(column.name) === key(sourceColumn.name));
  const finalTargetColumn = finalTarget && targetColumn && finalTarget.data.columns.find(column => key(column.name) === key(targetColumn.name));
  if (!finalSource || !finalTarget || !finalSourceColumn || !finalTargetColumn) return null;
  return {
    ...edge,
    source: finalSource.id,
    target: finalTarget.id,
    sourceHandle: handleWithColumn(edge.sourceHandle, finalSourceColumn.id, 'source'),
    targetHandle: handleWithColumn(edge.targetHandle, finalTargetColumn.id, 'target'),
  };
}

export function mergeSchemaChanges(
  currentNodes: Node<Entity>[], currentEdges: Edge[], proposedNodes: Node<Entity>[], proposedEdges: Edge[], diff: DiffResult, approvedIds: string[],
) {
  const approved = new Set(approvedIds);
  const changes = new Map(diff.changes.map(change => [change.id, change]));
  const proposedByName = new Map(proposedNodes.map(node => [key(node.data.name), node]));
  const currentByName = new Map(currentNodes.map(node => [key(node.data.name), node]));
  const finalNodes: Node<Entity>[] = [];

  for (const [name, current] of currentByName) {
    const proposed = proposedByName.get(name);
    const tableChange = changes.get(`table:${name}`);
    if (!proposed) {
      if (!tableChange || !approved.has(tableChange.id)) finalNodes.push(current);
      continue;
    }
    const applyTableMetadata = !!tableChange && approved.has(tableChange.id);
    const columns = current.data.columns.flatMap(currentColumn => {
      const columnName = key(currentColumn.name);
      const proposedColumn = proposed.data.columns.find(column => key(column.name) === columnName);
      const change = changes.get(`column:${name}.${columnName}`);
      if (!proposedColumn) return change && approved.has(change.id) ? [] : [currentColumn];
      return [change && approved.has(change.id) ? proposedColumn : currentColumn];
    });
    for (const proposedColumn of proposed.data.columns) {
      const columnName = key(proposedColumn.name);
      if (current.data.columns.some(column => key(column.name) === columnName)) continue;
      const change = changes.get(`column:${name}.${columnName}`);
      if (change && approved.has(change.id)) columns.push(proposedColumn);
    }
    const finalColumnIds = new Set(columns.map(column => String(column.id)));
    const metadataFitsColumns = (columnIds: string[] = []) => columnIds.every(id => finalColumnIds.has(String(id)));
    finalNodes.push({
      ...current,
      data: {
        ...current.data,
        ...(applyTableMetadata ? {
          comment: proposed.data.comment,
          constraints: (proposed.data.constraints || []).filter(item => metadataFitsColumns(item.column_ids)),
          indexes: (proposed.data.indexes || []).filter(item => metadataFitsColumns(item.column_ids)),
        } : {}),
        columns: columns as Column[],
      },
    });
  }
  for (const [name, proposed] of proposedByName) {
    if (currentByName.has(name)) continue;
    const change = changes.get(`table:${name}`);
    if (change && approved.has(change.id)) finalNodes.push(proposed);
  }

  const finalEdges = currentEdges.filter(edge => edgeForFinalNodes(edge, currentNodes, finalNodes));
  const currentRelations = new Map(currentEdges.flatMap(edge => {
    const relation = relationKey(edge, currentNodes);
    return relation ? [[relation, edge] as const] : [];
  }));
  for (const change of diff.changes.filter(change => change.kind === 'relation' && approved.has(change.id))) {
    const relation = change.id.replace(/^relation:/, '');
    const existing = currentRelations.get(relation);
    if (existing) {
      const index = finalEdges.findIndex(edge => relationKey(edge, currentNodes) === relation);
      if (index >= 0) finalEdges.splice(index, 1);
    }
    if (change.state !== 'deleted' && change.proposed && 'source' in change.proposed) {
      const remapped = edgeForFinalNodes(change.proposed as Edge, proposedNodes, finalNodes);
      if (remapped) finalEdges.push(remapped);
    }
  }
  return { nodes: finalNodes, edges: finalEdges };
}
