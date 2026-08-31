import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { transactionsTouchTable } from '../tiptap/smart-table';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block' },
    table: { group: 'block', atom: true },
    text: { group: 'inline' },
  },
});

describe('transactionsTouchTable', () => {
  it('skips paragraph-only changes and detects table changes', () => {
    const paragraph = schema.nodes.paragraph.create(null, schema.text('hello'));
    const table = schema.nodes.table.create();

    const paragraphState = EditorState.create({ schema, doc: schema.nodes.doc.create(null, [paragraph]) });
    expect(transactionsTouchTable([paragraphState.tr.insertText('!', 2)])).toBe(false);

    const tableState = EditorState.create({ schema, doc: schema.nodes.doc.create(null, [table, paragraph]) });
    expect(transactionsTouchTable([tableState.tr.delete(0, table.nodeSize)])).toBe(true);
  });
});
