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
The diagram below is the ACTUAL database schema the user is working on. Use it as the single source of truth when answering questions about table columns, relationships, and structure.

IMPORTANT rules when recommending columns for a table:
- Check ALL existing tables' columns first — avoid recommending columns that already exist in other tables
- If another table has authentication/user columns (email, password, role), prefer a foreign key reference instead of duplicating them
- Always reference existing columns from related tables when possible

Name: ${data.title || '(untitled)'}
Tables: ${tableCount}, Relationships: ${edgeCount}

Tables:\n${tableLines || '  (none)'}`;

  if (relLines) {
    context += `\n\nRelationships:\n${relLines}`;
  }

  context += `\n\n[Response format]
When the user asks for table suggestions or schema changes, ALWAYS include a complete valid SQL CREATE TABLE statement for every suggested table. Also include ALTER TABLE statements when modifying existing tables. Use MySQL syntax. The SQL will be parsed and applied to the diagram automatically, so it must be syntactically valid.

However, if the user explicitly requests a JSON mutations format (e.g. in an 'Edit Columns' action), follow their requested format instead. Example:

\`\`\`sql
CREATE TABLE employments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    position VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    is_current TINYINT(1) DEFAULT 0,
    description TEXT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
\`\`\``;

  return context;
}
