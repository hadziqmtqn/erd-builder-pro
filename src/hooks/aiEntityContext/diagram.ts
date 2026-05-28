import { supabase } from '@/lib/supabase';
import { MAX_CHARS_TOTAL, EntityContextData } from './types';

export async function fetchDiagram(uid: string) {
  const { data: diagram, error } = await supabase
    .from('diagrams')
    .select('id, name, project_id')
    .eq('uid', uid)
    .single();

  if (error || !diagram) return null;

  const { data: entities } = await supabase
    .from('entities')
    .select('id, name, color')
    .eq('diagram_id', diagram.id);

  const entityIds = entities?.map(e => e.id) || [];

  const { data: columns } = entityIds.length > 0
    ? await supabase
        .from('columns')
        .select('entity_id, name, type, is_pk')
        .in('entity_id', entityIds)
    : { data: [] };

  const columnsByEntity: Record<string, { entity_id: string; name: string; type: string; is_pk: boolean }[]> = {};
  for (const col of columns || []) {
    if (!columnsByEntity[col.entity_id]) columnsByEntity[col.entity_id] = [];
    const entry: { entity_id: string; name: string; type: string; is_pk: boolean } = col as any;
    columnsByEntity[col.entity_id].push(entry);
  }

  const { data: relationships } = await supabase
    .from('relationships')
    .select('source_entity_id, target_entity_id, type, label')
    .eq('diagram_id', diagram.id);

  const parts: string[] = [`Title: ${diagram.name}`];

  parts.push(`\nTables (${entities?.length || 0}):`);
  for (const entity of entities || []) {
    const entityCols = columnsByEntity[entity.id] || [];
    const colsStr = entityCols
      .map(c => {
        const pk = c.is_pk ? ' 🔑' : '';
        return `  - ${c.name}: ${c.type}${pk}`;
      })
      .join('\n');
    parts.push(`\n  ${entity.name} (${entityCols.length} columns):\n${colsStr}`);
  }

  if (relationships && relationships.length > 0) {
    parts.push(`\nRelationships (${relationships.length}):`);
    for (const rel of relationships) {
      const src = entities?.find(e => e.id === rel.source_entity_id)?.name || rel.source_entity_id;
      const tgt = entities?.find(e => e.id === rel.target_entity_id)?.name || rel.target_entity_id;
      parts.push(`  ${src} → ${tgt} (${rel.type || 'one-to-many'})`);
    }
  }

  const summary = parts.join('\n').slice(0, MAX_CHARS_TOTAL);

  return {
    title: diagram.name,
    projectId: diagram.project_id,
    summary,
  };
}

function extractHandleId(handle: string | null | undefined): string | null {
  if (!handle) return null;
  return handle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') || null;
}

export function buildDiagramContext(data: EntityContextData): string | null {
  const entityNodes = (data.nodes || []).filter((n: any) => n.type === 'entity');
  const tableCount = entityNodes.length;
  const edgeCount = (data.edges || []).length;

  const tableLines = entityNodes.map((node: any) => {
    const d = node.data || {};
    const cols = (d.columns || []).map((c: any) => {
      const pk = c.is_pk ? ' PK' : '';
      const nullable = c.is_nullable ? ' NULL' : '';
      return `${c.name}: ${c.type}${pk}${nullable}`;
    }).join(', ');
    return `  - ${d.name} (${cols})`;
  }).join('\n');

  const relLines = (data.edges || []).map((e: any) => {
    const sNode = entityNodes.find((n: any) => n.id === e.source);
    const tNode = entityNodes.find((n: any) => n.id === e.target);
    if (!sNode || !tNode) return '';

    const sourceColId = extractHandleId(e.sourceHandle);
    const targetColId = extractHandleId(e.targetHandle);
    const sourceCol = sourceColId ? (sNode.data.columns || []).find((c: any) => c.id === sourceColId) : null;
    const targetCol = targetColId ? (tNode.data.columns || []).find((c: any) => c.id === targetColId) : null;

    const colInfo = sourceCol && targetCol
      ? ` (${sNode.data.name}.${sourceCol.name} → ${tNode.data.name}.${targetCol.name})`
      : '';
    return `  - ${sNode.data.name} → ${tNode.data.name}${colInfo} (${e.label || '1:N'})`;
  }).filter(Boolean).join('\n');

  let context = `[Database schema context]

[CRITICAL — Output format instruction]
When you respond about database schemas, tables, columns, or relationships, you MUST output valid SQL DDL statements inside a \`\`\`sql code block. The app will parse the SQL and generate an interactive ERD diagram automatically — this is the ONLY way the user can see their schema visually.

Rules:
1. ALWAYS wrap SQL in \`\`\`sql ... \`\`\` code blocks — plain text or HTML tables will NOT be parsed by the app
2. Use CREATE TABLE for new tables with inline constraints (PRIMARY KEY, NOT NULL, NULL, DEFAULT, REFERENCES)
3. Use ALTER TABLE ... ADD COLUMN for modifying existing tables
4. Foreign keys can be inline in CREATE TABLE (REFERENCES) or as ALTER TABLE ... ADD FOREIGN KEY
5. If the user asks to create an ERD or database from scratch, generate the complete SQL DDL with all tables
6. If the user asks for an explanation, you may include a brief description before or after the SQL block
7. Support standard SQL types: BIGINT, INT, VARCHAR(n), TEXT, BOOLEAN, DATE, TIMESTAMP, DECIMAL, UUID, JSONB, etc.
8. You MAY split SQL into multiple \`\`\`sql blocks if that is clearer, but one block per set of related tables is preferred
9. When telling the user to apply the SQL to their diagram, do NOT say "click Append/Replace". Instead, say "click the Database button below this message" or "use the SQL → ERD button" — the app shows a dedicated Database icon button (not Append/Replace) when SQL is detected in your response.

Example:
\`\`\`sql
CREATE TABLE users (
    id BIGINT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE posts (
    id BIGINT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT
);
\`\`\`

[Current ERD data]
Name: ${data.title || '(untitled)'}
Tables: ${tableCount}, Relationships: ${edgeCount}

Tables:\n${tableLines || '  (none)'}`;

  if (relLines) {
    context += `\n\nRelationships:\n${relLines}`;
  }

  context += `\n\n[Schema design rules]
- When adding columns to existing tables, check existing columns first — avoid duplicates
- If another table stores user/auth data (email, password, role), reference it via foreign key instead of duplicating columns
- Use consistent naming conventions across all tables`;

  return context;
}
