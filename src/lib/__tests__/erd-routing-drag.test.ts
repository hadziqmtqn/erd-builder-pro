import { describe, expect, it } from 'vitest';
import { routeErdEdge, routeErdEdgeWhileDragging, segmentBlocked, type RoutePoint } from '../erd-routing';

const walls = [
  { x: 0, y: 0, width: 1000, height: 20 }, { x: 0, y: 380, width: 1000, height: 20 },
  { x: 0, y: 0, width: 20, height: 400 }, { x: 980, y: 0, width: 20, height: 400 },
  { x: 250, y: 0, width: 50, height: 300 }, { x: 550, y: 100, width: 50, height: 300 },
];
const between = [{ x: 0, y: 0, width: 220, height: 150 }, { x: 350, y: -50, width: 250, height: 250 }, { x: 700, y: 0, width: 220, height: 150 }];
// The second table sits 10 px from the first, so the source port lands inside its padded bounds.
const enclosing = [{ x: 0, y: 0, width: 220, height: 150 }, { x: 230, y: 0, width: 220, height: 150 }, { x: 700, y: 300, width: 220, height: 150 }];
const open = [between[0], { x: 700, y: 300, width: 220, height: 150 }];

const xy = (points: RoutePoint[]) => points.map(p => [p.x, p.y]);
const orthogonal = (points: RoutePoint[]) => points.slice(1).every((p, i) => p.x === points[i].x || p.y === points[i].y);

describe('BUG-040 drag routing', () => {
  it('keeps the full route after the drop exactly as before, for every routing tier', () => {
    // Expected points were produced by routeErdEdge on master before this change.
    expect(xy(routeErdEdge({ x: 220, y: 70 }, { x: 700, y: 370 }, true, false, open)))
      .toEqual([[220, 70], [236, 70], [684, 70], [684, 370], [700, 370]]);
    expect(xy(routeErdEdge({ x: 220, y: 70 }, { x: 700, y: 70 }, true, false, between)))
      .toEqual([[220, 70], [236, 70], [236, -58], [684, -58], [684, 70], [700, 70]]);
    expect(xy(routeErdEdge({ x: 100, y: 50 }, { x: 900, y: 350 }, true, false, walls)))
      .toEqual([[100, 50], [242, 50], [242, 308], [542, 308], [542, 92], [884, 92], [884, 350], [900, 350]]);
    expect(xy(routeErdEdge({ x: 220, y: 70 }, { x: 700, y: 370 }, true, false, enclosing)))
      .toEqual([[220, 70], [236, 70], [236, -32], [684, -32], [684, 370], [700, 370]]);
  });

  it('matches the full route while dragging when a direct or boundary-lane route is clear', () => {
    for (const [source, target, tables] of [
      [{ x: 220, y: 70 }, { x: 700, y: 370 }, open],
      [{ x: 220, y: 70 }, { x: 700, y: 70 }, between],
    ] as const) {
      expect(routeErdEdgeWhileDragging(source, target, true, false, [...tables])).toEqual(routeErdEdge(source, target, true, false, [...tables]));
    }
  });

  it('skips the grid search while dragging and draws the plain route instead', () => {
    const source = { x: 100, y: 50 }, target = { x: 900, y: 350 };
    const points = routeErdEdgeWhileDragging(source, target, true, false, walls);
    expect(xy(points)).toEqual([[100, 50], [116, 50], [884, 50], [884, 350], [900, 350]]);
    expect(orthogonal(points)).toBe(true);
    // It may cross a table until the drop; the full route then goes around it.
    expect(points.slice(1).some((p, i) => segmentBlocked(points[i], p, walls))).toBe(true);
    expect(routeErdEdge(source, target, true, false, walls).length).toBeGreaterThan(points.length);
  });

  it('never jumps to the outside lane above every table while dragging (SH-004)', () => {
    const source = { x: 220, y: 70 }, target = { x: 700, y: 370 };
    const top = Math.min(...enclosing.map(table => table.y));
    expect(routeErdEdge(source, target, true, false, enclosing).some(p => p.y < top)).toBe(true);
    const points = routeErdEdgeWhileDragging(source, target, true, false, enclosing);
    expect(points.every(p => p.y >= top)).toBe(true);
    expect(xy(points)).toEqual([[220, 70], [236, 70], [684, 70], [684, 370], [700, 370]]);
  });

  it('routes self-references outside the table while dragging, like the full route', () => {
    const table = [{ x: 0, y: 0, width: 220, height: 200 }];
    const points = routeErdEdgeWhileDragging({ x: 220, y: 150 }, { x: 220, y: 150 }, true, true, table);
    expect(points).toEqual(routeErdEdge({ x: 220, y: 150 }, { x: 220, y: 150 }, true, true, table));
    expect(points.some(p => p.x > 220)).toBe(true);
  });
});
