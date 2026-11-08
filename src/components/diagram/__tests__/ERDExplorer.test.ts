import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ERDExplorer, INITIAL_EXPLORER_STATE } from '../ERDExplorer';

const noop = () => {};
const node = (id: string, name: string) => ({ id, position: { x: 0, y: 0 }, data: { id, name, columns: [] } }) as any;
const nodes = [node('1', 'users'), node('2', 'orders')];
const editing = { onEditTable: noop, onUpdateEdge: noop, onFlipEdge: noop, onDeleteEdge: noop };
const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(ERDExplorer, {
  nodes, edges: [], state: INITIAL_EXPLORER_STATE, onChange: noop, onHighlight: noop, onClose: noop, shortcutLabel: '⇧⌘F', ...props,
}));

describe('ERD-004 Explorer', () => {
  it('shows the edit buttons only when the diagram can be edited', () => {
    expect(render({ editing })).toContain('aria-label="Edit users properties"');
    const readOnly = render({});
    expect(readOnly).not.toContain('Edit users properties');
    expect(readOnly).toContain('Find a table on the canvas.');
  });

  it('keeps the search and active row it is given, so coming back from the popover changes nothing', () => {
    const html = render({ editing, state: { ...INITIAL_EXPLORER_STATE, tableSearch: 'ord', activeTableId: '2' } });
    expect(html).toContain('value="ord"');
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toContain('Showing 1 of 2 tables');
  });

  it('stays mounted but invisible behind the floating table editor', () => {
    expect(render({ editing, hidden: true })).toMatch(/aria-label="Explorer" aria-hidden="true" class="[^"]*invisible/);
  });
});
