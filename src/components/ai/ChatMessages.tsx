import { memo, useRef, useState, useEffect, useCallback } from 'react';
import { MessageSquare, Plus, Bot, User, Loader2, Replace, ArrowDownToLine, Copy, Check, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AIChatMessage } from '@/types';
import { Button } from '@/components/ui/button';
import { CodeBlock } from './CodeBlock';

function formatTime(dateStr?: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export interface ChatMessagesProps {
  hasActiveSession: boolean;
  isMessagesLoading: boolean;
  hasMessages: boolean;
  messages: AIChatMessage[];
  isStreaming: boolean;
  hasMoreMessages: boolean;
  isLoadingMore: boolean;
  minimized: boolean;
  loadMoreMessages: () => void;
  handleNewSession: () => void;
  sendMessage: (content: string, selectionText?: string | null) => void;
  hasContentHandler: boolean;
  contentHandlerStrategies: string[];
  lastActionId: string | null;
  applyContent: (content: string, strategy: 'replace' | 'append', actionId?: string) => void;
}

export const ChatMessages = memo(function ChatMessages({
  hasActiveSession,
  isMessagesLoading,
  hasMessages,
  messages,
  isStreaming,
  hasMoreMessages,
  isLoadingMore,
  minimized,
  loadMoreMessages,
  handleNewSession,
  sendMessage,
  hasContentHandler,
  contentHandlerStrategies,
  lastActionId,
  applyContent,
}: ChatMessagesProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Set<string | number>>(new Set());
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // ─── Auto-scroll to bottom on new messages ─────────
  useEffect(() => {
    if (!minimized && !userScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming, minimized]);

  // ─── Track manual scroll ────────────────────────────
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const threshold = 60;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      userScrolledUpRef.current = !isNearBottom;
      setShowScrollButton(!isNearBottom);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    userScrolledUpRef.current = false;
    setShowScrollButton(false);
  }, []);

  return (
    <div className="flex-1 relative min-h-0">
      <div ref={scrollContainerRef} className="absolute inset-0 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-muted-foreground/10">
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
                <div
                  className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed overflow-x-auto ${
                    isUser
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 border border-border/40'
                  }`}
                >
                  {isUser ? (
                    <>
                      {(() => {
                        const SYSTEM_MARKER = '\n\n---SYSTEM_PROMPT---\n';
                        const markerIdx = msg.content.indexOf(SYSTEM_MARKER);
                        const hasSystemPart = markerIdx !== -1;
                        const displayText = hasSystemPart ? msg.content.slice(0, markerIdx) : msg.content;
                        const systemText = hasSystemPart ? msg.content.slice(markerIdx + SYSTEM_MARKER.length) : '';

                        const isLong = displayText.length > 300;
                        const isExpanded = expandedMessages.has(msg.id ?? idx);
                        const sysExpanded = expandedMessages.has(`sys_${msg.id ?? idx}`);
                        return (
                          <>
                            <p className={`whitespace-pre-wrap break-words ${isLong && !isExpanded ? 'line-clamp-6' : ''}`}>{displayText}</p>
                            {hasSystemPart && (
                              <button
                                onClick={() => setExpandedMessages(prev => {
                                  const next = new Set(prev);
                                  if (sysExpanded) next.delete(`sys_${msg.id ?? idx}`);
                                  else next.add(`sys_${msg.id ?? idx}`);
                                  return next;
                                })}
                                className="text-[10px] text-primary-foreground/50 hover:text-primary-foreground/80 mt-1.5 opacity-60 hover:opacity-100 transition-all flex items-center gap-1"
                              >
                                <span className="text-[8px] leading-none">{sysExpanded ? '▼' : '▶'}</span>
                                {sysExpanded ? 'Hide context' : 'Show context'}
                              </button>
                            )}
                            {hasSystemPart && sysExpanded && (
                              <pre className="mt-1.5 pt-1.5 border-t border-primary-foreground/15 text-[9px] text-primary-foreground/40 whitespace-pre-wrap break-words leading-relaxed max-h-[200px] overflow-y-auto scrollbar-thin">
                                {systemText}
                              </pre>
                            )}
                            {isLong && (
                              <button
                                onClick={() => setExpandedMessages(prev => {
                                  const next = new Set(prev);
                                  if (isExpanded) next.delete(msg.id ?? idx);
                                  else next.add(msg.id ?? idx);
                                  return next;
                                })}
                                className="text-[10px] text-primary-foreground/60 hover:text-primary-foreground/80 mt-1 opacity-60 hover:opacity-100 transition-all"
                              >
                                {isExpanded ? 'Show less' : 'Show more'}
                              </button>
                            )}
                          </>
                        );
                      })()}
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
                    <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                      {isStreamingMsg && !msg.content ? (
                        <span className="inline-flex gap-1 py-1">
                          <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      ) : (
                        <>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ className, children, ...props }) {
                                if (className) {
                                  return <CodeBlock className={className} children={children} />;
                                }
                                return <code className="bg-black/30 px-1 py-0.5 rounded text-[11px]" {...props}>{children}</code>;
                              }
                            }}
                          >{msg.content}</ReactMarkdown>
                          {isStreamingMsg && (
                            <span className="inline-block size-1.5 rounded-full bg-foreground/40 animate-pulse ml-0.5" />
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {!isStreamingMsg && msg.created_at && (
                  <span className="text-[10px] text-muted-foreground/40 px-1 block">
                    {formatTime(msg.created_at)}
                  </span>
                )}

                {isUser && !isStreamingMsg && msg.id !== 'streaming' && (
                  <div className="flex items-center gap-1.5 h-8 mt-1 overflow-hidden transition-all duration-300 ease-in-out opacity-0 group-hover/msg:opacity-100 group-hover/msg:translate-y-0 -translate-y-2 pointer-events-none group-hover/msg:pointer-events-auto">
                    {idx === messages.length - 1 && (
                      <button
                        onClick={() => sendMessage(msg.content, msg.selection_text)}
                        className="flex items-center justify-center size-8 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 rounded-md shadow-sm transition-all"
                        title="Resend"
                      >
                        <span className="text-sm leading-none">&#8635;</span>
                      </button>
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

                {!isUser && !isStreamingMsg && !isStreaming && msg.content && (
                  <div className="flex items-center gap-1.5 h-8 mt-1 overflow-hidden transition-all duration-300 ease-in-out opacity-0 group-hover/msg:opacity-100 group-hover/msg:translate-y-0 -translate-y-2 pointer-events-none group-hover/msg:pointer-events-auto focus-within:opacity-100 focus-within:translate-y-0 focus-within:pointer-events-auto">
                    {hasContentHandler && (
                      <>
                        {contentHandlerStrategies.includes('replace') && (
                          <button
                            onClick={() => applyContent(msg.content, 'replace', lastActionId || undefined)}
                            className="flex items-center justify-center size-8 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 rounded-md shadow-sm transition-all"
                            title="Replace All"
                          >
                            <Replace className="size-4" />
                          </button>
                        )}

                        {contentHandlerStrategies.includes('append') && (
                          <button
                            onClick={() => applyContent(msg.content, 'append', lastActionId || undefined)}
                            className="flex items-center justify-center size-8 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-md shadow-sm transition-all"
                            title="Append"
                          >
                            <ArrowDownToLine className="size-4" />
                          </button>
                        )}

                        {(contentHandlerStrategies.includes('replace') && contentHandlerStrategies.includes('append')) && (
                          <div className="w-px h-6 bg-border mx-1" />
                        )}
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
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
    {showScrollButton && (
      <button
        onClick={scrollToBottom}
        className="absolute bottom-2 left-1/2 -translate-x-1/2 size-9 rounded-full bg-background/70 backdrop-blur-sm border border-border/40 flex items-center justify-center shadow-lg hover:bg-background/90 hover:border-border/60 transition-all cursor-pointer z-10"
        title="Scroll to bottom"
      >
        <ChevronDown className="size-4 text-muted-foreground/70" />
      </button>
    )}
    </div>
  );
});
