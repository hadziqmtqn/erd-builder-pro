import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyNodeChanges, type Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { autoLayoutERD } from '../autoLayoutERD';
import { alignErdHandles, constrainDbClientChanges, constrainTableChanges, separateTables, tableSize, tablesOverlap } from '../erd-geometry';
import { dbmlToERD } from '../dbml-converter';
import { parseSQLToERD } from '../sqlParser';
import { edgeRoutingObstacles, routeErdEdge, segmentBlocked } from '../erd-routing';

const node = (id: string, x = 0, y = 0, width = 220, height = 150): Node<Entity> => ({
  id, position: { x, y }, measured: { width, height },
  data: { id, name: id, x, y, color: '#666', columns: [{ id: 'id', name: 'id', type: 'BIGINT', is_pk: true, is_nullable: false }] },
});
const noOverlap = (nodes: Node<Entity>[]) => {
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) expect(tablesOverlap(nodes[i], nodes[j])).toBe(false);
};

describe('SH-004 relational layout', () => {
  it('imports the 24-table reference graph without overlap or changing schema on layout', () => {
    const text = readFileSync(new URL('./fixtures/erd-layout-reference.dbml', import.meta.url), 'utf8');
    const canvas = dbmlToERD(text);
    expect(canvas.nodes).toHaveLength(24);
    expect(canvas.edges).toHaveLength(33);
    noOverlap(canvas.nodes);
    const again = autoLayoutERD(canvas.nodes, canvas.edges);
    expect(again.map(n => n.position)).toEqual(canvas.nodes.map(n => n.position));
    expect(again.map(n => n.data)).toEqual(canvas.nodes.map(n => n.data));
    const tables = canvas.nodes.map(n => ({ ...n.position, ...tableSize(n) }));
    for (const edge of canvas.edges) {
      const source = canvas.nodes.find(n => n.id === edge.source)!;
      const target = canvas.nodes.find(n => n.id === edge.target)!;
      const sourceRight = !edge.sourceHandle?.endsWith('-source-l');
      const targetRight = Boolean(edge.targetHandle?.endsWith('-target-r'));
      const sourceRow = source.data.columns.findIndex(c => edge.sourceHandle?.includes(c.id));
      const targetRow = target.data.columns.findIndex(c => edge.targetHandle?.includes(c.id));
      const route = routeErdEdge({ x: source.position.x + (sourceRight ? tableSize(source).width : 0), y: source.position.y + 63 + sourceRow * 38 },
        { x: target.position.x + (targetRight ? tableSize(target).width : 0), y: target.position.y + 63 + targetRow * 38 }, sourceRight, targetRight, tables);
      for (let i = 1; i < route.length; i++) expect(segmentBlocked(route[i - 1], route[i], tables), edge.id).toBe(false);
    }
  });
  it('keeps cycles separate from descendants, places multi-parent children to the right, and is deterministic', () => {
    const nodes = ['a', 'b', 'child', 'parent', 'junction', 'standalone'].map(id => node(id));
    const edges = [['a', 'b'], ['b', 'a'], ['child', 'a'], ['junction', 'child'], ['junction', 'parent'], ['parent', 'parent']]
      .map(([source, target]) => ({ id: `${source}:${target}`, source, target }));
    const laidOut = autoLayoutERD(nodes, edges);
    const at = (id: string) => laidOut.find(n => n.id === id)!.position;
    expect(at('child').x).toBeGreaterThan(at('a').x);
    expect(at('junction').x).toBeGreaterThan(at('parent').x);
    expect(at('junction').x).toBeGreaterThan(at('child').x);
    noOverlap(laidOut);
    const reversed = autoLayoutERD([...nodes].reverse(), [...edges].reverse());
    for (const n of laidOut) expect(reversed.find(r => r.id === n.id)!.position).toEqual(n.position);
  });

  it('uses measured sizes for long and wide tables without changing schema or the input', () => {
    const nodes = [node('parent', 0, 0, 600, 900), node('child', 0, 0, 800, 1200), node('sibling')];
    const edges = [{ id: 'e', source: 'child', target: 'parent' }, { id: 'e2', source: 'sibling', target: 'parent' }];
    const next = autoLayoutERD(nodes, edges);
    noOverlap(next);
    expect(next[1].position.x).toBeGreaterThanOrEqual(next[0].position.x + 600 + 32);
    expect(next[0].data).toEqual(nodes[0].data);
    expect(nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('SQL import and Auto Layout use the same positions and retain FK-to-PK semantics', () => {
    const parsed = parseSQLToERD('CREATE TABLE users (id BIGINT PRIMARY KEY); CREATE TABLE posts (id BIGINT PRIMARY KEY, user_id BIGINT, FOREIGN KEY (user_id) REFERENCES users(id));');
    expect(parsed.nodes.map(n => n.position)).toEqual(autoLayoutERD(parsed.nodes, parsed.edges).map(n => n.position));
    const edge = parsed.edges[0];
    expect(parsed.nodes.find(n => n.id === edge.source)!.data.name).toBe('posts');
    expect(edge.sourceHandle).toMatch(/-source-l$/);
    expect(edge.targetHandle).toMatch(/-target-r$/);
  });

  it('aligns handles without changing relation metadata or identity', () => {
    const edge = { id: 'e', source: 'child', target: 'parent', sourceHandle: 'col-fk-source', targetHandle: 'col-id-target', data: { on_delete: 'cascade' } };
    const [aligned] = alignErdHandles([node('parent'), node('child', 400)], [edge]);
    expect(aligned).toMatchObject({ ...edge, sourceHandle: 'col-fk-source-l', targetHandle: 'col-id-target-r' });
    expect(edge.sourceHandle).toBe('col-fk-source');
  });
});

describe('SH-004 table collision handling', () => {
  it('uses measured dimensions without rescanning every column on each routing call', () => {
    const measured = node('large');
    Object.defineProperty(measured.data, 'columns', { get: () => { throw new Error('unnecessary column scan'); } });
    expect(tableSize(measured)).toEqual({ width: 220, height: 150 });
  });
  it('does not rearrange a DB Client catalog on initial measurement, but constrains a real drag', () => {
    const nodes = Array.from({ length: 100 }, (_, i) => node(String(i), (i % 4) * 240, Math.floor(i / 4) * 200));
    const measurements = nodes.map(n => ({ type: 'dimensions' as const, id: n.id, dimensions: { width: 350, height: 800 } }));
    expect(constrainDbClientChanges(measurements, nodes)).toBe(measurements);
    const small = [node('fixed', 0, 0), node('moved', 400, 0)];
    const drag = [{ type: 'position' as const, id: 'moved', position: { x: 5, y: 5 }, dragging: true }];
    noOverlap(applyNodeChanges(constrainDbClientChanges(drag, small), small));
  });
  it('separates a whole dragged group without moving other tables or changing group offsets', () => {
    const initial = [node('fixed', 100, 100), node('a', 500, 100), node('b', 500, 350)];
    const changes = [{ type: 'position' as const, id: 'a', position: { x: 120, y: 110 }, dragging: true },
      { type: 'position' as const, id: 'b', position: { x: 120, y: 360 }, dragging: true }];
    const next = applyNodeChanges(constrainTableChanges(changes, initial), initial);
    noOverlap(next);
    expect(next[0]).toBe(initial[0]);
    expect(next[2].position.y - next[1].position.y).toBe(250);
    expect(next[1].dragging).toBe(true);
  });

  it('handles measured growth, repeated insertions and unchanged non-overlapping canvases', () => {
    const nodes = [node('a', 0, 0), node('b', 0, 220)];
    const changes = [{ type: 'dimensions' as const, id: 'a', dimensions: { width: 600, height: 600 } }];
    const next = applyNodeChanges(constrainTableChanges(changes, nodes), nodes);
    expect(tableSize(next[0]).height).toBe(600);
    noOverlap(next);
    expect(separateTables(next)).toBe(next);
    noOverlap(separateTables(Array.from({ length: 30 }, (_, i) => node(String(i)))));
  });
});

describe('SH-004 orthogonal routing', () => {
  it('still routes a multi-turn corridor when no single boundary lane can connect the endpoints', () => {
    const walls = [
      { x: 0, y: 0, width: 1000, height: 20 }, { x: 0, y: 380, width: 1000, height: 20 },
      { x: 0, y: 0, width: 20, height: 400 }, { x: 980, y: 0, width: 20, height: 400 },
      { x: 250, y: 0, width: 50, height: 300 }, { x: 550, y: 100, width: 50, height: 300 },
    ];
    const points = routeErdEdge({ x: 100, y: 50 }, { x: 900, y: 350 }, true, false, walls);
    expect(points.length).toBeGreaterThan(6);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].x === points[i - 1].x || points[i].y === points[i - 1].y).toBe(true);
      expect(segmentBlocked(points[i - 1], points[i], walls)).toBe(false);
    }
  });
  it('uses live endpoint bounds during drag instead of detouring around their previous position', () => {
    const settled = [{ id: 'source', x: 0, y: 0, width: 220, height: 150 },
      { id: 'target', x: 500, y: 0, width: 220, height: 150 }];
    const moved = { ...settled[0], x: -120 };
    const obstacles = edgeRoutingObstacles(settled, [moved, settled[1]]);
    const route = routeErdEdge({ x: 106, y: 70 }, { x: 494, y: 70 }, true, false, obstacles);
    expect(route.every(p => p.y === 70)).toBe(true);
    expect(obstacles[0]).toBe(moved);
    expect(obstacles[1]).toBe(settled[1]);
    expect(settled[0].x).toBe(0);
    for (let i = 1; i < route.length; i++) expect(segmentBlocked(route[i - 1], route[i], obstacles)).toBe(false);
  });

  it('updates both endpoints for multi-drag but leaves unrelated obstacles settled', () => {
    const settled = [{ id: 'source', x: 0, y: 0, width: 220, height: 150 },
      { id: 'target', x: 500, y: 0, width: 220, height: 150 },
      { id: 'other', x: 800, y: 0, width: 220, height: 150 }];
    const endpoints = settled.slice(0, 2).map(t => ({ ...t, x: t.x - 120, y: 80 }));
    const obstacles = edgeRoutingObstacles(settled, endpoints);
    expect(obstacles.slice(0, 2)).toEqual(endpoints);
    expect(obstacles[2]).toBe(settled[2]);
    const route = routeErdEdge({ x: 106, y: 150 }, { x: 374, y: 150 }, true, false, obstacles);
    expect(route.every(p => p.y === 150)).toBe(true);
  });

  it('routes around an intervening table and stays orthogonal', () => {
    const obstacles = [{ x: 0, y: 0, width: 220, height: 150 }, { x: 350, y: -50, width: 250, height: 250 }, { x: 700, y: 0, width: 220, height: 150 }];
    const points = routeErdEdge({ x: 220, y: 70 }, { x: 700, y: 70 }, true, false, obstacles);
    expect(points.length).toBeGreaterThan(2);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].x === points[i - 1].x || points[i].y === points[i - 1].y).toBe(true);
      expect(segmentBlocked(points[i - 1], points[i], obstacles)).toBe(false);
    }
  });

  it('routes self-references outside the table', () => {
    const table = { x: 0, y: 0, width: 220, height: 200 };
    const points = routeErdEdge({ x: 220, y: 150 }, { x: 220, y: 70 }, true, true, [table]);
    for (let i = 1; i < points.length; i++) expect(segmentBlocked(points[i - 1], points[i], [table])).toBe(false);
    expect(points.some(p => p.x > 220)).toBe(true);
  });
});
