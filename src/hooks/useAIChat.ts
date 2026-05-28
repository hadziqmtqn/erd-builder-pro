import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { AIChatSession, AIChatMessage } from '@/types';
import { fetchEntityContext, buildSiblingContext, EntityContext as EntityCtxType } from '@/hooks/aiEntityContext';
import { toast } from 'sonner';
import { localPersistence } from '@/lib/localPersistence';
import {
  fallbackSystemPrompt,
  buildTechnicalRules,
  fetchUserSystemPrompt,
  resolveAiConfig,
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

  const abortControllerRef = useRef<AbortController | null>(null);
  const sessionsRef = useRef<AIChatSession[]>(sessions);
  sessionsRef.current = sessions;

  // Stable refs (break dependency chains)
  const userRef = useRef(auth.user);
  const isGuestRef = useRef(auth.isGuest);
  useEffect(() => { userRef.current = auth.user; }, [auth.user]);
  useEffect(() => { isGuestRef.current = auth.isGuest; }, [auth.isGuest]);

  const onStreamCompleteRef = useRef<((response: string) => void) | undefined>(undefined);
  useEffect(() => { onStreamCompleteRef.current = onStreamComplete; }, [onStreamComplete]);

  const projectIdRef = useRef(projectId);
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);

  const getUserId = (): string | null => {
    const u = userRef.current;
    if (!u || isGuestRef.current) return null;
    return u.id;
  };

  const isGuestCheck = (): boolean =>
    isGuestRef.current || sessionStorage.getItem('auth_mode') === 'guest';

  const buildBaseQuery = () => {
    let query = supabase.from('ai_chat_sessions').select('*');
    const uid = getUserId();
    if (uid) query = query.eq('user_id', uid);
    return query;
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
      let query = buildBaseQuery().order('updated_at', { ascending: false });

      if (projectId && entityContext) {
        query = query.or(
          `project_id.eq.${projectId},and(project_id.is.null,entity_type.eq.${entityContext.entityType},entity_uid.eq.${entityContext.entityUid})`
        );
      } else if (projectId) {
        query = query.eq('project_id', projectId);
      } else if (entityContext) {
        query = query.eq('entity_type', entityContext.entityType).eq('entity_uid', entityContext.entityUid);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setSessions(data || []);
    } catch (err: any) {
      toast.error('Failed to load chat sessions');
    } finally {
      setIsSessionsLoading(false);
    }
  }, [entityContext?.entityType, entityContext?.entityUid, projectId]);

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
      const uid = getUserId();
      if (uid) payload.user_id = uid;
      if (entityContext) { payload.entity_type = entityContext.entityType; payload.entity_uid = entityContext.entityUid; }
      if (projectId) payload.project_id = projectId;

      const { data, error } = await supabase.from('ai_chat_sessions').insert([payload]).select().single();
      if (error) throw error;

      const newSession = data as AIChatSession;
      setSessions(prev => [newSession, ...prev]);
      setCurrentSession(newSession);
      setMessages([]);
      return newSession.uid;
    } catch (err: any) {
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
          setMessages((stored?.messages as AIChatMessage[]) || []);
        } catch { setMessages([]); }
      }
      setIsMessagesLoading(false);
      return;
    }

    try {
      let session: AIChatSession | null = sessionsRef.current.find(s => s.uid === sessionUid) ?? null;
      if (!session) {
        const { data, error } = await supabase.from('ai_chat_sessions').select('*').eq('uid', sessionUid).single();
        if (error) throw error;
        session = data;
      }
      if (!session) throw new Error('Session not found');

      setCurrentSession(session);
      messageOffsetRef.current = 0;

      const { data, error: msgError, count } = await supabase
        .from('ai_chat_messages')
        .select('*', { count: 'exact', head: false })
        .eq('session_id', session.id)
        .order('created_at', { ascending: false })
        .range(0, PAGE_SIZE - 1);

      if (msgError) throw msgError;

      const loadedMessages: AIChatMessage[] = (data || []).reverse().map(m => ({ ...m, selection_text: m.selection_text ?? null }));
      setMessages(loadedMessages);
      messageOffsetRef.current = loadedMessages.length;
      setHasMoreMessages((count || 0) > loadedMessages.length);
    } catch (err: any) {
      toast.error('Failed to load messages');
    } finally {
      setIsMessagesLoading(false);
    }
  }, []);

  const loadMoreMessages = useCallback(async () => {
    if (!currentSession || isLoadingMore || !hasMoreMessages) return;
    if (isGuestCheck()) { setIsLoadingMore(false); return; }
    setIsLoadingMore(true);

    try {
      const offset = messageOffsetRef.current;
      const { data, error } = await supabase
        .from('ai_chat_messages')
        .select('*')
        .eq('session_id', currentSession.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        const olderMessages: AIChatMessage[] = data.reverse().map(m => ({ ...m, selection_text: m.selection_text ?? null }));
        setMessages(prev => [...olderMessages, ...prev]);
        messageOffsetRef.current = offset + olderMessages.length;
        setHasMoreMessages(data.length >= PAGE_SIZE);
      } else {
        setHasMoreMessages(false);
      }
    } catch {
      toast.error('Failed to load more messages');
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentSession, isLoadingMore, hasMoreMessages]);

  const deleteSession = useCallback(async (sessionUid: string) => {
    if (isGuestCheck()) {
      try { await localPersistence.deleteResource(sessionUid); } catch {}
      setSessions(prev => prev.filter(s => s.uid !== sessionUid));
      if (currentSession?.uid === sessionUid) { setCurrentSession(null); setMessages([]); }
      return;
    }

    try {
      const { error } = await supabase.from('ai_chat_sessions').delete().eq('uid', sessionUid);
      if (error) throw error;
      setSessions(prev => prev.filter(s => s.uid !== sessionUid));
      if (currentSession?.uid === sessionUid) { setCurrentSession(null); setMessages([]); }
    } catch {
      toast.error('Failed to delete session');
    }
  }, [currentSession]);

  const clearSessions = useCallback(() => {
    setSessions([]);
    setCurrentSession(null);
    setMessages([]);
  }, []);

  useEffect(() => { listSessions(); }, [listSessions]);

  // ─── Messaging (Auto-title) ──────────────────────────

  const autoTitleSession = useCallback(async (sessionId: string | number, title: string, isGuest: boolean) => {
    setCurrentSession(prev => prev ? { ...prev, title } : prev);
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s));

    if (isGuest) {
      await persistGuestTitle(sessionId as string, title);
    } else {
      await supabase.from('ai_chat_sessions').update({ title, updated_at: new Date().toISOString() }).eq('id', sessionId);
    }
  }, []);

  // ─── Messaging (Send) ────────────────────────────────

  const sendMessage = useCallback(async (content: string, selectionText?: string | null) => {
    if (!currentSession || !content.trim()) return;

    const trimmed = content.trim();
    const isGuest = isGuestCheck();

    setIsStreaming(true);

    // Optimistic user message
    const tempUserMsg: AIChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: currentSession.id,
      role: 'user',
      content: trimmed,
      selection_text: selectionText || null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    // Guest mode: persist user message immediately + auto-title
    if (isGuest) {
      persistGuestMessages(currentSession.uid, [...messages, tempUserMsg]);
      const isFirstMessage = messages.filter(m => m.role === 'user').length === 0;
      if (isFirstMessage) {
        const title = trimmed.length > 60 ? trimmed.slice(0, 57) + '...' : trimmed;
        autoTitleSession(currentSession.id, title, true);
      }
    }

    // Online mode: save user message to DB + auto-title
    if (!isGuest) {
      try {
        const { error } = await supabase.from('ai_chat_messages').insert([{
          session_id: currentSession.id, role: 'user', content: trimmed, selection_text: selectionText || null,
        }]);
        if (error) throw error;

        const isFirstMessage = messages.filter(m => m.role === 'user').length === 0;
        if (isFirstMessage) {
          const title = trimmed.length > 60 ? trimmed.slice(0, 57) + '...' : trimmed;
          autoTitleSession(currentSession.id, title, false);
        }
      } catch {
        toast.error('Failed to save message');
        setIsStreaming(false);
        return;
      }
    }

    // ─── Build messages & call AI ─────────────────────
    try {
      // Resolve AI config
      const config: { baseUrl: string | undefined; apiKey: string | undefined; model: string | undefined } =
        isGuest ? { baseUrl: undefined, apiKey: undefined, model: undefined } : await resolveAiConfig(getUserId());

      // Build system messages
      const apiMessages: { role: string; content: string }[] = [];

      let systemPrompt = fallbackSystemPrompt;
      if (!isGuest) {
        const userPrompt = await fetchUserSystemPrompt();
        if (userPrompt) systemPrompt = userPrompt;
      }
      apiMessages.push({ role: 'system', content: systemPrompt });
      apiMessages.push({ role: 'system', content: 'Always respond in the same language the user is communicating in.' });
      apiMessages.push({ role: 'system', content: buildTechnicalRules() });

      // Previous messages
      const previousMessages = messages.filter(m => !m.id.toString().startsWith('temp-'));
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

      apiUserContent += `User request: ${trimmed}`;
      apiMessages.push({ role: 'user', content: apiUserContent });

      // Add streaming placeholder
      setMessages(prev => [...prev, {
        id: 'streaming', session_id: currentSession.id, role: 'assistant', content: '', created_at: new Date().toISOString(),
      } as AIChatMessage]);

      // Call AI
      abortControllerRef.current = new AbortController();
      const accumulatedResponse = await callAiStream(
        config.baseUrl, config.apiKey, config.model, apiMessages, abortControllerRef.current.signal,
        (token) => {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.id === 'streaming') return [...prev.slice(0, -1), { ...last, content: last.content + token }];
            return prev;
          });
        }
      );

      // Finalize message
      const finalAiMsg: AIChatMessage = {
        id: `ai-${Date.now()}`,
        session_id: currentSession.id,
        role: 'assistant',
        content: accumulatedResponse,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev.filter(m => m.id !== 'streaming'), finalAiMsg]);

      // Persist
      if (isGuest) {
        await persistGuestMessages(currentSession.uid, [...previousMessages, tempUserMsg, finalAiMsg]);
        setSessions(prev => {
          const updated = prev.map(s => s.uid === currentSession.uid ? { ...s, updated_at: new Date().toISOString() } : s);
          updated.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          return updated;
        });
      } else {
        const { error: saveAIError } = await supabase.from('ai_chat_messages').insert([{
          session_id: currentSession.id, role: 'assistant', content: accumulatedResponse,
        }]);
        if (saveAIError) throw saveAIError;

        await supabase.from('ai_chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', currentSession.id);
        setSessions(prev => {
          const updated = prev.map(s => s.id === currentSession.id ? { ...s, updated_at: new Date().toISOString() } : s);
          updated.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          return updated;
        });
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
  }, [currentSession, messages, entityContextText, entityContext]);

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
