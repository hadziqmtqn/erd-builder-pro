type DbClientTableContext = {
  dbType?: string | null;
  activeView: 'data' | 'structure';
  table?: any;
  tableCount: number;
};

export function buildDbClientTableContext({ dbType, activeView, table, tableCount }: DbClientTableContext): string {
  const lines = [
    '[DB Client live context]',
    `Dialect: ${dbType || 'unknown'}`,
    `Current tab: Data / ${activeView === 'structure' ? 'Structure' : 'Records'}`,
    `Tables available: ${tableCount}`,
  ];
  if (!table) return [...lines, 'Selected table: none'].join('\n');

  lines.push(`Selected table: ${table.table_schema ? `${table.table_schema}.` : ''}${table.table_name}`);
  if (table.comment) lines.push(`Table comment: ${table.comment}`);
  lines.push('Columns:');
  for (const column of table.columns || []) {
    const flags = [
      column.is_pk ? 'PK' : '',
      column.is_nullable ? 'NULL' : 'NOT NULL',
      column.column_default != null ? `DEFAULT ${column.column_default}` : '',
      column.is_generated ? 'GENERATED' : '',
    ].filter(Boolean).join(', ');
    lines.push(`  - ${column.name}: ${column.full_type || column.type || 'unknown'}${flags ? ` [${flags}]` : ''}${column.comment ? ` -- ${column.comment}` : ''}`);
  }
  if (table.foreign_keys?.length) {
    lines.push('Foreign keys:', ...table.foreign_keys.map((key: any) =>
      `  - ${key.column} -> ${key.ref_table}.${key.ref_column}${key.on_delete ? ` ON DELETE ${key.on_delete}` : ''}${key.on_update ? ` ON UPDATE ${key.on_update}` : ''}`));
  }
  if (table.indexes?.length) {
    lines.push('Indexes:', ...table.indexes.map((index: any) =>
      `  - ${index.name}: ${index.column_name}${index.is_primary ? ' PRIMARY' : index.is_unique ? ' UNIQUE' : ''}${index.algorithm ? ` ${index.algorithm}` : ''}`));
  }
  if (table.checks?.length) {
    lines.push('Checks:', ...table.checks.map((check: any) => `  - ${check.name || '(unnamed)'}: ${check.expression}`));
  }
  lines.push('Safety: metadata only; no record values or credentials are included. Treat changes as proposals until the user confirms them.');
  return lines.join('\n').slice(0, 6000);
}

export function buildDbClientQueryContext(dbType: string | null, query: { name?: string; script?: string } | null, tables: any[]): string {
  const schema = tables.map(table => {
    const columns = (table.columns || []).map((column: any) => column.name).filter(Boolean).join(', ');
    return `  - ${table.table_name}${columns ? ` (${columns})` : ''}`;
  }).join('\n');
  return `[DB Client live context]
Dialect: ${dbType || 'unknown'}
Current tab: Query
Active query: ${query?.name || '(untitled)'}
SQL:
\`\`\`sql
${String(query?.script || '').slice(0, 4000)}
\`\`\`
Available schema:
${schema || '  (none)'}
Safety: the SQL above has not been executed by the AI. Treat generated SQL as a proposal until the user reviews and confirms it.`.slice(0, 8000);
}
