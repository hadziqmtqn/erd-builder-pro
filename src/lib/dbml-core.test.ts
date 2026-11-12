import { afterEach, describe, expect, it, vi } from 'vitest';
import { dbmlCore, isDbmlCoreLoaded, loadDbmlCore, preloadDbmlCore } from './dbml-core';

afterEach(() => vi.unstubAllGlobals());

describe('BUG-032 lazy DBML parser', () => {
  it('refuses sync use until loaded, then reuses one module', async () => {
    expect(isDbmlCoreLoaded()).toBe(false);
    expect(() => dbmlCore()).toThrow(/still loading/);
    const [first, second] = await Promise.all([loadDbmlCore(), loadDbmlCore()]);
    expect(first).toBe(second);
    expect(dbmlCore().Parser).toBe(first.Parser);
    expect(isDbmlCoreLoaded()).toBe(true);
  }, 60_000);
});

describe('BUG-053 idle preload of the DBML parser', () => {
  it('waits for an idle moment, at most 3 s, instead of loading before the canvas', () => {
    const requestIdleCallback = vi.fn();
    const setTimeout = vi.fn();
    vi.stubGlobal('window', { requestIdleCallback, setTimeout });
    preloadDbmlCore();
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 3000 });
    expect(setTimeout).not.toHaveBeenCalled();
  });

  it('falls back to a timer where requestIdleCallback is missing (WebKit)', () => {
    const setTimeout = vi.fn();
    vi.stubGlobal('window', { setTimeout });
    preloadDbmlCore();
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
  });
});
