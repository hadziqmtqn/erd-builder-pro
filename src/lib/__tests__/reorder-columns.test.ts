import { describe, expect, it } from 'vitest';
import type { Column } from '@/types';
import { reorderColumns } from '../reorder-columns';

const columns = ['id', 'name', 'email'].map((id, sort_order) => ({ id, name: id, type: 'TEXT', is_pk: false, is_nullable: true, sort_order } satisfies Column));

describe('reorderColumns', () => {
  it('moves a column and normalizes its sort order', () => {
    expect(reorderColumns(columns, 'email', 'id', 'before')?.map(column => [column.id, column.sort_order])).toEqual([
      ['email', 0],
      ['id', 1],
      ['name', 2],
    ]);
  });
});
