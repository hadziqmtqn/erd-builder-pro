import { AIAction } from './types';

const typeSuffix = (c: any) => c.max_length
  ? `(${c.max_length})`
  : c.numeric_precision
    ? `(${c.numeric_precision}${c.numeric_scale !== null && c.numeric_scale !== undefined ? `,${c.numeric_scale}` : ''})`
    : '';

function erdTableList(context: Record<string, any>): string {
  const nodes = context.nodes || [];
  if (nodes.length === 0) return '(empty diagram — no tables yet)';
  return nodes
    .map((n: any) => {
      const data = n.data || {};
      const cols = (data.columns || []).map((c: any) => {
        const pk = c.primaryKey || c.is_pk ? ' 🔑' : '';
        const comment = c.comment ? ` -- ${c.comment}` : '';
        return `    - ${c.name}: ${c.type || c.columnType || 'unknown'}${typeSuffix(c)}${pk}${comment}`;
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
    id: 'erd-generate-sql',
    label: 'Generate DBML',
    description: 'Create or extend ERD schema with DBML',
    icon: 'Database',
    buildPrompt: (ctx) => {
      const tables = erdTableList(ctx);
      const relationships = erdRelationships(ctx);
      const currentContext = ctx.content ? `\nFull ERD context:\n${ctx.content}` : '';

      return `You are generating schema changes for the active ERD canvas.

Current tables:
${tables}${relationships}${currentContext}

The user will describe the schema they want.

When the user asks to create or modify the schema, respond with DBML in a \`\`\`dbml code block. The DBML must be directly applicable to the ERD canvas through the Append action.

DBML rules:
- The code fence language must be exactly dbml. Never label DBML as yaml, arduino, markdown, schema, or sql, and never nest fenced blocks.
- Use uppercase portable types and explicit VARCHAR/CHAR lengths; omit [null] because nullable is the default. Quote string defaults such as [default: 'pending'].
- Name every Enum exactly {table_name}_{column_name}; for example, users.access_role uses users_access_role and invoices.status uses invoices_status. Never use generic names such as user_roles or payment_status.
- Use one standalone Ref: child.parent_id > parents.id per relationship. Never use inline [ref: ...], duplicate a Ref, omit >, or reference undefined tables/columns. Check compatible FK/PK types.
- Preflight the full output for balanced braces/fences and parser-valid DBML before responding.
- Use Table blocks for every table that should be created or changed.
- Use [pk] for primary keys and [not null] for required fields.
- Use [note: '...'] for column comments and sized types like VARCHAR(100) when max length matters.
- Use Ref lines for relationships, for example: Ref: posts.user_id > users.id
- Declare each relationship once with a standalone Ref line; never use inline [ref: ...] attributes and never omit the > direction marker.
- Use [unique] for a single unique column. For composite uniqueness, use Indexes { (column_a, column_b) [unique] } inside the Table block; never write SQL-like unique (column_a, column_b).
- Use Enum blocks when a column has constrained values.
- Prefer portable types: BIGINT, INT, UUID, VARCHAR, TEXT, BOOLEAN, DATE, TIMESTAMP, DECIMAL, FLOAT, DOUBLE, JSON, ENUM.
- Keep existing tables and columns unless the user explicitly asks to replace or remove them.
- Avoid duplicate relationship columns. Reuse existing auth/user tables when they already exist.
- Validate the DBML contract before responding: it must generate an ERD without manual syntax repair.

After the DBML block, add one short sentence telling the user they can click Append to preview and apply it.`;
    },
  },
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
          const comment = c.comment ? ` -- ${c.comment}` : '';
          return `  - ${c.name}: ${c.type || c.columnType || 'unknown'}${typeSuffix(c)}${nullable}${pk}${comment}`;
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
  ? '```json\n{\n  "users": {\n    "mutations": [\n      {"type": "add_column", "column": {"name": "email", "type": "VARCHAR", "is_nullable": false, "is_pk": false, "max_length": 100, "comment": "Harus unik"}},\n      {"type": "drop_column", "column": "old_field"}\n    ]\n  },\n  "admins": {\n    "mutations": [\n      {"type": "modify_column", "column": "role", "changes": {"type": "DECIMAL", "numeric_precision": 10, "numeric_scale": 2, "comment": "Role akses"}}\n    ]\n  }\n}\n```\n\nKlik tombol **Append** untuk menerapkan perubahan ke tabel users dan admins.'
  : '```json\n{\n  "mutations": [\n    {"type": "add_column", "column": {"name": "email", "type": "VARCHAR", "is_nullable": false, "is_pk": false, "max_length": 100, "comment": "Harus unik"}},\n    {"type": "drop_column", "column": "old_field"},\n    {"type": "modify_column", "column": "existing_name", "changes": {"type": "TEXT", "is_nullable": true, "comment": "Catatan baru"}}\n  ]\n}\n```\n\nKlik tombol **Append** untuk menerapkan perubahan ke tabel ' + tableList + '.'}

Rules:
- For add_column: all fields required (name, type, is_nullable, is_pk)
- For drop_column: only column name
- For modify_column: only include fields that changed
- Optional metadata: comment, max_length for VARCHAR/CHAR/TEXT/BINARY types, numeric_precision and numeric_scale for DECIMAL/NUMERIC
- Keep existing columns that aren't mentioned
- Use plain type names only: INT, BIGINT, VARCHAR, CHAR, TEXT, LONGTEXT, BOOLEAN, DATE, TIMESTAMP, FLOAT, DOUBLE, DECIMAL, NUMERIC, UUID, JSON, ENUM. Put VARCHAR size in max_length and DECIMAL(10,2) in numeric_precision/numeric_scale.
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
        const comment = c.comment ? ` -- ${c.comment}` : '';
        return `- ${c.name}: ${c.type || c.columnType || 'unknown'}${typeSuffix(c)}${pk}${comment}`;
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
