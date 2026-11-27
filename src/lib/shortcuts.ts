const MAC_PLATFORM = /mac|iphone|ipad|ipod/i;

function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && MAC_PLATFORM.test(navigator.platform || navigator.userAgent);
}

/**
 * Shortcut hints are written the macOS way, modifiers in ⌃⌥⇧⌘ order (⇧⌘B, ⌥⌘1). Tiptap's `Mod` is
 * Ctrl outside macOS, so there the same keys read Ctrl+Alt+Shift+Key, as in the Keymap settings tab.
 */
export function shortcutLabel(macLabel: string, isMac = isMacPlatform()): string {
  if (isMac) return macLabel;
  const key = macLabel.replace(/^[⌃⌥⇧⌘]+/, '');
  const modifiers = macLabel.slice(0, macLabel.length - key.length);
  if (!modifiers) return macLabel;
  return [
    /[⌃⌘]/.test(modifiers) ? 'Ctrl' : null,
    modifiers.includes('⌥') ? 'Alt' : null,
    modifiers.includes('⇧') ? 'Shift' : null,
    key,
  ].filter(Boolean).join('+');
}

/** ⌘S / Ctrl+S syncs pending changes. With Shift it is left to Notes, where ⇧⌘S is Strikethrough. */
export function isSyncShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 's';
}
