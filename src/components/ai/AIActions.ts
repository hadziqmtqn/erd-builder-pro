// ─── Action Types ─────────────────────────────────────

export interface AIAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  /** Build prompt from current context */
  buildPrompt: (context: Record<string, any>) => string;
}

// ─── ERD Actions ──────────────────────────────────────

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

const erdActions: AIAction[] = [
  {
    id: 'erd-edit-column',
    label: 'Edit Columns',
    description: 'Add/edit/delete columns via chat',
    icon: 'Columns',
    buildPrompt: (ctx) => {
      const selectedNode = ctx.selectedNode;
      if (!selectedNode) return 'Select a table first to edit its columns.';
      const data = selectedNode.data || {};
      const cols = (data.columns || []).map((c: any) => {
        const pk = c.primaryKey || c.is_pk ? ' 🔑' : '';
        const nullable = c.is_nullable ? ' NULL' : ' NOT NULL';
        return `  - ${c.name}: ${c.type || c.columnType || 'unknown'}${nullable}${pk}`;
      }).join('\n');
      return `You are editing the table "${data.name || data.label || 'unnamed'}".

Current columns:
${cols || '  (no columns defined)'}

The user will tell you what column changes to make.

If the user specifies column changes, respond with a JSON code block ONLY:

\`\`\`json
{
  "mutations": [
    {"type": "add_column", "column": {"name": "email", "type": "VARCHAR", "is_nullable": false, "is_pk": false}},
    {"type": "drop_column", "column": "old_field"},
    {"type": "modify_column", "column": "existing_name", "changes": {"type": "TEXT", "is_nullable": true}}
  ]
}
\`\`\`

Rules:
- For add_column: all fields required (name, type, is_nullable, is_pk)
- For drop_column: only column name
- For modify_column: only include fields that changed (type, is_nullable, is_pk)
- Keep existing columns that aren't mentioned
- Use plain type names only: INT, BIGINT, VARCHAR, CHAR, TEXT, LONGTEXT, BOOLEAN, DATE, TIMESTAMP, FLOAT, DOUBLE, DECIMAL, UUID, JSON, ENUM (no size parameters like VARCHAR(255))

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
      return `Analyze these tables and suggest appropriate database indexes:\n\n${tables}${erdRelationships(ctx)}\n\nFor each table, recommend which columns should be indexed (primary keys, foreign keys, frequently queried columns) and what type of index (B-tree, Hash, etc.).`;
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

// ─── Notes Actions ────────────────────────────────────

const notesActions: AIAction[] = [
  {
    id: 'notes-summarize',
    label: 'Summarize',
    description: 'Concise summary of the note (default 3 sentences)',
    icon: 'Summary',
    buildPrompt: (ctx) => {
      const content = ctx.content || '';
      const title = ctx.title || 'Untitled';
      return `Summarize this note titled "${title}" concisely (default 3 sentences, adjust length if the user specifies). Capture the main topic, key points, and conclusion. Return ONLY the summary without any preamble:\n\n${content.substring(0, 4000)}`;
    },
  },
  {
    id: 'notes-improve-grammar',
    label: 'Improve Grammar',
    description: 'Polish grammar and writing',
    icon: 'Polish',
    buildPrompt: (ctx) => {
      const content = ctx.content || '';
      return `Improve the grammar, spelling, and clarity of this text. Preserve the original meaning and style. Respond with ONLY the corrected text, no preamble:\n\n${content.substring(0, 4000)}`;
    },
  },
  {
    id: 'notes-generate-docs',
    label: 'Generate Docs',
    description: 'Format as technical documentation',
    icon: 'Docs',
    buildPrompt: (ctx) => {
      const content = ctx.content || '';
      const title = ctx.title || 'Untitled';
      return `Reformat this note titled "${title}" as a well-structured technical documentation page. Use markdown headings, code blocks, tables, and bullet points where appropriate. Return ONLY the reformatted documentation without any preamble:\n\n${content.substring(0, 4000)}`;
    },
  },
];

// ─── Flowchart Actions ────────────────────────────────

function flowchartNodeList(context: Record<string, any>): string {
  const nodes = context.nodes || [];
  if (nodes.length === 0) return '(empty flowchart — no symbols yet)';
  return nodes
    .map((n: any) => {
      const data = n.data || {};
      return `  - "${data.label || 'unnamed'}" (${data.shape || 'rectangle'})`;
    })
    .join('\n');
}

const flowchartActions: AIAction[] = [
  {
    id: 'flowchart-explain',
    label: 'Explain Flow',
    description: 'Natural language description of the flow',
    icon: 'Explain',
    buildPrompt: (ctx) => {
      const nodes = flowchartNodeList(ctx);
      const edges = (ctx.edges || []).map((e: any) => {
        const sourceLabel = e.sourceLabel || e.source;
        const targetLabel = e.targetLabel || e.target;
        return `  ${sourceLabel} → ${targetLabel}`;
      }).join('\n');
      return `Describe what this flowchart represents in plain language. Explain the process flow step by step:\n\nSymbols:\n${nodes}\n\nConnections:\n${edges || '(no connections)'}`;
    },
  },
  {
    id: 'flowchart-pseudocode',
    label: 'Generate Pseudocode',
    description: 'Pseudocode from the flowchart',
    icon: 'Code',
    buildPrompt: (ctx) => {
      const nodes = flowchartNodeList(ctx);
      const edges = (ctx.edges || []).map((e: any) => {
        const sourceLabel = e.sourceLabel || e.source;
        const targetLabel = e.targetLabel || e.target;
        return `  ${sourceLabel} → ${targetLabel}`;
      }).join('\n');
      return `Generate pseudocode that represents the logic and flow shown in this flowchart:\n\nSymbols:\n${nodes}\n\nConnections:\n${edges || '(no connections)'}`;
    },
  },
];

// ─── Registry ─────────────────────────────────────────

export const actionsRegistry: Record<string, AIAction[]> = {
  erd: erdActions,
  notes: notesActions,
  flowchart: flowchartActions,
};

export type ViewType = keyof typeof actionsRegistry;

export function getActionsForView(view: ViewType): AIAction[] {
  return actionsRegistry[view] || [];
}

// ─── Icons as simple text labels (no lucide dependency) ──
// These are used in the dropdown items; the actual icon rendering uses
// a string marker that AIActionButton renders with appropriate icons.

export const actionIcons: Record<string, string> = {
  'erd-edit-column': 'columns',
  'erd-explain-table': 'info',
  'erd-suggest-indexes': 'zap',
  'erd-seed-data': 'file',
  'notes-summarize': 'align-left',
  'notes-improve-grammar': 'spell-check',
  'notes-generate-docs': 'file-text',
  'flowchart-explain': 'info',
  'flowchart-pseudocode': 'code',
};
