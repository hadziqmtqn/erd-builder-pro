import { apiFetch, getAuthToken } from './api';

// Keep writes ordered across route unmount/remount, not only inside one mounted editor.
const pending = new Map<string, Promise<void>>();
export function saveDbClientLayout(id: string, data: unknown): Promise<void> {
  const token = getAuthToken();
  const body = JSON.stringify({ data });
  const save = (pending.get(id) ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (getAuthToken() !== token) throw new Error('Session changed; layout was not saved');
    const response = await apiFetch(`/api/db-clients/${encodeURIComponent(id)}/layout`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body,
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
  });
  pending.set(id, save);
  const release = () => { if (pending.get(id) === save) pending.delete(id); };
  void save.then(release, release);
  return save;
}
