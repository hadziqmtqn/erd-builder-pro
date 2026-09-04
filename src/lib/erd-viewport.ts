import type { Viewport } from '@xyflow/react';

export function readSavedViewport(value: any): Viewport | null {
  const source = value?.viewport ?? value;
  const x = source?.x ?? source?.viewport_x ?? source?.viewportX;
  const y = source?.y ?? source?.viewport_y ?? source?.viewportY;
  const zoom = source?.zoom ?? source?.viewport_zoom ?? source?.viewportZoom;

  if (![x, y, zoom].every(item => typeof item === 'number' && Number.isFinite(item)) || zoom <= 0) return null;
  return { x, y, zoom };
}
