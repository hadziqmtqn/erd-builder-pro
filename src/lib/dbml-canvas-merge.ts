import type { Node, Edge } from '@xyflow/react';
import type { Entity } from '@/types';
import { findMatchingCanvasEdge } from '@/lib/dbml-converter';

function remapCol(handle: string | null | undefined, colMap: Map<string, string>): string | null | undefined {
  if (!handle) return handle;
  return handle.replace(/^(col-)([\w-]+)(-source|-target)(-[lr])?$/, (_, pre, id, suffix, lr) => {
    const mapped = colMap.get(id);
    return mapped ? `${pre}${mapped}${suffix}${lr || ''}` : _;
  });
}


export function mergeDBMLCanvas(newNodes: Node<Entity>[], newEdges: Edge[], nodes: Node<Entity>[], edges: Edge[]) {
    const nodeIdMap = new Map<string, string>();
    // Deep clone edges so we can mutate handles for column remapping
    const clonedEdges = newEdges.map(e => ({ ...e }));
    const mergedNodes = newNodes.map(n => {
      const existing = nodes.find(cur => cur.data.name.toLowerCase() === n.data.name.toLowerCase());
      if (existing) {
        nodeIdMap.set(n.id, existing.id);
        // Remap parser column IDs → canvas column IDs by name match
        const colMap = new Map<string, string>();
        n.data.columns = n.data.columns.map(nc => {
          const ec = existing.data.columns.find(c => c.name.toLowerCase() === nc.name.toLowerCase());
          if (ec) {
            colMap.set(nc.id, ec.id);
            // Preserve enum_values and ENUM type from canvas
            // (parser loses enum_values during DBML→SQL→ERD roundtrip)
            return { ...nc, id: ec.id, name: ec.name,
              enum_name: nc.enum_name || ec.enum_name,
              enum_values: nc.enum_values || ec.enum_values,
              comment: nc.comment || ec.comment,
              max_length: nc.max_length ?? ec.max_length,
              numeric_precision: nc.numeric_precision ?? ec.numeric_precision,
              numeric_scale: nc.numeric_scale ?? ec.numeric_scale,
              type: (ec.type.toUpperCase() === 'ENUM' && ec.enum_values && nc.type.toUpperCase() !== 'ENUM')
                ? ec.type : nc.type };
          }
          return nc;
        });
        n.data.constraints = (n.data.constraints || []).map(constraint => ({
          ...constraint,
          entity_id: existing.id,
          column_ids: (constraint.column_ids || []).map(id => colMap.get(id) || id),
        }));
        n.data.indexes = (n.data.indexes || []).map(index => ({
          ...index,
          entity_id: existing.id,
          column_ids: (index.column_ids || []).map(id => colMap.get(id) || id),
        }));
        // Remap edge handles to use canvas column IDs
        for (const e of clonedEdges) {
          if (e.source === n.id) e.sourceHandle = remapCol(e.sourceHandle, colMap);
          if (e.target === n.id) e.targetHandle = remapCol(e.targetHandle, colMap);
        }
        return { ...n, id: existing.id, position: existing.position,
          data: { ...n.data, name: existing.data.name, comment: n.data.comment ?? existing.data.comment, id: existing.data.id, x: existing.data.x, y: existing.data.y,
            color: existing.data.color, collapsed: existing.data.collapsed,
            hidden_columns: existing.data.hidden_columns, note: existing.data.note } };
      }
      // New table: column IDs are already UUIDs from parser — pass through
      return n;
    });

    // Remap edge node IDs. Existing canvas relations keep their user-chosen
    // handle sides; DBML only supplies the schema, not edge placement.
    const mergedEdges = clonedEdges.map(e => {
      const srcId = nodeIdMap.get(e.source) || e.source;
      const tgtId = nodeIdMap.get(e.target) || e.target;
      const srcColId = e.sourceHandle?.replace(/^col-/, '').replace(/-(source|target)(-[lr])?$/, '') || '';
      const tgtColId = e.targetHandle?.replace(/^col-/, '').replace(/-(source|target)(-[lr])?$/, '') || '';
      const existingEdge = findMatchingCanvasEdge(edges, srcId, tgtId, e.sourceHandle, e.targetHandle);
      if (existingEdge) {
        return { ...e, id: existingEdge.id, source: srcId, target: tgtId,
          sourceHandle: existingEdge.sourceHandle, targetHandle: existingEdge.targetHandle };
      }

      const srcNode = mergedNodes.find(n => n.id === srcId);
      const tgtNode = mergedNodes.find(n => n.id === tgtId);
      const sx = srcNode?.position.x ?? 0;
      const tx = tgtNode?.position.x ?? 0;
      const srcSuffix = sx < tx ? 'source' : 'source-l';
      const tgtSuffix = sx < tx ? 'target' : 'target-r';

      return {
        ...e,
        source: srcId,
        target: tgtId,
        sourceHandle: srcColId ? `col-${srcColId}-${srcSuffix}` : undefined,
        targetHandle: tgtColId ? `col-${tgtColId}-${tgtSuffix}` : undefined,
      };
    });

  return { nodes: mergedNodes, edges: mergedEdges };
}
