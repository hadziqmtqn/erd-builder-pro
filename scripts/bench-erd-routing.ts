/**
 * BUG-040: per-frame edge routing cost while a table is dragged on a large ERD.
 *
 *   npm run bench:erd-routing
 *
 * Builds seeded 56-table diagrams with a hub table, then replays the drag the way the canvas does it:
 * obstacles come from the settled (pre-drag) positions, the dragged table is live, it is kept clear of
 * other tables by `separateMovedTables` (not timed), and every edge attached to it is routed each frame,
 * once with the full `routeErdEdge` and once with `routeErdEdgeWhileDragging` (what the canvas now uses).
 */
import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '../src/types';
import { autoLayoutERD } from '../src/lib/autoLayoutERD';
import { separateMovedTables, separateTables } from '../src/lib/erd-geometry';
import { edgeRoutingObstacles, routeErdEdge, routeErdEdgeWhileDragging, type RouteObstacle } from '../src/lib/erd-routing';

type Router = typeof routeErdEdge;
const ROUTERS: Array<[string, Router]> = [['full route', routeErdEdge], ['drag route', routeErdEdgeWhileDragging]];

const TABLES = 56, RELATIONSHIPS = 70, HUB_RELATIONSHIPS = 18, WIDTH = 240, HEADER = 44, ROW = 38;
const SEEDS = [1, 2, 3], FRAMES = 240, WARMUP = 20, FRAME_BUDGET = 1000 / 60;

interface BenchEdge { id: string; source: string; sourceRow: number; target: string; targetRow: number }

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Layout = 'auto' | 'compact';

/** `auto`: like an SQL import (autoLayoutERD, then separateTables). `compact`: hand-arranged, tables packed close together. */
function buildDiagram(seed: number, layout: Layout) {
  const random = seeded(seed);
  const nodes: Node<Entity>[] = Array.from({ length: TABLES }, (_, i) => {
    const columns = 3 + Math.floor(random() * 8);
    return {
      id: `t${i}`,
      position: { x: Math.floor(random() * 2600), y: Math.floor(random() * 2200) },
      measured: { width: WIDTH, height: HEADER + columns * ROW },
      data: { name: `table_${i}`, columns: Array.from({ length: columns }, (_, c) => ({ id: `c${c}` })) } as unknown as Entity,
    } as Node<Entity>;
  });
  const [hub, ...others] = nodes;
  const edges: BenchEdge[] = [];
  const link = (child: Node<Entity>, parent: Node<Entity>) => edges.push({
    id: `e${edges.length}`, source: child.id, sourceRow: 1 + Math.floor(random() * (child.data.columns.length - 1)), target: parent.id, targetRow: 0,
  });
  // The hub (think `users`) is referenced by many tables.
  for (let i = 0; i < HUB_RELATIONSHIPS; i++) link(others[Math.floor((i * others.length) / HUB_RELATIONSHIPS)], hub);
  while (edges.length < RELATIONSHIPS) {
    const a = others[Math.floor(random() * others.length)], b = others[Math.floor(random() * others.length)];
    if (a !== b) link(a, b);
  }
  const laidOut = separateTables(layout === 'auto' ? autoLayoutERD(nodes, edges as unknown as Edge[]) : nodes);
  return { nodes: laidOut, edges, hub: laidOut.find(node => node.id === hub.id)! };
}

const box = (node: Node<Entity>): RouteObstacle => ({ id: node.id, ...node.position, width: node.measured!.width!, height: node.measured!.height! });

function handles(edge: BenchEdge, source: RouteObstacle, target: RouteObstacle, right: boolean) {
  // Same side rule as alignErdHandles at drag start; handles keep their side during the drag.
  return {
    from: { x: source.x + (right ? source.width : 0), y: source.y + HEADER + (edge.sourceRow + 0.5) * ROW },
    to: { x: target.x + (right ? 0 : target.width), y: target.y + HEADER + (edge.targetRow + 0.5) * ROW },
    sourceRight: right, targetRight: !right,
  };
}

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function benchDrag(label: string, route: Router, nodes: Node<Entity>[], edges: BenchEdge[], dragged: Node<Entity>) {
  const settled = nodes.map(box);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const attached = edges.filter(edge => edge.source === dragged.id || edge.target === dragged.id);
  const sides = new Map(attached.map(edge => [edge.id, byId.get(edge.source)!.position.x <= byId.get(edge.target)!.position.x]));
  const start = dragged.position, times: number[] = [];
  let live = nodes;
  for (let frame = 0; frame < WARMUP + FRAMES; frame++) {
    // A wide figure-eight across neighbouring tables.
    const t = (frame / FRAMES) * Math.PI * 2;
    const moved = { ...dragged, position: { x: start.x + Math.sin(t) * 900, y: start.y + Math.sin(2 * t) * 450 } };
    live = separateMovedTables(live.map(node => node.id === dragged.id ? moved : node), new Set([dragged.id]));
    const current = box(live.find(node => node.id === dragged.id)!);
    const begin = performance.now();
    for (const edge of attached) {
      const source = edge.source === dragged.id ? current : box(byId.get(edge.source)!);
      const target = edge.target === dragged.id ? current : box(byId.get(edge.target)!);
      const { from, to, sourceRight, targetRight } = handles(edge, source, target, sides.get(edge.id)!);
      route(from, to, sourceRight, targetRight, edgeRoutingObstacles(settled, [source, target]));
    }
    if (frame >= WARMUP) times.push(performance.now() - begin);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((sum, time) => sum + time, 0) / times.length;
  const over = times.filter(time => time > FRAME_BUDGET).length;
  console.log(`  ${label.padEnd(26)} ${String(attached.length).padStart(2)} edges | mean ${mean.toFixed(2)} ms | p95 ${percentile(sorted, 95).toFixed(2)} ms | max ${sorted[sorted.length - 1].toFixed(2)} ms | ${over}/${FRAMES} frames over 16.7 ms`);
}

function benchDrop(nodes: Node<Entity>[], edges: BenchEdge[]) {
  const obstacles = nodes.map(box), byId = new Map(obstacles.map(table => [table.id, table]));
  const times: number[] = [];
  for (let run = 0; run < 30; run++) {
    const begin = performance.now();
    for (const edge of edges) {
      const source = byId.get(edge.source)!, target = byId.get(edge.target)!;
      const { from, to, sourceRight, targetRight } = handles(edge, source, target, source.x <= target.x);
      routeErdEdge(from, to, sourceRight, targetRight, obstacles);
    }
    if (run >= 5) times.push(performance.now() - begin);
  }
  console.log(`  route all ${edges.length} edges once (drop) | mean ${(times.reduce((sum, time) => sum + time, 0) / times.length).toFixed(2)} ms`);
}

console.log(`BUG-040 routing benchmark: ${TABLES} tables, ${RELATIONSHIPS} relationships, ${FRAMES} drag frames per table`);
for (const [layout, seed] of (['auto', 'compact'] as const).flatMap(layout => SEEDS.map(seed => [layout, seed] as const))) {
  const { nodes, edges, hub } = buildDiagram(seed, layout);
  const degree = (node: Node<Entity>) => edges.filter(edge => edge.source === node.id || edge.target === node.id).length;
  const byDegree = nodes.filter(node => node !== hub).sort((a, b) => degree(b) - degree(a));
  const medium = byDegree.find(node => degree(node) <= 7) ?? byDegree[0];
  const leaf = [...byDegree].reverse().find(node => degree(node) === 1) ?? byDegree[byDegree.length - 1];
  console.log(`${layout === 'auto' ? 'Auto layout' : 'Compact layout'}, seed ${seed}`);
  for (const [table, node] of [['hub', hub], ['medium', medium], ['leaf', leaf]] as const) {
    for (const [name, route] of ROUTERS) benchDrag(`${table} table, ${name}`, route, nodes, edges, node);
  }
  benchDrop(nodes, edges);
}
