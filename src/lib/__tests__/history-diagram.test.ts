import { describe, expect, it } from 'vitest';
import { diagramSnapshotToCanvas } from '../history-diagram';

describe('diagramSnapshotToCanvas', () => {
  it('normalizes persisted ERD IDs and relationship metadata for the canvas', () => {
    const result = diagramSnapshotToCanvas({
      entities: [{ id: 1, name: 'users', x: 20, y: 30, columns: [{ id: 2, name: 'id', type: 'BIGINT' }] }],
      relationships: [{ id: 3, source_entity_id: 1, target_entity_id: 1, source_handle: 'col-2-source', target_handle: 'col-2-target', on_delete: 'CASCADE' }],
    });

    expect(result.nodes[0]).toMatchObject({ id: '1', position: { x: 20, y: 30 }, data: { id: '1', columns: [{ id: '2', _entity_id: '1' }] } });
    expect(result.edges[0]).toMatchObject({ id: '3', source: '1', target: '1', sourceHandle: 'col-2-source', data: { on_delete: 'CASCADE' } });
  });
});
