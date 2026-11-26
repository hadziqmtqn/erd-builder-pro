import type { Viewport } from '@xyflow/react';

export function hasViewportChanged(previous: Viewport, next: Viewport): boolean {
  return previous.x !== next.x || previous.y !== next.y || previous.zoom !== next.zoom;
}

export function readSavedViewport(value: any): Viewport | null {
  const source = value?.viewport ?? value;
  const x = source?.x ?? source?.viewport_x ?? source?.viewportX;
  const y = source?.y ?? source?.viewport_y ?? source?.viewportY;
  const zoom = source?.zoom ?? source?.viewport_zoom ?? source?.viewportZoom;

  if (![x, y, zoom].every(item => typeof item === 'number' && Number.isFinite(item)) || zoom <= 0) return null;
  return { x, y, zoom };
}

const REMEMBERED_VIEWPORT = 'erd-viewport:';

/**
 * BUG-084: panning or zooming is the viewer's own view, not an edit of the shared file, so it is kept per diagram in
 * this browser instead of saving the diagram. The viewport stored in the file only changes along with a content save.
 */
export function rememberViewport(diagramKey: string | number, viewport: Viewport): void {
  try {
    localStorage.setItem(REMEMBERED_VIEWPORT + diagramKey, JSON.stringify(viewport));
  } catch { /* storage unavailable: the viewport is just not restored next time */ }
}

export function readRememberedViewport(diagramKey: string | number | null | undefined): Viewport | null {
  if (diagramKey == null) return null;
  try {
    const stored = localStorage.getItem(REMEMBERED_VIEWPORT + diagramKey);
    return stored ? readSavedViewport(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}
