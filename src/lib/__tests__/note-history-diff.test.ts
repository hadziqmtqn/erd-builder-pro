import { describe, expect, it } from 'vitest';
import { buildNoteHistoryDiff, buildRichNoteHistoryDiff, noteHtmlToText } from '../note-history-diff';

describe('note history diff', () => {
  it('compares note characters while preserving block breaks', () => {
    expect(noteHtmlToText('<p>Hello</p><p>world</p>')).toContain('Hello');
    const parts = buildNoteHistoryDiff('<p>Hello old</p>', '<p>Hello new</p>');
    expect(parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'old', removed: true }),
      expect.objectContaining({ value: 'new', added: true }),
    ]));
  });

  it('groups text changes by word instead of individual characters', () => {
    const parts = buildNoteHistoryDiff('<p>Hello world</p>', '<p>Hallo world</p>');

    expect(parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'Hello', removed: true }),
      expect.objectContaining({ value: 'Hallo', added: true }),
    ]));
    expect(parts.some(part => part.value === 'ell' || part.value === 'all')).toBe(false);
  });

  it('keeps block and inline formatting changes in the preview model', () => {
    const blocks = buildRichNoteHistoryDiff(
      '<h2>Project title</h2><p>Regular text</p>',
      '<h1>Project title</h1><p><strong>Regular text</strong></p>',
    );

    expect(blocks[0]).toMatchObject({
      blockTag: 'h1',
      formatChanged: true,
      formatLabel: 'Heading 2 · Regular → Heading 1 · Regular',
    });
    expect(blocks[0]?.parts[0]).toMatchObject({ formatChanged: true });
    expect(blocks[1]?.parts[0]).toMatchObject({
      formatChanged: true,
      formatLabel: 'Regular → Bold',
      format: { marks: ['bold'] },
    });
  });

  it('preserves alignment and common inline marks', () => {
    const blocks = buildRichNoteHistoryDiff(
      '<p style="text-align:left">Text</p>',
      '<p style="text-align:center"><u><em>Text</em></u></p>',
    );

    expect(blocks[0]).toMatchObject({ alignment: 'center', formatChanged: true });
    expect(blocks[0]?.parts[0]).toMatchObject({
      format: { alignment: 'center', marks: ['italic', 'underline'] },
      formatChanged: true,
    });
  });
});
