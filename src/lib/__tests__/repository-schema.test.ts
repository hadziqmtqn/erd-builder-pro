import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { alignRepositorySchema, parseRepositorySchema } from '../repository-schema';

describe('repository schema identity', () => {
  it('keeps canvas IDs, positions, and connector sides for matching schema objects', () => {
    const currentNodes: Node<Entity>[] = [
      { id: 'users-node', type: 'entity', position: { x: 20, y: 40 }, data: { id: 'users-node', name: 'users', x: 20, y: 40, color: '#123', columns: [{ id: 'users-id', name: 'id', type: 'BIGINT', is_pk: true, is_nullable: false }] } },
      { id: 'posts-node', type: 'entity', position: { x: 500, y: 40 }, data: { id: 'posts-node', name: 'posts', x: 500, y: 40, color: '#456', columns: [{ id: 'posts-id', name: 'id', type: 'BIGINT', is_pk: true, is_nullable: false }, { id: 'posts-user-id', name: 'user_id', type: 'BIGINT', is_pk: false, is_nullable: false }] } },
    ];
    const currentEdges: Edge[] = [{ id: 'edge-existing', source: 'posts-node', target: 'users-node', sourceHandle: 'col-posts-user-id-source-l', targetHandle: 'col-users-id-target-r', type: 'smoothstep' }];
    const parsed = parseRepositorySchema('dbml', [{ path: 'schema.dbml', content: `Table users {
  id BIGINT [pk]
}
Table posts {
  id BIGINT [pk]
  user_id BIGINT [not null]
}
Ref: posts.user_id > users.id` }]);
    const aligned = alignRepositorySchema(currentNodes, currentEdges, parsed.nodes, parsed.edges);

    expect(aligned.nodes.find(node => node.data.name === 'users')).toMatchObject({ id: 'users-node', position: { x: 20, y: 40 } });
    expect(aligned.nodes.find(node => node.data.name === 'posts')?.data.columns.find(column => column.name === 'user_id')?.id).toBe('posts-user-id');
    expect(aligned.edges[0]).toMatchObject({ id: 'edge-existing', sourceHandle: 'col-posts-user-id-source-l', targetHandle: 'col-users-id-target-r' });
  });

  it('resolves Prisma-style ALTER columns and foreign keys across migrations', () => {
    const result = parseRepositorySchema('sql', [
      { path: '001/migration.sql', content: 'CREATE TABLE "users" ("id" TEXT NOT NULL, CONSTRAINT "users_pkey" PRIMARY KEY ("id")); CREATE TABLE "posts" ("id" TEXT NOT NULL, CONSTRAINT "posts_pkey" PRIMARY KEY ("id"));' },
      { path: '002/migration.sql', content: 'ALTER TABLE "posts" ADD COLUMN "user_id" TEXT; ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;' },
    ]);
    expect(result.nodes.find(node => node.data.name === 'posts')?.data.columns.map(column => column.name)).toContain('user_id');
    expect(result.edges).toHaveLength(1);
  });
});
