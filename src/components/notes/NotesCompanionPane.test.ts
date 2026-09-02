import { MarkerType, type Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { styleCompanionEdges } from './NotesCompanionPane';

describe('Notes companion ERD edges', () => {
  it('uses the main ERD edge style and selection state', () => {
    const [edge] = styleCompanionEdges([{ id: 'e1', source: 'users', target: 'roles', type: 'default' } as Edge], 'users');

    expect(edge).toMatchObject({
      type: 'smoothstep',
      className: 'edge-animated-active',
      style: { stroke: 'var(--edge-selected)', strokeWidth: 2 },
      markerEnd: { type: MarkerType.Arrow, color: 'var(--edge-selected)', width: 10, height: 10 },
    });
  });
});
