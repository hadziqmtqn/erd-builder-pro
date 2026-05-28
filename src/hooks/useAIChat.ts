import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { AIChatSession, AIChatMessage } from '@/types';
import { fetchEntityContext, buildSiblingContext, EntityContext as EntityCtxType } from '@/hooks/aiEntityContext';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { localPersistence } from '@/lib/localPersistence';

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
  projectId?: number | string | null,
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

  const projectIdRef = useRef(projectId);
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);

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

    // Guest mode: load sessions from IndexedDB
    if (isGuestRef.current || sessionStorage.getItem('auth_mode') === 'guest') {
      try {
        const stored = await localPersistence.getAllResources('ai_chat_session');
        const loaded: AIChatSession[] = (stored || [])
          .filter((s: any) => !s.is_deleted)
          .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        setSessions(loaded);
      } catch (err) {
        console.warn('[AI Chat] Failed to load guest sessions:', err);
        setSessions([]);
      }
      setIsSessionsLoading(false);
      return;
    }

    try {
      let query = buildBaseQuery()
        .order('updated_at', { ascending: false });

      // Filter sessions: project-scoped sessions OR file-private sessions (project_id IS NULL)
      if (projectId && entityContext) {
        query = query.or(
          `project_id.eq.${projectId},and(project_id.is.null,entity_type.eq.${entityContext.entityType},entity_uid.eq.${entityContext.entityUid})`
        );
      } else if (projectId) {
        query = query.eq('project_id', projectId);
      } else if (entityContext) {
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
  }, [entityContext?.entityType, entityContext?.entityUid, projectId]);

  const createSession = useCallback(async (): Promise<string | null> => {
    setError(null);

    // Guest mode: create session and persist to IndexedDB
    if (isGuestRef.current || sessionStorage.getItem('auth_mode') === 'guest') {
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
        await localPersistence.saveResource({
          ...newSession,
          messages: [],
          type: 'ai_chat_session',
        });
      } catch (err) {
        console.warn('[AI Chat] Failed to persist guest session:', err);
      }
      setSessions(prev => [newSession, ...prev]);
      setCurrentSession(newSession);
      setMessages([]);
      return sessionUid;
    }

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
      if (projectId) {
        payload.project_id = projectId;
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
  }, [entityContext?.entityType, entityContext?.entityUid, projectId]);

  const selectSession = useCallback(async (sessionUid: string) => {
    setIsMessagesLoading(true);
    setError(null);

    // Guest mode: find in local state, load messages from IndexedDB
    if (isGuestRef.current || sessionStorage.getItem('auth_mode') === 'guest') {
      const session = sessionsRef.current.find(s => s.uid === sessionUid) ?? null;
      if (session) {
        setCurrentSession(session);
        try {
          const stored = await localPersistence.getResource(sessionUid);
          setMessages((stored?.messages as AIChatMessage[]) || []);
        } catch {
          setMessages([]);
        }
      }
      setIsMessagesLoading(false);
      return;
    }

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
    // Guest mode: no Supabase pagination
    if (isGuestRef.current || sessionStorage.getItem('auth_mode') === 'guest') { setIsLoadingMore(false); return; }
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

    // Guest mode: remove from local state and IndexedDB
    if (isGuestRef.current || sessionStorage.getItem('auth_mode') === 'guest') {
      try {
        await localPersistence.deleteResource(sessionUid);
      } catch (err) {
        console.warn('[AI Chat] Failed to delete guest session:', err);
      }
      setSessions(prev => prev.filter(s => s.uid !== sessionUid));
      if (currentSession?.uid === sessionUid) {
        setCurrentSession(null);
        setMessages([]);
      }
      return;
    }

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

    const isGuest = isGuestRef.current || sessionStorage.getItem('auth_mode') === 'guest';

    // Guest mode: persist user message to IndexedDB immediately + auto-title
    if (isGuest) {
      const msgsAfterUser = [...messages, tempUserMsg];
      persistGuestMessages(currentSession.uid, msgsAfterUser).catch(() => {});

      const isFirstMessage = messages.filter(m => m.role === 'user').length === 0;
      if (isFirstMessage) {
        const title = trimmed.length > 60 ? trimmed.slice(0, 57) + '...' : trimmed;
        setCurrentSession(prev => prev ? { ...prev, title } : prev);
        setSessions(prev => prev.map(s =>
          s.id === currentSession.id ? { ...s, title } : s
        ));
        // Persist title update to IndexedDB
        persistGuestTitle(currentSession.uid, title).catch(() => {});
      }
    }

    // Save user message to DB (skip for Guest mode — no Supabase)
    if (!isGuest) {
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
    }

    // ─── Build messages & call AI ──────────────────────
    try {
      // Resolve AI config:
      //   - Guest mode: pass nothing — server will look up default config
      //   - Online mode: fetch user's config from Supabase
      let resolvedBaseUrl: string | undefined;
      let resolvedApiKey: string | undefined;
      let resolvedModel: string | undefined;

      if (!isGuest) {
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
        resolvedBaseUrl = provider?.base_url || 'https://api.openai.com/v1';
        resolvedApiKey = config.api_key;

        const { data: modelData } = await supabase
          .from('ai_models')
          .select('model_identifier')
          .eq('id', config.selected_model_id)
          .single();

        resolvedModel = modelData?.model_identifier || 'gpt-4o-mini';
      }

      // Build messages array
      const apiMessages: { role: string; content: string }[] = [];

      const fallbackSystemPrompt = `You are an AI assistant for ERD Builder Pro — an integrated workspace combining Database ERD diagrams, Flowcharts, and Markdown Notes. Follow these guidelines strictly:

1. Be concise. Use the shortest answer that fully addresses the question. No greetings, farewells, or small talk.
2. Database & ERD Generation:
   - When asked to "create ERD", "generate SQL DDL", "create database schema", "generate SQL", or similar, ALWAYS output standard SQL DDL statements (like CREATE TABLE, ALTER TABLE) enclosed in a single \`\`\`sql code block.
   - Do NOT output HTML or Markdown tables for database schemas.
   - Advise the user to click the "Append" (or "Replace") button to apply the SQL to their diagram.
3. Flowchart Generation:
   - When asked to "create flowchart", "generate flowchart", "design logic flow", or similar, ALWAYS output a JSON code block in this format:
     \`\`\`json
     {
       "nodes": [
         { "label": "Start", "shape": "oval", "color": "#10b981" },
         { "label": "Process Name", "shape": "rectangle", "color": "#8b5cf6" },
         { "label": "Decision?", "shape": "diamond", "color": "#f59e0b" },
         { "label": "End", "shape": "oval", "color": "#10b981" }
       ],
       "edges": [
         { "sourceLabel": "Start", "targetLabel": "Process Name" },
         { "sourceLabel": "Process Name", "targetLabel": "Decision?" },
         { "sourceLabel": "Decision?", "targetLabel": "End", "label": "Yes" }
       ]
     }
     \`\`\`
   - Shapes: "oval", "rectangle", "diamond", "parallelogram", "database", "document", "cloud", "circle".
    - Colors: Emerald (#10b981), Violet (#8b5cf6), Amber (#f59e0b), Rose (#f43f5e), Sky (#0ea5e9).
    - Advise the user to click the Flowchart button (Create/Update) below the message to apply it. Do NOT tell users to click "Append" or "Replace" for flowchart JSON.
 4. Notes:
    - Preserve or output content in rich GitHub-Flavored Markdown.
 5. Integration:
   - Sibling files/context (ERD schema, flowcharts, notes) are linked. If the user references a sibling file (via @FileName), use its details to write consistent schemas, documentation, or business logic.
6. Never repeat user questions. Prefer bullet points for lists (max 5).`;

      let systemPrompt = fallbackSystemPrompt;

      // System prompt (only for Online mode — Guest mode skips since no Supabase access)
      if (!isGuest) {
        try {
          const { data: promptData } = await supabase
            .from('ai_system_prompts')
            .select('content')
            .eq('is_default', true)
            .limit(1);

          if (promptData && promptData.length > 0) {
            systemPrompt = promptData[0].content;
          }
        } catch (err) {
          console.warn('[AI Chat] Failed to fetch system prompt from DB:', err);
        }
      }

      apiMessages.push({ role: 'system', content: systemPrompt });

      // Language instruction: respond in user's language
      apiMessages.push({
        role: 'system',
        content: 'Always respond in the same language the user is communicating in.',
      });

      // Feature integration and technical formatting instructions
      apiMessages.push({
        role: 'system',
        content: `TECHNICAL CAPABILITIES & INTEGRATION RULES:
This workspace integrates Database ERD Diagrams, Flowcharts, and Markdown Notes. Use these rules to generate compatible outputs:

1. Database / ERD Generation:
   - When asked to "create ERD", "generate SQL DDL", "create database schema", "generate SQL", or similar, ALWAYS output clean SQL DDL statements (like CREATE TABLE, ALTER TABLE for foreign keys) inside a single \`\`\`sql ... \`\`\` code block.
    - DO NOT output HTML tables, markdown tables, or plain lists for database schemas unless explicitly requested.
    - Advise the user to click the Database button (or the Create/Update ERD button) below the message to apply the SQL to their diagram. Do NOT tell users to click "Append" or "Replace" for SQL content — those buttons handle Notes content, not ERD.

2. Flowchart Generation:
   - When asked to "create flowchart", "generate flowchart", "design logic flow", or similar, ALWAYS output a JSON code block in this format:
     \`\`\`json
     {
       "nodes": [
         { "label": "Start", "shape": "oval", "color": "#10b981" },
         { "label": "Process Name", "shape": "rectangle", "color": "#8b5cf6" },
         { "label": "Decision?", "shape": "diamond", "color": "#f59e0b" },
         { "label": "End", "shape": "oval", "color": "#10b981" }
       ],
       "edges": [
         { "sourceLabel": "Start", "targetLabel": "Process Name" },
         { "sourceLabel": "Process Name", "targetLabel": "Decision?" },
         { "sourceLabel": "Decision?", "targetLabel": "End", "label": "Yes" }
       ]
     }
     \`\`\`
   - Shapes allowed: "oval", "rectangle", "diamond", "parallelogram", "database", "document", "cloud", "circle".
    - Colors: Emerald (#10b981), Violet (#8b5cf6), Amber (#f59e0b), Rose (#f43f5e), Sky (#0ea5e9).
    - Advise the user to click the Flowchart button (Create/Update) below the message to apply it. Do NOT tell users to click "Append" or "Replace" for flowchart JSON.

3. Notes & Rich Text:
   - Output rich text content using GitHub-Flavored Markdown.

4. Feature Integration:
   - Sibling files/context (ERD schema, flowcharts, notes) are linked. If the user references a sibling file (via @FileName), use its details to write consistent schemas, documentation, or business logic.`,
      });

      // Previous messages from this session (exclude temp)
      const previousMessages = messages.filter(m => !m.id.toString().startsWith('temp-'));
      for (const msg of previousMessages) {
        if (msg.role === 'system') continue;
        apiMessages.push({ role: msg.role, content: msg.content });
      }

      // Build user message: context as prefix + selection + question
      let apiUserContent = '';

      if (entityContextText) {
        apiUserContent += `${entityContextText}\n\n`;
        console.log('[AI Context] Using pre-built context text (from workspace)');
      } else if (entityContext && !isGuest) {
        // Only fetch from Supabase in Online mode
        try {
          const ctxResult = await fetchEntityContext(entityContext);
          if (ctxResult) {
            apiUserContent += `${ctxResult.contextText}\n\n`;
            console.log('[AI Context] Injected:', ctxResult.contextText.slice(0, 200));
          }
        } catch (err) {
          console.warn('[AI Context] Failed to fetch entity context:', err);
        }
      }

      if (selectionText) {
        apiUserContent += `[Selected text: "${selectionText}"]\n`;
      }

      // Skip project_id sync & sibling context in Guest mode (no Supabase)
      if (!isGuest) {
        const liveProjectId = projectIdRef.current ?? null;
        const oldSessionProjectId = currentSession?.project_id || null;
        if (liveProjectId !== oldSessionProjectId) {
          const updatePayload: Record<string, any> = { updated_at: new Date().toISOString(), project_id: liveProjectId };
          const { error: updateProjectError } = await supabase
            .from('ai_chat_sessions')
            .update(updatePayload)
            .eq('id', currentSession.id);

          if (!updateProjectError) {
            const updatedSession = { ...currentSession, ...updatePayload } as AIChatSession;
            setCurrentSession(updatedSession);
            setSessions(prev => prev.map(s =>
              s.id === currentSession.id ? updatedSession : s
            ));
          }
        }

        if (liveProjectId && entityContext) {
          try {
            const siblingCtx = await buildSiblingContext(
              entityContext.entityType,
              entityContext.entityUid,
              liveProjectId,
            );
            if (siblingCtx) {
              apiUserContent += `\n${siblingCtx}\n`;
            }
          } catch (err) {
            console.warn('[AI Context] Failed to fetch sibling context:', err);
          }
        }
      }

      apiUserContent += `User request: ${trimmed}`;
      apiMessages.push({ role: 'user', content: apiUserContent });

      // Call AI API with streaming
      abortControllerRef.current = new AbortController();
      const accumulatedResponse = await callAIStream(
        resolvedBaseUrl,
        resolvedApiKey,
        resolvedModel,
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

      // Add final message in state
      const finalAiMsg: AIChatMessage = {
        id: `ai-${Date.now()}`,
        session_id: currentSession.id,
        role: 'assistant',
        content: accumulatedResponse,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== 'streaming');
        return [...filtered, finalAiMsg];
      });

      // Guest mode: persist AI response to IndexedDB + update session
      if (isGuest) {
        const finalMessages = [...previousMessages, tempUserMsg, finalAiMsg];
        await persistGuestMessages(currentSession.uid, finalMessages);

        // Also update session's updated_at
        setSessions(prev => {
          const updated = prev.map(s =>
            s.uid === currentSession.uid ? { ...s, updated_at: new Date().toISOString() } : s
          );
          updated.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          return updated;
        });
      }

      // Notify caller that streaming completed (for auto-apply to content)
      if (onStreamCompleteRef.current) {
        onStreamCompleteRef.current(accumulatedResponse);
      }

      // Post-AI persistence (skip for Guest mode)
      if (!isGuest) {
        const { error: saveAIError } = await supabase
          .from('ai_chat_messages')
          .insert([{
            session_id: currentSession.id,
            role: 'assistant',
            content: accumulatedResponse,
          }]);

        if (saveAIError) throw saveAIError;

        await supabase
          .from('ai_chat_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', currentSession.id);

        setSessions(prev => {
          const updated = prev.map(s =>
            s.id === currentSession.id ? { ...s, updated_at: new Date().toISOString() } : s
          );
          updated.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          return updated;
        });
      }

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

  // ─── AI API Call (via server-side proxy) ────────────

  async function persistGuestMessages(sessionUid: string, msgs: AIChatMessage[]) {
    try {
      const stored = await localPersistence.getResource(sessionUid);
      if (stored) {
        stored.messages = msgs;
        await localPersistence.saveResource(stored);
      }
    } catch (err) {
      console.warn('[AI Chat] Failed to persist guest messages:', err);
    }
  }

  async function persistGuestTitle(sessionUid: string, title: string) {
    try {
      const stored = await localPersistence.getResource(sessionUid);
      if (stored) {
        stored.title = title;
        stored.updated_at = new Date().toISOString();
        await localPersistence.saveResource(stored);
      }
    } catch (err) {
      console.warn('[AI Chat] Failed to persist guest title:', err);
    }
  }

  async function callAIStream(
    baseUrl: string | undefined,
    apiKey: string | undefined,
    model: string | undefined,
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

    const response = await apiFetch('/api/ai/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        model,
        apiKey,
        baseUrl,
      }),
      signal,
    });

    if (!response.ok) {
      let errMsg = `AI request failed (${response.status})`;
      try {
        const errBody = await response.json();
        errMsg = errBody.details || errBody.error || errMsg;
      } catch {}
      throw new Error(errMsg);
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
