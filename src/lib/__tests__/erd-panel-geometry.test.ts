import { describe, expect, it } from 'vitest';
import { choosePopoverSide, isVisibleBesidePanel, EXPLORER_WIDTH } from '../erd-panel-geometry';

const canvas = { width: 1200, height: 800 };

describe('isVisibleBesidePanel', () => {
  it('is true for a table in the uncovered area', () => {
    expect(isVisibleBesidePanel({ x: 500, y: 100, width: 220, height: 160 }, canvas, EXPLORER_WIDTH)).toBe(true);
  });

  it('is false when the Explorer covers part of the table', () => {
    expect(isVisibleBesidePanel({ x: 250, y: 100, width: 220, height: 160 }, canvas, EXPLORER_WIDTH)).toBe(false);
  });

  it('is false when the table runs past an edge of the canvas', () => {
    expect(isVisibleBesidePanel({ x: 1100, y: 100, width: 220, height: 160 }, canvas, 0)).toBe(false);
    expect(isVisibleBesidePanel({ x: 500, y: 700, width: 220, height: 160 }, canvas, 0)).toBe(false);
  });

  it('uses the whole canvas when no panel is open', () => {
    expect(isVisibleBesidePanel({ x: 20, y: 20, width: 220, height: 160 }, canvas, 0)).toBe(true);
  });
});

describe('choosePopoverSide', () => {
  const table = { x: 500, y: 200, width: 220, height: 180 };

  it('prefers the right side when both sides are free', () => {
    expect(choosePopoverSide(table, canvas, [])).toBe('right');
  });

  it('takes the side that does not cover a related table', () => {
    const relatedOnRight = { x: 760, y: 220, width: 220, height: 160 };
    expect(choosePopoverSide(table, canvas, [relatedOnRight])).toBe('left');
  });

  it('takes the side that covers fewer related tables when both cover some', () => {
    const left = { x: 300, y: 220, width: 150, height: 100 };
    const right = [{ x: 760, y: 220, width: 100, height: 100 }, { x: 900, y: 400, width: 100, height: 100 }];
    expect(choosePopoverSide(table, canvas, [left, ...right])).toBe('left');
  });

  it('falls back to the side that fits inside the canvas', () => {
    expect(choosePopoverSide({ x: 900, y: 200, width: 220, height: 180 }, canvas, [])).toBe('left');
    expect(choosePopoverSide({ x: 40, y: 200, width: 220, height: 180 }, canvas, [])).toBe('right');
  });

  it('returns null when the popover fits on neither side, so the camera moves first', () => {
    expect(choosePopoverSide({ x: 200, y: 200, width: 220, height: 180 }, { width: 700, height: 800 }, [])).toBeNull();
  });
});
