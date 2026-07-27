import { Node, Edge } from '@xyflow/react';
import { Entity, Column } from '@/types';
import { parseSQLToERD, parseSqlDdl } from '@/lib/sqlParser';
import { dbmlToERD } from '@/lib/dbml-converter';
import { COLUMN_TYPES } from '@/lib/utils';
import { parseTypeModifiers, supportsColumnLength, supportsNumericPrecision } from '@/lib/column-metadata';
import { extractDBML } from '../chatUtils';

function cleanIdentifier(id: string): string {
  return id.replace(/["`[\]]/g, '').trim();
}

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
      // Update existing node's columns — preserve existing column IDs so edge handles stay valid
      const mergedColumns = parsedNode.data.columns.map((parsedCol: Column) => {
        const existingCol = existing.data.columns.find(
          (c: Column) => c.name.toLowerCase() === parsedCol.name.toLowerCase()
        );
        return existingCol ? { ...parsedCol, id: existingCol.id } : parsedCol;
      });
      mergedNodes[mergedNodes.indexOf(existing)] = {
        ...existing,
        selected: undefined,
        data: {
          ...existing.data,
          columns: mergedColumns,
        },
      };
    } else {
      // New table — compute a position near existing nodes
      const maxX = currentNodes.reduce((max, n) => Math.max(max, n.position.x + 350), 50);
      const maxY = currentNodes.reduce((max, n) => Math.max(max, n.position.y), 50);
      mergedNodes.push({
        ...parsedNode,
        selected: undefined,
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

    // Compute position-based suffix: source on left → -source/-target-r, source on right → -source-l/-target
    const sx = sMergedNode?.position.x ?? 0;
    const tx = tMergedNode?.position.x ?? 0;
    const srcSuffix = sx < tx ? 'source' : 'source-l';
    const tgtSuffix = sx < tx ? 'target' : 'target-r';

    if (sourceHandle && sMergedNode) {
      const parsedColId = sourceHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
      const parsedCol = sNode?.data.columns.find((c: any) => c.id === parsedColId);
      if (parsedCol) {
        const mergedCol = sMergedNode.data.columns.find((c: any) => c.name.toLowerCase() === parsedCol.name.toLowerCase());
        if (mergedCol) {
          const colId = String(mergedCol.id).replace(/^col-/, '');
          sourceHandle = `col-${colId}-${srcSuffix}`;
        }
      }
    }

    if (targetHandle && tMergedNode) {
      const parsedColId = targetHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
      const parsedCol = tNode?.data.columns.find((c: any) => c.id === parsedColId);
      if (parsedCol) {
        const mergedCol = tMergedNode.data.columns.find((c: any) => c.name.toLowerCase() === parsedCol.name.toLowerCase());
        if (mergedCol) {
          const colId = String(mergedCol.id).replace(/^col-/, '');
          targetHandle = `col-${colId}-${tgtSuffix}`;
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

export interface ErdApplyResult {
  nodes: Node<Entity>[];
  edges: Edge[];
  action: string;
}

/**
 * Attempts to parse AI response as multi-table or single-table column mutations.
 *
 * Multi-table format:
 * ```json
 * { "table_name_1": { "mutations": [...] }, "table_name_2": { "mutations": [...] } }
 * ```
 *
 * Single-table format (fallback):
 * ```json
 * { "mutations": [...] }
 * ```
 *
 * Returns null if parsing fails.
 */
function tryParseMultiColumnChanges(
  currentNodes: Node<Entity>[],
  selectedNodeIds: string[],
  primaryNodeId: string | null,
  aiResponse: string,
): Node<Entity>[] | null {
  const jsonStr = extractJSONFromMarkdown(aiResponse);
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!objMatch) return null;
    try { parsed = JSON.parse(objMatch[0]); } catch { return null; }
  }

  if (!parsed || typeof parsed !== 'object') return null;

  // Detect format: if first key maps to an object with "mutations" array → multi-table
  const topKeys = Object.keys(parsed);
  const isMultiTable = topKeys.length > 0 && topKeys.some(k => {
    const v = parsed[k];
    return v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.mutations);
  });

  let updatedNodes = [...currentNodes];

  if (isMultiTable) {
    // Multi-table: {"table_name": { "mutations": [...] }}
    const nameToNode = new Map<string, { index: number; node: Node<Entity> }>();
    updatedNodes.forEach((n, i) => nameToNode.set(n.data.name.toLowerCase(), { index: i, node: n }));

    for (const [tableName, payload] of Object.entries(parsed)) {
      if (!payload || typeof payload !== 'object' || !Array.isArray(payload.mutations)) continue;
      const entry = nameToNode.get(tableName.toLowerCase());
      if (!entry) continue;

      const result = applySingleColumnChanges(entry.node, payload.mutations);
      if (result) {
        updatedNodes[entry.index] = result;
      }
    }
  } else {
    // Single-table: {"mutations": [...]}
    // Try to infer which selected node this mutation targets.
    // Strategy: extract referenced column names from mutations, find which selected node has those columns.
    const mutations = (parsed.mutations || []) as ColumnMutation[];
    if (mutations.length === 0) return null;

    // Collect column names mentioned in mutations
    const mentionedColNames = new Set<string>();
    for (const m of mutations) {
      if (m.type === 'drop_column') {
        const name = typeof m.column === 'string' ? m.column : m.column?.name;
        if (name) mentionedColNames.add(name.toLowerCase());
      } else if (m.type === 'add_column') {
        // add_column doesn't reference existing columns; skip
      } else if (m.type === 'modify_column') {
        if (m.column?.name) mentionedColNames.add(m.column.name.toLowerCase());
      }
    }

    // If we have column references, find the node among selected that has the most matches
    let targetId = primaryNodeId || selectedNodeIds[0] || '';
    if (mentionedColNames.size > 0 && selectedNodeIds.length > 1) {
      let bestMatchId = targetId;
      let bestMatchCount = -1;
      for (const nid of selectedNodeIds) {
        const node = updatedNodes.find(n => n.id === nid);
        if (!node) continue;
        const matchCount = (node.data.columns || []).filter(
          c => mentionedColNames.has(c.name.toLowerCase())
        ).length;
        if (matchCount > bestMatchCount) {
          bestMatchCount = matchCount;
          bestMatchId = nid;
        }
      }
      if (bestMatchCount >= 0) targetId = bestMatchId;
    }

    const nodeIndex = updatedNodes.findIndex(n => n.id === targetId);
    if (nodeIndex === -1) return null;

    const result = applySingleColumnChanges(updatedNodes[nodeIndex], mutations);
    if (!result) return null;
    updatedNodes[nodeIndex] = result;
  }

  return updatedNodes;
}

/**
 * Applies column mutations to a single entity node.
 * Returns updated node or null if no changes made.
 */
function applySingleColumnChanges(
  node: Node<Entity>,
  mutations: ColumnMutation[],
): Node<Entity> | null {
  if (!mutations || !Array.isArray(mutations) || mutations.length === 0) return null;

  let columns = [...(node.data.columns || [])];
  let changed = false;

  for (const mutation of mutations) {
    switch (mutation.type) {
      case 'add_column': {
        if (!mutation.column || !mutation.column.name || !mutation.column.type) continue;
        const rawType = mutation.column.type.toUpperCase().replace(/\(.*\)/, '');
        const normalizedType = COLUMN_TYPES.includes(rawType) ? rawType : 'VARCHAR';
        const modifiers = parseTypeModifiers(mutation.column.type);
        const maxLength = mutation.column.max_length ?? mutation.column.maxLength ?? modifiers.max_length;
        const numericPrecision = mutation.column.numeric_precision ?? mutation.column.numericPrecision ?? modifiers.numeric_precision;
        const numericScale = mutation.column.numeric_scale ?? mutation.column.numericScale ?? modifiers.numeric_scale;
        const hasLength = supportsColumnLength(normalizedType);
        const hasPrecision = supportsNumericPrecision(normalizedType);
        columns.push({
          id: `col_${Date.now()}_${columns.length}`,
          name: mutation.column.name,
          type: normalizedType,
          is_pk: mutation.column.is_pk || false,
          is_nullable: mutation.column.is_nullable || false,
          comment: mutation.column.comment || '',
          max_length: hasLength && maxLength ? Number(maxLength) : null,
          numeric_precision: hasPrecision && numericPrecision ? Number(numericPrecision) : null,
          numeric_scale: hasPrecision && numericScale !== null && numericScale !== undefined ? Number(numericScale) : null,
          sort_order: columns.length,
        });
        changed = true;
        break;
      }

      case 'drop_column': {
        const colName = typeof mutation.column === 'string' ? mutation.column : mutation.column?.name;
        if (!colName) continue;
        const before = columns.length;
        columns = columns.filter(c => c.name.toLowerCase() !== colName.toLowerCase());
        if (columns.length !== before) changed = true;
        break;
      }

      case 'modify_column': {
        const colName = mutation.column?.name;
        if (!colName || !mutation.changes) continue;
        const idx = columns.findIndex(c => c.name.toLowerCase() === colName.toLowerCase());
        if (idx === -1) continue;
        const typeModifiers = mutation.changes.type ? parseTypeModifiers(mutation.changes.type) : null;
        columns[idx] = {
          ...columns[idx],
          ...(mutation.changes.type !== undefined && {
            type: (() => {
              const rt = mutation.changes.type.toUpperCase().replace(/\(.*\)/, '');
              return COLUMN_TYPES.includes(rt) ? rt : 'VARCHAR';
            })(),
          }),
          ...(mutation.changes.is_nullable !== undefined && { is_nullable: mutation.changes.is_nullable }),
          ...(mutation.changes.is_pk !== undefined && { is_pk: mutation.changes.is_pk }),
          ...(mutation.changes.name !== undefined && { name: mutation.changes.name }),
          ...(mutation.changes.comment !== undefined && { comment: mutation.changes.comment }),
        };
        if (!supportsColumnLength(columns[idx].type)) columns[idx].max_length = null;
        else if ((mutation.changes.max_length ?? mutation.changes.maxLength) !== undefined) columns[idx].max_length = mutation.changes.max_length ?? mutation.changes.maxLength;
        if (!supportsNumericPrecision(columns[idx].type)) {
          columns[idx].numeric_precision = null;
          columns[idx].numeric_scale = null;
        } else {
          if (typeModifiers?.numeric_precision !== null && typeModifiers?.numeric_precision !== undefined) columns[idx].numeric_precision = typeModifiers.numeric_precision;
          if (typeModifiers?.numeric_scale !== null && typeModifiers?.numeric_scale !== undefined) columns[idx].numeric_scale = typeModifiers.numeric_scale;
          if ((mutation.changes.numeric_precision ?? mutation.changes.numericPrecision) !== undefined) columns[idx].numeric_precision = mutation.changes.numeric_precision ?? mutation.changes.numericPrecision;
          if ((mutation.changes.numeric_scale ?? mutation.changes.numericScale) !== undefined) columns[idx].numeric_scale = mutation.changes.numeric_scale ?? mutation.changes.numericScale;
        }
        changed = true;
        break;
      }
    }
  }

  if (!changed) return null;

  return {
    ...node,
    selected: undefined,
    data: {
      ...node.data,
      columns,
    },
  };
}

/**
 * Parses ALTER TABLE ... ADD COLUMN statements from SQL text.
 * Returns columns to add to existing nodes, keyed by table name.
 */
function parseAlterTableAddColumn(sql: string): Map<string, Column[]> {
  const result = new Map<string, Column[]>();
  const parsed = parseSqlDdl(sql);

  for (const alter of parsed.alterAddColumns) {
    const tableName = alter.tableName.toLowerCase();
    const cols = result.get(tableName) || [];

    alter.columns.forEach((c, i) => {
      let rawType = c.type.split('(')[0].trim().toUpperCase();
      if (rawType.startsWith('BIGINT')) rawType = 'BIGINT';
      else if (rawType.startsWith('TINYINT')) rawType = 'BOOLEAN';
      else if (rawType.startsWith('INT')) rawType = 'INT';
      else if (rawType.startsWith('CHAR')) rawType = 'CHAR';
      else if (rawType.startsWith('VARBINARY')) rawType = 'VARBINARY';
      else if (rawType.startsWith('VARCHAR')) rawType = 'VARCHAR';
      else if (rawType === 'SERIAL') rawType = 'INT';
      else if (rawType === 'BIGSERIAL') rawType = 'BIGINT';
      else if (rawType === 'SMALLSERIAL') rawType = 'SMALLINT';
      else if (rawType === 'INTEGER') rawType = 'INT';
      else if (rawType === 'DOUBLE PRECISION') rawType = 'DOUBLE';
      else if (rawType === 'CHARACTER VARYING') rawType = 'VARCHAR';
      else if (rawType === 'CHARACTER') rawType = 'CHAR';
      else if (rawType === 'BOOLEAN') rawType = 'BOOLEAN';
      else if (rawType === 'DATETIME') rawType = 'TIMESTAMP';
      else if (rawType === 'YEAR') rawType = 'INT';

      const normalizedType = COLUMN_TYPES.includes(rawType) ? rawType : 'VARCHAR';

      cols.push({
        id: `col_${Date.now()}_${cols.length}_${i}`,
        name: c.name,
        type: normalizedType,
        is_pk: c.is_pk,
        is_nullable: c.is_nullable,
        enum_values: c.enum_values,
        comment: c.comment || '',
        max_length: c.max_length ?? null,
        numeric_precision: c.numeric_precision ?? null,
        numeric_scale: c.numeric_scale ?? null,
        sort_order: 0,
      });
    });

    result.set(tableName, cols);
  }

  return result;
}

/**
 * Applies AI response to ERD diagram based on action type.
 * Returns the new nodes and edges state for the caller to apply.
 *
 * For `erd-generate-sql`:
 *   - Extracts SQL from markdown, parses with parseSQLToERD
 *   - Merges new tables/relationships into current diagram
 *   - Also handles ALTER TABLE ADD COLUMN to existing tables
 *   - Re-scans SQL for FK references to existing tables and creates missing edges
 *
 * Other ERD actions (explain-table, suggest-indexes, seed-data)
 * return null — they are read-only.
 */
export function applyToErdContent(
  currentNodes: Node<Entity>[],
  currentEdges: Edge[],
  actionId: string,
  aiResponse: string,
  extra?: { selectedNodeId?: string | null; selectedNodeIds?: string[] },
): ErdApplyResult | null {
  switch (actionId) {
    case 'erd-generate-sql': {
      const dbml = extractDBML(aiResponse);
      if (dbml) {
        const parsed = dbmlToERD(dbml);
        if (parsed.nodes.length === 0 && parsed.edges.length === 0) return null;
        const merged = mergeIntoDiagram(currentNodes, currentEdges, parsed.nodes, parsed.edges);
        return { nodes: merged.nodes, edges: merged.edges, action: 'erd-generate-sql' };
      }

      const sql = extractSQLFromMarkdown(aiResponse);
      if (!sql) return null;

      const hasDDL = /(?:CREATE|ALTER)\s+TABLE/i.test(sql);
      if (!hasDDL) return null;

      const parsed = parseSQLToERD(sql);
      const alterColumns = parseAlterTableAddColumn(sql);

      // Nothing to apply if no CREATE TABLE nodes, no ALTER COLUMNs, and no edges
      if (parsed.nodes.length === 0 && alterColumns.size === 0 && parsed.edges.length === 0) return null;

      let mergedNodes = [...currentNodes];
      let mergedEdges = [...currentEdges];

      // Phase 1: merge CREATE TABLE nodes/edges
      if (parsed.nodes.length > 0) {
        const merged = mergeIntoDiagram(currentNodes, currentEdges, parsed.nodes, parsed.edges);
        mergedNodes = merged.nodes;
        mergedEdges = merged.edges;
      }

      // Phase 2: apply ALTER TABLE ADD COLUMN to existing nodes
      if (alterColumns.size > 0) {
        for (const [tableNameKey, newCols] of alterColumns) {
          const idx = mergedNodes.findIndex(n => n.data.name.toLowerCase() === tableNameKey);
          if (idx === -1) continue;
          const node = mergedNodes[idx];
          const existingNames = new Set(node.data.columns.map(c => c.name.toLowerCase()));
          const colsToAdd = newCols.filter(c => !existingNames.has(c.name.toLowerCase()));
          if (colsToAdd.length === 0) continue;
          const maxSort = node.data.columns.reduce((max, c) => Math.max(max, c.sort_order || 0), 0);
          mergedNodes[idx] = {
            ...node,
            selected: undefined,
            data: {
              ...node.data,
              columns: [
                ...node.data.columns,
                ...colsToAdd.map((c, i) => ({ ...c, sort_order: maxSort + i + 1 })),
              ],
            },
          };
        }
      }

      // Second pass: find FK references to tables not in parsed SQL (e.g., existing diagram tables)
      // and ALTER TABLE FK constraints that mention tables created in the same SQL.
      const nameToId = new Map(mergedNodes.map(n => [n.data.name.toLowerCase(), n.id]));
      const existingEdgeKeys = new Set<string>();
      // Track which source columns are already wired up — enforces the strict rule
      // that one FK column can only point to one PK (no polymorphic associations).
      const usedSourceColumns = new Set<string>();
      const extractColIdFromHandle = (h?: string | null) =>
        h ? h.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') : null;
      for (const e of mergedEdges) {
        const sNode = mergedNodes.find(n => n.id === e.source);
        const tNode = mergedNodes.find(n => n.id === e.target);
        if (sNode && tNode) {
          existingEdgeKeys.add(`${sNode.data.name.toLowerCase()}-${tNode.data.name.toLowerCase()}`);
        }
        const sColId = extractColIdFromHandle(e.sourceHandle);
        if (sColId) usedSourceColumns.add(`${e.source}:${sColId}`);
      }

      const additionalEdges: Edge[] = [];
      const tryAddEdge = (sName: string, sourceColName: string, targetTableName: string, targetColName: string) => {
        const sId = nameToId.get(sName.toLowerCase());
        const tId = nameToId.get(targetTableName.toLowerCase());
        if (!sId || !tId) return;

        const edgeKey = `${sName.toLowerCase()}-${targetTableName.toLowerCase()}`;
        if (existingEdgeKeys.has(edgeKey)) return;

        const sNode = mergedNodes.find(n => n.id === sId);
        const tNode = mergedNodes.find(n => n.id === tId);
        if (!sNode || !tNode) return;

        const sCol = sNode.data.columns.find(c => c.name.toLowerCase() === sourceColName.toLowerCase());
        const tCol = tNode.data.columns.find(c => c.name.toLowerCase() === targetColName.toLowerCase());
        if (!sCol || !tCol) return;

        // Strict rule: 1 FK column = max 1 PK. Skip if this source column is already wired.
        if (usedSourceColumns.has(`${sId}:${sCol.id}`)) return;

        const sx = sNode.position.x ?? 0;
        const tx = tNode.position.x ?? 0;
        const srcSuffix = sx < tx ? 'source' : 'source-l';
        const tgtSuffix = sx < tx ? 'target' : 'target-r';
        const sColId = String(sCol.id).replace(/^col-/, '');
        const tColId = String(tCol.id).replace(/^col-/, '');

        additionalEdges.push({
          id: `e-${sId}-${tId}-${Math.random()}`,
          source: sId,
          target: tId,
          sourceHandle: `col-${sColId}-${srcSuffix}`,
          targetHandle: `col-${tColId}-${tgtSuffix}`,
          label: '1:N',
          type: 'smoothstep',
          animated: false,
        });
        existingEdgeKeys.add(edgeKey);
        usedSourceColumns.add(`${sId}:${sCol.id}`);
      };

      // A) Table-level & Inline FOREIGN KEY constraints parsed from CREATE TABLE
      const parsedSchema = parseSqlDdl(sql);
      for (const table of parsedSchema.tables) {
        for (const c of table.constraints) {
          if (c.type === 'FOREIGN_KEY' && c.refTable) {
            const refCols = c.refColumns || [];
            c.columns.forEach((colName, idx) => {
              const targetColName = refCols[idx] || colName;
              tryAddEdge(table.name, colName, c.refTable!, targetColName);
            });
          }
        }
      }

      // B) ALTER TABLE ... ADD FOREIGN KEY constraints
      for (const rel of parsedSchema.alterFks) {
        const targetCols = rel.targetCols || [];
        rel.sourceCols.forEach((colName, idx) => {
          const targetColName = targetCols[idx] || colName;
          tryAddEdge(rel.sourceTable, colName, rel.targetTable, targetColName);
        });
      }

      return { nodes: mergedNodes, edges: [...mergedEdges, ...additionalEdges], action: 'erd-generate-sql' };
    }

    case 'erd-edit-column': {
      const nodeIds = extra?.selectedNodeIds?.length
        ? extra.selectedNodeIds
        : (extra?.selectedNodeId ? [extra.selectedNodeId] : []);
      if (nodeIds.length === 0) return null;

      const updatedNodes = tryParseMultiColumnChanges(currentNodes, nodeIds, extra?.selectedNodeId ?? null, aiResponse);
      if (!updatedNodes) return null;

      return { nodes: updatedNodes, edges: currentEdges, action: 'erd-edit-column' };
    }

    // Read-only actions — no diagram mutations
    case 'erd-explain-table':
    case 'erd-suggest-indexes':
    case 'erd-seed-data':
    default:
      return null;
  }
}
