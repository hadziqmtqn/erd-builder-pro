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
    return results;
  } catch {
    return [];
  }
}

/**
 * Build rich context from all sibling files in the project.
 * Query relevance first, then value density: ERD diagrams > Notes > Flowcharts.
 * Current entity (currentType + currentUid) is excluded — already in entityContextText.
 */
const MAX_BUDGET = 6000;

export async function buildSiblingContext(
  currentType: string,
  currentUid: string,
  projectId: number | string,
  budget: number = MAX_BUDGET,
  query: string = '',
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

  const items: { priority: number; text: string; charLen: number; relevance: number }[] = [];
  const addItem = (priority: number, text: string, charLen: number) => {
    items.push({ priority, text, charLen, relevance: siblingRelevanceScore(text, query) });
  };

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
      const feature = (d.source_type ?? d.sourceType) === 'production_db' ? 'DB Client' : 'ERD';
      const content = `  ${d.name} (${feature})\n${entityLines}`;
      addItem(1, content, content.length);
    } else {
      const feature = (d.source_type ?? d.sourceType) === 'production_db' ? 'DB Client' : 'ERD';
      addItem(1, `  ${d.name} (${feature})`, 0);
    }
  }

  // 2. Notes (high priority)
  for (const n of apiData.notes || []) {
    if (n.uid === currentUid && currentType === 'note') continue;
    const stripped = n.content ? n.content.replace(/<[^>]+>/g, '').trim() : '';
    const preview = stripped.length > 800 ? stripped.slice(0, 800) + '...' : stripped;
    const content = preview
      ? `  ${n.title} (note)\n    ${preview}`
      : `  ${n.title} (note)`;
    addItem(2, content, preview.length);
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
          .join(' -> ');
      }
    } catch { /* ignore parse errors */ }
    const content = nodeLabels
      ? `  ${f.title} (flowchart) — ${nodeLabels}`
      : `  ${f.title} (flowchart)`;
    addItem(3, content, nodeLabels.length);
  }

  if (items.length === 0) return null;

  items.sort((a, b) => b.relevance - a.relevance || a.priority - b.priority);

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

  return `[Related files in this workspace (${parts.length})] — these share the same project. Cross-reference when relevant: ERDs may be the database backing a flowchart, notes may document a schema.\n${parts.join('\n')}`;
}

const IGNORED_QUERY_WORDS = new Set(['yang', 'dan', 'atau', 'untuk', 'dari', 'dengan', 'the', 'and', 'for', 'from', 'with', 'this', 'that']);

export function siblingRelevanceScore(text: string, query: string): number {
  const haystack = text.toLowerCase();
  const tokens = new Set(query.toLowerCase().split(/[^\p{L}\p{N}_]+/u)
    .filter(token => token.length > 2 && !IGNORED_QUERY_WORDS.has(token)));
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += token.includes('_') ? 3 : 1;
  }
  return score;
}
