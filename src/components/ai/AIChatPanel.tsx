import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sparkles, ChevronDown, Minimize2, PanelRightClose, Plus, Loader2, FileText, Database, GitBranch, Image, File } from 'lucide-react';
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
import { supabase } from '@/lib/supabase';

interface MentionFile {
  name: string;
  type: 'note' | 'diagram' | 'flowchart' | 'drawing';
  uid: string;
}

interface AIChatPanelProps {
  onClose: () => void;
  entityType?: string | null;
  entityUid?: string | null;
  entityTitle?: string | null;
  entityContextText?: string | null;
  projectId?: number | string | null;
  pendingPrompt?: string | null;
  onPromptUsed?: () => void;
  pendingAction?: { actionId: string; onResult: (response: string) => void } | null;
  onClearPendingAction?: () => void;
  notes?: any[];
  diagrams?: any[];
  flowcharts?: any[];
  drawings?: any[];
}

export const AIChatPanel = ({
  onClose,
  entityType,
  entityUid,
  entityTitle,
  entityContextText,
  projectId,
  pendingPrompt,
  onPromptUsed,
  pendingAction,
  onClearPendingAction,
  notes = [],
  diagrams = [],
  flowcharts = [],
  drawings = [],
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
  } = useAIChat(entityContext, entityContextText, onStreamComplete, projectId);

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
        target.closest('[data-slot="select-content"]') ||
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

  // ─── Build mention file list from workspace file arrays ──
  const mentionFiles = useMemo<MentionFile[]>(() => {
    // Derive projectId from active entity (activeProjectId prop is always null)
    let pid: string | number | null | undefined = projectId;
    if (!pid && entityType && entityUid) {
      if (entityType === 'note') {
        const n = notes.find((x: any) => String(x.id) === String(entityUid) || String(x.uid) === String(entityUid));
        pid = n?.project_id;
      } else if (entityType === 'diagram') {
        const d = diagrams.find((x: any) => String(x.id) === String(entityUid) || String(x.uid) === String(entityUid));
        pid = d?.project_id;
      } else if (entityType === 'flowchart') {
        const f = flowcharts.find((x: any) => String(x.id) === String(entityUid) || String(x.uid) === String(entityUid));
        pid = f?.project_id;
      } else if (entityType === 'drawing') {
        const d = drawings.find((x: any) => String(x.id) === String(entityUid) || String(x.uid) === String(entityUid));
        pid = d?.project_id;
      }
    }
    if (!pid) return [];
    const files: MentionFile[] = [];

    for (const n of notes) {
      if (String(n.project_id) === String(pid) && !n.is_deleted) {
        files.push({ name: n.title || 'Untitled', type: 'note', uid: n.uid ?? String(n.id) });
      }
    }
    for (const d of diagrams) {
      if (String(d.project_id) === String(pid) && !d.is_deleted) {
        files.push({ name: d.name || 'Untitled', type: 'diagram', uid: d.uid ?? String(d.id) });
      }
    }
    for (const f of flowcharts) {
      if (String(f.project_id) === String(pid) && !f.is_deleted) {
        files.push({ name: f.title || 'Untitled', type: 'flowchart', uid: f.uid ?? String(f.id) });
      }
    }
    for (const d of drawings) {
      if (String(d.project_id) === String(pid) && !d.is_deleted) {
        files.push({ name: d.title || 'Untitled', type: 'drawing', uid: d.uid ?? String(d.id) });
      }
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    return files;
  }, [projectId, notes, diagrams, flowcharts, drawings, entityType, entityUid]);

  // ─── Resolve @mentions to file content for AI context ──
  const resolveMentions = useCallback(async (text: string): Promise<{ context: string; seenUids: Set<string> }> => {
    const mentionRegex = /@([^\s\n]+)/g;
    const matches = text.matchAll(mentionRegex);
    const seenUids = new Set<string>();
    let context = '';

    for (const match of matches) {
      const name = match[1];
      const file = mentionFiles.find(f => f.name.toLowerCase() === name.toLowerCase());
      if (!file || seenUids.has(file.uid)) continue;
      seenUids.add(file.uid);

      try {
        let content = '';
        if (file.type === 'note') {
          const note = notes.find(n => String(n.id) === String(file.uid) || String(n.uid) === String(file.uid));
          if (note?.content) {
            content = note.content;
          } else {
            const { data } = await supabase
              .from('notes')
              .select('content')
              .eq('uid', file.uid)
              .single();
            content = (data as any)?.content || '';
          }
        } else if (file.type === 'flowchart') {
          const fc = flowcharts.find(f => String(f.id) === String(file.uid) || String(f.uid) === String(file.uid));
          content = fc?.data || '';
        } else if (file.type === 'diagram') {
          content = `Referenced ERD diagram: ${file.name}`;
        } else if (file.type === 'drawing') {
          const dw = drawings.find(d => String(d.id) === String(file.uid) || String(d.uid) === String(file.uid));
          content = dw?.data || '';
        }

        const MAX_CHARS = 2000;
        const stripped = content ? content.replace(/<[^>]+>/g, '').trim() : '';
        const preview = stripped.length > MAX_CHARS ? stripped.slice(0, MAX_CHARS) + '…' : stripped;
        if (preview) {
          context += `[Referenced file "${file.name}" (${file.type})]:\n${preview}\n\n`;
        } else {
          context += `[Referenced file "${file.name}" (${file.type})]\n\n`;
        }
      } catch {
        context += `[Referenced file "${file.name}" (${file.type})]\n\n`;
      }
    }
    return { context: context.trim() ? context : '', seenUids };
  }, [mentionFiles, notes, flowcharts, drawings]);

  // ─── Handle send (reads from uncontrolled textarea) ─
  const handleSend = useCallback(async () => {
    const text = (inputRef.current?.value || '').trim();
    if (!text || isStreaming) return;

    const { context: mentionContext } = await resolveMentions(text);

    const finalMessage = activeActionPrompt
      ? `${mentionContext}${text}\n\n---SYSTEM_PROMPT---\n${activeActionPrompt}`
      : mentionContext
        ? `${mentionContext}${text}`
        : text;

    sendMessage(finalMessage, selectionText);
    if (inputRef.current) inputRef.current.value = '';
    setLastActionId(activeActionId);
    setActiveActionId(null);
    setActiveActionPrompt(null);
  }, [isStreaming, sendMessage, selectionText, activeActionPrompt, activeActionId, resolveMentions]);

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
  const isCrossEntity = hasActiveSession && !!entityType && currentSession!.entity_type !== entityType;

  const entityTypeMeta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = useMemo(() => ({
    note: { label: 'Note', icon: FileText },
    diagram: { label: 'ERD', icon: Database },
    flowchart: { label: 'Flowchart', icon: GitBranch },
    drawing: { label: 'Drawing', icon: Image },
  }), []);

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
                    entityTypeMeta={entityTypeMeta}
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
          isCrossEntity={isCrossEntity}
          currentSession={currentSession}
          entityTypeMeta={entityTypeMeta}
          mentionFiles={mentionFiles}
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
          isCrossEntity={isCrossEntity}
          mentionFiles={mentionFiles}
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
