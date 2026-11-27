/**
 * BUG-071: where a dropped table lands, and what table separation costs.
 *
 *   npm run bench:erd-separation
 *
 * Drop: on seeded 56-table compact diagrams, every table is dropped onto the centre of another table and
 * `separateMovedTables` moves it to a free spot; the distance from the drop point is what users see.
 * Separation: `separateTables` runs on import, on adding a table, on AI and DBML merges, and when measured
 * sizes grow, so it is timed on the 56-table compact diagram and on 200-table diagrams.
 */
import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '../src/types';
import { autoLayoutERD } from '../src/lib/autoLayoutERD';
import { separateMovedTables, separateTables } from '../src/lib/erd-geometry';

const WIDTH = 240, HEADER = 44, ROW = 38, SEEDS = [1, 2, 3], RUNS = 5;

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tables(count: number, seed: number, area: { width: number; height: number }) {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const columns = 3 + Math.floor(random() * 8);
    return {
      id: `t${i}`,
      position: { x: Math.floor(random() * area.width), y: Math.floor(random() * area.height) },
      measured: { width: WIDTH, height: HEADER + columns * ROW },
      data: { name: `table_${i}`, columns: Array.from({ length: columns }, (_, c) => ({ id: `c${c}` })) } as unknown as Entity,
    } as Node<Entity>;
  });
}

function relations(nodes: Node<Entity>[], count: number, seed: number): Edge[] {
  const random = seeded(seed + 1000);
  return Array.from({ length: count }, (_, i) => ({
    id: `e${i}`, source: nodes[Math.floor(random() * nodes.length)].id, target: nodes[Math.floor(random() * nodes.length)].id,
  })).filter(edge => edge.source !== edge.target);
}

// Hand-arranged: 8 columns of 7 tables, 40-72 apart, built without the code under test so every version
// drops into the same diagram.
function compact(seed: number) {
  const random = seeded(seed + 2000);
  const bottoms = Array<number>(8).fill(0);
  return tables(56, seed, { width: 0, height: 0 }).map((node, i) => {
    const column = i % 8, y = bottoms[column];
    bottoms[column] += node.measured!.height! + 40 + Math.floor(random() * 33);
    return { ...node, position: { x: column * (WIDTH + 40), y } };
  });
}

function time<T>(fn: () => T) {
  const start = performance.now();
  const result = fn();
  return { ms: performance.now() - start, result };
}

const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return { mean: values.reduce((sum, v) => sum + v, 0) / values.length, median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] };
};
const fmt = (n: number) => n.toFixed(n >= 100 ? 0 : 2);

function benchDrops(seed: number) {
  const nodes = compact(seed);
  const times: number[] = [], distances: number[] = [];
  nodes.forEach((dragged, i) => {
    const target = nodes[(i * 7 + 3) % nodes.length] === dragged ? nodes[(i + 1) % nodes.length] : nodes[(i * 7 + 3) % nodes.length];
    const drop = { x: target.position.x + 10, y: target.position.y + 10 };
    const dropped = nodes.map(node => node === dragged ? { ...node, position: drop } : node);
    const { ms, result } = time(() => separateMovedTables(dropped, new Set([dragged.id])));
    const landed = result.find(node => node.id === dragged.id)!.position;
    times.push(ms);
    distances.push(Math.hypot(landed.x - drop.x, landed.y - drop.y));
  });
  const t = stats(times), d = stats(distances);
  console.log(`  drop, compact seed ${seed}: time mean ${fmt(t.mean)} / p95 ${fmt(t.p95)} / max ${fmt(t.max)} ms | distance median ${fmt(d.median)} / p95 ${fmt(d.p95)} / max ${fmt(d.max)} | ${distances.filter(v => v > WIDTH * 2).length}/${nodes.length} drops land over ${WIDTH * 2} away`);
}

function benchSeparate(label: string, build: () => Node<Entity>[]) {
  const times = Array.from({ length: RUNS }, () => {
    const input = build();
    return time(() => separateTables(input)).ms;
  });
  const t = stats(times);
  console.log(`  ${label.padEnd(46)} mean ${fmt(t.mean)} / max ${fmt(t.max)} ms`);
}

function autoLayout(count: number, seed: number) {
  const nodes = tables(count, seed, { width: 0, height: 0 });
  return autoLayoutERD(nodes, relations(nodes, Math.round(count * 1.3), seed));
}

const grow = (nodes: Node<Entity>[]) => nodes.map(node => ({
  ...node, measured: { width: node.measured!.width! * 1.4, height: node.measured!.height! * 1.4 },
}));

console.log('BUG-071 table separation benchmark');
console.log('Drops onto another table:');
for (const seed of SEEDS) benchDrops(seed);
console.log(`separateTables (${RUNS} runs each):`);
for (const seed of SEEDS) benchSeparate(`56 overlapping tables (compact), seed ${seed}`, () => tables(56, seed, { width: 2600, height: 2200 }));
benchSeparate('import 200 tables (autoLayoutERD)', () => autoLayout(200, 1));
benchSeparate('200 tables after measured sizes grow 1.4x', () => grow(autoLayout(200, 1)));
benchSeparate('add a table at (80, 80) to 200 tables', () => {
  const nodes = autoLayout(200, 1);
  return [...nodes, { ...nodes[0], id: 'new', position: { x: 80, y: 80 } }];
});
benchSeparate('200 overlapping tables (worst case)', () => tables(200, 1, { width: 4000, height: 3000 }));
