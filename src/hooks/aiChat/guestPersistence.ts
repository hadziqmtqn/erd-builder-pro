import { localPersistence } from '@/lib/localPersistence';
import { AIChatMessage } from '@/types';

export async function persistGuestMessages(sessionUid: string, msgs: AIChatMessage[]) {
  try {
    const stored = await localPersistence.getResource(sessionUid);
    if (stored) {
      stored.messages = msgs;
      await localPersistence.saveResource(stored);
    }
    return true;
  } catch (err) {
    console.warn('[AI Chat] Failed to persist guest messages:', err);
    return false;
  }
}

export async function persistGuestTitle(sessionUid: string, title: string) {
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
