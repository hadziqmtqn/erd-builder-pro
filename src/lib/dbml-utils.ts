export interface DBMLRef {
  fkTable: string;
  fkCol: string;
  pkTable: string;
  pkCol: string;
}

interface TableParseResult {
  tableDefs: Map<string, Map<string, string>>;
  lineTables: string[];
}

const TABLE_HEADER_RE = /^\s*Table\s+(?:"([^"]+)"|(\w+))\s*\{/i;
const ENUM_HEADER_RE = /^\s*Enum\s+(?:"([^"]+)"|(\w+))\s*\{/i;
const COLUMN_DEF_RE = /^\s*(?:"([^"]+)"|(\w+))\s+(\[[^\]]+\]|"[^"]+"|[A-Za-z_][\w]*(?:\s*\([^)]*\))?|[^\s\[]+)/;
const STANDALONE_REF_RE = /^\s*Ref(?:\s+(?:"[^"]+"|\w+))?\s*:\s*(?:"([^"]+)"|(\w+))\.(?:"([^"]+)"|([^\s\].]+))\s*[><-]\s*(?:"([^"]+)"|(\w+))\.(?:"([^"]+)"|([^\s\].]+))/i;
const INLINE_REF_RE = /\[\s*ref\s*:\s*[><-]\s*(?:"([^"]+)"|(\w+))\."?([^".\]]+)"?\s*\]/i;
const ENUM_BLOCK_RE = /^\s*Enum\s+(?:"([^"]+)"|(\w+))\s*\{[\s\S]*?^\s*\}/gim;

function cleanDBMLRefPart(value: string | undefined): string {
  return (value || '').trim();
}

function cleanDBMLIdentifier(value: string): string {
  return value.trim().replace(/^"|"$/g, '');
}

export function recommendedDBMLEnumName(tableName: string, columnName: string): string {
  return `${tableName}_${columnName}`
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, '_$1')
    || 'generated_enum';
}

export function parseDBMLTableName(line: string): string {
  const match = line.match(TABLE_HEADER_RE);
  return (match?.[1] || match?.[2] || '').trim();
}

export function parseDBMLColumn(line: string): { name: string; type: string } | null {
  const match = line.match(COLUMN_DEF_RE);
  if (!match) return null;
  return {
    name: (match[1] || match[2] || '').trim(),
    type: match[3].replace(/\[.*/, '').trim(),
  };
}

export function normalizeDBMLTypeName(typeName: string): string {
  const match = typeName.trim().match(/^([A-Za-z][\w]*)\s*\([^)]*\)$/);
  return match ? match[1] : typeName.trim();
}

export function readDBMLEnumNames(lines: string[]): Set<string> {
  const enumNames = new Set<string>();
  for (const line of lines) {
    const match = line.match(ENUM_HEADER_RE);
    if (match) enumNames.add(cleanDBMLIdentifier(match[1] || match[2]).toLowerCase());
  }
  return enumNames;
}

export function findEnumNamingErrors(text: string): { line: number; table: string; column: string; actual: string; expected: string }[] {
  const errors: { line: number; table: string; column: string; actual: string; expected: string }[] = [];
  const lines = text.split(/\r?\n/);
  const enumNames = readDBMLEnumNames(lines);
  let currentTable = '';
  let inTable = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
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

    if (!inTable || !trimmed || trimmed.startsWith('//')) continue;
    const column = parseDBMLColumn(line);
    if (!column) continue;

    const actual = cleanDBMLIdentifier(column.type);
    if (!enumNames.has(actual.toLowerCase())) continue;
    const expected = recommendedDBMLEnumName(currentTable, column.name);
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      errors.push({ line: i + 1, table: currentTable, column: column.name, actual, expected });
    }
  }

  return errors;
}

export function dedupeDBMLEnumBlocks(text: string): string {
  const seen = new Set<string>();
  return text
    .replace(ENUM_BLOCK_RE, (block, quotedName, bareName) => {
      const name = String(quotedName || bareName || '').toLowerCase();
      if (seen.has(name)) return '';
      seen.add(name);
      return block;
    })
    .replace(/\n{3,}/g, '\n\n');
}

export function buildDBMLTableDefinitions(lines: string[]): TableParseResult {
  const tableDefs = new Map<string, Map<string, string>>();
  const lineTables = Array<string>(lines.length).fill('');
  let currentTable = '';
  let inTable = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const tableName = parseDBMLTableName(line);

    if (tableName) {
      currentTable = tableName;
      inTable = true;
      lineTables[i] = currentTable;
      if (!tableDefs.has(currentTable)) tableDefs.set(currentTable, new Map());
      continue;
    }

    if (trimmed === '}' || trimmed.startsWith('}')) {
      inTable = false;
      currentTable = '';
      continue;
    }

    if (!inTable) continue;
    lineTables[i] = currentTable;
    if (!trimmed || trimmed.startsWith('//')) continue;

    const column = parseDBMLColumn(line);
    if (!column) continue;
    tableDefs.get(currentTable)?.set(column.name, column.type);
  }

  return { tableDefs, lineTables };
}

export function parseDBMLRef(line: string, currentTable: string): DBMLRef | null {
  const standalone = line.match(STANDALONE_REF_RE);
  if (standalone) {
    return {
      fkTable: cleanDBMLRefPart(standalone[1] || standalone[2]),
      fkCol: cleanDBMLRefPart(standalone[3] || standalone[4]),
      pkTable: cleanDBMLRefPart(standalone[5] || standalone[6]),
      pkCol: cleanDBMLRefPart(standalone[7] || standalone[8]),
    };
  }

  const inline = line.match(INLINE_REF_RE);
  if (!inline || !currentTable) return null;
  const localColumn = parseDBMLColumn(line);
  if (!localColumn) return null;

  return {
    fkTable: currentTable,
    fkCol: localColumn.name,
    pkTable: cleanDBMLRefPart(inline[1] || inline[2]),
    pkCol: cleanDBMLRefPart(inline[3]),
  };
}
