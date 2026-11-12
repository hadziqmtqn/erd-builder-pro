import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ slots: [] as any[], cursor: 0 }));
vi.mock('react', () => ({
  useEffect: vi.fn(),
  useRef: (value: unknown) => hooks.slots[hooks.cursor++] ??= { current: value },
  useState: (value: unknown) => {
    const slot = hooks.cursor++;
    if (!(slot in hooks.slots)) hooks.slots[slot] = typeof value === 'function' ? value() : value;
    return [hooks.slots[slot], vi.fn()];
  },
  useCallback: (fn: unknown, deps: unknown[]) => {
    const slot = hooks.cursor++;
    const previous = hooks.slots[slot];
    if (!previous || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) hooks.slots[slot] = { fn, deps };
    return hooks.slots[slot].fn;
  },
}));
vi.mock('@/lib/api', () => ({ ACTIVE_TEAM_KEY: 'team', getApiBaseUrl: () => '', apiFetch: vi.fn() }));
import { apiFetch } from '@/lib/api';
import { seedActiveTeamId, useTeams } from './useTeams';

beforeEach(() => {
  hooks.slots = []; hooks.cursor = 0;
  vi.stubGlobal('localStorage', { getItem: () => 'team-1', removeItem: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

it('does not reload the Team plan when editor focus changes, but still uses the latest revoke handler', async () => {
  const oldHandler = vi.fn(), latestHandler = vi.fn();
  const first = useTeams(false, true, oldHandler);
  hooks.cursor = 0;
  const focused = useTeams(false, true, latestHandler);
  expect(focused.fetchTeams).toBe(first.fetchTeams);
  vi.mocked(apiFetch).mockResolvedValue({ status: 404 } as Response);
  await first.fetchTeams();
  expect(latestHandler).toHaveBeenCalledOnce();
  expect(oldHandler).not.toHaveBeenCalled();
});

it('keeps a Personal choice across reloads instead of reopening the sign-in Team (BUG-063)', async () => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  });
  seedActiveTeamId('team-1'); // first load after sign-in opens the Team
  expect(store.get('team')).toBe('team-1');
  useTeams(false, true).selectTeam(null);
  expect(store.get('team')).toBe('');
  vi.mocked(apiFetch).mockResolvedValue({ status: 403, json: async () => ({}) } as Response);
  hooks.slots = []; hooks.cursor = 0;
  await useTeams(false, true).fetchTeams(); // a Team-less answer must not erase the choice
  seedActiveTeamId('team-1'); // reload: /api/me still names the sign-in Team
  expect(store.get('team')).toBe('');
  hooks.slots = []; hooks.cursor = 0;
  expect(useTeams(false, true).activeTeamId).toBeNull();
});
