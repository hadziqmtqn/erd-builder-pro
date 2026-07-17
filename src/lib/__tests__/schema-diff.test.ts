import { describe, it, expect } from 'vitest';
import { computeSchemaDiff } from '../schema-diff';
import { Node, Edge } from '@xyflow/react';
import type { Entity, Column } from '@/types';

function makeNode(name: string, cols: string[]): Node<Entity> {
  return {
    id: name.toLowerCase(),
    type: 'entity' as const,
    position: { x: 0, y: 0 },
    data: {
      id: name.toLowerCase(),
      name,
      x: 0,
      y: 0,
      color: '#6366f1',
      columns: cols.map((c, i) => ({
        id: `${i}`,
        name: c,
        type: 'BIGINT',
        is_pk: false,
        is_nullable: true,
      }) as Column),
    },
  };
}

function makeEdge(source: string, target: string): Edge {
  return {
    id: `${source}->${target}`,
    source: source.toLowerCase(),
    target: target.toLowerCase(),
    sourceHandle: 'col-0-source',
    targetHandle: 'col-0-target',
    type: 'smoothstep' as const,
  };
}

describe('computeSchemaDiff', () => {
  it('returns no changes when current and proposed are identical', () => {
    const nodes = [makeNode('users', ['id', 'name'])];
    const edges: Edge[] = [];

    const result = computeSchemaDiff(nodes, edges, nodes, edges);
    expect(result.newCount).toBe(0);
    expect(result.modifiedCount).toBe(0);
    expect(result.deletedCount).toBe(0);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].data.diffState).toBeUndefined();
  });

  it('detects new tables', () => {
    const current = [makeNode('users', ['id'])];
    const proposed = [makeNode('users', ['id']), makeNode('posts', ['id', 'title'])];

    const result = computeSchemaDiff(current, [], proposed, []);
    expect(result.newCount).toBe(1);
    expect(result.deletedCount).toBe(0);
    expect(result.nodes.find(n => n.data.name === 'posts')?.data.diffState).toBe('new');
  });

  it('detects deleted tables', () => {
    const current = [makeNode('users', ['id']), makeNode('posts', ['id'])];
    const proposed = [makeNode('users', ['id'])];

    const result = computeSchemaDiff(current, [], proposed, []);
    expect(result.deletedCount).toBe(1);
    expect(result.nodes.find(n => n.data.name === 'posts')?.data.diffState).toBe('deleted');
  });

  it('detects modified tables (added column)', () => {
    const current = [makeNode('users', ['id'])];
    const proposed = [makeNode('users', ['id', 'name'])];

    const result = computeSchemaDiff(current, [], proposed, []);
    expect(result.modifiedCount).toBe(1);
    const modified = result.nodes.find(n => n.data.name === 'users')!;
    expect(modified.data.diffState).toBe('modified');
  });

  it('detects modified columns within a table', () => {
    const current = [makeNode('users', ['id', 'name'])];
    const proposed = [makeNode('users', ['id', 'full_name'])];

    const result = computeSchemaDiff(current, [], proposed, []);
    expect(result.modifiedCount).toBe(1);
    const userNode = result.nodes.find(n => n.data.name === 'users')!;
    const cols = userNode.data.columns;
    const nameCol = cols.find(c => c.name === 'name');
    const fnCol = cols.find(c => c.name === 'full_name');
    expect((nameCol as any).diffState).toBe('deleted');
    expect((fnCol as any).diffState).toBe('new');
  });

  it('returns proposed edges as-is', () => {
    const current = [makeNode('users', ['id']), makeNode('posts', ['id'])];
    const proposed = [makeNode('users', ['id']), makeNode('posts', ['id'])];
    const proposedEdges = [makeEdge('users', 'posts')];

    const result = computeSchemaDiff(current, [], proposed, proposedEdges);
    expect(result.edges).toHaveLength(1);
  });

  it('handles empty current and proposed', () => {
    const result = computeSchemaDiff([], [], [], []);
    expect(result.newCount).toBe(0);
    expect(result.modifiedCount).toBe(0);
    expect(result.deletedCount).toBe(0);
    expect(result.nodes).toHaveLength(0);
  });

  it('matches tables case-insensitively', () => {
    const current = [makeNode('Users', ['id'])];
    const proposed = [makeNode('users', ['id', 'name'])];

    const result = computeSchemaDiff(current, [], proposed, []);
    expect(result.modifiedCount).toBe(1);
    expect(result.newCount).toBe(0);
    expect(result.deletedCount).toBe(0);
  });
});
