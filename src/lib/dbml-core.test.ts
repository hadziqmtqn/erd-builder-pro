import { describe, expect, it } from 'vitest';
import { dbmlCore, isDbmlCoreLoaded, loadDbmlCore } from './dbml-core';

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
