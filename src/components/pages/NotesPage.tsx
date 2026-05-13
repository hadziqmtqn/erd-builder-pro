import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getTitleCache, getContentCache } from '@/utils/titleCache';
import { localPersistence } from '@/lib/localPersistence';
import { Note, DraftType } from '@/types';

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────
const getSharePathInfo = () => {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  const match = path.match(/^\/(view|share)\/(diagram|note|drawing|flowchart|erd|notes|drawings)\/([^/]+)/);
  if (match) {
    const typeMap: Record<string, any> = {
      diagram: 'erd', erd: 'erd',
      note: 'notes', notes: 'notes',
      drawing: 'drawings', drawings: 'drawings',
      flowchart: 'flowchart',
    };
    return { type: typeMap[match[2]] || match[2], uid: match[3] };
  }
  return null;
};

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────
export interface NotesPageProps {
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  activeNoteUid: string | null;
  setActiveNoteUid: (uid: string | null) => void;
  isAuthenticated: boolean | null;
  notesSaveTimeout: { current: NodeJS.Timeout | null };
  view: string;
  setView: (view: any) => void;
  setSidebarView: (view: any) => void;
}

/**
 * NotesPage — manages all notes-specific side effects.
 *
 * Mounted unconditionally. Renders null (no visible DOM).
 * Handles:
 *  - Cache preload (stale-while-revalidate) — instant content before auth
 *  - Keyboard shortcuts — Ctrl+Shift+E (export), Ctrl+Shift+I (import)
 *  - noteCloudSyncTimeoutRef — cleanup on unmount
 *
 * Note Navigation (handleNoteSelect, URL routing, view cleanup, loaded tracking)
 * has been extracted to useNoteNavigation hook.
 */
export const NotesPage = React.memo(function NotesPage(props: NotesPageProps) {
  const {
    notes, setNotes, activeNoteUid, setActiveNoteUid,
    isAuthenticated,
    notesSaveTimeout,
    view,
    setView, setSidebarView,
  } = props;

  const navigate = useNavigate();
  const location = useLocation();
  const noteCloudSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Custom event listeners for MainHeader integration ──
  // App.tsx dispatches these when user clicks export/import from header.
  // NotesPage relays them to modal components in App.tsx via event chain.
  useEffect(() => {
    const onOpenExport = () => {
      window.dispatchEvent(new CustomEvent('notes:open-export-modal'));
    };
    const onOpenImport = () => {
      window.dispatchEvent(new CustomEvent('notes:open-import-modal'));
    };
    window.addEventListener('notes:open-export', onOpenExport);
    window.addEventListener('notes:open-import', onOpenImport);
    return () => {
      window.removeEventListener('notes:open-export', onOpenExport);
      window.removeEventListener('notes:open-import', onOpenImport);
    };
  }, []);

  // ── Effect: Cache Preload (stale-while-revalidate) ──
  // Extracted from App.tsx lines 747-792
  useEffect(() => {
    if (isAuthenticated !== null || getSharePathInfo()) return;
    const notesMatch = location.pathname.match(/^\/notes\/([^/]+)/);
    if (notesMatch) {
      const uid = notesMatch[1];
      const titleCached = getTitleCache(uid);
      const contentCached = getContentCache(uid);

      if (titleCached || contentCached) {
        if (!notes.some(n => n.uid === uid)) {
          setView('notes');
          setSidebarView('notes');
          setActiveNoteUid(uid);
          setNotes(prev => prev.some(n => n.uid === uid) ? prev : [...prev, {
            uid,
            title: contentCached?.title || titleCached?.title || 'Untitled',
            projects: titleCached?.projectName ? { name: titleCached.projectName } : undefined,
            content: contentCached?.content,
          } as any]);
        }
      } else {
        localPersistence.getDraft(DraftType.NOTES, uid).then(draft => {
          if (!draft || !draft.data) return;
          try {
            const parsed = JSON.parse(draft.data);
            const draftContent = parsed.content || '';
            if (draftContent && !notes.some(n => n.uid === uid && n.content)) {
              setView('notes');
              setSidebarView('notes');
              setActiveNoteUid(uid);
              setNotes(prev => prev.some(n => n.uid === uid && n.content) ? prev : [...prev, {
                uid,
                title: parsed.title || 'Untitled',
                content: draftContent,
              } as any]);
            }
          } catch {}
        }).catch(() => {});
      }
    }
  }, [location.pathname]);

  // ── Effect: Keyboard Shortcuts (notes only) ──
  // Extracted from App.tsx lines 1070-1080
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (view !== 'notes' || !activeNoteUid) return;
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('notes:open-export-modal'));
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('notes:open-import-modal'));
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [view, activeNoteUid]);

  // ── Effect: Cleanup timeouts on unmount ──
  useEffect(() => {
    return () => {
      if (notesSaveTimeout.current) clearTimeout(notesSaveTimeout.current);
      if (noteCloudSyncTimeoutRef.current) clearTimeout(noteCloudSyncTimeoutRef.current);
    };
  }, [notesSaveTimeout]);

  // Render nothing — all side effects only
  return null;
});

// ──────────────────────────────────────────
// Exported helpers for App.tsx
// ──────────────────────────────────────────

/**
 * Export/Import modal state — shared between NotesPage (keyboard shortcuts)
 * and App.tsx (MainHeader buttons + modal rendering) via custom events.
 *
 * App.tsx calls these setters in response to custom events.
 */
export function openExportNoteModal() {
  window.dispatchEvent(new CustomEvent('notes:open-export-modal'));
}

export function openImportNoteModal() {
  window.dispatchEvent(new CustomEvent('notes:open-import-modal'));
}
