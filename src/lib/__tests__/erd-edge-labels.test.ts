import { describe, expect, it } from 'vitest';
import { labelPoint, placeErdLabels, showErdLabel, straightRoute, type LabelRoute } from '../erd-edge-labels';
import { styleErdEdges } from '../erd-edge-style';

const route = (id: string, points: Array<[number, number]>, label = '1:N'): LabelRoute => ({ id, points: points.map(([x, y]) => ({ x, y })), label });

describe('SH-004 cardinality label placement', () => {
  it('raises the hovered relationship above overlapping paths and highlights its arrow without mutating data', () => {
    const edges = [{ id: 'a', source: 'one', target: 'two', label: '1:N' },
      { id: 'b', source: 'two', target: 'one', label: '1:1', zIndex: 5000, selected: true }];
    const styled = styleErdEdges(edges, [], 'a');
    expect(styled[0].zIndex).toBeGreaterThan(6000);
    expect(styled[0].style?.stroke).toBe('var(--edge-selected)');
    expect(styled[0].markerEnd).toMatchObject({ color: 'var(--edge-selected)' });
    expect(edges[0]).not.toHaveProperty('zIndex');
    expect(styleErdEdges(edges)[0]).not.toHaveProperty('zIndex');
    expect(styled.map(e => e.label)).toEqual(['1:N', '1:1']);
  });

  it('raises the selected relationship above overlapping paths, below the hovered one', () => {
    const edges = [{ id: 'a', source: 'one', target: 'two', zIndex: 20 },
      { id: 'b', source: 'two', target: 'one', selected: true },
      { id: 'c', source: 'one', target: 'three' }];
    const styled = styleErdEdges(edges);
    expect(styled[1].zIndex).toBeGreaterThan(20);
    expect(styled[0].zIndex).toBe(20);
    expect(styled[2]).not.toHaveProperty('zIndex');
    expect(edges[1]).not.toHaveProperty('zIndex');
    expect(styleErdEdges(edges, [], 'c')[2].zIndex).toBeGreaterThan(styled[1].zIndex!);
  });
  it('places text inside a straight segment, away from its corners', () => {
    const edge = route('a', [[0, 0], [200, 0], [200, 200]]);
    const anchors = placeErdLabels([edge], []);
    expect(labelPoint(edge.points, anchors.get('a')!)).toEqual({ x: 100, y: 0 });
    expect(anchors.get('a')!.shared).toBe(false);
    expect(edge.label).toBe('1:N');
  });

  it('merges duplicate and collinear waypoints before choosing a label slot', () => {
    const edge = route('a', [[0, 0], [16, 0], [16, 0], [160, 0], [200, 0]]);
    expect(straightRoute(edge.points)).toEqual([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
    expect(labelPoint(edge.points, placeErdLabels([edge], []).get('a')!)).toEqual({ x: 100, y: 0 });
  });

  it('moves labels away from crossings and from each other', () => {
    const a = route('a', [[0, 0], [200, 0]]), b = route('b', [[100, -100], [100, 100]], '1:1');
    const anchors = placeErdLabels([a, b], []);
    const pa = labelPoint(a.points, anchors.get('a')!)!, pb = labelPoint(b.points, anchors.get('b')!)!;
    expect(Math.abs(pa.x - 100)).toBeGreaterThan(20);
    expect(Math.abs(pb.y)).toBeGreaterThan(20);
    expect(anchors.get('a')!.shared).toBe(false);
    expect(anchors.get('b')!.shared).toBe(false);
  });

  it('uses the non-shared ends of opposing, partially overlapping paths', () => {
    const a = route('a', [[0, 0], [300, 0]]), b = route('b', [[400, 0], [100, 0]], '1:1');
    const anchors = placeErdLabels([a, b], []);
    expect(labelPoint(a.points, anchors.get('a')!)!.x).toBeLessThan(100);
    expect(labelPoint(b.points, anchors.get('b')!)!.x).toBeGreaterThan(300);
    expect(showErdLabel('a', anchors, null)).toBe(true);
    expect(showErdLabel('b', anchors, null)).toBe(true);
  });

  it('reveals only the active label when opposing paths are fully shared', () => {
    const a = route('a', [[0, 0], [200, 0]]), b = route('b', [[200, 0], [0, 0]], '1:1');
    const anchors = placeErdLabels([a, b], []);
    expect(anchors.get('a')!.shared).toBe(true);
    expect(anchors.get('b')!.shared).toBe(true);
    expect(showErdLabel('a', anchors, null)).toBe(false);
    expect(showErdLabel('b', anchors, null)).toBe(false);
    expect(showErdLabel('a', anchors, 'a')).toBe(true);
    expect(showErdLabel('b', anchors, 'a')).toBe(false);
    expect(showErdLabel('a', anchors, 'b')).toBe(false);
    expect(showErdLabel('b', anchors, 'b')).toBe(true);
    expect([a.label, b.label]).toEqual(['1:N', '1:1']);
  });

  it('keeps unrelated labels visible while placing a shared label clear of them', () => {
    const a = route('a', [[0, 0], [200, 0]]), b = route('b', [[200, 0], [0, 0]], '1:1');
    const normal = route('z', [[0, 20], [200, 20]]);
    const anchors = placeErdLabels([a, b, normal], []);
    const sharedPoint = labelPoint(a.points, anchors.get('a')!)!;
    const normalPoint = labelPoint(normal.points, anchors.get('z')!)!;
    expect(anchors.get('a')!.shared).toBe(true);
    expect(anchors.get('z')!.shared).toBe(false);
    expect(Math.abs(sharedPoint.x - normalPoint.x)).toBeGreaterThanOrEqual(40);
    expect(showErdLabel('z', anchors, 'a')).toBe(true);
    expect(showErdLabel('a', anchors, 'a')).toBe(true);
    expect(showErdLabel('b', anchors, 'a')).toBe(false);
  });

  it('keeps the entire label box out of tables', () => {
    const edge = route('a', [[0, 0], [200, 0]]);
    const anchors = placeErdLabels([edge], [{ x: 70, y: -30, width: 60, height: 60 }]);
    const anchor = anchors.get('a')!, point = labelPoint(edge.points, anchor)!;
    expect(point.x + anchor.width / 2 + 4 < 70 || point.x - anchor.width / 2 - 4 > 130).toBe(true);
  });

  it('does not force text into a segment too short to fit it', () => {
    const edge = route('a', [[0, 0], [20, 0]]);
    const anchors = placeErdLabels([edge], []);
    expect(anchors.has('a')).toBe(false);
    expect(showErdLabel('a', anchors, 'a')).toBe(false);
  });

  it('hides a label during drag if its box would cover a nearby table despite the path staying outside', () => {
    const edge = route('a', [[0, 0], [200, 0]]);
    const anchor = placeErdLabels([edge], []).get('a')!;
    expect(labelPoint(edge.points, anchor)).not.toBeNull();
    expect(labelPoint(edge.points, anchor, [{ x: 80, y: 7, width: 40, height: 100 }])).toBeNull();
  });

  it('is deterministic regardless of render order and follows a translated route during drag', () => {
    const a = route('a', [[0, 0], [200, 0]]), b = route('b', [[100, -100], [100, 100]]);
    const anchors = placeErdLabels([a, b], []);
    expect([...placeErdLabels([b, a], [])]).toEqual([...anchors]);
    const before = labelPoint(a.points, anchors.get('a')!)!;
    const after = labelPoint(a.points.map(p => ({ x: p.x + 50, y: p.y + 20 })), anchors.get('a')!)!;
    expect(after).toEqual({ x: before.x + 50, y: before.y + 20 });
  });
});
