import { afterEach, describe, expect, it, vi } from 'vitest';
import { readRememberedViewport, readSavedViewport, rememberViewport } from '../erd-viewport';

describe('readSavedViewport', () => {
  it('preserves a zoomed viewport at the origin', () => {
    expect(readSavedViewport({ viewport_x: 0, viewport_y: 0, viewport_zoom: 0.5 }))
      .toEqual({ x: 0, y: 0, zoom: 0.5 });
  });

  it('reads a pending draft viewport', () => {
    expect(readSavedViewport({ viewport: { x: -120, y: 75, zoom: 0.8 } }))
      .toEqual({ x: -120, y: 75, zoom: 0.8 });
  });

  it('rejects incomplete or invalid viewport data', () => {
    expect(readSavedViewport({ viewport_x: 0, viewport_y: 0 })).toBeNull();
    expect(readSavedViewport({ viewport: { x: 0, y: 0, zoom: 0 } })).toBeNull();
  });
});

describe('viewport remembered in this browser (BUG-084)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  function stubStorage(initial: Record<string, string> = {}) {
    const items = new Map(Object.entries(initial));
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => { items.set(key, value); },
    });
    return items;
  }

  it('keeps only the viewport, per diagram', () => {
    const items = stubStorage();
    rememberViewport('erd-1', { x: -320, y: 140, zoom: 0.75 });
    expect([...items.entries()]).toEqual([['erd-viewport:erd-1', '{"x":-320,"y":140,"zoom":0.75}']]);
    expect(readRememberedViewport('erd-1')).toEqual({ x: -320, y: 140, zoom: 0.75 });
    expect(readRememberedViewport('erd-2')).toBeNull();
    expect(readRememberedViewport(null)).toBeNull();
  });

  it('ignores a damaged stored value', () => {
    stubStorage({ 'erd-viewport:a': '{not json', 'erd-viewport:b': '{"x":1,"y":2,"zoom":0}', 'erd-viewport:c': '"text"' });
    expect(readRememberedViewport('a')).toBeNull();
    expect(readRememberedViewport('b')).toBeNull();
    expect(readRememberedViewport('c')).toBeNull();
  });

  it('works without storage, as in a private window that blocks it', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    expect(() => rememberViewport('erd-1', { x: 0, y: 0, zoom: 1 })).not.toThrow();
    expect(readRememberedViewport('erd-1')).toBeNull();
  });
});
