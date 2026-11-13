import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same hook harness as src/hooks/useStableHandlers.test.ts: run useUndoRedo without a DOM runtime.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useRef: (current: unknown) => {
    const index = hooks.cursor++;
    return hooks.slots[index] ??= { current };
  },
  useCallback: (callback: unknown) => callback,
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.slots[index], vi.fn()];
  },
}));

import { applyNodeChanges, type Node, type NodeChange } from '@xyflow/react';
import type { Entity } from '@/types';
import { constrainTableChanges, tablesOverlap } from '../erd-geometry';
import { useUndoRedo } from '@/hooks/useUndoRedo';

const node = (id: string, x: number, y: number): Node<Entity> => ({
  id, position: { x, y }, measured: { width: 220, height: 150 },
  data: { id, name: id, x, y, color: '#666', columns: [{ id: 'id', name: 'id', type: 'BIGINT', is_pk: true, is_nullable: false }] },
});
const move = (id: string, x: number, y: number, dragging: boolean): NodeChange<Node<Entity>> =>
  ({ type: 'position', id, position: { x, y }, dragging });
const apply = (changes: NodeChange<Node<Entity>>[], nodes: Node<Entity>[]) => applyNodeChanges(constrainTableChanges(changes, nodes), nodes);
const overlapsAny = (nodes: Node<Entity>[]) => nodes.some((a, i) => nodes.slice(i + 1).some(b => tablesOverlap(a, b)));

beforeEach(() => { hooks.slots = []; });

describe('BUG-043 drag over crowded tables', () => {
  // A row of tables packed 40 px apart, and one table being dragged across them.
  const crowd = () => [node('a', 0, 0), node('b', 260, 0), node('c', 520, 0), node('moved', 260, 400)];

  it('keeps the dragged table under the cursor while the mouse is down, even over other tables', () => {
    const frames = [[120, 300], [140, 80], [300, 20], [500, 10]] as const;
    let nodes = crowd();
    for (const [x, y] of frames) {
      const changes = [move('moved', x, y, true)];
      expect(constrainTableChanges(changes, nodes)).toBe(changes);
      nodes = apply(changes, nodes);
      expect(nodes[3].position).toEqual({ x, y });
    }
    expect(overlapsAny(nodes)).toBe(true);
    expect(nodes.slice(0, 3)).toEqual(crowd().slice(0, 3));
  });

  it('separates the table on the drop without moving any other table', () => {
    const initial = crowd();
    const dropped = apply([move('moved', 300, 20, false)], apply([move('moved', 300, 20, true)], initial));
    expect(overlapsAny(dropped)).toBe(false);
    expect(dropped.slice(0, 3)).toEqual(initial.slice(0, 3));
    expect(dropped[3].position).not.toEqual({ x: 300, y: 20 });
  });

  it('still separates position changes that are not part of a drag', () => {
    const next = apply([{ type: 'position', id: 'moved', position: { x: 300, y: 20 } }], crowd());
    expect(overlapsAny(next)).toBe(false);
  });

  it('undoes the whole drag in one step and redoes the separated drop position', () => {
    const history = (() => { hooks.cursor = 0; return useUndoRedo(); })();
    const initial = crowd();
    // ERDView takes the only snapshot when the drag starts (handleNodeDragStartLocal).
    history.takeSnapshot(initial, []);
    let nodes = initial;
    for (const [x, y] of [[200, 200], [280, 60], [300, 20]] as const) nodes = apply([move('moved', x, y, true)], nodes);
    nodes = apply([move('moved', 300, 20, false)], nodes);
    const separated = nodes[3].position;
    expect(overlapsAny(nodes)).toBe(false);

    const undone = history.undo(nodes, [])!;
    expect(undone.nodes.map(n => n.position)).toEqual(initial.map(n => n.position));
    expect(history.undo(undone.nodes, [])).toBeNull();
    const redone = history.redo(undone.nodes, [])!;
    expect(redone.nodes[3].position).toEqual(separated);
  });
});
