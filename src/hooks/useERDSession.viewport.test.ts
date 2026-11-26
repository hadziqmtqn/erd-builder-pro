import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same hook harness as src/lib/__tests__/erd-drag-overlap.test.ts: run the hook without a DOM runtime.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, setters: [] as ReturnType<typeof vi.fn>[] }));
const flow = vi.hoisted(() => ({ setViewport: vi.fn() }));
const storage = vi.hoisted(() => ({ resource: null as unknown }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useRef: (current: unknown) => {
    const index = hooks.cursor++;
    return hooks.slots[index] ??= { current };
  },
  useCallback: (callback: unknown) => callback,
  useEffect: () => {},
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial;
    const setter = vi.fn();
    hooks.setters.push(setter);
    return [hooks.slots[index], setter];
  },
}));
vi.mock('@xyflow/react', async original => ({
  ...await original<typeof import('@xyflow/react')>(),
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
  useReactFlow: () => ({ setViewport: flow.setViewport, getNodes: () => [], getEdges: () => [] }),
}));
vi.mock('@/contexts/FileSessionContext', () => ({ useEditorActive: () => () => true }));
vi.mock('../lib/localPersistence', () => ({ localPersistence: {
  getDraft: async () => null,
  getResource: async () => storage.resource,
  getAllResources: async () => [],
} }));

import { useERDSession } from './useERDSession';

const DIAGRAM = { id: 4, uid: 'erd-1', name: 'Shop', entities: [], relationships: [], viewport_x: 0, viewport_y: 0, viewport_zoom: 1 };
const USER_INPUT = { type: 'mouseup' } as never;
const PANNED = { x: -320, y: 140, zoom: 0.75 };

function session() {
  hooks.cursor = 0;
  hooks.setters = [];
  return useERDSession(false, true, true, () => {});
}

beforeEach(() => {
  hooks.slots = [];
  flow.setViewport.mockReset();
  storage.resource = DIAGRAM;
  const items = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
  });
});

describe('BUG-084 panning or zooming the ERD canvas', () => {
  it('never marks the diagram for saving', async () => {
    const erd = session();
    await erd.handleDiagramSelect('erd-1', vi.fn(), { silent: true });
    const settersBefore = hooks.setters.map(setter => setter.mock.calls.length);
    erd.onMoveEnd(USER_INPUT, PANNED);
    expect(hooks.setters.map(setter => setter.mock.calls.length)).toEqual(settersBefore);
  });

  it('restores the viewer\'s own viewport when the diagram is opened again', async () => {
    const erd = session();
    await erd.handleDiagramSelect('erd-1', vi.fn(), { silent: true });
    expect(flow.setViewport).toHaveBeenLastCalledWith({ x: 0, y: 0, zoom: 1 }, { duration: 0 });
    erd.onMoveEnd(USER_INPUT, PANNED);

    const reopened = session();
    await reopened.handleDiagramSelect('erd-1', vi.fn(), { silent: true });
    expect(flow.setViewport).toHaveBeenLastCalledWith(PANNED, { duration: 0 });
  });

  it('ignores a programmatic viewport change, which has no input event', async () => {
    const erd = session();
    await erd.handleDiagramSelect('erd-1', vi.fn(), { silent: true });
    erd.onMoveEnd(null, PANNED);
    const reopened = session();
    await reopened.handleDiagramSelect('erd-1', vi.fn(), { silent: true });
    expect(flow.setViewport).toHaveBeenLastCalledWith({ x: 0, y: 0, zoom: 1 }, { duration: 0 });
  });
});
