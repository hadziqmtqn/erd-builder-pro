import { apiFetch } from '@/lib/api';

interface SiblingItem {
  type: string;
  title: string;
  uid: string;
  content?: string;
  data?: string;
  entities?: { name: string; cols: string }[];
}

export async function fetchSiblings(
  currentType: string,
  currentUid: string,
  projectId: number | string | null,
) {
  if (!projectId) return [];

  try {
    const res = await apiFetch(`/api/projects/${projectId}/siblings`);
    if (!res.ok) return [];
    const data = await res.json();
    const results: { type: string; title: string; uid: string }[] = [];

    for (const n of data.notes || []) {
      if (n.uid === currentUid && currentType === 'note') continue;
      results.push({ type: 'note', title: n.title || '(untitled)', uid: n.uid });
    }
    for (const d of data.diagrams || []) {
      if (d.uid === currentUid && currentType === 'diagram') continue;
      results.push({ type: 'diagram', title: d.name || '(untitled)', uid: d.uid });
    }
    for (const f of data.flowcharts || []) {
      if (f.uid === currentUid && currentType === 'flowchart') continue;
      results.push({ type: 'flowchart', title: f.title || '(untitled)', uid: f.uid });
    }
    for (const d of data.drawings || []) {
      if (d.uid === currentUid && currentType === 'drawing') continue;
      results.push({ type: 'drawing', title: d.title || '(untitled)', uid: d.uid });
    }

    return results;
  } catch {
    return [];
  }
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
  if (!projectId) return null;

  let apiData: any;
  try {
    const res = await apiFetch(`/api/projects/${projectId}/siblings`);
    if (!res.ok) return null;
    apiData = await res.json();
  } catch {
    return null;
  }

  const items: { priority: number; text: string; charLen: number }[] = [];

  // 1. ERD diagrams (highest priority)
  for (const d of apiData.diagrams || []) {
    if (d.uid === currentUid && currentType === 'diagram') continue;
    const entities = d.entities || [];
    if (entities.length > 0) {
      const entityLines = entities.map((e: any) => {
        const colStr = (e.columns || [])
          .map((c: any) => {
            let s = c.name;
            if (c.type) s += `: ${c.type}`;
            if (c.is_pk) s += ' PK';
            return s;
          })
          .join(', ');
        return `    ${e.name} — ${colStr}`;
      }).join('\n');
      const content = `  🗃️ ${d.name} (ERD diagram)\n${entityLines}`;
      items.push({ priority: 1, text: content, charLen: content.length });
    } else {
      items.push({ priority: 1, text: `  🗃️ ${d.name} (ERD diagram)`, charLen: 0 });
    }
  }

  // 2. Notes (high priority)
  for (const n of apiData.notes || []) {
    if (n.uid === currentUid && currentType === 'note') continue;
    const stripped = n.content ? n.content.replace(/<[^>]+>/g, '').trim() : '';
    const preview = stripped.length > 800 ? stripped.slice(0, 800) + '…' : stripped;
    const content = preview
      ? `  📄 ${n.title} (note)\n    ${preview}`
      : `  📄 ${n.title} (note)`;
    items.push({ priority: 2, text: content, charLen: preview.length });
  }

  // 3. Flowcharts (medium priority)
  for (const f of apiData.flowcharts || []) {
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

  // 4. Drawings (lowest priority)
  for (const d of apiData.drawings || []) {
    if (d.uid === currentUid && currentType === 'drawing') continue;
    items.push({ priority: 4, text: `  🖼️ ${d.title} (drawing)`, charLen: 0 });
  }

  if (items.length === 0) return null;

  items.sort((a, b) => a.priority - b.priority);

  const parts: string[] = [];
  let used = 0;
  for (const item of items) {
    const cost = item.text.length + 1;
    if (used + cost > budget) {
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
