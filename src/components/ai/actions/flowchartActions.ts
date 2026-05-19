import { Node, Edge, MarkerType } from '@xyflow/react';
import { FlowchartNodeData } from '../../FlowchartNode';

export interface FlowchartApplyResult {
  nodes: Node<FlowchartNodeData>[];
  edges: Edge[];
}

function extractJSONFromMarkdown(text: string): string {
  const jsonBlockRegex = /```(?:json)?\n?([\s\S]*?)```/g;
  const blocks: string[] = [];
  let match;
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    const content = match[1].trim();
    if (content.length > 0) blocks.push(content);
  }
  if (blocks.length > 0) return blocks.join('\n');
  return text.trim();
}

/**
 * Applies AI response to flowchart.
 * 
 * Expected JSON format:
 * {
 *   "nodes": [ { "label": "Start", "shape": "oval", "color": "#..." }, ... ],
 *   "edges": [ { "sourceLabel": "Start", "targetLabel": "Process", "label": "Yes" }, ... ]
 * }
 */
export function applyToFlowchartContent(
  currentNodes: Node<FlowchartNodeData>[],
  currentEdges: Edge[],
  aiResponse: string
): FlowchartApplyResult | null {
  const jsonStr = extractJSONFromMarkdown(aiResponse);
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!objMatch) return null;
    try { parsed = JSON.parse(objMatch[0]); } catch { return null; }
  }

  if (!parsed || !Array.isArray(parsed.nodes)) return null;

  const newNodes: Node<FlowchartNodeData>[] = [];
  const newEdges: Edge[] = [];

  // Map to track label -> node ID for edge creation
  const labelToId = new Map<string, string>();
  const idToNode = new Map<string | number, string>();
  
  // 1. Process Nodes (with placeholder positions)
  parsed.nodes.forEach((nodeData: any, index: number) => {
    const id = `ai_node_${Date.now()}_${index}`;
    labelToId.set(nodeData.label.toLowerCase(), id);
    if (nodeData.id != null) idToNode.set(nodeData.id, id);

    newNodes.push({
      id,
      type: 'custom',
      position: { x: 0, y: 0 },
      data: {
        label: nodeData.label || 'New Step',
        shape: nodeData.shape || 'rectangle',
        color: nodeData.color || '#8b5cf6',
      },
    });
  });

  // 2. Build directed graph for layout calculation
  const outgoing: Record<string, string[]> = {};
  const incomingCount: Record<string, number> = {};

  for (const n of newNodes) {
    outgoing[n.id] = [];
    incomingCount[n.id] = 0;
  }

  function resolveEdgeIds(edgeData: any): [string | undefined, string | undefined] {
    if (edgeData.sourceLabel || edgeData.targetLabel) {
      return [labelToId.get(edgeData.sourceLabel?.toLowerCase()), labelToId.get(edgeData.targetLabel?.toLowerCase())];
    }
    const srcKey = edgeData.source ?? edgeData.from;
    const tgtKey = edgeData.target ?? edgeData.to;
    if (srcKey != null && tgtKey != null) {
      const fromId = idToNode.get(srcKey) || labelToId.get(String(srcKey).toLowerCase());
      const toId = idToNode.get(tgtKey) || labelToId.get(String(tgtKey).toLowerCase());
      if (fromId && toId) return [fromId, toId];
    }
    return [undefined, undefined];
  }

  for (const edgeData of (parsed.edges || [])) {
    const [srcId, tgtId] = resolveEdgeIds(edgeData);
    if (srcId && tgtId) {
      outgoing[srcId].push(tgtId);
      incomingCount[tgtId] = (incomingCount[tgtId] || 0) + 1;
    }
  }

  // 3. Hierarchical layout using longest-path layering (Sugiyama-style)
  const VERTICAL_SPACING = 160;
  const HORIZONTAL_SPACING = 280;
  const START_X = 60;
  const START_Y = 40;

  // Find start nodes: no incoming edges or oval-shaped
  const layers: Record<string, number> = {};
  const queue: string[] = [];

  for (const n of newNodes) {
    if (incomingCount[n.id] === 0 || n.data.shape === 'oval') {
      layers[n.id] = 0;
      queue.push(n.id);
    }
  }

  // Fallback: if no start found, use first node
  if (queue.length === 0 && newNodes.length > 0) {
    layers[newNodes[0].id] = 0;
    queue.push(newNodes[0].id);
  }

  // BFS longest-path layering
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLayer = layers[current] ?? 0;
    for (const next of outgoing[current] || []) {
      const candidate = currentLayer + 1;
      if ((layers[next] ?? -1) < candidate) {
        layers[next] = candidate;
        queue.push(next);
      }
    }
  }

  // Assign unlayered nodes to layer 0
  for (const n of newNodes) {
    if (layers[n.id] === undefined) layers[n.id] = 0;
  }

  // Group by layer and calculate positions (centered per layer)
  const layerGroups: Record<number, string[]> = {};
  for (const [id, layer] of Object.entries(layers)) {
    if (!layerGroups[layer]) layerGroups[layer] = [];
    layerGroups[layer].push(id);
  }

  const sortedLayers = Object.keys(layerGroups).map(Number).sort((a, b) => a - b);
  const maxLayerCount = Math.max(...sortedLayers.map(l => layerGroups[l].length));

  const positions: Record<string, { x: number; y: number }> = {};
  for (const layer of sortedLayers) {
    const ids = layerGroups[layer];
    const layerWidth = (ids.length - 1) * HORIZONTAL_SPACING;
    const maxWidth = (maxLayerCount - 1) * HORIZONTAL_SPACING;
    const layerStartX = START_X + (maxWidth - layerWidth) / 2;

    ids.forEach((id, idx) => {
      positions[id] = {
        x: layerStartX + idx * HORIZONTAL_SPACING,
        y: START_Y + layer * VERTICAL_SPACING,
      };
    });
  }

  // Apply positions with offset below existing nodes
  const maxY = currentNodes.reduce((max, n) => Math.max(max, n.position.y + 160), 50);
  for (const n of newNodes) {
    const pos = positions[n.id];
    if (pos) {
      n.position = { x: pos.x + 50, y: pos.y + maxY };
    }
  }

  // 4. Process Edges
  if (Array.isArray(parsed.edges)) {
    parsed.edges.forEach((edgeData: any, index: number) => {
      let sourceId: string | undefined;
      let targetId: string | undefined;

      if (edgeData.sourceLabel || edgeData.targetLabel) {
        sourceId = labelToId.get(edgeData.sourceLabel?.toLowerCase());
        targetId = labelToId.get(edgeData.targetLabel?.toLowerCase());
      }

      if (!sourceId || !targetId) {
        const srcKey = edgeData.source ?? edgeData.from;
        const tgtKey = edgeData.target ?? edgeData.to;
        if (srcKey != null && tgtKey != null) {
          sourceId = idToNode.get(srcKey);
          targetId = idToNode.get(tgtKey);
        }
      }

      if (!sourceId || !targetId) {
        const srcKey = (edgeData.source ?? edgeData.from ?? '');
        const tgtKey = (edgeData.target ?? edgeData.to ?? '');
        if (srcKey && tgtKey) {
          sourceId = labelToId.get(String(srcKey).toLowerCase());
          targetId = labelToId.get(String(tgtKey).toLowerCase());
        }
      }

      if (sourceId && targetId) {
        newEdges.push({
          id: `ai_edge_${Date.now()}_${index}`,
          source: sourceId,
          target: targetId,
          label: edgeData.label,
          type: 'smoothstep',
          style: { stroke: '#b1b1b7' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' },
          labelBgStyle: { fill: '#1e1e24' },
          labelStyle: { fill: '#fff' },
        });
      }
    });
  }

  return {
    nodes: [...currentNodes, ...newNodes],
    edges: [...currentEdges, ...newEdges],
  };
}
