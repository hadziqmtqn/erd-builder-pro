import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as any[], api: vi.fn(), cache: vi.fn(), error: vi.fn(), token: 'qa-session-a' }));
vi.mock('react', () => ({
  useRef: (current: unknown) => { const i = mocks.cursor++; return mocks.slots[i] ??= { current }; },
  useState: (current: unknown) => { const i = mocks.cursor++; if (!(i in mocks.slots)) mocks.slots[i] = current; return [mocks.slots[i], (value: unknown) => { mocks.slots[i] = value; }]; },
  useEffect: (effect: unknown, deps: unknown[]) => { const i = mocks.cursor++; const previous = mocks.slots[i]; if (!previous || deps.some((d, j) => d !== previous[j])) { mocks.slots[i] = deps; mocks.effects.push(effect); } },
  useCallback: (callback: unknown) => callback,
}));
vi.mock('@/lib/api', () => ({ apiFetch: mocks.api, getAuthToken: () => mocks.token }));
vi.mock('./useDataViewerHelpers', () => ({ setSchemaCache: mocks.cache }));
vi.mock('sonner', () => ({ toast: { error: mocks.error } }));
import { useDatabaseSchemaSync } from './useDatabaseSchemaSync';

beforeEach(() => { vi.clearAllMocks(); mocks.slots = []; mocks.cursor = 0; mocks.effects = []; mocks.token = 'qa-session-a'; });
afterEach(() => vi.restoreAllMocks());
const render = (id: number | undefined, receive = vi.fn()) => { mocks.cursor = 0; return useDatabaseSchemaSync(id, receive); };
const response = (schema: any = []) => ({ ok: true, json: async () => ({ schema }) });

it('prevents double Sync, leaves the shared cache to the accepted merge, and delivers schema exactly once', async () => {
  let resolve!: (result: unknown) => void;
  mocks.api.mockReturnValue(new Promise(r => { resolve = r; }));
  const receive = vi.fn(); const sync = render(4, receive); mocks.effects.shift()();
  const first = sync.sync(); await sync.sync();
  expect(mocks.api).toHaveBeenCalledTimes(1);
  resolve(response([{ table_name: 'users' }])); await first;
  expect(mocks.cache).not.toHaveBeenCalled();
  expect(receive).toHaveBeenCalledWith({ schema: [{ table_name: 'users' }] });
  expect(receive).toHaveBeenCalledOnce();
  expect(render(4).isSyncing).toBe(false);
});

it('aborts on unmount/tab exit and ignores a late response even if transport ignores abort', async () => {
  let resolve!: (result: unknown) => void;
  mocks.api.mockReturnValue(new Promise(r => { resolve = r; }));
  const receive = vi.fn(); const sync = render(4, receive); const cleanup = mocks.effects.shift()();
  const pending = sync.sync(); cleanup();
  expect(mocks.api.mock.calls[0][1].signal.aborted).toBe(true);
  resolve(response()); await pending;
  expect(receive).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled(); expect(mocks.error).not.toHaveBeenCalled();
});

it('does not deliver an old connection response after the owner changes', async () => {
  let resolve!: (result: unknown) => void;
  mocks.api.mockReturnValue(new Promise(r => { resolve = r; }));
  const receive = vi.fn(); const first = render(4, receive); mocks.effects.shift()();
  const pending = first.sync(); render(5, receive);
  resolve(response()); await pending;
  expect(receive).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
});

it.each([{ ok: false, json: async () => ({ error: 'Not found' }) }, response(null)])('reports failed/malformed responses without replacing the canvas', async result => {
  mocks.api.mockResolvedValue(result);
  const receive = vi.fn(); const sync = render(4, receive); mocks.effects.shift()();
  await sync.sync();
  expect(receive).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled(); expect(mocks.error).toHaveBeenCalledOnce();
  expect(render(4).isSyncing).toBe(false);
});

it('does not request a schema while the ERD tab is inactive', async () => {
  await render(undefined).sync(); expect(mocks.api).not.toHaveBeenCalled();
});

it('does not cache or expose a response after the authenticated session changes', async () => {
  let resolve!: (result: unknown) => void;
  mocks.api.mockReturnValue(new Promise(r => { resolve = r; }));
  const receive = vi.fn(); const sync = render(4, receive); mocks.effects.shift()();
  const pending = sync.sync(); mocks.token = 'qa-session-b';
  resolve(response()); await pending;
  expect(receive).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  expect(render(4).isSyncing).toBe(false);
});
