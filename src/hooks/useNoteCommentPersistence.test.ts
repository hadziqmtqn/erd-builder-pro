import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('react', () => ({ useCallback: (fn: unknown) => fn }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/localPersistence', () => ({ localPersistence: { hasPendingSync: vi.fn(async () => false) } }));
vi.mock('@/providers/WorkspaceContext', () => ({
  useWorkspace: () => ({
    projects: [{ id: 'p1', uid: 'p1', team_id: 't1' }],
    isGuest: false,
    syncDrafts: vi.fn(),
    cancelPendingNoteSaves: vi.fn(),
  }),
}));

import { apiFetch } from '@/lib/api';
import { useNoteCommentPersistence } from './useNoteCommentPersistence';

const anchored = '<p data-comment-anchor-id="a1">Hello</p>';
const note = { uid: 'n1', project_id: 'p1', content: anchored };
const events: CustomEvent[] = [];

beforeEach(() => {
  events.length = 0;
  vi.stubGlobal('window', {
    location: { origin: 'http://localhost' },
    dispatchEvent: (event: CustomEvent) => events.push(event),
    crypto: globalThis.crypto,
  });
  vi.mocked(apiFetch).mockReset();
});
afterEach(() => vi.unstubAllGlobals());

it('opens the composer without saving the Note when the block already has an anchor (BUG-085)', async () => {
  const saveNote = vi.fn(async () => true);
  const persist = useNoteCommentPersistence({ noteUid: 'n1', note, isReadOnly: false, handleNoteChange: vi.fn(), saveNote })!;

  await expect(persist({ id: 'a1', beforeContent: anchored, content: anchored })).resolves.toBe(true);

  expect(apiFetch).not.toHaveBeenCalled();
  expect(saveNote).not.toHaveBeenCalled();
  expect(events.map(event => event.detail)).toEqual([{ fileId: 'n1', anchorId: 'a1' }]);
});

it('still saves the Note when a new anchor is added to the block', async () => {
  vi.mocked(apiFetch).mockResolvedValue({ ok: true, status: 200 } as Response);
  const saveNote = vi.fn(async () => true);
  const plain = { ...note, content: '<p>Hello</p>' };
  const persist = useNoteCommentPersistence({ noteUid: 'n1', note: plain, isReadOnly: false, handleNoteChange: vi.fn(), saveNote })!;

  await expect(persist({ id: 'a2', beforeContent: '<p>Hello</p>', content: '<p data-comment-anchor-id="a2">Hello</p>' })).resolves.toBe(true);

  expect(apiFetch).toHaveBeenCalledWith('/api/notes/n1', expect.objectContaining({ method: 'PUT' }));
  expect(saveNote).toHaveBeenCalledWith({ ...plain, content: '<p data-comment-anchor-id="a2">Hello</p>' }, { syncPending: false });
  expect(events.map(event => event.detail)).toEqual([{ fileId: 'n1', anchorId: 'a2' }]);
});
