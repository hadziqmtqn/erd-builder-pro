import { describe, expect, it } from 'vitest';
import { edgeToRelationship } from '../diagram-payload';

describe('edgeToRelationship', () => {
  it('keeps foreign-key metadata in the sync payload', () => {
    expect(edgeToRelationship({
      id: 'fk-1',
      source: 'posts',
      target: 'users',
      sourceHandle: 'col-posts.user_id-source',
      targetHandle: 'col-users.id-target',
      label: 'many-to-one',
      data: { on_delete: 'CASCADE', on_update: 'RESTRICT', constraint_name: 'posts_user_id_fk' },
    })).toMatchObject({
      source_column_id: 'posts.user_id',
      target_column_id: 'users.id',
      on_delete: 'CASCADE',
      on_update: 'RESTRICT',
      constraint_name: 'posts_user_id_fk',
    });
  });
});
