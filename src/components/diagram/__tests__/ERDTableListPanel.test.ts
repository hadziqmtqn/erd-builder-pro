import { describe, expect, it } from 'vitest';
import { filterERDTables } from '../ERDTableListPanel';

describe('filterERDTables', () => {
  const node = (id: string, name: string) => ({ id, data: { name } }) as any;

  it('filters table names case-insensitively and sorts them', () => {
    const nodes = [node('2', 'user_roles'), node('1', 'Users'), node('3', 'posts')];
    expect(filterERDTables(nodes, 'USER').map(item => item.id)).toEqual(['2', '1']);
  });
});
