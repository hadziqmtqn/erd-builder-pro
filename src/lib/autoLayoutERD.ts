import { Node, Edge } from '@xyflow/react';
import { Entity } from '@/types';

const START_X = 50;
const START_Y = 50;
const COL_TO_WIDTH_ESTIMATE = 6;
const BASE_TABLE_WIDTH = 220;
const HORIZONTAL_GAP = 24;
const VERTICAL_GAP = 32;

const HEADER_H = 44;
const ROW_H = 36;

function estimateNodeWidth(node: Node<Entity>): number {
  const colCount = node.data.columns?.length || 0;
  return BASE_TABLE_WIDTH + colCount * COL_TO_WIDTH_ESTIMATE;
}

function estimateNodeHeight(node: Node<Entity>): number {
  const colCount = node.data.columns?.length || 0;
  return HEADER_H + colCount * ROW_H + 4;
}

export function autoLayoutERD(
  nodes: Node<Entity>[],
  edges: Edge[],
): Node<Entity>[] {
  if (nodes.length === 0) return nodes;

  // Build FK dependency map: for each node, which other nodes does it reference?
  const refs = new Map<string, Set<string>>();
  for (const n of nodes) {
    refs.set(n.id, new Set());
  }
  for (const edge of edges) {
    const source = edge.source;
    // FK edge goes from child (FK holder) to parent (referenced table)
    if (refs.has(source)) {
      refs.get(source)!.add(edge.target);
    }
  }

  // Compute layers via BFS: layer 0 = no outgoing FK (standalone),
  // layer N+1 = tables that reference tables in earlier layers
  const layerOf = new Map<string, number>();
  const remaining = new Set(nodes.map(n => n.id));

  let currentLayer = 0;
  while (remaining.size > 0) {
    // Find nodes whose dependencies are already assigned or have no dependencies
    const layerNodes: string[] = [];
    for (const id of remaining) {
      const deps = refs.get(id) || new Set();
      // A node goes into this layer if all its dependencies are in previous layers
      const allDepsAssigned = [...deps].every(dep => !remaining.has(dep));
      if (allDepsAssigned) {
        layerNodes.push(id);
      }
    }

    if (layerNodes.length === 0) {
      // Circular dependency or isolated — put remaining into this layer
      for (const id of remaining) {
        layerNodes.push(id);
      }
    }

    for (const id of layerNodes) {
      layerOf.set(id, currentLayer);
      remaining.delete(id);
    }
    currentLayer++;
  }

  // Arrange nodes within each layer
  const layers = new Map<number, string[]>();
  for (const [id, layer] of layerOf) {
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer)!.push(id);
  }

  // Create a clean copy with new positions
  const result = nodes.map(n => ({
    ...n,
    position: { ...n.position },
    data: { ...n.data },
  }));

  const nodesById = new Map(result.map(node => [node.id, node]));
  const layerSizes = new Map<number, { width: number; height: number }>();

  for (const [layer, ids] of layers) {
    const width = ids.reduce((total, id) => total + estimateNodeWidth(nodesById.get(id)!), 0)
      + Math.max(0, ids.length - 1) * HORIZONTAL_GAP;
    const height = Math.max(...ids.map(id => estimateNodeHeight(nodesById.get(id)!)), 0);
    layerSizes.set(layer, { width, height });
  }

  const canvasWidth = Math.max(...[...layerSizes.values()].map(size => size.width), 0);
  let currentY = START_Y;

  for (const [layer, ids] of layers) {
    ids.sort((a, b) => {
      const na = nodesById.get(a)?.data.name || '';
      const nb = nodesById.get(b)?.data.name || '';
      return na.localeCompare(nb);
    });

    const { width: layerWidth, height: layerHeight } = layerSizes.get(layer)!;
    const startX = START_X + (canvasWidth - layerWidth) / 2;
    const y = currentY;
    let x = startX;

    for (const id of ids) {
      const node = nodesById.get(id);
      if (node) {
        node.position = {
          x,
          y,
        };
        x += estimateNodeWidth(node) + HORIZONTAL_GAP;
      }
    }

    currentY += layerHeight + VERTICAL_GAP;
  }

  return result;
}
