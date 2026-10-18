import { beforeEach, describe, expect, it, vi } from 'vitest';
import { localPersistence } from './localPersistence';
import { flushWorkspaceChanges } from './workspace-save';

vi.mock('./localPersistence', () => ({ localPersistence: { getAllPendingSyncs: vi.fn() } }));

describe('SH-002 workspace save gate', () => {
  const currentFile = { type: 'notes', id: 7, uid: 'unsaved' };
  beforeEach(() => vi.mocked(localPersistence.getAllPendingSyncs).mockResolvedValue([]));

  it('persists the current edit before syncing it with the old workspace still selected', async () => {
    const calls: string[] = [];
    await flushWorkspaceChanges(async () => { calls.push('local'); }, async () => { calls.push('server'); }, currentFile);
    expect(calls).toEqual(['local', 'server']);
  });

  it('refuses a switch after a failed local save', async () => {
    const sync = vi.fn();
    await expect(flushWorkspaceChanges(async () => { throw new Error('disk full'); }, sync, currentFile)).rejects.toThrow('disk full');
    expect(sync).not.toHaveBeenCalled();
  });

  it.each([7, 'unsaved'])('refuses a switch while the current file draft %s remains pending', async id => {
    vi.mocked(localPersistence.getAllPendingSyncs).mockResolvedValue([{ type: 'notes', id }] as any);
    await expect(flushWorkspaceChanges(async () => {}, async () => {}, currentFile)).rejects.toThrow('pending changes');
  });

  it('retains old drafts without trapping the user in a different workspace', async () => {
    const retained = [{ type: 'notes', id: 'other-Team' }, { type: 'drawings', id: 7 }] as any;
    vi.mocked(localPersistence.getAllPendingSyncs).mockResolvedValue(retained);
    await expect(flushWorkspaceChanges(async () => {}, async () => {}, currentFile)).resolves.toBeUndefined();
    expect(retained).toHaveLength(2);
  });
});
