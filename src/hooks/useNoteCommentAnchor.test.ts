import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, expect, it, vi } from 'vitest';
import { NoteCommentAnchor } from '@/components/editor/extensions/NoteCommentAnchor';

vi.mock('react', () => ({ useCallback: (fn: unknown) => fn, useRef: (current: unknown) => ({ current }) }));

import { useNoteCommentAnchor } from './useNoteCommentAnchor';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));

// The Note editor saves after every `update` whose transaction lacks the `noteCommentAnchor` meta (TiptapEditor's handleUpdate).
function noteEditor(commentAnchorId: string | null) {
  const editor = new Editor({
    extensions: [StarterKit, NoteCommentAnchor],
    content: { type: 'doc', content: [{ type: 'paragraph', attrs: { commentAnchorId }, content: [{ type: 'text', text: 'Hello' }] }] },
  });
  // getHTML needs a DOM, which the node test environment does not have.
  editor.getHTML = () => JSON.stringify(editor.getJSON());
  const updates: boolean[] = [];
  editor.on('update', ({ transaction }) => updates.push(Boolean(transaction.getMeta('noteCommentAnchor'))));
  editors.push(editor);
  return { editor, updates };
}

function anchorOf(editor: Editor) {
  return editor.state.doc.nodeAt(0)?.attrs.commentAnchorId ?? null;
}

it('opens a comment on an anchored block without an update the Note autosave would save (BUG-085)', async () => {
  const { editor, updates } = noteEditor('a1');
  const before = editor.getHTML();
  const onRequestComment = vi.fn(async () => {
    expect(editor.isEditable).toBe(false);
    return true;
  });
  const { requestCommentAtBlock } = useNoteCommentAnchor({ editor, onRequestComment, onChangeTimeoutRef: { current: null }, isReadOnly: false });

  await expect(requestCommentAtBlock(0)).resolves.toBe(true);

  expect(onRequestComment).toHaveBeenCalledWith({ id: 'a1', beforeContent: before, content: before });
  expect(updates).toEqual([]);
  expect(editor.isEditable).toBe(true);
});

it('adds a new anchor with only the anchor update, which the Note autosave skips', async () => {
  const { editor, updates } = noteEditor(null);
  const { requestCommentAtBlock } = useNoteCommentAnchor({ editor, onRequestComment: async () => true, onChangeTimeoutRef: { current: null }, isReadOnly: false });

  await expect(requestCommentAtBlock(0)).resolves.toBe(true);

  expect(anchorOf(editor)).toEqual(expect.any(String));
  expect(updates).toEqual([true]);
  expect(editor.isEditable).toBe(true);
});

it('removes a new anchor that was not saved, again without an update the autosave would save', async () => {
  const { editor, updates } = noteEditor(null);
  const { requestCommentAtBlock } = useNoteCommentAnchor({ editor, onRequestComment: async () => false, onChangeTimeoutRef: { current: null }, isReadOnly: false });

  await expect(requestCommentAtBlock(0)).resolves.toBe(false);

  expect(anchorOf(editor)).toBeNull();
  expect(updates).toEqual([true, true]);
  expect(editor.isEditable).toBe(true);
});

it('leaves a read-only Note read-only after the comment request', async () => {
  const { editor, updates } = noteEditor('a1');
  editor.setEditable(false, false);
  const { requestCommentAtBlock } = useNoteCommentAnchor({ editor, onRequestComment: async () => true, onChangeTimeoutRef: { current: null }, isReadOnly: true });

  await expect(requestCommentAtBlock(0)).resolves.toBe(true);

  expect(updates).toEqual([]);
  expect(editor.isEditable).toBe(false);
});
