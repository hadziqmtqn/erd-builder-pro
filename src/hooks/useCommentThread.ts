import { useCallback, useEffect, useRef, useState } from 'react';
import {
  COMMENT_STEP, deleteCommentThread, editComment, fetchAnchorPage, hiddenCount, markCommentRead, postComment, setCommentStatus, visibleMessages,
  type CommentAnchorRef, type CommentFileRef, type CommentMessage, type CommentPage,
} from '@/lib/fileComments';

/** One comment thread (one anchor): newest 10 messages, "Show old comments" for 10 more, send, edit, resolve, and delete. */
export function useCommentThread(file: CommentFileRef, anchor: CommentAnchorRef, enabled = true) {
  const [messages, setMessages] = useState<CommentMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [cursor, setCursor] = useState<CommentPage['nextCursor']>(null);
  const [shown, setShown] = useState(COMMENT_STEP);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const key = `${file.projectId}|${file.featureType}|${file.fileId}|${anchor.type}|${anchor.id}`;

  const apply = useCallback((page: CommentPage, merge: boolean) => {
    setThreadId(page.threadId);
    setCreatedBy(page.createdBy);
    setStatus(page.status);
    setCursor(page.nextCursor);
    setMessages((current) => {
      if (!merge) return page.messages;
      const known = new Set(current.map((message) => message.id));
      return [...page.messages.filter((message) => !known.has(message.id)), ...current];
    });
  }, []);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const page = await fetchAnchorPage(file, anchor);
      if (current !== requestId.current) return;
      setMessages(page.messages);
      setThreadId(page.threadId);
      setCreatedBy(page.createdBy);
      setStatus(page.status);
      setCursor(page.nextCursor);
      if (page.threadId) void markCommentRead(file, page.threadId);
    } catch (cause: any) {
      // 404 means no thread yet for a new anchor: that is an empty thread, not an error.
      if (current === requestId.current && cause?.status !== 404) setError('Could not load this comment.');
    } finally {
      if (current === requestId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    setMessages([]); setThreadId(null); setCreatedBy(null); setShown(COMMENT_STEP); setCursor(null);
    if (enabled) void load();
    return () => { requestId.current++; };
  }, [enabled, key, load]);

  const showOlder = useCallback(async () => {
    if (shown + COMMENT_STEP <= messages.length || !cursor) { setShown((count) => count + COMMENT_STEP); return; }
    setLoading(true);
    try {
      apply(await fetchAnchorPage(file, anchor, cursor), true);
      setShown((count) => count + COMMENT_STEP);
    } catch {
      setError('Could not load older comments.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, messages.length, cursor, key, apply]);

  const send = useCallback(async (body: string) => {
    const text = body.trim();
    if (!text || sending) return false;
    setSending(true);
    setError('');
    try {
      await postComment(file, anchor, text);
      await load();
      return true;
    } catch (cause: any) {
      setError(cause?.status === 409 ? 'This comment was resolved. Reopen it to reply.' : 'Could not send the comment. Try again.');
      return false;
    } finally {
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sending, key, load]);

  const toggleResolved = useCallback(async () => {
    if (!threadId) return;
    try {
      await setCommentStatus(file, threadId, status === 'open' ? 'resolved' : 'open');
      await load();
    } catch {
      setError('Could not update this comment. Refresh and try again.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, status, key, load]);

  const edit = useCallback(async (message: CommentMessage, body: string) => {
    const text = body.trim();
    if (!threadId || !text || sending) return false;
    if (text === message.body) return true;
    setSending(true);
    setError('');
    try {
      await editComment(file, threadId, message, text);
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, body: text } : item));
      return true;
    } catch (cause: any) {
      setError(cause?.status === 409 ? 'This comment changed. Check the latest text and edit again.' : 'Could not edit the comment. Try again.');
      await load();
      return false;
    } finally {
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, sending, key, load]);

  const deleteThread = useCallback(async () => {
    if (!threadId || sending) return false;
    setSending(true);
    setError('');
    try {
      await deleteCommentThread(file, threadId);
      requestId.current++;
      setMessages([]); setThreadId(null); setCreatedBy(null); setCursor(null);
      return true;
    } catch {
      setError('Could not delete this comment. Refresh and try again.');
      return false;
    } finally {
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, sending, key]);

  return {
    messages: visibleMessages(messages, shown),
    hidden: hiddenCount(messages.length, shown) + (cursor ? 1 : 0),
    hasOlder: hiddenCount(messages.length, shown) > 0 || Boolean(cursor),
    total: messages.length,
    threadId, createdBy, status, loading, sending, error,
    showOlder, send, edit, toggleResolved, deleteThread, reload: load,
  };
}
