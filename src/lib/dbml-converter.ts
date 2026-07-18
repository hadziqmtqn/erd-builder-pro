import { Parser, ModelExporter } from '@dbml/core';
import type { Node, Edge } from '@xyflow/react';
import type { Entity } from '@/types';
import { COLUMN_TYPES } from '@/lib/utils';
import { parseSQLToERD } from '@/lib/sqlParser';
import {
  buildDBMLTableDefinitions,
  parseDBMLColumn,
  parseDBMLRef,
  parseDBMLTableName,
  readDBMLEnumNames,
} from '@/lib/dbml-utils';

const VALID_TYPES = new Set(COLUMN_TYPES.map(t => t.toUpperCase()));

/**
 * Pre-scan DBML text for invalid column types.
 * Regex-based — catches type issues before the parser does.
 */
function findTypeErrors(text: string): string[] {
  const errors: string[] = [];
  const lines = text.split('\n');
  const enumNames = readDBMLEnumNames(lines);
  let currentTable = '';
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    const tableName = parseDBMLTableName(line);
    if (tableName) {
      currentTable = tableName;
      inTable = true;
      continue;
    }

    if (trimmed === '}' || trimmed.startsWith('}')) {
      inTable = false;
      currentTable = '';
      continue;
    }

    if (inTable && trimmed && !trimmed.startsWith('//')) {
      // Match quoted or bare column names. Bare names are the usual DBML form;
      // without this branch an incomplete type such as `bi` reached the SQL
      // converter, where unknown types are normalized to VARCHAR.
      const column = parseDBMLColumn(trimmed);
      if (column) {
        const { name: colName, type: typeName } = column;
        if (typeName && !VALID_TYPES.has(typeName.toUpperCase()) && !enumNames.has(typeName.toLowerCase())) {
          errors.push(
            `Line ${lineNum}: Invalid type "${typeName}" in table "${currentTable}" column "${colName}"`,
          );
        }
      }
    }
  }

  return errors;
}

/** Read named DBML enums so their values survive the DBML → SQL → ERD bridge. */
function readDBMLEnums(text: string): Map<string, string> {
  const enums = new Map<string, string>();
  const enumBlock = /^\s*Enum\s+(?:"([^"]+)"|(\w+))\s*\{([\s\S]*?)^\s*\}/gim;

  for (const match of text.matchAll(enumBlock)) {
    const name = (match[1] || match[2]).toLowerCase();
    const values = match[3]
      .split('\n')
      .map(line => line.trim().replace(/\/\/.*$/, '').trim())
      .filter(line => line && !line.startsWith('//'))
      .map(line => line.split(/\s+\[/, 1)[0].trim())
      .filter(Boolean);
    if (values.length) enums.set(name, values.join(', '));
  }

  return enums;
}

/** Map each DBML enum-typed column by table and column name. */
function readDBMLEnumColumns(text: string, enums: Map<string, string>): Map<string, { name: string; values: string }> {
  const columns = new Map<string, { name: string; values: string }>();
  const tableBlock = /^\s*Table\s+(?:"([^"]+)"|(\w+))\s*\{([\s\S]*?)^\s*\}/gim;

  for (const match of text.matchAll(tableBlock)) {
    const tableName = (match[1] || match[2]).toLowerCase();
    for (const line of match[3].split('\n')) {
      const column = line.match(/^\s*(?:"([^"]+)"|(\w+))\s+(?:"([^"]+)"|([^\s\[]+))/);
      if (!column) continue;
      const columnName = (column[1] || column[2]).toLowerCase();
      const rawTypeName = column[3] || column[4];
      const typeName = rawTypeName.toLowerCase();
      const values = enums.get(typeName);
      if (values) columns.set(`${tableName}\u0000${columnName}`, { name: rawTypeName, values });
    }
  }

  return columns;
}

/**
 * Pre-scan DBML text for ref type mismatches.
 * Builds table→column→type map, then checks every Ref line.
 */
function findRefTypeErrors(text: string): string[] {
  const errors: string[] = [];
  const lines = text.split('\n');
  const { tableDefs, lineTables } = buildDBMLTableDefinitions(lines);

  // Check Ref lines for type mismatches
  for (let i = 0; i < lines.length; i += 1) {
    const ref = parseDBMLRef(lines[i], lineTables[i]);
    if (ref) {
      const fkType = tableDefs.get(ref.fkTable)?.get(ref.fkCol)?.toUpperCase().replace(/\s+/g, '');
      const pkType = tableDefs.get(ref.pkTable)?.get(ref.pkCol)?.toUpperCase().replace(/\s+/g, '');
      if (fkType && pkType && fkType !== pkType) {
        errors.push(`Type mismatch: "${ref.fkTable}.${ref.fkCol}" is ${tableDefs.get(ref.fkTable)?.get(ref.fkCol)} but "${ref.pkTable}.${ref.pkCol}" is ${tableDefs.get(ref.pkTable)?.get(ref.pkCol)}`);
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
  const refTypeErrors = findRefTypeErrors(dbmlText);

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
  const allErrors = [...typeErrors, ...refTypeErrors];
  if (parseError) allErrors.push(parseError);
  if (allErrors.length) {
    throw new Error(allErrors.join('\n'));
  }

  // ── SQL → ERD via existing parser ──
  const result = parseSQLToERD(sql!);

  // PostgreSQL emits named enums as `CREATE TYPE name AS ENUM (...)`, while
  // the SQL parser normalizes unknown named types to VARCHAR. Restore the enum
  // marker and values from the authoritative DBML table definitions.
  const enums = readDBMLEnums(dbmlText);
  const enumColumns = readDBMLEnumColumns(dbmlText, enums);
  for (const node of result.nodes) {
    for (const column of node.data.columns) {
      const enumColumn = enumColumns.get(`${node.data.name.toLowerCase()}\u0000${column.name.toLowerCase()}`);
      if (enumColumn) {
        column.type = 'ENUM';
        column.enum_name = enumColumn.name;
        column.enum_values = enumColumn.values;
      }
    }
  }

  return result;
}

/**
 * Generate DBML text from ERD nodes + edges.
 */
export function erdToDBML(nodes: Node<Entity>[], edges: Edge[]): string {
  const lines: string[] = [];

  // Collect enum columns. Explicit enum_name comes from DBML parsing and must
  // win over column-name guessing.
  const enumColumns: { nodeId: string; colId: string; tableName: string; colName: string; values: string; enumName?: string }[] = [];

  for (const node of nodes) {
    for (const col of node.data.columns) {
      if (col.type.toUpperCase() === 'ENUM' && col.enum_values) {
        enumColumns.push({
          nodeId: node.id,
          colId: col.id,
          tableName: node.data.name,
          colName: col.name,
          values: col.enum_values,
          enumName: col.enum_name,
        });
      }
    }
  }

  // Build colEnumName map for use in Table blocks (must run before Table emit)
  const usedEnumNames = new Map<string, string>();
  const enumMap = new Map<string, { name: string; values: string }>();
  const colEnumName = new Map<string, string>(); // `${nodeId}:${colId}` → enum name

  for (const ec of enumColumns) {
    const norm = normalizeEnumValues(ec.values);
    // Use explicit enum_name if set by user, otherwise default to {tableName}_{colName}
    // getAvailableEnumName handles conflicts (same name, different values) by adding suffix
    const baseName = ec.enumName || `${ec.tableName}_${ec.colName}`;
    const name = getAvailableEnumName(baseName, norm, usedEnumNames);
    const mapKey = `${name}:${norm}`;
    if (!enumMap.has(mapKey)) {
      enumMap.set(mapKey, { name, values: ec.values });
    }
    colEnumName.set(`${ec.nodeId}:${ec.colId}`, name);
  }

  for (const node of nodes) {
    const tableName = needsQuote(node.data.name) ? `"${node.data.name}"` : node.data.name;
    lines.push(`Table ${tableName} {`);
    for (const col of node.data.columns) {
      const settings: string[] = [];
      if (col.is_pk) settings.push('pk');
      if (col.is_nullable === false) settings.push('not null');
      const suffix = settings.length ? ` [${settings.join(', ')}]` : '';
      const colName = needsQuote(col.name) ? `"${col.name}"` : col.name;
      // Use enum name instead of raw ENUM type
      const enumName = colEnumName.get(`${node.id}:${col.id}`);
      const colType = enumName ? formatIdentifier(enumName) : col.type;
      lines.push(`  ${colName} ${colType}${suffix}`);
    }
    lines.push('}');
    lines.push('');
  }

  // Emit Enum blocks between Table and Ref sections
  const emitted = new Set<string>();
  for (const [, { name, values }] of enumMap) {
    if (emitted.has(name)) continue;
    emitted.add(name);
    const enumName = needsQuote(name) ? `"${name}"` : name;
    lines.push(`Enum ${enumName} {`);
    for (const v of values.split(',')) {
      lines.push(`  ${v.trim()}`);
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

function formatIdentifier(name: string): string {
  return needsQuote(name) ? `"${name}"` : name;
}

/** Format as table.col, quoting each part only if needed */
function tableNear(table: string, col: string): string {
  return `${formatIdentifier(table)}.${formatIdentifier(col)}`;
}

function normalizeEnumValues(values: string): string {
  return values
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(',');
}

function getAvailableEnumName(baseName: string, valueKey: string, usedNames: Map<string, string>): string {
  const cleanBase = baseName.trim() || 'enum_value';
  const lowerBase = cleanBase.toLowerCase();
  const existingValueKey = usedNames.get(lowerBase);
  if (!existingValueKey || existingValueKey === valueKey) {
    usedNames.set(lowerBase, valueKey);
    return cleanBase;
  }

  let i = 2;
  while (true) {
    const candidate = `${cleanBase}_${i}`;
    const lowerCandidate = candidate.toLowerCase();
    const candidateValueKey = usedNames.get(lowerCandidate);
    if (!candidateValueKey || candidateValueKey === valueKey) {
      usedNames.set(lowerCandidate, valueKey);
      return candidate;
    }
    i += 1;
  }
}
