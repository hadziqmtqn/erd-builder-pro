import { Node, Edge } from '@xyflow/react';
import { Entity, Column } from '@/types';

export interface DiffResult {
  nodes: Node<Entity>[];
  edges: Edge[];
  newCount: number;
  modifiedCount: number;
  deletedCount: number;
}

export function computeSchemaDiff(
  currentNodes: Node<Entity>[],
  currentEdges: Edge[],
  proposedNodes: Node<Entity>[],
  proposedEdges: Edge[]
): DiffResult {
  const diffNodes: Node<Entity>[] = [];
  let newCount = 0;
  let modifiedCount = 0;
  let deletedCount = 0;

  // Build name-based lookup tables
  const currentByName = new Map<string, Node<Entity>>();
  currentNodes.forEach(n => currentByName.set(n.data.name.toLowerCase(), n));
  const proposedByName = new Map<string, Node<Entity>>();
  proposedNodes.forEach(n => proposedByName.set(n.data.name.toLowerCase(), n));

  // 1. Process all unique names from both sets
  const allNames = new Set([
    ...currentByName.keys(),
    ...proposedByName.keys(),
  ]);

  allNames.forEach(name => {
    const origNode = currentByName.get(name);
    const propNode = proposedByName.get(name);

    if (!origNode && propNode) {
      // NEW table — only in proposed
      newCount++;
      diffNodes.push({
        ...propNode,
        data: {
          ...propNode.data,
          diffState: 'new' as const,
        },
      });
    } else if (origNode && !propNode) {
      // DELETED table — only in current
      deletedCount++;
      const deletedCols = (origNode.data.columns || []).map(col => ({
        ...col,
        diffState: 'deleted' as const,
      }));
      diffNodes.push({
        ...origNode,
        data: {
          ...origNode.data,
          columns: deletedCols,
          diffState: 'deleted' as const,
        },
      });
    } else if (origNode && propNode) {
      // EXISTING — compare columns
      const origCols = origNode.data.columns || [];
      const propCols = propNode.data.columns || [];
      const origColMap = new Map(origCols.map(c => [c.name.toLowerCase(), c]));
      const propColMap = new Map(propCols.map(c => [c.name.toLowerCase(), c]));
      const allColNames = new Set([...origColMap.keys(), ...propColMap.keys()]);
      const combinedColumns: (Column & { diffState?: 'new' | 'deleted' })[] = [];
      let columnsChanged = false;

      allColNames.forEach(colName => {
        const origCol = origColMap.get(colName);
        const propCol = propColMap.get(colName);

        if (!origCol && propCol) {
          columnsChanged = true;
          combinedColumns.push({ ...propCol, diffState: 'new' });
        } else if (origCol && !propCol) {
          columnsChanged = true;
          combinedColumns.push({ ...origCol, diffState: 'deleted' });
        } else if (origCol && propCol) {
          const changed =
            origCol.type.toLowerCase() !== propCol.type.toLowerCase() ||
            !!origCol.is_pk !== !!propCol.is_pk ||
            !!origCol.is_nullable !== !!propCol.is_nullable ||
            (origCol.comment || '') !== (propCol.comment || '') ||
            (origCol.max_length ?? null) !== (propCol.max_length ?? null) ||
            (origCol.numeric_precision ?? null) !== (propCol.numeric_precision ?? null) ||
            (origCol.numeric_scale ?? null) !== (propCol.numeric_scale ?? null);
          if (changed) {
            columnsChanged = true;
            combinedColumns.push({ ...propCol, diffState: 'new' });
          } else {
            combinedColumns.push(origCol);
          }
        }
      });

      // Preserve original position (so user sees where the table is on the real canvas)
      diffNodes.push({
        ...(columnsChanged ? propNode : origNode),
        position: origNode.position,
        data: {
          ...(propNode.data),
          columns: combinedColumns,
          diffState: columnsChanged ? ('modified' as const) : undefined,
        },
      });
      if (columnsChanged) modifiedCount++;
    }
  });

  // 3. For edges, keep proposed edges
  return {
    nodes: diffNodes,
    edges: proposedEdges,
    newCount,
    modifiedCount,
    deletedCount,
  };
}
