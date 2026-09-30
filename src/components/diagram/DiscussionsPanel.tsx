import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type FormEvent } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowLeft, Check, CheckCircle2, Database, FileText, MessageCircle, MessageSquareText, MoreHorizontal, Network, PenTool, Pencil, Plus, RotateCcw, Send, Trash2, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ConfirmModal from "@/components/ConfirmModal";
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Message, MessageAvatar, MessageContent, MessageGroup } from "@/components/ui/message";
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/message-scroller";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

export type CollaborationFeatureType = "diagram" | "note" | "drawing" | "flowchart";
export type CollaborationAnchorType = "general" | "table" | "relationship" | "block" | "shape" | "point";
export type CollaborationContext = {
  featureType: CollaborationFeatureType;
  fileId: string;
  fileName?: string | null;
  anchorType: CollaborationAnchorType;
  anchorId: string | null;
  anchorLabel: string;
};
type DiscussionAnchor = { type: "table" | "relationship"; id: string };
type Thread = {
  id: string;
  featureType: CollaborationFeatureType | null;
  fileId: string | null;
  anchorType: CollaborationAnchorType;
  anchorId: string | null;
  anchorLabel: string;
  contexts: CollaborationContext[];
  status: "open" | "resolved";
  canDelete: boolean;
  unread: boolean;
  latestMessageId: string | null;
  latestMessage: string | null;
  latestAuthorId: string | null;
  lastMessageAt: string | null;
  previewMessages: DiscussionMessageData[];
};
type DiscussionMessageData = { id: string; threadId?: string; authorId: string; authorName: string; body: string; createdAt: string };
type MessageCursor = { createdAt: string; id: string };
type MessageHistoryPage = { hasMore: boolean; nextCursor: MessageCursor | null };
type MessageHistoryState = MessageHistoryPage & { messages: DiscussionMessageData[] };
type PendingDelete = { type: "thread"; threadId: string } | { type: "message"; threadId: string; message: DiscussionMessageData };
type RawRecord = Record<string, unknown>;

function resizeDiscussionTextarea(element: HTMLTextAreaElement, maxHeight = 144): void {
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
}

type DiscussionTextareaProps = Omit<ComponentProps<typeof Textarea>, "value" | "onChange" | "rows" | "maxLength"> & {
  value: string;
  onChange: (value: string) => void;
};

function DiscussionTextarea({ value, onChange, className, ...props }: DiscussionTextareaProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textarea.current) resizeDiscussionTextarea(textarea.current);
  }, [value]);

  return (
    <Textarea
      {...props}
      ref={textarea}
      rows={1}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
        resizeDiscussionTextarea(event.currentTarget);
      }}
      maxLength={4000}
      className={className}
    />
  );
}

function DiscussionComposer({
  id,
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  submitLabel,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
  disabled: boolean;
  submitLabel: string;
}) {
  return (
    <div className="shrink-0 border-t border-border p-3">
      <form onSubmit={onSubmit} className="relative">
        <label htmlFor={id} className="sr-only">{submitLabel}</label>
        <DiscussionTextarea
          id={id}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="min-h-11! max-h-36 resize-none overflow-y-auto rounded-2xl bg-muted/40 px-3 py-2 pr-12 shadow-none"
          required
        />
        <Button
          type="submit"
          size="icon"
          className="absolute right-1 bottom-1 size-9 rounded-full"
          aria-label={submitLabel}
          disabled={!value.trim() || disabled}
        >
          <Send aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}

function requestPath(base: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const encoded = params.toString();
  return encoded ? `${base}?${encoded}` : base;
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await apiFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The request could not be completed.");
  return body;
}

function avatarInitials(name: string): string {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("");
  return initials.toUpperCase() || "?";
}

function groupMessages(messages: DiscussionMessageData[]): DiscussionMessageData[][] {
  const groups: DiscussionMessageData[][] = [];
  for (const message of messages) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup[0].authorId === message.authorId) lastGroup.push(message);
    else groups.push([message]);
  }
  return groups;
}

function DiscussionMessage({ message, isOwn, showAvatar, canEdit, editing, editDraft, editOriginalBody, disabled, onEdit, onDelete, onEditDraftChange, onCancelEdit, onSaveEdit }: {
  message: DiscussionMessageData;
  isOwn: boolean;
  showAvatar: boolean;
  canEdit: boolean;
  editing: boolean;
  editDraft: string;
  editOriginalBody: string;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onEditDraftChange: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const avatar = (
    <MessageAvatar aria-hidden={!showAvatar}>
      {showAvatar && (
        <Avatar aria-label={message.authorName}>
          <AvatarFallback>{avatarInitials(message.authorName)}</AvatarFallback>
        </Avatar>
      )}
    </MessageAvatar>
  );
  const bubble = (
    <Bubble className={cn(isOwn ? "bg-brand text-white" : "bg-muted text-foreground", isOwn ? "rounded-br-md" : "rounded-bl-md")}>
      <BubbleContent className="wrap-break-word">{message.body}</BubbleContent>
    </Bubble>
  );
  const time = messageTime(message.createdAt);
  if (editing && canEdit) {
    return (
      <form onSubmit={onSaveEdit} className="flex w-full min-w-0 flex-col gap-2">
        <DiscussionTextarea
          autoFocus
          aria-label="Edit your message"
          value={editDraft}
          onChange={onEditDraftChange}
          className="min-h-11! max-h-36 w-full resize-none overflow-y-auto rounded-2xl bg-muted/40 px-3 py-2 shadow-none"
          disabled={disabled}
        />
        {message.body !== editOriginalBody && <p className="text-xs text-destructive" role="alert">This message changed. Cancel and edit the latest version.</p>}
        <div className="flex justify-end gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit} disabled={disabled}>Cancel</Button>
          <Button type="submit" size="sm" disabled={disabled || !editDraft.trim() || message.body !== editOriginalBody}>{disabled ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    );
  }

  const messageRow = (
    <Message align={isOwn ? "end" : "start"}>
      {isOwn ? (
        <>
          <MessageContent>
            <Tooltip>
              <TooltipTrigger render={bubble} />
              <TooltipContent side="left">
                <span className="flex flex-col gap-0.5">
                  <span>{message.authorName} · {time}</span>
                  <span>Delivered</span>
                </span>
              </TooltipContent>
            </Tooltip>
          </MessageContent>
          {avatar}
        </>
      ) : (
        <>
          {avatar}
          <MessageContent>
            <Tooltip>
              <TooltipTrigger render={bubble} />
              <TooltipContent side="right">{message.authorName} · {time}</TooltipContent>
            </Tooltip>
          </MessageContent>
        </>
      )}
    </Message>
  );
  if (!canEdit) return messageRow;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="block w-full min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        role="group"
        tabIndex={0}
        aria-label={`Message from ${message.authorName}`}
      >
        {messageRow}
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-36" positionerClassName="z-[210]">
        <ContextMenuGroup>
          <ContextMenuItem onClick={onEdit}>
            <Pencil aria-hidden="true" />
            Edit
          </ContextMenuItem>
          <ContextMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 aria-hidden="true" />
            Delete
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function normalizeContext(raw: RawRecord, fallback?: Partial<CollaborationContext>): CollaborationContext | null {
  const rawFeatureType = raw.featureType ?? raw.feature_type ?? fallback?.featureType;
  const rawAnchorType = raw.anchorType ?? raw.anchor_type ?? fallback?.anchorType;
  if (!["diagram", "note", "drawing", "flowchart"].includes(String(rawFeatureType))) return null;
  if (rawAnchorType != null && !["general", "table", "relationship", "block", "shape", "point"].includes(String(rawAnchorType))) return null;
  const rawFileId = raw.fileId ?? raw.file_id ?? fallback?.fileId;
  if (rawFileId == null) return null;
  return {
    featureType: rawFeatureType as CollaborationFeatureType,
    fileId: String(rawFileId),
    fileName: raw.fileName == null && raw.file_name == null ? fallback?.fileName ?? null : String(raw.fileName ?? raw.file_name),
    anchorType: (rawAnchorType ?? "general") as CollaborationAnchorType,
    anchorId: raw.anchorId == null && raw.anchor_id == null && fallback?.anchorId == null
      ? null
      : String(raw.anchorId ?? raw.anchor_id ?? fallback?.anchorId),
    anchorLabel: String(raw.anchorLabel ?? raw.anchor_label ?? fallback?.anchorLabel ?? "General"),
  };
}

function normalizeThread(raw: RawRecord): Thread {
  const contexts = Array.isArray(raw.contexts)
    ? raw.contexts.map((context) => normalizeContext(context as RawRecord)).filter(Boolean) as CollaborationContext[]
    : [];
  const primary = normalizeContext(raw, contexts[0]) || contexts[0] || null;
  const rawAnchorType = raw.anchorType ?? raw.anchor_type;
  const anchorType: CollaborationAnchorType = ["general", "table", "relationship", "block", "shape", "point"].includes(String(rawAnchorType))
    ? rawAnchorType as CollaborationAnchorType
    : "general";
  const rawStatus = raw.status;
  const rawPreviewMessages = raw.previewMessages ?? raw.preview_messages;
  const previewMessages = Array.isArray(rawPreviewMessages)
    ? rawPreviewMessages.map((message) => normalizeMessage(message as RawRecord))
    : typeof rawPreviewMessages === "string"
      ? (() => {
        try {
          const parsed = JSON.parse(rawPreviewMessages);
          return Array.isArray(parsed) ? parsed.map((message) => normalizeMessage(message as RawRecord)) : [];
        } catch {
          return [];
        }
      })()
      : [];
  const fallbackMessage = raw.latestMessage == null && raw.latest_message == null ? null : {
    id: String(raw.latestMessageId ?? raw.latest_message_id ?? "latest"),
    authorId: String(raw.latestAuthorId ?? raw.latest_author_id ?? ""),
    authorName: "Team member",
    body: String(raw.latestMessage ?? raw.latest_message ?? ""),
    createdAt: String(raw.lastMessageAt ?? raw.last_message_at ?? ""),
  } satisfies DiscussionMessageData;
  return {
    id: String(raw.id ?? ""),
    featureType: primary?.featureType ?? null,
    fileId: primary?.fileId ?? (raw.fileId == null && raw.file_id == null ? null : String(raw.fileId ?? raw.file_id)),
    anchorType: primary?.anchorType ?? anchorType,
    anchorId: primary?.anchorId ?? (raw.anchorId == null && raw.anchor_id == null ? null : String(raw.anchorId ?? raw.anchor_id)),
    anchorLabel: primary?.anchorLabel ?? String(raw.anchorLabel ?? raw.anchor_label ?? "General"),
    contexts: contexts.length > 0 ? contexts : primary ? [primary] : [],
    status: rawStatus === "resolved" ? "resolved" : "open",
    canDelete: Boolean(raw.canDelete ?? raw.can_delete),
    unread: Boolean(raw.unread),
    latestMessageId: raw.latestMessageId == null && raw.latest_message_id == null ? null : String(raw.latestMessageId ?? raw.latest_message_id),
    latestMessage: raw.latestMessage == null && raw.latest_message == null ? null : String(raw.latestMessage ?? raw.latest_message),
    latestAuthorId: raw.latestAuthorId == null && raw.latest_author_id == null ? null : String(raw.latestAuthorId ?? raw.latest_author_id),
    lastMessageAt: raw.lastMessageAt == null && raw.last_message_at == null ? null : String(raw.lastMessageAt ?? raw.last_message_at),
    previewMessages: previewMessages.length > 0 ? previewMessages : fallbackMessage ? [fallbackMessage] : [],
  };
}

function normalizeMessage(raw: RawRecord): DiscussionMessageData {
  return {
    id: String(raw.id ?? ""),
    threadId: raw.threadId == null && raw.thread_id == null ? undefined : String(raw.threadId ?? raw.thread_id),
    authorId: String(raw.authorId ?? raw.author_id ?? ""),
    authorName: String(raw.authorName ?? raw.author_name ?? "Team member"),
    body: String(raw.body ?? ""),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
  };
}

function messageHistoryPage(raw: RawRecord): MessageHistoryPage {
  const cursor = raw.nextCursor as RawRecord | null | undefined;
  return {
    hasMore: raw.hasMore === true,
    nextCursor: cursor?.createdAt && cursor.id ? { createdAt: String(cursor.createdAt), id: String(cursor.id) } : null,
  };
}

function mergeMessages(current: DiscussionMessageData[], incoming: DiscussionMessageData[]): DiscussionMessageData[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
}

function mergeLiveMessages(current: MessageHistoryState, incoming: DiscussionMessageData[], page: MessageHistoryPage): MessageHistoryState {
  const messages = mergeMessages(current.messages, incoming).slice(-Math.max(50, current.messages.length));
  const oldest = messages[0];
  const hasMore = current.hasMore || page.hasMore;
  return {
    messages,
    hasMore,
    nextCursor: hasMore && oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null,
  };
}

type CommentThreadGroup = {
  key: string;
  representative: Thread;
  threads: Thread[];
  previewMessages: DiscussionMessageData[];
};

function commentThreadKey(thread: Thread): string {
  return [thread.featureType || "diagram", thread.fileId || "", thread.anchorType, thread.anchorId || ""].join(":");
}

function groupCommentThreads(threads: Thread[]): CommentThreadGroup[] {
  const groups = new Map<string, CommentThreadGroup>();
  for (const thread of threads) {
    const key = commentThreadKey(thread);
    const group = groups.get(key);
    if (group) {
      group.threads.push(thread);
      group.previewMessages.push(...thread.previewMessages);
      continue;
    }
    groups.set(key, { key, representative: thread, threads: [thread], previewMessages: [...thread.previewMessages] });
  }
  return [...groups.values()].map((group) => ({
    ...group,
    previewMessages: group.previewMessages
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      .slice(-3),
  }));
}

function messageTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function relativeMessageTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : formatDistanceToNowStrict(date, { addSuffix: true });
}

function featureLabel(value: CollaborationFeatureType | null): string {
  return value === "diagram" ? "ERD" : value === "note" ? "Notes" : value === "drawing" ? "Drawing" : value === "flowchart" ? "Flowchart" : "File";
}

const featureVisuals: Record<CollaborationFeatureType, { Icon: LucideIcon; className: string }> = {
  diagram: { Icon: Database, className: "bg-feature-erd/10 text-feature-erd" },
  note: { Icon: FileText, className: "bg-feature-notes/10 text-feature-notes" },
  drawing: { Icon: PenTool, className: "bg-feature-drawing/10 text-feature-drawing" },
  flowchart: { Icon: Network, className: "bg-feature-flowchart/10 text-feature-flowchart" },
};

export function DiscussionsPanel({
  projectId,
  teamId,
  userId,
  fileContext,
  anchorContext,
  onContextSelected,
  mode = "discussions",
}: {
  projectId: string;
  teamId: string;
  userId?: string;
  fileContext: { featureType: CollaborationFeatureType; fileId: string; label: string };
  anchorContext?: DiscussionAnchor | null;
  onContextSelected?: (context: CollaborationContext) => void;
  mode?: "discussions" | "comments";
}) {
  const [open, setOpen] = useState(false);
  const activeTab = mode === "comments" ? "comments" : "discussions";
  const isCommentRail = mode === "comments";
  const [discussionScope, setDiscussionScope] = useState<"file" | "project">("file");
  const [screen, setScreen] = useState<"list" | "compose" | "thread">("list");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messageHistory, setMessageHistory] = useState<MessageHistoryState>({ messages: [], hasMore: false, nextCursor: null });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [threadError, setThreadError] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editOriginalBody, setEditOriginalBody] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [draft, setDraft] = useState("");
  const [composeAnchor, setComposeAnchor] = useState<DiscussionAnchor | null>(null);
  const [activeCommentAnchor, setActiveCommentAnchor] = useState<DiscussionAnchor | null>(null);
  const messages = messageHistory.messages;
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const olderRequest = useRef(0);
  const seenMessages = useRef(new Map<string, string>());
  const hasInitialSnapshot = useRef(false);
  const threadView = useRef({ screen, selectedThreadId });
  threadView.current = { screen, selectedThreadId };
  const clearThreadView = useCallback(() => {
    threadView.current = { screen: "list", selectedThreadId: null };
    detailRequest.current++;
    olderRequest.current++;
    setScreen("list");
    setSelectedThreadId(null);
    setMessageHistory({ messages: [], hasMore: false, nextCursor: null });
    setLoadingOlder(false);
    setOlderError("");
    setThreadError("");
    setEditingMessageId(null);
    setEditDraft("");
    setEditOriginalBody("");
    setPendingDelete(null);
    setActiveCommentAnchor(null);
  }, []);
  const resourcePath = activeTab === "comments" ? "comments" : "discussions";
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/${resourcePath}`;
  const listEndpoint = useMemo(() => requestPath(endpoint, {
    scope: activeTab === "discussions" ? discussionScope : undefined,
    feature_type: fileContext.featureType,
    file_id: fileContext.fileId,
    anchor_type: activeTab === "comments" && !isCommentRail && anchorContext ? anchorContext.type : undefined,
    anchor_id: activeTab === "comments" && !isCommentRail && anchorContext ? anchorContext.id : undefined,
  }), [activeTab, anchorContext, discussionScope, endpoint, fileContext.featureType, fileContext.fileId, isCommentRail]);
  const threadEndpoint = useCallback((threadId: string) => requestPath(`${endpoint}/${encodeURIComponent(threadId)}`, activeTab === "comments" ? {
    feature_type: fileContext.featureType,
    file_id: fileContext.fileId,
  } : {}), [activeTab, endpoint, fileContext.featureType, fileContext.fileId]);

  const loadThreads = useCallback(async (notify = false): Promise<Thread[]> => {
    const requestId = ++listRequest.current;
    setLoadError("");
    if (!hasInitialSnapshot.current) setLoadingThreads(true);
    try {
      const data = await requestJson(listEndpoint);
      if (requestId !== listRequest.current) return [];
      const nextThreads: Thread[] = Array.isArray(data.threads) ? data.threads.map((thread: RawRecord) => normalizeThread(thread)) : [];
      if (notify && hasInitialSnapshot.current) {
        for (const thread of nextThreads) {
          const previousMessageId = seenMessages.current.get(thread.id);
          if (thread.latestMessageId && thread.latestAuthorId !== userId
            && ((previousMessageId && thread.latestMessageId !== previousMessageId) || (!previousMessageId && thread.unread))) {
            toast.info(`New activity in ${thread.contexts[0]?.fileName || "Project discussion"}`);
          }
        }
      }
      seenMessages.current = new Map(nextThreads.filter((thread: Thread) => thread.latestMessageId).map((thread: Thread) => [thread.id, thread.latestMessageId!]));
      hasInitialSnapshot.current = true;
      setThreads(nextThreads);
      const selected = threadView.current;
      if (selected.screen === "thread" && selected.selectedThreadId
        && !nextThreads.some((thread) => thread.id === selected.selectedThreadId)) clearThreadView();
      setUnreadCount(Number(data.unreadCount ?? data.unread_count) || 0);
      return nextThreads;
    } catch {
      if (requestId === listRequest.current) setLoadError(`Couldn't load ${activeTab}. Try again.`);
      return [];
    } finally {
      if (requestId === listRequest.current) setLoadingThreads(false);
    }
  }, [activeTab, clearThreadView, listEndpoint, userId]);

  const focusAnchor = useCallback((anchor: DiscussionAnchor) => {
    onContextSelected?.({
      featureType: fileContext.featureType,
      fileId: fileContext.fileId,
      anchorType: anchor.type,
      anchorId: anchor.id,
      anchorLabel: anchor.type === "table" ? "Table" : "Relationship",
    });
  }, [fileContext.featureType, fileContext.fileId, onContextSelected]);

  const loadThread = useCallback(async (threadId: string, markRead: boolean, quiet = false) => {
    const requestId = ++detailRequest.current;
    if (!quiet) setThreadError("");
    try {
      const data = await requestJson(threadEndpoint(threadId));
      if (requestId !== detailRequest.current) return false;
      const nextMessages = Array.isArray(data.messages) ? data.messages.map((message: RawRecord) => normalizeMessage(message)) : [];
      const page = messageHistoryPage(data);
      setMessageHistory((current) => quiet ? mergeLiveMessages(current, nextMessages, page) : { ...page, messages: nextMessages });
      if (!quiet) setOlderError("");
      if (markRead) {
        void requestJson(requestPath(`${threadEndpoint(threadId)}/read`, activeTab === "comments" ? {
          feature_type: fileContext.featureType,
          file_id: fileContext.fileId,
        } : {}), { method: "POST" }).then(() => loadThreads()).catch(() => {});
      }
      const contexts = Array.isArray(data.contexts) ? data.contexts.map((context: RawRecord) => normalizeContext(context)).filter(Boolean) as CollaborationContext[] : [];
      if (contexts[0]) onContextSelected?.(contexts[0]);
      return true;
    } catch {
      if (!quiet && requestId === detailRequest.current) setThreadError(`Couldn't load this ${activeTab === "comments" ? "comment" : "discussion"}. Try again.`);
      return false;
    }
  }, [activeTab, fileContext.fileId, fileContext.featureType, loadThreads, onContextSelected, threadEndpoint]);

  const loadAnchor = useCallback(async (anchor: DiscussionAnchor, markRead: boolean, quiet = false, preferredThreadId?: string) => {
    const requestId = ++detailRequest.current;
    if (!quiet) setThreadError("");
    try {
      const data = await requestJson(requestPath(`${endpoint}/anchor`, {
        feature_type: fileContext.featureType,
        file_id: fileContext.fileId,
        anchor_type: anchor.type,
        anchor_id: anchor.id,
      }));
      if (requestId !== detailRequest.current) return false;
      const anchorThreads: Thread[] = Array.isArray(data.threads) ? data.threads.map((thread: RawRecord) => normalizeThread(thread)) : [];
      if (!anchorThreads.length) {
        clearThreadView();
        return true;
      }
      const anchorMessages = Array.isArray(data.messages) ? data.messages.map((message: RawRecord) => normalizeMessage(message)) : [];
      setThreads((current) => {
        const incoming = new Map<string, Thread>(anchorThreads.map((thread: Thread): [string, Thread] => [thread.id, thread]));
        return current.map((thread: Thread) => {
          const next = incoming.get(thread.id);
          return next ? { ...thread, ...next } : thread;
        });
      });
      const page = messageHistoryPage(data);
      setMessageHistory((current) => quiet ? mergeLiveMessages(current, anchorMessages, page) : { ...page, messages: anchorMessages });
      if (!quiet) setOlderError("");
      const selectedId = anchorThreads.some((thread) => thread.id === preferredThreadId) ? preferredThreadId! : anchorThreads[0].id;
      setSelectedThreadId(selectedId);
      const contexts = Array.isArray(data.contexts) ? data.contexts.map((context: RawRecord) => normalizeContext(context)).filter(Boolean) as CollaborationContext[] : [];
      if (contexts[0]) onContextSelected?.(contexts[0]);
      else focusAnchor(anchor);
      if (markRead) {
        void Promise.all(anchorThreads.map((thread: Thread) => requestJson(requestPath(`${endpoint}/${encodeURIComponent(thread.id)}/read`, {
          feature_type: fileContext.featureType,
          file_id: fileContext.fileId,
        }), { method: "POST" }).catch(() => null))).then(() => loadThreads());
      }
      return true;
    } catch {
      if (!quiet && requestId === detailRequest.current) setThreadError("Couldn't load the full comment history. Try again.");
      return false;
    }
  }, [clearThreadView, endpoint, fileContext.fileId, fileContext.featureType, focusAnchor, loadThreads, onContextSelected]);

  const loadOlderMessages = useCallback(async () => {
    const cursor = messageHistory.nextCursor;
    const threadId = selectedThreadId;
    if (!messageHistory.hasMore || !cursor || !threadId || loadingOlder) return;
    const requestId = ++olderRequest.current;
    const activeRequest = detailRequest.current;
    setLoadingOlder(true);
    setOlderError("");
    try {
      const pageQuery = { before_created_at: cursor.createdAt, before_id: cursor.id };
      const path = isCommentRail && activeCommentAnchor
        ? requestPath(`${endpoint}/anchor`, {
          feature_type: fileContext.featureType,
          file_id: fileContext.fileId,
          anchor_type: activeCommentAnchor.type,
          anchor_id: activeCommentAnchor.id,
          ...pageQuery,
        })
        : requestPath(threadEndpoint(threadId), pageQuery);
      const data = await requestJson(path);
      if (requestId !== olderRequest.current || activeRequest !== detailRequest.current) return;
      const olderMessages = Array.isArray(data.messages) ? data.messages.map((message: RawRecord) => normalizeMessage(message)) : [];
      const page = messageHistoryPage(data);
      setMessageHistory((current) => ({ ...page, messages: mergeMessages(current.messages, olderMessages) }));
    } catch {
      if (requestId === olderRequest.current) setOlderError("Could not load earlier messages.");
    } finally {
      if (requestId === olderRequest.current) setLoadingOlder(false);
    }
  }, [activeCommentAnchor, endpoint, fileContext.featureType, fileContext.fileId, isCommentRail, loadingOlder, messageHistory, selectedThreadId, threadEndpoint]);

  useEffect(() => {
    hasInitialSnapshot.current = false;
    setScreen("list");
    setSelectedThreadId(null);
    setMessageHistory({ messages: [], hasMore: false, nextCursor: null });
    setThreads([]);
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    const onWorkspaceSync = (event: Event) => {
      const detail = (event as CustomEvent<{ teamId?: string; eventType?: string; projectId?: string }>).detail;
      if (detail?.teamId !== teamId || (detail.eventType && detail.eventType !== "cloud.workspace.sync")) return;
      void loadThreads(true);
      if (open && screen === "thread" && isCommentRail && activeCommentAnchor) void loadAnchor(activeCommentAnchor, document.visibilityState === "visible", true, selectedThreadId || undefined);
      else if (open && screen === "thread" && selectedThreadId) void loadThread(selectedThreadId, document.visibilityState === "visible", true);
    };
    const onReconnect = (event: Event) => {
      if ((event as CustomEvent<{ teamId?: string }>).detail?.teamId !== teamId) return;
      void loadThreads();
      if (open && screen === "thread" && isCommentRail && activeCommentAnchor) void loadAnchor(activeCommentAnchor, document.visibilityState === "visible", true, selectedThreadId || undefined);
      else if (open && screen === "thread" && selectedThreadId) void loadThread(selectedThreadId, document.visibilityState === "visible", true);
    };
    const onLocalUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ teamId?: string; projectId?: string }>).detail;
      if (detail?.teamId !== teamId || String(detail.projectId) !== String(projectId)) return;
      void loadThreads(true);
    };
    window.addEventListener("cloud-workspace-sync", onWorkspaceSync);
    window.addEventListener("cloud-live-sync-reconnected", onReconnect);
    window.addEventListener("collaboration-updated", onLocalUpdate);
    return () => {
      window.removeEventListener("cloud-workspace-sync", onWorkspaceSync);
      window.removeEventListener("cloud-live-sync-reconnected", onReconnect);
      window.removeEventListener("collaboration-updated", onLocalUpdate);
    };
  }, [activeCommentAnchor, isCommentRail, loadAnchor, loadThread, loadThreads, open, projectId, screen, selectedThreadId, teamId]);

  useEffect(() => {
    if (!open) return;
    const interval = window.setInterval(() => void loadThreads(true), 15000);
    return () => window.clearInterval(interval);
  }, [loadThreads, open]);

  useEffect(() => {
    if (!isCommentRail) return;
    const onCommentRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: DiscussionAnchor["type"]; id?: string }>).detail;
      if (fileContext.featureType !== "diagram" || !detail?.type || !detail.id) return;
      const anchor = { type: detail.type, id: detail.id } satisfies DiscussionAnchor;
      setActiveCommentAnchor(anchor);
      setComposeAnchor(anchor);
      setDraft("");
      setThreadError("");
      focusAnchor(anchor);
      setOpen(true);
      void (async () => {
        const snapshot = threads.length > 0 ? threads : await loadThreads();
        const group = groupCommentThreads(snapshot).find((candidate) => candidate.representative.anchorType === anchor.type && candidate.representative.anchorId === anchor.id);
        if (group) {
          setScreen("thread");
          await loadAnchor(anchor, true, false, group.representative.id);
        } else {
          setScreen("compose");
        }
      })();
    };
    window.addEventListener("erd-comment-open-request", onCommentRequest);
    return () => window.removeEventListener("erd-comment-open-request", onCommentRequest);
  }, [fileContext.featureType, focusAnchor, isCommentRail, loadAnchor, loadThreads, threads]);

  const handleOpenChange = (next: boolean) => {
    if (!next && pendingDelete) return;
    setOpen(next);
    if (next) {
      void loadThreads();
      if (screen === "thread" && isCommentRail && activeCommentAnchor) void loadAnchor(activeCommentAnchor, true, false, selectedThreadId || undefined);
      else if (screen === "thread" && selectedThreadId) void loadThread(selectedThreadId, true);
    } else {
      cancelEditMessage();
      setPendingDelete(null);
    }
  };

  const openThread = async (thread: Thread) => {
    setDraft("");
    cancelEditMessage();
    setPendingDelete(null);
    const context = thread.contexts[0] || normalizeContext(thread);
    const anchor = context?.anchorType && ["table", "relationship"].includes(context.anchorType) && context.anchorId
      ? { type: context.anchorType as DiscussionAnchor["type"], id: context.anchorId }
      : thread.anchorType && ["table", "relationship"].includes(thread.anchorType) && thread.anchorId
        ? { type: thread.anchorType as DiscussionAnchor["type"], id: thread.anchorId }
        : null;
    if (isCommentRail && anchor) {
      setActiveCommentAnchor(anchor);
      setScreen("thread");
      setSelectedThreadId(thread.id);
      setMessageHistory({ messages: [], hasMore: false, nextCursor: null });
      focusAnchor(anchor);
      await loadAnchor(anchor, true, false, thread.id);
      return;
    }
    setScreen("thread");
    setSelectedThreadId(thread.id);
    setMessageHistory({ messages: [], hasMore: false, nextCursor: null });
    const loaded = await loadThread(thread.id, true);
    if (loaded) {
      if (context) onContextSelected?.(context);
    }
  };

  const openCommentGroup = async (group: CommentThreadGroup) => {
    const anchor = group.representative.anchorType && group.representative.anchorId
      ? { type: group.representative.anchorType as DiscussionAnchor["type"], id: group.representative.anchorId }
      : null;
    if (!anchor) return;
    await openThread(group.representative);
  };

  const startCompose = () => {
    const nextAnchor = activeTab === "comments" ? (isCommentRail ? activeCommentAnchor : anchorContext) ?? null : null;
    if (activeTab === "comments" && !nextAnchor) {
      toast.info("Select a table or relationship before adding a comment.");
      return;
    }
    setComposeAnchor(nextAnchor);
    setDraft("");
    setThreadError("");
    cancelEditMessage();
    setScreen("compose");
  };

  const notifyLocalUpdate = () => window.dispatchEvent(new CustomEvent("collaboration-updated", { detail: { teamId, projectId } }));

  const submitThread = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setThreadError("");
    try {
      const created = await requestJson(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          context: {
            type: activeTab === "comments" ? composeAnchor?.type : "general",
            ...(activeTab === "comments" ? { id: composeAnchor?.id } : {}),
            featureType: fileContext.featureType,
            fileId: fileContext.fileId,
          },
        }),
      });
      setDraft("");
      setComposeAnchor(null);
      setSelectedThreadId(created.id);
      setScreen("thread");
      notifyLocalUpdate();
      await loadThreads();
      if (isCommentRail && composeAnchor) await loadAnchor(composeAnchor, true, false, created.id);
      else await loadThread(created.id, true);
    } catch {
      setThreadError(`Couldn't start the ${activeTab === "comments" ? "comment" : "discussion"}. Try again.`);
    } finally {
      setSending(false);
    }
  };

  const submitReply = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selectedThreadId || sending) return;
    setSending(true);
    setThreadError("");
    try {
      await requestJson(requestPath(`${endpoint}/${encodeURIComponent(selectedThreadId)}/messages`, activeTab === "comments" ? {
        feature_type: fileContext.featureType,
        file_id: fileContext.fileId,
      } : {}), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      setDraft("");
      notifyLocalUpdate();
      if (isCommentRail && activeCommentAnchor) await loadAnchor(activeCommentAnchor, true, true, selectedThreadId);
      else await loadThread(selectedThreadId, true, true);
      await loadThreads();
    } catch {
      setThreadError(`Couldn't send the reply. Reopen the ${activeTab === "comments" ? "comment" : "discussion"} if it was resolved.`);
    } finally {
      setSending(false);
    }
  };

  const startEditMessage = (message: DiscussionMessageData) => {
    if (activeTab !== "discussions" || message.authorId !== userId) return;
    setEditingMessageId(message.id);
    setEditDraft(message.body);
    setEditOriginalBody(message.body);
  };

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setEditDraft("");
    setEditOriginalBody("");
  };

  const saveMessageEdit = async (message: DiscussionMessageData, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = editDraft.trim();
    const threadId = selectedThreadId;
    if (activeTab !== "discussions" || message.authorId !== userId || !threadId || !body || message.body !== editOriginalBody || sending) return;
    setSending(true);
    try {
      await requestJson(`${endpoint}/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(message.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, expectedBody: editOriginalBody }),
      });
      setMessageHistory((current) => ({
        ...current,
        messages: current.messages.map((item) => item.id === message.id ? { ...item, body } : item),
      }));
      cancelEditMessage();
      notifyLocalUpdate();
    } catch (cause) {
      await loadThread(threadId, true, true);
      toast.error(cause instanceof Error ? cause.message : "Couldn't update this message. Try again.");
    } finally {
      setSending(false);
    }
  };

  const deleteThread = async (threadId: string) => {
    const thread = threads.find((item) => item.id === threadId);
    if (activeTab !== "discussions" || !thread?.canDelete || sending) return;
    setSending(true);
    try {
      await requestJson(`${endpoint}/${encodeURIComponent(thread.id)}`, { method: "DELETE" });
      setPendingDelete(null);
      if (selectedThreadId === threadId) {
        clearThreadView();
      }
      notifyLocalUpdate();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Couldn't delete this discussion. Try again.");
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (threadId: string, message: DiscussionMessageData) => {
    if (activeTab !== "discussions" || selectedThreadId !== threadId || message.authorId !== userId || sending) return;
    setSending(true);
    try {
      await requestJson(`${endpoint}/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(message.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedBody: message.body }),
      });
      setMessageHistory((current) => ({
        ...current,
        messages: current.messages.filter((item) => item.id !== message.id),
      }));
      if (editingMessageId === message.id) cancelEditMessage();
      setPendingDelete(null);
      await loadThreads();
      notifyLocalUpdate();
    } catch (cause) {
      await loadThread(threadId, true, true);
      toast.error(cause instanceof Error ? cause.message : "Couldn't delete this message. Try again.");
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async () => {
    const thread = threads.find((item) => item.id === selectedThreadId);
    if (!thread || sending) return;
    setSending(true);
    const expectedStatus = thread.status;
    try {
      await requestJson(requestPath(`${endpoint}/${encodeURIComponent(thread.id)}`, activeTab === "comments" ? {
        feature_type: fileContext.featureType,
        file_id: fileContext.fileId,
      } : {}), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: expectedStatus === "open" ? "resolved" : "open", expectedStatus }),
      });
      notifyLocalUpdate();
      await loadThreads();
    } catch (cause) {
      setThreadError(cause instanceof Error ? cause.message : `Couldn't update this ${activeTab === "comments" ? "comment" : "discussion"}. Try again.`);
      await loadThreads();
    } finally {
      setSending(false);
    }
  };

  const activeThread = threads.find((thread) => thread.id === selectedThreadId);
  const commentGroups = useMemo(() => groupCommentThreads(threads), [threads]);
  const messageGroups = useMemo(() => groupMessages(messages), [messages]);
  const title = activeTab === "discussions"
    ? "Discussions"
    : screen === "compose" ? "New comment"
      : screen === "thread" ? activeThread?.anchorLabel || "Comment"
        : "Comments";
  const relatedFile = screen === "list"
    ? discussionScope === "file" ? fileContext.label : null
    : screen === "compose" ? fileContext.label
      : activeThread?.contexts[0]?.fileName || (activeThread?.fileId === fileContext.fileId ? fileContext.label : null);
  const description = activeTab === "comments"
    ? isCommentRail ? `Latest activity on ${fileContext.label}` : `Comments on ${fileContext.label}`
    : relatedFile ? `Related to ${relatedFile}` : screen === "list" ? "All project discussions" : "Project discussion";
  const descriptionId = isCommentRail ? "erd-comments-description" : "erd-discussions-description";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`${isCommentRail ? "Open comments" : "Open discussions"}${unreadCount ? `, ${unreadCount} unread` : ""}`}
            title={isCommentRail ? "Comments" : "Discussions"}
          >
            {isCommentRail ? <MessageCircle aria-hidden="true" /> : <MessageSquareText aria-hidden="true" />}
            {unreadCount > 0 && <Badge variant="default" className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px] leading-none">{unreadCount}</Badge>}
          </Button>
        }
      />
      <PopoverContent
        side={isCommentRail ? "left" : "bottom"}
        align={isCommentRail ? "start" : "end"}
        sideOffset={8}
        className={cn("flex h-[min(42rem,calc(100svh-5rem))] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0", isCommentRail ? "w-[min(22rem,calc(100vw-1rem))]" : "w-[min(28rem,calc(100vw-1rem))]")}
        aria-describedby={descriptionId}
      >
        <div className="shrink-0 border-b border-border px-4 py-3">
          {activeTab === "discussions" ? (
            <div className="grid grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)] items-center gap-2 max-sm:grid-cols-[2rem_minmax(0,1fr)_auto] max-sm:grid-rows-[auto_auto]">
              {screen === "list" ? <span aria-hidden="true" className="size-7 max-sm:col-start-1 max-sm:row-start-2" /> : (
                <Button type="button" variant="ghost" size="icon-xs" className="justify-self-start max-sm:col-start-1 max-sm:row-start-2" aria-label="Back to discussion list" onClick={() => setScreen("list")}>
                  <ArrowLeft aria-hidden="true" className="size-4" />
                </Button>
              )}
              <div className="col-start-2 row-start-1 min-w-0 max-w-28 justify-self-center text-center max-sm:col-span-3 max-sm:col-start-1 max-sm:max-w-none max-sm:justify-self-stretch">
                <h2 className="truncate text-base font-semibold">{title}</h2>
                <p id={descriptionId} className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
              </div>
              <div className="col-start-3 row-start-1 flex min-w-0 items-center justify-self-end gap-0.5 max-sm:col-start-2 max-sm:col-span-2 max-sm:row-start-2">
                {screen === "thread" && activeThread && (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label="Discussion actions"><MoreHorizontal aria-hidden="true" className="size-4" /></Button>} />
                    <DropdownMenuContent align="end" className="w-44" positionerClassName="z-[210]">
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => void changeStatus()} disabled={sending}>
                          {activeThread.status === "open" ? <Check aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                          {activeThread.status === "open" ? "Resolve" : "Reopen"}
                        </DropdownMenuItem>
                        {activeThread.canDelete && (
                          <DropdownMenuItem variant="destructive" onClick={() => setPendingDelete({ type: "thread", threadId: activeThread.id })}>
                            <Trash2 aria-hidden="true" />
                            Delete Thread
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Close discussions" onClick={() => setOpen(false)}>
                  <X aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {screen !== "list" && (
                  <Button variant="ghost" size="sm" className="mb-2 -ml-2 min-h-11 px-2" onClick={() => setScreen("list")}>
                    <ArrowLeft aria-hidden="true" />
                    Back to list
                  </Button>
                )}
                <h2 className="truncate text-sm font-semibold">{title}</h2>
                <p id={descriptionId} className="mt-1 truncate text-xs text-muted-foreground">{description}</p>
              </div>
              <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Close comments" onClick={() => setOpen(false)}>
                <X aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>

        {screen === "list" && (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {activeTab === "discussions" ? (
              <div className="shrink-0 border-b border-border/70 px-3 py-2">
                <Tabs value={discussionScope} onValueChange={(value) => setDiscussionScope(value as "file" | "project")} className="w-full">
                  <TabsList className="mx-auto max-sm:min-h-11">
                    <TabsTrigger value="file" className="max-sm:min-h-11">This File</TabsTrigger>
                    <TabsTrigger value="project" className="max-sm:min-h-11">All Project</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            ) : isCommentRail ? (
              <div className="shrink-0 border-b border-border/70 px-4 py-2 text-xs text-muted-foreground">
                Showing the latest few messages. Open a card to load the full history.
              </div>
            ) : (
              <div className="shrink-0 border-b border-border/70 px-4 py-2 text-xs text-muted-foreground">
                {anchorContext ? `Selected ${anchorContext.type}` : "Select a table or relationship to add a comment."}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto pb-24">
              {loadingThreads && <p role="status" className="px-4 py-5 text-center text-sm text-muted-foreground">Loading {activeTab}…</p>}
              {!loadingThreads && loadError && (
                <div className="m-4 rounded-lg border border-destructive/40 p-4 text-sm">
                  <p>{loadError}</p>
                  <Button variant="outline" className="mt-3 min-h-11" onClick={() => void loadThreads()}>Retry</Button>
                </div>
              )}
              {!loadingThreads && !loadError && (isCommentRail ? commentGroups.length : threads.length) === 0 && (
                <div className="mx-4 mt-4 rounded-lg border border-dashed border-border px-4 py-8 text-center">
                  <p className="text-sm font-medium">{activeTab === "comments" ? "No comments on this file yet." : "No discussions in this view yet."}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{activeTab === "comments" ? "Use the node context menu to start one." : "Start a thread to capture a question or design decision."}</p>
                </div>
              )}
              {!loadError && isCommentRail && commentGroups.map((group) => {
                const thread = group.representative;
                const StatusIcon = thread.status === "resolved" ? CheckCircle2 : MessageCircle;
                const statusLabel = thread.status === "resolved" ? "Resolved" : thread.unread ? "New activity" : "Open";
                return (
                  <button
                    type="button"
                    key={group.key}
                    className={cn("w-full border-b border-border/70 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", thread.unread && "bg-primary/5")}
                    onClick={() => void openCommentGroup(group)}
                  >
                    <span className="flex items-center gap-3">
                      <span role="img" aria-label={statusLabel} className={cn("relative flex size-9 shrink-0 items-center justify-center rounded-full", thread.status === "resolved" ? "bg-emerald-500/10 text-emerald-500" : thread.unread ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                        <StatusIcon aria-hidden="true" className="size-4" />
                        {thread.unread && <span aria-hidden="true" className="absolute right-0.5 top-0.5 size-2 rounded-full bg-primary ring-2 ring-popover" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={cn("truncate text-sm", thread.unread ? "font-semibold text-foreground" : "font-medium")}>{thread.anchorLabel || "Comment"}</span>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{relativeMessageTime(thread.lastMessageAt)}</span>
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">{featureLabel(thread.featureType)} · {group.threads.length} {group.threads.length === 1 ? "thread" : "threads"}</span>
                      </span>
                    </span>
                    <span className="mt-3 block space-y-1 pl-12">
                      {group.previewMessages.map((message) => <span key={message.id} className="block truncate text-sm text-muted-foreground">{message.body}</span>)}
                    </span>
                  </button>
                );
              })}
              {!loadError && !isCommentRail && threads.map((thread) => {
                const visual = thread.featureType ? featureVisuals[thread.featureType] : null;
                const FileIcon = visual?.Icon ?? MessageSquareText;
                const fileName = thread.contexts[0]?.fileName
                  || (thread.fileId === fileContext.fileId ? fileContext.label : "Project discussion");
                return (
                  <button
                    type="button"
                    key={thread.id}
                    className={cn("flex min-h-18 w-full items-center gap-3 border-b border-border/70 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", thread.unread && "bg-primary/5")}
                    onClick={() => void openThread(thread)}
                  >
                    <span aria-hidden="true" className={cn("relative flex size-10 shrink-0 items-center justify-center rounded-full", visual?.className ?? "bg-muted text-muted-foreground")}>
                      <FileIcon />
                      {thread.unread && <span aria-hidden="true" className="absolute right-0.5 top-0.5 size-2 rounded-full bg-primary ring-2 ring-popover" />}
                    </span>
                    <span className="sr-only">{featureLabel(thread.featureType)} file</span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cn("min-w-0 flex-1 truncate text-sm", thread.unread ? "font-semibold text-foreground" : "font-medium")}>{fileName}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{relativeMessageTime(thread.lastMessageAt)}</span>
                      </span>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cn("min-w-0 flex-1 truncate text-sm", thread.unread ? "text-foreground" : "text-muted-foreground")}>{thread.latestMessage || ""}</span>
                        {thread.status === "resolved" && <Badge variant="outline" className="shrink-0 gap-1 font-normal text-muted-foreground"><CheckCircle2 aria-hidden="true" />Resolved</Badge>}
                      </span>
                      {thread.unread && <span className="sr-only">New activity</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <TooltipProvider delay={250}>
              <Tooltip>
                <TooltipTrigger render={<Button type="button" size="icon-lg" className="absolute bottom-4 right-4 z-10 min-h-11 min-w-11 rounded-full shadow-lg" aria-label={activeTab === "comments" ? "Add a comment" : "Start a discussion"} onClick={startCompose}><Plus aria-hidden="true" /></Button>} />
                <TooltipContent side="left">{activeTab === "comments" ? "Add a comment" : "Start a discussion"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        {screen === "compose" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="flex flex-1 flex-col gap-4 p-4">
              {activeTab === "comments" && <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Context</span>
                <p className="mt-1 font-medium">{`${composeAnchor?.type || "node"} · ${fileContext.label}`}</p>
              </div>}
              {threadError && <p role="alert" className="text-sm text-destructive">{threadError}</p>}
            </div>
            <DiscussionComposer id="collaboration-message" value={draft} onChange={setDraft} onSubmit={submitThread} placeholder={activeTab === "comments" ? "Write a comment..." : "Write a question or design decision..."} disabled={sending} submitLabel={sending ? "Sending…" : activeTab === "comments" ? "Add comment" : "Start discussion"} />
          </div>
        )}

        {screen === "thread" && activeThread && (
          <div className="flex min-h-0 flex-1 flex-col">
            {activeTab === "comments" && <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <span className="block truncate text-sm text-muted-foreground">{activeThread.anchorType === "general" ? "General" : activeThread.anchorType}</span>
                {activeThread.featureType && <span className="block truncate text-xs text-muted-foreground">{featureLabel(activeThread.featureType)} · {isCommentRail || activeThread.fileId === fileContext.fileId ? "Current file" : "Project file"}</span>}
              </div>
              <Button variant="outline" className="min-h-11 shrink-0" onClick={() => void changeStatus()} disabled={sending}>
                {activeThread.status === "open" ? <Check aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                {activeThread.status === "open" ? "Resolve" : "Reopen"}
              </Button>
            </div>}
            {threadError && (
              <div className="m-4 rounded-lg border border-destructive/40 p-4 text-sm" role="alert">
                <p>{threadError}</p>
                <Button
                  variant="outline"
                  className="mt-3 min-h-11"
                  onClick={() => void (isCommentRail && activeCommentAnchor ? loadAnchor(activeCommentAnchor, true) : loadThread(activeThread.id, true))}
                >Retry</Button>
              </div>
            )}
            {!threadError && (
              <TooltipProvider delay={250}>
                <MessageScrollerProvider key={activeThread.id} defaultScrollPosition="end">
                  <MessageScroller className="flex-1">
                    <MessageScrollerViewport aria-label={`${activeTab === "comments" ? "Comment" : "Discussion"} messages`}>
                      <MessageScrollerContent className="gap-4 p-4">
                        {messageHistory.hasMore && (
                          <div className="flex flex-col items-center gap-1">
                            <Button type="button" size="sm" variant="ghost" onClick={() => void loadOlderMessages()} disabled={loadingOlder}>
                              {loadingOlder ? "Loading…" : "Load earlier messages"}
                            </Button>
                            {olderError && <p className="text-xs text-destructive" role="alert">{olderError}</p>}
                          </div>
                        )}
                        {messageGroups.map((group) => (
                          <MessageGroup key={group[0].id}>
                            {group.map((message, index) => (
                              <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={index === 0}>
                                <DiscussionMessage
                                  message={message}
                                  isOwn={message.authorId === userId}
                                  showAvatar={index === group.length - 1}
                                  canEdit={activeTab === "discussions" && message.authorId === userId}
                                  editing={editingMessageId === message.id}
                                  editDraft={editDraft}
                                  editOriginalBody={editOriginalBody}
                                  disabled={sending}
                                  onEdit={() => startEditMessage(message)}
                                  onDelete={() => setPendingDelete({ type: "message", threadId: activeThread.id, message })}
                                  onEditDraftChange={setEditDraft}
                                  onCancelEdit={cancelEditMessage}
                                  onSaveEdit={(event) => { void saveMessageEdit(message, event); }}
                                />
                              </MessageScrollerItem>
                            ))}
                          </MessageGroup>
                        ))}
                      </MessageScrollerContent>
                    </MessageScrollerViewport>
                    <MessageScrollerButton />
                  </MessageScroller>
                </MessageScrollerProvider>
              </TooltipProvider>
            )}
            {activeThread.status === "open" && !threadError && <DiscussionComposer id="collaboration-reply" value={draft} onChange={setDraft} onSubmit={submitReply} placeholder={activeTab === "comments" ? "Write a reply..." : "Write a reply..."} disabled={sending} submitLabel={sending ? "Sending…" : "Send reply"} />}
            {activeThread.status === "resolved" && <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">Reopen this thread to reply.</p>}
          </div>
        )}
      </PopoverContent>
      <ConfirmModal
        isOpen={pendingDelete !== null}
        title={pendingDelete?.type === "message" ? "Delete message?" : "Delete discussion?"}
        message={pendingDelete?.type === "message"
          ? "This message will be permanently deleted."
          : "This permanently deletes the discussion and all its messages. This action cannot be undone."}
        confirmText={pendingDelete?.type === "message" ? "Delete message" : "Delete Thread"}
        cancelText="Cancel"
        variant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete?.type === "message") void deleteMessage(pendingDelete.threadId, pendingDelete.message);
          else if (pendingDelete) void deleteThread(pendingDelete.threadId);
        }}
      />
    </Popover>
  );
}
