import { COLUMN_TYPES } from '@/lib/utils';

export interface DBMLTableData {
  names: string[];
  cols: Map<string, string[]>;
}

export interface DBMLSuggestion {
  label: string;
  type: string;
  detail?: string;
  from: number;
  to: number;
}

type SuggestionOption = Omit<DBMLSuggestion, 'from' | 'to'>;

const KEYWORDS: SuggestionOption[] = [
  { label: 'Table', type: 'keyword', detail: 'table definition' },
  { label: 'Ref', type: 'keyword', detail: 'relationship' },
  { label: 'Enum', type: 'keyword', detail: 'enum definition' },
  { label: 'TableGroup', type: 'keyword', detail: 'table group' },
  { label: 'Note', type: 'keyword', detail: 'project note' },
  { label: 'Indexes', type: 'keyword', detail: 'index block' },
];

const SETTINGS: SuggestionOption[] = [
  { label: 'pk', type: 'keyword', detail: 'primary key' },
  { label: 'unique', type: 'keyword', detail: 'unique constraint' },
  { label: 'not null', type: 'keyword', detail: 'not null' },
  { label: 'note', type: 'keyword', detail: "column note: 'text'" },
  { label: 'default', type: 'keyword', detail: 'default value' },
  { label: 'increment', type: 'keyword', detail: 'auto-increment' },
  { label: 'ref', type: 'keyword', detail: 'inline FK: > table.col' },
  { label: 'headerColor', type: 'keyword', detail: 'table header color' },
];

const TYPES: SuggestionOption[] = COLUMN_TYPES.map(type => ({
  label: type,
  type: 'type',
  detail: 'column type',
}));

function columnsFor(tableData: DBMLTableData, tableName: string) {
  const name = tableData.names.find(table => table.toLowerCase() === tableName.toLowerCase());
  return name ? { name, columns: tableData.cols.get(name) || [] } : null;
}

export function getDBMLSuggestions(
  source: string,
  position: number,
  tableData: DBMLTableData,
  limit = 8,
): DBMLSuggestion[] {
  const lineStart = source.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
  const nextBreak = source.indexOf('\n', position);
  const line = source.slice(lineStart, nextBreak === -1 ? undefined : nextBreak);
  const before = source.slice(lineStart, position);
  const word = before.match(/\w+$/)?.[0];
  if (!word) return [];

  const partial = word.toLowerCase();
  const from = position - word.length;
  const complete = (options: SuggestionOption[]) => options
    .filter(option => option.label.toLowerCase().startsWith(partial))
    .slice(0, limit)
    .map(option => ({ ...option, from, to: position }));

  const beforeWord = before.slice(0, before.length - word.length).trimEnd();
  const isLineStart = !beforeWord || beforeWord.startsWith('//');
  const insideTableBody = /^\s/.test(line) && !/^\s*(Table|Ref|Enum|TableGroup|Note|Indexes)\b/i.test(line);
  const afterColumnName = /^\s+"[^"]+"\s+\w*$/.test(before) || /^\s+\w+\s+\w*$/.test(before);

  if (/^\s*Ref:\s/i.test(line)) {
    const afterRef = before.replace(/^\s*Ref:\s*/, '');
    if (!/[><]/.test(afterRef)) {
      const dot = afterRef.match(/^(\w+)\.(\w*)$/);
      if (dot) {
        const table = columnsFor(tableData, dot[1]);
        return table ? complete(table.columns.map(label => ({ label, type: 'property', detail: table.name }))) : [];
      }
      return complete(tableData.names.map(label => ({ label, type: 'class' })));
    }
  }

  const afterDot = before.match(/[><]\s*(\w+)\.(\w*)$/i);
  if (afterDot) {
    const table = columnsFor(tableData, afterDot[1]);
    return table ? complete(table.columns.map(label => ({ label, type: 'property', detail: table.name }))) : [];
  }

  if (/[><]\s*\w*$/i.test(before)) {
    return complete(tableData.names.map(label => ({ label, type: 'class' })));
  }

  if (insideTableBody && afterColumnName) return complete(TYPES);
  if (/\[[^\]]*\w*$/.test(before)) return complete(SETTINGS);
  if (isLineStart) return complete(KEYWORDS);
  return [];
}
