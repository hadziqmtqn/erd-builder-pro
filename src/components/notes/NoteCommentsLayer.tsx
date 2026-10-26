import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Maximize2, MessageSquare, MessageSquarePlus } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { cn } from '@/lib/utils';
import ConfirmModal from '@/components/ConfirmModal';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CommentAvatar, CommentThreadView, shortCommentTime } from '@/components/comments/CommentThreadView';
import { useCommentMarkers } from '@/hooks/useCommentMarkers';
import { setNoteCommentDecorations } from '@/components/editor/extensions/NoteCommentDecorations';
import { commentableBlockPosition } from '@/lib/tiptap/commentBlocks';
import { setCommentStatus, type CommentFileRef, type CommentMarker } from '@/lib/fileComments';

const CARD_GAP = 6;
const CARD_ESTIMATE = 56;
const CARD_RIGHT = 8;
const IDLE_WIDTH = 224;
const HOT_WIDTH = 288;
const ICON_SIZE = 28;

type Item = { id: string; marker: CommentMarker | null };
type Preview = { authorName: string; body: string; createdAt: string };

const anchorElement = (editor: Editor, id: string) =>
  editor.view.dom.querySelector<HTMLElement>(`[data-comment-anchor-id="${CSS.escape(id)}"]`);

/**
 * Notion-style block comments for one Note, drawn over the scroll container so they never change the page layout.
 * Wide: small floating cards at the right edge of the work area (idle = compact, hover = full). Narrow and phones:
 * a count button on the block that opens the thread in a bottom sheet.
 */
export function NoteCommentsLayer({ editor, page, container, file, wide, requestCommentAtBlock }: {
  editor: Editor;
  page: HTMLElement | null;
  container: HTMLElement | null;
  file: CommentFileRef;
  wide: boolean;
  requestCommentAtBlock: (blockPosition: number) => Promise<boolean>;
}) {
  const { markers, refresh } = useCommentMarkers(file);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [composeId, setComposeId] = useState<string | null>(null);
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);
  const [hoverCardId, setHoverCardId] = useState<string | null>(null);
  const [hoverButton, setHoverButton] = useState<{ pos: number; top: number } | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const [tops, setTops] = useState<Map<string, number>>(new Map());
  const heights = useRef(new Map<string, number>());
  const dirty = useRef(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const items = useMemo<Item[]>(() => {
    const open = markers.filter((marker) => marker.status === 'open').map((marker): Item => ({ id: marker.anchorId, marker }));
    if (composeId && !open.some((item) => item.id === composeId)) open.push({ id: composeId, marker: null });
    return open;
  }, [markers, composeId]);
  const openIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const hotId = activeId ?? hoverCardId ?? hoverBlockId;

  const collapse = useCallback(() => {
    setActiveId(null);
    setComposeId((current) => (current && !markers.some((marker) => marker.anchorId === current) ? null : current));
    dirty.current = false;
  }, [markers]);
  // Unsent text is never dropped silently: ask first.
  const requestCollapse = useCallback(() => {
    if (dirty.current) setConfirmDiscard(true);
    else collapse();
  }, [collapse]);

  // The composer opens for a block as soon as its anchor has been saved (see useNoteCommentPersistence).
  useEffect(() => {
    const onCompose = (event: Event) => {
      const detail = (event as CustomEvent<{ fileId?: string; anchorId?: string }>).detail;
      if (detail?.fileId !== file.fileId || !detail.anchorId) return;
      setComposeId(detail.anchorId);
      setActiveId(detail.anchorId);
    };
    window.addEventListener('note-comment-compose', onCompose);
    return () => window.removeEventListener('note-comment-compose', onCompose);
  }, [file.fileId]);

  useEffect(() => {
    if (composeId && markers.some((marker) => marker.anchorId === composeId)) setComposeId(null);
  }, [markers, composeId]);

  useEffect(() => {
    if (!editor.isDestroyed) setNoteCommentDecorations(editor, { open: openIds, hot: hotId });
  }, [editor, openIds, hotId]);

  // An open card shrinks again when the user clicks anywhere else; unsent text asks for confirmation first.
  useEffect(() => {
    if (!activeId || !wide || confirmDiscard) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      // The card's own confirm dialog (delete thread) renders in a portal outside the card.
      if (target?.closest?.(`[data-comment-card="${CSS.escape(activeId)}"], [role="alertdialog"]`)) return;
      requestCollapse();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [activeId, wide, confirmDiscard, requestCollapse]);

  // Re-measure when the document, the work area, or the window changes.
  useEffect(() => {
    const bump = () => setLayoutTick((tick) => tick + 1);
    editor.on('update', bump);
    window.addEventListener('resize', bump);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(bump) : null;
    if (page) observer?.observe(page);
    if (container) observer?.observe(container);
    return () => { editor.off('update', bump); window.removeEventListener('resize', bump); observer?.disconnect(); };
  }, [editor, page, container]);

  // Position relative to the scroll container's content, so cards scroll with the text they belong to.
  const toContainerTop = useCallback((element: Element) => {
    if (!container) return 0;
    return element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
  }, [container]);

  useLayoutEffect(() => {
    if (!container) return;
    const anchored = items
      .map((item) => ({ id: item.id, element: anchorElement(editor, item.id) }))
      .filter((entry): entry is { id: string; element: HTMLElement } => Boolean(entry.element))
      .map((entry) => ({ id: entry.id, top: toContainerTop(entry.element) }))
      .sort((a, b) => a.top - b.top);
    const next = new Map<string, number>();
    let floor = -Infinity;
    for (const entry of anchored) {
      const top = wide ? Math.max(entry.top, floor) : entry.top;
      next.set(entry.id, top);
      floor = top + (heights.current.get(entry.id) ?? CARD_ESTIMATE) + CARD_GAP;
    }
    setTops((current) => {
      if (current.size === next.size && [...next].every(([id, top]) => Math.abs((current.get(id) ?? -1e9) - top) < 0.5)) return current;
      return next;
    });
  }, [items, editor, container, wide, layoutTick, activeId, toContainerTop]);

  // Icon slot. Wide: just left of the column of cards, level with its block, like Notion. Narrow: inside the page's right padding.
  const iconLeft = useCallback(() => {
    if (!container || !page) return 0;
    if (wide) return container.clientWidth - CARD_RIGHT - IDLE_WIDTH - ICON_SIZE - 8;
    return page.getBoundingClientRect().right - container.getBoundingClientRect().left + container.scrollLeft - ICON_SIZE - 6;
  }, [container, page, wide]);

  // Hover over a block: emphasise its thread, or offer the "add comment" button when it has none.
  useEffect(() => {
    if (!page || !container) return;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const target = event.target as Element | null;
      if (target?.closest?.('[data-comment-card]')) { setHoverBlockId(null); setHoverButton(null); return; }
      if (target?.closest?.('button')) return;
      const pageRect = page.getBoundingClientRect();
      if (event.clientX < pageRect.left - 16 || event.clientX > pageRect.right + 8) { setHoverBlockId(null); setHoverButton(null); return; }
      const probe = pageRect.left + Math.min(80, pageRect.width / 2);
      const hit = editor.view.posAtCoords({ left: probe, top: event.clientY });
      const blockPos = hit ? commentableBlockPosition(editor, hit.pos) : null;
      const element = blockPos === null ? null : (editor.view.nodeDOM(blockPos) as HTMLElement | null);
      if (blockPos === null || !element || !(element instanceof HTMLElement)) { setHoverBlockId(null); return; }
      const rect = element.getBoundingClientRect();
      if (event.clientY < rect.top - 2 || event.clientY > rect.bottom + 2) { setHoverBlockId(null); return; }
      const node = editor.state.doc.nodeAt(blockPos);
      if (!node || node.textContent.trim() === '') { setHoverBlockId(null); setHoverButton(null); return; }
      const id = node.attrs.commentAnchorId ?? null;
      const hasThread = Boolean(id && openIds.has(id));
      setHoverBlockId(hasThread ? id : null);
      setHoverButton(hasThread ? null : { pos: blockPos, top: toContainerTop(element) });
    };
    const onLeave = () => { setHoverBlockId(null); setHoverButton(null); };
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerleave', onLeave);
    return () => { container.removeEventListener('pointermove', onMove); container.removeEventListener('pointerleave', onLeave); };
  }, [editor, page, container, openIds, toContainerTop]);

  // Only a card at rest feeds the stacking pass: hovering one lets it overlap its neighbours instead of shoving them.
  const measure = useCallback((id: string, resting: boolean) => (element: HTMLElement | null) => {
    if (!element || !resting) return;
    const height = element.offsetHeight;
    if (heights.current.get(id) === height) return;
    heights.current.set(id, height);
    requestAnimationFrame(() => setLayoutTick((tick) => tick + 1));
  }, []);

  const startComment = async (pos: number) => {
    setHoverButton(null);
    // A block whose thread was resolved gets that thread back, with its history, instead of a second thread.
    const id = editor.state.doc.nodeAt(pos)?.attrs.commentAnchorId as string | undefined;
    const resolved = id ? markers.find((marker) => marker.anchorId === id && marker.status === 'resolved' && marker.threadId) : undefined;
    if (id && resolved?.threadId) {
      try {
        await setCommentStatus(file, resolved.threadId, 'open');
        await refresh();
        setActiveId(id);
      } catch { /* the block keeps its resolved thread */ }
      return;
    }
    await requestCommentAtBlock(pos);
  };

  const resolve = async (marker: CommentMarker) => {
    if (!marker.threadId) return;
    try {
      await setCommentStatus(file, marker.threadId, 'resolved');
      collapse();
      await refresh();
    } catch { /* the card stays; the user can try again */ }
  };

  if (!container) return null;
  const activeItem = items.find((item) => item.id === activeId) ?? null;
  const anchor = (id: string) => ({ type: 'block', id });
  // The full comments panel (header button, Comments tab) lists every thread of the file, resolved ones included.
  const openInPanel = (id: string) => {
    window.dispatchEvent(new CustomEvent('project-comment-open-request', {
      detail: { featureType: file.featureType, fileId: file.fileId, type: 'block', id },
    }));
    collapse();
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {hoverButton && (
        <button
          type="button"
          aria-label="Comment on this block"
          title="Comment"
          onClick={() => void startComment(hoverButton.pos)}
          style={{ top: hoverButton.top, left: iconLeft() }}
          className="pointer-events-auto absolute z-50 flex size-7 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm hover:text-foreground"
        >
          <MessageSquarePlus className="size-4" />
        </button>
      )}

      {wide && items.map((item) => {
        const top = tops.get(item.id);
        if (top === undefined) return null;
        const active = item.id === activeId;
        const hot = !active && item.id === hoverCardId;
        return (
          <div
            key={item.id}
            ref={measure(item.id, !hot)}
            style={{ top, right: CARD_RIGHT, width: active || hot ? HOT_WIDTH : IDLE_WIDTH }}
            data-comment-card={item.id}
            onPointerEnter={() => setHoverCardId(item.id)}
            onPointerLeave={() => setHoverCardId((current) => (current === item.id ? null : current))}
            className={cn(
              'group pointer-events-auto absolute rounded-lg border bg-card text-card-foreground transition-[width,box-shadow]',
              active || hot ? 'z-20 p-2.5 shadow-lg' : 'z-10 p-2 shadow-sm',
            )}
          >
            {item.marker?.threadId && (
              <div className="absolute -top-3 right-2 z-10 flex rounded-md border bg-popover opacity-0 shadow-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  title="Resolve"
                  aria-label="Resolve comment"
                  onClick={() => void resolve(item.marker!)}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Check className="size-3.5" />
                </button>
                <button
                  type="button"
                  title="Open in comments panel"
                  aria-label="Open in comments panel"
                  onClick={() => openInPanel(item.id)}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Maximize2 className="size-3.5" />
                </button>
              </div>
            )}
            {active ? (
              <CommentThreadView
                file={file}
                anchor={anchor(item.id)}
                autoFocus
                showActions={false}
                onDirtyChange={(isDirty) => { dirty.current = isDirty; }}
                onClose={requestCollapse}
              />
            ) : (
              <CardPreview marker={item.marker} expanded={hot} onOpen={() => setActiveId(item.id)} />
            )}
          </div>
        );
      })}

      {!wide && items.map((item) => {
        const top = tops.get(item.id);
        if (top === undefined || !item.marker) return null;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveId(item.id)}
            style={{ top, left: iconLeft() - 22 }}
            aria-label={`${item.marker.messageCount} comments on this block`}
            className="pointer-events-auto absolute z-10 flex h-6 items-center gap-1 rounded-md bg-background/80 px-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <MessageSquare className="size-3.5" />
            {item.marker.messageCount}
            {item.marker.unreadCount > 0 && <span className="size-1.5 rounded-full bg-sky-500" aria-hidden="true" />}
          </button>
        );
      })}

      {!wide && (
        <Sheet open={Boolean(activeItem)} onOpenChange={(open) => { if (!open) requestCollapse(); }}>
          <SheetContent side="bottom" className="pointer-events-auto max-h-[85dvh] gap-2 p-4">
            <SheetHeader className="p-0">
              <SheetTitle className="text-base">Comments</SheetTitle>
            </SheetHeader>
            {activeItem && (
              <CommentThreadView file={file} anchor={anchor(activeItem.id)} autoFocus={!activeItem.marker} className="overflow-y-auto"
                onExpand={activeItem.marker ? () => openInPanel(activeItem.id) : undefined} />
            )}
          </SheetContent>
        </Sheet>
      )}
      <ConfirmModal
        isOpen={confirmDiscard}
        title="Discard unsent comment?"
        message="You have text that hasn't been sent. If you leave now, it will be lost."
        confirmText="Discard"
        cancelText="Cancel"
        variant="warning"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => { setConfirmDiscard(false); collapse(); }}
      />
    </div>
  );
}

function PreviewMessage({ message, compact }: { message: Preview; compact?: boolean }) {
  return (
    <div className="flex min-w-0 gap-2">
      <CommentAvatar name={message.authorName} className={compact ? 'size-5 text-[10px]' : 'size-6'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-xs font-semibold">{message.authorName}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{shortCommentTime(message.createdAt)}</span>
        </div>
        <p className={cn('whitespace-pre-wrap break-words text-xs leading-snug', compact ? 'line-clamp-2' : 'line-clamp-4')}>{message.body}</p>
      </div>
    </div>
  );
}

/** Idle: one compact message. Hover: first message, "Show N replies" for the ones in between, and the latest message. */
function CardPreview({ marker, expanded, onOpen }: { marker: CommentMarker | null; expanded: boolean; onOpen: () => void }) {
  if (!marker?.rootMessage) return null;
  const hidden = Math.max(marker.messageCount - 2, 0);
  const latest = marker.messageCount > 1 ? marker.latestMessage : null;
  return (
    <button type="button" onClick={onOpen} className="relative block w-full min-w-0 text-left">
      {marker.unreadCount > 0 && <span className="absolute right-0 top-0 size-2 rounded-full bg-sky-500" aria-label="Unread" />}
      <PreviewMessage message={marker.rootMessage} compact={!expanded} />
      {expanded && hidden > 0 && (
        <span className="my-1 ml-2.5 block border-l-2 border-border py-1 pl-4 text-xs text-muted-foreground">
          {hidden === 1 ? 'Show 1 reply' : `Show ${hidden} replies`}
        </span>
      )}
      {expanded && latest && <div className="mt-2"><PreviewMessage message={latest} /></div>}
      {!expanded && marker.replyCount > 0 && (
        <span className="mt-0.5 block pl-7 text-[11px] text-muted-foreground">
          {marker.replyCount === 1 ? '1 reply' : `${marker.replyCount} replies`}
        </span>
      )}
    </button>
  );
}
