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
const TEAM_SCOPED_API = /^\/api\/(?:projects|diagrams|notes|drawings|flowcharts|search|entity-changes|ai\/chat)(?:\/|$)/;

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
  return fetch(`${getApiBaseUrl()}${input}`, {
    credentials: 'include',
    ...init,
    headers,
  });
}
