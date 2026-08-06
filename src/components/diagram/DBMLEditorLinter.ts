import { Parser } from '@dbml/core';
import { linter, type Diagnostic } from '@codemirror/lint';
import { COLUMN_TYPES } from '@/lib/utils';
import {
  buildDBMLTableDefinitions,
  findEnumNamingErrors,
  normalizeDBMLTypeName,
  parseDBMLColumn,
  parseDBMLRef,
  parseDBMLTableName,
  readDBMLEnumNames,
} from '@/lib/dbml-utils';
import { normalizeDBMLIndexSyntax, removeEmptyDBMLIndexes } from '@/lib/dbml-converter';

const VALID_TYPES = new Set(COLUMN_TYPES.map(type => type.toUpperCase()));

export function createDBMLLinter() {
  return linter(view => {
    const doc = view.state.doc;
    const text = doc.toString();
    const diagnostics: Diagnostic[] = [];
    const lines = text.split('\n');
    const enumNames = readDBMLEnumNames(lines);

    addTypeDiagnostics(lines, doc, enumNames, diagnostics);
    addRelationshipDiagnostics(lines, doc, diagnostics);
    addEnumDiagnostics(text, lines, doc, diagnostics);
    addParserDiagnostics(text, lines, doc, diagnostics);

    return diagnostics;
  }, { delay: 500 });
}

function addTypeDiagnostics(
  lines: string[],
  doc: { line: (line: number) => { from: number } },
  enumNames: Set<string>,
  diagnostics: Diagnostic[],
) {
  let currentTable = '';
  let inTable = false;
  let metadataDepth = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineFrom = doc.line(i + 1).from;
    const tableName = parseDBMLTableName(line);

    if (tableName) {
      currentTable = tableName;
      inTable = true;
      metadataDepth = 0;
      continue;
    }
    if (inTable && /^(checks|indexes)\s*\{/i.test(trimmed)) {
      metadataDepth = 1;
      continue;
    }
    if (metadataDepth > 0) {
      if (trimmed === '}') metadataDepth -= 1;
      continue;
    }
    if (trimmed === '}' || trimmed.startsWith('}')) {
      inTable = false;
      currentTable = '';
      continue;
    }
    if (!inTable || !trimmed || trimmed.startsWith('//')) continue;

    const column = parseDBMLColumn(trimmed);
    if (!column) continue;
    const normalizedTypeName = normalizeDBMLTypeName(column.type);
    if (!normalizedTypeName || VALID_TYPES.has(normalizedTypeName.toUpperCase()) || enumNames.has(normalizedTypeName.toLowerCase())) continue;

    const typeStart = line.indexOf(column.type);
    diagnostics.push({
      from: lineFrom + typeStart,
      to: lineFrom + typeStart + column.type.length,
      severity: 'error',
      message: `Invalid type "${column.type}" in "${currentTable}.${column.name}"`,
    });
  }
}

function addRelationshipDiagnostics(
  lines: string[],
  doc: { line: (line: number) => { from: number } },
  diagnostics: Diagnostic[],
) {
  const { tableDefs, lineTables } = buildDBMLTableDefinitions(lines);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineFrom = doc.line(i + 1).from;
    const ref = parseDBMLRef(line, lineTables[i]);
    if (!ref) continue;

    const { fkTable, fkCol, pkTable, pkCol } = ref;
    const fkCols = tableDefs.get(fkTable);
    if (!fkCols) continue;

    if (fkCol && !fkCols.has(fkCol)) {
      addDiagnostic(diagnostics, line, lineFrom, fkCol, `Column "${fkCol}" not found in "${fkTable}"`);
      continue;
    }

    const targetCols = tableDefs.get(pkTable);
    if (!targetCols) {
      addDiagnostic(diagnostics, line, lineFrom, pkTable, `Table "${pkTable}" not found`);
      continue;
    }

    if (!targetCols.has(pkCol)) {
      addDiagnostic(diagnostics, line, lineFrom, pkCol, `Column "${pkCol}" not found in "${pkTable}"`);
      continue;
    }

    if (fkCol && fkCols.has(fkCol)) {
      const fkType = (fkCols.get(fkCol) || '').toUpperCase().replace(/\s+/g, '');
      const pkType = (targetCols.get(pkCol) || '').toUpperCase().replace(/\s+/g, '');
      if (fkType && pkType && fkType !== pkType) {
        addDiagnostic(diagnostics, line, lineFrom, fkCol, `Type mismatch: "${fkTable}.${fkCol}" is ${fkCols.get(fkCol)} but "${pkTable}.${pkCol}" is ${targetCols.get(pkCol)}`);
      }
    }
  }
}

function addEnumDiagnostics(
  text: string,
  lines: string[],
  doc: { line: (line: number) => { from: number } },
  diagnostics: Diagnostic[],
) {
  for (const error of findEnumNamingErrors(text)) {
    const line = lines[error.line - 1] || '';
    const lineFrom = doc.line(error.line).from;
    const index = line.indexOf(error.actual);
    const from = lineFrom + Math.max(0, index);
    diagnostics.push({
      from,
      to: from + error.actual.length,
      severity: 'warning',
      message: `Recommended enum name is "${error.expected}". Rename "${error.actual}" to avoid duplicate enum blocks; save is paused until fixed.`,
    });
  }
}

function addParserDiagnostics(
  text: string,
  lines: string[],
  doc: { line: (line: number) => { from: number } },
  diagnostics: Diagnostic[],
) {
  let depth = 0;
  for (const character of text) {
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
  }
  if (depth !== 0 || !/\bTable\b/i.test(text)) return;

  try {
    Parser.parse(normalizeDBMLIndexSyntax(removeEmptyDBMLIndexes(text)), 'dbml');
  } catch (error: any) {
    for (const diagnostic of error?.diags || []) {
      const line = diagnostic.location?.start?.line;
      const column = (diagnostic.location?.start?.column || 1) - 1;
      if (!line || line > lines.length) continue;
      const lineFrom = doc.line(line).from;
      diagnostics.push({
        from: lineFrom + column,
        to: lineFrom + column + 1,
        severity: 'error',
        message: diagnostic.message,
      });
    }
  }
}

function addDiagnostic(
  diagnostics: Diagnostic[],
  line: string,
  lineFrom: number,
  token: string,
  message: string,
) {
  const index = line.indexOf(token);
  if (index < 0) return;
  diagnostics.push({
    from: lineFrom + index,
    to: lineFrom + index + token.length,
    severity: 'error',
    message,
  });
}
