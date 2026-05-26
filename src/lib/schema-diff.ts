import { Node, Edge } from '@xyflow/react';
import { Entity } from '@/types';

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

  // 1. Process proposed nodes (NEW or MODIFIED or UNCHANGED)
  proposedNodes.forEach(pNode => {
    const originalNode = currentNodes.find(cNode => cNode.id === pNode.id);
    
    if (!originalNode) {
      // NEW Table
      newCount++;
      diffNodes.push({
        ...pNode,
        data: {
          ...pNode.data,
          diffState: 'new',
        } as any
      });
    } else {
      // MODIFIED or UNCHANGED Table
      const originalCols = originalNode.data.columns || [];
      const proposedCols = pNode.data.columns || [];
      
      const combinedColumns: any[] = [];
      let columnsChanged = false;

      // Check for new/modified columns in proposed
      proposedCols.forEach(pCol => {
        const originalCol = originalCols.find(cCol => cCol.name.toLowerCase() === pCol.name.toLowerCase());
        if (!originalCol) {
          columnsChanged = true;
          combinedColumns.push({
            ...pCol,
            diffState: 'new',
          });
        } else {
          // Compare characteristics (type, pk, nullable)
          const charChanged = 
            originalCol.type.toLowerCase() !== pCol.type.toLowerCase() ||
            !!originalCol.is_pk !== !!pCol.is_pk ||
            !!originalCol.is_nullable !== !!pCol.is_nullable;
          
          if (charChanged) {
            columnsChanged = true;
            combinedColumns.push({
              ...pCol,
              diffState: 'new', // treat changes as a new version
            });
          } else {
            combinedColumns.push(pCol);
          }
        }
      });

      // Check for deleted columns (in original but not in proposed)
      originalCols.forEach(oCol => {
        const proposedCol = proposedCols.find(pCol => pCol.name.toLowerCase() === oCol.name.toLowerCase());
        if (!proposedCol) {
          columnsChanged = true;
          combinedColumns.push({
            ...oCol,
            diffState: 'deleted',
          });
        }
      });

      if (columnsChanged) {
        modifiedCount++;
        diffNodes.push({
          ...pNode,
          data: {
            ...pNode.data,
            columns: combinedColumns,
            diffState: 'modified',
          } as any
        });
      } else {
        // UNCHANGED
        diffNodes.push(pNode);
      }
    }
  });

  // 2. Process deleted nodes (in current but not in proposed)
  currentNodes.forEach(cNode => {
    const proposedNode = proposedNodes.find(pNode => pNode.id === cNode.id);
    if (!proposedNode) {
      deletedCount++;
      // Mark all columns in deleted node as deleted
      const deletedCols = (cNode.data.columns || []).map(col => ({
        ...col,
        diffState: 'deleted',
      }));

      diffNodes.push({
        ...cNode,
        data: {
          ...cNode.data,
          columns: deletedCols,
          diffState: 'deleted',
        } as any
      });
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
