import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ api: vi.fn(), token: 'qa-session' }));
vi.mock('../api', () => ({ apiFetch: mocks.api, getAuthToken: () => mocks.token }));
import { saveDbClientLayout } from '../db-client-layout';
beforeEach(() => { vi.clearAllMocks(); mocks.token = 'qa-session'; });

it('serializes layout snapshots across separate editor instances of the same file', async () => {
  let resolve!: (response: unknown) => void;
  mocks.api.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue({ ok: true });
  const first = saveDbClientLayout('same-file', { nodes: { a: { x: 10 } } });
  const second = saveDbClientLayout('same-file', { nodes: { a: { x: 20 } } });
  await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
  resolve({ ok: true }); await Promise.all([first, second]);
  expect(mocks.api).toHaveBeenCalledTimes(2);
  expect(JSON.parse(mocks.api.mock.calls[1][1].body)).toEqual({ data: { nodes: { a: { x: 20 } } } });
});
it('allows another file to save independently and never rewrites its target ID', async () => {
  mocks.api.mockResolvedValue({ ok: true });
  await Promise.all([saveDbClientLayout('file/a', {}), saveDbClientLayout('file-b', {})]);
  expect(mocks.api.mock.calls.map(call => call[0])).toEqual(['/api/db-clients/file%2Fa/layout', '/api/db-clients/file-b/layout']);
});
it('surfaces a failed save but allows a later snapshot to succeed', async () => {
  mocks.api.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'Not found' }) }).mockResolvedValue({ ok: true });
  await expect(saveDbClientLayout('failed-file', {})).rejects.toThrow('Not found');
  await expect(saveDbClientLayout('failed-file', { viewport: { zoom: 1 } })).resolves.toBeUndefined();
});
it('does not send a queued snapshot using a different authenticated session', async () => {
  const save = saveDbClientLayout('session-file', {});
  mocks.token = 'another-session';
  await expect(save).rejects.toThrow('Session changed');
  expect(mocks.api).not.toHaveBeenCalled();
});
