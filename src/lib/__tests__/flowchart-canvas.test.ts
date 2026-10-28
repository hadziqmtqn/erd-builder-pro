import { expect, it } from 'vitest';
import { applySelectChanges, newSymbolPosition, normalizeFlowchartCanvas } from '../flowchart-canvas';

it('retains an intentionally empty canvas and a deleted last connector', () => {
  expect(normalizeFlowchartCanvas([], [])).toEqual({ nodes: [], edges: [] });
  expect(normalizeFlowchartCanvas([{ id: 'a', data: {}, position: { x: 0, y: 0 } }] as any, []).edges).toEqual([]);
});

it('makes imported connectors addressable and removes orphan edges', () => {
  const nodes = [1, 2].map(id => ({ id, data: {}, position: { x: 0, y: 0 } }));
  const canvas = normalizeFlowchartCanvas(nodes as any, [
    { source: 1, target: 2 }, { id: 5, source: 2, target: 1 },
    { id: 5, source: 1, target: 2 }, { source: 1, target: 99 },
  ] as any);
  expect(canvas.nodes.map(node => node.id)).toEqual(['1', '2']);
  expect(canvas.edges).toHaveLength(3);
  expect(new Set(canvas.edges.map(edge => edge.id)).size).toBe(3);
  expect(canvas.edges.every(edge => typeof edge.id === 'string' && typeof edge.source === 'string')).toBe(true);
});

it('tracks a Shift+drag selection from React Flow select changes', () => {
  const box = applySelectChanges([], [{ id: 'a', selected: true }, { id: 'b', selected: true }]);
  expect(box).toEqual(['a', 'b']);
  expect(applySelectChanges(box, [{ id: 'a', selected: true }])).toBe(box);
  expect(applySelectChanges(box, [{ id: 'a', selected: false }, { id: 'b', selected: false }])).toEqual([]);
});

it('centres a new symbol on the visible canvas and steps past one already there', () => {
  expect(newSymbolPosition({ x: 1000, y: 500 }, [])).toEqual({ x: 920, y: 465 });
  expect(newSymbolPosition({ x: 1000, y: 500 }, [{ position: { x: 920, y: 465 } }, { position: { x: 944, y: 489 } }])).toEqual({ x: 968, y: 513 });
});
