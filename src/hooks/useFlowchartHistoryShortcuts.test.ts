import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)>, active: true }));
vi.mock('react', () => ({ useEffect: (effect: () => void) => mocks.effects.push(effect) }));
vi.mock('@/contexts/FileSessionContext', () => ({ useEditorActive: () => () => mocks.active }));
import { useFlowchartHistoryShortcuts } from './useFlowchartHistoryShortcuts';

const add = vi.fn(), remove = vi.fn(), undo = vi.fn(), redo = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); mocks.effects = []; mocks.active = true;
  vi.stubGlobal('window', { addEventListener: add, removeEventListener: remove });
});
afterEach(() => vi.unstubAllGlobals());

function setup(enabled = true) {
  useFlowchartHistoryShortcuts(enabled, undo, redo);
  const cleanup = mocks.effects[0]();
  return { handle: add.mock.calls[0]?.[1] as (event: KeyboardEvent) => void, cleanup };
}
function key(overrides: Record<string, unknown> = {}) {
  return { key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, isComposing: false,
    defaultPrevented: false, target: { closest: () => null }, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...overrides } as unknown as KeyboardEvent;
}

describe('BUG-015 Flowchart history shortcuts', () => {
  it.each([{ ctrlKey: true, metaKey: false }, { ctrlKey: false, metaKey: true }])('supports Undo and Shift+Z Redo with %j', modifier => {
    const { handle } = setup();
    const event = key(modifier);
    handle(event);
    expect(undo).toHaveBeenCalledOnce();
    expect(redo).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    handle(key({ ...modifier, key: 'Z', shiftKey: true }));
    expect(redo).toHaveBeenCalledOnce();
    expect(undo).toHaveBeenCalledOnce();
  });

  it('does not register shortcuts when read-only, loading, or a canvas dialog is open', () => {
    setup(false);
    expect(add).not.toHaveBeenCalled();
  });
  it('only handles the active file pane and cleans up on unmount', () => {
    const { handle, cleanup } = setup();
    mocks.active = false;
    const event = key();
    handle(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
    mocks.active = true;
    handle(key());
    expect(undo).toHaveBeenCalledOnce();
    if (cleanup) cleanup();
    expect(remove).toHaveBeenCalledWith('keydown', handle);
  });
  it.each(['input', 'textarea', 'select', '[contenteditable]', '.cm-editor', '[data-keyboard-trap]', '[role="dialog"]', '[role="alertdialog"]', '[role="listbox"]', '[role="menu"]'])('preserves native history and overlay scope in %s', selector => {
    const { handle } = setup();
    const event = key({ target: { closest: (scope: string) => scope.includes(selector) ? {} : null } });
    handle(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });
  it.each([{ ctrlKey: false }, { altKey: true }, { isComposing: true }, { defaultPrevented: true }, { key: 'y' }])('ignores unrelated or consumed shortcuts: %j', overrides => {
    const { handle } = setup();
    const event = key(overrides);
    handle(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });
});
