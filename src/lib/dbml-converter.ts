import { Parser } from '@dbml/core';
import type { Node, Edge } from '@xyflow/react';
import type { Entity } from '@/types';
import { COLUMN_TYPES } from '@/lib/utils';

const VALID_TYPES = new Set(COLUMN_TYPES.map(t => t.toUpperCase()));

/** Shape we get from @dbml/core Parser for a single table field */
interface DBMLField {
  name: string;
  type: { type_name?: string } | string;
  pk?: boolean;
  unique?: boolean;
  not_null?: boolean;
  note?: string | null;
  dbdefault?: unknown;
  increment?: boolean;
}

/** Shape we get from @dbml/core Parser for a single table */
interface DBMLTable {
  name: string;
  headerColor?: string;
  fields: DBMLField[];
}

/** Shape we get from @dbml/core Parser for a ref endpoint */
interface DBMLRefEndpoint {
  tableName: string;
  fieldNames?: string[];
}

/** Shape we get from @dbml/core Parser for a ref */
interface DBMLRef {
  endpoints: DBMLRefEndpoint[];
}

/**
 * Pre-scan DBML text for invalid column types.
 * Regex-based — catches type issues before the parser does.
 */
function findTypeErrors(text: string): string[] {
  const errors: string[] = [];
  const lines = text.split('\n');
  let currentTable = '';
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (/^\s*(Table|table)\s+\S/.test(line)) {
      currentTable = trimmed.replace(/^(Table|table)\s+["']?(\S+?)['"]?\s*\{.*/, '$2');
      inTable = true;
      continue;
    }

    if (trimmed === '}' || trimmed.startsWith('}')) {
      inTable = false;
      currentTable = '';
      continue;
    }

    if (inTable && trimmed && !trimmed.startsWith('//')) {
      // Match: "column_name" TYPE [settings]
      const m = trimmed.match(/^"([^"]+)"\s+(\S+)/);
      if (m) {
        const [, colName, rawType] = m;
        const typeName = rawType.replace(/\[.*/, '').trim();
        if (typeName && !VALID_TYPES.has(typeName.toUpperCase())) {
          errors.push(
            `Line ${lineNum}: Invalid type "${typeName}" in table "${currentTable}" column "${colName}"`,
          );
        }
      }
    }
  }

  return errors;
}

/**
 * Parse DBML text → ERD nodes + edges.
 * Tables become Entity nodes, Refs become relationship edges.
 */
export function dbmlToERD(dbmlText: string): { nodes: Node<Entity>[]; edges: Edge[] } {
  // ── Pre-scan: find type errors ──
  const typeErrors = findTypeErrors(dbmlText);

  // ── Parse ──
  let parseError: string | null = null;
  let db: any;
  try {
    db = Parser.parse(dbmlText, 'dbml');
  } catch (e: any) {
    const diags = e?.diags;
    parseError = diags?.length
      ? diags.map((d: any) => `Line ${d.location?.start?.line}: ${d.message}`).join('; ')
      : e?.message || String(e);
  }

  // ── Collect all errors ──
  const allErrors = [...typeErrors];
  if (parseError) allErrors.push(parseError);
  if (allErrors.length) {
    throw new Error(allErrors.join('\n'));
  }

  // ── Build nodes + edges ──
  const nodes: Node<Entity>[] = [];
  const edges: Edge[] = [];

  for (const schema of db.schemas as any[]) {
    for (const table of schema.tables as DBMLTable[]) {
      const nodeId = crypto.randomUUID();
      const columns = table.fields.map((f, i) => ({
        id: crypto.randomUUID(),
        name: f.name,
        type: typeof f.type === 'string' ? f.type : (f.type as any).type_name || String(f.type),
        is_pk: !!f.pk,
        is_nullable: !f.not_null,
        enum_values: '',
        sort_order: i,
      }));

      nodes.push({
        id: nodeId,
        type: 'entity' as const,
        position: { x: 0, y: 0 },
        data: {
          id: nodeId,
          name: table.name,
          x: 0, y: 0,
          color: table.headerColor || '#4f46e5',
          columns,
        },
      });
    }

    for (const ref of schema.refs as DBMLRef[]) {
      if (ref.endpoints.length !== 2) continue;

      const [ep0, ep1] = ref.endpoints;
      const sourceTable = nodes.find(n => n.data.name === ep0.tableName);
      const targetTable = nodes.find(n => n.data.name === ep1.tableName);
      if (!sourceTable || !targetTable) continue;

      const srcCol = sourceTable.data.columns.find(c =>
        ep0.fieldNames?.includes(c.name),
      );
      const tgtCol = targetTable.data.columns.find(c =>
        ep1.fieldNames?.includes(c.name),
      );
      if (!srcCol || !tgtCol) continue;

      edges.push({
        id: crypto.randomUUID(),
        source: sourceTable.id,
        target: targetTable.id,
        sourceHandle: `col-${srcCol.id}-source`,
        targetHandle: `col-${tgtCol.id}-target`,
        type: 'smoothstep',
      });
    }
  }

  return { nodes, edges };
}

/**
 * Generate DBML text from ERD nodes + edges.
 */
export function erdToDBML(nodes: Node<Entity>[], edges: Edge[]): string {
  const lines: string[] = [];

  for (const node of nodes) {
    lines.push(`Table "${node.data.name}" {`);
    for (const col of node.data.columns) {
      const settings: string[] = [];
      if (col.is_pk) settings.push('pk');
      if (col.is_nullable === false) settings.push('not null');
      const suffix = settings.length ? ` [${settings.join(', ')}]` : '';
      lines.push(`  "${col.name}" ${col.type}${suffix}`);
    }
    lines.push('}');
    lines.push('');
  }

  for (const edge of edges) {
    const srcNode = nodes.find(n => n.id === edge.source);
    const tgtNode = nodes.find(n => n.id === edge.target);
    if (!srcNode || !tgtNode) continue;

    const srcCol = srcNode.data.columns.find(c =>
      edge.sourceHandle?.includes(c.id),
    );
    const tgtCol = tgtNode.data.columns.find(c =>
      edge.targetHandle?.includes(c.id),
    );
    if (!srcCol || !tgtCol) continue;

    lines.push(
      `Ref: "${srcNode.data.name}"."${srcCol.name}" > "${tgtNode.data.name}"."${tgtCol.name}"`,
    );
  }

  return lines.join('\n');
}
