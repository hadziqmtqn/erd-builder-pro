import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sparkles, PanelRightClose, Plus, Loader2, Search, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { useAIChat, EntityContext } from '@/hooks/useAIChat';
import { AIAction, getActionsForView, ViewType } from '@/components/ai/AIActions';
import { useAIAction } from '@/contexts/AIActionContext';
import { Button } from '@/components/ui/button';
import ConfirmModal from '@/components/ConfirmModal';
import { Tooltip } from '@base-ui/react/tooltip';
import { SessionItem } from './SessionItem';
import { SelectionBar } from './SelectionBar';
import { ChatInput } from './ChatInput';
import { ChatMessages } from './ChatMessages';
import { apiFetch } from '@/lib/api';
import type { AIChatSession } from '@/types';

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
  activeNoteContent?: string;
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
  activeNoteContent,
}: AIChatPanelProps) => {
  const entityContext: EntityContext | null =
    entityType && entityUid ? { entityType, entityUid } : null;

  // ERD default name: use source file title, fallback to "New ERD"
  const erdDefaultName = entityTitle || 'New ERD';
  const flowchartDefaultName = entityTitle || 'New Flowchart';
  const noteDefaultName = entityTitle || 'New Note';

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
  const entityToViewMap: Record<string, ViewType> = {
    note: 'notes',
    diagram: 'erd',
    flowchart: 'flowchart',
  };
  const currentViewType = entityType && entityToViewMap[entityType] ? entityToViewMap[entityType] : null;

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
  } = useAIChat(entityContext, entityContextText, onStreamComplete, projectId, currentViewType);

  const [lastActionId, setLastActionId] = useState<string | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [activeActionPrompt, setActiveActionPrompt] = useState<string | null>(null);
  const [page, setPage] = useState<'list' | 'chat'>('list');
  const [minimized, setMinimized] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<AIChatSession | null>(null);
  const [confirmOverwritePrompt, setConfirmOverwritePrompt] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ─── Session search & pagination ────────────────
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionPage, setSessionPage] = useState(1);
  const SESSIONS_PER_PAGE = 20;

  const filteredSessions = useMemo(() => {
    if (!sessionSearch.trim()) return sessions;
    const q = sessionSearch.toLowerCase();
    return sessions.filter(s => s.title?.toLowerCase().includes(q));
  }, [sessions, sessionSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / SESSIONS_PER_PAGE));
  const paginatedSessions = useMemo(() => {
    const start = (sessionPage - 1) * SESSIONS_PER_PAGE;
    return filteredSessions.slice(start, start + SESSIONS_PER_PAGE);
  }, [filteredSessions, sessionPage]);

  // Reset to page 1 on search change
  useEffect(() => { setSessionPage(1); }, [sessionSearch]);

  // Actions sesuai file fitur yang sedang dibuka (entityType), bukan dari sesi entity_type
  const actions = currentViewType ? getActionsForView(currentViewType) : [];

  // ─── Auto-fill prompt from AI action buttons ──────
  useEffect(() => {
    if (pendingPrompt && pendingPrompt.trim()) {
      if (inputRef.current) inputRef.current.value = pendingPrompt;
      setMinimized(false);
      setPage('chat');
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

  const contentCheckType = currentViewType === 'flowchart' ? 'flowchart' as const : currentViewType === 'erd' ? 'erd' as const : 'none' as const;
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
            const res = await apiFetch(`/api/notes/${file.uid}`);
            if (res.ok) {
              const data = await res.json();
              content = data.content || '';
            }
          }
        } else if (file.type === 'flowchart') {
          const fc = flowcharts.find(f => String(f.id) === String(file.uid) || String(f.uid) === String(file.uid));
          const rawData = fc?.data || '';
          if (rawData) {
            try {
              const parsed = JSON.parse(rawData);
              const nodes = parsed.nodes || [];
              const edges = parsed.edges || [];
              const nodeMap = new Map(nodes.map((n: any) => [n.id, n.data?.label || n.label || '']));
              
              const stepLines = nodes
                .map((n: any) => `    - Step [${n.id}]: "${n.data?.label || n.label || ''}" (${n.type || 'step'})`)
                .join('\n');
              const connectionLines = edges
                .map((e: any) => `    - Connection: "${nodeMap.get(e.source) || e.source}" ➔ "${nodeMap.get(e.target) || e.target}"${e.label ? ` (label: ${e.label})` : ''}`)
                .join('\n');
              
              content = `Flowchart "${file.name}" structure:\n  Steps:\n${stepLines}\n  Connections:\n${connectionLines}`;
            } catch {
              content = rawData;
            }
          }
        } else if (file.type === 'diagram') {
          const res = await apiFetch(`/api/diagrams/${file.uid}`);
          if (res.ok) {
            const diagram = await res.json();
            const entities = diagram.entities || [];
            if (entities.length > 0) {
              const entityLines = entities.map((e: any) => {
                const colStr = (e.columns || [])
                  .map((c: any) => `${c.name}: ${c.type}${c.is_pk ? ' PK' : ''}`)
                  .join(', ');
                return `    - Table: ${e.name} (${colStr})`;
              }).join('\n');
              content = `ERD diagram "${file.name}" tables:\n${entityLines}`;
            } else {
              content = `ERD diagram "${file.name}" (no tables defined)`;
            }
          } else {
            content = `Referenced ERD diagram: ${file.name}`;
          }
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
    setPage('chat');
  }, [createSession]);

  const handleClearSelection = useCallback(() => {
    setSelectionText(null);
  }, [setSelectionText]);

  const hasActiveSession = !!currentSession;
  const hasMessages = messages.length > 0;
  const hasSessions = sessions.length > 0;

  return (
    <Tooltip.Provider>
      <div
        ref={panelRef}
        style={{ display: minimized ? 'none' : undefined }}
        className="h-full flex flex-col bg-card text-card-foreground overflow-hidden"
      >
        {page === 'list' ? (
          <>
            {/* ── List Header ────────────────────────── */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-muted/20">
              <div className="flex items-center gap-2.5">
                <Sparkles className="size-4 text-primary" />
                <h3 className="text-sm font-semibold tracking-tight">AI Assistant</h3>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="size-8" onClick={handleClose} title="Close panel">
                  <PanelRightClose className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* ── Session List Page ──────────────────── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
              <Button variant="outline" size="sm" className="w-full gap-2 h-8 text-xs border-dashed" onClick={handleNewSession}>
                <Plus className="size-3.5" />
                New Chat
              </Button>

              {hasSessions && (
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/40" />
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    value={sessionSearch}
                    onChange={e => setSessionSearch(e.target.value)}
                    className="w-full h-8 pl-7 pr-2 text-xs rounded-md border border-border bg-background/50 outline-none focus:border-primary/30 transition-colors"
                  />
                </div>
              )}

              {isSessionsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="size-6 animate-spin text-muted-foreground/40" />
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-xs text-muted-foreground/50 font-medium">
                    {sessionSearch ? 'No matching conversations' : 'No conversations yet'}
                  </p>
                </div>
              ) : (
                <>
                  {paginatedSessions.map((session) => (
                    <SessionItem
                      key={session.uid ?? session.id}
                      session={session}
                      isActive={currentSession?.uid === session.uid}
                      onClick={() => {
                        selectSession(session.uid);
                        setPage('chat');
                      }}
                      onDelete={() => setSessionToDelete(session)}
                    />
                  ))}

                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <button
                        onClick={() => setSessionPage(p => Math.max(1, p - 1))}
                        disabled={sessionPage <= 1}
                        className="size-6 flex items-center justify-center rounded hover:bg-muted/30 disabled:opacity-20 transition-colors"
                      >
                        <ChevronLeft className="size-3" />
                      </button>
                      <span className="text-xs text-muted-foreground/50 font-medium tabular-nums">
                        {sessionPage}/{totalPages}
                      </span>
                      <button
                        onClick={() => setSessionPage(p => Math.min(totalPages, p + 1))}
                        disabled={sessionPage >= totalPages}
                        className="size-6 flex items-center justify-center rounded hover:bg-muted/30 disabled:opacity-20 transition-colors"
                      >
                        <ChevronRight className="size-3" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            {/* ── Chat Header ─────────────────────────── */}
            <div className="shrink-0 flex items-center justify-between px-3 py-3 border-b bg-muted/20">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => setPage('list')}
                  className="size-7 flex items-center justify-center rounded hover:bg-muted/30 shrink-0 transition-colors"
                  title="Back to conversations"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <span className="text-sm font-medium truncate">{currentSession?.title || 'AI Assistant'}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="size-8" onClick={handleClose} title="Close panel">
                  <PanelRightClose className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* ── Messages ────────────────────────────── */}
            <ChatMessages
              hasActiveSession={hasActiveSession}
              hasSessions={hasSessions}
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
              mentionFiles={mentionFiles}
              activeProjectId={projectId}
              diagrams={diagrams}
              flowcharts={flowcharts}
              notes={notes}
              erdDefaultName={erdDefaultName}
              flowchartDefaultName={flowchartDefaultName}
              noteDefaultName={noteDefaultName}
              activeNoteContent={activeNoteContent}
            />

            {/* ── Selection Bar ────────────────────────── */}
            <SelectionBar
              hasActiveSession={hasActiveSession}
              selectionText={selectionText}
              onClear={handleClearSelection}
            />

            {/* ── Input Area ───────────────────────────── */}
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
              hasProject={!!projectId}
              mentionFiles={mentionFiles}
            />
          </>
        )}
      </div>

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

      <ConfirmModal
        isOpen={!!sessionToDelete}
        onCancel={() => setSessionToDelete(null)}
        onConfirm={() => {
          if (sessionToDelete) deleteSession(sessionToDelete.uid);
          setSessionToDelete(null);
        }}
        title="Delete Conversation?"
        message={`Are you sure you want to delete "${sessionToDelete?.title || 'this conversation'}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </Tooltip.Provider>
  );
};
