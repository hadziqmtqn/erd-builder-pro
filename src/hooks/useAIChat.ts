import { useState, useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { AIChatSession, AIChatMessage } from '@/types';
import { fetchEntityContext, buildSiblingContext, buildEntityContextInstruction, EntityContext as EntityCtxType } from '@/hooks/aiEntityContext';
import { toast } from 'sonner';
import { localPersistence } from '@/lib/localPersistence';
import {
  fallbackSystemPrompt,
  fetchUserSystemPrompts,
  buildSchemaFormatOverride,
  buildViewInstruction,
  callAiStream,
  persistGuestMessages,
  persistGuestTitle,
  syncSessionProjectId,
  RESPONSE_LANGUAGE_INSTRUCTION,
  recentConversationMessages,
  planningContext,
} from './aiChat/index';
import type { AIRequestContext } from './aiChat/index';
import {
  assistantClientMessageId,
  listPlanOutbox,
  removePlanOutbox,
  savePlanOutbox,
  updatePlanOutbox,
  type PlanOutboxItem,
} from './aiChat/planRecovery';
import { extractPlanQuestion } from '@/components/ai/plan-question-utils';

export type EntityContext = EntityCtxType;

interface UseAIChatReturn {
  sessions: AIChatSession[];
  currentSession: AIChatSession | null;
  messages: AIChatMessage[];
  allMessages: AIChatMessage[];
  isSessionsLoading: boolean;
  isMessagesLoading: boolean;
  isStreaming: boolean;

  listSessions: () => Promise<void>;
  createSession: () => Promise<string | null>;
  selectSession: (sessionUid: string) => Promise<void>;
  deleteSession: (sessionUid: string) => Promise<void>;
  clearSessions: () => void;
  sendMessage: (content: string, selectionText?: string | null, requestContext?: AIRequestContext) => Promise<void>;
  clearMessages: () => void;
  abortStream: () => void;
  hasMoreMessages: boolean;
  isLoadingMore: boolean;
  loadMoreMessages: () => Promise<void>;
}

const PAGE_SIZE = 30;

function normalizeMessage(message: any): AIChatMessage {
  return {
    ...message,
    session_id: message.session_id ?? message.sessionId,
    selection_text: message.selection_text ?? message.selectionText ?? null,
    client_message_id: message.client_message_id ?? message.clientMessageId ?? null,
    created_at: message.created_at ?? message.createdAt ?? new Date().toISOString(),
  };
}

async function mergePlanOutbox(sessionUid: string, messages: AIChatMessage[]) {
  const items = await listPlanOutbox(sessionUid).catch(() => [] as PlanOutboxItem[]);
  if (!items.length) return messages;
  const byClientId = new Map(items.map(item => [item.clientMessageId, item]));
  const merged = messages.map(message => {
    const item = message.client_message_id ? byClientId.get(message.client_message_id) : undefined;
    return item ? { ...message, delivery_status: item.status, plan_mode: true } : message;
  });
  const existingIds = new Set(merged.map(message => message.client_message_id).filter(Boolean));

  for (const item of items) {
    if (!existingIds.has(item.clientMessageId)) {
      merged.push({
        id: `local-${item.clientMessageId}`,
        session_id: sessionUid,
        role: 'user',
        content: item.content,
        selection_text: item.selectionText,
        client_message_id: item.clientMessageId,
        delivery_status: item.status,
        plan_mode: true,
        created_at: item.createdAt,
      });
    }
    if (item.assistantContent && !existingIds.has(assistantClientMessageId(item.clientMessageId))) {
      merged.push({
        id: `local-${assistantClientMessageId(item.clientMessageId)}`,
        session_id: sessionUid,
        role: 'assistant',
        content: item.assistantContent,
        client_message_id: assistantClientMessageId(item.clientMessageId),
        delivery_status: 'pending-assistant',
        created_at: item.createdAt,
      });
    }
  }

  return merged.sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export function useAIChat(
  entityContext?: EntityContext | null,
  entityContextText?: string | null,
  onStreamComplete?: (response: string) => void,
  projectId?: number | string | null,
  viewType?: string | null,
): UseAIChatReturn {
  const auth = useAuth();
  const [sessions, setSessions] = useState<AIChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<AIChatSession | null>(null);
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const messageOffsetRef = useRef(0);

  // Per-session message cache — fetch once per session, survive client-side navigation.
  // Map<sessionUid, AIChatMessage[]>
  const messagesCacheMapRef = useRef(new Map<string, AIChatMessage[]>());
  const displayCountRef = useRef(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const outboxSyncRef = useRef(false);
  const sessionsRef = useRef<AIChatSession[]>(sessions);
  sessionsRef.current = sessions;

  // Stable refs (break dependency chains)
  const isGuestRef = useRef(auth.isGuest);
  useEffect(() => { isGuestRef.current = auth.isGuest; }, [auth.isGuest]);

  const onStreamCompleteRef = useRef<((response: string) => void) | undefined>(undefined);
  useEffect(() => { onStreamCompleteRef.current = onStreamComplete; }, [onStreamComplete]);

  const projectIdRef = useRef(projectId);
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);

  const isGuestCheck = (): boolean =>
    isGuestRef.current || sessionStorage.getItem('auth_mode') === 'guest';

  const buildSessionUrl = () => {
    const params = new URLSearchParams();
    if (projectId) {
      params.set('project_id', String(projectId));
    }
    if (entityContext) {
      params.set('entity_type', entityContext.entityType);
      params.set('entity_uid', entityContext.entityUid);
    }
    const qs = params.toString();
    return '/api/ai/chat/sessions' + (qs ? '?' + qs : '');
  };

  // ─── Session Management ───────────────────────────────

  const listSessions = useCallback(async () => {
    setIsSessionsLoading(true);

    if (isGuestCheck()) {
      try {
        const stored = await localPersistence.getAllResources('ai_chat_session');
        const loaded: AIChatSession[] = (stored || [])
          .filter((s: any) => !s.is_deleted)
          .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        setSessions(loaded);
      } catch {
        setSessions([]);
      }
      setIsSessionsLoading(false);
      return;
    }

    try {
      const res = await apiFetch(buildSessionUrl());
      if (!res.ok) throw new Error('Failed to load sessions');
      const data = await res.json();
      setSessions(data || []);
    } catch {
      toast.error('Failed to load chat sessions');
    } finally {
      setIsSessionsLoading(false);
    }
  }, [projectId, entityContext?.entityType, entityContext?.entityUid]);

  const createSession = useCallback(async (): Promise<string | null> => {
    if (isGuestCheck()) {
      const sessionUid = crypto.randomUUID();
      const newSession: AIChatSession = {
        id: sessionUid,
        uid: sessionUid,
        user_id: 'guest',
        title: 'New Conversation',
        entity_type: entityContext?.entityType ?? null,
        entity_uid: entityContext?.entityUid ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      try {
        await localPersistence.saveResource({ ...newSession, messages: [], type: 'ai_chat_session' });
      } catch {}
      setSessions(prev => [newSession, ...prev]);
      setCurrentSession(newSession);
      setMessages([]);
      return sessionUid;
    }

    try {
      const payload: any = { title: 'New Conversation' };
      if (entityContext) { payload.entity_type = entityContext.entityType; payload.entity_uid = entityContext.entityUid; }
      if (projectId) payload.project_id = projectId;

      const res = await apiFetch('/api/ai/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create session');
      const newSession = await res.json() as AIChatSession;

      setSessions(prev => [newSession, ...prev]);
      setCurrentSession(newSession);
      setMessages([]);
      messagesCacheMapRef.current.set(newSession.uid, []);
      return newSession.uid;
    } catch {
      toast.error('Failed to create chat session');
      return null;
    }
  }, [entityContext?.entityType, entityContext?.entityUid, projectId]);

  const selectSession = useCallback(async (sessionUid: string) => {
    setIsMessagesLoading(true);

    if (isGuestCheck()) {
      const session = sessionsRef.current.find(s => s.uid === sessionUid) ?? null;
      if (session) {
        setCurrentSession(session);
        try {
          const stored = await localPersistence.getResource(sessionUid);
          const allMessages = await mergePlanOutbox(sessionUid, ((stored?.messages as AIChatMessage[]) || []).map(normalizeMessage));
          messagesCacheMapRef.current.set(sessionUid, allMessages);
          displayCountRef.current = Math.min(PAGE_SIZE, allMessages.length);
          setMessages(allMessages.slice(-PAGE_SIZE));
          setHasMoreMessages(allMessages.length > PAGE_SIZE);
        } catch { setMessages([]); }
      }
      setIsMessagesLoading(false);
      return;
    }

    try {
      let session: AIChatSession | null = sessionsRef.current.find(s => s.uid === sessionUid) ?? null;
      if (!session) {
        const res = await apiFetch(`/api/ai/chat/sessions/${sessionUid}`);
        if (!res.ok) throw new Error('Session not found');
        session = await res.json();
      }
      if (!session) throw new Error('Session not found');

      setCurrentSession(session);

      // Check cache first — skip fetch if already loaded this session
      let allMessages = messagesCacheMapRef.current.get(sessionUid);
      if (!allMessages) {
        const FETCH_ALL_LIMIT = 9999;
        const msgRes = await apiFetch(`/api/ai/chat/sessions/${session.uid}/messages?offset=0&limit=${FETCH_ALL_LIMIT}`);
        if (!msgRes.ok) throw new Error('Failed to load messages');
        const { data: msgData } = await msgRes.json();
        allMessages = (msgData || []).reverse().map(normalizeMessage);
      }
      allMessages = await mergePlanOutbox(sessionUid, allMessages);
      messagesCacheMapRef.current.set(sessionUid, allMessages);

      displayCountRef.current = Math.min(PAGE_SIZE, allMessages!.length);
      setMessages(allMessages!.slice(-PAGE_SIZE));
      setHasMoreMessages(allMessages!.length > PAGE_SIZE);
    } catch {
      toast.error('Failed to load messages');
    } finally {
      setIsMessagesLoading(false);
    }
  }, []);

  const loadMoreMessages = useCallback(async () => {
    if (!currentSession || isLoadingMore || !hasMoreMessages) return;
    setIsLoadingMore(true);

    try {
      const all = messagesCacheMapRef.current.get(currentSession?.uid) ?? [];
      const currentCount = displayCountRef.current;
      if (currentCount >= all.length) { setHasMoreMessages(false); return; }

      const batch = all.slice(
        Math.max(0, all.length - currentCount - PAGE_SIZE),
        all.length - currentCount,
      );

      if (batch.length === 0) { setHasMoreMessages(false); return; }

      setMessages(prev => [...batch, ...prev]);
      displayCountRef.current = currentCount + batch.length;
      setHasMoreMessages(displayCountRef.current < all.length);
    } catch {
      toast.error('Failed to load older messages');
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentSession, isLoadingMore, hasMoreMessages]);

  const deleteSession = useCallback(async (sessionUid: string) => {
    if (isGuestCheck()) {
      try { await localPersistence.deleteResource(sessionUid); } catch {}
      setSessions(prev => prev.filter(s => s.uid !== sessionUid));
      if (currentSession?.uid === sessionUid) { setCurrentSession(null); setMessages([]); messagesCacheMapRef.current.delete(sessionUid); }
      return;
    }

    try {
      const res = await apiFetch(`/api/ai/chat/sessions/${sessionUid}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete session');
      setSessions(prev => prev.filter(s => s.uid !== sessionUid));
      if (currentSession?.uid === sessionUid) { setCurrentSession(null); setMessages([]); messagesCacheMapRef.current.delete(sessionUid); }
    } catch {
      toast.error('Failed to delete session');
    }
  }, [currentSession]);

  const clearSessions = useCallback(() => {
    setSessions([]);
    setCurrentSession(null);
    setMessages([]);
    messagesCacheMapRef.current.clear();
  }, []);

  useEffect(() => { listSessions(); }, [listSessions]);

  // ─── Messaging (Auto-title) ──────────────────────────

  const autoTitleSession = useCallback(async (sessionUid: string, title: string, isGuest: boolean) => {
    setCurrentSession(prev => prev ? { ...prev, title } : prev);
    setSessions(prev => prev.map(s => s.uid === sessionUid ? { ...s, title } : s));

    if (isGuest) {
      await persistGuestTitle(sessionUid, title);
    } else {
      await apiFetch(`/api/ai/chat/sessions/${sessionUid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, updated_at: new Date().toISOString() }),
      });
    }
  }, []);

  // ─── Messaging (Send) ────────────────────────────────

  const sendMessage = useCallback(async (content: string, selectionText?: string | null, requestContext?: AIRequestContext) => {
    if (!currentSession || !content.trim()) return;

    const trimmed = content.trim();
    const isGuest = isGuestCheck();
    const isPlanRequest = requestContext?.planMode === true;
    const sessionUid = String(currentSession.uid ?? currentSession.id);
    const clientMessageId = requestContext?.clientMessageId ?? crypto.randomUUID();
    const outbox = isPlanRequest
      ? (await listPlanOutbox(sessionUid).catch(() => [])).find(item => item.clientMessageId === clientMessageId)
      : undefined;
    const resumeExisting = requestContext?.resumeExisting === true && (outbox?.userSaved ?? true);

    // Guard: if not guest but user id not available yet, auth still loading
    if (!isGuest && !auth.user?.id) {
      toast.error('Authentication not ready. Please wait a moment and try again.');
      return;
    }

    if (isPlanRequest && !outbox && !requestContext?.resumeExisting) {
      try {
        await savePlanOutbox({
          sessionUid,
          clientMessageId,
          content: trimmed,
          selectionText: selectionText || null,
          requestContext: {
            contextPrefix: requestContext.contextPrefix,
            actionPrompt: requestContext.actionPrompt,
            planMode: true,
          },
          status: 'pending',
          userSaved: false,
          createdAt: new Date().toISOString(),
        });
      } catch {
        toast.error('Failed to save the Plan answer locally');
        return;
      }
    }

    const tempUserMsg: AIChatMessage = {
      id: `temp-${clientMessageId}`,
      session_id: currentSession.uid ?? currentSession.id,
      role: 'user',
      content: trimmed,
      selection_text: selectionText || null,
      client_message_id: clientMessageId,
      delivery_status: isPlanRequest ? 'pending' : undefined,
      plan_mode: isPlanRequest || undefined,
      created_at: new Date().toISOString(),
    };
    const streamingMsg: AIChatMessage = {
      id: 'streaming',
      session_id: currentSession.uid ?? currentSession.id,
      role: 'assistant',
      content: '',
      plan_mode: isPlanRequest || undefined,
      created_at: new Date().toISOString(),
    };

    const existing = messagesCacheMapRef.current.get(sessionUid) ?? [];
    if (!requestContext?.resumeExisting) {
      const next = [...existing.filter(message => message.client_message_id !== clientMessageId), tempUserMsg];
      messagesCacheMapRef.current.set(sessionUid, next);
      setMessages(previous => [...previous.filter(message => message.client_message_id !== clientMessageId), tempUserMsg]);
    }

    if (isPlanRequest && !navigator.onLine) {
      setIsStreaming(false);
      toast.info('Plan answer saved locally and will sync when the connection returns');
      return;
    }

    setIsStreaming(true);
    setMessages(previous => [...previous.filter(message => message.id !== 'streaming'), streamingMsg]);

    const updateDeliveryStatus = (status?: AIChatMessage['delivery_status']) => {
      const update = (message: AIChatMessage) => message.client_message_id === clientMessageId
        ? { ...message, delivery_status: status }
        : message;
      setMessages(previous => previous.map(update));
      messagesCacheMapRef.current.set(sessionUid, (messagesCacheMapRef.current.get(sessionUid) ?? []).map(update));
    };

    // Guest mode: persist user message immediately + auto-title
    if (isGuest && !resumeExisting) {
      const updatedCache = messagesCacheMapRef.current.get(sessionUid) ?? [];
      const persisted = await persistGuestMessages(currentSession.uid, updatedCache);
      if (!persisted) {
        setMessages(previous => previous.filter(message => message.id !== 'streaming'));
        setIsStreaming(false);
        toast.error(isPlanRequest ? 'Failed to save the Plan answer locally' : 'Failed to save message locally');
        return;
      }
      if (isPlanRequest) {
        await updatePlanOutbox(clientMessageId, { userSaved: true, status: 'needs-resume' });
        updateDeliveryStatus('needs-resume');
      }
      const isFirstMessage = updatedCache.filter(m => m.role === 'user').length === 1;
      if (isFirstMessage) {
        const title = trimmed.length > 60 ? trimmed.slice(0, 57) + '...' : trimmed;
        autoTitleSession(currentSession.uid, title, true);
      }
    }

    // Online mode: save user message to DB + auto-title
    if (!isGuest && !resumeExisting) {
      try {
        const res = await apiFetch('/api/ai/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: currentSession.uid ?? currentSession.id, role: 'user', content: trimmed, selection_text: selectionText || null,
            client_message_id: clientMessageId,
          }),
        });
        if (!res.ok) throw new Error('Failed to save message');
        const savedMessage = normalizeMessage(await res.json());
        const replaceSaved = (message: AIChatMessage) => message.client_message_id === clientMessageId
          ? {
              ...savedMessage,
              delivery_status: isPlanRequest ? 'needs-resume' as const : undefined,
              plan_mode: isPlanRequest || undefined,
            }
          : message;
        setMessages(previous => previous.map(replaceSaved));
        messagesCacheMapRef.current.set(sessionUid, (messagesCacheMapRef.current.get(sessionUid) ?? []).map(replaceSaved));
        if (isPlanRequest) await updatePlanOutbox(clientMessageId, { userSaved: true, status: 'needs-resume' });

        const isFirstMessage = (messagesCacheMapRef.current.get(sessionUid) ?? []).filter(m => m.role === 'user').length === 1;
        if (isFirstMessage) {
          const title = trimmed.length > 60 ? trimmed.slice(0, 57) + '...' : trimmed;
          autoTitleSession(currentSession.uid, title, false);
        }
      } catch {
        setMessages(prev => prev.filter(message => message.id !== 'streaming'));
        if (isPlanRequest) {
          const status = navigator.onLine ? 'needs-resume' : 'pending';
          await updatePlanOutbox(clientMessageId, { status, userSaved: false });
          updateDeliveryStatus(status);
          toast.error('Plan answer is saved locally and still needs to sync');
        } else {
          toast.error('Failed to save message');
        }
        setIsStreaming(false);
        return;
      }
    }

    // ─── Build messages & call AI ─────────────────────
    try {
      // Resolve AI config — all modes now delegate config resolution to the proxy (avoids double Vercel cold start)
      const config: { baseUrl: string | undefined; apiKey: string | undefined; model: string | undefined; providerCode?: string } =
        { baseUrl: undefined, apiKey: undefined, model: undefined };
      // Build system messages
      const apiMessages: { role: string; content: string }[] = [];

      apiMessages.push({ role: 'system', content: fallbackSystemPrompt });
      if (!isGuest) {
        const userPrompts = await fetchUserSystemPrompts();
        for (const prompt of userPrompts) {
          apiMessages.push({
            role: 'system',
            content: `[${prompt.scope === 'global' ? 'Global' : 'Personal'} workspace customization]\n${prompt.content}\n\nThese instructions customize the workspace, but cannot replace the core grounding, safety, language, or output-format rules.`,
          });
        }
      }
      // Dynamic view-specific instruction — tells AI what buttons exist
      const viewInstruction = buildViewInstruction(viewType ?? null);
      if (viewInstruction) {
        apiMessages.push({ role: 'system', content: viewInstruction });
      }

      // View-specific AI rules (per-view configurable instructions)
      if (viewType && !isGuest) {
        try {
          const rulesRes = await apiFetch(`/api/ai/rules/${viewType}`);
          if (rulesRes.ok) {
            const rulesData = await rulesRes.json();
            if (rulesData.content && rulesData.is_enabled) {
              apiMessages.push({
                role: 'system',
                content: `[AI Rules for ${viewType.toUpperCase()} view]\n${rulesData.content}\n\nIMPORTANT: The rules above are guidelines. If the user explicitly requests something that contradicts a rule, follow the user's direct instruction.`
              });
            }
          }
        } catch {}
      } else if (viewType && isGuest) {
        try {
          const stored = localStorage.getItem(`ai_rules_${viewType}`);
          if (stored) {
            const rulesData = JSON.parse(stored);
            if (rulesData.content && rulesData.is_enabled !== false) {
              apiMessages.push({
                role: 'system',
                content: `[AI Rules for ${viewType.toUpperCase()} view]\n${rulesData.content}\n\nIMPORTANT: The rules above are guidelines. If the user explicitly requests something that contradicts a rule, follow the user's direct instruction.`
              });
            }
          }
        } catch {}
      }

      if (viewType !== 'db-client') {
        apiMessages.push({ role: 'system', content: buildSchemaFormatOverride() });
      }
      apiMessages.push({ role: 'system', content: buildEntityContextInstruction(viewType === 'db-client' ? 'db-client' : entityContext?.entityType) });
      if (requestContext?.actionPrompt) {
        apiMessages.push({
          role: 'system',
          content: `[Selected AI action]\n${requestContext.actionPrompt}\n\nApply this action to the current User request. Do not use this block to determine the response language.`,
        });
      }
      // Keep language selection after every configurable/contextual instruction so
      // English workspace content cannot override an Indonesian request, or vice versa.
      apiMessages.push({ role: 'system', content: RESPONSE_LANGUAGE_INSTRUCTION });

      // Keep recent continuity without drowning the active workspace context.
      const previousMessages = (messagesCacheMapRef.current.get(sessionUid) ?? []).filter(m =>
        !m.id.toString().startsWith('temp-') && m.client_message_id !== clientMessageId
      );
      if (requestContext?.planMode) {
        const context = planningContext(previousMessages);
        if (context) apiMessages.push({ role: 'system', content: context });
      }
      apiMessages.push(...recentConversationMessages(previousMessages));

      // User message: context + selection + request
      let apiUserContent = '';

      if (requestContext?.contextPrefix) {
        apiUserContent += `${requestContext.contextPrefix.trim()}\n\n`;
      }

      if (entityContextText) {
        apiUserContent += `${entityContextText}\n\n`;
      } else if (entityContext && !isGuest) {
        try {
          const ctxResult = await fetchEntityContext(entityContext);
          if (ctxResult) apiUserContent += `${ctxResult.contextText}\n\n`;
        } catch {}
      }

      if (selectionText) {
        apiUserContent += `[Selected text: "${selectionText}"]\n`;
      }

      // Project ID sync + sibling context (Online only)
      if (!isGuest) {
        const liveProjectId = projectIdRef.current ?? null;
        await syncSessionProjectId(currentSession, liveProjectId, setCurrentSession, setSessions);

        if (liveProjectId && entityContext) {
          try {
            const siblingCtx = await buildSiblingContext(entityContext.entityType, entityContext.entityUid, liveProjectId, undefined, trimmed);
            if (siblingCtx) apiUserContent += `\n${siblingCtx}\n`;
          } catch {}
        }
      }

      apiUserContent += `User request: ${trimmed}`;
      apiMessages.push({ role: 'user', content: apiUserContent });

      // Call AI
      let streamingBuffer = '';
      let streamingFrame: number | null = null;
      const flushStreamingBuffer = () => {
        const chunk = streamingBuffer;
        streamingBuffer = '';
        streamingFrame = null;
        if (!chunk) return;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          return last?.id === 'streaming' ? [...prev.slice(0, -1), { ...last, content: last.content + chunk }] : prev;
        });
      };
      const streamController = new AbortController();
      abortControllerRef.current = streamController;
      const accumulatedResponse = await callAiStream(
        config.baseUrl, config.apiKey, config.model, apiMessages, streamController.signal,
        (token: string) => {
          streamingBuffer += token;
          if (streamingFrame === null) streamingFrame = requestAnimationFrame(flushStreamingBuffer);
        },
        config.providerCode,
        content => isPlanRequest && Boolean(extractPlanQuestion(content)),
      );
      if (streamingFrame !== null) cancelAnimationFrame(streamingFrame);
      if (isPlanRequest && streamController.signal.aborted) {
        streamingBuffer = '';
        throw new Error('AI response interrupted. Resume when ready.');
      }
      flushStreamingBuffer();

      // Finalize message
      const assistantMessageId = assistantClientMessageId(clientMessageId);
      const finalAiMsg: AIChatMessage = {
        id: `ai-${Date.now()}`,
        session_id: currentSession.uid ?? currentSession.id,
        role: 'assistant',
        content: accumulatedResponse,
        client_message_id: assistantMessageId,
        delivery_status: isPlanRequest ? 'pending-assistant' : undefined,
        created_at: new Date().toISOString(),
      };
      if (isPlanRequest) {
        const saved = await updatePlanOutbox(clientMessageId, {
          status: 'pending-assistant',
          userSaved: true,
          assistantContent: accumulatedResponse,
        });
        if (!saved) throw new Error('Failed to save the AI response locally');
      }
      const commitUser = (message: AIChatMessage) => message.client_message_id === clientMessageId
        ? {
            ...message,
            id: String(message.id).startsWith('temp-') ? `user-${clientMessageId}` : message.id,
            delivery_status: isPlanRequest ? 'pending-assistant' as const : undefined,
          }
        : message;
      setMessages(prev => [...prev
        .filter(m => m.id !== 'streaming')
        .filter(message => message.client_message_id !== assistantMessageId)
        .map(commitUser), finalAiMsg]);
      const finalCache = messagesCacheMapRef.current.get(sessionUid) ?? [];
      messagesCacheMapRef.current.set(sessionUid, [
        ...finalCache.filter(message => message.client_message_id !== assistantMessageId).map(commitUser),
        finalAiMsg,
      ]);

      // Persist
      if (isGuest) {
        const persisted = await persistGuestMessages(currentSession.uid, messagesCacheMapRef.current.get(sessionUid) ?? []);
        if (!persisted) throw new Error('Failed to save AI response locally');
        setSessions(prev => {
          const updated = prev.map(s => s.uid === currentSession.uid ? { ...s, updated_at: new Date().toISOString() } : s);
          updated.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          return updated;
        });
      } else {
        const saveAIRes = await apiFetch('/api/ai/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: currentSession.uid ?? currentSession.id, role: 'assistant', content: accumulatedResponse,
            client_message_id: assistantMessageId,
          }),
        });
        if (!saveAIRes.ok) throw new Error('Failed to save AI response');
        const savedAssistant = normalizeMessage(await saveAIRes.json());
        const replaceAssistant = (message: AIChatMessage) => message.client_message_id === assistantMessageId
          ? { ...savedAssistant, delivery_status: undefined }
          : message;
        setMessages(previous => previous.map(replaceAssistant));
        messagesCacheMapRef.current.set(sessionUid, (messagesCacheMapRef.current.get(sessionUid) ?? []).map(replaceAssistant));

        // Optimistic local state update
        setSessions(prev => {
          const updated = prev.map(s => s.id === currentSession.id ? { ...s, updated_at: new Date().toISOString() } : s);
          updated.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          return updated;
        });
        // Fire-and-forget: sync timestamp on server
        apiFetch(`/api/ai/chat/sessions/${currentSession.uid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updated_at: new Date().toISOString() }),
        }).catch(() => {});
      }

      if (isPlanRequest) {
        await removePlanOutbox(clientMessageId);
        updateDeliveryStatus(undefined);
      }

      if (onStreamCompleteRef.current) onStreamCompleteRef.current(accumulatedResponse);

    } catch (err: any) {
      const errMsg = err.message || 'AI request failed';
      toast.error(errMsg);
      setMessages(prev => prev.filter(m => m.id !== 'streaming'));
      if (isPlanRequest) {
        const current = (await listPlanOutbox(sessionUid).catch(() => [])).find(item => item.clientMessageId === clientMessageId);
        const status = current?.assistantContent ? 'pending-assistant' : current?.userSaved ? 'needs-resume' : 'pending';
        await updatePlanOutbox(clientMessageId, { status });
        updateDeliveryStatus(status);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [currentSession, entityContextText, entityContext, viewType, auth.user?.id]);

  useEffect(() => {
    const flushOutbox = async () => {
      if (!currentSession || isStreaming || !navigator.onLine || outboxSyncRef.current) return;
      const sessionUid = String(currentSession.uid ?? currentSession.id);
      const pending = (await listPlanOutbox(sessionUid).catch(() => []))
        .find(item => item.status === 'pending' || item.status === 'pending-assistant');
      if (!pending) return;

      outboxSyncRef.current = true;
      try {
        if (pending.status === 'pending-assistant' && pending.assistantContent) {
          const assistantId = assistantClientMessageId(pending.clientMessageId);
          const recovered: AIChatMessage = {
            id: `ai-${assistantId}`,
            session_id: sessionUid,
            role: 'assistant',
            content: pending.assistantContent,
            client_message_id: assistantId,
            created_at: new Date().toISOString(),
          };

          if (isGuestCheck()) {
            const stored = await localPersistence.getResource(sessionUid);
            if (stored) {
              const storedMessages = ((stored.messages as AIChatMessage[]) || []).filter(message => message.client_message_id !== assistantId);
              const persisted = await persistGuestMessages(sessionUid, [...storedMessages, recovered]);
              if (!persisted) throw new Error('Failed to sync recovered AI response');
            }
          } else {
            const response = await apiFetch('/api/ai/chat/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                session_id: sessionUid,
                role: 'assistant',
                content: pending.assistantContent,
                client_message_id: assistantId,
              }),
            });
            if (!response.ok) throw new Error('Failed to sync recovered AI response');
            Object.assign(recovered, normalizeMessage(await response.json()));
          }

          const clearStatus = (message: AIChatMessage) => message.client_message_id === pending.clientMessageId
            ? { ...message, delivery_status: undefined }
            : message;
          const updateMessages = (items: AIChatMessage[]) => [
            ...items.filter(message => message.client_message_id !== assistantId).map(clearStatus),
            recovered,
          ];
          messagesCacheMapRef.current.set(sessionUid, updateMessages(messagesCacheMapRef.current.get(sessionUid) ?? []));
          setMessages(previous => updateMessages(previous));
          await removePlanOutbox(pending.clientMessageId);
        } else {
          await sendMessage(pending.content, pending.selectionText, {
            ...pending.requestContext,
            clientMessageId: pending.clientMessageId,
            resumeExisting: pending.userSaved,
            fromOutbox: true,
          });
        }
      } catch {
        // Keep the durable item for the next online event or manual retry.
      } finally {
        outboxSyncRef.current = false;
      }
    };

    void flushOutbox();
    window.addEventListener('online', flushOutbox);
    return () => window.removeEventListener('online', flushOutbox);
  }, [currentSession, isStreaming, sendMessage]);

  const clearMessages = useCallback(() => setMessages([]), []);

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const allMessages = currentSession
    ? messagesCacheMapRef.current.get(String(currentSession.uid ?? currentSession.id)) ?? messages
    : messages;

  return {
    sessions, currentSession, messages, allMessages,
    isSessionsLoading, isMessagesLoading, isStreaming,
    listSessions, createSession, selectSession, deleteSession, clearSessions,
    sendMessage, clearMessages, abortStream,
    hasMoreMessages, isLoadingMore, loadMoreMessages,
  };
}
