import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertNoCommentDraft, assertNoPendingReview, findPaneDocument, flushChildPanes, focusesPane, loadedPaneTitle, PANE_FLUSH_CHILDREN, paneDocumentTitle, paneKey, paneRequest, paneUrl, validPaneFile, type PaneFile } from '../file-panes';

const note: PaneFile = { type: 'notes', uid: 'a', title: 'Notes', projectId: '1' };
const erd: PaneFile = { ...note, type: 'erd', uid: 'b', title: 'Schema' };
const third: PaneFile = { ...note, type: 'flowchart', uid: 'c', title: 'Process' };
afterEach(() => vi.unstubAllGlobals());

describe('COL-006 file panes', () => {
  it('waits for both editors and propagates a save failure before navigation', async () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    expect(await flushChildPanes()).toBe(false);
    let finish!: () => void;
    target.addEventListener(PANE_FLUSH_CHILDREN, event => {
      (event as CustomEvent).detail.push(Promise.resolve(), new Promise<void>(resolve => { finish = resolve; }));
    }, { once: true });
    let done = false;
    const pending = flushChildPanes().then(value => { done = value; });
    await Promise.resolve();
    expect(done).toBe(false);
    finish(); await pending;
    expect(done).toBe(true);
    target.addEventListener(PANE_FLUSH_CHILDREN, event => (event as CustomEvent).detail.push(Promise.reject(new Error('Save failed'))), { once: true });
    await expect(flushChildPanes()).rejects.toThrow('Save failed');
  });
  it('keeps at most two distinct files and requires replacement for the third', () => {
    expect(paneRequest([], note, note)).toBe('focus');
    expect(paneRequest([], note, erd)).toBe('open');
    expect(paneRequest([note, erd], note, erd)).toBe('focus');
    expect(paneRequest([note, erd], note, third)).toBe('replace');
    expect(paneRequest([erd], note, third)).toBe('open');
    expect(paneRequest([note, erd], note, { ...third, projectId: '2' })).toBe('reject');
    expect(paneKey(note)).not.toBe(paneKey({ ...note, type: 'erd' }));
  });
  it('uses only supported local document routes and encodes identifiers', () => {
    expect(validPaneFile({ ...note, type: 'db-client' })).toBe(false);
    expect(validPaneFile({ ...note, uid: '' })).toBe(false);
    expect(validPaneFile(null)).toBe(false);
    expect(validPaneFile(erd)).toBe(true);
    expect(paneUrl({ ...erd, uid: 'a/b?c', projectId: 'x&y' })).toBe('/diagrams/a%2Fb%3Fc?pid=x%26y');
  });
  it('blocks panel disposal when a comment has not been sent', () => {
    vi.stubGlobal('document', { querySelectorAll: () => [{ value: ' unsent ' }] });
    expect(assertNoCommentDraft).toThrow('comment draft');
    vi.stubGlobal('document', { querySelectorAll: () => [{ value: '   ' }] });
    expect(assertNoCommentDraft).not.toThrow();
  });
  it('checks comment drafts in the file being closed rather than a neighbouring editor', () => {
    vi.stubGlobal('document', { querySelectorAll: () => [{ value: 'draft in the other file' }] });
    const closedPanel = { querySelectorAll: () => [{ value: '' }] } as unknown as ParentNode;
    expect(() => assertNoCommentDraft(closedPanel)).not.toThrow();
    expect(assertNoCommentDraft).toThrow('comment draft');
  });
  it('blocks closing a file whose AI changes are still waiting for review', () => {
    const reviewing = { querySelectorAll: () => [{}] } as unknown as ParentNode;
    const idle = { querySelectorAll: () => [] } as unknown as ParentNode;
    expect(() => assertNoPendingReview(reviewing)).toThrow('pending AI changes');
    expect(() => assertNoPendingReview(idle)).not.toThrow();
  });
});

describe('BUG-041 pane close button', () => {
  // Fake elements: `closest` matches when the target is the close button or sits inside it.
  const element = (insideClose: boolean) => ({ closest: (selector: string) => selector === '[data-pane-close]' && insideClose ? {} : null }) as unknown as EventTarget;
  it('does not focus the pane it is about to close', () => {
    expect(focusesPane(element(true))).toBe(false);
  });
  it('still focuses the pane on any other press or focus', () => {
    expect(focusesPane(element(false))).toBe(true);
    expect(focusesPane(null)).toBe(true);
    expect(focusesPane({} as EventTarget)).toBe(true); // a text node or window has no closest()
  });
});

describe('BUG-045 pane title follows the loaded document', () => {
  const created = { id: 42, uid: 'c38fb9dd', title: 'Flowchart - QA Note', project_id: 1 };
  const root = { notes: [{ id: 1, uid: 'a', title: 'QA Note' }], flowcharts: [{ id: 7, uid: 'old', title: 'Old Flowchart' }] };
  const notePane = { notes: root.notes, flowcharts: [created, ...root.flowcharts] };
  it('finds a file created inside a pane that the root list does not have yet', () => {
    expect(findPaneDocument('flowchart', 'c38fb9dd', [root])).toBeUndefined();
    const found = findPaneDocument('flowchart', 'c38fb9dd', [root, notePane]);
    expect(paneDocumentTitle(found)).toBe('Flowchart - QA Note');
    expect(findPaneDocument('flowchart', '42', [root, notePane])).toBe(created);
  });
  it('prefers the root list and only matches the requested file type', () => {
    expect(findPaneDocument('flowchart', 'old', [root, notePane])).toBe(root.flowcharts[0]);
    expect(findPaneDocument('notes', 'c38fb9dd', [root, notePane])).toBeUndefined();
  });
  it('falls back to the document an open pane has loaded', () => {
    const pane: PaneFile = { type: 'flowchart', uid: 'c38fb9dd', title: 'Untitled', projectId: '1' };
    expect(findPaneDocument('flowchart', 'c38fb9dd', [root], [{ file: pane, document: created }])).toBe(created);
    expect(findPaneDocument('flowchart', '42', [root], [{ file: { ...pane, uid: 'other' }, document: created }])).toBe(created);
    expect(findPaneDocument('erd', 'c38fb9dd', [root], [{ file: pane, document: created }])).toBeUndefined();
  });
  it('names a pane after its loaded document, not the guess made when it opened', () => {
    const pane: PaneFile = { type: 'flowchart', uid: 'c38fb9dd', title: 'Untitled', projectId: '1' };
    expect(loadedPaneTitle(pane, created)).toBe('Flowchart - QA Note');
    expect(loadedPaneTitle({ ...pane, uid: '42' }, created)).toBe('Flowchart - QA Note');
    expect(loadedPaneTitle(pane, { id: 9, uid: 'previous', title: 'Previous file' })).toBe('');
    expect(loadedPaneTitle(pane, null)).toBe('');
    expect(loadedPaneTitle(pane, { uid: 'c38fb9dd', name: 'Drawing name' })).toBe('Drawing name');
  });
});
