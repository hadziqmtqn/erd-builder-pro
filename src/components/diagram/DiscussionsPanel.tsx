import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, MessageSquareText, Plus, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageAvatar, MessageContent, MessageGroup } from "@/components/ui/message";
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/message-scroller";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Entity } from "@/types";
import type { Edge, Node } from "@xyflow/react";

type AnchorType = "general" | "table" | "relationship";
type Thread = {
  id: string;
  anchorType: AnchorType;
  anchorId: string | null;
  anchorLabel: string;
  status: "open" | "resolved";
  unread: boolean;
  latestMessageId: string | null;
  latestMessage: string | null;
  latestAuthorId: string | null;
  lastMessageAt: string | null;
};
type DiscussionMessageData = { id: string; authorId: string; authorName: string; body: string; createdAt: string };
type AnchorOption = { value: string; label: string };

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
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={4000}
          placeholder={placeholder}
          className="min-h-24 resize-none rounded-2xl bg-muted/40 px-4 pb-12 pr-14 shadow-none"
          required
        />
        <Button
          type="submit"
          size="icon"
          className="absolute right-2 bottom-2 size-8 rounded-full"
          aria-label={submitLabel}
          disabled={!value.trim() || disabled}
        >
          <Send aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
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

function DiscussionMessage({ message, isOwn, showAvatar }: { message: DiscussionMessageData; isOwn: boolean; showAvatar: boolean }) {
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
    <Bubble
      className={cn(
        isOwn
          ? "bg-brand text-white"
          : "bg-muted text-foreground",
        isOwn ? "rounded-br-md" : "rounded-bl-md",
      )}
    >
      <BubbleContent>{message.body}</BubbleContent>
    </Bubble>
  );

  return (
    <Message align={isOwn ? "end" : "start"}>
      {isOwn ? (
        <>
          <MessageContent>
            <Tooltip>
              <TooltipTrigger render={bubble} />
              <TooltipContent side="left">
                <span className="flex flex-col gap-0.5">
                  <span>{message.authorName} · {messageTime(message.createdAt)}</span>
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
              <TooltipContent side="right">
                {message.authorName} · {messageTime(message.createdAt)}
              </TooltipContent>
            </Tooltip>
          </MessageContent>
        </>
      )}
    </Message>
  );
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await apiFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The request could not be completed.");
  return body;
}

type RawRecord = Record<string, unknown>;

function normalizeThread(raw: RawRecord): Thread {
  const rawAnchorType = raw.anchorType ?? raw.anchor_type;
  const anchorType: AnchorType = rawAnchorType === "table" || rawAnchorType === "relationship"
    ? rawAnchorType
    : "general";
  const rawStatus = raw.status;

  return {
    id: String(raw.id ?? ""),
    anchorType,
    anchorId: raw.anchorId == null && raw.anchor_id == null
      ? null
      : String(raw.anchorId ?? raw.anchor_id),
    anchorLabel: String(raw.anchorLabel ?? raw.anchor_label ?? "General"),
    status: rawStatus === "resolved" ? "resolved" : "open",
    unread: Boolean(raw.unread),
    latestMessageId: raw.latestMessageId == null && raw.latest_message_id == null
      ? null
      : String(raw.latestMessageId ?? raw.latest_message_id),
    latestMessage: raw.latestMessage == null && raw.latest_message == null
      ? null
      : String(raw.latestMessage ?? raw.latest_message),
    latestAuthorId: raw.latestAuthorId == null && raw.latest_author_id == null
      ? null
      : String(raw.latestAuthorId ?? raw.latest_author_id),
    lastMessageAt: raw.lastMessageAt == null && raw.last_message_at == null
      ? null
      : String(raw.lastMessageAt ?? raw.last_message_at),
  };
}

function normalizeMessage(raw: RawRecord): DiscussionMessageData {
  return {
    id: String(raw.id ?? ""),
    authorId: String(raw.authorId ?? raw.author_id ?? ""),
    authorName: String(raw.authorName ?? raw.author_name ?? "Team member"),
    body: String(raw.body ?? ""),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
  };
}

function messageTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function DiscussionsPanel({
  diagramId,
  teamId,
  userId,
  nodes,
  edges,
  onAnchorSelected,
}: {
  diagramId: string;
  teamId: string;
  userId?: string;
  nodes: Node<Entity>[];
  edges: Edge[];
  onAnchorSelected: (type: AnchorType, id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<"list" | "compose" | "thread">("list");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState<DiscussionMessageData[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [threadError, setThreadError] = useState("");
  const [draft, setDraft] = useState("");
  const [anchorChoice, setAnchorChoice] = useState("general");
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const seenMessages = useRef(new Map<string, string>());
  const hasInitialSnapshot = useRef(false);
  const endpoint = `/api/diagrams/${encodeURIComponent(diagramId)}/discussions`;

  const anchors = useMemo<AnchorOption[]>(() => {
    const entityNames = new Map(nodes.map((node) => [node.id, node.data.name]));
    return [
      { value: "general", label: "General" },
      ...nodes.map((node) => ({ value: `table:${node.id}`, label: `Table: ${node.data.name}` })),
      ...edges.map((edge) => ({
        value: `relationship:${edge.id}`,
        label: `Relationship: ${entityNames.get(String(edge.source)) || "Table"} → ${entityNames.get(String(edge.target)) || "Table"}`,
      })),
    ];
  }, [edges, nodes]);

  const loadThreads = useCallback(async (notify = false) => {
    const requestId = ++listRequest.current;
    setLoadError("");
    if (!hasInitialSnapshot.current) setLoadingThreads(true);
    try {
      const data = await requestJson(endpoint);
      if (requestId !== listRequest.current) return;
      const nextThreads = Array.isArray(data.threads)
        ? data.threads.map((thread: RawRecord) => normalizeThread(thread))
        : [];
      if (notify && hasInitialSnapshot.current) {
        for (const thread of nextThreads) {
          const previousMessageId = seenMessages.current.get(thread.id);
          if (thread.latestMessageId && thread.latestAuthorId !== userId
            && ((previousMessageId && thread.latestMessageId !== previousMessageId)
              || (!previousMessageId && thread.unread))) {
            toast.info(`New activity in ${thread.anchorLabel || "General"}`);
          }
        }
      }
      seenMessages.current = new Map(nextThreads.filter((thread) => thread.latestMessageId).map((thread) => [thread.id, thread.latestMessageId!]));
      hasInitialSnapshot.current = true;
      setThreads(nextThreads);
      setUnreadCount(Number(data.unreadCount ?? data.unread_count) || 0);
    } catch {
      if (requestId === listRequest.current) setLoadError("Couldn't load discussions. Try again.");
    } finally {
      if (requestId === listRequest.current) setLoadingThreads(false);
    }
  }, [endpoint, userId]);

  const loadThread = useCallback(async (threadId: string, markRead: boolean, quiet = false) => {
    const requestId = ++detailRequest.current;
    if (!quiet) {
      setThreadError("");
    }
    try {
      const data = await requestJson(`${endpoint}/${encodeURIComponent(threadId)}`);
      if (requestId !== detailRequest.current) return false;
      setMessages(Array.isArray(data.messages)
        ? data.messages.map((message: RawRecord) => normalizeMessage(message))
        : []);
      if (markRead) {
        void requestJson(`${endpoint}/${encodeURIComponent(threadId)}/read`, { method: "POST" })
          .then(() => loadThreads())
          .catch(() => {});
      }
      return true;
    } catch {
      if (!quiet && requestId === detailRequest.current) setThreadError("Couldn't load this discussion. Try again.");
      return false;
    }
  }, [endpoint, loadThreads]);

  useEffect(() => { void loadThreads(); }, [loadThreads]);

  useEffect(() => {
    const onWorkspaceSync = (event: Event) => {
      const detail = (event as CustomEvent<{ teamId?: string; eventType?: string }>).detail;
      if (detail?.teamId !== teamId || detail?.eventType !== "cloud.workspace.sync") return;
      void loadThreads(true);
      if (open && screen === "thread" && selectedThreadId) {
        void loadThread(selectedThreadId, document.visibilityState === "visible", true);
      }
    };
    const onReconnect = (event: Event) => {
      if ((event as CustomEvent<{ teamId?: string }>).detail?.teamId !== teamId) return;
      void loadThreads();
      if (open && screen === "thread" && selectedThreadId) {
        void loadThread(selectedThreadId, document.visibilityState === "visible", true);
      }
    };
    window.addEventListener("cloud-workspace-sync", onWorkspaceSync);
    window.addEventListener("cloud-live-sync-reconnected", onReconnect);
    return () => {
      window.removeEventListener("cloud-workspace-sync", onWorkspaceSync);
      window.removeEventListener("cloud-live-sync-reconnected", onReconnect);
    };
  }, [loadThread, loadThreads, open, screen, selectedThreadId, teamId]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      void loadThreads();
      if (screen === "thread" && selectedThreadId) void loadThread(selectedThreadId, true);
    }
  };

  const openThread = async (thread: Thread) => {
    setScreen("thread");
    setSelectedThreadId(thread.id);
    setMessages([]);
    const loaded = await loadThread(thread.id, true);
    if (loaded) onAnchorSelected(thread.anchorType, thread.anchorId);
  };

  const submitThread = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    const separator = anchorChoice.indexOf(":");
    const anchorType = (separator < 0 ? anchorChoice : anchorChoice.slice(0, separator)) as AnchorType;
    const anchorId = separator < 0 ? undefined : anchorChoice.slice(separator + 1);
    setSending(true);
    setThreadError("");
    try {
      const created = await requestJson(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, anchorType, ...(anchorId ? { anchorId } : {}) }),
      });
      setDraft("");
      setAnchorChoice("general");
      setSelectedThreadId(created.id);
      setScreen("thread");
      await loadThreads();
      await loadThread(created.id, true);
    } catch {
      setThreadError("Couldn't start the discussion. Try again.");
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
      await requestJson(`${endpoint}/${encodeURIComponent(selectedThreadId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      setDraft("");
      await loadThread(selectedThreadId, true);
      await loadThreads();
    } catch {
      setThreadError("Couldn't send the reply. Reopen the discussion if it was resolved.");
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async () => {
    const thread = threads.find((item) => item.id === selectedThreadId);
    if (!thread || sending) return;
    setSending(true);
    try {
      await requestJson(`${endpoint}/${encodeURIComponent(thread.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: thread.status === "open" ? "resolved" : "open" }),
      });
      await loadThreads();
    } catch {
      setThreadError("Couldn't update this discussion. Try again.");
    } finally {
      setSending(false);
    }
  };

  const activeThread = threads.find((thread) => thread.id === selectedThreadId);
  const messageGroups = useMemo(() => groupMessages(messages), [messages]);
  const title = screen === "compose" ? "New discussion" : screen === "thread" ? activeThread?.anchorLabel || "Discussion" : "Discussions";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Open discussions${unreadCount ? `, ${unreadCount} unread` : ""}`}
            title="Discussions"
          >
            <MessageSquareText aria-hidden="true" />
            {unreadCount > 0 && (
              <Badge variant="default" className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px] leading-none">
                {unreadCount}
              </Badge>
            )}
          </Button>
        }
      />
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="flex h-[min(42rem,calc(100svh-5rem))] w-[min(28rem,calc(100vw-1rem))] flex-col gap-0 overflow-hidden p-0"
        aria-describedby="erd-discussions-description"
      >
        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {screen !== "list" && (
                <Button variant="ghost" size="sm" className="mb-2 -ml-2 px-2" onClick={() => setScreen("list")}>
                  <ArrowLeft aria-hidden="true" />
                  All discussions
                </Button>
              )}
              <h2 className="truncate text-sm font-semibold">{title}</h2>
              <p id="erd-discussions-description" className="mt-1 text-xs text-muted-foreground">
                Threads for this ERD file, shared with its active Team.
              </p>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="Close discussions" onClick={() => setOpen(false)}>
              <span aria-hidden="true">×</span>
            </Button>
          </div>
        </div>

        {screen === "list" && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <Button className="justify-start" onClick={() => { setScreen("compose"); setThreadError(""); }}>
              <Plus aria-hidden="true" />
              Start a discussion
            </Button>
            {loadingThreads && <p role="status" className="py-5 text-center text-sm text-muted-foreground">Loading discussions…</p>}
            {!loadingThreads && loadError && (
              <div className="rounded-lg border border-destructive/40 p-4 text-sm">
                <p>{loadError}</p>
                <Button variant="outline" className="mt-3" onClick={() => void loadThreads()}>Retry</Button>
              </div>
            )}
            {!loadingThreads && !loadError && threads.length === 0 && (
              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                <p className="text-sm font-medium">No discussions on this ERD yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">Start a thread to capture a question or design decision.</p>
              </div>
            )}
            {!loadError && threads.map((thread) => (
              <button
                type="button"
                key={thread.id}
                className="flex min-h-16 w-full flex-col items-start gap-1 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => void openThread(thread)}
              >
                <span className="flex w-full items-center gap-2">
                  <span className="truncate text-sm font-medium">{thread.anchorLabel || "General"}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{thread.status === "resolved" ? "Resolved" : "Open"}</span>
                  {thread.unread && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Unread</span>}
                </span>
                <span className="line-clamp-2 text-sm text-muted-foreground">{thread.latestMessage || "No messages"}</span>
                <span className="text-xs text-muted-foreground">{messageTime(thread.lastMessageAt)}</span>
              </button>
            ))}
          </div>
        )}

        {screen === "compose" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="flex flex-1 flex-col gap-4 p-4">
            <div className="grid gap-2 text-sm font-medium">
              <label htmlFor="discussion-anchor">Discussing</label>
              <Select value={anchorChoice} onValueChange={(value) => value && setAnchorChoice(value)}>
                <SelectTrigger id="discussion-anchor">
                  <SelectValue>{anchors.find((anchor) => anchor.value === anchorChoice)?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {anchors.map((anchor) => <SelectItem key={anchor.value} value={anchor.value}>{anchor.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {threadError && <p role="alert" className="text-sm text-destructive">{threadError}</p>}
            </div>
            <DiscussionComposer
              id="discussion-message"
              value={draft}
              onChange={setDraft}
              onSubmit={submitThread}
              placeholder="Write a question or design decision..."
              disabled={sending}
              submitLabel={sending ? "Starting discussion…" : "Start discussion"}
            />
          </div>
        )}

        {screen === "thread" && activeThread && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <span className="text-sm text-muted-foreground">{activeThread.anchorType === "general" ? "General" : activeThread.anchorType === "table" ? "Table" : "Relationship"}</span>
              <Button variant="outline" className="shrink-0" onClick={() => void changeStatus()} disabled={sending}>
                {activeThread.status === "open" ? <Check aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                {activeThread.status === "open" ? "Resolve" : "Reopen"}
              </Button>
            </div>
            {threadError && (
              <div className="m-4 rounded-lg border border-destructive/40 p-4 text-sm" role="alert">
                <p>{threadError}</p>
                <Button variant="outline" className="mt-3" onClick={() => void loadThread(activeThread.id, true)}>Retry</Button>
              </div>
            )}
            {!threadError && (
              <TooltipProvider delay={250}>
                <MessageScrollerProvider key={activeThread.id} defaultScrollPosition="end">
                  <MessageScroller className="flex-1">
                    <MessageScrollerViewport aria-label="Discussion messages">
                      <MessageScrollerContent className="gap-4 p-4">
                        {messageGroups.map((group) => (
                          <MessageGroup key={group[0].id}>
                            {group.map((message, index) => (
                              <MessageScrollerItem
                                key={message.id}
                                messageId={message.id}
                                scrollAnchor={index === 0}
                              >
                                <DiscussionMessage
                                  message={message}
                                  isOwn={message.authorId === userId}
                                  showAvatar={index === group.length - 1}
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
            {activeThread.status === "open" && !threadError && (
              <DiscussionComposer
                id="discussion-reply"
                value={draft}
                onChange={setDraft}
                onSubmit={submitReply}
                placeholder="Write a reply..."
                disabled={sending}
                submitLabel={sending ? "Sending…" : "Send reply"}
              />
            )}
            {activeThread.status === "resolved" && <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">Reopen this discussion to reply.</p>}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
