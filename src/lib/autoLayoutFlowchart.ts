import { Edge, MarkerType, Node } from '@xyflow/react';
import { FlowchartNodeData } from '@/components/FlowchartNode';

const START_X = 80;
const START_Y = 80;
const MIN_COLUMN_SPACING = 240;
const MIN_ROW_SPACING = 150;
const COLUMN_PADDING = 64;
const ROW_PADDING = 72;

type Side = -1 | 0 | 1;

export interface FlowchartLayoutResult {
  nodes: Node<FlowchartNodeData>[];
  edges: Edge[];
}

function normalizeLabel(label: string | undefined): string {
  return (label || '').trim().toLowerCase();
}

function isStartLike(node: Node<FlowchartNodeData>): boolean {
  const label = normalizeLabel(node.data.label);
  return label.includes('start') || label.includes('begin');
}

function isEndLike(node: Node<FlowchartNodeData>): boolean {
  const label = normalizeLabel(node.data.label);
  return label.includes('end') || label.includes('finish') || label.includes('done') || label.includes('stop');
}

function isErrorLike(node: Node<FlowchartNodeData>): boolean {
  return /error|gagal|tolak|reject|fail|invalid|hentikan|stop/i.test(node.data.label || '');
}

function isDecision(node: Node<FlowchartNodeData>): boolean {
  return node.data.shape === 'diamond';
}

function shapeFootprint(node: Node<FlowchartNodeData>): { width: number; height: number } {
  const labelLen = (node.data.label || '').trim().length;
  const shape = node.data.shape;

  const base = (() => {
    switch (shape) {
      case 'diamond':
        return { width: 130, height: 130, wrap: 12 };
      case 'circle':
        return { width: 110, height: 110, wrap: 10 };
      case 'cloud':
        return { width: 170, height: 96, wrap: 16 };
      case 'database':
        return { width: 150, height: 104, wrap: 16 };
      case 'parallelogram':
        return { width: 170, height: 86, wrap: 16 };
      case 'document':
        return { width: 150, height: 96, wrap: 16 };
      case 'oval':
        return { width: 150, height: 84, wrap: 15 };
      case 'rectangle':
      default:
        return { width: 150, height: 84, wrap: 16 };
    }
  })();

  const extraLines = Math.max(0, Math.ceil(labelLen / base.wrap) - 1);
  const extraHeight = extraLines * 18;
  const extraWidth = shape === 'diamond'
    ? Math.min(48, Math.max(0, labelLen - base.wrap) * 3)
    : Math.min(64, Math.max(0, labelLen - base.wrap * 1.5) * 2.5);

  return {
    width: base.width + extraWidth,
    height: base.height + extraHeight,
  };
}

function sortChildren(
  parent: Node<FlowchartNodeData>,
  children: string[],
  edgeLabelLookup: Map<string, string>,
  nodeMap: Map<string, Node<FlowchartNodeData>>,
): string[] {
  const ordered = [...children];

  if (isDecision(parent)) {
    ordered.sort((a, b) => {
      const labelA = normalizeLabel(edgeLabelLookup.get(`${parent.id}->${a}`));
      const labelB = normalizeLabel(edgeLabelLookup.get(`${parent.id}->${b}`));
      const aScore = labelA === 'yes' ? 0 : labelA === 'no' ? 1 : 2;
      const bScore = labelB === 'yes' ? 0 : labelB === 'no' ? 1 : 2;
      if (aScore !== bScore) return aScore - bScore;
      const aNode = nodeMap.get(a);
      const bNode = nodeMap.get(b);
      const aBias = isStartLike(aNode!) ? -1 : isEndLike(aNode!) ? 1 : 0;
      const bBias = isStartLike(bNode!) ? -1 : isEndLike(bNode!) ? 1 : 0;
      if (aBias !== bBias) return aBias - bBias;
      return (aNode?.data.label || '').localeCompare(bNode?.data.label || '');
    });
    return ordered;
  }

  ordered.sort((a, b) => {
    const aNode = nodeMap.get(a);
    const bNode = nodeMap.get(b);
    const aBias = isStartLike(aNode!) ? -1 : isEndLike(aNode!) ? 1 : 0;
    const bBias = isStartLike(bNode!) ? -1 : isEndLike(bNode!) ? 1 : 0;
    if (aBias !== bBias) return aBias - bBias;
    return (aNode?.data.label || '').localeCompare(bNode?.data.label || '');
  });
  return ordered;
}

function searchFreeColumn(
  occupied: Map<number, Set<number>>,
  layer: number,
  preferred: number,
  sideHint: Side,
): number {
  const normalizedPreferred = Math.round(preferred);
  const tryColumn = (col: number): number | null => {
    const cols = occupied.get(layer);
    if (!cols || !cols.has(col)) return col;
    return null;
  };

  const side = sideHint === 0 ? 1 : sideHint;
  const orderedOffsets: number[] = [0];
  for (let radius = 1; radius <= 40; radius++) {
    if (sideHint === 0) {
      orderedOffsets.push(radius, -radius);
    } else {
      orderedOffsets.push(radius * side, -radius * side);
    }
  }

  for (const offset of orderedOffsets) {
    const found = tryColumn(normalizedPreferred + offset);
    if (found != null) return found;
  }

  return normalizedPreferred;
}

export function autoLayoutFlowchart(
  nodes: Node<FlowchartNodeData>[],
  edges: Edge[],
): FlowchartLayoutResult {
  if (nodes.length === 0) return { nodes: [], edges: [] };

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const edgeLabelLookup = new Map<string, string>();

  for (const n of nodes) {
    outgoing.set(n.id, []);
    incoming.set(n.id, []);
  }

  for (const edge of edges) {
    const src = edge.source;
    const tgt = edge.target;
    if (!outgoing.has(src) || !incoming.has(tgt)) continue;
    outgoing.get(src)!.push(tgt);
    incoming.get(tgt)!.push(src);
    edgeLabelLookup.set(`${src}->${tgt}`, edge.label ? String(edge.label) : '');
  }

  const roots = nodes
    .filter(n => incoming.get(n.id)?.length === 0 && isStartLike(n))
    .map(n => n.id);

  if (roots.length === 0) {
    const unlabeledRoots = nodes.filter(n => incoming.get(n.id)?.length === 0).map(n => n.id);
    if (unlabeledRoots.length > 0) roots.push(...unlabeledRoots);
  }
  if (roots.length === 0 && nodes.length > 0) roots.push(nodes[0].id);

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const backEdges = new Set<string>();

  function markCycles(id: string) {
    visited.add(id);
    inStack.add(id);
    for (const next of outgoing.get(id) || []) {
      if (inStack.has(next)) {
        backEdges.add(`${id}->${next}`);
      } else if (!visited.has(next)) {
        markCycles(next);
      }
    }
    inStack.delete(id);
  }

  for (const root of roots) {
    if (!visited.has(root)) markCycles(root);
  }
  for (const node of nodes) {
    if (!visited.has(node.id)) markCycles(node.id);
  }

  const layerMemo = new Map<string, number>();
  function getLayer(id: string): number {
    if (layerMemo.has(id)) return layerMemo.get(id)!;
    const parents = (incoming.get(id) || []).filter(src => !backEdges.has(`${src}->${id}`));
    if (parents.length === 0) {
      layerMemo.set(id, 0);
      return 0;
    }
    const layer = Math.max(...parents.map(getLayer)) + 1;
    layerMemo.set(id, layer);
    return layer;
  }

  const layers = new Map<number, string[]>();
  for (const node of nodes) {
    const layer = getLayer(node.id);
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer)!.push(node.id);
  }

  const layerHeights = new Map<number, number>();
  let maxColumnFootprint = 0;
  for (const node of nodes) {
    const footprint = shapeFootprint(node);
    maxColumnFootprint = Math.max(maxColumnFootprint, footprint.width);
    const layer = getLayer(node.id);
    const current = layerHeights.get(layer) || 0;
    layerHeights.set(layer, Math.max(current, footprint.height));
  }

  const columnSpacing = Math.max(maxColumnFootprint + COLUMN_PADDING, MIN_COLUMN_SPACING);
  const rowSpacingByLayer = new Map<number, number>();
  const sortedLayers = [...layers.keys()].sort((a, b) => a - b);
  for (const layer of sortedLayers) {
    const layerHeight = layerHeights.get(layer) || 0;
    rowSpacingByLayer.set(layer, Math.max(layerHeight + ROW_PADDING, MIN_ROW_SPACING));
  }

  const assignedCol = new Map<string, number>();
  const occupied = new Map<number, Set<number>>();
  const assignedSide = new Map<string, Side>();

  function occupy(layer: number, col: number) {
    if (!occupied.has(layer)) occupied.set(layer, new Set());
    occupied.get(layer)!.add(col);
  }

  function placeNode(id: string, preferred: number, sideHint: Side = 0): number {
    const layer = getLayer(id);
    const col = searchFreeColumn(occupied, layer, preferred, sideHint);
    assignedCol.set(id, col);
    occupy(layer, col);
    return col;
  }

  function assignSubtree(id: string, preferred: number, sideHint: Side = 0) {
    if (assignedCol.has(id)) return;

    const parentSide = assignedSide.get(id) ?? sideHint;
    const col = placeNode(id, preferred, parentSide);

    const node = nodeMap.get(id);
    if (!node) return;

    const children = (outgoing.get(id) || []).filter(next => !backEdges.has(`${id}->${next}`));
    if (children.length === 0) return;

    const orderedChildren = sortChildren(node, children, edgeLabelLookup, nodeMap);

    if (isDecision(node)) {
      const primaryChild = orderedChildren.find(child => normalizeLabel(edgeLabelLookup.get(`${id}->${child}`)) === 'yes')
        ?? orderedChildren.find(child => !isErrorLike(nodeMap.get(child)!))
        ?? orderedChildren[0];

      assignedSide.set(primaryChild, 0);
      assignSubtree(primaryChild, col, 0);

      let leftOffset = 1;
      let rightOffset = 1;
      for (const childId of orderedChildren) {
        if (childId === primaryChild) continue;
        const edgeLabel = normalizeLabel(edgeLabelLookup.get(`${id}->${childId}`));
        const childNode = nodeMap.get(childId)!;
        const childSide: Side = edgeLabel === 'no' || isErrorLike(childNode) ? -1 : 1;
        const offset = childSide === -1 ? -leftOffset++ : rightOffset++;
        assignedSide.set(childId, childSide);
        assignSubtree(childId, col + offset, childSide);
      }
      return;
    }

    if (orderedChildren.length === 1) {
      const childId = orderedChildren[0];
      if (!assignedSide.has(childId)) assignedSide.set(childId, 0);
      assignSubtree(childId, col, assignedSide.get(childId) ?? 0);
      return;
    }

    const [primaryChild, ...sideChildren] = orderedChildren;
    assignedSide.set(primaryChild, 0);
    assignSubtree(primaryChild, col, 0);

    sideChildren.forEach((childId, index) => {
      const childSide: Side = index % 2 === 0 ? 1 : -1;
      const offset = childSide * (Math.floor(index / 2) + 1);
      assignedSide.set(childId, childSide);
      assignSubtree(childId, col + offset, childSide);
    });
  }

  const sortedRoots = [...roots].sort((a, b) => {
    const na = nodeMap.get(a)?.data.label || '';
    const nb = nodeMap.get(b)?.data.label || '';
    const aStart = isStartLike(nodeMap.get(a)!) ? -1 : 0;
    const bStart = isStartLike(nodeMap.get(b)!) ? -1 : 0;
    if (aStart !== bStart) return aStart - bStart;
    return na.localeCompare(nb);
  });

  const rootOffsets = sortedRoots.length === 1
    ? [0]
    : [0, 1, -1, 2, -2, 3, -3];
  sortedRoots.forEach((rootId, index) => {
    const offset = rootOffsets[index] ?? 0;
    if (!assignedSide.has(rootId)) assignedSide.set(rootId, 0);
    assignSubtree(rootId, offset * 2, 0);
  });

  for (const node of nodes) {
    if (!assignedCol.has(node.id)) {
      const parents = (incoming.get(node.id) || []).filter(src => assignedCol.has(src));
      const preferred = parents.length > 0
        ? parents.reduce((sum, parentId) => sum + (assignedCol.get(parentId) || 0), 0) / parents.length
        : 0;
      const dominantSide = parents.length > 0
        ? Math.sign(parents.reduce((sum, parentId) => sum + (assignedSide.get(parentId) || 0), 0)) as Side
        : 0;
      assignSubtree(node.id, preferred, dominantSide);
    }
  }

  for (const node of nodes) {
    const parents = (incoming.get(node.id) || []).filter(src => assignedCol.has(src) && !backEdges.has(`${src}->${node.id}`));
    if (parents.length >= 2) {
      const parentCols = parents.map(id => assignedCol.get(id) || 0);
      const average = parentCols.reduce((sum, value) => sum + value, 0) / parentCols.length;
      const target = Math.round(average);
      const layer = getLayer(node.id);
      const current = assignedCol.get(node.id);
      if (current != null && current !== target && !(occupied.get(layer)?.has(target))) {
        occupied.get(layer)?.delete(current);
        occupy(layer, target);
        assignedCol.set(node.id, target);
      }
    }
  }

  const minCol = Math.min(...assignedCol.values(), 0);
  const normalizedCols = new Map<string, number>();
  for (const [id, col] of assignedCol) {
    normalizedCols.set(id, col - minCol);
  }

  let currentY = START_Y;
  const layerY = new Map<number, number>();
  for (const layer of sortedLayers) {
    layerY.set(layer, currentY);
    currentY += (rowSpacingByLayer.get(layer) || MIN_ROW_SPACING) + 18;
  }

  const positionedNodes = nodes.map(node => {
    const layer = getLayer(node.id);
    const footprint = shapeFootprint(node);
    const col = normalizedCols.get(node.id) ?? 0;
    return {
      ...node,
      position: {
        x: START_X + maxColumnFootprint / 2 + col * columnSpacing - footprint.width / 2,
        y: layerY.get(layer) ?? START_Y,
      },
      style: {
        ...node.style,
        width: footprint.width,
        height: footprint.height,
      },
    };
  });

  const positionedNodeMap = new Map(positionedNodes.map(node => [node.id, node]));
  const boxes = positionedNodes.map(node => ({
    id: node.id,
    x1: node.position.x,
    y1: node.position.y,
    x2: node.position.x + Number(node.style.width),
    y2: node.position.y + Number(node.style.height),
  }));
  const boxOf = new Map(boxes.map(box => [box.id, box]));
  const leftBoundary = Math.min(...boxes.map(box => box.x1));
  const rightBoundary = Math.max(...boxes.map(box => box.x2));

  type Point = { x: number; y: number };
  type Box = (typeof boxes)[number];
  // shortcut: routes are the corner points of a smoothstep path without its rounded bends; enough to see a crossed shape.
  const crossesOtherNode = (points: Point[], source: Box, target: Box) => points.slice(1).some((point, index) => {
    const from = points[index];
    return boxes.some(box => box !== source && box !== target
      && Math.min(from.x, point.x) < box.x2 + 8 && Math.max(from.x, point.x) > box.x1 - 8
      && Math.min(from.y, point.y) < box.y2 + 8 && Math.max(from.y, point.y) > box.y1 - 8);
  });
  const centerX = (box: Box) => (box.x1 + box.x2) / 2;
  const centerY = (box: Box) => (box.y1 + box.y2) / 2;
  const defaultRoute = (source: Box, target: Box, sourceHandle: string): Point[] => {
    const end = { x: centerX(target), y: target.y1 };
    if (sourceHandle !== 'bottom') {
      const start = { x: sourceHandle === 'left' ? source.x1 : source.x2, y: centerY(source) };
      return [start, { x: end.x, y: start.y }, end];
    }
    const start = { x: centerX(source), y: source.y2 };
    const middle = (start.y + end.y) / 2;
    return [start, { x: start.x, y: middle }, { x: end.x, y: middle }, end];
  };
  // Outer lanes sit beyond every shape, 24px apart, so detoured connectors neither cross shapes nor share a lane (BUG-015).
  const laneX = (side: 'left' | 'right', lane: number) => side === 'left' ? leftBoundary - 64 - lane * 24 : rightBoundary + 64 + lane * 24;
  const outerRoute = (side: 'left' | 'right', source: Box, target: Box, lane: number): Point[] => {
    const x = laneX(side, lane);
    const edgeX = (box: Box) => side === 'left' ? box.x1 : box.x2;
    return [{ x: edgeX(source), y: centerY(source) }, { x, y: centerY(source) }, { x, y: centerY(target) }, { x: edgeX(target), y: centerY(target) }];
  };
  const outerOffset = (side: 'left' | 'right', source: Box, target: Box, lane: number) => side === 'left'
    ? Math.min(source.x1, target.x1) - laneX('left', lane)
    : laneX('right', lane) - Math.max(source.x2, target.x2);

  const lanes = { left: 0, right: 0 };
  const newEdges = edges.filter(edge => positionedNodeMap.has(edge.source) && positionedNodeMap.has(edge.target)).map((edge, index) => {
    const source = boxOf.get(edge.source)!;
    const target = boxOf.get(edge.target)!;
    const sourceNode = positionedNodeMap.get(edge.source)!;

    let sourceHandle: string;
    let targetHandle: string;
    let offset = 20;
    if (backEdges.has(`${edge.source}->${edge.target}`)) {
      sourceHandle = targetHandle = 'right';
      offset = outerOffset('right', source, target, lanes.right++);
    } else {
      sourceHandle = isDecision(sourceNode) && Math.abs(centerX(source) - centerX(target)) > 40
        ? (centerX(target) < centerX(source) ? 'left' : 'right') : 'bottom';
      targetHandle = 'top';
      if (crossesOtherNode(defaultRoute(source, target, sourceHandle), source, target)) {
        const preferred: 'left' | 'right' = centerX(source) < centerX(target)
          || (centerX(source) === centerX(target) && assignedSide.get(edge.source) === -1) ? 'left' : 'right';
        const sides: ('left' | 'right')[] = preferred === 'left' ? ['left', 'right'] : ['right', 'left'];
        const side = sides.find(candidate => !crossesOtherNode(outerRoute(candidate, source, target, lanes[candidate]), source, target)) ?? preferred;
        sourceHandle = targetHandle = side;
        offset = outerOffset(side, source, target, lanes[side]++);
      }
    }
    return {
      ...edge,
      id: edge.id || `flowchart_edge_${index}`,
      sourceHandle,
      targetHandle,
      type: 'smoothstep',
      pathOptions: { offset },
      markerEnd: edge.markerEnd || { type: MarkerType.ArrowClosed, color: '#b1b1b7' },
    };
  });

  return { nodes: positionedNodes, edges: newEdges };
}
