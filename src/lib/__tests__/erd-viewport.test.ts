import { describe, expect, it } from 'vitest';
import { readSavedViewport } from '../erd-viewport';

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
