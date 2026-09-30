import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Check, CheckCircle2, MoreHorizontal, RotateCcw, Send, Trash2 } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'sonner';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Portal as HoverCardPortal } from '@radix-ui/react-hover-card';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MessageScroller, MessageScrollerContent, MessageScrollerProvider, MessageScrollerViewport } from '@/components/ui/message-scroller';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import ConfirmModal from '@/components/ConfirmModal';
import { apiFetch } from '@/lib/api';

export type CommentAnchor = { type: 'table' | 'relationship'; id: string };
export type ERDCommentsConfig = { projectId: string; teamId: string; fileId: string; userId: string };
type Preview = { authorId?: string; authorName: string; body: string; createdAt: string };
type Marker = { anchorType: CommentAnchor['type']; anchorId: string; status: 'open' | 'resolved'; messageCount: number; unreadCount: number; replyCount: number; rootMessage: Preview | null };
type Thread = { id: string; status: 'open' | 'resolved'; createdBy: string };
type Message = Preview & { id: string; threadId: string; authorId: string };
type MessageCursor = { createdAt: string; id: string };
type MessageHistoryPage = { hasMore: boolean; nextCursor: MessageCursor | null };
type MessageHistoryState = MessageHistoryPage & { messages: Message[] };
type CommentsContext = {
  markers: Map<string, Marker>;
  active: CommentAnchor | null;
  open: (anchor: CommentAnchor) => void;
  setAnchorElement: (element: HTMLElement | null) => void;
};

const Context = createContext<CommentsContext | null>(null);
const keyOf = (anchor: CommentAnchor) => `${anchor.type}:${anchor.id}`;

function messageHistoryPage(raw: any): MessageHistoryPage {
  const cursor = raw.nextCursor;
  return {
    hasMore: raw.hasMore === true,
    nextCursor: cursor?.createdAt && cursor.id ? { createdAt: String(cursor.createdAt), id: String(cursor.id) } : null,
  };
}

function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
}

function mergeLiveMessages(current: MessageHistoryState, incoming: Message[], page: MessageHistoryPage): MessageHistoryState {
  const messages = mergeMessages(current.messages, incoming).slice(-Math.max(50, current.messages.length));
  const oldest = messages[0];
  const hasMore = current.hasMore || page.hasMore;
  return {
    messages,
    hasMore,
    nextCursor: hasMore && oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null,
  };
}

function avatarInitials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

function messageTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : formatDistanceToNowStrict(date, { addSuffix: true });
}

function resizeTextarea(element: HTMLTextAreaElement, maxHeight = 144): void {
  element.style.height = 'auto';
  element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
}

async function request(path: string, init?: RequestInit): Promise<any> {
  const response = await apiFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Could not load comments.');
  return body;
}

export function ERDCommentsProvider({ config, children }: { config: ERDCommentsConfig; children: ReactNode }) {
  const base = `/api/projects/${encodeURIComponent(config.projectId)}/comments`;
  const scope = `feature_type=diagram&file_id=${encodeURIComponent(config.fileId)}`;
  const [markers, setMarkers] = useState(new Map<string, Marker>());
  const [active, setActive] = useState<CommentAnchor | null>(null);
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messageHistory, setMessageHistory] = useState<MessageHistoryState>({ messages: [], hasMore: false, nextCursor: null });
  const messages = messageHistory.messages;
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const editTextarea = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef(0);
  const markerRequestId = useRef(0);

  const loadMarkers = useCallback(async () => {
    const current = ++markerRequestId.current;
    try {
      const data = await request(`${base}/markers?${scope}`);
      const items: Marker[] = (data.markers || []).map((item: any) => {
        const messageCount = Number(item.messageCount ?? item.message_count ?? 0);
        const rawRoot = item.rootMessage ?? item.root_message;
        return {
          anchorType: item.anchorType ?? item.anchor_type,
          anchorId: String(item.anchorId ?? item.anchor_id),
          status: item.status === 'resolved' ? 'resolved' : 'open',
          messageCount,
          unreadCount: Number(item.unreadCount ?? item.unread_count ?? 0),
          replyCount: Number(item.replyCount ?? item.reply_count ?? Math.max(messageCount - 1, 0)),
          rootMessage: rawRoot ? {
            authorId: rawRoot.authorId == null && rawRoot.author_id == null ? undefined : String(rawRoot.authorId ?? rawRoot.author_id),
            authorName: String(rawRoot.authorName ?? rawRoot.author_name ?? 'Team member'),
            body: String(rawRoot.body ?? ''),
            createdAt: String(rawRoot.createdAt ?? rawRoot.created_at ?? ''),
          } : null,
        };
      });
      if (current === markerRequestId.current) {
        setMarkers(new Map(items.map((item) => [keyOf({ type: item.anchorType, id: item.anchorId }), item])));
      }
    } catch { /* The canvas stays usable if comments are unavailable. */ }
  }, [base, scope]);

  const loadAnchor = useCallback(async (anchor: CommentAnchor, markRead = true, quiet = false) => {
    const current = ++requestId.current;
    setLoadingOlder(false);
    if (!quiet) {
      setLoading(true);
      setError('');
    }
    try {
      const data = await request(`${base}/anchor?${scope}&anchor_type=${anchor.type}&anchor_id=${encodeURIComponent(anchor.id)}`);
      if (current !== requestId.current) return;
      const nextThreads: Thread[] = (data.threads || []).map((thread: any) => ({
        id: String(thread.id), status: thread.status === 'resolved' ? 'resolved' : 'open', createdBy: String(thread.createdBy ?? thread.created_by ?? ''),
      }));
      const nextMessages: Message[] = (data.messages || []).map((message: any) => ({
        id: String(message.id), threadId: String(message.threadId ?? message.thread_id),
        authorId: String(message.authorId ?? message.author_id),
        authorName: String(message.authorName ?? message.author_name ?? 'Team member'),
        body: String(message.body), createdAt: String(message.createdAt ?? message.created_at),
      }));
      setThreads(nextThreads);
      const page = messageHistoryPage(data);
      setMessageHistory((existing) => quiet ? mergeLiveMessages(existing, nextMessages, page) : { ...page, messages: nextMessages });
      if (!quiet) {
        setEditingMessageId(null);
        setEditDraft('');
      }
      if (markRead && nextThreads.length) {
        await Promise.all(nextThreads.map((thread) => request(`${base}/${encodeURIComponent(thread.id)}/read?${scope}`, { method: 'POST' })));
        if (current === requestId.current) await loadMarkers();
      }
    } catch {
      if (!quiet && current === requestId.current) setError('Could not load comments. Try again.');
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [base, scope, loadMarkers]);

  const loadOlderMessages = useCallback(async () => {
    const cursor = messageHistory.nextCursor;
    if (!active || !cursor || !messageHistory.hasMore || loadingOlder) return;
    const requestNumber = ++requestId.current;
    const query = new URLSearchParams({ before_created_at: cursor.createdAt, before_id: cursor.id });
    setLoadingOlder(true);
    setError('');
    try {
      const data = await request(`${base}/anchor?${scope}&anchor_type=${active.type}&anchor_id=${encodeURIComponent(active.id)}&${query}`);
      if (requestNumber !== requestId.current) return;
      const olderMessages: Message[] = (data.messages || []).map((message: any) => ({
        id: String(message.id), threadId: String(message.threadId ?? message.thread_id),
        authorId: String(message.authorId ?? message.author_id),
        authorName: String(message.authorName ?? message.author_name ?? 'Team member'),
        body: String(message.body), createdAt: String(message.createdAt ?? message.created_at),
      }));
      const page = messageHistoryPage(data);
      setMessageHistory((current) => ({ ...page, messages: mergeMessages(current.messages, olderMessages) }));
    } catch (cause) {
      if (requestNumber === requestId.current) setError(cause instanceof Error ? cause.message : 'Could not load earlier comments.');
    } finally {
      if (requestNumber === requestId.current) setLoadingOlder(false);
    }
  }, [active, base, loadingOlder, messageHistory, scope]);

  const open = useCallback((anchor: CommentAnchor) => {
    setActive(anchor);
    setAnchorElement(null);
    setDraft('');
    setThreads([]);
    setMessageHistory({ messages: [], hasMore: false, nextCursor: null });
    setEditingMessageId(null);
    setEditDraft('');
    setDeleteDialogOpen(false);
    void loadAnchor(anchor);
  }, [loadAnchor]);

  useEffect(() => {
    void loadMarkers();
    const refresh = () => {
      void loadMarkers();
      if (active && document.visibilityState === 'visible') void loadAnchor(active, false, true);
    };
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ teamId?: string; projectId?: string }>).detail;
      if (detail?.teamId && String(detail.teamId) !== config.teamId) return;
      if (detail?.projectId && String(detail.projectId) !== config.projectId) return;
      refresh();
    };
    const onWorkspaceSync = (event: Event) => {
      const detail = (event as CustomEvent<{ teamId?: string; eventType?: string }>).detail;
      if (detail?.teamId !== config.teamId || detail.eventType !== 'cloud.workspace.sync') return;
      refresh();
    };
    const onReconnect = (event: Event) => {
      if ((event as CustomEvent<{ teamId?: string }>).detail?.teamId !== config.teamId) return;
      refresh();
    };
    const onOpen = (event: Event) => {
      const anchor = (event as CustomEvent<CommentAnchor>).detail;
      if (anchor && ['table', 'relationship'].includes(anchor.type) && anchor.id) open(anchor);
    };
    window.addEventListener('collaboration-updated', onUpdate);
    window.addEventListener('cloud-workspace-sync', onWorkspaceSync);
    window.addEventListener('cloud-live-sync-reconnected', onReconnect);
    window.addEventListener('erd-comment-open-request', onOpen);
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void loadMarkers(); }, 15000);
    return () => {
      window.removeEventListener('collaboration-updated', onUpdate);
      window.removeEventListener('cloud-workspace-sync', onWorkspaceSync);
      window.removeEventListener('cloud-live-sync-reconnected', onReconnect);
      window.removeEventListener('erd-comment-open-request', onOpen);
      window.clearInterval(interval);
    };
  }, [active, config.projectId, config.teamId, loadAnchor, loadMarkers, open]);

  const activeThread = threads[0] ?? null;
  const activeMarker = active ? markers.get(keyOf(active)) : undefined;
  const threadResolved = activeThread?.status === 'resolved' || (!activeThread && activeMarker?.status === 'resolved');

  useEffect(() => {
    if (!editingMessageId || !editTextarea.current) return;
    resizeTextarea(editTextarea.current);
    editTextarea.current.focus();
    editTextarea.current.setSelectionRange(editTextarea.current.value.length, editTextarea.current.value.length);
  }, [editingMessageId]);

  const notifyLocalUpdate = () => window.dispatchEvent(new CustomEvent('collaboration-updated', { detail: { teamId: config.teamId, projectId: config.projectId } }));

  const startEditing = (message: Message) => {
    if (message.authorId !== config.userId) return;
    setEditingMessageId(message.id);
    setEditDraft(message.body);
    setError('');
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    const message = messages.find((item) => item.id === editingMessageId);
    const body = editDraft.trim();
    if (!message || !body || sending) return;
    setSending(true);
    setError('');
    try {
      await request(`${base}/${encodeURIComponent(message.threadId)}/messages/${encodeURIComponent(message.id)}?${scope}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body, expectedBody: message.body }),
      });
      setMessageHistory((current) => ({ ...current, messages: current.messages.map((item) => item.id === message.id ? { ...item, body } : item) }));
      setEditingMessageId(null);
      setEditDraft('');
      if (active) await loadAnchor(active, false, true);
      notifyLocalUpdate();
    } catch (cause) {
      if (active) await loadAnchor(active, false, true);
      setError(cause instanceof Error ? cause.message : 'Could not edit comment.');
    } finally { setSending(false); }
  };

  const changeStatus = async () => {
    if (!active || !activeThread || sending) return;
    setSending(true);
    setError('');
    const expectedStatus = activeThread.status;
    try {
      const nextStatus = expectedStatus === 'open' ? 'resolved' : 'open';
      await request(`${base}/${encodeURIComponent(activeThread.id)}?${scope}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, expectedStatus }),
      });
      setThreads((current) => current.map((thread) => thread.id === activeThread.id ? { ...thread, status: nextStatus } : thread));
      setMarkers((current) => {
        const key = keyOf(active);
        const marker = current.get(key);
        if (!marker) return current;
        const next = new Map(current);
        next.set(key, { ...marker, status: nextStatus });
        return next;
      });
      await loadAnchor(active, false, true);
      notifyLocalUpdate();
    } catch (cause) {
      if (active) await loadAnchor(active, false, true);
      setError(cause instanceof Error ? cause.message : 'Could not update thread.');
    } finally { setSending(false); }
  };

  const deleteThread = async () => {
    if (!active || !activeThread || sending) return;
    setSending(true);
    setError('');
    try {
      await request(`${base}/${encodeURIComponent(activeThread.id)}?${scope}`, { method: 'DELETE' });
      setDeleteDialogOpen(false);
      setActive(null);
      setAnchorElement(null);
      requestId.current++;
      setThreads([]);
      setMessageHistory({ messages: [], hasMore: false, nextCursor: null });
      await loadMarkers();
      notifyLocalUpdate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete thread.');
    } finally { setSending(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!active || !body || loading || threadResolved || sending) return;
    setSending(true);
    setError('');
    try {
      const thread = activeThread?.status === 'open' ? activeThread : null;
      if (thread) {
        await request(`${base}/${encodeURIComponent(thread.id)}/messages?${scope}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
        });
      } else {
        await request(`${base}?${scope}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body, context: { type: active.type, id: active.id, featureType: 'diagram', fileId: config.fileId } }),
        });
      }
      setDraft('');
      if (textarea.current) textarea.current.style.height = '';
      await loadAnchor(active, true, true);
      notifyLocalUpdate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send comment.');
      toast.error('Could not send comment.');
    } finally { setSending(false); }
  };

  const value = useMemo(() => ({ markers, active, open, setAnchorElement }), [markers, active, open]);
  return (
    <Context.Provider value={value}>
      {children}
      <Popover open={!!active && !!anchorElement} onOpenChange={(next) => {
        if (!next && deleteDialogOpen) return;
        if (!next) { setActive(null); setAnchorElement(null); requestId.current++; }
      }}>
        <PopoverContent anchor={anchorElement} side="right" align="start" sideOffset={12} className="z-200 flex max-h-[min(420px,70vh)] w-[min(340px,calc(100vw-24px))] flex-col gap-0 overflow-hidden p-0" aria-label="Table or relationship comments">
          {activeThread && <div className="absolute right-2 top-2 z-10"><DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Comment thread actions"><MoreHorizontal aria-hidden="true" className="size-4" /></Button>} />
              <DropdownMenuContent align="end" className="w-48" positionerClassName="z-[210]">
                <DropdownMenuItem onClick={() => void changeStatus()} disabled={sending}>
                  {activeThread.status === 'open' ? <CheckCircle2 aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                  {activeThread.status === 'open' ? 'Resolve Thread' : 'Reopen Thread'}
                </DropdownMenuItem>
                {activeThread.createdBy === config.userId && <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteDialogOpen(true)} disabled={sending}>
                    <Trash2 aria-hidden="true" />
                    Delete Thread
                  </DropdownMenuItem>
                </>}
              </DropdownMenuContent>
            </DropdownMenu></div>}
          {(loading || messages.length > 0) && <MessageScrollerProvider key={active ? keyOf(active) : 'comment-history'} defaultScrollPosition="end">
            <MessageScroller className="flex-1">
              <MessageScrollerViewport aria-label="Comment history" className="px-3 py-2.5 pr-10">
                <MessageScrollerContent className="gap-4">
                  {loading && messages.length === 0 ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
                  {messageHistory.hasMore && <div className="flex justify-center">
                    <Button type="button" size="sm" variant="ghost" onClick={() => void loadOlderMessages()} disabled={loadingOlder}>
                      {loadingOlder ? 'Loading…' : 'Load earlier comments'}
                    </Button>
                  </div>}
                  <div className="space-y-4">
              {messages.map((message) => <div key={message.id} className="flex gap-2.5 text-sm">
                <Avatar className="size-8 bg-cyan-600 text-white" aria-label={message.authorName}>
                  <AvatarFallback className="bg-cyan-600 text-xs font-medium text-white">{avatarInitials(message.authorName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate font-medium">{message.authorName}</span>
                    <time className="shrink-0 text-xs text-muted-foreground" dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
                    {message.authorId === config.userId && <button type="button" className="shrink-0 text-xs text-blue-600 hover:underline dark:text-sky-400" onClick={() => startEditing(message)}>Edit</button>}
                  </div>
                  {editingMessageId === message.id ? (
                    <form onSubmit={saveEdit} className="mt-1.5 space-y-2">
                      <textarea ref={editTextarea} rows={1} maxLength={4000} value={editDraft} onChange={(event) => { setEditDraft(event.target.value); resizeTextarea(event.target); }} className="max-h-36 min-h-9 w-full resize-none rounded-md border bg-background px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Edit comment" />
                      <div className="flex justify-end gap-1.5">
                        <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingMessageId(null); setEditDraft(''); }} disabled={sending}>Cancel</Button>
                        <Button type="submit" size="sm" disabled={!editDraft.trim() || sending}>Save</Button>
                      </div>
                    </form>
                  ) : <p className="mt-1 whitespace-pre-wrap wrap-break-word text-foreground/90">{message.body}</p>}
                </div>
              </div>)}
                  </div>
                </MessageScrollerContent>
              </MessageScrollerViewport>
            </MessageScroller>
          </MessageScrollerProvider>}
          <form onSubmit={submit} className="flex shrink-0 items-end gap-2 p-2">
            <label className="sr-only" htmlFor="erd-comment-reply">Write a comment</label>
            <textarea ref={textarea} id="erd-comment-reply" rows={1} maxLength={4000} value={draft} disabled={loading || threadResolved || sending} onChange={(event) => {
              setDraft(event.target.value);
              resizeTextarea(event.target);
            }} placeholder={threadResolved ? 'Reopen thread to comment…' : 'Write a comment…'} className="min-h-9 max-h-36 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60" />
            <Button type="submit" size="icon" className="size-9 shrink-0" aria-label="Send comment" disabled={!draft.trim() || loading || threadResolved || sending}><Send aria-hidden="true" className="size-4" /></Button>
          </form>
          {error ? <p role="alert" className="px-3 pb-3 text-xs text-destructive">{error}</p> : null}
        </PopoverContent>
      </Popover>
      <ConfirmModal
        isOpen={deleteDialogOpen}
        title="Delete thread?"
        message="This permanently deletes the thread and all of its comments."
        confirmText="Delete Thread"
        cancelText="Cancel"
        variant="danger"
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={() => { void deleteThread(); }}
      />
    </Context.Provider>
  );
}

export function useERDComments() { return useContext(Context); }

export function CommentMarker({ anchor }: { anchor: CommentAnchor }) {
  const comments = useERDComments();
  const element = useRef<HTMLButtonElement>(null);
  const marker = comments?.markers.get(keyOf(anchor));
  const active = comments?.active?.type === anchor.type && comments.active.id === anchor.id;
  useLayoutEffect(() => {
    if (active) comments?.setAnchorElement(element.current);
  }, [active, comments]);
  if (!comments || (!marker && !active)) return null;
  const count = marker?.unreadCount || 0;
  const resolved = marker?.status === 'resolved';
  return <HoverCard openDelay={180} closeDelay={100}>
    <HoverCardTrigger asChild>
      <button ref={element} type="button" className={`nodrag nopan flex h-4 min-w-4 items-center justify-center rounded-full border-0 px-1 text-[9px] font-bold leading-none shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 ${resolved ? 'bg-foreground text-background hover:opacity-80 focus-visible:outline-foreground' : 'bg-sky-500 text-white hover:bg-sky-600 focus-visible:outline-sky-500 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300'}`} aria-label={`${anchor.type === 'table' ? 'Table' : 'Relationship'} comments${resolved ? ', resolved' : count ? `, ${count} unread` : ''}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); comments.open(anchor); }}>
        {resolved ? <Check aria-hidden="true" className="size-2.5 stroke-[3]" /> : count > 0 ? (count > 3 ? '3+' : count) : <span className="sr-only">Comments</span>}
      </button>
    </HoverCardTrigger>
    {!active && marker?.rootMessage && <HoverCardPortal><HoverCardContent side="right" sideOffset={8} className="w-[min(22rem,calc(100vw-1rem))] p-3" aria-label="Comment preview">
      <div className="flex gap-2.5">
        <Avatar className="size-8 shrink-0 bg-cyan-600 text-white" aria-hidden="true"><AvatarFallback className="bg-cyan-600 text-[10px] text-white">{avatarInitials(marker.rootMessage.authorName)}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{marker.rootMessage.authorName}</span>
            {marker.rootMessage.createdAt ? <time className="shrink-0 text-xs text-muted-foreground" dateTime={marker.rootMessage.createdAt}>{messageTime(marker.rootMessage.createdAt)}</time> : null}
          </div>
          <p className="mt-1 line-clamp-3 break-words text-sm text-foreground/90">{marker.rootMessage.body}</p>
          {marker.replyCount > 0 ? <p className="mt-2 text-xs text-muted-foreground">{marker.replyCount} {marker.replyCount === 1 ? 'reply' : 'replies'}</p> : null}
        </div>
      </div>
    </HoverCardContent></HoverCardPortal>}
  </HoverCard>;
}
