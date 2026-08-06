import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { MutableRefObject } from 'react';
import { COLUMN_TYPES } from '@/lib/utils';

export interface DBMLTableData {
  names: string[];
  cols: Map<string, string[]>;
}

const KEYWORDS: Completion[] = [
  { label: 'Table', type: 'keyword', detail: 'table definition' },
  { label: 'Ref', type: 'keyword', detail: 'relationship' },
  { label: 'Enum', type: 'keyword', detail: 'enum definition' },
  { label: 'TableGroup', type: 'keyword', detail: 'table group' },
  { label: 'Note', type: 'keyword', detail: 'project note' },
  { label: 'Indexes', type: 'keyword', detail: 'index block' },
];

const SETTINGS: Completion[] = [
  { label: 'pk', type: 'keyword', detail: 'primary key' },
  { label: 'unique', type: 'keyword', detail: 'unique constraint' },
  { label: 'not null', type: 'keyword', detail: 'not null' },
  { label: 'note', type: 'keyword', detail: "column note: 'text'" },
  { label: 'default', type: 'keyword', detail: 'default value' },
  { label: 'increment', type: 'keyword', detail: 'auto-increment' },
  { label: 'ref', type: 'keyword', detail: 'inline FK: > table.col' },
  { label: 'headerColor', type: 'keyword', detail: 'table header color' },
];

const TYPES: Completion[] = COLUMN_TYPES.map(type => ({
  label: type,
  type: 'type',
  detail: 'column type',
}));

export function createDBMLCompletionSource(
  tableDataRef: MutableRefObject<DBMLTableData>,
) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const { names: tableNames, cols: tableCols } = tableDataRef.current;
    const line = ctx.state.doc.lineAt(ctx.pos);
    const before = line.text.slice(0, ctx.pos - line.from);
    const word = ctx.matchBefore(/\w+/);
    if (!word) return null;

    const partial = word.text.toLowerCase();
    if (!partial) return null;

    const beforeTrimmed = before.slice(0, word.from - line.from).trimEnd();
    const isLineStart = !beforeTrimmed || beforeTrimmed.startsWith('//');
    const insideTableBody = /^\s/.test(line.text) && !/^\s*(Table|Ref|Enum|TableGroup|Note|Indexes)\b/i.test(line.text);
    const afterColName = /^\s+"[^"]+"\s+\w*$/.test(before) || /^\s+\w+\s+\w*$/.test(before);

    const isRefLine = /^\s*Ref:\s/i.test(line.text);
    if (isRefLine) {
      const afterRef = before.replace(/^\s*Ref:\s*/, '');
      if (!/[><]/.test(afterRef)) {
        const dotMatch = afterRef.match(/^(\w+)\.(\w*)$/);
        if (dotMatch) {
          const cols = tableCols.get(dotMatch[1]);
          if (cols) {
            const options = cols
              .filter(column => column.toLowerCase().startsWith(partial))
              .map(column => ({ label: column, type: 'property' as const, detail: dotMatch[1] }));
            if (options.length) return { from: word.from, options };
          }
          return null;
        }

        const options = tableNames
          .filter(table => table.toLowerCase().startsWith(partial))
          .map(table => ({ label: table, type: 'class' as const }));
        return options.length ? { from: word.from, options } : null;
      }
    }

    const afterArrow = before.match(/>\s*(\w*)$/i) || before.match(/<\s*(\w*)$/i);
    if (afterArrow) {
      const options = tableNames
        .filter(table => table.toLowerCase().startsWith(partial))
        .map(table => ({ label: table, type: 'class' as const }));
      return options.length ? { from: word.from, options } : null;
    }

    const afterDot = before.match(/>\s*(\w+)\.(\w*)$/i) || before.match(/<\s*(\w+)\.(\w*)$/i);
    if (afterDot) {
      const tableName = afterDot[1];
      const cols = tableCols.get(tableName);
      if (!cols) return null;
      const options = cols
        .filter(column => column.toLowerCase().startsWith(partial))
        .map(column => ({ label: column, type: 'property' as const, detail: tableName }));
      return options.length ? { from: word.from, options } : null;
    }

    if (insideTableBody && afterColName) {
      const options = TYPES.filter(type => type.label.toLowerCase().startsWith(partial));
      return options.length
        ? { from: word.from, options }
        : { from: word.from, options: [], filter: false };
    }

    if (/\[[^\]]*\w*$/.test(before)) {
      const options = SETTINGS.filter(setting => setting.label.toLowerCase().startsWith(partial));
      if (options.length) return { from: word.from, options };
    }

    if (isLineStart) {
      const options = KEYWORDS.filter(keyword => keyword.label.toLowerCase().startsWith(partial));
      if (options.length) return { from: word.from, options };
    }

    return { from: word.from, options: [], filter: false };
  };
}
