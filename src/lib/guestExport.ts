/**
 * Guest Mode — Data Export Utility
 *
 * Reads all user-created data from IndexedDB (localPersistence) and packages
 * it into a downloadable JSON file that can be imported into a real database
 * (SQLite / PostgreSQL) via the server-side import endpoint.
 *
 * The exported JSON uses a portable schema that maps to the Prisma models.
 */

import { localPersistence } from './localPersistence';

export interface GuestExportPayload {
  version: string;
  exported_at: string;
  application: string;
  total_items: Record<string, number>;
  data: {
    projects: any[];
    notes: any[];
    diagrams: any[];
    flowcharts: any[];
    drawings: any[];
    ai_chat_sessions: GuestExportSession[];
  };
}

export interface GuestExportSession {
  uid: string | null;
  title: string | null;
  entity_type: string | null;
  entity_uid: string | null;
  project_id: number | string | null;
  created_at: string | null;
  updated_at: string | null;
  messages: GuestExportMessage[];
}

export interface GuestExportMessage {
  id?: number | string;
  role: string;
  content: string;
  selection_text?: string | null;
  created_at?: string | null;
}

const GUEST_TYPES = ['notes', 'erd', 'flowchart', 'drawings', 'project', 'ai_chat_session'] as const;
type GuestResourceType = (typeof GUEST_TYPES)[number];

/**
 * Read ALL resources of a given type from IndexedDB.
 * Filters out soft-deleted items (is_deleted === true).
 */
async function collectResources(type: GuestResourceType): Promise<any[]> {
  try {
    const items = await localPersistence.getAllResources(type);
    return (items || []).filter((item: any) => !item.is_deleted);
  } catch {
    return [];
  }
}

/**
 * Collect AI chat messages for a session.
 * Messages are stored embedded in the session resource as a `messages` array.
 */
function collectMessages(session: any): GuestExportMessage[] {
  if (!session.messages || !Array.isArray(session.messages)) return [];
  return session.messages.map((m: any) => ({
    id: m.id || m.uid,
    role: m.role,
    content: m.content,
    selection_text: m.selection_text || null,
    created_at: m.created_at || null,
  }));
}

/**
 * Build the full export payload by reading all IndexedDB stores.
 */
export async function buildExportPayload(): Promise<GuestExportPayload> {
  const [projects, notes, diagrams, flowcharts, drawings, sessions] = await Promise.all([
    collectResources('project'),
    collectResources('notes'),
    collectResources('erd'),
    collectResources('flowchart'),
    collectResources('drawings'),
    collectResources('ai_chat_session'),
  ]);

  const exportSessions: GuestExportSession[] = sessions.map((s: any) => ({
    uid: s.uid || s.id,
    title: s.title || 'Untitled',
    entity_type: s.entity_type || null,
    entity_uid: s.entity_uid || null,
    project_id: s.project_id ?? null,
    created_at: s.created_at || null,
    updated_at: s.updated_at || null,
    messages: collectMessages(s),
  }));

  const total_items: Record<string, number> = {
    projects: projects.length,
    notes: notes.length,
    diagrams: diagrams.length,
    flowcharts: flowcharts.length,
    drawings: drawings.length,
    ai_chat_sessions: exportSessions.length,
  };

  return {
    version: '1.0',
    exported_at: new Date().toISOString(),
    application: 'ERD Builder Pro',
    total_items,
    data: {
      projects,
      notes,
      diagrams,
      flowcharts,
      drawings,
      ai_chat_sessions: exportSessions,
    },
  };
}

/**
 * Trigger a browser download of the exported JSON.
 */
export function downloadExportPayload(payload: GuestExportPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `erd-guest-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * One‑shot: build + download.
 */
export async function exportGuestData(): Promise<void> {
  const payload = await buildExportPayload();
  downloadExportPayload(payload);
}
