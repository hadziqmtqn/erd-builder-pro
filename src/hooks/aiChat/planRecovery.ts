import { localPersistence } from '@/lib/localPersistence';
import type { AIRequestContext } from './requestContext';

export interface PlanDraft {
  selected: string[];
  customSelected: boolean;
  customAnswer: string;
}

export type PlanOutboxStatus = 'pending' | 'needs-resume' | 'pending-assistant';

export interface PlanOutboxItem {
  id: string;
  type: 'ai_chat_outbox';
  sessionUid: string;
  clientMessageId: string;
  content: string;
  selectionText: string | null;
  requestContext: AIRequestContext;
  status: PlanOutboxStatus;
  userSaved: boolean;
  assistantContent?: string;
  createdAt: string;
}

const draftId = (sessionUid: string, questionKey: string) => `plan-draft:${sessionUid}:${questionKey}`;
const outboxId = (clientMessageId: string) => `ai-outbox:${clientMessageId}`;

export const assistantClientMessageId = (clientMessageId: string) => `${clientMessageId}:assistant`;

export async function loadPlanDraft(sessionUid: string, questionKey: string): Promise<PlanDraft | null> {
  const stored = await localPersistence.getResource(draftId(sessionUid, questionKey));
  return stored?.draft ?? null;
}

export async function savePlanDraft(sessionUid: string, questionKey: string, draft: PlanDraft) {
  await localPersistence.saveResource({
    id: draftId(sessionUid, questionKey),
    type: 'ai_plan_draft',
    sessionUid,
    questionKey,
    draft,
    updatedAt: Date.now(),
  });
}

export async function clearPlanDraft(sessionUid: string, questionKey: string) {
  await localPersistence.deleteResource(draftId(sessionUid, questionKey));
}

export async function savePlanOutbox(item: Omit<PlanOutboxItem, 'id' | 'type'>) {
  const stored: PlanOutboxItem = { ...item, id: outboxId(item.clientMessageId), type: 'ai_chat_outbox' };
  await localPersistence.saveResource(stored);
  return stored;
}

export async function updatePlanOutbox(clientMessageId: string, patch: Partial<PlanOutboxItem>) {
  const current = await localPersistence.getResource(outboxId(clientMessageId)) as PlanOutboxItem | null;
  if (!current) return null;
  const next = { ...current, ...patch, id: current.id, type: current.type };
  await localPersistence.saveResource(next);
  return next;
}

export async function removePlanOutbox(clientMessageId: string) {
  await localPersistence.deleteResource(outboxId(clientMessageId));
}

export async function listPlanOutbox(sessionUid?: string): Promise<PlanOutboxItem[]> {
  const items = await localPersistence.getAllResources('ai_chat_outbox') as PlanOutboxItem[];
  return items
    .filter(item => !sessionUid || item.sessionUid === sessionUid)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
