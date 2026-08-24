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

function joinEdges(tables: TableSchema[]) {
  const edges: Record<string, { to: string; sql: string }[]> = {};
  const add = (from: string, to: string, sql: string) => {
    edges[from] ||= [];
    edges[from].push({ to, sql });
  };
  for (const table of tables) {
    for (const fk of table.foreign_keys || []) {
      if (!fk.column || !fk.ref_table || !fk.ref_column) continue;
      add(table.table_name, fk.ref_table, `JOIN ${fk.ref_table} ON ${table.table_name}.${fk.column} = ${fk.ref_table}.${fk.ref_column}`);
      add(fk.ref_table, table.table_name, `JOIN ${table.table_name} ON ${table.table_name}.${fk.column} = ${fk.ref_table}.${fk.ref_column}`);
    }
  }
  return edges;
}

export function buildSqlCompletions(tables: TableSchema[], activeTable: string | null) {
  const tableOptions: Completion[] = tables.map(table => ({ label: table.table_name, type: 'class', detail: 'table' }));
  const columnOptions: Completion[] = tables.flatMap(table => (table.columns || []).map(column => ({
    label: `${table.table_name}.${column.name}`,
    type: 'property',
    detail: 'column',
  })));
  const keywordOptions: Completion[] = SQL_KEYWORDS.map(label => ({ label, type: 'keyword' }));
  const relationOptions: Completion[] = [];

  if (activeTable) {
    const edges = joinEdges(tables);
    const queue = [{ table: activeTable, path: [] as string[] }];
    const seen = new Set([activeTable]);
    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of edges[current.table] || []) {
        if (seen.has(edge.to)) continue;
        const path = [...current.path, edge.sql];
        seen.add(edge.to);
        relationOptions.push({
          label: path[path.length - 1],
          type: 'variable',
          detail: path.length > 1 ? `${path.length} joins` : 'foreign key',
          apply: path.join('\n'),
        });
        queue.push({ table: edge.to, path });
      }
    }
  }

  const options = [...relationOptions, ...keywordOptions, ...tableOptions, ...columnOptions];

  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/[\w.]+$/);
    if (!ctx.explicit && !word) return null;
    return {
      from: word?.from ?? ctx.pos,
      options,
    };
  };
}
