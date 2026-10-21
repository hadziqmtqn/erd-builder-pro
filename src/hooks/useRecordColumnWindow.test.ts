import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ cursor: 0, slots: [] as any[], effects: [] as any[], updates: [] as number[] }));
vi.mock('react', () => ({
  useRef: (current: unknown) => { const i = mocks.cursor++; return mocks.slots[i] ??= { current }; },
  useState: (initial: unknown) => { const i = mocks.cursor++; if (!(i in mocks.slots)) mocks.slots[i] = typeof initial === 'function' ? initial() : initial; return [mocks.slots[i], (value: any) => { mocks.updates.push(i); mocks.slots[i] = typeof value === 'function' ? value(mocks.slots[i]) : value; }]; },
  useLayoutEffect: (effect: unknown) => { mocks.effects.push(effect); },
}));
import { useRecordColumnWindow } from './useRecordColumnWindow';
const frames: FrameRequestCallback[] = [];
const observe = vi.fn(), disconnect = vi.fn(), cancel = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); mocks.cursor = 0; mocks.slots = []; mocks.effects = []; mocks.updates = []; frames.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe = observe; disconnect = disconnect; });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', cancel);
});
afterEach(() => vi.unstubAllGlobals());
const render = () => { mocks.cursor = 0; return useRecordColumnWindow(Array(56).fill(50), 40); };

it('coalesces scroll events and does not update React inside the buffered column range', () => {
  const element = { scrollLeft: 0, clientWidth: 400, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const initial = render();
  expect(initial.columnWindow).toEqual({ start: 0, end: 0 });
  initial.scrollRef(element as any);
  mocks.effects = []; render(); const cleanup = mocks.effects[0]();
  const scroll = element.addEventListener.mock.calls[0][1];
  expect(element.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
  mocks.updates = [];
  element.scrollLeft = 20;
  for (let i = 0; i < 20; i++) scroll();
  expect(frames).toHaveLength(1); frames.shift()!(0);
  expect(mocks.updates).toEqual([]);
  // Refill while the actual viewport is still inside the existing 12-column window.
  element.scrollLeft = 150; scroll(); frames.shift()!(0);
  expect(render().columnWindow).toEqual({ start: 0, end: 15 });
  expect(mocks.updates).toEqual([1]);
  mocks.updates = [];
  element.scrollLeft = 500; scroll(); frames.shift()!(0);
  expect(mocks.updates).toEqual([1]);
  expect(render().columnWindow).toEqual({ start: 5, end: 22 });
  scroll(); cleanup();
  expect(cancel).toHaveBeenCalled(); expect(disconnect).toHaveBeenCalled();
  expect(element.removeEventListener).toHaveBeenCalledWith('scroll', scroll);
});

it('caps the larger buffer and refills early in either direction', () => {
  const element = { scrollLeft: 1000, clientWidth: 1000, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  render().scrollRef(element as any);
  mocks.effects = []; render(); const cleanup = mocks.effects[0]();
  const scroll = element.addEventListener.mock.calls[0][1];
  expect(render().columnWindow).toEqual({ start: 11, end: 48 });
  mocks.updates = [];
  element.scrollLeft = 850; scroll(); frames.shift()!(0);
  expect(mocks.updates).toEqual([]);
  element.scrollLeft = 750; scroll(); frames.shift()!(0);
  expect(render().columnWindow).toEqual({ start: 6, end: 43 });
  element.scrollLeft = 1050; scroll(); frames.shift()!(0);
  expect(render().columnWindow).toEqual({ start: 12, end: 49 });
  cleanup();
});
