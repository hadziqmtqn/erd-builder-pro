import { expect, it } from 'vitest';
import { sameCanvasItems } from '../erd-canvas-equality';

it('skips unchanged canvas arrays and reuses unchanged item references', () => {
  const items = [{ id: 'table', data: { name: 'table', columns: [] } }];
  expect(sameCanvasItems(items, items)).toBe(true);
  expect(sameCanvasItems(items, [...items])).toBe(true);
  expect(sameCanvasItems(items, [])).toBe(false);
});
it('does not swallow FK metadata, enum, indexes or visibility updates behind a partial field comparator', () => {
  const table = { id: 'table', data: { columns: [{ enum_values: 'a' }], indexes: [], collapsed: false } };
  const edge = { id: 'fk', data: { on_delete: 'NO ACTION' } };
  expect(sameCanvasItems([edge], [{ ...edge, data: { on_delete: 'CASCADE' } }])).toBe(false);
  expect(sameCanvasItems([table], [{ ...table, data: { ...table.data, collapsed: true } }])).toBe(false);
  expect(sameCanvasItems([table], [{ ...table, data: { ...table.data, columns: [{ enum_values: 'a,b' }] } }])).toBe(false);
});
