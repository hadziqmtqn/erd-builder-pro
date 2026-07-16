import { apiFetch } from '@/lib/api';
import { MAX_CHARS_TOTAL, EntityContextData } from './types';

export async function fetchDiagram(uid: string) {
  try {
    const res = await apiFetch(`/api/diagrams/${uid}`);
    if (!res.ok) return null;
    const diagram = await res.json();

    // diagram now includes entities (with columns) and relationships
    const entities = diagram.entities || [];
    const relationships = diagram.relationships || [];

    const parts: string[] = [`Title: ${diagram.name}`];

    parts.push(`\nTables (${entities.length}):`);
    for (const entity of entities) {
      const entityCols = entity.columns || [];
      const colsStr = entityCols
        .map((c: any) => {
          const pk = c.is_pk ? ' 🔑' : '';
          return `  - ${c.name}: ${c.type}${pk}`;
        })
        .join('\n');
      parts.push(`\n  ${entity.name} (${entityCols.length} columns):\n${colsStr}`);
    }

    if (relationships.length > 0) {
      parts.push(`\nRelationships (${relationships.length}):`);
      for (const rel of relationships) {
        const src = entities.find((e: any) => String(e.id) === String(rel.source_entity_id))?.name || rel.source_entity_id;
        const tgt = entities.find((e: any) => String(e.id) === String(rel.target_entity_id))?.name || rel.target_entity_id;
        parts.push(`  ${src} → ${tgt} (${rel.type || 'one-to-many'})`);
      }
    }

    const summary = parts.join('\n').slice(0, MAX_CHARS_TOTAL);

    return {
      title: diagram.name,
      projectId: diagram.project_id,
      summary,
    };
  } catch {
    return null;
  }
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

  let context = `[Database schema — current ERD]
Name: ${data.title || '(untitled)'}
Tables: ${tableCount}, Relationships: ${edgeCount}

Tables:\n${tableLines || '  (none)'}`;

  if (relLines) {
    context += `\n\nRelationships:\n${relLines}`;
  }

  context += `\n\n- Generate SQL in \`\`\`sql blocks when user asks to create/modify schema. Explain conversationally for design questions.
- Avoid duplicating columns across tables; use foreign keys to reference existing auth/user tables.
- Use consistent naming across all tables.
- If the project has related Notes or Flowcharts (listed above), they may describe business rules that this schema should support. Cross-check for consistency.`;

  return context;
}
