import { Node, Edge } from '@xyflow/react';
import { Entity, Column } from '@/types';
import { parseSQLToERD } from '@/lib/sqlParser';

/**
 * Extracts SQL from an AI response that may contain markdown fences.
 * Handles ```sql ... ```, ``` ... ```, and raw SQL text.
 */
function extractSQLFromMarkdown(text: string): string {
  const sqlBlockRegex = /```(?:\w*)\n?([\s\S]*?)```/g;
  const blocks: string[] = [];
  let match;
  while ((match = sqlBlockRegex.exec(text)) !== null) {
    const content = match[1].trim();
    if (content.length > 0) blocks.push(content);
  }
  if (blocks.length > 0) return blocks.join('\n\n');
  return text.trim();
}

/**
 * Merges newly parsed tables/relationships into the current diagram.
 * - New tables (name not in current nodes) → added
 * - Existing tables (matching name) → columns merged (AI columns win)
 * - New relationships → added if source + target nodes exist
 */
function mergeIntoDiagram(
  currentNodes: Node<Entity>[],
  currentEdges: Edge[],
  parsedNodes: Node<Entity>[],
  parsedEdges: Edge[],
): { nodes: Node<Entity>[]; edges: Edge[] } {
  const nameToNode = new Map<string, Node<Entity>>();
  for (const n of currentNodes) {
    nameToNode.set(n.data.name.toLowerCase(), n);
  }

  const mergedNodes = [...currentNodes];

  for (const parsedNode of parsedNodes) {
    const key = parsedNode.data.name.toLowerCase();
    const existing = nameToNode.get(key);

    if (existing) {
      // Update existing node's columns (AI response is authoritative for columns)
      mergedNodes[mergedNodes.indexOf(existing)] = {
        ...existing,
        data: {
          ...existing.data,
          columns: parsedNode.data.columns,
        },
      };
    } else {
      // New table — compute a position near existing nodes
      const maxX = currentNodes.reduce((max, n) => Math.max(max, n.position.x + 350), 50);
      const maxY = currentNodes.reduce((max, n) => Math.max(max, n.position.y), 50);
      mergedNodes.push({
        ...parsedNode,
        position: {
          x: maxX > 1200 ? 50 : maxX,
          y: maxX > 1200 ? maxY + 400 : maxY,
        },
      });
    }
  }

  // Build name→id map for edge matching
  const nameToId = new Map<string, string>();
  for (const n of mergedNodes) {
    nameToId.set(n.data.name.toLowerCase(), n.id);
  }

  // Merge edges — match by source/target table name, avoid duplicates
  const existingEdgeKeys = new Set<string>();
  for (const e of currentEdges) {
    const sourceNode = mergedNodes.find(n => n.id === e.source);
    const targetNode = mergedNodes.find(n => n.id === e.target);
    if (sourceNode && targetNode) {
      existingEdgeKeys.add(`${sourceNode.data.name.toLowerCase()}-${targetNode.data.name.toLowerCase()}`);
    }
  }

  const mergedEdges = [...currentEdges];
  for (const parsedEdge of parsedEdges) {
    const sourceName = parsedEdges.length > 0
      ? parsedNodes.find(n => n.id === parsedEdge.source)?.data.name || ''
      : '';
    const targetName = parsedEdges.length > 0
      ? parsedNodes.find(n => n.id === parsedEdge.target)?.data.name || ''
      : '';

    // Try from edge's source/target node data
    const sNode = parsedNodes.find(n => n.id === parsedEdge.source);
    const tNode = parsedNodes.find(n => n.id === parsedEdge.target);
    const sName = sNode?.data.name || '';
    const tName = tNode?.data.name || '';
    const edgeKey = `${sName.toLowerCase()}-${tName.toLowerCase()}`;

    if (!sName || !tName) continue;
    if (existingEdgeKeys.has(edgeKey)) continue;

    const sId = nameToId.get(sName.toLowerCase());
    const tId = nameToId.get(tName.toLowerCase());
    if (!sId || !tId) continue;

    // Map column handles from parsed to merged nodes
    const sMergedNode = mergedNodes.find(n => n.id === sId);
    const tMergedNode = mergedNodes.find(n => n.id === tId);

    let sourceHandle = parsedEdge.sourceHandle;
    let targetHandle = parsedEdge.targetHandle;

    if (sourceHandle && sMergedNode) {
      const parsedColId = sourceHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
      const parsedCol = sNode?.data.columns.find((c: any) => c.id === parsedColId);
      if (parsedCol) {
        const mergedCol = sMergedNode.data.columns.find((c: any) => c.name.toLowerCase() === parsedCol.name.toLowerCase());
        if (mergedCol) {
          sourceHandle = `col-${mergedCol.id}-source`;
        }
      }
    }

    if (targetHandle && tMergedNode) {
      const parsedColId = targetHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
      const parsedCol = tNode?.data.columns.find((c: any) => c.id === parsedColId);
      if (parsedCol) {
        const mergedCol = tMergedNode.data.columns.find((c: any) => c.name.toLowerCase() === parsedCol.name.toLowerCase());
        if (mergedCol) {
          targetHandle = `col-${mergedCol.id}-target`;
        }
      }
    }

    mergedEdges.push({
      ...parsedEdge,
      source: sId,
      target: tId,
      sourceHandle,
      targetHandle,
    });

    existingEdgeKeys.add(edgeKey);
  }

  return { nodes: mergedNodes, edges: mergedEdges };
}

function extractJSONFromMarkdown(text: string): string {
  const jsonBlockRegex = /```(?:json)?\n?([\s\S]*?)```/g;
  const blocks: string[] = [];
  let match;
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    const content = match[1].trim();
    if (content.length > 0) blocks.push(content);
  }
  if (blocks.length > 0) return blocks.join('\n');
  return text.trim();
}

interface ColumnMutation {
  type: 'add_column' | 'drop_column' | 'modify_column';
  column?: any;
  changes?: any;
}

interface MutationsPayload {
  mutations: ColumnMutation[];
}

/**
 * Applies column mutations parsed from AI response to a single entity node.
 */
function applyColumnChanges(
  currentNodes: Node<Entity>[],
  selectedNodeId: string,
  aiResponse: string,
): { nodes: Node<Entity>[] } | null {
  const json = extractJSONFromMarkdown(aiResponse);
  let payload: MutationsPayload;
  try {
    payload = JSON.parse(json);
  } catch {
    // Try to find JSON object in text
    const objMatch = json.match(/\{[\s\S]*"mutations"[\s\S]*\}/);
    if (!objMatch) return null;
    try {
      payload = JSON.parse(objMatch[0]);
    } catch {
      return null;
    }
  }

  if (!payload.mutations || !Array.isArray(payload.mutations) || payload.mutations.length === 0) {
    return null;
  }

  const nodeIndex = currentNodes.findIndex(n => n.id === selectedNodeId);
  if (nodeIndex === -1) return null;

  const targetNode = currentNodes[nodeIndex];
  let columns = [...(targetNode.data.columns || [])];

  for (const mutation of payload.mutations) {
    switch (mutation.type) {
      case 'add_column': {
        if (!mutation.column || !mutation.column.name || !mutation.column.type) continue;
        const newColumn: Column = {
          id: `col_${Date.now()}_${columns.length}`,
          name: mutation.column.name,
          type: mutation.column.type,
          is_pk: mutation.column.is_pk || false,
          is_nullable: mutation.column.is_nullable || false,
          sort_order: columns.length,
        };
        columns.push(newColumn);
        break;
      }

      case 'drop_column': {
        const colName = typeof mutation.column === 'string' ? mutation.column : mutation.column?.name;
        if (!colName) continue;
        columns = columns.filter(c => c.name.toLowerCase() !== colName.toLowerCase());
        break;
      }

      case 'modify_column': {
        const colName = mutation.column?.name;
        if (!colName || !mutation.changes) continue;
        const idx = columns.findIndex(c => c.name.toLowerCase() === colName.toLowerCase());
        if (idx === -1) continue;
        columns[idx] = {
          ...columns[idx],
          ...(mutation.changes.type !== undefined && { type: mutation.changes.type }),
          ...(mutation.changes.is_nullable !== undefined && { is_nullable: mutation.changes.is_nullable }),
          ...(mutation.changes.is_pk !== undefined && { is_pk: mutation.changes.is_pk }),
          ...(mutation.changes.name !== undefined && { name: mutation.changes.name }),
        };
        break;
      }
    }
  }

  const updatedNodes = [...currentNodes];
  updatedNodes[nodeIndex] = {
    ...targetNode,
    data: {
      ...targetNode.data,
      columns,
    },
  };

  return { nodes: updatedNodes };
}

export interface ErdApplyResult {
  nodes: Node<Entity>[];
  edges: Edge[];
  action: string;
}

/**
 * Applies AI response to ERD diagram based on action type.
 * Returns the new nodes and edges state for the caller to apply.
 *
 * For `erd-generate-sql`:
 *   - Extracts SQL from markdown, parses with parseSQLToERD
 *   - Merges new tables/relationships into current diagram
 *
 * Other ERD actions (explain-table, suggest-indexes, seed-data)
 * return null — they are read-only.
 */
export function applyToErdContent(
  currentNodes: Node<Entity>[],
  currentEdges: Edge[],
  actionId: string,
  aiResponse: string,
  extra?: { selectedNodeId?: string | null },
): ErdApplyResult | null {
  switch (actionId) {
    case 'erd-generate-sql': {
      const sql = extractSQLFromMarkdown(aiResponse);
      if (!sql) return null;

      // Check if the AI response is already DDL or just chat text
      const hasDDL = /CREATE\s+TABLE/i.test(sql);
      if (!hasDDL) return null;

      const parsed = parseSQLToERD(sql);
      if (parsed.nodes.length === 0) return null;

      const { nodes, edges } = mergeIntoDiagram(currentNodes, currentEdges, parsed.nodes, parsed.edges);
      return { nodes, edges, action: 'erd-generate-sql' };
    }

    case 'erd-edit-column': {
      if (!extra?.selectedNodeId) return null;
      const result = applyColumnChanges(currentNodes, extra.selectedNodeId, aiResponse);
      if (!result) return null;
      return { nodes: result.nodes, edges: currentEdges, action: 'erd-edit-column' };
    }

    // Read-only actions — no diagram mutations
    case 'erd-explain-table':
    case 'erd-suggest-indexes':
    case 'erd-seed-data':
    default:
      return null;
  }
}
