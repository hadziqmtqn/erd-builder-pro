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

type TableBox = XYPosition & { width: number; height: number };
const tableBox = (node: Node<Entity>): TableBox => ({ ...node.position, ...tableSize(node) });
type Candidate = XYPosition & { distance: number };
// Squared distance, computed once per candidate: sorting by Math.hypot dominated large separations.
const candidate = (x: number, y: number): Candidate => ({ x, y, distance: x * x + y * y });
const byDistance = (a: Candidate, b: Candidate) => a.distance - b.distance;

/** Keep the moved group together; nearest free candidate preserves all other table positions. */
export function separateMovedTables(nodes: Node<Entity>[], movedIds: Set<string>): Node<Entity>[] {
  const moving = nodes.filter(n => movedIds.has(n.id));
  const fixed = nodes.filter(n => !movedIds.has(n.id));
  if (!moving.some(a => fixed.some(b => tablesOverlap(a, b)))) return nodes;
  const movingBoxes = moving.map(tableBox), fixedBoxes = fixed.map(tableBox);
  const xs = new Set([0]), ys = new Set([0]);
  for (const a of movingBoxes) for (const b of fixedBoxes) {
    xs.add(b.x + b.width + TABLE_GAP - a.x);
    xs.add(b.x - a.width - TABLE_GAP - a.x);
    ys.add(b.y + b.height + TABLE_GAP - a.y);
    ys.add(b.y - a.height - TABLE_GAP - a.y);
  }
  // Same rule as tablesOverlap, on sizes measured once instead of per candidate. Neighbouring candidates are
  // usually blocked by the same table, so the last blocker is tested first.
  const blocks = (a: TableBox, b: TableBox, x: number, y: number) => a.x + x < b.x + b.width + TABLE_GAP
    && a.x + x + a.width + TABLE_GAP > b.x && a.y + y < b.y + b.height + TABLE_GAP && a.y + y + a.height + TABLE_GAP > b.y;
  let blocker: [TableBox, TableBox] | null = null;
  const fits = ({ x, y }: XYPosition) => {
    if (blocker && blocks(blocker[0], blocker[1], x, y)) return false;
    for (const a of movingBoxes) for (const b of fixedBoxes) if (blocks(a, b, x, y)) { blocker = [a, b]; return false; }
    return true;
  };
  const straight = [...xs].map(x => candidate(x, 0)).concat([...ys].map(y => candidate(0, y))).sort(byDistance).find(fits);
  // BUG-071: a diagonal spot beside the drop point beats a straight shift several tables away. Only combinations
  // closer than the best spot found so far are tried, so the result is never farther than before and a tie keeps it.
  let delta: XYPosition | undefined = straight;
  let best = straight ? straight.distance : Infinity;
  const byMagnitude = (values: Set<number>) => [...values].filter(v => v !== 0).sort((a, b) => Math.abs(a) - Math.abs(b));
  const nearYs = byMagnitude(ys);
  for (const x of byMagnitude(xs)) {
    if (x * x >= best) break;
    for (const y of nearYs) {
      const distance = x * x + y * y;
      if (distance >= best) break;
      if (fits({ x, y })) { delta = { x, y }; best = distance; break; }
    }
  }
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
  // BUG-043: a table may overlap others while the mouse is down; it is separated on the drop (dragging false).
  const moving = new Set(changes.flatMap(c => c.type === 'position' && !c.dragging ? [c.id] : []));
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
