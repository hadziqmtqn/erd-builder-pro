import type { EditorState } from '@codemirror/state';

/** DBML blocks are not SQL syntax; ignore braces inside quoted text and comments. */
export function dbmlFoldRange(state: EditorState, lineStart: number, lineEnd: number) {
  if (!state.sliceDoc(lineStart, lineEnd).includes('{')) return null;
  const source = state.doc.toString();
  let quote = '', lineComment = false, blockComment = false;
  const stack: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const char = source[i], next = source[i + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      if (char === '\\') { i++; continue; }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '*') { blockComment = true; i++; continue; }
    if ((char === '/' && next === '/') || (char === '-' && next === '-')) { lineComment = true; i++; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') stack.push(i);
    if (char === '}') {
      const open = stack.pop();
      if (open !== undefined && open >= lineStart && open <= lineEnd && i > lineEnd) return { from: open + 1, to: i };
    }
  }
  return null;
}
