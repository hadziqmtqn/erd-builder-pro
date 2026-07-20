/**
 * Data Export Utility
 *
 * Guest mode reads IndexedDB. Authenticated modes read the server database.
 *
 * The exported JSON uses a portable schema that maps to the Prisma models.
 */

import { localPersistence } from './localPersistence';
import { apiFetch } from './api';

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

function isGuestMode(): boolean {
  return sessionStorage.getItem('auth_mode') === 'guest';
}

function readDbmlFromData(data: unknown): string | null {
  if (!data || typeof data !== 'string') return null;
  try {
    const parsed = JSON.parse(data);
    return parsed?.dbml_source ?? parsed?.dbmlSource ?? null;
  } catch {
    return null;
  }
}

function normalizeDiagramForExport(diagram: any): any {
  const dbmlSource = diagram.dbml_source ?? diagram.dbmlSource ?? readDbmlFromData(diagram.data);
  return {
    ...diagram,
    dbml_source: dbmlSource ?? null,
    dbmlSource: dbmlSource ?? null,
  };
}

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
 * Build the full export payload by reading local stores or the server database.
 */
export async function buildExportPayload(): Promise<GuestExportPayload> {
  if (!isGuestMode()) {
    const res = await apiFetch('/api/guest/export');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to export data');
    }
    return res.json();
  }

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
      diagrams: diagrams.map(normalizeDiagramForExport),
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
  a.download = `erd-data-export-${new Date().toISOString().slice(0, 10)}.json`;
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

export const exportData = exportGuestData;
