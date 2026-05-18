import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Plus,
  Trash2,
  Send,
  StopCircle,
  PanelRightClose,
  Minimize2,
  Sparkles,
  User,
  Bot,
  Copy,
  Check,
  ChevronDown,
  Loader2,
  ArrowDownToLine,
  Replace,
  SquareTerminal, CircleHelp, LayoutPanelLeft, Database, Lightbulb, StickyNote,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAIChat, EntityContext } from '@/hooks/useAIChat';
import { AIAction, getActionsForView, ViewType } from '@/components/ai/AIActions';
import { useAIAction } from '@/contexts/AIActionContext';
import { AIChatSession } from '@/types';
import { Button } from '@/components/ui/button';
import ConfirmModal from '@/components/ConfirmModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import { Tooltip } from '@base-ui/react/tooltip';

// Map action IDs to lucide icons
function getActionIcon(actionId: string) {
  switch (actionId) {
    case 'notes-summarize':
      return <StickyNote className="size-3.5" />;
    case 'notes-improve-grammar':
      return <Lightbulb className="size-3.5" />;
    case 'notes-generate-docs':
      return <LayoutPanelLeft className="size-3.5" />;
    case 'erd-generate-sql':
      return <Database className="size-3.5" />;
    case 'erd-explain-table':
      return <CircleHelp className="size-3.5" />;
    case 'erd-suggest-indexes':
      return <SquareTerminal className="size-3.5" />;
    default:
      return <Sparkles className="size-3.5" />;
  }
}

// ─── Constants ─────────────────────────────────────────

const DRAFT_KEY_PREFIX = 'ai-chat-draft';
const DRAFT_DEBOUNCE_MS = 500;

function getDraftKey(entityType?: string | null, entityUid?: string | null): string {
  return `${DRAFT_KEY_PREFIX}-${entityType || 'global'}-${entityUid || 'none'}`;
}

// ─── Types ─────────────────────────────────────────────

interface AIChatPanelProps {
  onClose: () => void;
  entityType?: string | null;
  entityUid?: string | null;
  entityTitle?: string | null;
  /** Pre-built entity context text (skips Supabase fetch) */
  entityContextText?: string | null;
  /** Pending prompt from AI action buttons — auto-fills input when set */
  pendingPrompt?: string | null;
  /** Called after prompt has been consumed */
  onPromptUsed?: () => void;
  /** Pending action result handler — called after AI response completes */
  pendingAction?: { actionId: string; onResult: (response: string) => void } | null;
  /** Clears pending action after stream completes */
  onClearPendingAction?: () => void;
}

// ─── Component ──────────────────────────────────────────

// ─── Session Item ─────────────────────────────────────

function SessionItem({
  session,
  isActive,
  onClick,
  onDelete,
}: {
  session: AIChatSession;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={`
        w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 group
        flex items-center justify-between gap-2
        ${isActive
          ? 'bg-primary/10 text-primary border border-primary/20'
          : 'hover:bg-muted/50 text-foreground/80 border border-transparent'
        }
      `}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <MessageSquare className="size-3.5 shrink-0 opacity-60" />
        <span className="text-xs font-medium truncate">{session.title}</span>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        title="Delete session"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}

// ─── Minimized Bar ────────────────────────────────────

function MinimizedBar({
  title,
  onExpand,
}: {
  title: string;
  onExpand: () => void;
}) {
  return (
    <div className="fixed right-6 bottom-4 z-50">
      <button
        onClick={onExpand}
        className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-lg shadow-black/10 hover:bg-muted/50 transition-all cursor-pointer group"
      >
        <div className="p-1 rounded-md bg-primary/10">
          <Sparkles className="size-3.5 text-primary" />
        </div>
        <span className="text-xs font-medium text-foreground/80 truncate max-w-[160px]">
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground/40 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
          Click to expand
        </span>
      </button>
    </div>
  );
}

// ─── Main Panel Component ─────────────────────────────

export const AIChatPanel = ({
  onClose,
  entityType,
  entityUid,
  entityTitle,
  entityContextText,
  pendingPrompt,
  onPromptUsed,
  pendingAction,
  onClearPendingAction,
}: AIChatPanelProps) => {
  const entityContext: EntityContext | null =
    entityType && entityUid ? { entityType, entityUid } : null;

  // ─── Stream complete callback: auto-apply AI action results ──
  const [lastStreamResponse, setLastStreamResponse] = useState<string | null>(null);
  const pendingActionRef = useRef(pendingAction);
  pendingActionRef.current = pendingAction;

  const onStreamComplete = useCallback((response: string) => {
    setLastStreamResponse(response);
    if (pendingActionRef.current) {
      pendingActionRef.current.onResult(response);
      onClearPendingAction?.();
    }
  }, [onClearPendingAction]);
  const { applyContent, hasContentHandler, selectionText, setSelectionText } = useAIAction();
  const { 
    sessions, 
    currentSession, 
    messages, 
    isSessionsLoading, 
    isMessagesLoading, 
    isStreaming, 
    error,
    listSessions,
    createSession,
    selectSession,
    deleteSession,
    sendMessage,
    clearMessages,
    abortStream,
    hasMoreMessages,
    isLoadingMore,
    loadMoreMessages
  } = useAIChat(entityContext, entityContextText, onStreamComplete);

  const [input, setInput] = useState('');
  const [showSessions, setShowSessions] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [confirmOverwritePrompt, setConfirmOverwritePrompt] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const draftKey = getDraftKey(entityType, entityUid);

  const entityToViewMap: Record<string, ViewType> = {
    note: 'notes',
    diagram: 'erd',
    flowchart: 'flowchart',
  };
  const currentViewType = entityType && entityToViewMap[entityType] ? entityToViewMap[entityType] : null;
  const actions = currentViewType ? getActionsForView(currentViewType) : [];

  const handleSelectAction = useCallback((action: AIAction) => {
    if (!entityType || !entityContextText || !entityTitle) return;

    const context = {
      content: entityContextText,
      title: entityTitle,
    };
    const newPrompt = action.buildPrompt(context);

    if (input.trim() && input.trim() !== newPrompt.trim()) {
      setConfirmOverwritePrompt(newPrompt);
    } else {
      setInput(newPrompt);
      inputRef.current?.focus();
    }
  }, [input, entityType, entityContextText, entityTitle]);

  // ─── Restore draft from sessionStorage on mount ────
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(draftKey);
      if (saved) setInput(saved);
    } catch {
      // sessionStorage might be unavailable
    }
  }, [draftKey]);

  // ─── Save draft to sessionStorage (debounced) ──────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        if (input) {
          sessionStorage.setItem(draftKey, input);
        } else {
          sessionStorage.removeItem(draftKey);
        }
      } catch {
        // sessionStorage might be unavailable
      }
    }, DRAFT_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [input, draftKey]);

  // ─── Auto-scroll to bottom on new messages ─────────
  useEffect(() => {
    if (!minimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming, minimized]);

  // ─── Auto-minimize on click outside panel ──────────
  useEffect(() => {
    if (minimized || confirmOverwritePrompt) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('[role="alertdialog"]') || 
        target.closest('[role="dialog"]') ||
        target.closest('[role="menu"]') ||
        target.closest('.fixed.inset-0') ||
        target.closest('.ProseMirror') ||
        target.closest('.tiptap-editor-content')
      ) {
        return;
      }

      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setMinimized(true);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [minimized, confirmOverwritePrompt]);

  // ─── Auto-fill prompt from AI action buttons ──────
  useEffect(() => {
    if (pendingPrompt && pendingPrompt.trim()) {
      setInput(pendingPrompt);
      inputRef.current?.focus();
      if (onPromptUsed) onPromptUsed();
    }
  }, [pendingPrompt, onPromptUsed]);

  // ─── Handle close (save draft, then close) ────────
  const handleClose = useCallback(() => {
    try {
      if (input) {
        sessionStorage.setItem(draftKey, input);
      }
    } catch {
      // ignore
    }
    onClose();
  }, [input, draftKey, onClose]);

  // ─── Handle send ───────────────────────────────────
  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input, selectionText);
    setInput('');
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
  }, [input, isStreaming, sendMessage, draftKey, selectionText]);

  // ─── Handle keydown ────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // ─── Handle new session ────────────────────────────
  const handleNewSession = useCallback(async () => {
    await createSession();
    setShowSessions(false);
  }, [createSession]);

  // ─── Format timestamp ──────────────────────────────
  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // ─── Render ────────────────────────────────────────
  const hasActiveSession = !!currentSession;
  const hasMessages = messages.length > 0;

  return (
    <Tooltip.Provider>
      <div
        ref={panelRef}
        style={{ display: minimized ? 'none' : undefined }}
        className="fixed right-4 top-20 bottom-4 w-[400px] z-50 flex flex-col rounded-xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden animate-in slide-in-from-right-2 duration-300"
      >

        
        {/* ── Header ─────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-muted/20">
          <div className="flex items-center gap-2.5">
            <Sparkles className="size-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight">AI Assistant</h3>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setShowSessions(!showSessions)}
              title={showSessions ? "Hide sessions" : "Show sessions"}
            >
              <ChevronDown className={`size-3.5 transition-transform ${showSessions ? 'rotate-180' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setMinimized(true)}
              title="Minimize panel"
            >
              <Minimize2 className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={handleClose}
              title="Close panel"
            >
              <PanelRightClose className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* ── Session List ─────────────────────────────── */}
        {showSessions && (
          <div className="shrink-0 border-b bg-muted/10">
            <div className="p-3 space-y-1 max-h-[240px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/10">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 h-8 text-xs border-dashed"
                onClick={handleNewSession}
              >
                <Plus className="size-3.5" />
                New Chat
              </Button>

              {isSessionsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="size-5 animate-spin text-muted-foreground/50" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-[11px] text-muted-foreground/50 font-medium">No conversations yet</p>
                </div>
              ) : (
                sessions.map((session) => (
                  <SessionItem
                    key={session.uid}
                    session={session}
                    isActive={currentSession?.uid === session.uid}
                    onClick={() => {
                      selectSession(session.uid);
                      setShowSessions(false);
                    }}
                    onDelete={() => deleteSession(session.uid)}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Messages Area ───────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-muted-foreground/10">
          {!hasActiveSession ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <MessageSquare className="size-10 text-muted-foreground/20 mb-4" />
              <h4 className="text-sm font-semibold">AI Assistant</h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                Select a conversation or start a new chat
              </p>
              <Button
                variant="default"
                size="sm"
                className="mt-4"
                onClick={handleNewSession}
              >
                <Plus className="size-4 mr-2" />
                New Chat
              </Button>
            </div>
          ) : isMessagesLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground/40" />
            </div>
          ) : !hasMessages ? (
            <div className="flex flex-col items-center justify-center text-center py-16">
              <Bot className="size-10 text-muted-foreground/20 mb-3" />
              <p className="text-xs text-muted-foreground font-medium">Send a message to start chatting</p>
            </div>
          ) : (
            <>
              {hasMoreMessages && (
                <div className="flex justify-center py-2">
                  <button
                    onClick={loadMoreMessages}
                    disabled={isLoadingMore}
                    className="text-[10px] font-medium text-muted-foreground/50 hover:text-muted-foreground transition-colors disabled:opacity-30 cursor-pointer"
                  >
                    {isLoadingMore ? 'Loading...' : 'Load earlier messages'}
                  </button>
                </div>
              )}
              {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const isStreamingMsg = msg.id === 'streaming';

              return (
                <div
                  key={msg.id || idx}
                  className={`flex gap-3 group/msg ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* Avatar */}
                  <div
                    className={`shrink-0 size-7 rounded-full flex items-center justify-center transition-opacity ${
                      isUser
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                  </div>

                  <div className={`flex flex-col gap-1.5 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                    {/* Message Bubble */}
                    <div
                      className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                        isUser
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 border border-border/40'
                      }`}
                    >
                      {isUser ? (
                        <>
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          {msg.selection_text && (
                            <div className="mt-1.5 pt-1.5 border-t border-primary-foreground/20 text-[10px] text-primary-foreground/60 leading-tight line-clamp-1">
                              <span className="opacity-50 mr-1">&#8617;</span>
                              {msg.selection_text.length > 50
                                ? msg.selection_text.slice(0, 47) + '...'
                                : msg.selection_text}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none text-xs prose-pre:bg-black/30">
                          {isStreamingMsg && !msg.content ? (
                            <span className="inline-flex gap-1 py-1">
                              <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                            </span>
                          ) : (
                            <>
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                              {isStreamingMsg && (
                                <span className="inline-block size-1.5 rounded-full bg-foreground/40 animate-pulse ml-0.5" />
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Timestamp */}
                    {!isStreamingMsg && msg.created_at && (
                      <span className="text-[10px] text-muted-foreground/40 px-1 block">
                        {formatTime(msg.created_at)}
                      </span>
                    )}

                    {/* Action Buttons */}
                    {!isUser && !isStreamingMsg && !isStreaming && msg.content && (
                      <div className="flex items-center gap-1.5 h-8 mt-1 overflow-hidden transition-all duration-300 ease-in-out opacity-0 group-hover/msg:opacity-100 group-hover/msg:translate-y-0 -translate-y-2 pointer-events-none group-hover/msg:pointer-events-auto focus-within:opacity-100 focus-within:translate-y-0 focus-within:pointer-events-auto">
                        {hasContentHandler && (
                          <>
                              <button
                              onClick={() => applyContent(msg.content, 'replace')}
                              className="flex items-center justify-center size-8 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 rounded-md shadow-sm transition-all"
                              title="Replace All"
                            >
                              <Replace className="size-4" />
                            </button>

                            <button
                              onClick={() => applyContent(msg.content, 'append')}
                              className="flex items-center justify-center size-8 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-md shadow-sm transition-all"
                              title="Append"
                            >
                              <ArrowDownToLine className="size-4" />
                            </button>
                            <div className="w-px h-6 bg-border mx-1" />
                          </>
                        )}
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(msg.content);
                            setCopiedMsgId(msg.id?.toString() || idx.toString());
                            setTimeout(() => setCopiedMsgId(null), 2000);
                          }}
                          className="flex items-center justify-center size-8 bg-muted/40 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-md shadow-sm transition-all"
                          title="Copy message"
                        >
                          {copiedMsgId === (msg.id?.toString() || idx.toString()) ? (
                            <Check className="size-4 text-green-500" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>)}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Active Selection ───────────────────────── */}
        {hasActiveSession && selectionText && (
          <div className="shrink-0 border-t bg-background px-4 py-3 text-[11px] text-primary/80">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 opacity-70">
                <Sparkles className="size-3" />
                <span className="font-semibold uppercase tracking-wider">Active Selection</span>
              </div>
              <button
                onClick={() => setSelectionText(null)}
                className="size-4 flex items-center justify-center rounded hover:bg-primary/10 text-muted-foreground hover:text-foreground transition-colors"
                title="Clear selection"
              >
                <span className="text-[10px] leading-none font-bold">&times;</span>
              </button>
            </div>
            <p className="italic line-clamp-2 text-primary/60">"{selectionText}"</p>
          </div>
        )}

        {/* ── Input Area ──────────────────────────────── */}
        {hasActiveSession && (
          <div className="shrink-0 border-t bg-background p-4 space-y-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isStreaming ? 'AI is responding...' : 'Ask anything...'}
                className="flex-1 min-h-[80px] max-h-[200px] rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 resize-none"
                rows={3}
                disabled={isStreaming}
              />
              <Button
                variant={isStreaming ? "outline" : "default"}
                size="icon"
                className="shrink-0 size-9 rounded-md"
                onClick={isStreaming ? abortStream : handleSend}
                disabled={!input.trim() && !isStreaming}
              >
                {isStreaming ? <StopCircle className="size-4 text-destructive" /> : <Send className="size-4" />}
              </Button>
            </div>

            <div className="flex items-center justify-between">
              {entityType === 'note' && !isStreaming && actions.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-border bg-muted/50 hover:bg-muted/80 transition-colors text-white outline-none">
                    <Sparkles className="size-3.5 text-primary" />
                    AI Actions
                    <ChevronDown className="size-3 ml-0.5 opacity-50" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" className="w-[200px]">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider opacity-50">Notes Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {actions.map((action) => (
                        <DropdownMenuItem
                          key={action.id}
                          onClick={() => handleSelectAction(action)}
                          className="text-xs cursor-pointer"
                        >
                          {getActionIcon(action.id)}
                          <span className="ml-2">{action.label}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="text-[10px] text-muted-foreground/50 px-1 font-medium">
                  {isStreaming ? 'Generating...' : 'Press Enter to send'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {minimized && (
        <MinimizedBar
          title={currentSession?.title || 'AI Assistant'}
          onExpand={() => setMinimized(false)}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmOverwritePrompt}
        onCancel={() => setConfirmOverwritePrompt(null)}
        onConfirm={() => {
          if (confirmOverwritePrompt) {
            setInput(confirmOverwritePrompt);
            inputRef.current?.focus();
          }
          setConfirmOverwritePrompt(null);
        }}
        title="Replace Draft?"
        message="Your current message draft will be replaced with the AI-generated prompt. Do you want to continue?"
        confirmText="Replace Draft"
        cancelText="Keep Draft"
        variant="info"
      />

    </Tooltip.Provider>
 );
};
