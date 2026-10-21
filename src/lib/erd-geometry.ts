import { applyNodeChanges, type Edge, type Node, type NodeChange, type XYPosition } from '@xyflow/react';
import type { Entity } from '@/types';
import { formatColumnType } from './column-metadata';

export const TABLE_GAP = 32;

export function tableSize(node: Node<Entity>) {
  const measuredWidth = node.measured?.width ?? node.width;
  const measuredHeight = node.measured?.height ?? node.height;
  if (measuredWidth !== undefined && measuredHeight !== undefined) return { width: measuredWidth, height: measuredHeight };
  const columns = node.data.columns || [];
  const width = Math.max(220, 70 + node.data.name.length * 8,
    ...columns.map(c => 100 + c.name.length * 8 + formatColumnType(c.type, c.max_length, c.numeric_precision, c.numeric_scale).length * 7));
  const height = 44 + columns.reduce((sum, c) => sum + 38 + (c.type === 'ENUM' && c.enum_values ? Math.ceil(c.enum_values.length / 24) * 12 : 0), 0);
  return { width: node.measured?.width ?? node.width ?? width, height: node.measured?.height ?? node.height ?? height };
}

export function tablesOverlap(a: Node<Entity>, b: Node<Entity>, gap = TABLE_GAP) {
  const sa = tableSize(a), sb = tableSize(b);
  return a.position.x < b.position.x + sb.width + gap && a.position.x + sa.width + gap > b.position.x
    && a.position.y < b.position.y + sb.height + gap && a.position.y + sa.height + gap > b.position.y;
}

/** Keep the moved group together; nearest free candidate preserves all other table positions. */
export function separateMovedTables(nodes: Node<Entity>[], movedIds: Set<string>): Node<Entity>[] {
  const moving = nodes.filter(n => movedIds.has(n.id));
  const fixed = nodes.filter(n => !movedIds.has(n.id));
  if (!moving.some(a => fixed.some(b => tablesOverlap(a, b)))) return nodes;
  const xs = new Set([0]), ys = new Set([0]);
  for (const a of moving) for (const b of fixed) {
    const sa = tableSize(a), sb = tableSize(b);
    xs.add(b.position.x + sb.width + TABLE_GAP - a.position.x);
    xs.add(b.position.x - sa.width - TABLE_GAP - a.position.x);
    ys.add(b.position.y + sb.height + TABLE_GAP - a.position.y);
    ys.add(b.position.y - sa.height - TABLE_GAP - a.position.y);
  }
  const candidates: XYPosition[] = [...xs].map(x => ({ x, y: 0 })).concat([...ys].map(y => ({ x: 0, y })));
  candidates.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
  const delta = candidates.find(d => moving.every(a => fixed.every(b => !tablesOverlap({ ...a, position: { x: a.position.x + d.x, y: a.position.y + d.y } }, b))));
  if (!delta) return nodes;
  return nodes.map(n => movedIds.has(n.id) ? { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y } } : n);
}

export function separateTables(nodes: Node<Entity>[]): Node<Entity>[] {
  const placed: Node<Entity>[] = [];
  for (const node of nodes) {
    const next = separateMovedTables([...placed, node], new Set([node.id]));
    placed.push(next[next.length - 1]);
  }
  return placed.every((n, i) => n === nodes[i]) ? nodes : placed;
}

export function constrainTableChanges(changes: NodeChange<Node<Entity>>[], nodes: Node<Entity>[]) {
  const next = applyNodeChanges(changes, nodes);
  const moving = new Set(changes.flatMap(c => c.type === 'position' ? [c.id] : []));
  const safe = moving.size ? separateMovedTables(next, moving)
    : changes.some(c => c.type === 'dimensions') ? separateTables(next) : next;
  const corrections: NodeChange<Node<Entity>>[] = safe.flatMap((n, i) => n.position.x !== next[i].position.x || n.position.y !== next[i].position.y
    ? [{ type: 'position' as const, id: n.id, position: n.position }] : []);
  return corrections.length ? [...changes, ...corrections] : changes;
}

export function constrainDbClientChanges(changes: NodeChange<Node<Entity>>[], nodes: Node<Entity>[]) {
  // Read-only tables cannot be resized by users; initial measurements must not repeatedly rearrange the whole catalog.
  return changes.some(change => change.type === 'position') ? constrainTableChanges(changes, nodes) : changes;
}

export function alignErdHandles(nodes: Node<Entity>[], edges: Edge[]): Edge[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  return edges.map(edge => {
    const source = byId.get(edge.source), target = byId.get(edge.target);
    if (!source || !target) return edge;
    const right = source.position.x <= target.position.x;
    return { ...edge,
      sourceHandle: edge.sourceHandle?.replace(/-(source|target)(-[lr])?$/, right ? '-source' : '-source-l'),
      targetHandle: edge.targetHandle?.replace(/-(source|target)(-[lr])?$/, source.position.x === target.position.x || !right ? '-target-r' : '-target'),
    };
  });
}
