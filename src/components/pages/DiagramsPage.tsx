import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Diagram } from '@/types';

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
export interface DiagramsPageProps {
  diagrams: Diagram[];
  activeDiagramId: number | string | null;
  handleDiagramSelect: (id: number | string) => Promise<void>;
  
  isAuthenticated: boolean | null;
  isERDItemLoading: boolean;

  view: string;
  setView: (view: any) => void;
  setSidebarView: (view: any) => void;

  lastLoadedDiagramIdRef: React.MutableRefObject<any>;
  lastDiagramLoadTimestampRef: React.MutableRefObject<number>;
}

/**
 * DiagramsPage — manages all diagrams-specific side effects.
 * 
 * Mounted unconditionally. Renders null (no visible DOM).
 * Handles:
 *  - URL routing for /diagrams/:id
 *  - View cleanup — navigate away from /diagrams/ when switching views
 *  - Diagram loaded tracking — keeps lastLoadedDiagramIdRef in sync
 */
export const DiagramsPage = React.memo(function DiagramsPage(props: DiagramsPageProps) {
  const {
    activeDiagramId,
    handleDiagramSelect,
    isAuthenticated,
    isERDItemLoading,
    view,
    setView,
    setSidebarView,
    lastLoadedDiagramIdRef,
    lastDiagramLoadTimestampRef,
  } = props;

  const navigate = useNavigate();
  const location = useLocation();

  // ── Effect: URL Routing for /diagrams/:id ──
  useEffect(() => {
    if (!isAuthenticated || getSharePathInfo()) return;
    
    const diagramMatch = location.pathname.match(/^\/diagrams\/([^/]+)/);
    if (diagramMatch) {
      const id = diagramMatch[1];
      if (String(activeDiagramId) !== String(id)) {
        setView('erd');
        setSidebarView('erd');
        handleDiagramSelect(id);
      }
    }
  }, [isAuthenticated, location.pathname, activeDiagramId, handleDiagramSelect, setView, setSidebarView]);

  // ── Effect: View Cleanup ──
  useEffect(() => {
    if (getSharePathInfo()) return;
    if (view !== 'erd' && location.pathname.startsWith('/diagrams/')) {
      navigate('/', { replace: true });
    }
  }, [view, location.pathname, navigate]);

  // ── Effect: Diagram Loaded Tracking ──
  useEffect(() => {
    if (activeDiagramId && !isERDItemLoading) {
      lastLoadedDiagramIdRef.current = activeDiagramId;
      lastDiagramLoadTimestampRef.current = Date.now();
    }
  }, [activeDiagramId, isERDItemLoading, lastLoadedDiagramIdRef, lastDiagramLoadTimestampRef]);

  // Render nothing — all side effects only
  return null;
});
