import { expect, it } from 'vitest';
import { pinRecordColumns, recordColumnWindow } from '../record-column-window';

it('bounds work to visible columns plus a buffer for 50×56 records', () => {
  const widths = Array(56).fill(50);
  expect(recordColumnWindow(widths, 0, 1000, 40)).toEqual({ start: 0, end: 24 });
  expect(recordColumnWindow(widths, 1000, 1000, 40)).toEqual({ start: 15, end: 44 });
  expect(recordColumnWindow(widths, 1840, 1000, 40)).toEqual({ start: 32, end: 56 });
  expect(recordColumnWindow(widths, 20, 1000, 40, 0).end).toBeLessThanOrEqual(24);
});
it('accounts for resized columns, zero-width/empty containers and no selection column', () => {
  expect(recordColumnWindow([], 0, 600)).toEqual({ start: 0, end: 0 });
  expect(recordColumnWindow(Array(56).fill(50), 0, 0)).toEqual({ start: 0, end: 12 });
  expect(recordColumnWindow([500, 80, 120, 200], 550, 100, 0, 0)).toEqual({ start: 1, end: 3 });
  expect(recordColumnWindow([500, 80, 120, 200], 0, 2000)).toEqual({ start: 0, end: 4 });
});
it('pins an editing cell or open cell menu even when it scrolls outside the window', () => {
  const columns = Array.from({ length: 56 }, (_, i) => `col_${i}`);
  expect(pinRecordColumns({ start: 20, end: 40 }, columns, ['col_3', 'col_50'])).toEqual({ start: 3, end: 51 });
  expect(pinRecordColumns({ start: 20, end: 40 }, columns, [null, 'missing'])).toEqual({ start: 20, end: 40 });
  expect(pinRecordColumns({ start: 20, end: 40 }, columns.slice(0, 10), ['col_3'])).toEqual({ start: 3, end: 10 });
});
