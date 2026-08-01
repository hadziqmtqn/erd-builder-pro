import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Flowchart, Project } from '../types';
import { getSharePathInfo } from '../lib/urlUtils';

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────
export interface UseFlowchartNavigationProps {
  flowcharts: Flowchart[];
  setFlowcharts: React.Dispatch<React.SetStateAction<Flowchart[]>>;
  activeFlowchartId: number | string | null;
  setActiveFlowchartId: (id: any) => void;
  view: string;
  setView: (view: any) => void;
  setSidebarView: (view: any) => void;
  selectFlowchart: (uid: string, options?: any) => Promise<any>;
  flushPendingSaves: () => Promise<void>;
  isAuthenticated: boolean | null;
  projects: Project[];
  /** Ref for flowchart loaded tracking — created by parent so useAutoSave can share it */
  lastLoadedFlowchartIdRef: { current: any };
}

// ──────────────────────────────────────────
// Return type
// ──────────────────────────────────────────
export interface UseFlowchartNavigationReturn {
  handleFlowchartSelect: (uid: string) => Promise<void>;
}

// ──────────────────────────────────────────
// Hook
// ──────────────────────────────────────────
export function useFlowchartNavigation(props: UseFlowchartNavigationProps): UseFlowchartNavigationReturn {
  const {
    flowcharts,
    setFlowcharts,
    activeFlowchartId,
    setActiveFlowchartId,
    view,
    setView,
    setSidebarView,
    selectFlowchart,
    flushPendingSaves,
    isAuthenticated,
    projects,
    lastLoadedFlowchartIdRef,
  } = props;

  const navigate = useNavigate();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  // ── Stable refs for useCallback ──
  const flowchartsRef = useRef(flowcharts);
  flowchartsRef.current = flowcharts;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const activeFlowchartIdRef = useRef(activeFlowchartId);
  activeFlowchartIdRef.current = activeFlowchartId;
  const viewRef = useRef(view);
  viewRef.current = view;
  const selectFlowchartRef = useRef(selectFlowchart);
  selectFlowchartRef.current = selectFlowchart;
  const flushPendingSavesRef = useRef(flushPendingSaves);
  flushPendingSavesRef.current = flushPendingSaves;
  // Stable versions
  const selectFlowchartStable = useCallback((uid: string, options?: any) => selectFlowchartRef.current(uid, options), []);
  const flushPendingSavesStable = useCallback(() => flushPendingSavesRef.current(), []);

  // ── Internal refs ──
  const lastProcessedFlowchartsUrlRef = useRef('');
  const lastProcessedFlowchartsUrlTimeRef = useRef(0);
  const lastSelectedFlowchartRef = useRef<{ uid: string; time: number } | null>(null);

  // ── handleFlowchartSelect: the core orchestration ──
  const handleFlowchartSelect = useCallback(async (uid: string) => {
    const targetPath = '/flowcharts/' + uid;
    const isRouteSelection = pathnameRef.current === targetPath;
    // Guard: prevent sequential duplicate within 1.5s
    const now = Date.now();
    if (lastSelectedFlowchartRef.current?.uid === uid && now - lastSelectedFlowchartRef.current.time < 1500) {
      return;
    }
    lastSelectedFlowchartRef.current = { uid, time: now };

    // Guard: same flowchart already active (compare by uid)
    if (String(activeFlowchartIdRef.current) === uid && viewRef.current === 'flowchart') {
      return;
    }

    await flushPendingSavesStable();
    if (isRouteSelection && pathnameRef.current !== targetPath) return;
    setView('flowchart');
    setSidebarView('flowchart');
    setActiveFlowchartId(uid);

    // Clear current flowchart data to avoid stale display while loading
    setFlowcharts(prev => prev.map(f => f.uid === uid ? { ...f, data: undefined } : f));

    // Mark this URL as processed before navigate, so URL effect skips its own call
    lastProcessedFlowchartsUrlRef.current = targetPath;
    lastProcessedFlowchartsUrlTimeRef.current = Date.now();
    if (!getSharePathInfo() && pathnameRef.current !== targetPath) {
      navigate(targetPath);
    }

    // Pass fallback from projects data (same pattern as notes)
    const currentProjects = projectsRef.current;
    const fromProjects = (currentProjects as any[])
      ?.flatMap((p: any) => p.flowcharts || [])
      .find((f: any) => f.uid === uid);

    await selectFlowchartStable(uid, {
      fallbackFlowchart: fromProjects,
    });
    lastLoadedFlowchartIdRef.current = uid;
  }, [
    navigate,
    location.pathname,
    setActiveFlowchartId,
    setView,
    setSidebarView,
    setFlowcharts,
  ]);

  // ── Effect 1: URL Routing for /flowcharts/:uid ──
  useEffect(() => {
    if (!isAuthenticated || getSharePathInfo()) return;
    if (lastProcessedFlowchartsUrlRef.current === location.pathname) return;
    const m = location.pathname.match(/^\/flowcharts\/([^/]+)/);
    if (m) {
      lastProcessedFlowchartsUrlRef.current = location.pathname;
      handleFlowchartSelect(m[1]);
    }
  }, [isAuthenticated, location.pathname, handleFlowchartSelect]);

  // ── Effect 2: Flowchart Loaded Tracking ──
  useEffect(() => {
    if (activeFlowchartId) {
      lastLoadedFlowchartIdRef.current = activeFlowchartId;
    }
  }, [activeFlowchartId, lastLoadedFlowchartIdRef]);

  return {
    handleFlowchartSelect,
  };
}
