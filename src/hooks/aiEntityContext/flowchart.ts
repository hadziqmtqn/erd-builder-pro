import { supabase } from '@/lib/supabase';
import { EntityContextData } from './types';

export const SHAPE_MEANINGS: Record<string, string> = {
  oval: 'Start/End',
  rectangle: 'Process/Action',
  diamond: 'Decision/Branch',
  parallelogram: 'Input/Output',
  database: 'Database/Storage',
  document: 'Document/Report',
  cloud: 'External System/Service',
  circle: 'Connector/Junction',
};

const SHAPE_HINTS: Record<string, string> = {
  oval: 'entry/exit point of the process',
  rectangle: 'a task or action being performed',
  diamond: 'a yes/no or true/false branch point',
  parallelogram: 'reading input or displaying output',
  database: 'stored data or persistence layer',
  document: 'a printed report or digital document',
  cloud: 'an external API, service, or third-party system',
  circle: 'a goto connector linking to another part of the flow',
};

export async function fetchFlowchart(uid: string) {
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

export function buildFlowchartContext(data: EntityContextData): string | null {
  const nodes = (data.nodes || []).filter((n: any) => n.type === 'custom');
  const edges = data.edges || [];

  // Track connections per node
  const outgoingEdges: Record<string, { target: string; label?: string }[]> = {};
  const incomingEdges: Record<string, { source: string; label?: string }[]> = {};
  const connectedIds = new Set<string>();

  for (const e of edges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
    if (!outgoingEdges[e.source]) outgoingEdges[e.source] = [];
    outgoingEdges[e.source].push({
      target: nodes.find((n: any) => n.id === e.target)?.data?.label || e.target,
      label: e.label,
    });
    if (!incomingEdges[e.target]) incomingEdges[e.target] = [];
    incomingEdges[e.target].push({
      source: nodes.find((n: any) => n.id === e.source)?.data?.label || e.source,
      label: e.label,
    });
  }

  // Build detailed per-symbol listing with connections inline
  const nodeLines = nodes.map((n: any) => {
    const d = n.data || {};
    const shape = d.shape || 'rectangle';
    const meaning = SHAPE_MEANINGS[shape] || shape;
    const hint = SHAPE_HINTS[shape] || '';

    const outList = (outgoingEdges[n.id] || [])
      .map((e) => `    → ${e.target}${e.label ? ` [${e.label}]` : ''}`).join('\n');
    const inList = (incomingEdges[n.id] || [])
      .map((e) => `    ← ${e.source}${e.label ? ` [${e.label}]` : ''}`).join('\n');

    const connections = [outList, inList].filter(Boolean).join('\n');
    const connStr = connections ? `\n${connections}` : ' (not connected to anything)';

    return `  - "${d.label || 'unnamed'}" (${meaning})${connStr}`;
  }).join('\n\n');

  // Edge detail lines for additional reference
  const edgeLines = edges.map((e: any) => {
    const sNode = nodes.find((n: any) => n.id === e.source);
    const tNode = nodes.find((n: any) => n.id === e.target);
    const sLabel = sNode?.data?.label || e.source;
    const tLabel = tNode?.data?.label || e.target;
    const parts = [`  ${sLabel} → ${tLabel}`];
    if (e.label) parts.push(`label: "${e.label}"`);
    if (e.style?.strokeDasharray) parts.push('(dashed)');
    if (e.markerStart && e.markerEnd) parts.push('(bidirectional)');
    else if (e.markerStart && !e.markerEnd) parts.push('(reverse arrow)');
    return parts.join(' ');
  }).join('\n');

  // Orphan (unconnected) detection
  const orphanNodes = nodes.filter((n) => !connectedIds.has(n.id));
  const orphanSummary = orphanNodes.length > 0
    ? `\n⚠ ${orphanNodes.length} unconnected symbol(s): ${orphanNodes.map((n) => `"${n.data?.label || 'unnamed'}"`).join(', ')}`
    : '';

  // Group nodes by shape for structural overview
  const shapeCounts: Record<string, number> = {};
  for (const n of nodes) {
    const s = n.data?.shape || 'rectangle';
    shapeCounts[s] = (shapeCounts[s] || 0) + 1;
  }
  const shapeBreakdown = Object.entries(shapeCounts)
    .map(([shape, count]) => `  ${count}x ${SHAPE_MEANINGS[shape] || shape}`)
    .join('\n');

  return `[Flowchart context]
Title: "${data.title || '(untitled)'}"
Symbols: ${nodes.length} | Connections: ${edges.length}
${orphanSummary}

Shape breakdown:
${shapeBreakdown || '  (none)'}

Flowchart notation reference:
${Object.entries(SHAPE_MEANINGS).map(([s, m]) => `  ${s} = ${m} (${SHAPE_HINTS[s]})`).join('\n')}

Symbols detail:
${nodeLines || '  (none)'}

Connections:
${edgeLines || '  (none)'}

Use this as the single source of truth for the current flowchart. When the user asks about the flow, trace through the connections step by step. When suggesting changes, respect each symbol's shape meaning.`;
}
