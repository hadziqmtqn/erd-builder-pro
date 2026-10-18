import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  api: vi.fn(), pending: vi.fn(), save: vi.fn(), synced: vi.fn(),
  version: vi.fn(), toast: vi.fn(), cachedVersion: 6,
}));
vi.mock('react', () => ({
  useState: (value: unknown) => [value, vi.fn()],
  useRef: (current: unknown) => ({ current }),
  useCallback: (fn: unknown) => fn,
  useEffect: vi.fn(),
}));
vi.mock('../lib/api', () => ({ apiFetch: mocks.api }));
vi.mock('../lib/localPersistence', () => ({ localPersistence: {
  getAllPendingSyncs: mocks.pending, saveDraft: mocks.save, markSynced: mocks.synced,
} }));
vi.mock('../lib/diagramVersioning', () => ({
  getCachedDiagramVersion: async () => mocks.cachedVersion,
  updateCachedDiagramVersion: mocks.version,
  clearCachedDiagramVersion: vi.fn(),
  documentVersionKey: (type: string, id: string) => `${type}:${id}`,
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toast } }));

import { useSyncService } from './useSyncService';

const draft = { type: 'notes', id: 'qa-note', updated_at: 1,
  data: JSON.stringify({ title: 'QA', project_id: 3, content: '<p>Editor B draft</p>' }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('sessionStorage', { getItem: () => null });
  mocks.pending.mockResolvedValue([draft]);
  mocks.cachedVersion = 6;
  mocks.version.mockImplementation(async (_key, version) => { mocks.cachedVersion = version; });
});

describe('SH-002 Note conflict recovery', () => {
  it.each([
    { title: 'QA', project_id: 3, content: '<p>Editor A saved</p>' },
    { title: 'QA renamed', project_id: 3, content: '<p data-comment-anchor-id="a">Editor B draft</p>' },
    { title: 'QA', project_id: 4, content: '<p data-comment-anchor-id="a">Editor B draft</p>' },
  ])('keeps the draft and never retries when server content or metadata changed: %j', async server => {
    mocks.api.mockImplementation(async (_path: string, init?: RequestInit) =>
      init ? new Response('{}', { status: 409 }) : Response.json({ ...server, version: 7 }));
    const sync = useSyncService(true);
    await sync.syncDrafts();
    await sync.syncDrafts();
    expect(mocks.api.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.synced).not.toHaveBeenCalled();
    expect(mocks.version).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith('This file was changed by someone else', expect.objectContaining({
      description: 'Your unsaved changes were not sent so nothing is overwritten.',
    }));
  });

  it('still retries a verified anchor-only difference and marks the new draft synced', async () => {
    const content = '<p data-comment-anchor-id="a">Editor B draft</p>';
    let writes = 0;
    mocks.api.mockImplementation(async (_path: string, init?: RequestInit) => {
      if (!init) return Response.json({ title: 'QA', project_id: 3, content, version: 7 });
      return ++writes === 1 ? new Response('{}', { status: 409 }) : Response.json({ version: 8 });
    });
    mocks.save.mockImplementation(async (_type, _id, data) => {
      mocks.pending.mockResolvedValue([{ ...draft, data, updated_at: 2 }]);
    });
    await useSyncService(true).syncDrafts();
    expect(writes).toBe(2);
    expect(mocks.api.mock.calls.filter(([, init]) => init?.method === 'PUT')
      .map(([, init]) => JSON.parse(init.body as string).expectedVersion)).toEqual([6, 7]);
    expect(mocks.save).toHaveBeenCalledWith('notes', 'qa-note', JSON.stringify({ title: 'QA', project_id: 3, content }));
    expect(mocks.synced).toHaveBeenCalledWith('notes', 'qa-note', 2);
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
