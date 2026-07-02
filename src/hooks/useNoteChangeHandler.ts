import { useCallback, useRef } from 'react';
import { Note, DraftType } from '../types';
import { BroadcastMessageType } from './useBroadcastChannel';
import { saveContentCache } from '../utils/titleCache';

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────
export interface UseNoteChangeHandlerParams {
  activeNoteUid: string | null;
  /** Refs managed by parent — shared across hooks */
  isIncomingSyncRef: React.MutableRefObject<boolean>;
  notesRef: React.MutableRefObject<any[]>;
  lastLoadedNoteIdRef: React.MutableRefObject<any>;
  /** Timestamp of last save — shared across all document types for focus fetch throttling */
  lastSaveCallRef: React.MutableRefObject<number>;
  /** Functions from parent hooks */
  bumpContentVersion: () => number;
  saveNote: (note: Note) => Promise<boolean>;
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  broadcastMessage: (type: any, draftType: any, id: any) => void;
  syncDrafts: () => Promise<void>;
  /** State values */
  isRefreshing: boolean;
  isNoteItemLoading: boolean;
}

// ──────────────────────────────────────────
// Return type
// ──────────────────────────────────────────
export interface UseNoteChangeHandlerReturn {
  /** Callback for WorkspaceContent — handles debounced auto-save */
  handleNoteChange: (content: string) => void;
  /** Ref for 800ms IndexedDB save debounce — shared with useAutoSave + NotesPage */
  notesSaveTimeout: React.MutableRefObject<NodeJS.Timeout | null>;
  /** Ref for 1600ms cloud sync debounce — internal + NotesPage cleanup */
  noteCloudSyncTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

// ──────────────────────────────────────────
// Hook
// ──────────────────────────────────────────
/**
 * Manages note content change lifecycle:
 *  - Stage 1: 800ms idle → IndexedDB (local draft)
 *  - Stage 2: 1600ms idle → Cloud (syncDrafts to Supabase)
 *
 * Extracted from App.tsx to keep notes-specific saving logic contained.
 */
export function useNoteChangeHandler(params: UseNoteChangeHandlerParams): UseNoteChangeHandlerReturn {
  const {
    activeNoteUid,
    isIncomingSyncRef,
    notesRef,
    lastLoadedNoteIdRef,
    lastSaveCallRef,
    bumpContentVersion,
    saveNote,
    setNotes,
    broadcastMessage,
    syncDrafts,
    isRefreshing,
    isNoteItemLoading,
  } = params;

  // ── Timeout refs (owned by this hook) ──
  const notesSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const noteCloudSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Stable refs to avoid stale closures ──
  const syncDraftsRef = useRef(syncDrafts);
  syncDraftsRef.current = syncDrafts;

  const handleNoteChange = useCallback((content: string) => {
    if (!activeNoteUid) return;

    // Prevent loop: If this change came from another tab's sync, DON'T save it back
    if (isIncomingSyncRef.current) return;

    const noteId = activeNoteUid;
    // Track edit version — selectNote checks this to avoid overwriting user edits
    bumpContentVersion();

    // ⚡ Do NOT call setNotes here — it causes full React re-render on every keystroke.
    // Tiptap manages its own content internally via ProseMirror.
    // State is updated only when saving (800ms debounce below).

    // Clear BOTH timers on every keystroke (IndexedDB + Cloud)
    if (notesSaveTimeout.current) clearTimeout(notesSaveTimeout.current);
    if (noteCloudSyncTimeoutRef.current) clearTimeout(noteCloudSyncTimeoutRef.current);

    // SAFETY: Note ID Validation Guard
    if (lastLoadedNoteIdRef.current !== activeNoteUid) return;

    // Stage 1: 400ms idle → IndexedDB (silent, no UI indicator — Notion-like)
    notesSaveTimeout.current = setTimeout(async () => {
      // SAFETY: Wait if still loading/refreshing
      if (isRefreshing || isNoteItemLoading) return;

      const n = notesRef.current.find((n: any) => String(n.uid) === String(noteId));
      if (n) {
        // CRITICAL: We must use the 'content' argument from the outer scope
        // which contains the LATEST change, rather than 'n.content' from
        // the potentially stale 'notes' state array.
        await saveNote({ ...n, content });
        // Update local content cache for instant reload
        saveContentCache(n.uid as string, n.title || 'Untitled', content);
        // Update notes state now (only once per save, not per keystroke)
        setNotes((prev: any[]) => prev.map((n: any) => n.uid === noteId ? { ...n, content } : n));
      }

      lastSaveCallRef.current = Date.now();
      broadcastMessage(BroadcastMessageType.DRAFT_UPDATED, DraftType.NOTES, noteId);
    }, 400);

    // Stage 2: 1000ms idle → Cloud (syncDrafts — syncs pending IndexedDB drafts to Supabase)
    noteCloudSyncTimeoutRef.current = setTimeout(async () => {
      await syncDraftsRef.current();
    }, 1000);
  }, [
    activeNoteUid,
    isIncomingSyncRef,
    bumpContentVersion,
    notesRef,
    lastLoadedNoteIdRef,
    saveNote,
    setNotes,
    broadcastMessage,
    isRefreshing,
    isNoteItemLoading,
  ]);

  return {
    handleNoteChange,
    notesSaveTimeout,
    noteCloudSyncTimeoutRef,
  };
}
