import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { AIChatSession, AIChatMessage } from '@/types';
import { fetchEntityContext, EntityContext as EntityCtxType } from '@/hooks/aiEntityContext';
import { toast } from 'sonner';

export type EntityContext = EntityCtxType;

interface UseAIChatReturn {
  sessions: AIChatSession[];
  currentSession: AIChatSession | null;
  messages: AIChatMessage[];
  isSessionsLoading: boolean;
  isMessagesLoading: boolean;
  isStreaming: boolean;
  error: string | null;

  // Session management
  listSessions: () => Promise<void>;
  createSession: () => Promise<string | null>;
  selectSession: (sessionUid: string) => Promise<void>;
  deleteSession: (sessionUid: string) => Promise<void>;
  clearSessions: () => void;

  // Messaging
  sendMessage: (content: string, selectionText?: string | null) => Promise<void>;
  clearMessages: () => void;

  // Streaming
  abortStream: () => void;

  // Lazy loading
  hasMoreMessages: boolean;
  isLoadingMore: boolean;
  loadMoreMessages: () => Promise<void>;
}

const PAGE_SIZE = 30;

export function useAIChat(
  entityContext?: EntityContext | null,
  entityContextText?: string | null,
  onStreamComplete?: (response: string) => void,
): UseAIChatReturn {
  const auth = useAuth();
  const [sessions, setSessions] = useState<AIChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<AIChatSession | null>(null);
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const messageOffsetRef = useRef(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const sessionsRef = useRef<AIChatSession[]>(sessions);
  sessionsRef.current = sessions;

  // ─── Stable refs (break dependency chains) ──
  const userRef = useRef(auth.user);
  const isGuestRef = useRef(auth.isGuest);
  useEffect(() => { userRef.current = auth.user; }, [auth.user]);
  useEffect(() => { isGuestRef.current = auth.isGuest; }, [auth.isGuest]);

  const onStreamCompleteRef = useRef<((response: string) => void) | undefined>(undefined);
  useEffect(() => { onStreamCompleteRef.current = onStreamComplete; }, [onStreamComplete]);

  // Stable helper that reads from refs — no callback deps
  const getUserId = (): string | null => {
    const u = userRef.current;
    if (!u) return null;
    if (isGuestRef.current) return null;
    return u.id;
  };

  const buildBaseQuery = () => {
    let query = supabase.from('ai_chat_sessions').select('*');
    const uid = getUserId();
    if (uid) query = query.eq('user_id', uid);
    return query;
  };

  // ─── Session Management ───────────────────────────────

  const listSessions = useCallback(async () => {
    setIsSessionsLoading(true);
    setError(null);

    try {
      let query = buildBaseQuery()
        .order('updated_at', { ascending: false });

      // Filter by entity context
      if (entityContext) {
        query = query
          .eq('entity_type', entityContext.entityType)
          .eq('entity_uid', entityContext.entityUid);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setSessions(data || []);
    } catch (err: any) {
      setError(err.message);
      toast.error('Failed to load chat sessions');
    } finally {
      setIsSessionsLoading(false);
    }
  }, [entityContext?.entityType, entityContext?.entityUid]);

  const createSession = useCallback(async (): Promise<string | null> => {
    setError(null);

    try {
      const payload: any = {
        title: 'New Conversation',
      };
      const uid = getUserId();
      if (uid) payload.user_id = uid;
      if (entityContext) {
        payload.entity_type = entityContext.entityType;
        payload.entity_uid = entityContext.entityUid;
      }

      const { data, error: insertError } = await supabase
        .from('ai_chat_sessions')
        .insert([payload])
        .select()
        .single();

      if (insertError) throw insertError;

      const newSession = data as AIChatSession;
      setSessions(prev => [newSession, ...prev]);
      setCurrentSession(newSession);
      setMessages([]);

      return newSession.uid;
    } catch (err: any) {
      setError(err.message);
      toast.error('Failed to create chat session');
      return null;
    }
  }, [entityContext?.entityType, entityContext?.entityUid]);

  const selectSession = useCallback(async (sessionUid: string) => {
    setIsMessagesLoading(true);
    setError(null);

    try {
      // Find session from existing list or fetch fresh
      let session: AIChatSession | null = sessionsRef.current.find(s => s.uid === sessionUid) ?? null;
      if (!session) {
        const { data, error: fetchError } = await supabase
          .from('ai_chat_sessions')
          .select('*')
          .eq('uid', sessionUid)
          .single();

        if (fetchError) throw fetchError;
        session = data;
      }

      if (!session) throw new Error('Session not found');

      setCurrentSession(session);
      messageOffsetRef.current = 0;

      // Fetch messages with pagination (newest first, then reverse for display)
      const { data, error: msgError, count } = await supabase
        .from('ai_chat_messages')
        .select('*', { count: 'exact', head: false })
        .eq('session_id', session.id)
        .order('created_at', { ascending: false })
        .range(0, PAGE_SIZE - 1);

      if (msgError) throw msgError;

      const loadedMessages: AIChatMessage[] = (data || []).reverse().map(m => ({
        ...m,
        selection_text: m.selection_text ?? null,
      }));
      setMessages(loadedMessages);
      messageOffsetRef.current = loadedMessages.length;
      setHasMoreMessages((count || 0) > loadedMessages.length);
    } catch (err: any) {
      setError(err.message);
      toast.error('Failed to load messages');
    } finally {
      setIsMessagesLoading(false);
    }
  }, []);

  const loadMoreMessages = useCallback(async () => {
    if (!currentSession || isLoadingMore || !hasMoreMessages) return;
    setIsLoadingMore(true);

    try {
      const offset = messageOffsetRef.current;
      const { data, error: msgError } = await supabase
        .from('ai_chat_messages')
        .select('*')
        .eq('session_id', currentSession.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (msgError) throw msgError;

      if (data && data.length > 0) {
        const olderMessages: AIChatMessage[] = data.reverse().map(m => ({
          ...m,
          selection_text: m.selection_text ?? null,
        }));
        setMessages(prev => [...olderMessages, ...prev]);
        messageOffsetRef.current = offset + olderMessages.length;
        setHasMoreMessages(data.length >= PAGE_SIZE);
      } else {
        setHasMoreMessages(false);
      }
    } catch (err: any) {
      toast.error('Failed to load more messages');
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentSession, isLoadingMore, hasMoreMessages]);

  const deleteSession = useCallback(async (sessionUid: string) => {
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('ai_chat_sessions')
        .delete()
        .eq('uid', sessionUid);

      if (deleteError) throw deleteError;

      setSessions(prev => prev.filter(s => s.uid !== sessionUid));

      if (currentSession?.uid === sessionUid) {
        setCurrentSession(null);
        setMessages([]);
      }
    } catch (err: any) {
      setError(err.message);
      toast.error('Failed to delete session');
    }
  }, [currentSession]);

  const clearSessions = useCallback(() => {
    setSessions([]);
    setCurrentSession(null);
    setMessages([]);
  }, []);

  // ─── Auto-refresh sessions when entity changes ──────
  useEffect(() => {
    listSessions();
  }, [listSessions]);

  // ─── Messaging ────────────────────────────────────────

  const sendMessage = useCallback(async (content: string, selectionText?: string | null) => {
    if (!currentSession || !content.trim()) return;

    const trimmed = content.trim();
    setIsStreaming(true);
    setError(null);

    // Optimistic: add user message
    const tempUserMsg: AIChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: currentSession.id,
      role: 'user',
      content: trimmed,
      selection_text: selectionText || null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    // Save user message to DB
    try {
      const dbPayload: any = {
        session_id: currentSession.id,
        role: 'user',
        content: trimmed,
        selection_text: selectionText || null,
      };
      const { error: saveUserError } = await supabase
        .from('ai_chat_messages')
        .insert([dbPayload]);

      if (saveUserError) throw saveUserError;

      // Auto-title session from first user message
      const isFirstMessage = messages.filter(m => m.role === 'user').length === 0;
      if (isFirstMessage) {
        const title = trimmed.length > 60 ? trimmed.slice(0, 57) + '...' : trimmed;
        await supabase
          .from('ai_chat_sessions')
          .update({ title, updated_at: new Date().toISOString() })
          .eq('id', currentSession.id);

        setCurrentSession(prev => prev ? { ...prev, title } : prev);
        setSessions(prev => prev.map(s =>
          s.id === currentSession.id ? { ...s, title } : s
        ));
      }
    } catch (err: any) {
      setError('Failed to save message');
      toast.error('Failed to save message');
      setIsStreaming(false);
      return;
    }

    // ─── Fetch active config & call AI ────────────────
    try {
      // 1. Get user's active provider config
      let configQuery = supabase
        .from('user_ai_configs')
        .select('*, ai_providers(*)')
        .eq('is_enabled', true)
        .not('selected_model_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1);

      const uid = getUserId();
      if (uid) {
        configQuery = configQuery.eq('user_id', uid);
      }

      const { data: configData, error: configError } = await configQuery;

      if (configError) throw configError;
      if (!configData || configData.length === 0) {
        throw new Error('No AI provider configured. Go to Settings > AI to configure.');
      }

      const config = configData[0];
      const provider = config.ai_providers;
      const baseUrl = provider?.base_url || 'https://api.openai.com/v1';
      const apiKey = config.api_key;

      // 2. Get selected model identifier
      const { data: modelData } = await supabase
        .from('ai_models')
        .select('model_identifier')
        .eq('id', config.selected_model_id)
        .single();

      const modelId = modelData?.model_identifier || 'gpt-4o-mini';

      // 3. Get active system prompt
      const { data: promptData } = await supabase
        .from('ai_system_prompts')
        .select('content')
        .eq('is_default', true)
        .limit(1);

      // 4. Build messages array
      const apiMessages: { role: string; content: string }[] = [];

      // System prompt first
      if (promptData && promptData.length > 0) {
        apiMessages.push({ role: 'system', content: promptData[0].content });
      }

     // Inject entity context so AI knows what file the user is on
     // Priority: pre-built context text > fetch from Supabase
     if (entityContextText) {
        apiMessages.push({
          role: 'system',
          content: entityContextText,
        });
        console.log('[AI Context] Using pre-built context text (from workspace)');
      } else if (entityContext) {
        try {
          const ctxResult = await fetchEntityContext(entityContext);
          if (ctxResult) {
            apiMessages.push({
              role: 'system',
              content: ctxResult.contextText,
            });
            console.log('[AI Context] Injected:', ctxResult.contextText.slice(0, 200));
          } else {
            console.warn('[AI Context] fetchEntityContext returned null for:', entityContext);
          }
        } catch (err) {
          // Graceful fallback: if context fetch fails, skip it
          console.warn('[AI Context] Failed to fetch entity context:', err);
        }
      }

      // Language instruction: respond in user's language
      apiMessages.push({
        role: 'system',
        content: 'Always respond in the same language the user is communicating in.',
      });

      // Previous messages from this session (exclude temp)
      const previousMessages = messages.filter(m => !m.id.toString().startsWith('temp-'));
      for (const msg of previousMessages) {
        if (msg.role === 'system') continue;
        apiMessages.push({ role: msg.role, content: msg.content });
      }

      // Current user message (with selection context injected inline)
      const apiUserContent = selectionText
        ? `[Selected text: "${selectionText}"]\nUser request: ${trimmed}`
        : trimmed;
      apiMessages.push({ role: 'user', content: apiUserContent });

      // 5. Call AI API with streaming
      abortControllerRef.current = new AbortController();
      const accumulatedResponse = await callAIStream(
        baseUrl,
        apiKey,
        modelId,
        apiMessages,
        abortControllerRef.current.signal,
        (token) => {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.id === 'streaming') {
              return [...prev.slice(0, -1), { ...last, content: last.content + token }];
            }
            return prev;
          });
        }
      );

      // 6. Save full response to DB
      const { error: saveAIError } = await supabase
        .from('ai_chat_messages')
        .insert([{
          session_id: currentSession.id,
          role: 'assistant',
          content: accumulatedResponse,
        }]);

      if (saveAIError) throw saveAIError;

      // 7. Add final message in state
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== 'streaming');
        return [...filtered, {
          id: `ai-${Date.now()}`,
          session_id: currentSession.id,
          role: 'assistant',
          content: accumulatedResponse,
          created_at: new Date().toISOString(),
        }];
      });

      // 8. Notify caller that streaming completed (for auto-apply to content)
      if (onStreamCompleteRef.current) {
        onStreamCompleteRef.current(accumulatedResponse);
      }

      // Update session updated_at
      await supabase
        .from('ai_chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', currentSession.id);

      // Update sessions list order
      setSessions(prev => {
        const updated = prev.map(s =>
          s.id === currentSession.id ? { ...s, updated_at: new Date().toISOString() } : s
        );
        updated.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        return updated;
      });

    } catch (err: any) {
      const errMsg = err.message || 'AI request failed';
      setError(errMsg);
      toast.error(errMsg);

      // Remove temp streaming message
      setMessages(prev => prev.filter(m => m.id !== 'streaming'));
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [currentSession, messages, entityContextText, entityContext]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // ─── Streaming Control ───────────────────────────────

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // ─── AI API Call (OpenAI-compatible) ─────────────────

  async function callAIStream(
    baseUrl: string,
    apiKey: string,
    model: string,
    messages: { role: string; content: string }[],
    signal: AbortSignal,
    onToken: (token: string) => void,
  ): Promise<string> {
    setMessages(prev => [...prev, {
      id: 'streaming',
      session_id: currentSession?.id ?? 0,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    }]);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Connection to AI API failed (${response.status}).\n\nProvider URL: ${baseUrl}\nModel: ${model}\n\nPlease check your API key and URL in Settings > AI Config.\n\nDetails: ${errBody || response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content || '';
            if (token) {
              accumulated += token;
              onToken(token);
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return accumulated;
      }
      throw err;
    }

    return accumulated;
  }

  // ─── Return ──────────────────────────────────────────

  return {
    sessions,
    currentSession,
    messages,
    isSessionsLoading,
    isMessagesLoading,
    isStreaming,
    error,

    listSessions,
    createSession,
    selectSession,
    deleteSession,
    clearSessions,

    sendMessage,
    clearMessages,

    abortStream,

    hasMoreMessages,
    isLoadingMore,
    loadMoreMessages,
  };
}
