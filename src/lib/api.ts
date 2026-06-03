function isTauri(): boolean {
  return typeof window !== 'undefined' &&
    !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
}

export const API_BASE_URL: string = import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV && !isTauri() ? '' : 'http://localhost:3099');

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${input}`, {
    credentials: 'include',
    ...init,
  });
}
