import { describe, expect, it } from 'vitest';
import { dbmlToERD } from '../dbml-converter';
import { mergeDBMLCanvas } from '../dbml-canvas-merge';
import { readPendingERDCanvas } from '../erd-draft-canvas';
import { hasViewportChanged } from '../erd-viewport';
import { canvasFingerprint } from '@/components/diagram/dbml-editor-utils';

describe('ERD canvas preservation', () => {
  const original = () => ({
    id: 'table-comment-anchor', type: 'entity', position: { x: 788, y: 314 },
    data: { id: 'table-comment-anchor', name: 'NewTable', x: 0, y: 0,
      color: '#6b7280', comment: 'Keep this note', note: 'Canvas note',
      columns: [{ id: 'column-anchor', name: 'id', type: 'BIGINT', is_pk: true, is_nullable: false }],
      constraints: [], indexes: [] },
  }) as any;

  it('preserves table/column identities and live coordinates despite parser name normalization', () => {
    const current = original();
    const parsed = dbmlToERD('Table NewTable {\n id bigint [pk, not null]\n}');
    const merged = mergeDBMLCanvas(parsed.nodes, parsed.edges, [current], []);
    expect(merged.nodes[0]).toMatchObject({
      id: current.id, position: { x: 788, y: 314 },
      data: { id: current.id, name: 'NewTable', comment: 'Keep this note', note: 'Canvas note',
        columns: [{ id: 'column-anchor' }] },
    });
    expect(current.position).toEqual({ x: 788, y: 314 });
  });

  it('preserves relationship comment anchors through a DBML round-trip', () => {
    const child = original();
    child.data.columns.push({ id: 'fk-column', name: 'user_id', type: 'BIGINT', is_nullable: false });
    const parent = { ...original(), id: 'users-anchor', data: { ...original().data, id: 'users-anchor', name: 'Users', columns: [{ id: 'users-id', name: 'id', type: 'BIGINT', is_pk: true }] } };
    const edge = { id: 'relationship-comment-anchor', source: child.id, target: parent.id, sourceHandle: 'col-fk-column-source-l', targetHandle: 'col-users-id-target-r', data: {} };
    const parsed = dbmlToERD('Table NewTable {\n id bigint [pk]\n user_id bigint\n}\nTable Users {\n id bigint [pk]\n}\nRef: NewTable.user_id > Users.id');
    const merged = mergeDBMLCanvas(parsed.nodes, parsed.edges, [child, parent] as any, [edge]);
    expect(merged.edges[0]).toMatchObject({ id: edge.id, source: child.id, target: parent.id, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle });
  });

  it('ignores layout and selection in the DBML schema fingerprint', () => {
    const node = original();
    const moved = { ...node, selected: true, position: { x: 20, y: 30 } };
    expect(canvasFingerprint([node], [])).toBe(canvasFingerprint([moved], []));
    expect(canvasFingerprint([node], [])).not.toBe(canvasFingerprint([{ ...node, data: { ...node.data, comment: 'Changed' } }], []));
  });

  it('keeps pending local canvas identities and coordinates ahead of server fetches', () => {
    const node = original();
    expect(readPendingERDCanvas({ sync_pending: true, data: JSON.stringify({ nodes: [node], edges: [] }) }))
      .toEqual({ nodes: [node], edges: [] });
    expect(readPendingERDCanvas({ sync_pending: false, data: JSON.stringify({ nodes: [node], edges: [] }) })).toBeNull();
    expect(readPendingERDCanvas({ sync_pending: true, data: '{bad' })).toBeNull();
  });

  it('does not mark an unchanged canvas click as a viewport edit', () => {
    const viewport = { x: -244, y: 62.5, zoom: 1 };
    expect(hasViewportChanged(viewport, { ...viewport })).toBe(false);
    expect(hasViewportChanged(viewport, { ...viewport, x: -200 })).toBe(true);
    expect(hasViewportChanged(viewport, { ...viewport, zoom: 0.8 })).toBe(true);
  });
});
