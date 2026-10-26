import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../api', () => ({ apiFetch: mocks.api }));
import { deleteCommentThread, editComment, fetchAnchorPage, type CommentFileRef } from '../fileComments';

const file: CommentFileRef = { projectId: '7', teamId: 'team-1', featureType: 'note', fileId: 'note-uid' };
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;
const events: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;
  const target = new EventTarget();
  target.addEventListener('collaboration-updated', (event) => events.push(JSON.stringify((event as CustomEvent).detail)));
  vi.stubGlobal('window', target);
});

describe('Notes comment edit and delete (COL-005)', () => {
  it('edits a message on its file, sending the body it replaces', async () => {
    mocks.api.mockResolvedValue(reply(200, { id: 'm1', body: 'New text' }));
    await editComment(file, 'thread 1', { id: 'm1', body: 'Old text' }, 'New text');
    const [url, init] = mocks.api.mock.calls[0];
    expect(url).toBe('/api/projects/7/comments/thread%201/messages/m1?feature_type=note&file_id=note-uid');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ body: 'New text', expectedBody: 'Old text' });
    expect(events).toEqual([JSON.stringify({ teamId: 'team-1', projectId: '7' })]);
  });

  it('surfaces a stale edit as a 409 and does not announce a change', async () => {
    mocks.api.mockResolvedValue(reply(409, { error: 'This message changed. Refresh before editing it again.' }));
    await expect(editComment(file, 't1', { id: 'm1', body: 'Old' }, 'New')).rejects.toMatchObject({ status: 409 });
    expect(events).toEqual([]);
  });

  it('deletes a thread on its file', async () => {
    mocks.api.mockResolvedValue(reply(200, { success: true }));
    await deleteCommentThread(file, 't1');
    expect(mocks.api).toHaveBeenCalledWith('/api/projects/7/comments/t1?feature_type=note&file_id=note-uid', { method: 'DELETE' });
    expect(events).toHaveLength(1);
  });

  it('treats a delete by someone other than the creator as not found', async () => {
    mocks.api.mockResolvedValue(reply(404, { error: 'Not found' }));
    await expect(deleteCommentThread(file, 't1')).rejects.toMatchObject({ status: 404 });
    expect(events).toEqual([]);
  });

  it('reads who started the thread from either response casing', async () => {
    mocks.api.mockResolvedValueOnce(reply(200, { threads: [{ id: 't1', status: 'open', createdBy: 'member-a' }], messages: [] }));
    expect((await fetchAnchorPage(file, { type: 'block', id: 'b1' })).createdBy).toBe('member-a');
    mocks.api.mockResolvedValueOnce(reply(200, { threads: [{ id: 't1', status: 'open', created_by: 'member-b' }], messages: [] }));
    expect((await fetchAnchorPage(file, { type: 'block', id: 'b1' })).createdBy).toBe('member-b');
    mocks.api.mockResolvedValueOnce(reply(200, { threads: [], messages: [] }));
    expect((await fetchAnchorPage(file, { type: 'block', id: 'b1' })).createdBy).toBeNull();
  });
});
