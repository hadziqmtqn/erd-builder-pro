function isTauri(): boolean {
  return typeof window !== 'undefined' &&
    !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
}

export function isInstalledApp(): boolean {
  return isTauri() || (typeof window !== 'undefined' && (window as any).ERD_INSTALL_MODE === 'cli');
}

export function getInstallMode(): string {
  if (typeof window === 'undefined') return 'web';
  if ((window as any).ERD_INSTALL_MODE === 'cli') return 'cli';
  return isTauri() ? 'desktop' : 'web';
}

export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (!isTauri()) return '';
  // Desktop always uses port 3099. The Rust backend spawns on 3099
  // in both dev and production builds.
  return 'http://localhost:3099';
}

export const AUTH_TOKEN_KEY='***';
export const ACTIVE_TEAM_KEY = 'erd-active-team-id';
// Trash, uploads, the Library and usage belong to the active workspace too (CLD-010); Cloud Feedback and the Trial survey name their Team (CLD-013).
const TEAM_SCOPED_API = /^\/api\/(?:projects|diagrams|notes|drawings|flowcharts|search|entity-changes|trash|upload|library|feedback|cloud\/(?:usage|trial-survey)|ai\/(?:chat|proxy|rules|settings\/prompts))(?=[/?#]|$)/;

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch { return null; }
}

export function setAuthToken(token: string): void {
  try { localStorage.setItem(AUTH_TOKEN_KEY, token); } catch { /* ignore */ }
}

export function clearAuthToken(): void {
  try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch { /* ignore */ }
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!isInstalledApp() && TEAM_SCOPED_API.test(input)) {
    try {
      const teamId = localStorage.getItem(ACTIVE_TEAM_KEY);
      if (teamId) headers.set('X-Team-Id', teamId);
    } catch { /* localStorage may be unavailable */ }
  }
  const response = await fetch(`${getApiBaseUrl()}${input}`, {
    credentials: 'include',
    ...init,
    headers,
  });
  if (response.ok && OPENED_DOCUMENT.test(input)) {
    if (!init?.method || init.method === 'GET') void seedOpenedDocumentVersion(input, response.clone());
    else if (init.method === 'PUT') void recordSavedDocumentVersion(input, response.clone());
  }
  return response;
}

const OPENED_DOCUMENT = /^\/api\/(notes|drawings|flowcharts|diagrams)\/[^/?]+$/;
const DRAFT_TYPE_BY_ROUTE: Record<string, string> = { notes: 'notes', drawings: 'drawings', flowcharts: 'flowchart', diagrams: 'erd' };

/**
 * Remember the version a document was opened at, so the next save says what it was based on (DATA-004).
 * A pending local draft keeps its older baseline: replacing it would let that draft overwrite newer server data.
 */
async function seedOpenedDocumentVersion(input: string, response: Response): Promise<void> {
  try {
    const route = input.split('/')[2];
    const doc = await response.json();
    const version = Number(doc?.version ?? doc?._version);
    const id = doc?.uid ?? doc?.id;
    if (!Number.isInteger(version) || id === undefined || id === null) return;
    const draftType = DRAFT_TYPE_BY_ROUTE[route];
    const [{ localPersistence }, { documentVersionKey, updateCachedDiagramVersion }] = await Promise.all([
      import('./localPersistence'),
      import('./diagramVersioning'),
    ]);
    if (await localPersistence.hasPendingSync(draftType as never, id)) return;
    await updateCachedDiagramVersion(documentVersionKey(draftType, id), version);
  } catch { /* the version is an optimization of conflict detection, never a reason to fail a load */ }
}

/** A save made outside the draft queue (a comment anchor, a rename) moves the version too; follow it so the next autosave is not refused. */
async function recordSavedDocumentVersion(input: string, response: Response): Promise<void> {
  try {
    const route = input.split('/')[2];
    const version = Number((await response.json())?.version);
    const draftType = DRAFT_TYPE_BY_ROUTE[route];
    if (!Number.isInteger(version) || !draftType) return;
    const { documentVersionKey, updateCachedDiagramVersion } = await import('./diagramVersioning');
    await updateCachedDiagramVersion(documentVersionKey(draftType, input.split('/')[3]), version);
  } catch { /* best effort */ }
}
