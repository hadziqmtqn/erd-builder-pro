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
const COLUMN_DEF_RE = /^\s*(?:"([^"]+)"|(\w+))\s+(\[[^\]]+\]|"[^"]+"|[^\s\[]+)/;
const STANDALONE_REF_RE = /^\s*Ref:\s*(?:"([^"]+)"|(\w+))\."?([^".]+)"?\s*[><-]\s*(?:"([^"]+)"|(\w+))\."?([^".]+)"?/i;
const INLINE_REF_RE = /\[\s*ref\s*:\s*[><-]\s*(?:"([^"]+)"|(\w+))\."?([^".\]]+)"?\s*\]/i;

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

export function readDBMLEnumNames(lines: string[]): Set<string> {
  const enumNames = new Set<string>();
  for (const line of lines) {
    const match = line.match(ENUM_HEADER_RE);
    if (match) enumNames.add((match[1] || match[2]).toLowerCase());
  }
  return enumNames;
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
      fkTable: standalone[1] || standalone[2],
      fkCol: standalone[3],
      pkTable: standalone[4] || standalone[5],
      pkCol: standalone[6],
    };
  }

  const inline = line.match(INLINE_REF_RE);
  if (!inline || !currentTable) return null;
  const localColumn = parseDBMLColumn(line);
  if (!localColumn) return null;

  return {
    fkTable: currentTable,
    fkCol: localColumn.name,
    pkTable: inline[1] || inline[2],
    pkCol: inline[3],
  };
}
