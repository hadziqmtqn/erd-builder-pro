import { AIAction } from './types';

function erdTableList(context: Record<string, any>): string {
  const nodes = context.nodes || [];
  if (nodes.length === 0) return '(empty diagram — no tables yet)';
  return nodes
    .map((n: any) => {
      const data = n.data || {};
      const cols = (data.columns || []).map((c: any) => {
        const pk = c.primaryKey || c.is_pk ? ' 🔑' : '';
        return `    - ${c.name}: ${c.type || c.columnType || 'unknown'}${pk}`;
      }).join('\n');
      return `  ${data.name || data.label || 'unnamed'}:\n${cols || '    (no columns)'}`;
    })
    .join('\n');
}

function erdRelationships(context: Record<string, any>): string {
  const edges = context.edges || [];
  if (edges.length === 0) return '';
  const lines = edges.map((e: any) => {
    const sourceLabel = e.sourceLabel || e.source;
    const targetLabel = e.targetLabel || e.target;
    return `  ${sourceLabel} → ${targetLabel}`;
  });
  return `\nRelationships:\n${lines.join('\n')}`;
}

export const erdActions: AIAction[] = [
  {
    id: 'erd-edit-column',
    label: 'Edit Columns',
    description: 'Add/edit/delete columns via chat',
    icon: 'Columns',
    buildPrompt: (ctx) => {
      const selectedNode = ctx.selectedNode;
      const multiSelectedNodes = ctx.multiSelectedNodes || [];

      if (!selectedNode && multiSelectedNodes.length === 0) {
        return 'Select a table first to edit its columns.';
      }

      const targetNodes = multiSelectedNodes.length > 1
        ? multiSelectedNodes
        : (selectedNode ? [selectedNode] : []);

      if (targetNodes.length === 0) return 'Select a table first to edit its columns.';

      const isMulti = targetNodes.length > 1;

      const tablesText = targetNodes.map((node: any) => {
        const data = node.data || {};
        const cols = (data.columns || []).map((c: any) => {
          const pk = c.primaryKey || c.is_pk ? ' 🔑' : '';
          const nullable = c.is_nullable ? ' NULL' : ' NOT NULL';
          return `  - ${c.name}: ${c.type || c.columnType || 'unknown'}${nullable}${pk}`;
        }).join('\n');
        return `Table: ${data.name || data.label || 'unnamed'}\n${cols || '  (no columns defined)'}`;
      }).join('\n\n');

      const tableNames = targetNodes.map((n: any) => n.data?.name || n.data?.label || 'unnamed');
      const tableList = tableNames.join(', ');

      return `You are editing ${targetNodes.length} table(s):

${tablesText}

The user will tell you what column changes to make.

If the user specifies column changes, respond with a JSON code block ONLY, followed by a brief user-facing message on the next line telling the user they can click the Append button to apply the changes. Example:

${isMulti
  ? '```json\n{\n  "users": {\n    "mutations": [\n      {"type": "add_column", "column": {"name": "email", "type": "VARCHAR", "is_nullable": false, "is_pk": false}},\n      {"type": "drop_column", "column": "old_field"}\n    ]\n  },\n  "admins": {\n    "mutations": [\n      {"type": "modify_column", "column": "role", "changes": {"type": "VARCHAR", "is_nullable": true}}\n    ]\n  }\n}\n```\n\nKlik tombol **Append** untuk menerapkan perubahan ke tabel users dan admins.'
  : '```json\n{\n  "mutations": [\n    {"type": "add_column", "column": {"name": "email", "type": "VARCHAR", "is_nullable": false, "is_pk": false}},\n    {"type": "drop_column", "column": "old_field"},\n    {"type": "modify_column", "column": "existing_name", "changes": {"type": "TEXT", "is_nullable": true}}\n  ]\n}\n```\n\nKlik tombol **Append** untuk menerapkan perubahan ke tabel ' + tableList + '.'}

Rules:
- For add_column: all fields required (name, type, is_nullable, is_pk)
- For drop_column: only column name
- For modify_column: only include fields that changed
- Keep existing columns that aren't mentioned
- Use plain type names only: INT, BIGINT, VARCHAR, CHAR, TEXT, LONGTEXT, BOOLEAN, DATE, TIMESTAMP, FLOAT, DOUBLE, DECIMAL, UUID, JSON, ENUM (no size parameters like VARCHAR(255))
${isMulti ? '- Use the multi-table format with table names as keys. Edit ONLY the tables listed above.' : ''}

If the user does NOT specify any column changes, ask them what columns they want to add, remove, or modify instead.`;
    },
  },
  {
    id: 'erd-explain-table',
    label: 'Explain Table',
    description: 'Natural language description of selected table',
    icon: 'Explain',
    buildPrompt: (ctx) => {
      const selectedNode = ctx.selectedNode;
      if (!selectedNode) return 'Explain the selected table in the ERD diagram.';
      const data = selectedNode.data || {};
      const cols = (data.columns || []).map((c: any) => {
        const pk = c.primaryKey || c.is_pk ? ' (PK)' : '';
        return `- ${c.name}: ${c.type || c.columnType || 'unknown'}${pk}`;
      }).join('\n');
      return `Explain this database table in plain language — what it stores, what each column means, and common use cases:\n\nTable: ${data.name || data.label || 'unnamed'}\nColumns:\n${cols || '(no columns defined)'}`;
    },
  },
  {
    id: 'erd-suggest-indexes',
    label: 'Suggest Indexes',
    description: 'Analyze columns and recommend indexes',
    icon: 'Index',
    buildPrompt: (ctx) => {
      const tables = erdTableList(ctx);
      return `Analyze these tables and suggest appropriate database indexes:\n\n${tables}${erdRelationships(ctx)}\n\nFor each table, recommend which columns should be indexed (primary keys, foreign keys, frequently queried columns) and what type of index (B-tree, Hash, etc.).\n\nCRITICAL: Only recommend indexes on columns that actually exist in the schema above. Do NOT invent or assume foreign key columns (e.g., company_id) that are not listed. Base every recommendation strictly on the columns and relationships provided. If a table has a name-based column (e.g., company_name) instead of a foreign key ID, recommend based on what actually exists. Do not suggest adding new columns.`;
    },
  },
  {
    id: 'erd-seed-data',
    label: 'Seed Data',
    description: 'Generate INSERT statements with sample data',
    icon: 'Data',
    buildPrompt: (ctx) => {
      const tables = erdTableList(ctx);
      return `Generate INSERT statements with realistic sample data for these tables:\n\n${tables}${erdRelationships(ctx)}\n\nGenerate 3-5 rows per table with realistic-looking data. Ensure foreign key references are consistent across tables.`;
    },
  },
];
