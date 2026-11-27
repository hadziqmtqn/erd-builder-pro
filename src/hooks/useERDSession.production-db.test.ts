import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Same hook harness as useERDSession.viewport.test.ts: run the hook without a DOM runtime.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
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
    return [hooks.slots[index], vi.fn()];
  },
}));
vi.mock('@xyflow/react', async original => ({
  ...await original<typeof import('@xyflow/react')>(),
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
  useReactFlow: () => ({ setViewport: vi.fn(), getNodes: () => [], getEdges: () => [] }),
}));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/contexts/FileSessionContext', () => ({ useEditorActive: () => () => true }));
vi.mock('../lib/localPersistence', () => ({ localPersistence: {
  getDraft: async () => null,
  getResource: async () => null,
  getAllResources: async () => [],
} }));

import { useERDSession } from './useERDSession';

// A DB Client ("production DB") diagram stores table positions; its tables come from the live schema.
const DB_CLIENT_DIAGRAM = {
  id: 7,
  uid: 'db-1',
  name: 'Shop DB',
  source_type: 'production_db',
  entities: [],
  relationships: [],
  data: {
    _type: 'production_db_positions',
    nodes: { customers: { x: 40, y: 60 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    source: { type: 'sqlite', database: 'shop.db' },
  },
};
const LIVE_SCHEMA = {
  schema: [{ table_name: 'customers', columns: [{ name: 'id', type: 'INTEGER', is_pk: true, is_nullable: false }], foreign_keys: [] }],
};

const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  if (url === '/api/diagrams/db-1') return Response.json(DB_CLIENT_DIAGRAM);
  if (url === '/api/diagrams/fetch-schema') return Response.json(LIVE_SCHEMA);
  return Response.json({ error: 'Not found' }, { status: 404 });
});

function open() {
  hooks.cursor = 0;
  return useERDSession(false, false, true, () => {}).handleDiagramSelect('db-1', vi.fn(), { silent: true });
}

beforeEach(() => {
  hooks.slots = [];
  fetchMock.mockClear();
  toast.error.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  vi.stubGlobal('sessionStorage', { getItem: () => null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BUG-105 DB Client diagram live schema', () => {
  it('is not requested in the web app, which keeps the saved canvas without errors', async () => {
    const consoleError = vi.spyOn(console, 'error');

    const loaded = await open();

    expect(loaded?.entities).toEqual([]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/diagrams/db-1']);
    expect(consoleError).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('is still loaded in the CLI and Desktop apps', async () => {
    vi.stubGlobal('window', { ERD_INSTALL_MODE: 'cli' });

    const loaded = await open();

    expect(fetchMock).toHaveBeenCalledWith('/api/diagrams/fetch-schema', expect.objectContaining({ method: 'POST' }));
    expect(loaded?.entities.map((entity: { name: string; x: number; y: number }) => [entity.name, entity.x, entity.y]))
      .toEqual([['customers', 40, 60]]);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
