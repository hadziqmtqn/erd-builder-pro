import { useCallback, useRef, type MutableRefObject } from 'react';
import type { Editor } from '@tiptap/react';

type CommentRequest = { id: string; beforeContent: string; content: string };

interface UseNoteCommentAnchorParams {
  editor: Editor | null;
  onRequestComment?: (request: CommentRequest) => Promise<boolean>;
  onChangeTimeoutRef: MutableRefObject<NodeJS.Timeout | null>;
  isReadOnly: boolean;
}

export function useNoteCommentAnchor({ editor, onRequestComment, onChangeTimeoutRef, isReadOnly }: UseNoteCommentAnchorParams) {
  const requestInFlightRef = useRef(false);

  const requestCommentAtBlock = useCallback(async (blockPosition: number): Promise<boolean> => {
    if (!editor || !onRequestComment || requestInFlightRef.current) return false;
    const block = editor.state.doc.nodeAt(blockPosition);
    if (!block || (block.type.name !== 'paragraph' && block.type.name !== 'heading')) return false;

    if (onChangeTimeoutRef.current) {
      clearTimeout(onChangeTimeoutRef.current);
      onChangeTimeoutRef.current = null;
    }

    const beforeContent = editor.getHTML();
    const id = block.attrs.commentAnchorId || crypto.randomUUID();
    const isNewAnchor = !block.attrs.commentAnchorId;
    if (isNewAnchor) {
      const transaction = editor.state.tr.setNodeMarkup(blockPosition, undefined, {
        ...block.attrs,
        commentAnchorId: id,
      });
      transaction.setMeta('noteCommentAnchor', true).setMeta('addToHistory', false);
      editor.view.dispatch(transaction);
    }

    requestInFlightRef.current = true;
    editor.setEditable(false);
    try {
      let saved = false;
      try {
        saved = await onRequestComment({ id, beforeContent, content: editor.getHTML() });
      } catch {
        saved = false;
      }
      if (!saved && isNewAnchor) {
        const current = editor.state.doc.nodeAt(blockPosition);
        if (current?.attrs.commentAnchorId === id) {
          const transaction = editor.state.tr.setNodeMarkup(blockPosition, undefined, {
            ...current.attrs,
            commentAnchorId: null,
          });
          transaction.setMeta('noteCommentAnchor', true).setMeta('addToHistory', false);
          editor.view.dispatch(transaction);
        }
      }
      return saved;
    } finally {
      editor.setEditable(!isReadOnly);
      requestInFlightRef.current = false;
    }
  }, [editor, isReadOnly, onChangeTimeoutRef, onRequestComment]);

  const requestCommentAtSelection = useCallback(() => {
    if (!editor) return;
    const resolved = editor.state.doc.resolve(editor.state.selection.from);
    for (let depth = resolved.depth; depth > 0; depth--) {
      const node = resolved.node(depth);
      if (node.type.name === 'paragraph' || node.type.name === 'heading') {
        void requestCommentAtBlock(resolved.before(depth));
        return;
      }
    }
  }, [editor, requestCommentAtBlock]);

  return { requestCommentAtBlock, requestCommentAtSelection };
}
