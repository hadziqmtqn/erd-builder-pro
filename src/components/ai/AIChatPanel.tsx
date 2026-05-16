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
  ChevronDown,
  Bot,
  User,
  Loader2,
  Settings2,
} from 'lucide-react';
import { useAIChat, EntityContext } from '@/hooks/useAIChat';
import { AIChatSession } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';

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
}

// ─── Simple Markdown Parser (lightweight, no deps) ────

function renderSimpleMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  // Split by code blocks first
  const blocks = text.split(/(```[\s\S]*?```)/g);
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const block of blocks) {
    if (block.startsWith('```') && block.endsWith('```')) {
      // Code block
      const inner = block.slice(3, -3).trim();
      const langMatch = inner.match(/^(\w+)\n/);
      const lang = langMatch ? langMatch[1] : '';
      const code = langMatch ? inner.slice(lang.length + 1) : inner;

      elements.push(
        <pre key={key++} className="relative my-2 rounded-lg bg-muted/50 border border-border/40 overflow-x-auto">
          {lang && (
            <div className="absolute top-0 right-0 px-2 py-0.5 text-[10px] text-muted-foreground/50 bg-muted/30 rounded-bl-lg font-mono">
              {lang}
            </div>
          )}
          <code className="block p-3 text-[12px] leading-relaxed font-mono">{code}</code>
        </pre>
      );
    } else {
      // Inline content — parse bold, italic, inline code
      const lines = block.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) {
          elements.push(<br key={key++} />);
          continue;
        }

        // Parse inline formatting
        const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*|_[^_]+_)/g);
        const inlineElements: React.ReactNode[] = [];

        for (const part of parts) {
          if (part.startsWith('`') && part.endsWith('`')) {
            inlineElements.push(
              <code key={key++} className="px-1 py-0.5 rounded bg-muted/50 text-[11px] font-mono">
                {part.slice(1, -1)}
              </code>
            );
          } else if (part.startsWith('**') && part.endsWith('**')) {
            inlineElements.push(<strong key={key++}>{part.slice(2, -2)}</strong>);
          } else if (part.startsWith('_') && part.endsWith('_')) {
            inlineElements.push(<em key={key++}>{part.slice(1, -1)}</em>);
          } else {
            inlineElements.push(<span key={key++}>{part}</span>);
          }
        }

        elements.push(
          <p key={key++} className="text-[13px] leading-relaxed">
            {inlineElements}
          </p>
        );
      }
    }
  }

  return elements;
}

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
    <button
      onClick={onClick}
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
    </button>
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
}: AIChatPanelProps) => {
  const entityContext: EntityContext | null =
    entityType && entityUid ? { entityType, entityUid } : null;

  const {
    sessions,
    currentSession,
    messages,
    isSessionsLoading,
    isMessagesLoading,
    isStreaming,
    error,
    createSession,
    selectSession,
    deleteSession,
    sendMessage,
    abortStream,
  } = useAIChat(entityContext);

  const [input, setInput] = useState('');
  const [showSessions, setShowSessions] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const draftKey = getDraftKey(entityType, entityUid);

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // ─── Auto-minimize on click outside panel ──────────
  useEffect(() => {
    if (minimized) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setMinimized(true);
      }
    };

    // Use mousedown for faster response (fires before click/input events)
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [minimized]);

  // ─── Handle close (save draft, then close) ────────
  const handleClose = useCallback(() => {
    // Save draft immediately before closing
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
    sendMessage(input);
    setInput('');
    // Clear draft after send
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
  }, [input, isStreaming, sendMessage, draftKey]);

  // ─── Handle keydown ────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // ─── Handle new session ────────────────────────────
  const handleNewSession = useCallback(async () => {
    // Extract project ID from active context if available
    await createSession();
    setShowSessions(false);
  }, [createSession]);

  // ─── Format timestamp ──────────────────────────────
  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // ─── Render minimized bar ──────────────────────────
  if (minimized) {
    return (
      <MinimizedBar
        title={currentSession?.title || 'AI Assistant'}
        onExpand={() => setMinimized(false)}
      />
    );
  }

  // ─── Render ────────────────────────────────────────
  const hasActiveSession = !!currentSession;
  const hasMessages = messages.length > 0;

  return (
    <TooltipProvider>
      <div ref={panelRef} className="fixed right-4 top-20 bottom-4 w-[400px] z-50 flex flex-col rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl shadow-black/10 overflow-hidden animate-in slide-in-from-right-2 duration-300">
        
        {/* ── Header ─────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Sparkles className="size-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold">AI Assistant</h3>
              <p className="text-[10px] text-muted-foreground/60">
                {isStreaming ? 'Generating...' : hasActiveSession ? 'Ready' : 'No session'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 hover:bg-muted/50"
                    onClick={() => setShowSessions(!showSessions)}
                  >
                    <ChevronDown className={`size-3.5 transition-transform ${showSessions ? 'rotate-180' : ''}`} />
                  </Button>
                }
              />
              <TooltipContent side="bottom">Toggle sessions</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 hover:bg-muted/50"
                    onClick={() => setMinimized(true)}
                  >
                    <Minimize2 className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="bottom">Minimize panel</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 hover:bg-muted/50"
                    onClick={handleClose}
                  >
                    <PanelRightClose className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="bottom">Close panel</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* ── Session List ─────────────────────────────── */}
        {showSessions && (
          <div className="shrink-0 border-b border-border/20 bg-muted/3">
            <div className="p-3 space-y-1 max-h-[240px] overflow-y-auto">
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
                  <p className="text-[11px] text-muted-foreground/50">No conversations yet</p>
                  <p className="text-[10px] text-muted-foreground/30 mt-1">Start a new chat to begin</p>
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
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-3">
          {!hasActiveSession ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <div className="p-4 rounded-full bg-primary/5 mb-4">
                <MessageSquare className="size-8 text-primary/30" />
              </div>
              <h4 className="text-sm font-semibold text-muted-foreground/70">AI Assistant</h4>
              <p className="text-[11px] text-muted-foreground/50 mt-1 max-w-[200px]">
                Select a conversation or start a new chat
              </p>
              <Button
                variant="default"
                size="sm"
                className="mt-4 gap-2"
                onClick={handleNewSession}
              >
                <Plus className="size-3.5" />
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
              <h4 className="text-sm font-semibold text-muted-foreground/60">Empty conversation</h4>
              <p className="text-[11px] text-muted-foreground/40 mt-1">
                Send a message to start chatting
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const isStreamingMsg = msg.id === 'streaming';
              const isLast = idx === messages.length - 1;

              return (
                <div
                  key={msg.id || idx}
                  className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'} ${isStreamingMsg ? 'opacity-80' : ''}`}
                >
                  {/* Avatar */}
                  <div
                    className={`shrink-0 size-7 rounded-full flex items-center justify-center ${
                      isUser
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                  </div>

                  {/* Bubble */}
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                      isUser
                        ? 'bg-primary text-primary-foreground rounded-tr-md'
                        : 'bg-muted/40 border border-border/30 rounded-tl-md'
                    }`}
                  >
                    {isUser ? (
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                    ) : (
                      <div className="text-[13px] leading-relaxed break-words">
                        {isStreamingMsg && !msg.content ? (
                          <span className="inline-flex gap-1">
                            <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                        ) : (
                          <>
                            {renderSimpleMarkdown(msg.content)}
                            {isStreamingMsg && (
                              <span className="inline-block size-1.5 rounded-full bg-foreground/40 animate-pulse ml-0.5" />
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Timestamp */}
                    {!isStreamingMsg && msg.created_at && (
                      <p className={`text-[10px] mt-1.5 ${isUser ? 'text-primary-foreground/50' : 'text-muted-foreground/40'}`}>
                        {formatTime(msg.created_at)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Error message */}
          {error && !isStreaming && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-destructive/5 border border-destructive/20 text-xs text-destructive">
              <span className="shrink-0 size-1.5 rounded-full bg-destructive/60" />
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Input Area ──────────────────────────────── */}
        {hasActiveSession && (
          <div className="shrink-0 border-t border-border/40 bg-muted/3 p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isStreaming ? 'AI is responding...' : 'Ask anything about your workspace...'}
                rows={3}
                disabled={isStreaming}
                className="flex-1 min-h-[72px] max-h-[200px] resize-none rounded-xl bg-muted/20 border border-border/40 px-3 py-2.5 text-xs outline-none focus:ring-1 focus:ring-primary/20 focus:bg-background transition-all placeholder:text-muted-foreground/30 disabled:opacity-50"
              />
              {isStreaming ? (
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 shrink-0 rounded-xl border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50"
                  onClick={abortStream}
                  title="Stop generating"
                >
                  <StopCircle className="size-4 text-destructive" />
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="icon"
                  className="size-9 shrink-0 rounded-xl"
                  onClick={handleSend}
                  disabled={!input.trim()}
                  title="Send message"
                >
                  <Send className="size-4" />
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground/30 mt-1.5 text-center">
              Enter to send · Shift+Enter for newline
            </p>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};
