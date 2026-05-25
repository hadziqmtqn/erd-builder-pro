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

  // Find start nodes for section grouping
  const startNodes = nodes.filter((n: any) =>
    n.data?.label?.trim().toLowerCase() === 'start'
  );

  // BFS from a start node to collect reachable ids
  function collectGroup(startId: string): Set<string> {
    const visited = new Set<string>();
    const queue = [startId];
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const e of edges) {
        if (e.source === id && !visited.has(e.target)) {
          queue.push(e.target);
        }
      }
    }
    return visited;
  }

  // Build section groups
  const grouped = new Map<string, { startNode: any; nodeIds: Set<string> }>();
  const ungroupedIds = new Set(nodes.map((n: any) => n.id));

  for (const start of startNodes) {
    const section = start.data?.section || '(no title)';
    const groupId = start.data?.groupId;
    const nodeIds = collectGroup(start.id);
    const key = groupId || section;
    if (grouped.has(key)) {
      const existing = grouped.get(key)!;
      for (const id of nodeIds) existing.nodeIds.add(id);
    } else {
      grouped.set(key, { startNode: start, nodeIds });
    }
    for (const id of nodeIds) ungroupedIds.delete(id);
  }

  // Build per-symbol listing grouped by section
  function formatNode(n: any): string {
    const d = n.data || {};
    const shape = d.shape || 'rectangle';
    const meaning = SHAPE_MEANINGS[shape] || shape;

    const outList = (outgoingEdges[n.id] || [])
      .map((e) => `    → ${e.target}${e.label ? ` [${e.label}]` : ''}`).join('\n');
    const inList = (incomingEdges[n.id] || [])
      .map((e) => `    ← ${e.source}${e.label ? ` [${e.label}]` : ''}`).join('\n');

    const connections = [outList, inList].filter(Boolean).join('\n');
    const connStr = connections ? `\n${connections}` : ' (not connected to anything)';
    return `  - "${d.label || 'unnamed'}" (${meaning})${connStr}`;
  }

  const nodeParts: string[] = [];

  if (startNodes.length > 0) {
    // Render per-section groups
    for (const [, { startNode, nodeIds }] of grouped) {
      const groupNodes = nodes.filter((n: any) => nodeIds.has(n.id));
      if (groupNodes.length === 0) continue;
      const section = startNode.data?.section || '(no title)';
      const groupId = startNode.data?.groupId;
      const groupTag = groupId ? ` [id:${groupId}]` : '';
      nodeParts.push(`=== ${section}${groupTag} ===`);
      for (const n of groupNodes) {
        nodeParts.push(formatNode(n));
      }
    }

    // Remaining ungrouped nodes
    if (ungroupedIds.size > 0) {
      const remaining = nodes.filter((n: any) => ungroupedIds.has(n.id));
      if (remaining.length > 0) {
        nodeParts.push('=== Ungrouped ===');
        for (const n of remaining) {
          nodeParts.push(formatNode(n));
        }
      }
    }
  } else {
    // No start nodes — flat list (backward compatible)
    for (const n of nodes) {
      nodeParts.push(formatNode(n));
    }
  }

  const nodeLines = nodeParts.join('\n\n');

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

Symbols detail (grouped by section):
${nodeLines || '  (none)'}

Connections:
${edgeLines || '  (none)'}

Grid layout:
  Each symbol is placed on a grid with these dimensions:
  - Symbol bounding box: 160px wide × 70px tall
  - Vertical distance between consecutive layers (center to center): 160px (gap from bottom of one symbol to top of next is ~90px)
  - Horizontal distance between columns (center to center): 240px
  - Decision (diamond) branches: branches are placed on separate columns (spaced by 1 column, i.e. 240px offset)
  - Symbols at the same layer share the same Y position; the first layer starts at Y=85px
  Edge paths use orthogonal routing (vertical → horizontal → vertical) with arrow markers.

Group-aware instructions:
  - Symbols are grouped under === Section Title [id:grp_xxx] === headers. Each group is a subgraph that starts from a "Start" node with a group title.
  - If the user says "di grup A", "di section B", "di bagian C", or references a specific group by name or id, focus ONLY on the symbols inside that section.
  - The [id:grp_xxx] tag uniquely identifies each group. Use it when you need to reference a group unambiguously.
  - "Ungrouped" symbols are not connected to any Start node — treat them as independent.

Use this as the single source of truth for the current flowchart. When the user asks about the flow, trace through the connections step by step.

---

[Flowchart Editor Format]
This app has a built-in visual flowchart editor. If the user asks you to create or modify a diagram, you can output flowchart data in this JSON format inside a \`\`\`json code block so the editor can load it:

\`\`\`json
{
  "nodes": [
    { "id": "n1", "type": "custom", "data": { "label": "Start", "shape": "oval", "color": "#22c55e" } },
    { "id": "n2", "type": "custom", "data": { "label": "Process", "shape": "rectangle", "color": "#3b82f6" } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "type": "smoothstep" }
  ]
}
\`\`\`

Supported shapes: oval (start/end), rectangle (process), diamond (decision), parallelogram (i/o), database (storage), document (report), cloud (external), circle (connector).
Supported colors: hex colors like #22c55e (green), #3b82f6 (blue), #f59e0b (amber), #ef4444 (red), #8b5cf6 (purple)

If the user wants to see the result in the editor, output in this JSON format so the Append/Replace button appears. Alternatively, ask the user whether they prefer the Flowchart Editor JSON format (for visual editing), Mermaid (for documentation), or plain text explanation.`;
}
