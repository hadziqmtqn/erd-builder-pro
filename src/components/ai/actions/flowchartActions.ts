import { Node, Edge, MarkerType } from '@xyflow/react';
import { FlowchartNodeData } from '../../FlowchartNode';

const MAX_AI_NODES = 60;
const MAX_AI_TEXT_BYTES = 512_000;
const MAX_AI_EDGES = 120;

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

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

function parseNodesAndEdges(aiResponse: string): { parsed: any; labelToIds: Map<string, string[]>; idToNode: Map<string | number, string>; newNodes: Node<FlowchartNodeData>[]; idSeed: string } | null {
  const parsed = parseJSON(aiResponse);
  if (!parsed || !Array.isArray(parsed.nodes)) return null;
  if (parsed.nodes.length > MAX_AI_NODES) return null;
  if (Array.isArray(parsed.edges) && parsed.edges.length > MAX_AI_EDGES) return null;

  const labelToIds = new Map<string, string[]>();
  const idToNode = new Map<string | number, string>();
  const newNodes: Node<FlowchartNodeData>[] = [];

  const idSeed = String(Math.abs(hashStr(JSON.stringify(parsed))));
  parsed.nodes.forEach((nodeData: any, index: number) => {
    const id = `ai_node_${idSeed}_${index}`;
    const data = nodeData.data || nodeData;
    const label = data.label || '';
    const lower = label.toLowerCase();
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
        label: data.label || 'New Step',
        shape: data.shape || 'rectangle',
        color: data.color || '#8b5cf6',
      },
    });
  });

  return { parsed, labelToIds, idToNode, newNodes, idSeed };
}

// ─── Smart decision branch layout ────────────────────────────
function collectDescendants(id: string, outgoing: Record<string, string[]>, exclude: Set<string>, maxIter = 200): Set<string> {
  const result = new Set<string>();
  const q = [id];
  let idx = 0;
  while (idx < q.length && idx < maxIter) {
    const cur = q[idx++];
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
  idSeed: string,
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
  // Fast-path: if AI provides all positions, skip layout entirely
  const hasPositions = parsed.nodes.every((nd: any) =>
    nd.position && typeof nd.position.x === 'number' && typeof nd.position.y === 'number'
  );

  const VERTICAL_SPACING = 160;
  const HORIZONTAL_SPACING = 280;
  const START_X = 60;
  const START_Y = 40;

  const positions: Record<string, { x: number; y: number }> = {};

  if (hasPositions) {
    // Use AI-provided positions directly
    parsed.nodes.forEach((nd: any, idx: number) => {
      const nodeId = newNodes[idx]?.id;
      if (nodeId && nd.position) {
        positions[nodeId] = { x: nd.position.x, y: nd.position.y };
      }
    });
  } else {
    // Sugiyama layer assignment — capped at nodes.length * 3 to prevent infinite loop on cycles
    const layers: Record<string, number> = {};
    const q: string[] = [];

    for (const n of newNodes) {
      if (incomingCount[n.id] === 0 || n.data.shape === 'oval') {
        layers[n.id] = 0;
        q.push(n.id);
      }
    }

    if (q.length === 0 && newNodes.length > 0) {
      layers[newNodes[0].id] = 0;
      q.push(newNodes[0].id);
    }

    const maxBFSIter = newNodes.length * 3;
    let qi = 0;
    let bfsIter = 0;
    while (qi < q.length && bfsIter < maxBFSIter) {
      bfsIter++;
      const current = q[qi++];
      const currentLayer = layers[current] ?? 0;
      for (const next of outgoing[current] || []) {
        const candidate = currentLayer + 1;
        if ((layers[next] ?? -1) < candidate) {
          layers[next] = candidate;
          q.push(next);
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
  }

  // ── Smart decision branch layout ──
  // For diamond nodes, spread Yes/No branches left/right
  const BRANCH_OFFSET = 180;
  const shiftedNodes = new Set<string>();

  function shiftPos(id: string, dx: number) {
    if (shiftedNodes.has(id)) return;
    positions[id] = {
      x: (positions[id]?.x || 0) + dx,
      y: positions[id]?.y || 0,
    };
    shiftedNodes.add(id);
  }

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

    // Skip BFS if both children already shifted
    if (yesChild && noChild && shiftedNodes.has(yesChild) && shiftedNodes.has(noChild)) continue;

    // Collect descendants, excluding the other branch
    const noDescendants = noChild
      ? collectDescendants(noChild, outgoing, yesChild ? new Set([yesChild]) : new Set())
      : new Set<string>();
    const yesDescendants = yesChild
      ? collectDescendants(yesChild, outgoing, noChild ? new Set([noChild]) : new Set())
      : new Set<string>();

    // Apply Yes offset (right)
    for (const descId of yesDescendants) shiftPos(descId, BRANCH_OFFSET);

    // Apply No offset (left)
    for (const descId of noDescendants) shiftPos(descId, -BRANCH_OFFSET);

    // Also shift the immediate children
    if (yesChild) shiftPos(yesChild, BRANCH_OFFSET);
    if (noChild) shiftPos(noChild, -BRANCH_OFFSET);
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

  // Precompute all handle positions for O(1) lookup
  const ALL_HANDLES = ['top', 'bottom', 'left', 'right'] as const;
  const srcHandleCache = new Map<string, Array<{ x: number; y: number }>>();
  const tgtHandleCache = new Map<string, Array<{ x: number; y: number }>>();

  function computeHandles(pos: { x: number; y: number }): Array<{ x: number; y: number }> {
    const NODE_W = 160;
    const NODE_H = 60;
    return [
      { x: pos.x + NODE_W / 2, y: pos.y },                          // top
      { x: pos.x + NODE_W / 2, y: pos.y + NODE_H },                 // bottom
      { x: pos.x, y: pos.y + NODE_H / 2 },                          // left
      { x: pos.x + NODE_W, y: pos.y + NODE_H / 2 },                 // right
    ];
  }

  function getHandlePoints(id: string, cache: Map<string, Array<{ x: number; y: number }>>): Array<{ x: number; y: number }> {
    let pts = cache.get(id);
    if (!pts) {
      const pos = nodePosMap.get(id);
      pts = pos ? computeHandles(pos) : [];
      cache.set(id, pts);
    }
    return pts;
  }

  function pickClosestHandles(sourceId: string, targetId: string): { sourceHandle: string; targetHandle: string } {
    const srcPts = getHandlePoints(sourceId, srcHandleCache);
    const tgtPts = getHandlePoints(targetId, tgtHandleCache);
    if (srcPts.length === 0 || tgtPts.length === 0) return { sourceHandle: 'bottom', targetHandle: 'top' };

    let bestDist = Infinity;
    let bestSrc = 0;
    let bestTgt = 0;

    for (let si = 0; si < 4; si++) {
      const sp = srcPts[si];
      for (let ti = 0; ti < 4; ti++) {
        const tp = tgtPts[ti];
        const dx = sp.x - tp.x;
        const dy = sp.y - tp.y;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestSrc = si;
          bestTgt = ti;
        }
      }
    }

    return { sourceHandle: ALL_HANDLES[bestSrc], targetHandle: ALL_HANDLES[bestTgt] };
  }

  // Process edges
  if (Array.isArray(parsed.edges)) {
    parsed.edges.forEach((edgeData: any, index: number) => {
      const [sourceId, targetId] = resolveEdgeIds(edgeData);

      if (sourceId && targetId) {
        const { sourceHandle, targetHandle } = pickClosestHandles(sourceId, targetId);
        newEdges.push({
          id: `ai_edge_${idSeed}_${index}`,
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
  const result = getCachedOrParse(aiResponse);
  if (!result) return null;

  const { parsed, labelToIds, idToNode, newNodes, idSeed } = result;
  const { positionedNodes, newEdges } = buildFlowchartLayout(newNodes, parsed, labelToIds, idToNode, idSeed);

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

// Cache parsed result between preview and confirm to avoid double parsing
let cachedParse: { aiResponse: string; result: NonNullable<ReturnType<typeof parseNodesAndEdges>> } | null = null;

function getCachedOrParse(aiResponse: string): ReturnType<typeof parseNodesAndEdges> {
  if (cachedParse?.aiResponse === aiResponse) {
    return cachedParse.result;
  }
  const result = parseNodesAndEdges(aiResponse);
  if (result) cachedParse = { aiResponse, result };
  return result;
}

/** Clears the cached parse result (call after confirm to free memory) */
export function clearParseCache() {
  cachedParse = null;
}

export function previewFlowchartContent(aiResponse: string): FlowchartApplyResult | null {
  const result = getCachedOrParse(aiResponse);
  if (!result) return null;

  const { parsed, labelToIds, idToNode, newNodes, idSeed } = result;
  const { positionedNodes, newEdges } = buildFlowchartLayout(newNodes, parsed, labelToIds, idToNode, idSeed);

  return { nodes: positionedNodes, edges: newEdges };
}

// Re-export for use in FlowchartView confirm (reuses cached parse)
export function parseFlowchartContent(aiResponse: string): ReturnType<typeof parseNodesAndEdges> {
  return getCachedOrParse(aiResponse);
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
  const insertSeed = String(Math.abs(hashStr(aiResponse)));
  const newId = `inserted_${insertSeed}`;
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
    id: `inserted_edge_1_${insertSeed}`,
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
    id: `inserted_edge_2_${insertSeed}`,
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


