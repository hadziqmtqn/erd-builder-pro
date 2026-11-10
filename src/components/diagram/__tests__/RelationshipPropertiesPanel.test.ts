import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RelationshipPropertiesPanel from '../RelationshipPropertiesPanel';

const noop = () => {};
const node = (id: string, name: string, columns: { id: string; name: string }[]) => ({ id, position: { x: 0, y: 0 }, data: { id, name, columns } }) as any;
const nodes = [node('1', 'users', [{ id: 'c1', name: 'id' }]), node('2', 'orders', [{ id: 'c2', name: 'user_id' }])];
const edge = {
  id: 'e1', source: '2', target: '1', sourceHandle: 'col-c2-source', targetHandle: 'col-c1-target', label: '1:N',
  data: { constraint_name: 'fk_orders_user', on_delete: 'CASCADE' },
} as any;
const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(RelationshipPropertiesPanel, {
  selectedEdge: edge, nodes, onUpdateEdge: noop, onFlipEdge: noop, onDeleteEdge: noop, ...props,
}));

const disabled = (html: string, slot: string) =>
  (html.match(/<[a-z]+[^>]*>/g) ?? ([] as string[])).filter(tag => tag.includes('disabled=""') && tag.includes(`data-slot="${slot}"`)).length;

describe('BUG-051 relationship panel', () => {
  it('shows a read-only relationship with every control disabled and no Move or Delete', () => {
    const html = render({ readOnly: true });
    expect(html).toContain('orders.user_id');
    expect(html).toContain('value="fk_orders_user"');
    expect(html).toContain('Cascade');
    expect(disabled(html, 'select-trigger')).toBe(3);
    expect(disabled(html, 'input')).toBe(1);
    expect(html).not.toContain('Move Edge Side');
    expect(html).not.toContain('Delete Relationship');
    expect(render({ readOnly: true, moveOnly: true })).not.toContain('Move Edge Side');
  });

  it('keeps the controls for an editor and the move-only view', () => {
    const editable = render({});
    expect(disabled(editable, 'select-trigger') + disabled(editable, 'input')).toBe(0);
    expect(editable).toContain('Delete Relationship');
    expect(render({ moveOnly: true })).toContain('Move Edge Side');
  });
});
