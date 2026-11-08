import { useCallback } from 'react';
import { useReactFlow, useStoreApi, type Rect } from '@xyflow/react';
import { ERD_FOCUS_MAX_ZOOM, ERD_FOCUS_MIN_ZOOM } from '@/lib/erd-canvas-focus';
import { choosePopoverSide, isVisibleBesidePanel, POPOVER_GAP, POPOVER_WIDTH, type PanelRect } from '@/lib/erd-panel-geometry';

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
    await setViewport({
      x: centerX - (bounds.x + bounds.width / 2) * zoom,
      y: height / 2 - (bounds.y + bounds.height / 2) * zoom,
      zoom,
    }, { duration: moveDuration() });
  }, [canvasSize, getViewport, setViewport]);

  /** Shows tables picked in the Explorer; `coveredLeft` is the width the Explorer hides. */
  const reveal = useCallback(async (ids: string[], coveredLeft: number) => {
    if (ids.length === 0) return;
    if (isVisibleBesidePanel(screenRect(ids), canvasSize(), coveredLeft)) return;
    await moveTo(getNodesBounds(ids), coveredLeft);
  }, [canvasSize, getNodesBounds, moveTo, screenRect]);

  /**
   * Makes room for the floating popover next to `id`, then returns where it goes:
   * the side and the table's screen rectangle after the (single) camera move.
   */
  const placePopover = useCallback(async (id: string, relatedIds: string[]) => {
    const canvas = canvasSize();
    const related = () => relatedIds.map(item => screenRect([item]));
    let anchor = screenRect([id]);
    let side = isVisibleBesidePanel(anchor, canvas, 0) ? choosePopoverSide(anchor, canvas, related()) : null;
    if (!side) {
      // Centre the table in the space left of a popover on its right.
      await moveTo(getNodesBounds([id]), 0, POPOVER_WIDTH + POPOVER_GAP);
      anchor = screenRect([id]);
      side = choosePopoverSide(anchor, canvas, related()) ?? 'right';
    }
    return { side, anchor };
  }, [canvasSize, getNodesBounds, moveTo, screenRect]);

  return { reveal, placePopover };
}
