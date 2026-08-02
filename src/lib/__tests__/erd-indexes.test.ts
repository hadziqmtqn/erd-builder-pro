import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { buildErdIndexes, erdColumnKey, erdSourceColumnKey } from '../erd-indexes';

const node = (id: string, columns: string[]): Node<Entity> => ({
  id,
  type: 'entity',
  position: { x: 0, y: 0 },
  data: { id, name: id, x: 0, y: 0, color: '#000', columns: columns.map(name => ({ id: name, name, type: 'int', is_pk: name === 'id', is_nullable: false })) },
});

describe('buildErdIndexes', () => {
  it('indexes nodes, columns, relations, and source FK columns', () => {
    const nodes = [node('users', ['id']), node('posts', ['id', 'user_id'])];
    const edge: Edge = { id: 'e1', source: 'posts', target: 'users', sourceHandle: 'col-user_id-source', targetHandle: 'col-id-target' };
    const indexes = buildErdIndexes(nodes, [edge]);

    expect(indexes.nodesById.get('users')).toBe(nodes[0]);
    expect(indexes.columnsByNodeAndId.get(erdColumnKey('posts', 'user_id'))?.name).toBe('user_id');
    expect(indexes.edgesByRelationKey.size).toBe(1);
    expect(indexes.edgesBySourceColumnName.get(erdSourceColumnKey('posts', 'user_id'))).toEqual([edge]);
  });
});
