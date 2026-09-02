import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { dbmlToERD, erdToDBML, findMatchingCanvasEdge } from '@/lib/dbml-converter';
import { parseSQLToERD } from '@/lib/sqlParser';
import { laravelMigrationsToDBML, type LaravelMigrationFile } from '@/lib/laravel-migrations';

export type RepositorySourceKind = 'dbml' | 'sql' | 'laravel';
export type RepositorySchemaFile = LaravelMigrationFile;

export function parseRepositorySchema(kind: RepositorySourceKind, files: RepositorySchemaFile[]) {
  if (!files.length) throw new Error('Repository schema source is empty');
  if (kind === 'laravel') {
    const result = laravelMigrationsToDBML(files);
    const parsed = dbmlToERD(result.dbml);
    return { ...parsed, dbml: result.dbml, warnings: result.warnings };
  }
  if (kind === 'dbml') {
    const dbml = files.map(file => file.content).join('\n\n');
    return { ...dbmlToERD(dbml), dbml, warnings: [] as string[] };
  }
  const sql = files.map(file => file.content).join('\n\n');
  const parsed = parseSQLToERD(sql);
  return { ...parsed, dbml: erdToDBML(parsed.nodes, parsed.edges), warnings: [] as string[] };
}

const key = (value: string) => value.trim().toLowerCase();
const columnId = (handle?: string | null) => handle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') || '';

/** Preserve canvas identity and layout while replacing its semantic schema. */
export function alignRepositorySchema(
  currentNodes: Node<Entity>[],
  currentEdges: Edge[],
  proposedNodes: Node<Entity>[],
  proposedEdges: Edge[],
) {
  const currentByName = new Map(currentNodes.map(node => [key(node.data.name), node]));
  const nodeIds = new Map<string, string>();
  const columnIds = new Map<string, string>();
  const nodes = proposedNodes.map((node, index) => {
    const current = currentByName.get(key(node.data.name));
    if (!current) return { ...node, position: node.position || { x: (index % 4) * 320 + 50, y: Math.floor(index / 4) * 320 + 50 } };
    nodeIds.set(node.id, current.id);
    const columns = node.data.columns.map(column => {
      const existing = current.data.columns.find(item => key(item.name) === key(column.name));
      if (existing) columnIds.set(`${node.id}:${column.id}`, existing.id);
      return existing ? { ...column, id: existing.id } : column;
    });
    const remapMetadataIds = (ids: string[] = []) => ids.map(id => columnIds.get(`${node.id}:${id}`) || id);
    return {
      ...node,
      id: current.id,
      position: current.position,
      data: {
        ...node.data,
        id: current.data.id,
        x: current.data.x,
        y: current.data.y,
        color: current.data.color,
        collapsed: current.data.collapsed,
        hidden_columns: current.data.hidden_columns,
        columns,
        constraints: (node.data.constraints || []).map(item => ({ ...item, entity_id: current.data.id, column_ids: remapMetadataIds(item.column_ids) })),
        indexes: (node.data.indexes || []).map(item => ({ ...item, entity_id: current.data.id, column_ids: remapMetadataIds(item.column_ids) })),
      },
    };
  });

  const edges = proposedEdges.map(edge => {
    const source = proposedNodes.find(node => node.id === edge.source);
    const target = proposedNodes.find(node => node.id === edge.target);
    const sourceId = nodeIds.get(edge.source) || edge.source;
    const targetId = nodeIds.get(edge.target) || edge.target;
    const sourceColumn = source?.data.columns.find(column => column.id === columnId(edge.sourceHandle));
    const targetColumn = target?.data.columns.find(column => column.id === columnId(edge.targetHandle));
    const alignedSource = nodes.find(node => node.id === sourceId);
    const alignedTarget = nodes.find(node => node.id === targetId);
    const alignedSourceColumn = alignedSource?.data.columns.find(column => key(column.name) === key(sourceColumn?.name || ''));
    const alignedTargetColumn = alignedTarget?.data.columns.find(column => key(column.name) === key(targetColumn?.name || ''));
    const sourceHandle = alignedSourceColumn ? `col-${alignedSourceColumn.id}-${(alignedSource?.position.x || 0) < (alignedTarget?.position.x || 0) ? 'source' : 'source-l'}` : undefined;
    const targetHandle = alignedTargetColumn ? `col-${alignedTargetColumn.id}-${(alignedSource?.position.x || 0) < (alignedTarget?.position.x || 0) ? 'target' : 'target-r'}` : undefined;
    const existing = findMatchingCanvasEdge(currentEdges, sourceId, targetId, sourceHandle, targetHandle);
    return { ...edge, id: existing?.id || edge.id, source: sourceId, target: targetId, sourceHandle: existing?.sourceHandle || sourceHandle, targetHandle: existing?.targetHandle || targetHandle };
  });
  return { nodes, edges };
}
