import { Extension } from '@tiptap/core';

export const NoteCommentAnchor = Extension.create({
  name: 'noteCommentAnchor',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        commentAnchorId: {
          default: null,
          parseHTML: element => element.getAttribute('data-comment-anchor-id'),
          renderHTML: attributes => attributes.commentAnchorId
            ? { 'data-comment-anchor-id': attributes.commentAnchorId }
            : {},
        },
      },
    }];
  },
});
