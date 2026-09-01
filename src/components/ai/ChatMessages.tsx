import { memo, useRef, useState, useEffect, useCallback } from 'react';
import { MessageSquare, Plus, Bot, User, Loader2, Copy, Check, ChevronDown } from 'lucide-react';
import { AIChatMessage } from '@/types';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { Button } from '@/components/ui/button';
import { AssistantMarkdown } from './AssistantMarkdown';
import { formatTime } from './chatUtils';
import { ErdFromSqlDialog } from './ErdFromSqlDialog';
import { FlowchartFromJsonDialog } from './FlowchartFromJsonDialog';
import { NoteFromTextDialog } from './NoteFromTextDialog';
import { AssistantMessageActions } from './AssistantMessageActions';
import { UserMessageBody } from './UserMessageBody';
import { extractPlanQuestion, hasSubstantivePlanContent, hidePlanQuestionProtocol, isPlanResponse } from './plan-question-utils';

interface MentionFile {
  name: string;
  type: 'note' | 'diagram' | 'flowchart' | 'drawing';
  uid: string;
}

export interface ChatMessagesProps {
  hasActiveSession: boolean;
  hasSessions?: boolean;
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
  mentionFiles?: MentionFile[];
  activeProjectId?: string | number | null;
  diagrams?: any[];
  flowcharts?: any[];
  notes?: any[];
  erdDefaultName?: string;
  flowchartDefaultName?: string;
  noteDefaultName?: string;
  activeNoteContent?: string;
}

export const ChatMessages = memo(function ChatMessages({
  hasActiveSession,
  hasSessions,
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
  mentionFiles = [],
  activeProjectId,
  diagrams = [],
  flowcharts = [],
  notes = [],
  erdDefaultName = 'New ERD',
  flowchartDefaultName = 'New Flowchart',
  noteDefaultName = 'New Note',
  activeNoteContent,
}: ChatMessagesProps) {
  const {
    handleSidebarDiagramCreate,
    handleSidebarFlowchartCreate,
    handleSidebarNoteCreate,
    handleDiagramSelect,
    handleFlowchartSelect,
    handleNoteSelect,
    activeProjectId: workspaceProjectId,
    triggerPendingErdDiff,
  } = useWorkspace();

  const targetProjectId = activeProjectId !== undefined ? activeProjectId : workspaceProjectId;

  // ─── Scroll state ───────────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // ─── Per-message UI state ───────────────────────────────
  const [expandedMessages, setExpandedMessages] = useState<Set<string | number>>(new Set());
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // ─── ERD dialog state ───────────────────────────────────
  const [erdDialogSchema, setErdDialogSchema] = useState<string | null>(null);

  // ─── Flowchart dialog state ─────────────────────────────
  const [flowchartDialogJson, setFlowchartDialogJson] = useState<string | null>(null);

  // ─── Note dialog state ─────────────────────────────────
  const [noteDialogText, setNoteDialogText] = useState<string | null>(null);

  // ─── Auto-scroll to bottom on new messages ─────────────
  // Use instant scroll (scrollTop assignment) during streaming
  // to avoid animation jank when content updates every token.
  // Smooth scroll reserved for manual "scroll to bottom" button.
  useEffect(() => {
    if (!minimized && !userScrolledUpRef.current) {
      const el = scrollContainerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [messages, isStreaming, minimized]);

  // ─── Track manual scroll ────────────────────────────────
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

  const handleToggleExpand = useCallback((key: string | number) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleCopy = useCallback((id: string) => {
    const msg = messages.find(m => (m.id?.toString() || '') === id);
    if (msg) navigator.clipboard.writeText(msg.content);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  }, [messages]);

  return (
    <div className="flex-1 relative min-h-0">
      <div ref={scrollContainerRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden p-4 space-y-4 scrollbar-thin scrollbar-thumb-muted-foreground/10">

        {!hasActiveSession ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-16">
            {!hasSessions ? (
              <>
                <MessageSquare className="size-10 text-muted-foreground/20 mb-4" />
                <h4 className="text-sm font-semibold">AI Assistant</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-50">
                  Select a conversation or start a new chat
                </p>
                <Button variant="default" size="sm" className="mt-4" onClick={handleNewSession}>
                  <Plus className="size-4 mr-2" />
                  New Chat
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground/50 font-medium">
                Select a conversation to continue
              </p>
            )}
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
              const msgKey = msg.id?.toString() || idx.toString();
              const planQuestion = !isUser ? extractPlanQuestion(msg.content) : null;
              const displayContent = planQuestion ? planQuestion.content : isStreamingMsg ? hidePlanQuestionProtocol(msg.content) : msg.content;
              const preservesPlanContent = Boolean(planQuestion && hasSubstantivePlanContent(planQuestion.content));
              if ((isStreamingMsg && msg.plan_mode) || (planQuestion && !preservesPlanContent) || (isUser && isPlanResponse(msg.content))) return null;

              return (
                <div
                  key={msg.id || idx}
                  className={`flex gap-3 group/msg ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* Avatar */}
                  <div className={`shrink-0 size-7 rounded-full flex items-center justify-center transition-opacity ${
                    isUser ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>
                    {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                  </div>

                  {/* Bubble + actions */}
                  <div className={`flex flex-col gap-1.5 max-w-[85%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
                    <div className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed w-full ${
                      isUser
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 border border-border/40'
                    }`}>
                      {isUser ? (
                        <UserMessageBody
                          content={msg.content}
                          selectionText={msg.selection_text}
                          msgId={msg.id ?? idx}
                          expandedMessages={expandedMessages}
                          onToggleExpand={handleToggleExpand}
                          mentionFiles={mentionFiles}
                        />
                      ) : (
                        <AssistantMarkdown content={displayContent} isStreaming={isStreamingMsg} />
                      )}
                    </div>

                    {/* Timestamp */}
                    {!isStreamingMsg && msg.created_at && (
                      <span className="text-[10px] text-muted-foreground/40 px-1 block">
                        {formatTime(msg.created_at)}
                      </span>
                    )}

                    {/* User message actions (resend + copy) */}
                    {isUser && !isStreamingMsg && msg.id !== 'streaming' && (
                      <div className="flex items-center gap-1.5 h-8 mt-1 overflow-hidden transition-all duration-300 ease-in-out opacity-0 group-hover/msg:opacity-100 group-hover/msg:translate-y-0 -translate-y-2 pointer-events-none group-hover/msg:pointer-events-auto">
                        {idx === messages.length - 1 && !isPlanResponse(msg.content) && (
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
                            setCopiedMsgId(msgKey);
                            setTimeout(() => setCopiedMsgId(null), 2000);
                          }}
                          className="flex items-center justify-center size-8 bg-muted/40 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-md shadow-sm transition-all"
                          title="Copy message"
                        >
                          {copiedMsgId === msgKey ? (
                            <Check className="size-4 text-green-500" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                        </button>
                      </div>
                    )}

                    {/* Assistant message actions */}
                    {!isUser && !isStreamingMsg && !isStreaming && msg.content && (
                      <AssistantMessageActions
                        content={displayContent}
                        msgId={msgKey}
                        hasContentHandler={hasContentHandler}
                        contentHandlerStrategies={contentHandlerStrategies}
                        contentCheckType={contentCheckType}
                        lastActionId={lastActionId}
                        applyContent={applyContent}
                        copiedMsgId={copiedMsgId}
                        onCopy={handleCopy}
                        onOpenErdDialog={setErdDialogSchema}
                        onOpenFlowchartDialog={setFlowchartDialogJson}
                        onOpenNoteDialog={setNoteDialogText}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll-to-bottom FAB */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 size-9 rounded-full bg-background/70 backdrop-blur-sm border border-border/40 flex items-center justify-center shadow-lg hover:bg-background/90 hover:border-border/60 transition-all cursor-pointer z-10"
          title="Scroll to bottom"
        >
          <ChevronDown className="size-4 text-muted-foreground/70" />
        </button>
      )}

      {/* ERD from SQL dialog */}
      {erdDialogSchema && (
        <ErdFromSqlDialog
          schema={erdDialogSchema}
          onClose={() => setErdDialogSchema(null)}
          diagrams={diagrams}
          targetProjectId={targetProjectId}
          erdDefaultName={erdDefaultName}
          handleSidebarDiagramCreate={handleSidebarDiagramCreate}
          handleDiagramSelect={handleDiagramSelect}
          triggerPendingErdDiff={triggerPendingErdDiff}
        />
      )}

      {/* Flowchart from JSON dialog */}
      {flowchartDialogJson && (
        <FlowchartFromJsonDialog
          json={flowchartDialogJson}
          onClose={() => setFlowchartDialogJson(null)}
          flowcharts={flowcharts}
          targetProjectId={targetProjectId}
          flowchartDefaultName={flowchartDefaultName}
          handleSidebarFlowchartCreate={handleSidebarFlowchartCreate}
          handleFlowchartSelect={handleFlowchartSelect}
        />
      )}
      {/* Note from text dialog */}
      {noteDialogText && (
        <NoteFromTextDialog
          text={noteDialogText}
          onClose={() => setNoteDialogText(null)}
          notes={notes}
          targetProjectId={targetProjectId}
          noteDefaultName={noteDefaultName}
          handleSidebarNoteCreate={handleSidebarNoteCreate}
          handleNoteSelect={handleNoteSelect}
          activeNoteContent={activeNoteContent}
        />
      )}
    </div>
  );
});
