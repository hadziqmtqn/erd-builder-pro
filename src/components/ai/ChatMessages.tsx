import { memo, useRef, useState, useEffect, useCallback, createElement, ComponentType } from 'react';
import { MessageSquare, Plus, Bot, User, Loader2, Replace, ArrowDownToLine, Copy, Check, ChevronDown, Database, GitBranch } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import { AIChatMessage, AIChatSession, Entity } from '@/types';
import type { Node, Edge } from '@xyflow/react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { parseSQLToERD } from '@/lib/sqlParser';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogOverlay,
  DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent,
  SelectItem, SelectGroup, SelectLabel, SelectSeparator,
} from '@/components/ui/select';

interface MentionFile {
  name: string;
  type: 'note' | 'diagram' | 'flowchart' | 'drawing';
  uid: string;
}

function hasFlowchartJSON(content: string): boolean {
  const blockRegex = /```(?:json)?\s*({[\s\S]*?})\s*```/g;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && Array.isArray(parsed.nodes)) return true;
    } catch { /* ignore */ }
  }
  try {
    const parsed = JSON.parse(content.trim());
    if (parsed && Array.isArray(parsed.nodes)) return true;
  } catch { /* ignore */ }
  return false;
}

function hasSQLContent(content: string): boolean {
  // Check for SQL DDL statements (CREATE TABLE, ALTER TABLE) inside or outside code blocks
  const sqlKeywords = /\b(CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO)\b/i;
  const blockRegex = /```(?:\w*)\n?([\s\S]*?)```/g;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    if (sqlKeywords.test(match[1])) return true;
  }
  // Also check raw text outside code blocks
  if (sqlKeywords.test(content)) return true;
  return false;
}

function extractSQL(content: string): string | null {
  const sqlKeywords = /\b(CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO)\b/i;
  const blockRegex = /```(?:\w*)\n?([\s\S]*?)```/g;
  let match;
  const blocks: string[] = [];
  while ((match = blockRegex.exec(content)) !== null) {
    if (sqlKeywords.test(match[1])) {
      blocks.push(match[1].trim());
    }
  }
  if (blocks.length > 0) return blocks.join('\n\n');
  if (sqlKeywords.test(content)) return content.trim();
  return null;
}

function extractFlowchartJSON(content: string): string | null {
  const blockRegex = /```(?:json)?\s*({[\s\S]*?})\s*```/g;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && Array.isArray(parsed.nodes)) return match[1].trim();
    } catch { /* ignore */ }
  }
  try {
    const parsed = JSON.parse(content.trim());
    if (parsed && Array.isArray(parsed.nodes)) return content.trim();
  } catch { /* ignore */ }
  return null;
}

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
  contentCheckType?: 'flowchart' | 'erd' | 'none';
  isCrossEntity?: boolean;
  currentSession?: AIChatSession | null;
  entityTypeMeta?: Record<string, { label: string; icon: ComponentType<{ className?: string }> }>;
  mentionFiles?: MentionFile[];
  activeProjectId?: string | number | null;
  diagrams?: any[];
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
  contentCheckType = 'none',
  isCrossEntity = false,
  currentSession,
  entityTypeMeta,
  mentionFiles = [],
  activeProjectId,
  diagrams = [],
}: ChatMessagesProps) {
  const { handleSidebarDiagramCreate, handleSidebarFlowchartCreate, handleDiagramSelect, handleFlowchartSelect, activeProjectId: workspaceProjectId } = useWorkspace();

  const targetProjectId = activeProjectId !== undefined ? activeProjectId : workspaceProjectId;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Set<string | number>>(new Set());
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [erdSql, setErdSql] = useState<string | null>(null);
  const [erdMode, setErdMode] = useState<'create' | 'update' | null>(null);
  const [erdModeConfirming, setErdModeConfirming] = useState(false);
  const [erdUpdateUid, setErdUpdateUid] = useState<string | null>(null);
  const [erdExistingData, setErdExistingData] = useState<{ nodes: Node<Entity>[]; edges: Edge[] } | null>(null);
  const [erdFetchingExisting, setErdFetchingExisting] = useState(false);
  const chatFlowchartUidRef = useRef<string | null>(localStorage.getItem('chat_flowchart_uid'));

  // Fetch existing ERD data when user selects a target file for update
  useEffect(() => {
    if (!erdUpdateUid || erdMode !== 'update') {
      setErdExistingData(null);
      return;
    }
    let cancelled = false;
    setErdFetchingExisting(true);
    apiFetch(`/api/diagrams/${erdUpdateUid}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled) return;
        if (!data || !data.entities) {
          setErdExistingData(null);
          return;
        }
        const nodes: Node<Entity>[] = data.entities.map((e: any) => ({
          id: e.id,
          type: 'entity',
          position: { x: e.x || 0, y: e.y || 0 },
          data: e,
        }));
        const edges: Edge[] = (data.relationships || []).map((r: any) => ({
          id: r.id,
          source: r.source_entity_id,
          target: r.target_entity_id,
          sourceHandle: r.source_handle || undefined,
          targetHandle: r.target_handle || undefined,
          label: r.label,
          type: 'smoothstep',
        }));
        setErdExistingData({ nodes, edges });
      })
      .catch(() => { if (!cancelled) setErdExistingData(null); })
      .finally(() => { if (!cancelled) setErdFetchingExisting(false); });
    return () => { cancelled = true; };
  }, [erdUpdateUid, erdMode]);

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

  const handleCreateErd = useCallback(async (sql: string) => {
    setErdMode(null);
    setErdSql(null);
    localStorage.setItem('pending_create_erd_ddl', sql);
    toast.info('Creating new ERD diagram...');
    const d = await handleSidebarDiagramCreate('ERD from Chat', targetProjectId);
    if (d?.uid) {
      localStorage.setItem('chat_erd_uid', d.uid);
    }
  }, [handleSidebarDiagramCreate, targetProjectId]);

  const handleUpdateErd = useCallback(async (sql: string, uid: string) => {
    setErdMode(null);
    setErdSql(null);
    localStorage.setItem('pending_update_erd_ddl', sql);
    localStorage.setItem('chat_erd_uid', uid);
    toast.info('Review schema changes in the ERD diff panel...');
    await handleDiagramSelect(uid);
  }, [handleDiagramSelect]);

  function renderMentionText(text: string) {
    const mentionRegex = /@([^\s\n]+)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      const name = match[1];
      const file = mentionFiles.find(f => f.name.toLowerCase() === name.toLowerCase());

      if (file) {
        const path = file.type === 'note' ? `/notes/${file.uid}`
          : file.type === 'diagram' ? `/erd/${file.uid}`
          : file.type === 'flowchart' ? `/flowchart/${file.uid}`
          : `/drawing/${file.uid}`;

        parts.push(
          <Link
            key={match.index}
            to={path}
            className="inline-flex items-center gap-0.5 font-medium text-cyan-400 hover:text-cyan-300 underline decoration-cyan-400/30 hover:decoration-cyan-300/60 transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            @{file.name}
          </Link>
        );
      } else {
        parts.push(match[0]);
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  }

  return (
    <div className="flex-1 relative min-h-0">
      <div ref={scrollContainerRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden p-4 space-y-4 scrollbar-thin scrollbar-thumb-muted-foreground/10">
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
          {isCrossEntity && currentSession?.entity_type && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-3">
              <span className="shrink-0 text-sm leading-none mt-0.5">💬</span>
              <p className="text-[11px] text-amber-700 dark:text-amber-300/80 leading-relaxed">
                This conversation was started from{' '}
                <span className="font-semibold inline-flex items-center gap-1">
                  {entityTypeMeta?.[currentSession.entity_type]?.icon &&
                    createElement(entityTypeMeta[currentSession.entity_type].icon as ComponentType<{ className?: string }>, { className: 'size-3.5' })}
                  {entityTypeMeta?.[currentSession.entity_type]?.label ?? currentSession.entity_type}
                </span>
                . You can continue chatting here — the AI sees context from the current file together with related project files.
              </p>
            </div>
          )}
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

              <div className={`flex flex-col gap-1.5 max-w-[85%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                  className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed overflow-x-auto w-full ${
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
                            <p className={`whitespace-pre-wrap break-words ${isLong && !isExpanded ? 'line-clamp-6' : ''}`}>{renderMentionText(displayText)}</p>
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
                                const codeStr = String(children);
                                if (codeStr.includes('\n')) {
                                  return <CodeBlock children={children} />;
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
                    {!isCrossEntity && hasContentHandler && (contentCheckType === 'none' || (contentCheckType === 'flowchart' && hasFlowchartJSON(msg.content)) || (contentCheckType === 'erd' && hasSQLContent(msg.content))) && (
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

                    {hasSQLContent(msg.content) && (
                      <button
                        onClick={() => {
                          const sql = extractSQL(msg.content);
                          if (sql) {
                            setErdSql(sql);
                            setSqlPreviewExpanded(false);
                            setErdStep('choose');
                          }
                        }}
                        className="flex items-center justify-center size-8 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-md shadow-sm transition-all cursor-pointer"
                        title="Create or update ERD from this SQL"
                      >
                        <Database className="size-4" />
                      </button>
                    )}

                    {hasFlowchartJSON(msg.content) && (
                      <button
                        onClick={async () => {
                          const json = extractFlowchartJSON(msg.content);
                          if (json) {
                            localStorage.setItem('pending_create_flowchart_json', json);
                            if (chatFlowchartUidRef.current) {
                              toast.info('Updating existing Flowchart...');
                              await handleFlowchartSelect(chatFlowchartUidRef.current);
                            } else {
                              toast.info('Creating new Flowchart...');
                              const f = await handleSidebarFlowchartCreate('Flowchart from Chat', targetProjectId);
                              if (f?.uid) {
                                chatFlowchartUidRef.current = f.uid;
                                localStorage.setItem('chat_flowchart_uid', f.uid);
                              }
                            }
                          }
                        }}
                        className="flex items-center justify-center size-8 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-md shadow-sm transition-all cursor-pointer"
                        title={chatFlowchartUidRef.current ? 'Update existing Flowchart' : 'Create new Flowchart'}
                      >
                        <GitBranch className="size-4" />
                      </button>
                    )}

                    {(hasSQLContent(msg.content) || hasFlowchartJSON(msg.content)) && (
                      <div className="w-px h-6 bg-border mx-1" />
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

    {erdSql && (
      <Dialog open={true} onOpenChange={(v) => { if (!v) { setErdMode(null); setErdSql(null); } }}>
        <DialogOverlay />
        <DialogContent size="2xl" showCloseButton>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <Database className="size-4 text-indigo-400" />
              </div>
              <div>
                <DialogTitle>Create ERD from SQL</DialogTitle>
                <DialogDescription>
                  {erdMode === 'update'
                    ? 'Select which ERD diagram to update with this SQL'
                    : 'Create a new ERD diagram or update an existing one'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-4">
              {/* Action selection: radio-style cards */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setErdMode('create'); setErdUpdateUid(null); }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center group ${
                    erdMode === 'create'
                      ? 'border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                      : 'border-border/60 bg-muted/20 hover:bg-indigo-500/5 hover:border-indigo-500/20'
                  }`}
                >
                  <Plus className={`size-5 ${erdMode === 'create' ? 'text-indigo-300' : 'text-indigo-400'}`} />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Create New</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">New ERD diagram with these tables</p>
                  </div>
                </button>
                <button
                  onClick={() => setErdMode('update')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center group ${
                    erdMode === 'update'
                      ? 'border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/30'
                      : 'border-border/60 bg-muted/20 hover:bg-amber-500/5 hover:border-amber-500/20'
                  }`}
                >
                  <Database className={`size-5 ${erdMode === 'update' ? 'text-amber-300' : 'text-amber-400'}`} />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Update Existing</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Merge or replace an existing ERD</p>
                  </div>
                </button>
              </div>

              {erdMode && (() => {
                // Parse SQL once
                let parsed: any;
                try { parsed = parseSQLToERD(erdSql); } catch { parsed = null; }
                if (!parsed || !parsed.nodes.length) return null;

                if (erdMode === 'update') {
                  return (
                    <div className="space-y-3 pt-2 border-t border-border/20">
                      <label className="text-[11px] font-medium text-muted-foreground">Target ERD</label>
                      <Select value={erdUpdateUid || ''} onValueChange={setErdUpdateUid}>
                        <SelectTrigger className="w-full text-xs">
                          <SelectValue placeholder="Choose an ERD diagram...">
                            {(val: string | null) => {
                              if (!val) return null;
                              const d = diagrams.find((d: any) => (d.uid ?? String(d.id)) === val);
                              return d?.name || 'Untitled';
                            }}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(() => {
                            const eligible = diagrams.filter((d: any) => {
                              if (targetProjectId == null || targetProjectId === 'none') {
                                return d.project_id == null || d.project_id === 'none' || d.project_id === '';
                              }
                              return String(d.project_id) === String(targetProjectId);
                            });
                            if (eligible.length === 0) {
                              return (
                                <div className="px-3 py-4 text-[11px] text-muted-foreground/50 text-center">
                                  No ERD diagrams in this project
                                </div>
                              );
                            }
                            return (
                              <SelectGroup>
                                <SelectLabel>ERD Diagrams</SelectLabel>
                                {eligible.map((d: any) => (
                                  <SelectItem key={d.uid ?? d.id} value={d.uid ?? String(d.id)}>
                                    <span>{d.name || 'Untitled'}</span>
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            );
                          })()}
                        </SelectContent>
                      </Select>

                      {erdUpdateUid && erdFetchingExisting && (
                        <div className="flex items-center justify-center py-4 text-[11px] text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin mr-2" />
                          Loading existing schema...
                        </div>
                      )}

                      {erdUpdateUid && !erdFetchingExisting && erdExistingData && (() => {
                        const existingByName = new Map<string, any>();
                        for (const node of erdExistingData.nodes) {
                          existingByName.set(node.data.name.toLowerCase(), node.data);
                        }

                        const diffRows: { tableName: string; isNew: boolean; oldCols: any[]; newCols: any[] }[] = [];
                        for (const node of parsed.nodes) {
                          const existing = existingByName.get(node.data.name.toLowerCase());
                          diffRows.push({
                            tableName: node.data.name,
                            isNew: !existing,
                            oldCols: (existing?.columns || []).map((c: any) => ({ name: c.name, type: c.type, is_pk: !!c.is_pk, is_nullable: !!c.is_nullable })),
                            newCols: (node.data.columns || []).map((c: any) => ({ name: c.name, type: c.type, is_pk: !!c.is_pk, is_nullable: !!c.is_nullable })),
                          });
                        }

                        const deletedTables: string[] = [];
                        for (const node of erdExistingData.nodes) {
                          if (!parsed.nodes.find((n: any) => n.data.name.toLowerCase() === node.data.name.toLowerCase())) {
                            deletedTables.push(node.data.name);
                          }
                        }

                        if (diffRows.length === 0) return null;

                        // Build unified diff lines
                        type DiffLine =
                          | { type: 'header'; tableName: string; isNew?: boolean }
                          | { type: 'add' | 'remove' | 'normal'; prefix: string; col: { name: string; type: string; is_pk: boolean; is_nullable: boolean } };

                        const diffLines: DiffLine[] = [];
                        for (const row of diffRows) {
                          diffLines.push({ type: 'header', tableName: row.tableName, isNew: row.isNew });

                          const oldByName = new Map(row.oldCols.map((c: any) => [c.name.toLowerCase(), c]));
                          const newByName = new Map(row.newCols.map((c: any) => [c.name.toLowerCase(), c]));
                          const allNames = new Set([...oldByName.keys(), ...newByName.keys()]);

                          for (const name of allNames) {
                            const old = oldByName.get(name);
                            const nw = newByName.get(name);

                            if (!old && nw) {
                              diffLines.push({ type: 'add', prefix: '+', col: nw });
                            } else if (old && !nw) {
                              diffLines.push({ type: 'remove', prefix: '-', col: old });
                            } else if (old && nw) {
                              const changed = old.type !== nw.type || old.is_nullable !== nw.is_nullable;
                              if (changed) {
                                diffLines.push({ type: 'remove', prefix: '-', col: old });
                                diffLines.push({ type: 'add', prefix: '+', col: nw });
                              } else {
                                diffLines.push({ type: 'normal', prefix: ' ', col: old });
                              }
                            }
                          }
                        }

                        return (
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-medium text-muted-foreground">
                              Column Comparison
                              {deletedTables.length > 0 && (
                                <span className="ml-2 text-red-400/70 text-[10px]">
                                  ({deletedTables.length} table{deletedTables.length > 1 ? 's' : ''} removed)
                                </span>
                              )}
                            </label>
                            <div className="rounded-lg border border-border/40 overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar text-[10px] font-mono leading-relaxed">
                              <div className="divide-y divide-border/10">
                                {diffLines.map((line, li) => {
                                  if (line.type === 'header') {
                                    return (
                                      <div key={li} className="flex items-center gap-2 px-3 py-1.5 bg-[#0d1117] border-b border-border/30">
                                        {line.isNew && (
                                          <span className="text-[8px] font-semibold px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">NEW</span>
                                        )}
                                        <span className="text-[11px] font-semibold text-gray-200">{line.tableName}</span>
                                      </div>
                                    );
                                  }
                                  const isAdd = line.type === 'add';
                                  const isRemove = line.type === 'remove';
                                  const bg = isAdd ? 'bg-emerald-900/20' : isRemove ? 'bg-red-900/20' : '';
                                  const prefixColor = isAdd ? 'text-emerald-400' : isRemove ? 'text-red-400' : 'text-gray-600';
                                  const colNameColor = isAdd ? 'text-emerald-300' : isRemove ? 'text-red-400' : 'text-gray-300';
                                  const typeColor = isAdd ? 'text-emerald-400/60' : isRemove ? 'text-red-400/60' : 'text-gray-500';
                                  const pkColor = isAdd ? 'text-emerald-400' : isRemove ? 'text-red-400/70' : 'text-amber-400';
                                  const nulColor = isAdd ? 'text-emerald-400/50' : isRemove ? 'text-red-400/50' : 'text-gray-600';
                                  return (
                                    <div key={li} className={`flex items-center gap-1 px-3 py-[2px] ${bg}`}>
                                      <span className={`w-4 shrink-0 select-none ${prefixColor}`}>{line.prefix}</span>
                                      {line.col.is_pk && <span className={pkColor}>PK</span>}
                                      <span className={colNameColor}>{line.col.name}</span>
                                      <span className={typeColor}>{line.col.type}</span>
                                      {line.col.is_nullable && <span className={nulColor}>?</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            {deletedTables.length > 0 && (
                              <p className="text-[9px] text-red-400/50 leading-relaxed">Tables not in new SQL will be kept as-is in the existing ERD.</p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                }

                // ── Create New: show table cards ──
                return (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Tables ({parsed.nodes.length})
                    </label>
                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-2">
                      {parsed.nodes.map((node: any) => (
                        <div key={node.id} className="rounded-lg border border-border/40 bg-[#0d1117] overflow-hidden">
                          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/20 bg-black/20">
                            <Database className="size-3 text-indigo-400 shrink-0" />
                            <span className="text-[11px] font-semibold text-gray-200">{node.data.name}</span>
                            <span className="text-[9px] text-gray-500 ml-auto">{node.data.columns.length} col</span>
                          </div>
                          <div className="divide-y divide-border/10">
                            {node.data.columns.map((col: any) => (
                              <div key={col.id} className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono">
                                <div className="flex items-center gap-1 w-[60px] shrink-0">
                                  {col.is_pk && <span className="text-[8px] text-amber-400 font-semibold">PK</span>}
                                  {col._is_fk && <span className="text-[8px] text-blue-400 font-semibold">FK</span>}
                                </div>
                                <span className="text-gray-200 min-w-[40px]">{col.name}</span>
                                <span className="text-gray-500">{col.type}</span>
                                {col.is_nullable && <span className="text-gray-600 text-[8px]">nullable</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}


            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setErdMode(null); setErdSql(null); }}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!erdMode || erdModeConfirming || (erdMode === 'update' && !erdUpdateUid)}
              onClick={async () => {
                if (!erdMode) return;
                setErdModeConfirming(true);
                try {
                  if (erdMode === 'create') {
                    await handleCreateErd(erdSql);
                  } else if (erdMode === 'update' && erdUpdateUid) {
                    await handleUpdateErd(erdSql, erdUpdateUid);
                  }
                } finally {
                  setErdModeConfirming(false);
                }
              }}
            >
              {erdModeConfirming ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Database className="size-3.5" />
              )}
              {erdMode === 'create' ? 'Create ERD' : 'Update ERD'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
});
