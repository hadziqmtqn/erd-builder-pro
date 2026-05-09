import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Note, Project } from '../types';
import { getSharePathInfo } from '../lib/urlUtils';

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────
export interface UseNoteNavigationProps {
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  activeNoteUid: string | null;
  setActiveNoteUid: (uid: string | null) => void;
  view: string;
  setView: (view: any) => void;
  setSidebarView: (view: any) => void;
  selectNote: (uid: string, options?: any) => Promise<any>;
  flushPendingSaves: () => Promise<void>;
  isAuthenticated: boolean | null;
  getContentVersion: () => number;
  projects: Project[];
  /** Ref for note loaded tracking — created by parent so useAutoSave can share it */
  lastLoadedNoteIdRef: { current: any };
}

// ──────────────────────────────────────────
// Return type
// ──────────────────────────────────────────
export interface UseNoteNavigationReturn {
  handleNoteSelect: (uid: string) => Promise<void>;
}

// ──────────────────────────────────────────
// Hook
// ──────────────────────────────────────────
export function useNoteNavigation(props: UseNoteNavigationProps): UseNoteNavigationReturn {
  const {
    notes,
    setNotes,
    activeNoteUid,
    setActiveNoteUid,
    view,
    setView,
    setSidebarView,
    selectNote,
    flushPendingSaves,
    isAuthenticated,
    getContentVersion,
    projects,
    lastLoadedNoteIdRef,
  } = props;

  const navigate = useNavigate();
  const location = useLocation();

  // ── Stable refs for useCallback (break dependency on frequently-changing values) ──
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const activeNoteUidRef = useRef(activeNoteUid);
  activeNoteUidRef.current = activeNoteUid;
  const viewRef = useRef(view);
  viewRef.current = view;
  const selectNoteRef = useRef(selectNote);
  selectNoteRef.current = selectNote;
  const flushPendingSavesRef = useRef(flushPendingSaves);
  flushPendingSavesRef.current = flushPendingSaves;
  // Stable versions of functions that are recreated every render
  const selectNoteStable = useCallback((uid: string, options?: any) => selectNoteRef.current(uid, options), []);
  const flushPendingSavesStable = useCallback(() => flushPendingSavesRef.current(), []);

  // ── Internal refs ──
  const lastProcessedNotesUrlRef = useRef('');
  const lastSelectedNoteRef = useRef<{ uid: string; time: number } | null>(null);

  // ── handleNoteSelect: the core orchestration ──
  const handleNoteSelect = useCallback(async (uid: string) => {
    // Guard: prevent sequential duplicate within 1.5s (e.g. double-click, Effect 1 + sidebar)
    const now = Date.now();
    if (lastSelectedNoteRef.current?.uid === uid && now - lastSelectedNoteRef.current.time < 1500) {
      return;
    }
    lastSelectedNoteRef.current = { uid, time: now };
    
    // Capture content version before any async work. If user edits between now
    // and selectNote's API/IndexedDB response, the version changes and selectNote
    // skips overwriting their in-flight edits.
    const versionAtStart = getContentVersion();
    await flushPendingSavesStable();
    setView('notes');
    setSidebarView('notes');
    // Set activeNoteUid early so breadcrumb can appear from list data (fetchProjects)
    // before selectNote's detail API call completes
    setActiveNoteUid(uid);
    // Clear current note content to avoid showing stale data while loading,
    // BUT only if we don't have cached content (stale-while-revalidate).
    // If cached content is already visible, keep it while API loads in background.
    setNotes(prev => prev.map(n => n.uid === uid ? {
      ...n,
      content: n.content !== undefined ? n.content : undefined,
    } : n));
    // Mark this URL as processed before navigate, so the URL effect skips its
    // own handleNoteSelect call (preventing double API load)
    lastProcessedNotesUrlRef.current = '/notes/' + uid;
    if (!getSharePathInfo() && location.pathname !== '/notes/' + uid) {
      navigate('/notes/' + uid);
    }
    // Pass fallbackNote from projects data — selectNote uses it directly
    // instead of waiting for notesRef to update on the next React render
    const currentProjects = projectsRef.current;
    const fromProjects = (currentProjects as any[])
      ?.flatMap((p: any) => p.notes || [])
      .find((n: any) => n.uid === uid);
    await selectNoteStable(uid, {
      contentVersionAtStart: versionAtStart,
      fallbackNote: fromProjects,
    });
    lastLoadedNoteIdRef.current = uid;
  }, [
    navigate,
    location.pathname,
    setActiveNoteUid,
    setView,
    setSidebarView,
    setNotes,
    getContentVersion,
  ]);

  // ── Effect 1: URL Routing for /notes/:uid ──
  // Originally in App.tsx (lastProcessedNotesUrlRef + useEffect)
  useEffect(() => {
    if (!isAuthenticated || getSharePathInfo()) return;
    if (lastProcessedNotesUrlRef.current === location.pathname) return;
    const m = location.pathname.match(/^\/notes\/([^/]+)/);
    if (m) {
      lastProcessedNotesUrlRef.current = location.pathname;
      handleNoteSelect(m[1]);
    }
  }, [isAuthenticated, location.pathname, handleNoteSelect]);

  // ── Effect 2: View Cleanup ──
  // Navigate away from /notes/ when switching to a non-notes view
  // (moved from NotesPage.tsx)
  useEffect(() => {
    if (getSharePathInfo()) return;
    if (view !== 'notes' && location.pathname.startsWith('/notes/')) {
      navigate('/', { replace: true });
    }
  }, [view, location.pathname, navigate]);

  // ── Effect 3: Note Loaded Tracking ──
  // Update refs when a note finishes loading
  // (moved from NotesPage.tsx)
  useEffect(() => {
    if (activeNoteUid) {
      lastLoadedNoteIdRef.current = activeNoteUid;
    }
  }, [activeNoteUid, lastLoadedNoteIdRef]);

  return {
    handleNoteSelect,
  };
}
