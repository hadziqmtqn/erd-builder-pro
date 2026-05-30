import { apiFetch } from '@/lib/api';
import { AIChatSession } from '@/types';

export async function syncSessionProjectId(
  session: AIChatSession,
  liveProjectId: string | number | null,
  setCurrentSession: (s: AIChatSession) => void,
  setSessions: (fn: (prev: AIChatSession[]) => AIChatSession[]) => void,
) {
  const oldProjectId = session?.project_id || null;
  if (liveProjectId === oldProjectId || liveProjectId === undefined) return;

  const updatePayload = {
    updated_at: new Date().toISOString(),
    project_id: liveProjectId,
  };

  try {
    const res = await apiFetch(`/api/ai/chat/sessions/${session.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    });

    if (res.ok) {
      const updatedSession = await res.json();
      setCurrentSession(updatedSession);
      setSessions(prev => prev.map(s =>
        s.id === session.id ? updatedSession : s
      ));
    }
  } catch {
    // silently fail — non-critical
  }
}
