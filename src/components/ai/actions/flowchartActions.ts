import { Node, Edge, MarkerType } from '@xyflow/react';
import { FlowchartNodeData } from '../../FlowchartNode';

const MAX_AI_NODES = 60;
const MAX_AI_TEXT_BYTES = 512_000;
const MAX_AI_EDGES = 120;

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

function parseJSON(text: string): any {
  if (text.length > MAX_AI_TEXT_BYTES) return null;
  const jsonStr = extractJSONFromMarkdown(text);
  try {
    return JSON.parse(jsonStr);
  } catch {
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!objMatch) return null;
    try { return JSON.parse(objMatch[0]); } catch { return null; }
  }
}

function parseNodesAndEdges(aiResponse: string): { parsed: any; labelToIds: Map<string, string[]>; idToNode: Map<string | number, string>; newNodes: Node<FlowchartNodeData>[] } | null {
  const parsed = parseJSON(aiResponse);
  if (!parsed || !Array.isArray(parsed.nodes)) return null;
  if (parsed.nodes.length > MAX_AI_NODES) return null;
  if (Array.isArray(parsed.edges) && parsed.edges.length > MAX_AI_EDGES) return null;

  const labelToIds = new Map<string, string[]>();
  const idToNode = new Map<string | number, string>();
  const newNodes: Node<FlowchartNodeData>[] = [];

  parsed.nodes.forEach((nodeData: any, index: number) => {
    const id = `ai_node_${Date.now()}_${index}`;
    const lower = nodeData.label?.toLowerCase();
    if (lower) {
      const existing = labelToIds.get(lower) || [];
      existing.push(id);
      labelToIds.set(lower, existing);
    }
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

  return { parsed, labelToIds, idToNode, newNodes };
}

// ─── Smart decision branch layout ────────────────────────────
function collectDescendants(id: string, outgoing: Record<string, string[]>, exclude: Set<string>): Set<string> {
  const result = new Set<string>();
  const q = [id];
  while (q.length > 0) {
    const cur = q.shift()!;
    for (const next of outgoing[cur] || []) {
      if (!result.has(next) && !exclude.has(next)) {
        result.add(next);
        q.push(next);
      }
    }
  }
  return result;
}

function buildFlowchartLayout(
  newNodes: Node<FlowchartNodeData>[],
  parsed: any,
  labelToIds: Map<string, string[]>,
  idToNode: Map<string | number, string>,
): { positionedNodes: Node<FlowchartNodeData>[]; newEdges: Edge[] } {
  const newEdges: Edge[] = [];

  // Build graph for layout
  const outgoing: Record<string, string[]> = {};
  const incomingCount: Record<string, number> = {};

  for (const n of newNodes) {
    outgoing[n.id] = [];
    incomingCount[n.id] = 0;
  }

  function resolveEdgeIds(edgeData: any): [string | undefined, string | undefined] {
    function resolveByLabel(label: string | undefined): string | undefined {
      if (!label) return undefined;
      const ids = labelToIds.get(label.toLowerCase());
      if (ids?.length === 1) return ids[0];
      if (ids?.length && ids.length > 1) return ids[0];
      return undefined;
    }

    function resolveNode(key: 'source' | 'target'): string | undefined {
      const idxKey = key === 'source' ? 'sourceIndex' : 'targetIndex';
      const labelKey = key === 'source' ? 'sourceLabel' : 'targetLabel';

      if (edgeData[idxKey] != null) {
        const idx = Number(edgeData[idxKey]) - 1;
        if (idx >= 0 && idx < newNodes.length) return newNodes[idx].id;
      }

      const label = edgeData[labelKey];
      if (label) {
        const id = resolveByLabel(label);
        if (id) return id;
      }

      const legacyKey = key === 'source' ? (edgeData.source ?? edgeData.from) : (edgeData.target ?? edgeData.to);
      if (legacyKey != null) {
        return idToNode.get(legacyKey) || resolveByLabel(String(legacyKey));
      }

      return undefined;
    }

    return [resolveNode('source'), resolveNode('target')];
  }

  const allEdgeLabels: Record<string, Record<string, string>> = {};
  for (const edgeData of (parsed.edges || [])) {
    const [srcId, tgtId] = resolveEdgeIds(edgeData);
    if (srcId && tgtId) {
      outgoing[srcId].push(tgtId);
      incomingCount[tgtId] = (incomingCount[tgtId] || 0) + 1;
      if (!allEdgeLabels[srcId]) allEdgeLabels[srcId] = {};
      allEdgeLabels[srcId][tgtId] = edgeData.label || '';
    }
  }

  // ── Layer assignment (Sugiyama) ──
  const VERTICAL_SPACING = 160;
  const HORIZONTAL_SPACING = 280;
  const START_X = 60;
  const START_Y = 40;

  const layers: Record<string, number> = {};
  const queue: string[] = [];

  for (const n of newNodes) {
    if (incomingCount[n.id] === 0 || n.data.shape === 'oval') {
      layers[n.id] = 0;
      queue.push(n.id);
    }
  }

  if (queue.length === 0 && newNodes.length > 0) {
    layers[newNodes[0].id] = 0;
    queue.push(newNodes[0].id);
  }

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

  for (const n of newNodes) {
    if (layers[n.id] === undefined) layers[n.id] = 0;
  }

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

  // ── Smart decision branch layout ──
  // For diamond nodes, spread Yes/No branches left/right
  const BRANCH_OFFSET = 180;
  const shiftedNodes = new Set<string>();

  for (const n of newNodes) {
    if (n.data.shape !== 'diamond') continue;
    const diamondId = n.id;
    const children = outgoing[diamondId] || [];

    if (children.length < 2) continue;

    // Find which child is Yes and which is No
    let yesChild: string | null = null;
    let noChild: string | null = null;

    for (const childId of children) {
      const label = allEdgeLabels[diamondId]?.[childId] || '';
      if (label.toLowerCase() === 'yes') yesChild = childId;
      else if (label.toLowerCase() === 'no') noChild = childId;
    }

    // Fallback: first child = Yes, second = No
    if (!yesChild && !noChild && children.length >= 2) {
      yesChild = children[0];
      noChild = children[1];
    } else if (children.length >= 1) {
      if (!yesChild) yesChild = children[0];
      if (!noChild && children.length > 1) noChild = children[1];
    }

    // Collect descendants, excluding the other branch
    const noDescendants = noChild ? collectDescendants(noChild, outgoing, yesChild ? new Set([yesChild]) : new Set()) : new Set<string>();
    const yesDescendants = yesChild ? collectDescendants(yesChild, outgoing, noChild ? new Set([noChild]) : new Set()) : new Set<string>();

    // Apply Yes offset (right)
    for (const descId of yesDescendants) {
      if (!shiftedNodes.has(descId)) {
        positions[descId] = {
          x: (positions[descId]?.x || 0) + BRANCH_OFFSET,
          y: positions[descId]?.y || 0,
        };
        shiftedNodes.add(descId);
      }
    }

    // Apply No offset (left)
    for (const descId of noDescendants) {
      if (!shiftedNodes.has(descId)) {
        positions[descId] = {
          x: (positions[descId]?.x || 0) - BRANCH_OFFSET,
          y: positions[descId]?.y || 0,
        };
        shiftedNodes.add(descId);
      }
    }

    // Also shift the immediate children
    if (yesChild && !shiftedNodes.has(yesChild)) {
      positions[yesChild] = {
        x: (positions[yesChild]?.x || 0) + BRANCH_OFFSET,
        y: positions[yesChild]?.y || 0,
      };
      shiftedNodes.add(yesChild);
    }
    if (noChild && !shiftedNodes.has(noChild)) {
      positions[noChild] = {
        x: (positions[noChild]?.x || 0) - BRANCH_OFFSET,
        y: positions[noChild]?.y || 0,
      };
      shiftedNodes.add(noChild);
    }
  }

  const positionedNodes = newNodes.map(n => {
    const pos = positions[n.id];
    return pos ? { ...n, position: { ...pos } } : n;
  });

  // Build node position lookup map for O(1) access
  const nodePosMap = new Map<string, { x: number; y: number }>();
  for (const n of positionedNodes) {
    nodePosMap.set(n.id, n.position);
  }

  // Pick closest handle pair for smart connection
  function pickClosestHandles(sourceId: string, targetId: string): { sourceHandle: string; targetHandle: string } {
    const NODE_W = 160;
    const NODE_H = 60;
    const srcPos = nodePosMap.get(sourceId);
    const tgtPos = nodePosMap.get(targetId);
    if (!srcPos || !tgtPos) return { sourceHandle: 'bottom', targetHandle: 'top' };

    const sx = srcPos.x;
    const sy = srcPos.y;
    const tx = tgtPos.x;
    const ty = tgtPos.y;

    const handlePositions = {
      top:    (x: number, y: number) => ({ x: x + NODE_W / 2, y }),
      bottom: (x: number, y: number) => ({ x: x + NODE_W / 2, y: y + NODE_H }),
      left:   (x: number, y: number) => ({ x, y: y + NODE_H / 2 }),
      right:  (x: number, y: number) => ({ x: x + NODE_W, y: y + NODE_H / 2 }),
    } as const;

    const handles = ['top', 'bottom', 'left', 'right'] as const;

    let bestDist = Infinity;
    let bestSrc: string = 'bottom';
    let bestTgt: string = 'top';

    for (const sh of handles) {
      const sp = handlePositions[sh](sx, sy);
      for (const th of handles) {
        const tp = handlePositions[th](tx, ty);
        const dx = sp.x - tp.x;
        const dy = sp.y - tp.y;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestSrc = sh;
          bestTgt = th;
        }
      }
    }

    return { sourceHandle: bestSrc, targetHandle: bestTgt };
  }

  // Process edges
  if (Array.isArray(parsed.edges)) {
    parsed.edges.forEach((edgeData: any, index: number) => {
      const [sourceId, targetId] = resolveEdgeIds(edgeData);

      if (sourceId && targetId) {
        const { sourceHandle, targetHandle } = pickClosestHandles(sourceId, targetId);
        newEdges.push({
          id: `ai_edge_${Date.now()}_${index}`,
          source: sourceId,
          target: targetId,
          sourceHandle,
          targetHandle,
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

  return { positionedNodes, newEdges };
}

export function applyToFlowchartContent(
  currentNodes: Node<FlowchartNodeData>[],
  currentEdges: Edge[],
  aiResponse: string
): FlowchartApplyResult | null {
  const result = parseNodesAndEdges(aiResponse);
  if (!result) return null;

  const { parsed, labelToIds, idToNode, newNodes } = result;
  const { positionedNodes, newEdges } = buildFlowchartLayout(newNodes, parsed, labelToIds, idToNode);

  // Offset new nodes below existing ones
  const maxY = currentNodes.reduce((max, n) => Math.max(max, n.position.y + 160), 50);
  const offsetNodes = positionedNodes.map(n => ({
    ...n,
    position: { x: n.position.x + 50, y: n.position.y + maxY },
  }));

  return {
    nodes: [...currentNodes, ...offsetNodes],
    edges: [...currentEdges, ...newEdges],
  };
}

export function previewFlowchartContent(aiResponse: string): FlowchartApplyResult | null {
  const result = parseNodesAndEdges(aiResponse);
  if (!result) return null;

  const { parsed, labelToIds, idToNode, newNodes } = result;
  const { positionedNodes, newEdges } = buildFlowchartLayout(newNodes, parsed, labelToIds, idToNode);

  return { nodes: positionedNodes, edges: newEdges };
}

// ─── Insert a symbol between two existing nodes ──────────────
export function applyInsertBetween(
  currentNodes: Node<FlowchartNodeData>[],
  currentEdges: Edge[],
  aiResponse: string,
): FlowchartApplyResult | null {
  const parsed = parseJSON(aiResponse);
  if (!parsed) return null;

  const sourceLabel = parsed.sourceLabel || parsed.insertAfter || parsed.source;
  const targetLabel = parsed.targetLabel || parsed.target;
  const newNodeData = parsed.newNode;

  if (!newNodeData) return null;

  // Resolve source: prefer groupId, then index (1-based), then label (case-insensitive)
  let sourceNode: Node<FlowchartNodeData> | undefined;
  if (parsed.sourceGroupId) {
    sourceNode = currentNodes.find(
      n => n.data.groupId === parsed.sourceGroupId
    );
  }
  if (!sourceNode && parsed.sourceIndex != null) {
    const idx = Number(parsed.sourceIndex) - 1;
    sourceNode = currentNodes[idx];
  }
  if (!sourceNode && sourceLabel) {
    sourceNode = currentNodes.find(
      n => n.data.label.toLowerCase() === sourceLabel.toLowerCase()
    );
  }

  // Resolve target: prefer groupId, then index, then label
  let targetNode: Node<FlowchartNodeData> | undefined;
  if (parsed.targetGroupId) {
    targetNode = currentNodes.find(
      n => n.data.groupId === parsed.targetGroupId
    );
  }
  if (!targetNode && parsed.targetIndex != null) {
    const idx = Number(parsed.targetIndex) - 1;
    targetNode = currentNodes[idx];
  }
  if (!targetNode && targetLabel) {
    targetNode = currentNodes.find(
      n => n.data.label.toLowerCase() === targetLabel.toLowerCase()
    );
  }

  if (!sourceNode || !targetNode) return null;

  // Create new node at midpoint with slight downward offset
  const newId = `inserted_${Date.now()}`;
  const newNode: Node<FlowchartNodeData> = {
    id: newId,
    type: 'custom',
    position: {
      x: (sourceNode.position.x + targetNode.position.x) / 2,
      y: (sourceNode.position.y + targetNode.position.y) / 2 + 30,
    },
    data: {
      label: newNodeData.label || 'New Step',
      shape: newNodeData.shape || 'rectangle',
      color: newNodeData.color || '#8b5cf6',
    },
  };

  // Find the edge between source and target
  const edgeToRemove = currentEdges.find(
    e => e.source === sourceNode.id && e.target === targetNode.id
  );

  const updatedEdges = edgeToRemove
    ? currentEdges.filter(e => e.id !== edgeToRemove.id)
    : [...currentEdges];

  // Add new edges: source → newNode → target
  const newEdge1: Edge = {
    id: `inserted_edge_1_${Date.now()}`,
    source: sourceNode.id,
    target: newId,
    sourceHandle: 'bottom',
    targetHandle: 'top',
    type: 'smoothstep',
    style: { stroke: '#b1b1b7' },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' },
    label: parsed.insertEdgeLabel1 || undefined,
  };

  const newEdge2: Edge = {
    id: `inserted_edge_2_${Date.now()}`,
    source: newId,
    target: targetNode.id,
    sourceHandle: 'bottom',
    targetHandle: 'top',
    type: 'smoothstep',
    style: { stroke: '#b1b1b7' },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' },
    label: parsed.insertEdgeLabel2 || undefined,
  };

  return {
    nodes: [...currentNodes, newNode],
    edges: [...updatedEdges, newEdge1, newEdge2],
  };
}

// ─── Replace all nodes/edges with AI-generated content ───────
export function applyReplaceAll(
  aiResponse: string,
): FlowchartApplyResult | null {
  return previewFlowchartContent(aiResponse);
}
