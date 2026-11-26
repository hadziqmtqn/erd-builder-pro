/** Screen rectangle in px, the shape of `getBoundingClientRect()`. */
export interface ScreenRect { left: number; top: number; right: number; bottom: number }

const overlapArea = (a: ScreenRect, b: ScreenRect) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/**
 * The point, in px from the canvas's top-left corner, where a focused node should be centred so that a panel
 * floating over the canvas (the Comments panel) does not cover it: the middle of the wider strip left or right
 * of the panel that covers the most canvas, or the canvas centre when no panel covers it (BUG-076, BUG-093).
 */
export function focusPointBesidePanels(canvas: ScreenRect, panels: ScreenRect[]): { x: number; y: number } {
  const width = canvas.right - canvas.left;
  const centre = { x: width / 2, y: (canvas.bottom - canvas.top) / 2 };
  const panel = panels.reduce<ScreenRect | null>((best, item) =>
    overlapArea(canvas, item) > (best ? overlapArea(canvas, best) : 0) ? item : best, null);
  if (!panel) return centre;
  const coveredFrom = Math.max(panel.left, canvas.left) - canvas.left;
  const coveredTo = Math.min(panel.right, canvas.right) - canvas.left;
  const freeLeft = coveredFrom;
  const freeRight = width - coveredTo;
  // A panel as wide as the canvas (a phone) leaves no strip to move the node into.
  if (freeLeft <= 0 && freeRight <= 0) return centre;
  return { x: freeLeft >= freeRight ? freeLeft / 2 : coveredTo + freeRight / 2, y: centre.y };
}

/**
 * The React Flow viewport that shows flow point `point` at the focus point beside the open Comments panel.
 * `canvas` is the element that wraps the editor's React Flow canvas.
 */
export function viewportBesidePanels(canvas: HTMLElement, point: { x: number; y: number }, zoom: number) {
  const flow = canvas.querySelector<HTMLElement>('.react-flow') ?? canvas;
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-discussions-panel]'), (panel) => panel.getBoundingClientRect());
  const target = focusPointBesidePanels(flow.getBoundingClientRect(), panels);
  return { x: target.x - point.x * zoom, y: target.y - point.y * zoom, zoom };
}
