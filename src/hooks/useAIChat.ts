import { useState, useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { AIChatSession, AIChatMessage } from '@/types';
import { fetchEntityContext, buildSiblingContext, buildEntityContextInstruction, EntityContext as EntityCtxType } from '@/hooks/aiEntityContext';
import { toast } from 'sonner';
import { localPersistence } from '@/lib/localPersistence';
import {
  fallbackSystemPrompt,
  fetchUserSystemPrompt,
  buildSchemaFormatOverride,
  buildViewInstruction,
  callAiStream,
  persistGuestMessages,
  persistGuestTitle,
  syncSessionProjectId,
} from './aiChat/index';

export type EntityContext = EntityCtxType;

interface UseAIChatReturn {
  sessions: AIChatSession[];
  currentSession: AIChatSession | null;
  messages: AIChatMessage[];
  isSessionsLoading: boolean;
  isMessagesLoading: boolean;
  isStreaming: boolean;

  listSessions: () => Promise<void>;
  createSession: () => Promise<string | null>;
  selectSession: (sessionUid: string) => Promise<void>;
  deleteSession: (sessionUid: string) => Promise<void>;
  clearSessions: () => void;
  sendMessage: (content: string, selectionText?: string | null) => Promise<void>;
  clearMessages: () => void;
  abortStream: () => void;
  hasMoreMessages: boolean;
  isLoadingMore: boolean;
  loadMoreMessages: () => Promise<void>;
}

const PAGE_SIZE = 30;

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
          const allMessages = (stored?.messages as AIChatMessage[]) || [];
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
        allMessages = (msgData || []).reverse().map((m: any) => ({ ...m, selection_text: m.selection_text ?? null }));
        messagesCacheMapRef.current.set(sessionUid, allMessages!);
      }

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

  const sendMessage = useCallback(async (content: string, selectionText?: string | null) => {
    if (!currentSession || !content.trim()) return;

    const trimmed = content.trim();
    const isGuest = isGuestCheck();

    // Guard: if not guest but user id not available yet, auth still loading
    if (!isGuest && !auth.user?.id) {
      toast.error('Authentication not ready. Please wait a moment and try again.');
      return;
    }

    setIsStreaming(true);

    // Optimistic user message
    const tempUserMsg: AIChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: currentSession.uid ?? currentSession.id,
      role: 'user',
      content: trimmed,
      selection_text: selectionText || null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);
    const sessionUid = String(currentSession.uid ?? currentSession.id);
    const existing = messagesCacheMapRef.current.get(sessionUid) ?? [];
    messagesCacheMapRef.current.set(sessionUid, [...existing, tempUserMsg]);

    // Guest mode: persist user message immediately + auto-title
    if (isGuest) {
      const updatedCache = messagesCacheMapRef.current.get(sessionUid) ?? [];
      persistGuestMessages(currentSession.uid, [...updatedCache]);
      const isFirstMessage = updatedCache.filter(m => m.role === 'user').length === 1;
      if (isFirstMessage) {
        const title = trimmed.length > 60 ? trimmed.slice(0, 57) + '...' : trimmed;
        autoTitleSession(currentSession.uid, title, true);
      }
    }

    // Online mode: save user message to DB + auto-title
    if (!isGuest) {
      try {
        const res = await apiFetch('/api/ai/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: currentSession.uid ?? currentSession.id, role: 'user', content: trimmed, selection_text: selectionText || null,
          }),
        });
        if (!res.ok) throw new Error('Failed to save message');

        const isFirstMessage = (messagesCacheMapRef.current.get(sessionUid) ?? []).filter(m => m.role === 'user').length === 1;
        if (isFirstMessage) {
          const title = trimmed.length > 60 ? trimmed.slice(0, 57) + '...' : trimmed;
          autoTitleSession(currentSession.uid, title, false);
        }
      } catch {
        toast.error('Failed to save message');
        setIsStreaming(false);
        return;
      }
    }

    // ─── Build messages & call AI ─────────────────────
    try {
      // Resolve AI config — all modes now delegate config resolution to the proxy (avoids double Vercel cold start)
      const config: { baseUrl: string | undefined; apiKey: string | undefined; model: string | undefined; providerCode?: string } =
        { baseUrl: undefined, apiKey: undefined, model: undefined };
      const userId = isGuest ? undefined : auth.user?.id;

      // Build system messages
      const apiMessages: { role: string; content: string }[] = [];

      let systemPrompt = fallbackSystemPrompt;
      if (!isGuest) {
        const userPrompt = await fetchUserSystemPrompt();
        if (userPrompt) systemPrompt = userPrompt;
      }
      apiMessages.push({ role: 'system', content: systemPrompt });
      apiMessages.push({ role: 'system', content: 'Always respond in the same language the user is communicating in.' });

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

      apiMessages.push({ role: 'system', content: buildSchemaFormatOverride() });
      apiMessages.push({ role: 'system', content: buildEntityContextInstruction(entityContext?.entityType) });

      // Previous messages — send ALL cached messages so AI remembers full conversation.
      // Display is paginated (last N) but AI sees everything.
      // temp-* messages (optimistic user) excluded since server hasn't persisted them yet.
      const previousMessages = (messagesCacheMapRef.current.get(sessionUid) ?? []).filter(m => !m.id.toString().startsWith('temp-'));
      for (const msg of previousMessages) {
        if (msg.role === 'system') continue;
        apiMessages.push({ role: msg.role, content: msg.content });
      }

      // User message: context + selection + request
      let apiUserContent = '';

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
            const siblingCtx = await buildSiblingContext(entityContext.entityType, entityContext.entityUid, liveProjectId);
            if (siblingCtx) apiUserContent += `\n${siblingCtx}\n`;
          } catch {}
        }
      }

      // Conversation continuity — brief summary of last exchanges so AI remembers thread
      const convSummary = buildConversationSummary(previousMessages);
      if (convSummary) {
        apiUserContent += `[Previous discussion]:\n${convSummary}\n\n`;
      }

      apiUserContent += `User request: ${trimmed}`;
      apiMessages.push({ role: 'user', content: apiUserContent });

      // Add streaming placeholder
      setMessages(prev => [...prev, {
        id: 'streaming', session_id: currentSession.uid ?? currentSession.id, role: 'assistant', content: '', created_at: new Date().toISOString(),
      } as AIChatMessage]);

      // Call AI
      abortControllerRef.current = new AbortController();
      const accumulatedResponse = await callAiStream(
        config.baseUrl, config.apiKey, config.model, apiMessages, abortControllerRef.current.signal,
        (token: string) => {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.id === 'streaming') return [...prev.slice(0, -1), { ...last, content: last.content + token }];
            return prev;
          });
        },
        userId,
        config.providerCode,
      );

      // Finalize message
      const finalAiMsg: AIChatMessage = {
        id: `ai-${Date.now()}`,
        session_id: currentSession.uid ?? currentSession.id,
        role: 'assistant',
        content: accumulatedResponse,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev.filter(m => m.id !== 'streaming'), finalAiMsg]);
      const finalCache = messagesCacheMapRef.current.get(sessionUid) ?? [];
      messagesCacheMapRef.current.set(sessionUid, [...finalCache, finalAiMsg]);

      // Persist
      if (isGuest) {
        await persistGuestMessages(currentSession.uid, [...previousMessages, tempUserMsg, finalAiMsg]);
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
          }),
        });
        if (!saveAIRes.ok) throw new Error('Failed to save AI response');

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

      if (onStreamCompleteRef.current) onStreamCompleteRef.current(accumulatedResponse);

    } catch (err: any) {
      const errMsg = err.message || 'AI request failed';
      toast.error(errMsg);
      setMessages(prev => prev.filter(m => m.id !== 'streaming'));
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [currentSession, entityContextText, entityContext]);

  const clearMessages = useCallback(() => setMessages([]), []);

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return {
    sessions, currentSession, messages,
    isSessionsLoading, isMessagesLoading, isStreaming,
    listSessions, createSession, selectSession, deleteSession, clearSessions,
    sendMessage, clearMessages, abortStream,
    hasMoreMessages, isLoadingMore, loadMoreMessages,
  };
}

/**
 * Build a compact summary of the last 2-3 exchanges so the AI maintains
 * conversation thread awareness. This is injected as a user-message prefix
 * alongside the entity context for maximum prominence.
 */
function buildConversationSummary(messages: AIChatMessage[]): string | null {
  // Only take last 6 messages (3 user+assistant pairs)
  const recent = messages.slice(-6);
  if (recent.length === 0) return null;

  const pairs: string[] = [];
  // Walk backwards to pair user→assistant exchanges
  for (let i = 0; i < recent.length; i++) {
    if (recent[i].role === 'user') {
      const userText = truncateForSummary(recent[i].content);
      // Check if next message is assistant
      const next = recent[i + 1];
      if (next && next.role === 'assistant') {
        const aiText = truncateForSummary(next.content);
        pairs.push(`User: ${userText}\nAI: ${aiText}`);
        i++; // skip the assistant message
      } else {
        pairs.push(`User: ${userText}`);
      }
    }
  }

  if (pairs.length === 0) return null;
  return pairs.join('\n');
}

function truncateForSummary(text: string, maxLen = 120): string {
  const cleaned = text.replace(/\n+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1) + '…';
}
