import { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, ChevronDown, Minimize2, PanelRightClose, Plus, Loader2 } from 'lucide-react';
import { useAIChat, EntityContext } from '@/hooks/useAIChat';
import { AIAction, getActionsForView, ViewType } from '@/components/ai/AIActions';
import { useAIAction } from '@/contexts/AIActionContext';
import { Button } from '@/components/ui/button';
import ConfirmModal from '@/components/ConfirmModal';
import { Tooltip } from '@base-ui/react/tooltip';
import { SessionItem } from './SessionItem';
import { MinimizedBar } from './MinimizedBar';
import { SelectionBar } from './SelectionBar';
import { ChatInput } from './ChatInput';
import { ChatMessages } from './ChatMessages';

interface AIChatPanelProps {
  onClose: () => void;
  entityType?: string | null;
  entityUid?: string | null;
  entityTitle?: string | null;
  entityContextText?: string | null;
  pendingPrompt?: string | null;
  onPromptUsed?: () => void;
  pendingAction?: { actionId: string; onResult: (response: string) => void } | null;
  onClearPendingAction?: () => void;
}

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

  // ─── Stream complete callback ──
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

  const { applyContent, hasContentHandler, contentHandlerStrategies, selectionText, setSelectionText, actionContextData } = useAIAction();
  const {
    sessions,
    currentSession,
    messages,
    isSessionsLoading,
    isMessagesLoading,
    isStreaming,
    createSession,
    selectSession,
    deleteSession,
    sendMessage,
    abortStream,
    hasMoreMessages,
    isLoadingMore,
    loadMoreMessages,
  } = useAIChat(entityContext, entityContextText, onStreamComplete);

  const [lastActionId, setLastActionId] = useState<string | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [activeActionPrompt, setActiveActionPrompt] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [confirmOverwritePrompt, setConfirmOverwritePrompt] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const entityToViewMap: Record<string, ViewType> = {
    note: 'notes',
    diagram: 'erd',
    flowchart: 'flowchart',
  };
  const currentViewType = entityType && entityToViewMap[entityType] ? entityToViewMap[entityType] : null;
  const contentCheckType = currentViewType === 'flowchart' ? 'flowchart' as const : currentViewType === 'erd' ? 'erd' as const : 'none' as const;
  const actions = currentViewType ? getActionsForView(currentViewType) : [];

  // ─── Auto-fill prompt from AI action buttons ──────
  useEffect(() => {
    if (pendingPrompt && pendingPrompt.trim()) {
      if (inputRef.current) inputRef.current.value = pendingPrompt;
      setMinimized(false);
      setTimeout(() => inputRef.current?.focus(), 100);
      if (onPromptUsed) onPromptUsed();
    }
  }, [pendingPrompt, onPromptUsed]);

  const handleSelectAction = useCallback((action: AIAction) => {
    if (!entityType || !entityContextText || !entityTitle) return;

    const context = {
      content: entityContextText,
      title: entityTitle,
      ...(actionContextData || {}),
    };
    const newPrompt = action.buildPrompt(context);

    // Toggle off if same action clicked again
    if (activeActionId === action.id) {
      setActiveActionId(null);
      setActiveActionPrompt(null);
      setLastActionId(null);
      return;
    }

    setActiveActionId(action.id);
    setActiveActionPrompt(newPrompt);
    setLastActionId(action.id);
    inputRef.current?.focus();
  }, [entityType, entityContextText, entityTitle, actionContextData, activeActionId]);

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

  // ─── Handle close ──────────────────────────────────
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // ─── Handle send (reads from uncontrolled textarea) ─
  const handleSend = useCallback(() => {
    const text = (inputRef.current?.value || '').trim();
    if (!text || isStreaming) return;

    const finalMessage = activeActionPrompt
      ? `${text}\n\n---SYSTEM_PROMPT---\n${activeActionPrompt}`
      : text;

    sendMessage(finalMessage, selectionText);
    if (inputRef.current) inputRef.current.value = '';
    setLastActionId(activeActionId);
    setActiveActionId(null);
    setActiveActionPrompt(null);
  }, [isStreaming, sendMessage, selectionText, activeActionPrompt, activeActionId]);

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

  const handleClearSelection = useCallback(() => {
    setSelectionText(null);
  }, [setSelectionText]);

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
        <ChatMessages
          hasActiveSession={hasActiveSession}
          isMessagesLoading={isMessagesLoading}
          hasMessages={hasMessages}
          messages={messages}
          isStreaming={isStreaming}
          hasMoreMessages={hasMoreMessages}
          isLoadingMore={isLoadingMore}
          minimized={minimized}
          loadMoreMessages={loadMoreMessages}
          handleNewSession={handleNewSession}
          sendMessage={sendMessage}
          hasContentHandler={hasContentHandler}
          contentHandlerStrategies={contentHandlerStrategies}
          lastActionId={lastActionId}
          applyContent={applyContent}
          contentCheckType={contentCheckType}
        />

        {/* ── Selection Bar ───────────────────────────── */}
        <SelectionBar
          hasActiveSession={hasActiveSession}
          selectionText={selectionText}
          onClear={handleClearSelection}
        />

        {/* ── Input Area ──────────────────────────────── */}
        <ChatInput
          hasActiveSession={hasActiveSession}
          isStreaming={isStreaming}
          entityType={entityType}
          actions={actions}
          activeActionId={activeActionId}
          inputRef={inputRef}
          onSend={handleSend}
          onKeyDown={handleKeyDown}
          onSelectAction={handleSelectAction}
          onAbort={abortStream}
        />
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
            if (inputRef.current) inputRef.current.value = confirmOverwritePrompt;
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
