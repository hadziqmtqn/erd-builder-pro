import { describe, it, expect } from 'vitest';
import { autoLayoutERD } from '../autoLayoutERD';
import { Node, Edge } from '@xyflow/react';
import type { Entity, Column } from '@/types';

function makeNode(
  id: string,
  name: string,
  columns: Partial<Column>[] = [],
): Node<Entity> {
  return {
    id,
    type: 'entity',
    position: { x: 0, y: 0 },
    data: {
      id,
      name,
      x: 0,
      y: 0,
      color: '#6366f1',
      columns: columns.map((c, i) => ({
        id: `col-${i}`,
        name: `col_${i}`,
        type: 'BIGINT',
        is_pk: false,
        is_nullable: true,
        ...c,
      })) as Column[],
    },
  };
}

function makeEdge(
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string,
): Edge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    sourceHandle: sourceHandle || 'col-0-source',
    targetHandle: targetHandle || 'col-0-target',
    type: 'smoothstep',
  };
}

describe('autoLayoutERD', () => {
  it('returns empty array when no nodes given', () => {
    const result = autoLayoutERD([], []);
    expect(result).toEqual([]);
  });

  it('returns same reference when nodes is empty', () => {
    const empty: Node<Entity>[] = [];
    const result = autoLayoutERD(empty, []);
    expect(result).toBe(empty);
  });

  it('positions a single node at start coordinates', () => {
    const nodes = [makeNode('t1', 'users', [{ name: 'id', is_pk: true }])];
    const result = autoLayoutERD(nodes, []);

    expect(result).toHaveLength(1);
    expect(result[0].position.x).toBeGreaterThanOrEqual(50);
    expect(result[0].position.y).toBeGreaterThanOrEqual(50);
  });

  it('does not mutate original node positions', () => {
    const nodes = [makeNode('t1', 'users', [{ name: 'id' }])];
    const originalX = nodes[0].position.x;
    const originalY = nodes[0].position.y;

    autoLayoutERD(nodes, []);

    expect(nodes[0].position.x).toBe(originalX);
    expect(nodes[0].position.y).toBe(originalY);
  });

  it('places standalone tables (no FK) in layer 0', () => {
    const nodes = [
      makeNode('t1', 'users'),
      makeNode('t2', 'posts'),
    ];
    const result = autoLayoutERD(nodes, []);

    // All have same y if in same layer
    expect(result[0].position.y).toBe(result[1].position.y);
  });

  it('places dependent tables in a deeper layer', () => {
    const nodes = [
      makeNode('t1', 'users'),
      makeNode('t2', 'posts'),
    ];
    const edges = [makeEdge('t2', 't1')]; // posts → users (FK)

    const result = autoLayoutERD(nodes, edges);

    const usersNode = result.find(n => n.id === 't1')!;
    const postsNode = result.find(n => n.id === 't2')!;

    // posts references users → posts should be in a later layer (higher y)
    expect(postsNode.position.y).toBeGreaterThan(usersNode.position.y);
  });

  it('handles 3-level FK chain', () => {
    const nodes = [
      makeNode('t1', 'users'),
      makeNode('t2', 'posts'),
      makeNode('t3', 'comments'),
    ];
    const edges = [
      makeEdge('t2', 't1'), // posts → users
      makeEdge('t3', 't2'), // comments → posts
    ];

    const result = autoLayoutERD(nodes, edges);

    const usersNode = result.find(n => n.id === 't1')!;
    const postsNode = result.find(n => n.id === 't2')!;
    const commentsNode = result.find(n => n.id === 't3')!;

    // Layered: users (top) → posts (mid) → comments (bottom)
    expect(postsNode.position.y).toBeGreaterThan(usersNode.position.y);
    expect(commentsNode.position.y).toBeGreaterThan(postsNode.position.y);
  });

  it('sorts nodes alphabetically within each layer', () => {
    const nodes = [
      makeNode('t_z', 'zebra'),
      makeNode('t_a', 'alpha'),
      makeNode('t_m', 'mango'),
    ];
    const result = autoLayoutERD(nodes, []);

    // All in layer 0, sorted alphabetically left to right
    const alpha = result.find(n => n.id === 't_a')!;
    const mango = result.find(n => n.id === 't_m')!;
    const zebra = result.find(n => n.id === 't_z')!;

    expect(alpha.position.x).toBeLessThan(mango.position.x);
    expect(mango.position.x).toBeLessThan(zebra.position.x);
    // Same y since same layer
    expect(alpha.position.y).toBe(mango.position.y);
    expect(mango.position.y).toBe(zebra.position.y);
  });

  it('does not crash with circular FK references', () => {
    const nodes = [
      makeNode('t1', 'table_a'),
      makeNode('t2', 'table_b'),
    ];
    const edges = [
      makeEdge('t1', 't2'),
      makeEdge('t2', 't1'), // circular!
    ];

    const result = autoLayoutERD(nodes, edges);
    expect(result).toHaveLength(2);
    // Both should have valid numeric positions
    expect(typeof result[0].position.x).toBe('number');
    expect(typeof result[0].position.y).toBe('number');
    expect(typeof result[1].position.x).toBe('number');
    expect(typeof result[1].position.y).toBe('number');
  });

  it('does not crash with 50+ tables', () => {
    const nodes = Array.from({ length: 50 }, (_, i) =>
      makeNode(`t${i}`, `table_${i}`),
    );
    const result = autoLayoutERD(nodes, []);
    expect(result).toHaveLength(50);
    // All should have finite positions
    for (const node of result) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });

  it('adapts spacing to wider tables', () => {
    const manyCols = Array.from({ length: 20 }, (_, i) => ({
      name: `col_${i}`,
      type: 'VARCHAR(255)',
    }));
    const nodes = [makeNode('t1', 'wide_table', manyCols)];
    const result = autoLayoutERD(nodes, []);
    expect(result[0].position.x).toBeGreaterThanOrEqual(50);
    expect(result[0].position.y).toBeGreaterThanOrEqual(50);
  });

  it('preserves x position difference between sibling tables in same layer', () => {
    const nodes = [
      makeNode('t1', 'alpha'),
      makeNode('t2', 'beta'),
    ];
    const result = autoLayoutERD(nodes, []);
    const gap = Math.abs(result[1].position.x - result[0].position.x);
    expect(gap).toBeGreaterThanOrEqual(220); // at least BASE_TABLE_WIDTH
  });
});
