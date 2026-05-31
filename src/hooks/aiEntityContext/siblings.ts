import { supabase, supabaseConfigured } from '@/lib/supabase';

// ── Fetch per-project entities + columns (for rich ERD sibling context) ──

interface EntityRow { id: number | string; name: string; diagram_id: number | string }
interface ColumnRow { entity_id: number | string; name: string; type: string; is_pk: boolean }

async function fetchProjectEntities(
  projectId: number | string,
): Promise<Record<string | number, { name: string; cols: string }[]>> {
  if (!supabase) return {};
  const { data: diagrams } = await supabase
    .from('diagrams')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_deleted', false);

  if (!diagrams || diagrams.length === 0) return {};

  const diagramIds = diagrams.map(d => d.id);

  const { data: entities } = await supabase
    .from('entities')
    .select('id, name, diagram_id')
    .in('diagram_id', diagramIds) as { data: EntityRow[] | null };

  if (!entities || entities.length === 0) return {};

  const entityIds = entities.map(e => e.id);

  const { data: columns } = await supabase
    .from('columns')
    .select('entity_id, name, type, is_pk')
    .in('entity_id', entityIds) as { data: ColumnRow[] | null };

  const colsByEntity: Record<string | number, ColumnRow[]> = {};
  for (const col of columns || []) {
    if (!colsByEntity[col.entity_id]) colsByEntity[col.entity_id] = [];
    colsByEntity[col.entity_id].push(col);
  }

  const result: Record<string | number, { name: string; cols: string }[]> = {};
  for (const ent of entities) {
    if (!result[ent.diagram_id]) result[ent.diagram_id] = [];
    const colStr = (colsByEntity[ent.id] || [])
      .map(c => {
        let s = c.name;
        if (c.type) s += `: ${c.type}`;
        if (c.is_pk) s += ' PK';
        return s;
      })
      .join(', ');
    result[ent.diagram_id].push({ name: ent.name, cols: colStr });
  }

  return result;
}

export async function fetchSiblings(
  currentType: string,
  currentUid: string,
  projectId: number | string | null,
) {
  if (!supabase || !projectId) return [];

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
        const rowData = row as Record<string, any>;
        const uid = rowData[q.uidCol];
        if (uid === currentUid) continue;
        results.push({
          type: q.type,
          title: rowData[q.titleCol] || '(untitled)',
          uid,
        });
      }
    }
  }

  return results;
}

/**
 * buildSiblingContext
 *
 * Fetch ALL project files (notes, ERDs, flowcharts, drawings) and build a
 * rich context string for AI. Each sibling file gets full content if it fits
 * within the character budget, otherwise a truncated summary.
 *
 * Budget allocation priority (by value density):
 *   1. ERD diagrams — table names + column details
 *   2. Notes — full markdown content (stripped HTML)
 *   3. Flowcharts — node labels
 *   4. Drawings — title only
 *
 * The current active entity (currentType + currentUid) is excluded — it is
 * already provided by entityContextText.
 */
const MAX_BUDGET = 6000;

export async function buildSiblingContext(
  currentType: string,
  currentUid: string,
  projectId: number | string,
  budget: number = MAX_BUDGET,
): Promise<string | null> {
  if (!supabase || !projectId) return null;

  const [notesRes, diagramsRes, flowchartsRes, drawingsRes, entityMap] = await Promise.all([
    supabase
      .from('notes')
      .select('uid, title, content, updated_at')
      .eq('project_id', projectId)
      .eq('is_deleted', false),
    supabase
      .from('diagrams')
      .select('uid, name, id, updated_at')
      .eq('project_id', projectId)
      .eq('is_deleted', false),
    supabase
      .from('flowcharts')
      .select('uid, title, data, updated_at')
      .eq('project_id', projectId)
      .eq('is_deleted', false),
    supabase
      .from('drawings')
      .select('uid, title, updated_at')
      .eq('project_id', projectId)
      .eq('is_deleted', false),
    fetchProjectEntities(projectId),
  ]);

  // Build items array with priority weights
  const items: { priority: number; text: string; charLen: number }[] = [];

  // 1. ERD diagrams (highest priority)
  if (diagramsRes.data) {
    for (const d of diagramsRes.data) {
      if (d.uid === currentUid && currentType === 'diagram') continue;
      const entities = entityMap[d.id] || [];
      if (entities.length > 0) {
        const entityLines = entities.map(e =>
          `    ${e.name} — ${e.cols}`
        ).join('\n');
        const content = `  🗃️ ${d.name} (ERD diagram)\n${entityLines}`;
        items.push({ priority: 1, text: content, charLen: content.length });
      } else {
        items.push({ priority: 1, text: `  🗃️ ${d.name} (ERD diagram)`, charLen: 0 });
      }
    }
  }

  // 2. Notes (high priority)
  if (notesRes.data) {
    for (const n of notesRes.data) {
      if (n.uid === currentUid && currentType === 'note') continue;
      const stripped = n.content ? n.content.replace(/<[^>]+>/g, '').trim() : '';
      // Each note gets up to 800 chars of content
      const preview = stripped.length > 800 ? stripped.slice(0, 800) + '…' : stripped;
      const content = preview
        ? `  📄 ${n.title} (note)\n    ${preview}`
        : `  📄 ${n.title} (note)`;
      items.push({ priority: 2, text: content, charLen: preview.length });
    }
  }

  // 3. Flowcharts (medium priority)
  if (flowchartsRes.data) {
    for (const f of flowchartsRes.data) {
      if (f.uid === currentUid && currentType === 'flowchart') continue;
      let nodeLabels = '';
      try {
        const parsed = JSON.parse(f.data || '{}');
        const nodes = parsed.nodes || [];
        if (Array.isArray(nodes) && nodes.length > 0) {
          nodeLabels = nodes
            .map((n: any) => n.data?.label || n.label || '')
            .filter(Boolean)
            .slice(0, 10)
            .join(' → ');
        }
      } catch { /* ignore parse errors */ }
      const content = nodeLabels
        ? `  📊 ${f.title} (flowchart) — ${nodeLabels}`
        : `  📊 ${f.title} (flowchart)`;
      items.push({ priority: 3, text: content, charLen: nodeLabels.length });
    }
  }

  // 4. Drawings (lowest priority)
  if (drawingsRes.data) {
    for (const d of drawingsRes.data) {
      if (d.uid === currentUid && currentType === 'drawing') continue;
      items.push({ priority: 4, text: `  🖼️ ${d.title} (drawing)`, charLen: 0 });
    }
  }

  if (items.length === 0) return null;

  // Sort by priority, then by most recently updated within same priority
  items.sort((a, b) => a.priority - b.priority);

  // Greedy budget allocation
  const parts: string[] = [];
  let used = 0;
  for (const item of items) {
    const cost = item.text.length + 1; // +1 for newline
    if (used + cost > budget) {
      // Fall back to truncated: title + char count hint
      const firstLine = item.text.split('\n')[0];
      const truncated = `${firstLine} — [${item.charLen} chars]`;
      const truncatedCost = truncated.length + 1;
      if (used + truncatedCost > budget) break;
      parts.push(truncated);
      used += truncatedCost;
    } else {
      parts.push(item.text);
      used += cost;
    }
  }

  return `[Related files in this workspace (${parts.length})]:\n${parts.join('\n')}`;
}
