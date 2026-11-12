export type PaneFile = { type: 'notes' | 'erd' | 'flowchart' | 'drawings'; uid: string; title: string; projectId: string; previewSchema?: string };
export const PANE_REQUEST = 'workspace:open-file-pane';
export const PANE_FLUSH_CHILDREN = 'workspace:flush-child-panes';
export const NOTE_PANE_SNAPSHOT = 'workspace:note-editor-snapshot';
export const paneKey = (file: PaneFile) => `${file.type}:${file.uid}`;
/** A press or focus on a pane's close button (`data-pane-close`) must not focus the pane it is about to close (BUG-041). */
export const focusesPane = (target: EventTarget | null) =>
  !(target as Element | null)?.closest?.('[data-pane-close]');
export function paneRequest(files: PaneFile[], current: PaneFile, next: PaneFile) {
  if (next.projectId !== current.projectId) return 'reject';
  if (files.some(file => paneKey(file) === paneKey(next)) || (!files.length && paneKey(current) === paneKey(next))) return 'focus';
  return files.length >= 2 ? 'replace' : 'open';
}

/** The fields a pane needs from a loaded note, diagram, flowchart or drawing. */
export type PaneDocument = { id?: unknown; uid?: unknown; title?: string | null; name?: string | null; project_id?: unknown; projectId?: unknown };
export type PaneDocumentLists = { notes?: readonly PaneDocument[]; diagrams?: readonly PaneDocument[]; flowcharts?: readonly PaneDocument[]; drawings?: readonly PaneDocument[] };
const PANE_LISTS = { notes: 'notes', erd: 'diagrams', flowchart: 'flowcharts', drawings: 'drawings' } as const;
const sameDocument = (doc: PaneDocument | null | undefined, uid: string) =>
  !!doc && ((doc.uid != null && String(doc.uid) === uid) || (doc.id != null && String(doc.id) === uid));
export const paneDocumentTitle = (doc: PaneDocument | null | undefined) => doc?.title || doc?.name || '';

/**
 * Finds the document a pane is about to open. A file just created inside a pane (for example
 * "Create New" from an AI reply) is only in that pane's own lists, not in the main workspace's (BUG-045).
 */
export function findPaneDocument(type: PaneFile['type'], uid: string, workspaces: readonly PaneDocumentLists[], opened: readonly { file: PaneFile; document?: PaneDocument | null }[] = []) {
  for (const workspace of workspaces) {
    const found = workspace[PANE_LISTS[type]]?.find(doc => sameDocument(doc, uid));
    if (found) return found;
  }
  return opened.find(({ file, document }) => file.type === type && (file.uid === uid || (document?.id != null && String(document.id) === uid)))?.document ?? undefined;
}

/** The name of the document a pane has loaded, or '' while it is still loading another one. */
export const loadedPaneTitle = (file: PaneFile, document: PaneDocument | null | undefined) =>
  sameDocument(document, file.uid) ? paneDocumentTitle(document) : '';

export function paneUrl(file: PaneFile) {
  const route = { notes: 'notes', erd: 'diagrams', flowchart: 'flowcharts', drawings: 'drawings' }[file.type];
  return `/${route}/${encodeURIComponent(file.uid)}?${new URLSearchParams({ pid: file.projectId })}`;
}

/**
 * The URL the address bar should switch to, or null to leave it (BUG-049). `shown` is the focused pane's URL that was
 * put there last. With no focused pane the router's URL comes back only while the bar still shows that pane URL: a
 * navigation that closed the panes has already pushed its own URL, and the router's location can lag behind it.
 */
export function paneAddressUrl(focusedUrl: string | null, shown: string | null, current: string, routerUrl: string) {
  if (focusedUrl) return focusedUrl === current ? null : focusedUrl;
  return shown === current && routerUrl !== current ? routerUrl : null;
}

export function validPaneFile(value: unknown): value is PaneFile {
  const file = value as PaneFile | null;
  return !!file && ['notes', 'erd', 'flowchart', 'drawings'].includes(file.type)
    && [file.uid, file.title, file.projectId].every(v => typeof v === 'string' && v.length > 0 && v.length <= 512)
    && (file.previewSchema === undefined || (file.type === 'erd' && typeof file.previewSchema === 'string' && file.previewSchema.length <= 1_000_000));
}

export function requestFilePane(file: PaneFile) {
  window.dispatchEvent(new CustomEvent(PANE_REQUEST, { detail: { file } }));
}

export async function flushChildPanes() {
  if (typeof window === 'undefined') return false;
  const jobs: Promise<void>[] = [];
  window.dispatchEvent(new CustomEvent(PANE_FLUSH_CHILDREN, { detail: jobs }));
  await Promise.all(jobs);
  return jobs.length > 0;
}

export async function flushWorkspaceEditors(saveCurrent: () => Promise<void>) {
  if (!await flushChildPanes()) await saveCurrent();
}

export function assertNoCommentDraft(container: ParentNode = document) {
  if ([...container.querySelectorAll<HTMLTextAreaElement>('[data-comment-draft]')].some(el => el.value.trim())) {
    throw new Error('Send or clear your comment draft before closing this file.');
  }
}

// An AI schema diff lives only in the editor's memory, so unmounting the pane would silently discard it.
export function assertNoPendingReview(container: ParentNode = document) {
  if (container.querySelectorAll('[data-pending-review]').length) {
    throw new Error('Merge or reject the pending AI changes first; leaving this editor would discard them.');
  }
}
