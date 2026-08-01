import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Diagram } from '../types';
import { getSharePathInfo } from '../lib/urlUtils';

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────
export interface UseDiagramNavigationProps {
  diagrams: Diagram[];
  setDiagrams: (diagrams: Diagram[] | ((prev: Diagram[]) => Diagram[])) => void;
  activeDiagramId: number | string | null;
  setActiveDiagramId: (id: any) => void;
  view: string;
  setView: (view: any) => void;
  setSidebarView: (view: any) => void;
  setNodes: (nodes: any[] | ((prev: any[]) => any[])) => void;
  setEdges: (edges: any[] | ((prev: any[]) => any[])) => void;
  selectDiagram: (id: any, callback?: any, options?: any) => Promise<any>;
  flushPendingSaves: () => Promise<void>;
  isAuthenticated: boolean | null;
  isERDItemLoading: boolean;
  /** Ref for diagram loaded tracking — created by parent so useAutoSave can share it */
  lastLoadedDiagramIdRef: { current: number | string | null };
  /** Ref for diagram load timestamp — created by parent so useAutoSave can share it */
  lastDiagramLoadTimestampRef: { current: number };
}

// ──────────────────────────────────────────
// Return type
// ──────────────────────────────────────────
export interface UseDiagramNavigationReturn {
  handleDiagramSelect: (id: number | string) => Promise<void>;
}

// ──────────────────────────────────────────
// Hook
// ──────────────────────────────────────────
export function useDiagramNavigation(props: UseDiagramNavigationProps): UseDiagramNavigationReturn {
  const {
    diagrams,
    setDiagrams,
    activeDiagramId,
    setActiveDiagramId,
    view,
    setView,
    setSidebarView,
    setNodes,
    setEdges,
    selectDiagram,
    flushPendingSaves,
    isAuthenticated,
    isERDItemLoading,
    lastLoadedDiagramIdRef,
    lastDiagramLoadTimestampRef,
  } = props;

  const navigate = useNavigate();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  // ── Stable refs for useCallback (break dependency on frequently-changing values) ──
  const diagramsRef = useRef(diagrams);
  diagramsRef.current = diagrams;
  const activeDiagramIdRef = useRef(activeDiagramId);
  activeDiagramIdRef.current = activeDiagramId;
  const viewRef = useRef(view);
  viewRef.current = view;

  // ── Internal refs (not exposed) ──
  const lastProcessedDiagramUrlRef = useRef('');
  const diagramTargetRef = useRef<number | string | null>(null);
  const isSwitchingDiagramRef = useRef(false);

  // ── handleDiagramSelect: the core orchestration ──
  const handleDiagramSelect = useCallback(async (id: number | string) => {
    // Re-entrant guard: prevents URL effect from re-triggering during a user's
    // click-originated diagram switch
    if (isSwitchingDiagramRef.current) return;
    isSwitchingDiagramRef.current = true;
    diagramTargetRef.current = id;

    const currentDiagrams = diagramsRef.current;
    const currentActiveId = activeDiagramIdRef.current;
    const currentView = viewRef.current;
    const currentPathname = location.pathname;

    try {
      // Resolve URL identifier (prefer UID)
      const diagram = currentDiagrams.find(
        (d) => String(d.id) === String(id) || d.uid === id,
      );
      const urlIdentifier = diagram?.uid || id;
      const targetPath = '/diagrams/' + urlIdentifier;
      const isRouteSelection = pathnameRef.current === targetPath;

      // Already on this diagram — just ensure URL is correct
      if (currentActiveId === id && currentView === 'erd') {
        if (!currentPathname.startsWith('/diagrams/')) {
          navigate('/diagrams/' + urlIdentifier);
        }
        isSwitchingDiagramRef.current = false;
        return;
      }

      // Flush pending saves before switching
      await flushPendingSaves();
      if (isRouteSelection && pathnameRef.current !== targetPath) return;

      // Set ref + navigate BEFORE state updates so the DiagramsPage URL effect
      // (now in this hook's own useEffect) sees the correct pathname
      lastProcessedDiagramUrlRef.current = targetPath;
      if (!getSharePathInfo() && pathnameRef.current !== targetPath) {
        navigate(targetPath);
      }

      // State updates (batched by React 18)
      setActiveDiagramId(urlIdentifier);
      setView('erd');
      setNodes([]);
      setEdges([]);

      // Fetch diagram data with stale-response guard
      // Use urlIdentifier (prefers uid) so useERDSession.handleDiagramSelect
      // sets activeDiagramId to UUID instead of numeric id
      const loadedData = await selectDiagram(urlIdentifier, (newId: any) => {
        setActiveDiagramId(newId);
        lastLoadedDiagramIdRef.current = newId;
      }, { isStale: () => diagramTargetRef.current !== id });

      // Add loaded diagram to state if newly created (e.g., from DB import)
      // Must use functional updater + check prev to avoid race with fetchDiagrams
      if (loadedData) {
        setDiagrams(prev => {
          if (prev.some(d => String(d.id) === String(loadedData.id) || (d.uid && d.uid === loadedData.uid))) {
            return prev; // already in list — no duplicate
          }
          return [loadedData, ...prev];
        });
      }
    } finally {
      isSwitchingDiagramRef.current = false;
    }
  }, [
    // Stable deps — most values read via refs above
    navigate,
    location.pathname,
    setActiveDiagramId,
    setView,
    setNodes,
    setEdges,
    selectDiagram,
    flushPendingSaves,
  ]);

  // ── Effect 1: URL Routing for /diagrams/:id ──
  // Originally in DiagramsPage.tsx
  useEffect(() => {
    if (!isAuthenticated || getSharePathInfo()) return;

    // Already handled by handleDiagramSelect's own navigate call
    if (lastProcessedDiagramUrlRef.current === location.pathname) return;

    const diagramMatch = location.pathname.match(/^\/diagrams\/([^/]+)/);
    if (diagramMatch) {
      const id = diagramMatch[1];
      lastProcessedDiagramUrlRef.current = location.pathname;
      if (String(activeDiagramId) !== String(id)) {
        setView('erd');
        setSidebarView('erd');
        handleDiagramSelect(id);
      }
    }
  }, [
    isAuthenticated,
    location.pathname,
    activeDiagramId,
    handleDiagramSelect,
    setView,
    setSidebarView,
  ]);

  // ── Effect 2: Diagram Loaded Tracking ──
  // Update refs when a diagram finishes loading
  useEffect(() => {
    if (activeDiagramId && !isERDItemLoading) {
      lastLoadedDiagramIdRef.current = activeDiagramId;
      lastDiagramLoadTimestampRef.current = Date.now();
    }
  }, [activeDiagramId, isERDItemLoading]);

  return {
    handleDiagramSelect,
  };
}
