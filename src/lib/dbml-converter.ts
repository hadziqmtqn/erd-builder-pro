import { Parser, ModelExporter } from '@dbml/core';
import type { Node, Edge } from '@xyflow/react';
import type { Entity } from '@/types';
import { COLUMN_TYPES } from '@/lib/utils';
import { parseSQLToERD } from '@/lib/sqlParser';

const VALID_TYPES = new Set(COLUMN_TYPES.map(t => t.toUpperCase()));

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

  // ── DBML → SQL via @dbml/core ──
  let parseError: string | null = null;
  let sql: string;
  try {
    const db = Parser.parse(dbmlText, 'dbml');
    sql = ModelExporter.export(db, 'postgres');
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

  // ── SQL → ERD via existing parser ──
  return parseSQLToERD(sql!);
}

/**
 * Generate DBML text from ERD nodes + edges.
 */
export function erdToDBML(nodes: Node<Entity>[], edges: Edge[]): string {
  const lines: string[] = [];

  for (const node of nodes) {
    const tableName = needsQuote(node.data.name) ? `"${node.data.name}"` : node.data.name;
    lines.push(`Table ${tableName} {`);
    for (const col of node.data.columns) {
      const settings: string[] = [];
      if (col.is_pk) settings.push('pk');
      if (col.is_nullable === false) settings.push('not null');
      const suffix = settings.length ? ` [${settings.join(', ')}]` : '';
      const colName = needsQuote(col.name) ? `"${col.name}"` : col.name;
      lines.push(`  ${colName} ${col.type}${suffix}`);
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
      `Ref: ${tableNear(srcNode.data.name, srcCol.name)} > ${tableNear(tgtNode.data.name, tgtCol.name)}`,
    );
  }

  return lines.join('\n');
}

/** Quote only if name contains non-identifier chars */
function needsQuote(name: string): boolean {
  return !/^[a-zA-Z_]\w*$/.test(name);
}

/** Format as table.col, quoting each part only if needed */
function tableNear(table: string, col: string): string {
  const t = needsQuote(table) ? `"${table}"` : table;
  const c = needsQuote(col) ? `"${col}"` : col;
  return `${t}.${c}`;
}
