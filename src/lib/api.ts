function isTauri(): boolean {
  return typeof window !== 'undefined' &&
    !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
}

export const API_BASE_URL: string = import.meta.env.VITE_API_URL ||
  (isTauri() ? 'http://localhost:3099' : '');

/** Storage key for the auth token (used in desktop/Tauri cross-origin mode). */
export const AUTH_TOKEN_KEY = 'auth_token';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch { /* ignore */ }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch { /* ignore */ }
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(`${API_BASE_URL}${input}`, {
    credentials: 'include',
    ...init,
    headers,
  });
}
