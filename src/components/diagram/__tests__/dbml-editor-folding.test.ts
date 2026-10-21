import { expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { dbmlFoldRange } from '../dbml-editor-folding';

it('folds table and nested blocks independently', () => {
  const text = 'Table workflows {\n id int [pk]\n indexes {\n id\n }\n}\nEnum status {\n active\n}';
  const state = EditorState.create({ doc: text });
  for (const lineNumber of [1, 3, 7]) {
    const line = state.doc.line(lineNumber);
    const range = dbmlFoldRange(state, line.from, line.to)!;
    expect(range).not.toBeNull();
    expect(text[range.from - 1]).toBe('{');
    expect(text[range.to]).toBe('}');
  }
});

it('ignores braces in strings, multiline notes and comments', () => {
  const text = "// Fake {\nTable users {\n note: 'text } { here'\n /* } */\n note: '''\n } {\n '''\n id int // }\n}\n";
  const state = EditorState.create({ doc: text });
  expect(dbmlFoldRange(state, 0, state.doc.line(1).to)).toBeNull();
  const line = state.doc.line(2);
  expect(dbmlFoldRange(state, line.from, line.to)).toEqual({ from: text.indexOf('{', line.from) + 1, to: text.lastIndexOf('}') });
});

it('does not fold unfinished or single-line definitions', () => {
  for (const doc of ['Table users {', 'Table users { id int }']) {
    const state = EditorState.create({ doc });
    expect(dbmlFoldRange(state, 0, state.doc.line(1).to)).toBeNull();
  }
});
