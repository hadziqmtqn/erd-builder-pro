import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────

export interface EntityContext {
  entityType: string; // 'note' | 'diagram' | 'flowchart' | 'drawing'
  entityUid: string;
}

export interface EntityContextResult {
  /** Human-readable context text to inject as AI system message */
  contextText: string;
  /** Project ID for cross-reference lookups */
  projectId: number | string | null;
}

const PREVIEW_CHARS = 1500;
const MAX_CHARS_TOTAL = 3000;

// ─── Fetch current entity ────────────────────────────

async function fetchNote(uid: string) {
  const { data, error } = await supabase
    .from('notes')
    .select('title, content, project_id')
    .eq('uid', uid)
    .single();

  if (error || !data) return null;

  const contentPreview = data.content
    ? data.content.slice(0, PREVIEW_CHARS)
    : '(empty)';

  return {
    title: data.title,
    projectId: data.project_id,
    summary: `Title: ${data.title}\nContent preview:\n${contentPreview}`,
  };
}

async function fetchDiagram(uid: string) {
  const { data: diagram, error } = await supabase
    .from('diagrams')
    .select('id, name, project_id')
    .eq('uid', uid)
    .single();

  if (error || !diagram) return null;

  // Fetch entities with their columns
  const { data: entities } = await supabase
    .from('entities')
    .select('id, name, color')
    .eq('diagram_id', diagram.id);

  const entityIds = entities?.map(e => e.id) || [];

  // Fetch columns for all entities
  const { data: columns } = entityIds.length > 0
    ? await supabase
        .from('columns')
        .select('entity_id, name, type, is_pk')
        .in('entity_id', entityIds)
    : { data: [] };

  // Group columns by entity_id
  const columnsByEntity: Record<string, { entity_id: string; name: string; type: string; is_pk: boolean }[]> = {};
  for (const col of columns || []) {
    if (!columnsByEntity[col.entity_id]) columnsByEntity[col.entity_id] = [];
    const entry: { entity_id: string; name: string; type: string; is_pk: boolean } = col as any;
    columnsByEntity[col.entity_id].push(entry);
  }

  // Fetch relationships
  const { data: relationships } = await supabase
    .from('relationships')
    .select('source_entity_id, target_entity_id, type, label')
    .eq('diagram_id', diagram.id);

  // Build summary
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

async function fetchDrawing(uid: string) {
  const { data, error } = await supabase
    .from('drawings')
    .select('title, data, project_id')
    .eq('uid', uid)
    .single();

  if (error || !data) return null;

  let elementsSummary = '(no elements)';
  try {
    const elements = JSON.parse(data.data || '[]');
    if (Array.isArray(elements) && elements.length > 0) {
      const names = elements
        .map((e: any) => e.name || e.text || e.type || 'element')
        .filter(Boolean);
      elementsSummary = names.length > 0
        ? names.slice(0, 30).join(', ')
        : `${elements.length} elements`;
    }
  } catch {
    elementsSummary = '(binary or unparseable data)';
  }

  return {
    title: data.title,
    projectId: data.project_id,
    summary: `Title: ${data.title}\nElements: ${elementsSummary}`,
  };
}

async function fetchFlowchart(uid: string) {
  const { data, error } = await supabase
    .from('flowcharts')
    .select('title, data, project_id')
    .eq('uid', uid)
    .single();

  if (error || !data) return null;

  let nodesSummary = '(empty)';
  try {
    const parsed = JSON.parse(data.data || '{}');
    const nodes = parsed.nodes || [];
    if (Array.isArray(nodes) && nodes.length > 0) {
      const names = nodes
        .map((n: any) => n.data?.label || n.label || n.id || 'node')
        .filter(Boolean);
      nodesSummary = names.length > 0
        ? names.slice(0, 30).join(' → ')
        : `${nodes.length} nodes`;
    }
  } catch {
    nodesSummary = '(unparseable data)';
  }

  return {
    title: data.title,
    projectId: data.project_id,
    summary: `Title: ${data.title}\nNodes: ${nodesSummary}`,
  };
}

async function fetchCurrentEntity(ctx: EntityContext) {
  switch (ctx.entityType) {
    case 'note':
      return fetchNote(ctx.entityUid);
    case 'diagram':
      return fetchDiagram(ctx.entityUid);
    case 'drawing':
      return fetchDrawing(ctx.entityUid);
    case 'flowchart':
      return fetchFlowchart(ctx.entityUid);
    default:
      return null;
  }
}

// ─── Fetch sibling files in same project ─────────────

async function fetchSiblings(
  currentType: string,
  currentUid: string,
  projectId: number | string | null,
) {
  if (!projectId) return [];

  const results: { type: string; title: string; uid: string }[] = [];

  const queries = [
    { table: 'notes', type: 'note', titleCol: 'title', uidCol: 'uid' },
    { table: 'diagrams', type: 'diagram', titleCol: 'name', uidCol: 'uid' },
    { table: 'drawings', type: 'drawing', titleCol: 'title', uidCol: 'uid' },
    { table: 'flowcharts', type: 'flowchart', titleCol: 'title', uidCol: 'uid' },
  ] as const;

  for (const q of queries) {
    const { data } = await supabase
      .from(q.table)
      .select(`${q.titleCol}, ${q.uidCol}`)
      .eq('project_id', projectId)
      .eq('is_deleted', false);

    if (data) {
      for (const row of data) {
        const uid = (row as any)[q.uidCol];
        if (uid === currentUid) continue;
        results.push({
          type: q.type,
          title: (row as any)[q.titleCol] || '(untitled)',
          uid,
        });
      }
    }
  }

  return results;
}

// ─── Build context text ──────────────────────────────

function formatContextText(
  entityType: string,
  entity: { title: string; summary: string },
  siblings: { type: string; title: string; uid: string }[],
): string {
  const typeLabels: Record<string, string> = {
    note: 'Note',
    diagram: 'ERD Diagram',
    flowchart: 'Flowchart',
    drawing: 'Drawing',
  };
  const currentLabel = typeLabels[entityType] || entityType;

  const lines: string[] = [];
  lines.push(`[Context — ${currentLabel}]:`);
  lines.push(entity.summary);

  if (siblings.length > 0) {
    const iconMap: Record<string, string> = {
      note: '📄',
      diagram: '🗃️',
      flowchart: '📊',
      drawing: '🖼️',
    };
    lines.push(`\n[Related files in same project (${siblings.length})]:`);
    for (const sib of siblings) {
      const icon = iconMap[sib.type] || '📎';
      lines.push(`  ${icon} ${sib.title} (${sib.type})`);
    }
  }

  return lines.join('\n');
}

// ─── Public API ──────────────────────────────────────

/**
 * Fetch entity context and build a system message string
 * that describes the current file and related project files.
 */
export async function fetchEntityContext(
  ctx: EntityContext,
): Promise<EntityContextResult | null> {
  const entity = await fetchCurrentEntity(ctx);
  if (!entity) return null;

  const siblings = await fetchSiblings(
    ctx.entityType,
    ctx.entityUid,
    entity.projectId,
  );

  const contextText = formatContextText(ctx.entityType, entity, siblings);

  return {
    contextText,
    projectId: entity.projectId,
  };
}
