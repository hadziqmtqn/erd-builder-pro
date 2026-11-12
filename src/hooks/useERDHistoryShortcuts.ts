import { useEffect } from 'react';
import { useEditorActive } from '@/contexts/FileSessionContext';

/**
 * ERD Undo/Redo keys. The ERD session lives in the workspace for every view, so the keys are only
 * enabled while the ERD view is shown; otherwise this capture handler swallowed Mod+Z for Flowchart (BUG-015).
 */
export function useERDHistoryShortcuts(enabled: boolean, canUndo: boolean, canRedo: boolean, undo: () => void, redo: () => void) {
  const editorActive = useEditorActive();
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!editorActive()) return;
      const target = e.target as HTMLElement | null;
      const isEditingText = target?.matches('input, textarea, [contenteditable="true"]')
        || !!target?.closest('.cm-editor');
      if (isEditingText) return;

      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) redo();
        } else {
          if (canUndo) undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault();
        if (canRedo) redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, undo, redo, canUndo, canRedo]);
}
