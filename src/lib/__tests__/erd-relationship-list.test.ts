import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { buildERDRelationshipRows, filterERDRelationships } from '../erd-relationship-list';

const node = (id: string, name: string, columns: string[]): Node<Entity> => ({
  id,
  type: 'entity',
  position: { x: 0, y: 0 },
  data: { id, name, x: 0, y: 0, color: '#000', columns: columns.map(column => ({ id: `${id}-${column}`, name: column, type: 'int', is_pk: column === 'id', is_nullable: false })) },
});

const edge = (id: string, source: string, sourceColumn: string, target: string, targetColumn: string, extra: Partial<Edge> = {}): Edge => ({
  id,
  source,
  target,
  sourceHandle: `col-${source}-${sourceColumn}-source`,
  targetHandle: `col-${target}-${targetColumn}-target-r`,
  ...extra,
});

const nodes = [
  node('u', 'users', ['id']),
  node('c', 'customers', ['id']),
  node('o', 'orders', ['id', 'customer_id', 'approved_by']),
];

describe('buildERDRelationshipRows', () => {
  it('lists the foreign key side first with its type and constraint name', () => {
    const rows = buildERDRelationshipRows(nodes, [
      edge('e1', 'o', 'customer_id', 'c', 'id', { label: '1:1', data: { constraint_name: ' fk_orders_customer ' } }),
    ]);

    expect(rows).toEqual([{
      id: 'e1', fromNodeId: 'o', fromTable: 'orders', fromColumn: 'customer_id',
      toNodeId: 'c', toTable: 'customers', toColumn: 'id', type: '1:1', constraintName: 'fk_orders_customer',
    }]);
  });

  it('puts the FK side first when the edge was drawn from the PK column', () => {
    const [row] = buildERDRelationshipRows(nodes, [edge('e1', 'c', 'id', 'o', 'customer_id')]);

    expect(`${row.fromTable}.${row.fromColumn} → ${row.toTable}.${row.toColumn}`).toBe('orders.customer_id → customers.id');
  });

  it('defaults to 1:N, omits an empty constraint name, and skips edges whose table is gone', () => {
    const rows = buildERDRelationshipRows(nodes, [
      edge('e1', 'o', 'approved_by', 'u', 'id', { label: 'unknown', data: { constraint_name: '' } }),
      edge('e2', 'o', 'customer_id', 'missing', 'id'),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('1:N');
    expect(rows[0]).not.toHaveProperty('constraintName');
  });
});

describe('filterERDRelationships', () => {
  const rows = buildERDRelationshipRows(nodes, [
    edge('e1', 'o', 'customer_id', 'c', 'id'),
    edge('e2', 'o', 'approved_by', 'u', 'id'),
    edge('e3', 'c', 'id', 'u', 'id'),
  ]);

  it('sorts by source table, then source column', () => {
    expect(filterERDRelationships(rows, '').map(row => row.id)).toEqual(['e3', 'e2', 'e1']);
  });

  it('matches table and column names on either side, case-insensitively', () => {
    expect(filterERDRelationships(rows, 'USERS').map(row => row.id)).toEqual(['e3', 'e2']);
    expect(filterERDRelationships(rows, ' customer_id ').map(row => row.id)).toEqual(['e1']);
    expect(filterERDRelationships(rows, 'orders.approved').map(row => row.id)).toEqual(['e2']);
    expect(filterERDRelationships(rows, 'nothing')).toEqual([]);
  });
});
