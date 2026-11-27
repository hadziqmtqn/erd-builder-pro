import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSyncShortcut, shortcutLabel } from './shortcuts';

afterEach(() => vi.unstubAllGlobals());

describe('BUG-106 Notes shortcut hints', () => {
  it.each([
    ['⇧⌘B', 'Ctrl+Shift+B'], // Blockquote, Tiptap Mod-Shift-b
    ['⇧⌘S', 'Ctrl+Shift+S'], // Strikethrough, Tiptap Mod-Shift-s
    ['⌥⌘0', 'Ctrl+Alt+0'], // Text, Tiptap Mod-Alt-0
    ['⌘Z', 'Ctrl+Z'],
    ['⇧⌘L/C/R', 'Ctrl+Shift+L/C/R'],
  ])('keeps %s on macOS and shows %s elsewhere', (mac, other) => {
    expect(shortcutLabel(mac, true)).toBe(mac);
    expect(shortcutLabel(mac, false)).toBe(other);
  });

  it.each([
    ['MacIntel', '⇧⌘B'],
    ['iPad', '⇧⌘B'],
    ['Win32', 'Ctrl+Shift+B'],
    ['Linux x86_64', 'Ctrl+Shift+B'],
  ])('reads the platform from the browser on %s', (platform, label) => {
    vi.stubGlobal('navigator', { platform, userAgent: '' });
    expect(shortcutLabel('⇧⌘B')).toBe(label);
  });

  it('leaves a key without modifiers unchanged', () => {
    expect(shortcutLabel('Esc', false)).toBe('Esc');
  });
});

describe('BUG-106 Sync pending changes shortcut', () => {
  const key = (overrides: Partial<KeyboardEvent>) =>
    ({ key: 's', ctrlKey: false, metaKey: false, shiftKey: false, ...overrides }) as KeyboardEvent;

  it.each([
    ['⌘S', key({ metaKey: true })],
    ['Ctrl+S', key({ ctrlKey: true })],
  ])('syncs on %s', (_label, event) => {
    expect(isSyncShortcut(event)).toBe(true);
  });

  it.each([
    ['⇧⌘S on macOS', key({ metaKey: true, shiftKey: true })],
    ['Ctrl+Shift+S', key({ key: 'S', ctrlKey: true, shiftKey: true })],
    ['S without a modifier', key({})],
  ])('leaves %s to the editor', (_label, event) => {
    expect(isSyncShortcut(event)).toBe(false);
  });
});
