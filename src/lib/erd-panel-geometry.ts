/** Screen rectangles in px, relative to the canvas element (ERD-004). */
export interface PanelRect { x: number; y: number; width: number; height: number }

export const EXPLORER_WIDTH = 300;
/** The Explorer starts right of the ERD toolbar (left-[4.5rem] in ERDExplorer). */
export const EXPLORER_LEFT = 72;
/** Canvas width hidden by an open Explorer, measured from the canvas's left edge. */
export const EXPLORER_COVERED = EXPLORER_LEFT + EXPLORER_WIDTH;
export const POPOVER_WIDTH = 304;
export const POPOVER_GAP = 12;
/** Panes at least this wide dock the table editor beside the canvas instead of floating it. */
export const DOCK_MIN_WIDTH = 1100;
const MARGIN = 16;

const overlaps = (a: PanelRect, b: PanelRect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Whether `target` is fully visible in the part of the canvas a left panel of `coveredLeft` px does not hide.
 * The camera only moves when this is false.
 */
export function isVisibleBesidePanel(target: PanelRect, canvas: { width: number; height: number }, coveredLeft: number): boolean {
  return target.x >= coveredLeft + MARGIN
    && target.y >= MARGIN
    && target.x + target.width <= canvas.width - MARGIN
    && target.y + target.height <= canvas.height - MARGIN;
}

/**
 * The side of `anchor` (a table) where the popover fits inside the canvas, preferring the side that covers
 * none of `avoid` (its related tables), then the right. `null` when neither side fits: move the camera first.
 */
export function choosePopoverSide(
  anchor: PanelRect,
  canvas: { width: number; height: number },
  avoid: PanelRect[],
  width = POPOVER_WIDTH,
): 'left' | 'right' | null {
  const height = Math.min(canvas.height - 2 * MARGIN, Math.max(anchor.height, 320));
  const top = Math.max(MARGIN, Math.min(anchor.y, canvas.height - MARGIN - height));
  const candidates = (['right', 'left'] as const).map(side => {
    const rect = { x: side === 'right' ? anchor.x + anchor.width + POPOVER_GAP : anchor.x - POPOVER_GAP - width, y: top, width, height };
    const fits = rect.x >= MARGIN && rect.x + width <= canvas.width - MARGIN;
    return { side, fits, covered: avoid.filter(item => overlaps(rect, item)).length };
  }).filter(candidate => candidate.fits);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) => candidate.covered < best.covered ? candidate : best).side;
}
