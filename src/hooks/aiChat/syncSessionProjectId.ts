import { supabase } from '@/lib/supabase';
import { AIChatSession } from '@/types';

export async function syncSessionProjectId(
  session: AIChatSession,
  liveProjectId: string | number | null,
  setCurrentSession: (s: AIChatSession) => void,
  setSessions: (fn: (prev: AIChatSession[]) => AIChatSession[]) => void,
) {
  const oldProjectId = session?.project_id || null;
  if (liveProjectId === oldProjectId || liveProjectId === undefined) return;

  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
    project_id: liveProjectId,
  };

  const { error } = await supabase
    .from('ai_chat_sessions')
    .update(updatePayload)
    .eq('id', session.id);

  if (!error) {
    const updatedSession = { ...session, ...updatePayload } as AIChatSession;
    setCurrentSession(updatedSession);
    setSessions(prev => prev.map(s =>
      s.id === session.id ? updatedSession : s
    ));
  }
}
