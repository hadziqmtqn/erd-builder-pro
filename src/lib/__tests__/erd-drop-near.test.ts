import { describe, expect, it } from 'vitest';
import type { Node, XYPosition } from '@xyflow/react';
import type { Entity } from '@/types';
import { separateMovedTables, tableSize, tablesOverlap, TABLE_GAP } from '../erd-geometry';

const node = (id: string, x: number, y: number, width = 220, height = 150): Node<Entity> => ({
  id, position: { x, y }, measured: { width, height },
  data: { id, name: id, x, y, color: '#666', columns: [{ id: 'id', name: 'id', type: 'BIGINT', is_pk: true, is_nullable: false }] },
});
const overlapsAny = (nodes: Node<Entity>[]) => nodes.some((a, i) => nodes.slice(i + 1).some(b => tablesOverlap(a, b)));
const drop = (nodes: Node<Entity>[], moves: Record<string, XYPosition>) =>
  separateMovedTables(nodes.map(n => moves[n.id] ? { ...n, position: moves[n.id] } : n), new Set(Object.keys(moves)));

// 5 rows x 7 columns, 40 apart, with one gap at row 1 / column 4 (up and right of the middle table).
const crowdedGrid = () => Array.from({ length: 35 }, (_, i) => [i % 7, Math.floor(i / 7)] as const)
  .filter(([column, row]) => !(column === 4 && row === 1))
  .map(([column, row]) => node(`r${row}c${column}`, column * 260, row * 190));

// Reference: try every combination of offsets in order of distance, as the issue describes, without shortcuts.
function nearestFreeSpot(nodes: Node<Entity>[], movedIds: Set<string>) {
  const moving = nodes.filter(n => movedIds.has(n.id)), fixed = nodes.filter(n => !movedIds.has(n.id));
  if (!moving.some(a => fixed.some(b => tablesOverlap(a, b)))) return nodes;
  const xs = new Set([0]), ys = new Set([0]);
  for (const a of moving) for (const b of fixed) {
    const sa = tableSize(a), sb = tableSize(b);
    xs.add(b.position.x + sb.width + TABLE_GAP - a.position.x);
    xs.add(b.position.x - sa.width - TABLE_GAP - a.position.x);
    ys.add(b.position.y + sb.height + TABLE_GAP - a.position.y);
    ys.add(b.position.y - sa.height - TABLE_GAP - a.position.y);
  }
  const candidates = [...xs].flatMap(x => [...ys].map(y => ({ x, y }))).sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
  const delta = candidates.find(d => moving.every(a => fixed.every(b => !tablesOverlap({ ...a, position: { x: a.position.x + d.x, y: a.position.y + d.y } }, b))));
  return delta ? nodes.map(n => movedIds.has(n.id) ? { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y } } : n) : nodes;
}

describe('BUG-071 drop in a crowded area', () => {
  it('lands in the diagonal gap next to the drop point instead of past the edge of the crowd (the TABLE_7 -> TABLE_48 case)', () => {
    const grid = crowdedGrid();
    const moved = node('moved', 0, 1200);
    // Dropped onto the middle table (row 2, column 3).
    const dropPoint = { x: 790, y: 390 };
    const result = drop([...grid, moved], { moved: dropPoint });
    const landed = result.find(n => n.id === 'moved')!.position;
    expect(landed).toEqual({ x: 1032, y: 198 });
    // About 309 away; any straight shift has to leave the 5 x 7 crowd, at least 552 away.
    expect(Math.hypot(landed.x - dropPoint.x, landed.y - dropPoint.y)).toBeLessThan(320);
    expect(overlapsAny(result)).toBe(false);
  });

  it('does not move any other table and keeps a dropped group together', () => {
    const grid = crowdedGrid();
    const result = drop([...grid, node('a', 0, 1200), node('b', 300, 1200)], { a: { x: 520, y: 390 }, b: { x: 820, y: 390 } });
    expect(result.slice(0, grid.length)).toEqual(grid);
    const [a, b] = result.slice(grid.length);
    expect(b.position.x - a.position.x).toBe(300);
    expect(b.position.y - a.position.y).toBe(0);
    expect(overlapsAny(result)).toBe(false);
  });

  it('picks the same spot as trying every combination in order of distance', () => {
    let seed = 71;
    const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let layout = 0; layout < 150; layout++) {
      const nodes = Array.from({ length: 6 + Math.floor(random() * 30) }, (_, i) =>
        node(`t${i}`, Math.floor(random() * 1800), Math.floor(random() * 1400), 200 + Math.floor(random() * 80), 80 + Math.floor(random() * 260)));
      const movedIds = new Set(nodes.slice(0, 1 + Math.floor(random() * 2)).map(n => n.id));
      const result = separateMovedTables(nodes, movedIds);
      expect(result.map(n => n.position), `layout ${layout}`).toEqual(nearestFreeSpot(nodes, movedIds).map(n => n.position));
    }
  });
});
