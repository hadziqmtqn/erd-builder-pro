import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { CompanionReference } from './CompanionReference';

describe('CompanionReference', () => {
  it.each(['flowchart', 'drawing'])('inserts a %s card between blocks', targetType => {
    const editor = new Editor({
      extensions: [StarterKit, CompanionReference],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    const inserted = editor.commands.insertContentAt({ from: 0, to: 2 }, [
      { type: 'companionReference', attrs: { targetType, targetUid: 'file-1', title: 'Preview' } },
      { type: 'paragraph' },
    ]);

    expect(inserted).toBe(true);
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: 'companionReference', attrs: { targetType } });
    editor.destroy();
  });
});
