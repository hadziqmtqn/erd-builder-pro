import { useEffect } from 'react';
import { useEditorActive } from '@/contexts/FileSessionContext';

export function useFlowchartHistoryShortcuts(enabled: boolean, undo: () => void, redo: () => void) {
  const editorActive = useEditorActive();
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!editorActive() || event.defaultPrevented || event.isComposing || event.altKey) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      // Text editors and portal overlays own their history and keyboard scope.
      if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor, [data-keyboard-trap], [role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]')) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, editorActive, undo, redo]);
}
