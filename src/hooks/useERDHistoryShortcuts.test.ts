import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)>, active: true }));
vi.mock('react', () => ({ useEffect: (effect: () => void) => mocks.effects.push(effect) }));
vi.mock('@/contexts/FileSessionContext', () => ({ useEditorActive: () => () => mocks.active }));
import { useERDHistoryShortcuts } from './useERDHistoryShortcuts';

const add = vi.fn(), remove = vi.fn(), undo = vi.fn(), redo = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); mocks.effects = []; mocks.active = true;
  vi.stubGlobal('window', { addEventListener: add, removeEventListener: remove });
});
afterEach(() => vi.unstubAllGlobals());

function setup(enabled: boolean) {
  useERDHistoryShortcuts(enabled, true, true, undo, redo);
  const cleanup = mocks.effects[0]();
  return { handle: add.mock.calls[0]?.[1] as ((event: KeyboardEvent) => void) | undefined, cleanup };
}
function key(overrides: Record<string, unknown> = {}) {
  return { key: 'z', ctrlKey: false, metaKey: true, shiftKey: false,
    target: { matches: () => false, closest: () => null }, preventDefault: vi.fn(), ...overrides } as unknown as KeyboardEvent;
}

describe('BUG-015 ERD history shortcuts stay out of other views', () => {
  it('registers nothing outside the ERD view, so Flowchart still receives Mod+Z', () => {
    const { handle } = setup(false);
    expect(add).not.toHaveBeenCalled();
    expect(handle).toBeUndefined();
  });

  it('undoes, redoes and claims Mod+Z in the ERD view', () => {
    const { handle, cleanup } = setup(true);
    expect(add).toHaveBeenCalledWith('keydown', handle, true);
    const event = key();
    handle!(event);
    expect(undo).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    handle!(key({ shiftKey: true }));
    handle!(key({ key: 'y', metaKey: false, ctrlKey: true }));
    expect(redo).toHaveBeenCalledTimes(2);
    (cleanup as () => void)();
    expect(remove).toHaveBeenCalledWith('keydown', handle, true);
  });

  it('leaves text fields and inactive panes alone', () => {
    const { handle } = setup(true);
    const typing = key({ target: { matches: () => true, closest: () => null } });
    handle!(typing);
    mocks.active = false;
    const otherPane = key();
    handle!(otherPane);
    expect(undo).not.toHaveBeenCalled();
    expect(typing.preventDefault).not.toHaveBeenCalled();
    expect(otherPane.preventDefault).not.toHaveBeenCalled();
  });
});
