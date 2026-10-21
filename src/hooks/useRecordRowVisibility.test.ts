import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effect: null as any }));
vi.mock('react', () => ({
  useRef: (value: any) => { const i = hooks.cursor++; return hooks.slots[i] ??= { current: value }; },
  useState: (value: any) => { const i = hooks.cursor++; if (!(i in hooks.slots)) hooks.slots[i] = value; return [hooks.slots[i], (next: any) => { hooks.slots[i] = typeof next === 'function' ? next(hooks.slots[i]) : next; }]; },
  useCallback: (callback: any) => callback,
  useLayoutEffect: (effect: any) => { hooks.effect = effect; },
}));
import { observeRecordRow, useRecordRowVisibility } from './useRecordRowVisibility';
const observers: any[] = [];
beforeEach(() => {
  hooks.slots = []; hooks.cursor = 0; hooks.effect = null; observers.length = 0;
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn();
    constructor(public callback: any, public options: any) { observers.push(this); }
  });
});
afterEach(() => vi.unstubAllGlobals());
const row = (root: any) => ({ closest: () => root, contains: vi.fn(() => false), ownerDocument: { activeElement: {} } }) as any;
const render = () => { hooks.cursor = 0; return useRecordRowVisibility(); };

it('shares one observer per scroll root with a 160px buffer and cleans up every row', () => {
  const root = {}, first = row(root), second = row(root), a = vi.fn(), b = vi.fn();
  const stopA = observeRecordRow(first, a), stopB = observeRecordRow(second, b);
  expect(observers).toHaveLength(1);
  expect(observers[0].options).toEqual({ root, rootMargin: '160px 0px' });
  observers[0].callback([{ target: second }]);
  expect(a).not.toHaveBeenCalled(); expect(b).toHaveBeenCalledTimes(1);
  stopA(); expect(observers[0].disconnect).not.toHaveBeenCalled();
  stopB(); expect(observers[0].unobserve).toHaveBeenCalledTimes(2); expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
});

it('keeps measured row height and reveals keyboard-focused cells without hiding focused content', () => {
  const target = row({});
  render().rowRef.current = target;
  const stop = hooks.effect();
  const notify = (visible: boolean, height = 41) => observers[0].callback([{ target, isIntersecting: visible, boundingClientRect: { height } }]);
  notify(false);
  expect(render()).toMatchObject({ visible: false, height: 41 });
  render().reveal(); expect(render().visible).toBe(true);
  target.contains.mockReturnValue(true); notify(false);
  expect(render().visible).toBe(true);
  target.contains.mockReturnValue(false); notify(false, 0);
  expect(render().visible).toBe(true);
  notify(false); notify(true);
  expect(render().visible).toBe(true);
  stop(); expect(observers[0].disconnect).toHaveBeenCalled();
});

it('falls back to normal rendering if the observer or scroll root is unavailable', () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  expect(observeRecordRow(row({}), vi.fn())).toBeTypeOf('function');
  expect(observeRecordRow(row(null), vi.fn())).toBeTypeOf('function');
  expect(observers).toHaveLength(0);
});
