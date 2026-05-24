export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? '';

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${input}`, {
    credentials: 'include',
    ...init,
  });
}
