import { describe, expect, it } from 'vitest';
import { reorderTableItems } from '../tiptap/table-drag';

describe('reorderTableItems', () => {
  it('moves a contiguous selection of rows below its target', () => {
    expect(reorderTableItems(['row-1', 'row-2', 'row-3', 'row-4'], { start: 1, end: 3 }, 4))
      .toEqual(['row-1', 'row-4', 'row-2', 'row-3']);
  });

  it('moves a column range before its target', () => {
    expect(reorderTableItems(['a', 'b', 'c', 'd'], { start: 2, end: 3 }, 0))
      .toEqual(['c', 'a', 'b', 'd']);
  });

  it('rejects dropping inside the selected range', () => {
    expect(reorderTableItems(['a', 'b', 'c'], { start: 1, end: 2 }, 2)).toBeNull();
  });
});
