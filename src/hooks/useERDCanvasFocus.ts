import { useCallback } from 'react';
import { useReactFlow, useStoreApi, type Rect } from '@xyflow/react';
import { ERD_FOCUS_MAX_ZOOM, ERD_FOCUS_MIN_ZOOM } from '@/lib/erd-canvas-focus';
import { choosePopoverSide, EXPLORER_LEFT, isVisibleBesidePanel, popoverBox, POPOVER_GAP, POPOVER_WIDTH, type PanelRect } from '@/lib/erd-panel-geometry';

const MOVE_MS = 400;
const PADDING = 48;

// Glide to the target, or jump straight there when the viewer asked for reduced motion.
const moveDuration = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : MOVE_MS;

/**
 * Camera moves for the Explorer and the table popover of this pane's canvas (ERD-004).
 * Each move happens only when its target is not already fully visible, and at most once.
 */
export function useERDCanvasFocus() {
  const { getNodesBounds, getViewport, setViewport } = useReactFlow();
  const store = useStoreApi();

  const canvasSize = useCallback(() => {
    const { width, height } = store.getState();
    return { width, height };
  }, [store]);

  /** Screen rectangle of the given tables, relative to the canvas. */
  const screenRect = useCallback((ids: string[]): PanelRect => {
    const bounds = getNodesBounds(ids);
    const { x, y, zoom } = getViewport();
    return { x: bounds.x * zoom + x, y: bounds.y * zoom + y, width: bounds.width * zoom, height: bounds.height * zoom };
  }, [getNodesBounds, getViewport]);

  // Keep the zoom when the target fits beside the panel, otherwise fit it; centre it in the uncovered area.
  const moveTo = useCallback(async (bounds: Rect, coveredLeft: number, shiftRight = 0) => {
    const { width, height } = canvasSize();
    const free = Math.max(1, width - coveredLeft - shiftRight);
    const current = getViewport().zoom;
    const fitZoom = Math.min((free - 2 * PADDING) / bounds.width, (height - 2 * PADDING) / bounds.height);
    const zoom = Math.max(ERD_FOCUS_MIN_ZOOM, Math.min(ERD_FOCUS_MAX_ZOOM, Math.min(current, fitZoom)));
    const centerX = coveredLeft + free / 2;
    const target = {
      x: centerX - (bounds.x + bounds.width / 2) * zoom,
      y: height / 2 - (bounds.y + bounds.height / 2) * zoom,
      zoom,
    };
    const duration = moveDuration();
    // Not `await setViewport(...)`: a re-render during the glide interrupts it and that promise never settles.
    // Wait the glide out, then land on the target if it was cut short.
    void setViewport(target, { duration });
    if (duration) await new Promise(resolve => window.setTimeout(resolve, duration + 50));
    const now = getViewport();
    if (Math.abs(now.x - target.x) > 1 || Math.abs(now.y - target.y) > 1 || Math.abs(now.zoom - target.zoom) > 0.001) await setViewport(target);
  }, [canvasSize, getViewport, setViewport]);

  /** Shows tables picked in the Explorer; `coveredLeft` is the width the Explorer hides. */
  const reveal = useCallback(async (ids: string[], coveredLeft: number) => {
    if (ids.length === 0) return;
    if (isVisibleBesidePanel(screenRect(ids), canvasSize(), coveredLeft)) return;
    await moveTo(getNodesBounds(ids), coveredLeft);
  }, [canvasSize, getNodesBounds, moveTo, screenRect]);

  /**
   * Makes room for the floating popover next to `id`, then returns where it goes: the side, the table's
   * screen rectangle after the (single) camera move, and a top that keeps the popover inside the canvas.
   */
  const placePopover = useCallback(async (id: string, relatedIds: string[]) => {
    const canvas = canvasSize();
    const related = () => relatedIds.map(item => screenRect([item]));
    let anchor = screenRect([id]);
    // The toolbar runs down the left edge, so neither the table nor the popover may sit under it.
    let side = isVisibleBesidePanel(anchor, canvas, EXPLORER_LEFT) ? choosePopoverSide(anchor, canvas, related(), EXPLORER_LEFT) : null;
    if (!side) {
      // Centre the table in the space left of a popover on its right.
      await moveTo(getNodesBounds([id]), EXPLORER_LEFT, POPOVER_WIDTH + POPOVER_GAP);
      anchor = screenRect([id]);
      side = choosePopoverSide(anchor, canvas, related(), EXPLORER_LEFT) ?? 'right';
    }
    return { side, anchor, top: popoverBox(anchor, canvas).top };
  }, [canvasSize, getNodesBounds, moveTo, screenRect]);

  return { reveal, placePopover };
}
