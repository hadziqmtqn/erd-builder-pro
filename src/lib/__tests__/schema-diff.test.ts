import { describe, it, expect } from 'vitest';
import { computeSchemaDiff } from '../schema-diff';
import { mergeSchemaChanges } from '../schema-merge';
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

function makeEdge(source: string, target: string, sourceColumn = 0, targetColumn = 0): Edge {
  return {
    id: `${source}:${sourceColumn}->${target}:${targetColumn}`,
    source: source.toLowerCase(),
    target: target.toLowerCase(),
    sourceHandle: `col-${sourceColumn}-source`,
    targetHandle: `col-${targetColumn}-target`,
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
    expect(result.newCount).toBe(1);
    const modified = result.nodes.find(n => n.data.name === 'users')!;
    expect(modified.data.diffState).toBe('modified');
  });

  it('detects modified columns within a table', () => {
    const current = [makeNode('users', ['id', 'name'])];
    const proposed = [makeNode('users', ['id', 'full_name'])];

    const result = computeSchemaDiff(current, [], proposed, []);
    expect(result.newCount).toBe(1);
    expect(result.deletedCount).toBe(1);
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

  it('keeps separate FK relations from one table to the same target table', () => {
    const current = [makeNode('m_agama', ['id']), makeNode('biodata', ['agama_ayah', 'agama_ibu'])];
    const proposed = [makeNode('m_agama', ['id']), makeNode('biodata', ['agama_ayah', 'agama_ibu'])];
    const edges = [makeEdge('biodata', 'm_agama', 0, 0), makeEdge('biodata', 'm_agama', 1, 0)];

    const result = computeSchemaDiff(current, edges, proposed, edges);
    expect(result.edges).toHaveLength(2);
    expect(result.changes.filter(change => change.kind === 'relation')).toHaveLength(0);
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
    expect(result.newCount).toBe(1);
    expect(result.deletedCount).toBe(0);
  });

  it('detects enum and persisted column metadata changes', () => {
    const current = [makeNode('users', ['role'])];
    const proposed = [makeNode('users', ['role'])];
    Object.assign(current[0].data.columns[0], { enum_name: 'users_role', enum_values: 'member,admin', comment: 'old', max_length: 20 });
    Object.assign(proposed[0].data.columns[0], { enum_name: 'account_role', enum_values: 'member,admin,owner', comment: 'new', max_length: 40 });

    const result = computeSchemaDiff(current, [], proposed, []);
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'column:users.role', kind: 'column', state: 'modified' }),
    ]));
  });

  it('detects and merges defaults, uniqueness, indexes, and constraints', () => {
    const current = [makeNode('users', ['id', 'email'])];
    const proposed = [makeNode('users', ['id', 'email'])];
    Object.assign(proposed[0].data.columns[1], { default_value: "'unknown'", is_unique: true });
    proposed[0].data.indexes = [{ id: 'idx', entity_id: 'users', name: 'users_email_idx', column_ids: ['1'], is_unique: true }];
    proposed[0].data.constraints = [{ id: 'check', entity_id: 'users', kind: 'check', expression: 'email <> \'\'' }];

    const diff = computeSchemaDiff(current, [], proposed, []);
    expect(diff.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'column:users.email', state: 'modified' }),
      expect.objectContaining({ id: 'table:users', state: 'modified' }),
    ]));

    const merged = mergeSchemaChanges(current, [], proposed, [], diff, diff.changes.map(change => change.id));
    expect(merged.nodes[0].data.columns[1]).toMatchObject({ default_value: "'unknown'", is_unique: true });
    expect(merged.nodes[0].data.indexes?.[0].name).toBe('users_email_idx');
    expect(merged.nodes[0].data.constraints?.[0].kind).toBe('check');
  });

  it('matches legacy-ID relationships by table and column names', () => {
    const current = [makeNode('users', ['id']), makeNode('posts', ['user_id'])];
    const proposed = [makeNode('users', ['id']), makeNode('posts', ['user_id'])];
    current[0].id = 'old-users'; current[1].id = 'old-posts';
    current[0].data.columns[0].id = 'old-user-id'; current[1].data.columns[0].id = 'old-post-user-id';
    proposed[0].id = 'new-users'; proposed[1].id = 'new-posts';
    proposed[0].data.columns[0].id = 'new-user-id'; proposed[1].data.columns[0].id = 'new-post-user-id';
    const oldEdge: Edge = { id: 'old', source: 'old-posts', target: 'old-users', sourceHandle: 'col-old-post-user-id-source', targetHandle: 'col-old-user-id-target', label: '1:N' };
    const newEdge: Edge = { id: 'new', source: 'new-posts', target: 'new-users', sourceHandle: 'col-new-post-user-id-source', targetHandle: 'col-new-user-id-target', label: '1:N' };

    expect(computeSchemaDiff(current, [oldEdge], proposed, [newEdge]).changes.filter(change => change.kind === 'relation')).toEqual([]);
    newEdge.data = { on_delete: 'cascade' };
    expect(computeSchemaDiff(current, [oldEdge], proposed, [newEdge]).changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'relation', state: 'modified', id: 'relation:posts.user_id>users.id' }),
    ]));
  });

  it('merges only approved column and relationship changes', () => {
    const current = [makeNode('users', ['id']), makeNode('posts', ['user_id'])];
    const proposed = [makeNode('users', ['id']), makeNode('posts', ['user_id'])];
    proposed[1].data.columns[0].is_nullable = false;
    const currentEdge = makeEdge('posts', 'users');
    currentEdge.label = '1:N';
    const proposedEdge = makeEdge('posts', 'users');
    proposedEdge.label = '1:1';
    const diff = computeSchemaDiff(current, [currentEdge], proposed, [proposedEdge]);
    const approved = diff.changes.filter(change => change.kind === 'column').map(change => change.id);
    const unchanged = mergeSchemaChanges(current, [currentEdge], proposed, [proposedEdge], diff, approved);
    expect(unchanged.nodes.find(node => node.data.name === 'posts')?.data.columns[0].is_nullable).toBe(false);
    expect(unchanged.edges[0].label).toBe('1:N');

    const merged = mergeSchemaChanges(current, [currentEdge], proposed, [proposedEdge], diff, diff.changes.map(change => change.id));
    expect(merged.edges[0].label).toBe('1:1');
  });

  it('drops dependent relationships when an approved table deletion removes an endpoint', () => {
    const current = [makeNode('users', ['id']), makeNode('posts', ['user_id'])];
    const proposed = [makeNode('users', ['id'])];
    const edge = makeEdge('posts', 'users');
    const diff = computeSchemaDiff(current, [edge], proposed, []);
    const merged = mergeSchemaChanges(current, [edge], proposed, [], diff, ['table:posts']);

    expect(merged.nodes.map(node => node.data.name)).toEqual(['users']);
    expect(merged.edges).toEqual([]);
  });
});
