import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { generateErdSVG } from '../generateErdSVG';

const nodes: Node<Entity>[] = [
  {
    id: 'users', position: { x: -120, y: 20 }, measured: { width: 260, height: 122 }, data: {
      id: 'users', name: 'users & admins', x: -120, y: 20, color: '#6366f1',
      columns: [{ id: 'id', name: 'id <primary>', type: 'UUID', is_pk: true, is_nullable: false }],
    },
  },
  {
    id: 'posts', position: { x: 240, y: 40 }, measured: { width: 220, height: 162 }, data: {
      id: 'posts', name: 'posts', x: 240, y: 40, color: '#10b981',
      columns: [
        { id: 'id', name: 'id', type: 'UUID', is_pk: true, is_nullable: false },
        { id: 'user_id', name: 'user_id', type: 'UUID', is_pk: false, is_nullable: false, _is_fk: true },
      ],
    },
  },
];

const edges: Edge[] = [{ id: 'posts-users', source: 'posts', target: 'users', sourceHandle: 'col-user_id-source-l', targetHandle: 'col-id-target-r', type: 'smoothstep' }];

describe('generateErdSVG', () => {
  it('creates a standalone SVG with escaped table data and relationship marker', () => {
    const svg = generateErdSVG(nodes, edges, 'dark');

    expect(svg).toContain('<svg');
    expect(svg).toContain('font-family="Inter, Helvetica, Arial, sans-serif"');
    expect(svg).toContain('users &amp; admins');
    expect(svg).toContain('id &lt;primary&gt;');
    expect(svg).toContain('marker-end="url(#arrow)"');
    expect(svg).toContain('viewBox="-168 -28 676 278"');
  });

  it('returns an empty string for an empty ERD', () => {
    expect(generateErdSVG([], [], 'light')).toBe('');
  });
});
