import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import { getERDTableNeighbourIds } from '../erd-canvas-focus';

const edge = (id: string, source: string, target: string): Edge => ({ id, source, target });

describe('getERDTableNeighbourIds', () => {
  it('returns each directly related table once, in either direction, without the table itself', () => {
    const edges = [
      edge('e1', 'orders', 'users'),
      edge('e2', 'orders', 'users'),
      edge('e3', 'users', 'roles'),
      edge('e4', 'users', 'users'),
      edge('e5', 'orders', 'coupons'),
    ];

    expect(getERDTableNeighbourIds('users', edges)).toEqual(['orders', 'roles']);
    expect(getERDTableNeighbourIds('tags', edges)).toEqual([]);
  });
});
