import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type FormEvent } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowLeft, Check, CheckCircle2, Database, FileText, MessageCircle, MessageSquareText, MoreHorizontal, Network, PenTool, Pencil, Plus, RotateCcw, Send, Trash2, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ConfirmModal from "@/components/ConfirmModal";
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/message-scroller";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CommentAvatar, shortCommentTime } from "@/components/comments/CommentThreadView";
import { ReplyBox } from "@/components/comments/ReplyBox";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useFileSession } from '@/contexts/FileSessionContext';

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
type DiscussionAnchor = { type: Exclude<CollaborationAnchorType, "general">; id: string };
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
type PendingCommentOpen = { type: DiscussionAnchor["type"]; id: string };
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
    <Textarea data-comment-draft
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

function DiscussionMessage({ message, canEdit, canDelete = canEdit, editing, editDraft, editOriginalBody, disabled, onEdit, onDelete, onEditDraftChange, onCancelEdit, onSaveEdit }: {
  message: DiscussionMessageData;
  canEdit: boolean;
  /** Comment messages are edited, not deleted one by one: the thread's creator deletes the whole thread. */
  canDelete?: boolean;
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
  const changedElsewhere = message.body !== editOriginalBody;
  return (
    <div className="group/message relative flex gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-muted/40 focus-within:bg-muted/40">
      <CommentAvatar name={message.authorName} className="mt-0.5 size-7" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold">{message.authorName}</span>
          <span className="shrink-0 text-xs text-muted-foreground" title={messageTime(message.createdAt)}>{shortCommentTime(message.createdAt)}</span>
        </div>
        {editing && canEdit ? (
          <form onSubmit={onSaveEdit} className="mt-1 flex flex-col gap-1.5">
            <div className="flex items-end gap-1.5 rounded-lg border border-primary/60 bg-background px-2.5 py-1.5 ring-2 ring-primary/20">
              <DiscussionTextarea
                autoFocus
                onFocus={(event) => { const end = event.currentTarget.value.length; event.currentTarget.setSelectionRange(end, end); }}
                aria-label="Edit your message"
                value={editDraft}
                onChange={onEditDraftChange}
                className="min-h-6! max-h-32 flex-1 resize-none overflow-y-auto border-0 bg-transparent p-0 py-0.5 text-sm shadow-none focus-visible:ring-0"
                disabled={disabled}
              />
              <Button type="button" variant="secondary" size="icon-xs" className="rounded-full" aria-label="Cancel edit" onClick={onCancelEdit} disabled={disabled}>
                <X aria-hidden="true" className="size-3.5" />
              </Button>
              <Button type="submit" size="icon-xs" className="rounded-full" aria-label="Save message" disabled={disabled || !editDraft.trim() || changedElsewhere}>
                <Check aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
            {changedElsewhere && <p className="text-xs text-destructive" role="alert">This message changed. Cancel and edit the latest version.</p>}
          </form>
        ) : (
          <p className="whitespace-pre-wrap wrap-break-word text-sm">{message.body}</p>
        )}
      </div>
      {canEdit && !editing && (
        <div className="absolute -top-3 right-1 z-10 hidden rounded-md border bg-popover shadow-sm group-hover/message:flex group-focus-within/message:flex [@media(hover:none)]:flex">
          <Tooltip>
            <TooltipTrigger render={
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Edit message" onClick={onEdit}><Pencil aria-hidden="true" className="size-3.5" /></Button>
            } />
            <TooltipContent side="top">Edit</TooltipContent>
          </Tooltip>
          {canDelete && <Tooltip>
            <TooltipTrigger render={
              <Button type="button" variant="ghost" size="icon-xs" className="text-destructive hover:text-destructive" aria-label="Delete message" onClick={onDelete}><Trash2 aria-hidden="true" className="size-3.5" /></Button>
            } />
            <TooltipContent side="top">Delete</TooltipContent>
          </Tooltip>}
        </div>
      )}
    </div>
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

type ActiveDetailRefreshTarget =
  | { kind: "thread"; threadId: string }
  | { kind: "anchor"; anchor: DiscussionAnchor; threadId: string | null };

export function getActiveDetailRefreshTarget(
  screen: "list" | "compose" | "thread",
  activeTab: "discussions" | "comments",
  activeCommentAnchor: DiscussionAnchor | null,
  selectedThreadId: string | null,
): ActiveDetailRefreshTarget | null {
  if (screen !== "thread") return null;
  if (activeTab === "comments" && activeCommentAnchor) return { kind: "anchor", anchor: activeCommentAnchor, threadId: selectedThreadId };
  return selectedThreadId ? { kind: "thread", threadId: selectedThreadId } : null;
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

const commentAnchors: Record<CollaborationFeatureType, ReadonlySet<DiscussionAnchor["type"]>> = {
  diagram: new Set(["table", "relationship"]),
  note: new Set(["block"]),
  drawing: new Set(["point"]),
  flowchart: new Set(["shape"]),
};

export function isCommentAnchorForFeature(featureType: CollaborationFeatureType, anchorType: unknown): anchorType is DiscussionAnchor["type"] {
  return typeof anchorType === "string" && commentAnchors[featureType].has(anchorType as DiscussionAnchor["type"]);
}

export function DiscussionsPanel({
  projectId,
  teamId,
  userId,
  userName,
  fileContext,
  anchorContext,
  onContextSelected,
  anchorPreview,
  readOnly = false,
}: {
  projectId: string;
  teamId: string;
  userId?: string;
  userName?: string;
  fileContext: { featureType: CollaborationFeatureType; fileId: string; label: string };
  anchorContext?: DiscussionAnchor | null;
  onContextSelected?: (context: CollaborationContext) => void;
  /** Text of the commented content (e.g. a Note block); null when unknown. */
  /** Note block text for a comment anchor; `null` means the block was deleted, `undefined` that it is not known yet. */
  anchorPreview?: (anchorId: string) => string | null | undefined;
  /** A Project Viewer reads threads but cannot start, reply to, resolve or edit them (COL-004). */
  readOnly?: boolean;
}) {
  const fileSession = useFileSession();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"discussions" | "comments">("discussions");
  const isCommentRail = activeTab === "comments";
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
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingCommentOpen, setPendingCommentOpen] = useState<PendingCommentOpen | null>(null);
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
  const handleTabChange = useCallback((value: string) => {
    const nextTab = value as "discussions" | "comments";
    if (nextTab === activeTab) return;
    clearThreadView();
    setPendingCommentOpen(null);
    setDraft("");
    setActiveTab(nextTab);
  }, [activeTab, clearThreadView]);
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
      anchorLabel: anchor.type === "table" ? "Table" : anchor.type === "relationship" ? "Relationship" : anchor.type[0].toUpperCase() + anchor.type.slice(1),
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

  const refreshActiveDetail = useCallback((markRead: boolean) => {
    if (!open) return;
    const target = getActiveDetailRefreshTarget(screen, activeTab, activeCommentAnchor, selectedThreadId);
    if (!target) return;
    if (target.kind === "anchor") {
      void loadAnchor(target.anchor, markRead, true, target.threadId || undefined);
    } else {
      void loadThread(target.threadId, markRead, true);
    }
  }, [activeCommentAnchor, activeTab, loadAnchor, loadThread, open, screen, selectedThreadId]);

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
      refreshActiveDetail(document.visibilityState === "visible");
    };
    const onReconnect = (event: Event) => {
      if ((event as CustomEvent<{ teamId?: string }>).detail?.teamId !== teamId) return;
      void loadThreads();
      refreshActiveDetail(document.visibilityState === "visible");
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
  }, [loadThreads, projectId, refreshActiveDetail, teamId]);

  useEffect(() => {
    if (!open) return;
    const interval = window.setInterval(() => {
      void loadThreads(true);
      if (!document.hidden) refreshActiveDetail(true);
    }, 15000);
    return () => window.clearInterval(interval);
  }, [loadThreads, open, refreshActiveDetail]);

  useEffect(() => {
    const onCommentRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ featureType?: CollaborationFeatureType; fileId?: string; type?: CollaborationAnchorType; id?: string }>).detail;
      if (!detail?.id || detail.featureType !== fileContext.featureType
        || (detail.fileId && String(detail.fileId) !== fileContext.fileId)
        || !isCommentAnchorForFeature(fileContext.featureType, detail.type)) return;
      setPendingCommentOpen({ type: detail.type, id: detail.id });
      setDraft("");
      setThreadError("");
      setActiveTab("comments");
      setOpen(true);
    };
    window.addEventListener("project-comment-open-request", onCommentRequest);
    return () => window.removeEventListener("project-comment-open-request", onCommentRequest);
  }, [fileContext.fileId, fileContext.featureType]);

  useEffect(() => {
    if (activeTab !== "comments" || !pendingCommentOpen) return;
    let cancelled = false;
    const anchor = pendingCommentOpen;
    setActiveCommentAnchor(anchor);
    setComposeAnchor(anchor);
    void (async () => {
      const snapshot = await loadThreads();
      if (cancelled) return;
      const group = groupCommentThreads(snapshot).find((candidate) => candidate.representative.anchorType === anchor.type && candidate.representative.anchorId === anchor.id);
      if (group) {
        setScreen("thread");
        setSelectedThreadId(group.representative.id);
        await loadAnchor(anchor, true, false, group.representative.id);
      } else {
        setScreen(readOnly ? "list" : "compose");
      }
      if (!cancelled) setPendingCommentOpen(null);
    })();
    return () => { cancelled = true; };
  }, [activeTab, loadAnchor, loadThreads, pendingCommentOpen]);

  const hasUnsavedText = ((screen === "thread" || screen === "compose") && draft.trim() !== "")
    || (editingMessageId !== null && editDraft !== editOriginalBody);

  const handleOpenChange = (next: boolean, details?: { reason?: string; event?: Event }) => {
    if (!next && (pendingDelete || confirmDiscard)) return;
    // The thread actions menu renders in its own portal; pressing an item there is not an outside click.
    const target = details?.event?.target;
    if (!next && fileSession && details?.reason === 'outside-press' && target instanceof Element && !fileSession.host.current?.contains(target)) return;
    if (!next && details?.reason === "outside-press" && target instanceof Element
      && target.closest('[data-slot="dropdown-menu-content"]')) return;
    if (!next && hasUnsavedText) { setConfirmDiscard(true); return; }
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
    const anchorType = context?.anchorType ?? thread.anchorType;
    const anchorId = context?.anchorId ?? thread.anchorId;
    const anchorFeature = context?.featureType ?? thread.featureType ?? fileContext.featureType;
    const anchor = anchorId && isCommentAnchorForFeature(anchorFeature, anchorType)
      ? { type: anchorType, id: anchorId }
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
    const featureType = group.representative.featureType ?? fileContext.featureType;
    const anchor = group.representative.anchorType && group.representative.anchorId
      && isCommentAnchorForFeature(featureType, group.representative.anchorType)
      ? { type: group.representative.anchorType, id: group.representative.anchorId }
      : null;
    if (!anchor) return;
    await openThread(group.representative);
  };

  const startCompose = () => {
    const nextAnchor = activeTab === "comments" ? (isCommentRail ? activeCommentAnchor : anchorContext) ?? null : null;
    if (activeTab === "comments" && !nextAnchor) {
      toast.info("Select an item on this file before adding a comment.");
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

  const submitReply = async () => {
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

  // Comment endpoints are file-scoped: every call names the file the thread lives on.
  const commentFileQuery = isCommentRail ? { feature_type: fileContext.featureType, file_id: fileContext.fileId } : {};
  const reloadActiveThread = (threadId: string) => isCommentRail && activeCommentAnchor
    ? loadAnchor(activeCommentAnchor, true, true, threadId)
    : loadThread(threadId, true, true);

  const startEditMessage = (message: DiscussionMessageData) => {
    if (message.authorId !== userId) return;
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
    if (message.authorId !== userId || !threadId || !body || message.body !== editOriginalBody || sending) return;
    setSending(true);
    try {
      await requestJson(requestPath(`${endpoint}/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(message.id)}`, commentFileQuery), {
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
      await reloadActiveThread(threadId);
      toast.error(cause instanceof Error ? cause.message : "Couldn't update this message. Try again.");
    } finally {
      setSending(false);
    }
  };

  const deleteThread = async (threadId: string) => {
    const thread = threads.find((item) => item.id === threadId);
    if (!thread?.canDelete || sending) return;
    setSending(true);
    try {
      await requestJson(requestPath(`${endpoint}/${encodeURIComponent(thread.id)}`, commentFileQuery), { method: "DELETE" });
      setPendingDelete(null);
      if (selectedThreadId === threadId) {
        clearThreadView();
      }
      notifyLocalUpdate();
      if (isCommentRail) await loadThreads();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : `Couldn't delete this ${isCommentRail ? "comment" : "discussion"}. Try again.`);
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
  const descriptionId = `${panelId}-description`;

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
        anchor={fileSession ? () => {
          const host = fileSession.host.current;
          if (!host) return null;
          return { contextElement: host, getBoundingClientRect: () => { const rect = host.getBoundingClientRect(); return new DOMRect(rect.right - 8, rect.top + 8, 0, 0); } };
        } : undefined}
        side={fileSession ? 'bottom' : 'left'}
        align={fileSession ? 'end' : 'start'}
        sideOffset={8}
        data-discussions-panel=""
        className={cn("flex h-[min(42rem,calc(100svh-5rem))] w-[min(24rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0", fileSession && 'max-h-(--available-height)')}
        aria-describedby={descriptionId}
      >
        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="flex items-center gap-1">
            {screen !== "list" && (
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Back to list" onClick={() => setScreen("list")}>
                <ArrowLeft aria-hidden="true" className="size-4" />
              </Button>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">{title}</h2>
              <p id={descriptionId} className="truncate text-xs text-muted-foreground">{description}</p>
            </div>
            {activeTab === "discussions" && screen === "thread" && activeThread && !readOnly && (
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
            <Button type="button" variant="ghost" size="icon-xs" aria-label={`Close ${activeTab}`} onClick={() => handleOpenChange(false)}>
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>

        <div className="shrink-0 border-b border-border/70 px-3 py-2">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="mx-auto">
              <TabsTrigger value="discussions">Discussions</TabsTrigger>
              <TabsTrigger value="comments">Comments</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {screen === "list" && (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {activeTab === "discussions" ? (
              <div className="shrink-0 border-b border-border/70 px-3 py-2">
                <Tabs value={discussionScope} onValueChange={(value) => setDiscussionScope(value as "file" | "project")} className="w-full">
                  <TabsList className="mx-auto">
                    <TabsTrigger value="file">This File</TabsTrigger>
                    <TabsTrigger value="project">All Project</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            ) : isCommentRail ? (
              <div className="shrink-0 border-b border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground">
                Latest messages. Open a card for the full history.
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
                  <p className="mt-1 text-sm text-muted-foreground">{readOnly ? "You can read threads here, but only members with comment access can start one." : activeTab === "comments" ? "Use the node context menu to start one." : "Start a thread to capture a question or design decision."}</p>
                </div>
              )}
              {!loadError && isCommentRail && commentGroups.map((group) => {
                const thread = group.representative;
                const latest = group.previewMessages[group.previewMessages.length - 1];
                const quoted = thread.anchorId ? anchorPreview?.(thread.anchorId) : undefined;
                const authorName = latest?.authorName || "Team member";
                return (
                  <button
                    type="button"
                    key={group.key}
                    className={cn("w-full border-b border-border/70 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", thread.unread && "bg-primary/5")}
                    onClick={() => void openCommentGroup(group)}
                  >
                    <span className="flex items-center gap-2">
                      <span className="relative shrink-0">
                        <CommentAvatar name={authorName} />
                        {thread.unread && <span role="img" aria-label="New activity" className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-popover" />}
                      </span>
                      <span className="min-w-0 truncate text-xs font-semibold">{authorName}</span>
                      {thread.status === "resolved" && <CheckCircle2 role="img" aria-label="Resolved" className="size-3.5 shrink-0 text-emerald-500" />}
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{shortCommentTime(thread.lastMessageAt ?? "")}</span>
                    </span>
                    <span className="mt-1 block space-y-0.5 pl-8">
                      {quoted
                        ? <span className="line-clamp-2 border-l-2 border-yellow-500/70 pl-2 text-xs leading-snug text-muted-foreground">{quoted.length > 50 ? `${quoted.slice(0, 50).trimEnd()}…` : quoted}</span>
                        : <span className="block truncate text-[11px] text-muted-foreground">{quoted === null ? "Deleted block" : thread.anchorLabel || "Comment"}</span>}
                      {latest && <span className="block truncate text-xs">{latest.body}</span>}
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
            {!readOnly && (<TooltipProvider delay={250}>
              <Tooltip>
                <TooltipTrigger render={<Button type="button" size="icon-lg" className="absolute bottom-4 right-4 z-10 min-h-11 min-w-11 rounded-full shadow-lg" aria-label={activeTab === "comments" ? "Add a comment" : "Start a discussion"} onClick={startCompose}><Plus aria-hidden="true" /></Button>} />
                <TooltipContent side="left">{activeTab === "comments" ? "Add a comment" : "Start a discussion"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>)}
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
            <DiscussionComposer id={`${panelId}-composer`} value={draft} onChange={setDraft} onSubmit={submitThread} placeholder={activeTab === "comments" ? "Write a comment..." : "Write a question or design decision..."} disabled={sending} submitLabel={sending ? "Sending…" : activeTab === "comments" ? "Add comment" : "Start discussion"} />
          </div>
        )}

        {screen === "thread" && activeThread && (
          <div className="flex min-h-0 flex-1 flex-col">
            {activeTab === "comments" && (
              <div className="flex items-start gap-2 border-b border-border px-3 py-1.5">
                <div className="min-w-0 flex-1">
                  {(() => {
                    const quoted = activeThread.anchorId && (isCommentRail || activeThread.fileId === fileContext.fileId) ? anchorPreview?.(activeThread.anchorId) : undefined;
                    if (quoted === null) return <span className="block truncate text-xs text-muted-foreground">Deleted block · {featureLabel(activeThread.featureType ?? "note")}</span>;
                    return quoted
                      ? <p className="line-clamp-2 border-l-2 border-yellow-500/70 pl-2 text-xs leading-snug text-muted-foreground">{quoted}</p>
                      : <span className="block truncate text-xs text-muted-foreground">{activeThread.anchorType === "general" ? "General" : activeThread.anchorType}{activeThread.featureType && ` · ${featureLabel(activeThread.featureType)}`}</span>;
                  })()}
                </div>
                {!readOnly && (<TooltipProvider delay={250}>
                  <Tooltip>
                    <TooltipTrigger render={
                      <Button type="button" variant="ghost" size="icon-xs" className="shrink-0" aria-label={activeThread.status === "open" ? "Resolve" : "Reopen"} onClick={() => void changeStatus()} disabled={sending}>
                        {activeThread.status === "open" ? <Check aria-hidden="true" className="size-4" /> : <RotateCcw aria-hidden="true" className="size-4" />}
                      </Button>
                    } />
                    <TooltipContent side="left">{activeThread.status === "open" ? "Resolve" : "Reopen"}</TooltipContent>
                  </Tooltip>
                  {activeThread.canDelete && <Tooltip>
                    <TooltipTrigger render={
                      <Button type="button" variant="ghost" size="icon-xs" className="shrink-0 text-destructive hover:text-destructive" aria-label="Delete thread" onClick={() => setPendingDelete({ type: "thread", threadId: activeThread.id })} disabled={sending}>
                        <Trash2 aria-hidden="true" className="size-4" />
                      </Button>
                    } />
                    <TooltipContent side="left">Delete thread</TooltipContent>
                  </Tooltip>}
                </TooltipProvider>)}
              </div>
            )}
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
                      <MessageScrollerContent className="gap-1 p-3">
                        {messageHistory.hasMore && (
                          <div className="flex flex-col items-center gap-1">
                            <Button type="button" size="sm" variant="ghost" onClick={() => void loadOlderMessages()} disabled={loadingOlder}>
                              {loadingOlder ? "Loading…" : "Load earlier messages"}
                            </Button>
                            {olderError && <p className="text-xs text-destructive" role="alert">{olderError}</p>}
                          </div>
                        )}
                        {messages.map((message) => (
                          <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor>
                            <DiscussionMessage
                              message={message}
                              canEdit={message.authorId === userId && !readOnly}
                              canDelete={!isCommentRail}
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
                      </MessageScrollerContent>
                    </MessageScrollerViewport>
                    <MessageScrollerButton />
                  </MessageScroller>
                </MessageScrollerProvider>
              </TooltipProvider>
            )}
            {activeThread.status === "open" && !threadError && !readOnly && <ReplyBox userName={userName || "You"} value={draft} onChange={setDraft} onSubmit={() => void submitReply()} disabled={sending} submitLabel={sending ? "Sending…" : "Send reply"} />}
            {activeThread.status === "resolved" && !readOnly && <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">Reopen this thread to reply.</p>}
            {readOnly && <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">You can read this thread but not reply to it.</p>}
          </div>
        )}
      </PopoverContent>
      <ConfirmModal
        isOpen={confirmDiscard}
        title="Discard unsent changes?"
        message="You have text that hasn't been sent or saved. If you close this panel now, it will be lost."
        confirmText="Discard"
        cancelText="Cancel"
        variant="warning"
        onCancel={() => {
          setConfirmDiscard(false);
          // The dialog hands focus back to the header button; return it to the text being written.
          window.setTimeout(() => document.querySelector<HTMLTextAreaElement>("[data-discussions-panel] textarea")?.focus(), 150);
        }}
        onConfirm={() => {
          setConfirmDiscard(false);
          setDraft("");
          cancelEditMessage();
          setOpen(false);
        }}
      />
      <ConfirmModal
        isOpen={pendingDelete !== null}
        title={pendingDelete?.type === "message" ? "Delete message?" : isCommentRail ? "Delete thread?" : "Delete discussion?"}
        message={pendingDelete?.type === "message"
          ? "This message will be permanently deleted."
          : `This permanently deletes the ${isCommentRail ? "thread and all of its comments" : "discussion and all its messages"}. This action cannot be undone.`}
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
