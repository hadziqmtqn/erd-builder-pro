import { describe, expect, it } from 'vitest';
import { focusPointBesidePanels, type ScreenRect } from './canvas-panel-focus';

const rect = (left: number, top: number, right: number, bottom: number): ScreenRect => ({ left, top, right, bottom });
const NODE_WIDTH = 220;
/** Whether a node of NODE_WIDTH centred at canvas x `x` stays clear of `panel`. */
const clearOf = (canvas: ScreenRect, panel: ScreenRect, x: number) => {
  const left = canvas.left + x - NODE_WIDTH / 2;
  return left + NODE_WIDTH <= panel.left || left >= panel.right;
};

describe('focus point beside the Comments panel (BUG-076)', () => {
  it('uses the canvas centre when no panel is open or none covers the canvas', () => {
    const canvas = rect(0, 56, 1280, 800);
    expect(focusPointBesidePanels(canvas, [])).toEqual({ x: 640, y: 372 });
    expect(focusPointBesidePanels(canvas, [rect(1300, 60, 1600, 700)])).toEqual({ x: 640, y: 372 });
  });

  it('centres the node left of a panel docked on the right, where the canvas centre is covered', () => {
    // Issue #471: a 1280 px window with the side panes open; the canvas centre (x 920) is under the panel.
    const canvas = rect(560, 56, 1280, 800);
    const panel = rect(888, 72, 1272, 744);
    const point = focusPointBesidePanels(canvas, [panel]);
    expect(point).toEqual({ x: 164, y: 372 });
    expect(clearOf(canvas, panel, (canvas.right - canvas.left) / 2)).toBe(false);
    expect(clearOf(canvas, panel, point.x)).toBe(true);
  });

  it('measures the panel against the canvas, not the window', () => {
    // A sidebar takes the first 300 px of the window, so the canvas starts there.
    expect(focusPointBesidePanels(rect(300, 0, 1280, 700), [rect(888, 16, 1272, 680)])).toEqual({ x: 294, y: 350 });
  });

  it('picks the wider strip when the panel sits away from the edge', () => {
    expect(focusPointBesidePanels(rect(0, 0, 1000, 600), [rect(150, 0, 500, 600)]).x).toBe(750);
  });

  it('follows the panel that covers the most canvas', () => {
    const canvas = rect(0, 0, 1200, 700);
    expect(focusPointBesidePanels(canvas, [rect(1150, 0, 1500, 700), rect(800, 0, 1184, 700)]).x).toBe(400);
  });

  it('keeps the canvas centre when the panel spans the whole canvas width', () => {
    expect(focusPointBesidePanels(rect(0, 0, 390, 700), [rect(0, 100, 390, 700)])).toEqual({ x: 195, y: 350 });
  });
});

describe('notification link from the bell in a narrow window (BUG-093)', () => {
  // Issue #503: a 1090 px window, the table centred at x 571–791 under the Comments panel at x 427–811.
  const canvas = rect(0, 0, 1090, 737);
  const panel = rect(427, 16, 811, 673);

  it('moves the table out from under the panel into the visible canvas', () => {
    expect(clearOf(canvas, panel, 681)).toBe(false);
    const point = focusPointBesidePanels(canvas, [panel]);
    expect(point.x).toBe(213.5);
    expect(clearOf(canvas, panel, point.x)).toBe(true);
  });

  it.each([1024, 1280, 1670])('keeps a 220 px table clear of a right-docked panel at a %i px wide canvas', (width) => {
    const docked = rect(width - 400, 16, width - 16, 673);
    const point = focusPointBesidePanels(rect(0, 0, width, 737), [docked]);
    expect(clearOf(rect(0, 0, width, 737), docked, point.x)).toBe(true);
  });
});
