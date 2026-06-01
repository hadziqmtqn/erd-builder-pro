import { Node, Edge } from '@xyflow/react';
import { Entity } from '@/types';

const START_X = 50;
const START_Y = 50;
const COL_TO_WIDTH_ESTIMATE = 8;
const BASE_TABLE_WIDTH = 240;
const MIN_HORIZONTAL_SPACING = 320;
const HORIZONTAL_PADDING = 56;

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

  // Compute dynamic spacing based on the largest table dimensions
  const maxEstWidth = Math.max(...result.map(estimateNodeWidth), 0);
  const maxEstHeight = Math.max(...result.map(estimateNodeHeight), 0);
  const H_SPACING = Math.max(maxEstWidth + HORIZONTAL_PADDING, MIN_HORIZONTAL_SPACING);
  const V_SPACING = maxEstHeight + 120; // vertical gap between layers

  const maxLayerWidth = Math.max(...[...layers.values()].map(l => l.length));
  const canvasWidth = START_X + maxLayerWidth * H_SPACING;

  for (const [layer, ids] of layers) {
    ids.sort((a, b) => {
      const na = result.find(n => n.id === a)?.data.name || '';
      const nb = result.find(n => n.id === b)?.data.name || '';
      return na.localeCompare(nb);
    });

    const totalWidth = ids.length * H_SPACING;
    const startX = Math.max(START_X, (canvasWidth - totalWidth) / 2);
    const y = START_Y + layer * V_SPACING;

    for (let i = 0; i < ids.length; i++) {
      const node = result.find(n => n.id === ids[i]);
      if (node) {
        node.position = {
          x: startX + i * H_SPACING,
          y,
        };
      }
    }
  }

  return result;
}
