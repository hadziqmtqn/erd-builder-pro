import { describe, expect, it } from 'vitest';
import { canvasLayout, dbSchemaToCanvas, keepsDbRelation } from '../db-client-schema';
import { computeSchemaDiff } from '../schema-diff';

describe('dbSchemaToCanvas', () => {
  it('syncs an unchanged schema without false FK changes and preserves routing metadata', () => {
    const schema = [
      { table_name: 'users', columns: [{ name: 'id', type: 'bigint', is_pk: true }], foreign_keys: [] },
      { table_name: 'posts', columns: [{ name: 'user_id', type: 'bigint' }], foreign_keys: [{ column: 'user_id', ref_table: 'users', ref_column: 'id', constraint_name: 'posts_user_fk', on_delete: 'CASCADE', on_update: 'NO ACTION' }] },
    ];
    const before = dbSchemaToCanvas(schema, null);
    const layout = canvasLayout(before.nodes, { x: 5, y: 6, zoom: 0.8 }, {}, before.edges);
    const after = dbSchemaToCanvas(schema, layout);
    expect(computeSchemaDiff(before.nodes, before.edges, after.nodes, after.edges).changes).toEqual([]);
    expect(after.nodes.map(node => node.position)).toEqual(before.nodes.map(node => node.position));
    expect(after.edges[0].data).toMatchObject({ constraint_name: 'posts_user_fk', on_delete: 'CASCADE', on_update: 'NO ACTION' });
    const changed = structuredClone(schema);
    changed[1].foreign_keys[0].on_delete = 'RESTRICT';
    const proposal = dbSchemaToCanvas(changed, layout);
    expect(computeSchemaDiff(before.nodes, before.edges, proposal.nodes, proposal.edges).changes).toMatchObject([{ kind: 'relation', state: 'modified' }]);
  });

  it('ignores foreign keys whose table/column is outside the imported schema', () => {
    const canvas = dbSchemaToCanvas([{ table_name: 'posts', columns: [{ name: 'user_id', type: 'bigint' }], foreign_keys: [
      { column: 'user_id', ref_table: 'private.users', ref_column: 'id' },
      { column: 'missing', ref_table: 'posts', ref_column: 'user_id' },
    ] }], null);
    expect(canvas.edges).toEqual([]);
  });
  it('preserves saved positions on reopen instead of applying a new layout', () => {
    const { nodes } = dbSchemaToCanvas([
      { table_name: 'a', columns: [{ name: 'id', type: 'integer' }], foreign_keys: [] },
      { table_name: 'b', columns: [{ name: 'id', type: 'integer' }], foreign_keys: [] },
    ], { nodes: { a: { x: 12, y: 34 }, b: { x: 280, y: 34 } } });
    expect(nodes.map(n => n.position)).toEqual([{ x: 12, y: 34 }, { x: 280, y: 34 }]);
  });
  it('marks only foreign-key endpoints needed by the read-only canvas', () => {
    const { nodes, edges } = dbSchemaToCanvas([
      { table_name: 'users', columns: [{ name: 'id', type: 'integer' }, { name: 'name', type: 'text' }], foreign_keys: [] },
      { table_name: 'posts', columns: [{ name: 'id', type: 'integer' }, { name: 'user_id', type: 'integer' }], foreign_keys: [{ column: 'user_id', ref_table: 'users', ref_column: 'id' }] },
    ], null);
    const users = nodes.find(node => node.id === 'users')!;
    const posts = nodes.find(node => node.id === 'posts')!;

    expect(users.data.columns.find(column => column.name === 'id')).toMatchObject({ _is_ref: true, _is_fk: false });
    expect(users.data.columns.find(column => column.name === 'name')).toMatchObject({ _is_ref: false, _is_fk: false });
    expect(posts.data.columns.find(column => column.name === 'user_id')).toMatchObject({ _is_ref: false, _is_fk: true });
    expect(edges[0]).toMatchObject({ sourceHandle: 'col-posts.user_id-source-l', targetHandle: 'col-users.id-target-r' });
  });

  it('restores a connector side without changing its relation endpoints', () => {
    const schema = [
      { table_name: 'users', columns: [{ name: 'id', type: 'integer' }], foreign_keys: [] },
      { table_name: 'posts', columns: [{ name: 'user_id', type: 'integer' }], foreign_keys: [{ column: 'user_id', ref_table: 'users', ref_column: 'id' }] },
    ];
    const initial = dbSchemaToCanvas(schema, null);
    const flipped = initial.edges.map(edge => ({
      ...edge,
      sourceHandle: 'col-posts.user_id-source-l',
      targetHandle: 'col-users.id-target-r',
    }));
    const layout = canvasLayout(initial.nodes, { x: 0, y: 0, zoom: 1 }, {}, flipped);
    const restored = dbSchemaToCanvas(schema, layout);

    expect(restored.edges[0]).toMatchObject({
      source: 'posts', target: 'users',
      sourceHandle: 'col-posts.user_id-source-l', targetHandle: 'col-users.id-target-r',
    });
    expect(keepsDbRelation(initial.edges[0], restored.edges[0])).toBe(true);
    expect(keepsDbRelation(initial.edges[0], { ...restored.edges[0], targetHandle: 'col-users.other-target' })).toBe(false);
  });
});
