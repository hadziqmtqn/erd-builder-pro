import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
}));

import { useFlowchartChangeHandler } from './useFlowchartChangeHandler';

afterEach(() => vi.useRealTimers());

it('saves an empty canvas through the existing debounce and sync path', async () => {
  vi.useFakeTimers();
  const flowcharts = { current: [{ id: 1, uid: 'flow', title: 'Keep this file', data: '{"nodes":[{"id":"a"}],"edges":[]}' }] };
  const saveFlowchart = vi.fn().mockResolvedValue(undefined);
  const sync = vi.fn();
  const broadcast = vi.fn();
  const handler = useFlowchartChangeHandler({
    activeFlowchartId: 'flow', isIncomingSyncRef: { current: false }, flowchartsRef: flowcharts,
    lastLoadedFlowchartIdRef: { current: 'flow' }, lastSaveCallRef: { current: 0 },
    setIsLocalSaving: vi.fn(), saveFlowchart,
    setFlowcharts: update => { flowcharts.current = typeof update === 'function' ? update(flowcharts.current) : update; },
    broadcastMessage: broadcast, triggerDebouncedSync: sync,
    isRefreshing: false, isFlowchartItemLoading: false,
  });
  handler.handleFlowchartChange([], []);
  await vi.advanceTimersByTimeAsync(1500);
  expect(saveFlowchart).toHaveBeenCalledWith(expect.objectContaining({ uid: 'flow', title: 'Keep this file', data: '{"nodes":[],"edges":[]}' }));
  expect(sync).toHaveBeenCalledOnce();
  expect(broadcast).toHaveBeenCalledOnce();
});

it('does not save the stored data again when a file is opened', async () => {
  vi.useFakeTimers();
  const flowcharts = { current: [{ id: 1, uid: 'flow', title: 'Opened', data: '{"nodes":[],"edges":[]}' }] };
  const saveFlowchart = vi.fn().mockResolvedValue(undefined);
  const handler = useFlowchartChangeHandler({
    activeFlowchartId: 'flow', isIncomingSyncRef: { current: false }, flowchartsRef: flowcharts,
    lastLoadedFlowchartIdRef: { current: 'flow' }, lastSaveCallRef: { current: 0 },
    setIsLocalSaving: vi.fn(), saveFlowchart, setFlowcharts: vi.fn(),
    broadcastMessage: vi.fn(), triggerDebouncedSync: vi.fn(),
    isRefreshing: false, isFlowchartItemLoading: false,
  });
  handler.handleFlowchartChange([], []);
  await vi.advanceTimersByTimeAsync(1500);
  expect(saveFlowchart).not.toHaveBeenCalled();
});
