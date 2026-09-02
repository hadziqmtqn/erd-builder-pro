import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';

type TableSchema = {
  table_name: string;
  columns?: { name: string }[];
  foreign_keys?: { column: string; ref_table: string; ref_column: string }[];
};

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'GROUP BY', 'ORDER BY',
  'LIMIT', 'OFFSET', 'ON', 'AS', 'AND', 'OR', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
];
const RESERVED_ALIASES = new Set([...SQL_KEYWORDS, 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER', 'HAVING', 'SET', 'VALUES'].map(word => word.split(' ')[0]));
const TABLE_REFERENCE = /\b(?:from|join|update|into)\s+((?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w$]+)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w$]+))?)(?:\s+(?:as\s+)?([a-z_$][\w$]*))?/gi;

function cleanIdentifier(value: string) {
  return value.split('.').map(part => part.trim().replace(/^["`\[]|["`\]]$/g, '')).join('.');
}

// ponytail: regex covers normal SQL references; use the CodeMirror syntax tree if quoted semicolons or complex CTE aliases become common.
function activeStatement(sql: string, position: number) {
  const start = sql.lastIndexOf(';', Math.max(0, position - 1)) + 1;
  const end = sql.indexOf(';', position);
  return sql.slice(start, end === -1 ? undefined : end);
}

function referencedTables(sql: string, tables: TableSchema[]) {
  const byName = new Map<string, TableSchema>();
  for (const table of tables) {
    byName.set(table.table_name.toLowerCase(), table);
    byName.set(table.table_name.split('.').at(-1)!.toLowerCase(), table);
  }
  const references: { table: TableSchema; qualifier: string }[] = [];
  for (const match of sql.matchAll(TABLE_REFERENCE)) {
    const name = cleanIdentifier(match[1]);
    const table = byName.get(name.toLowerCase()) || byName.get(name.split('.').at(-1)!.toLowerCase());
    if (!table) continue;
    const alias = cleanIdentifier(match[2] || '');
    const qualifier = alias && !RESERVED_ALIASES.has(alias.toUpperCase()) ? alias : table.table_name;
    if (!references.some(item => item.table === table && item.qualifier === qualifier)) references.push({ table, qualifier });
  }
  return references;
}

function joinOptions(references: ReturnType<typeof referencedTables>, tables: TableSchema[]): Completion[] {
  const byName = new Map(tables.map(table => [table.table_name.toLowerCase(), table]));
  const options = new Map<string, Completion>();
  for (const { table, qualifier } of references) {
    for (const foreignKey of table.foreign_keys || []) {
      const target = byName.get(foreignKey.ref_table.toLowerCase());
      const targetName = target?.table_name || foreignKey.ref_table;
      options.set(targetName.toLowerCase(), {
        label: targetName,
        type: 'class',
        detail: `${qualifier}.${foreignKey.column} = ${targetName}.${foreignKey.ref_column}`,
        apply: `${targetName} ON ${qualifier}.${foreignKey.column} = ${targetName}.${foreignKey.ref_column}`,
        boost: 10,
      });
    }
  }
  return [...options.values()];
}

export function buildSqlCompletions(tables: TableSchema[]) {
  const tableOptions: Completion[] = tables.map(table => ({ label: table.table_name, type: 'class', detail: 'table' }));
  const keywordOptions: Completion[] = SQL_KEYWORDS.map(label => ({ label, type: 'keyword' }));
  let previousKey = '';
  let previousOptions: Completion[] = keywordOptions;

  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/[\w.]+$/);
    if (!ctx.explicit && !word) return null;
    const sql = ctx.state.doc.toString();
    const statement = activeStatement(sql, ctx.pos);
    const statementBeforeCursor = sql.slice(sql.lastIndexOf(';', Math.max(0, ctx.pos - 1)) + 1, ctx.pos);
    const expectsTable = /\b(?:from|join|update|into)\s+["`\[\]\w$.]*$/i.test(statementBeforeCursor);
    const expectsJoin = /\bjoin\s+["`\[\]\w$.]*$/i.test(statementBeforeCursor);
    const key = `${statement}\0${expectsTable}\0${expectsJoin}`;
    if (key !== previousKey) {
      previousKey = key;
      const references = referencedTables(statement, tables);
      const columns = references.flatMap(({ table, qualifier }) => (table.columns || []).map(column => ({
        label: `${qualifier}.${column.name}`, type: 'property', detail: `${table.table_name} column`,
      } as Completion)));
      const referencedTableOptions = references.map(({ table }) => ({ label: table.table_name, type: 'class', detail: 'referenced table' } as Completion));
      const joins = expectsJoin ? joinOptions(references, tables) : [];
      const joinedNames = new Set(joins.map(option => option.label.toLowerCase()));
      const availableTables = expectsTable ? tableOptions.filter(option => !joinedNames.has(option.label.toLowerCase())) : referencedTableOptions;
      previousOptions = [...keywordOptions, ...joins, ...availableTables, ...columns];
    }
    return {
      from: word?.from ?? ctx.pos,
      options: previousOptions,
    };
  };
}
