import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// A small stateful stand-in for React: state setters write to their slot, effects are collected per render.
const hooks = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as Array<() => void | (() => void)> }));
vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
  useRef: (value: unknown) => hooks.slots[hooks.cursor++] ??= { current: value },
  useState: (value: unknown) => {
    const slot = hooks.cursor++;
    if (!(slot in hooks.slots)) hooks.slots[slot] = typeof value === 'function' ? value() : value;
    return [hooks.slots[slot], (next: unknown) => {
      hooks.slots[slot] = typeof next === 'function' ? (next as (current: unknown) => unknown)(hooks.slots[slot]) : next;
    }];
  },
  useCallback: (fn: unknown, deps: unknown[]) => {
    const slot = hooks.cursor++;
    const previous = hooks.slots[slot];
    if (!previous || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) hooks.slots[slot] = { fn, deps };
    return hooks.slots[slot].fn;
  },
}));
vi.mock('@/lib/api', () => ({ ACTIVE_TEAM_KEY: 'team', getApiBaseUrl: () => '', apiFetch: vi.fn() }));
vi.mock('../lib/live-socket', () => ({ openLiveSocket: vi.fn() }));
import { apiFetch } from '@/lib/api';
import { useTeams } from './useTeams';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function render() {
  hooks.cursor = 0;
  hooks.effects = [];
  return useTeams(false, true);
}

beforeEach(() => {
  hooks.slots = [];
  vi.stubGlobal('localStorage', { getItem: () => 'team-1', setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.mocked(apiFetch).mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('reports a failed Teams request as a load failure, not as no access, and retries when back online (BUG-089)', async () => {
  vi.mocked(apiFetch).mockRejectedValue(new TypeError('Failed to fetch'));
  render();
  hooks.effects.forEach(effect => effect());
  await flush();

  let state = render();
  expect(state.activeTeamId).toBe('team-1');
  expect(state.activeTeam).toBeNull();
  expect(state.loadFailed).toBe(true);
  hooks.effects.forEach(effect => effect());
  await flush();

  vi.mocked(apiFetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [{ id: 'team-1', name: 'Team', capabilities: { erd_builder: true } }] }) } as Response);
  window.dispatchEvent(new Event('online'));
  await flush();

  state = render();
  expect(state.loadFailed).toBe(false);
  expect(state.activeTeam).toMatchObject({ id: 'team-1', capabilities: { erd_builder: true } });
});

it('does not mark a server refusal as a load failure', async () => {
  vi.mocked(apiFetch).mockResolvedValue({ status: 403, json: async () => ({}) } as Response);
  await render().fetchTeams();
  expect(render().loadFailed).toBe(false);
});
