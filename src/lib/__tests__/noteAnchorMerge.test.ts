import { describe, expect, it } from 'vitest';
import { mergeServerCommentAnchors } from '../noteAnchorMerge';

describe('mergeServerCommentAnchors', () => {
  const server = '<p>Intro</p><p data-comment-anchor-id="a1">Body text</p>';

  it('copies an anchor when it is the only difference', () => {
    expect(mergeServerCommentAnchors(server, '<p>Intro</p><p>Body text</p>'))
      .toBe(server);
  });

  it('does not rebase a stale draft that already has the anchor', () => {
    const draft = '<p>Intro</p><p data-comment-anchor-id="a1">Body text</p><p>More</p>';
    expect(mergeServerCommentAnchors(server, draft)).toBeNull();
  });

  it('preserves a real content conflict without comment anchors (SH-002)', () => {
    expect(mergeServerCommentAnchors('<p>Editor A saved</p>', '<p>Editor B draft</p>')).toBeNull();
  });

  it('does not overwrite another block while copying a new anchor', () => {
    expect(mergeServerCommentAnchors(server, '<p>Intro edited</p><p>Body text</p>')).toBeNull();
  });

  it('does not lose formatting changes that preserve the same text', () => {
    expect(mergeServerCommentAnchors(server, '<p><strong>Intro</strong></p><p>Body text</p>')).toBeNull();
  });

  it('gives up when the anchored block was edited or removed', () => {
    expect(mergeServerCommentAnchors(server, '<p>Intro</p><p>Body changed</p>')).toBeNull();
    expect(mergeServerCommentAnchors(server, '<p>Intro</p>')).toBeNull();
  });

  it('keeps headings and the tag type', () => {
    expect(mergeServerCommentAnchors('<p>Title</p><h2 data-comment-anchor-id="h">Title</h2>', '<p>Title</p><h2>Title</h2>'))
      .toBe('<p>Title</p><h2 data-comment-anchor-id="h">Title</h2>');
  });

  it('keeps the anchor on the correct block when paragraph text repeats', () => {
    const repeated = '<p>Same</p><p data-comment-anchor-id="a">Same</p>';
    expect(mergeServerCommentAnchors(repeated, '<p>Same</p><p>Same</p>')).toBe(repeated);
  });

  it('preserves local anchors on other blocks', () => {
    expect(mergeServerCommentAnchors('<p>A</p><p data-comment-anchor-id="b">B</p>', '<p data-comment-anchor-id="a">A</p><p>B</p>'))
      .toBe('<p data-comment-anchor-id="a">A</p><p data-comment-anchor-id="b">B</p>');
  });

  it('keeps a conflict when the same block has different anchor ids', () => {
    expect(mergeServerCommentAnchors('<p data-comment-anchor-id="server">A</p>', '<p data-comment-anchor-id="draft">A</p>')).toBeNull();
  });
});
