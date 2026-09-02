import { describe, expect, it } from 'vitest';
import { canvasLayout, dbSchemaToCanvas, keepsDbRelation } from '../db-client-schema';

describe('dbSchemaToCanvas', () => {
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
    expect(edges[0]).toMatchObject({ sourceHandle: 'col-posts.user_id-source', targetHandle: 'col-users.id-target' });
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
