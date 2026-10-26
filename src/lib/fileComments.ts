import { apiFetch } from '@/lib/api';

// Client for the per-file comment endpoints (COL-003). Comments live on their file; the Discussions panel never lists them.

export type CommentFeature = 'note' | 'diagram' | 'drawing' | 'flowchart';
export type CommentFileRef = { projectId: string; teamId: string; featureType: CommentFeature; fileId: string };
export type CommentAnchorRef = { type: string; id: string };
export type CommentMessage = { id: string; authorId: string; authorName: string; body: string; createdAt: string };
export type CommentMarker = {
  anchorType: string;
  anchorId: string;
  status: 'open' | 'resolved';
  messageCount: number;
  replyCount: number;
  unreadCount: number;
  threadId: string | null;
  rootMessage: { authorName: string; body: string; createdAt: string } | null;
  latestMessage: { authorName: string; body: string; createdAt: string } | null;
};
export type CommentPage = {
  threadId: string | null;
  /** Who started the thread: only they may delete it. */
  createdBy: string | null;
  status: 'open' | 'resolved';
  messages: CommentMessage[];
  hasMore: boolean;
  nextCursor: { createdAt: string; id: string } | null;
};

/** Messages revealed per step: the window shows this many, and "Show old comments" adds this many more. */
export const COMMENT_STEP = 10;

const base = (file: CommentFileRef) => `/api/projects/${encodeURIComponent(file.projectId)}/comments`;
const fileQuery = (file: CommentFileRef) => `feature_type=${file.featureType}&file_id=${encodeURIComponent(file.fileId)}`;

// The API answers in snake_case through the shared response layer; older paths use camelCase. Read either.
const pick = (item: any, camel: string, snake: string) => item?.[camel] ?? item?.[snake];

async function json(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || 'Comment request failed'), { status: response.status });
  return body;
}

export async function fetchCommentMarkers(file: CommentFileRef): Promise<CommentMarker[]> {
  const body = await json(await apiFetch(`${base(file)}/markers?${fileQuery(file)}`));
  return (body.markers || []).map((item: any): CommentMarker => {
    const root = pick(item, 'rootMessage', 'root_message');
    const latest = pick(item, 'latestMessage', 'latest_message');
    const preview = (message: any) => message
      ? { authorName: String(pick(message, 'authorName', 'author_name') ?? ''), body: String(message.body ?? ''), createdAt: String(pick(message, 'createdAt', 'created_at') ?? '') }
      : null;
    return {
      threadId: pick(item, 'threadId', 'thread_id') ? String(pick(item, 'threadId', 'thread_id')) : null,
      anchorType: String(pick(item, 'anchorType', 'anchor_type')),
      anchorId: String(pick(item, 'anchorId', 'anchor_id')),
      status: item.status === 'resolved' ? 'resolved' : 'open',
      messageCount: Number(pick(item, 'messageCount', 'message_count') ?? 0),
      replyCount: Number(pick(item, 'replyCount', 'reply_count') ?? 0),
      unreadCount: Number(pick(item, 'unreadCount', 'unread_count') ?? 0),
      rootMessage: preview(root),
      latestMessage: preview(latest),
    };
  });
}

export async function fetchAnchorPage(file: CommentFileRef, anchor: CommentAnchorRef, cursor?: CommentPage['nextCursor']): Promise<CommentPage> {
  const query = `${fileQuery(file)}&anchor_type=${encodeURIComponent(anchor.type)}&anchor_id=${encodeURIComponent(anchor.id)}`
    + (cursor ? `&before_created_at=${encodeURIComponent(cursor.createdAt)}&before_id=${encodeURIComponent(cursor.id)}` : '');
  const body = await json(await apiFetch(`${base(file)}/anchor?${query}`));
  const thread = (body.threads || [])[0];
  const next = pick(body, 'nextCursor', 'next_cursor');
  return {
    threadId: thread ? String(thread.id) : null,
    createdBy: thread ? String(pick(thread, 'createdBy', 'created_by') ?? '') || null : null,
    status: thread?.status === 'resolved' ? 'resolved' : 'open',
    messages: (body.messages || []).map((message: any): CommentMessage => ({
      id: String(message.id),
      authorId: String(pick(message, 'authorId', 'author_id')),
      authorName: String(pick(message, 'authorName', 'author_name') || 'Team member'),
      body: String(message.body),
      createdAt: String(pick(message, 'createdAt', 'created_at')),
    })),
    hasMore: Boolean(pick(body, 'hasMore', 'has_more')),
    nextCursor: next ? { createdAt: String(pick(next, 'createdAt', 'created_at')), id: String(next.id) } : null,
  };
}

export async function postComment(file: CommentFileRef, anchor: CommentAnchorRef, body: string): Promise<void> {
  await json(await apiFetch(base(file), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, context: { type: anchor.type, id: anchor.id, featureType: file.featureType, fileId: file.fileId } }),
  }));
  notifyCommentChange(file);
}

export async function setCommentStatus(file: CommentFileRef, threadId: string, status: 'open' | 'resolved'): Promise<void> {
  await json(await apiFetch(`${base(file)}/${encodeURIComponent(threadId)}?${fileQuery(file)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }));
  notifyCommentChange(file);
}

/** The author edits their own message; `expectedBody` makes the server refuse an edit over a newer change. */
export async function editComment(file: CommentFileRef, threadId: string, message: Pick<CommentMessage, 'id' | 'body'>, body: string): Promise<void> {
  await json(await apiFetch(`${base(file)}/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(message.id)}?${fileQuery(file)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, expectedBody: message.body }),
  }));
  notifyCommentChange(file);
}

/** The thread's creator deletes it with all its messages; the server answers not-found for anyone else. */
export async function deleteCommentThread(file: CommentFileRef, threadId: string): Promise<void> {
  await json(await apiFetch(`${base(file)}/${encodeURIComponent(threadId)}?${fileQuery(file)}`, { method: 'DELETE' }));
  notifyCommentChange(file);
}

function notifyCommentChange(file: CommentFileRef) {
  window.dispatchEvent(new CustomEvent('collaboration-updated', { detail: { teamId: file.teamId, projectId: file.projectId } }));
}

export async function markCommentRead(file: CommentFileRef, threadId: string): Promise<void> {
  await apiFetch(`${base(file)}/${encodeURIComponent(threadId)}/read?${fileQuery(file)}`, { method: 'POST' }).catch(() => undefined);
}

/** The newest `count` messages of an oldest-first list. */
export function visibleMessages<T>(messages: readonly T[], count: number): T[] {
  return count >= messages.length ? [...messages] : messages.slice(messages.length - count);
}

/** How many loaded messages are still hidden behind "Show old comments". */
export function hiddenCount(loaded: number, count: number): number {
  return Math.max(loaded - count, 0);
}

/** Whether saved file data (JSON text or parsed) already holds the node or edge a comment anchors to; the server rejects an anchor it does not hold. */
export function storedHasAnchor(data: unknown, anchor: CommentAnchorRef): boolean {
  let parsed = data;
  if (typeof data === 'string') {
    try { parsed = JSON.parse(data); } catch { return false; }
  }
  const items = (parsed as { nodes?: unknown; edges?: unknown } | null)?.[anchor.type === 'relationship' ? 'edges' : 'nodes'];
  return Array.isArray(items) && items.some((item) => item?.id === anchor.id);
}
