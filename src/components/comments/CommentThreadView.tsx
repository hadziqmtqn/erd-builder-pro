import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { ArrowUp, Check, Maximize2, RotateCcw, X } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useCommentThread } from '@/hooks/useCommentThread';
import type { CommentAnchorRef, CommentFileRef, CommentMessage } from '@/lib/fileComments';

const AVATAR_COLORS = ['bg-teal-600', 'bg-sky-600', 'bg-violet-600', 'bg-rose-600', 'bg-amber-600', 'bg-emerald-600'];

export function CommentAvatar({ name, className }: { name: string; className?: string }) {
  const initial = (name.trim()[0] || '?').toUpperCase();
  const color = AVATAR_COLORS[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white', color, className)} aria-hidden="true">{initial}</span>;
}

/** "5m", "3h", "2d", or "Sep 29": the short form used on cards. */
export function shortCommentTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.max(Math.round((Date.now() - date.getTime()) / 60000), 0);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / 60 / 24)}d`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export function commentTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : formatDistanceToNowStrict(date, { addSuffix: true });
}

/** One comment thread: its messages (10 at a time), a composer, edit of one's own messages, resolve, delete by the thread's creator, and an optional expand-to-panel action. */
export function CommentThreadView({ file, anchor, autoFocus = false, showActions = true, onDirtyChange, onClose, onExpand, className }: {
  file: CommentFileRef;
  anchor: CommentAnchorRef;
  autoFocus?: boolean;
  /** The resolve, expand, and close buttons; a floating card shows its own resolve button instead. */
  showActions?: boolean;
  /** Tells the host whether a reply is being typed, so it does not collapse the card on an outside click. */
  onDirtyChange?: (dirty: boolean) => void;
  onClose?: () => void;
  onExpand?: () => void;
  className?: string;
}) {
  const thread = useCommentThread(file, anchor);
  const userId = String(useAuth().user?.id ?? '');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<CommentMessage | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const newest = thread.messages[thread.messages.length - 1]?.id;

  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);
  useEffect(() => { onDirtyChange?.(draft.trim().length > 0 || (editing !== null && editDraft.trim() !== editing.body)); }, [draft, editing, editDraft, onDirtyChange]);
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  }, [draft]);

  // Keep the newest message in view, next to the composer; revealing older ones must not jump the list.
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [newest]);

  const submit = async () => {
    if (await thread.send(draft)) setDraft('');
  };

  const saveEdit = async () => {
    if (editing && await thread.edit(editing, editDraft)) setEditing(null);
  };

  const deleteThread = async () => {
    setConfirmDelete(false);
    if (await thread.deleteThread()) onClose?.();
  };

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      {showActions && <div className="flex items-center justify-end gap-0.5">
        {thread.threadId && (
          <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => void thread.toggleResolved()}
            title={thread.status === 'open' ? 'Resolve' : 'Reopen'} aria-label={thread.status === 'open' ? 'Resolve comment' : 'Reopen comment'}>
            {thread.status === 'open' ? <Check className="size-3.5" /> : <RotateCcw className="size-3.5" />}
          </Button>
        )}
        {onExpand && (
          <Button type="button" variant="ghost" size="icon" className="size-6" onClick={onExpand} title="Open in comments panel" aria-label="Open in comments panel">
            <Maximize2 className="size-3.5" />
          </Button>
        )}
        {onClose && (
          <Button type="button" variant="ghost" size="icon" className="size-6" onClick={onClose} title="Close" aria-label="Close comment">
            <X className="size-3.5" />
          </Button>
        )}
      </div>}

      {thread.hasOlder && (
        <button type="button" disabled={thread.loading} onClick={() => void thread.showOlder()}
          className="self-start rounded px-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60">
          Show old comments
        </button>
      )}

      <ul ref={list} className="flex max-h-72 flex-col gap-2.5 overflow-y-auto pr-1">
        {thread.messages.map((message, index) => (
          <li key={message.id} className="flex gap-2">
            <CommentAvatar name={message.authorName} className="size-5 text-[10px]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-xs font-semibold">{message.authorName}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{shortCommentTime(message.createdAt)}</span>
                {message.authorId === userId && editing?.id !== message.id && (
                  <button type="button" disabled={thread.sending} onClick={() => { setEditing(message); setEditDraft(message.body); }}
                    className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground hover:underline disabled:opacity-60">Edit</button>
                )}
                {index === 0 && !thread.hasOlder && thread.threadId && thread.createdBy === userId && editing?.id !== message.id && (
                  <button type="button" disabled={thread.sending} onClick={() => setConfirmDelete(true)}
                    className="shrink-0 text-[11px] text-muted-foreground hover:text-destructive hover:underline disabled:opacity-60">Delete</button>
                )}
              </div>
              {editing?.id === message.id ? (
                <form className="mt-1 flex items-end gap-1 rounded-md border bg-background px-2 py-1 focus-within:border-ring"
                  onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
                  <textarea data-comment-draft autoFocus rows={1} maxLength={4000} value={editDraft} aria-label="Edit comment"
                    onChange={(event) => setEditDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void saveEdit(); }
                      if (event.key === 'Escape') { event.stopPropagation(); setEditing(null); }
                    }}
                    className="max-h-[120px] min-h-5 min-w-0 flex-1 resize-none bg-transparent text-xs outline-none" />
                  <button type="button" aria-label="Cancel edit" disabled={thread.sending} onClick={() => setEditing(null)}
                    className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40"><X aria-hidden="true" className="size-3" /></button>
                  <button type="submit" aria-label="Save comment" disabled={!editDraft.trim() || thread.sending}
                    className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white disabled:opacity-40"><Check aria-hidden="true" className="size-3" /></button>
                </form>
              ) : <p className="whitespace-pre-wrap break-words text-xs leading-snug">{message.body}</p>}
            </div>
          </li>
        ))}
        {thread.loading && !thread.messages.length && <li className="text-xs text-muted-foreground">Loading…</li>}
      </ul>

      {thread.status === 'resolved' && <p className="text-xs text-muted-foreground">Resolved. Reopen it to reply.</p>}
      {thread.error && <p role="alert" className="text-xs text-destructive">{thread.error}</p>}

      {thread.status === 'open' && (
        <form className="mx-0.5 mb-0.5 flex items-end gap-1.5 rounded-lg border border-input bg-background px-2.5 py-1.5 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20"
          onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <textarea data-comment-draft
            ref={input}
            value={draft}
            rows={1}
            maxLength={4000}
            placeholder={thread.messages.length ? 'Reply…' : 'Add a comment…'}
            aria-label={thread.messages.length ? 'Reply to comment' : 'Add a comment'}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); }
              if (event.key === 'Escape') onClose?.();
            }}
            className="max-h-[120px] min-h-6 flex-1 resize-none bg-transparent py-0.5 text-xs outline-none placeholder:text-muted-foreground"
          />
          <button type="submit" disabled={!draft.trim() || thread.sending} aria-label="Send comment"
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white disabled:opacity-40">
            <ArrowUp className="size-3.5" />
          </button>
        </form>
      )}
      <ConfirmModal
        isOpen={confirmDelete}
        title="Delete thread?"
        message="This permanently deletes the thread and all of its comments."
        confirmText="Delete Thread"
        cancelText="Cancel"
        variant="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => { void deleteThread(); }}
      />
    </div>
  );
}
