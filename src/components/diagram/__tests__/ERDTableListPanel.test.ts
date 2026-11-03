import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ERDTableListPanel, filterERDTables } from '../ERDTableListPanel';
import { ERDRelationshipListPanel } from '../ERDRelationshipListPanel';
import type { ERDRelationshipRow } from '@/lib/erd-relationship-list';

const noop = () => {};

describe('filterERDTables', () => {
  const node = (id: string, name: string) => ({ id, data: { name } }) as any;

  it('filters table names case-insensitively and sorts them', () => {
    const nodes = [node('2', 'user_roles'), node('1', 'Users'), node('3', 'posts')];
    expect(filterERDTables(nodes, 'USER').map(item => item.id)).toEqual(['2', '1']);
  });
});

describe('ERD-001 active row in the Properties lists', () => {
  const node = (id: string, name: string) => ({ id, data: { name, columns: [] } }) as any;
  const relationship = (id: string, fromTable: string, toTable: string): ERDRelationshipRow => ({
    id, fromNodeId: fromTable, fromTable, fromColumn: `${toTable}_id`, toNodeId: toTable, toTable, toColumn: 'id', type: '1:N',
  });

  it('marks only the last clicked table and shows the search kept by the parent', () => {
    const html = renderToStaticMarkup(createElement(ERDTableListPanel, {
      nodes: [node('1', 'users'), node('2', 'user_roles'), node('3', 'posts')],
      search: 'user', onSearchChange: noop, activeId: '2', onSelect: noop, onEdit: noop,
    }));
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="true"[^>]*title="Jump to user_roles"/);
    expect(html).toContain('value="user"');
    expect(html).toContain('Showing 2 of 3 tables');
  });

  it('marks only the last clicked relationship', () => {
    const rows = [relationship('a', 'orders', 'users'), relationship('b', 'posts', 'users')];
    const html = renderToStaticMarkup(createElement(ERDRelationshipListPanel, {
      rows, search: '', onSearchChange: noop, activeId: 'b', onSelect: noop, onEdit: noop,
    }));
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="true"[^>]*title="Show posts\.users_id → users\.id"/);
  });

  it('marks nothing when the active row is filtered out or cleared', () => {
    const props = { nodes: [node('1', 'users'), node('2', 'posts')], onSearchChange: noop, onSelect: noop, onEdit: noop };
    expect(renderToStaticMarkup(createElement(ERDTableListPanel, { ...props, search: 'posts', activeId: '1' }))).not.toContain('aria-current="true"');
    expect(renderToStaticMarkup(createElement(ERDTableListPanel, { ...props, search: '', activeId: null }))).not.toContain('aria-current="true"');
  });
});
