import { localPersistence } from './localPersistence';

export async function flushWorkspaceChanges(
  flushPendingSaves: () => Promise<void>,
  syncDrafts: () => Promise<void>,
  currentFile: { type: string; id?: string | number | null; uid?: string | null },
) {
  await flushPendingSaves();
  await syncDrafts();
  const pending = await localPersistence.getAllPendingSyncs();
  if (pending.some(draft => draft.type === currentFile.type && [currentFile.id, currentFile.uid].some(id => id != null && String(id) === String(draft.id)))) {
    throw new Error('Save your pending changes before switching workspaces.');
  }
}
