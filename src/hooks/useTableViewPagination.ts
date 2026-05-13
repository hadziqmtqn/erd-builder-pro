import { useEffect } from 'react';

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────
export interface UseTableViewPaginationParams {
  view: string;
  hasActiveItem: boolean;
  isAuthenticated: boolean | null;
  isPublicView: boolean;
  selectedWorkspaceUid: string | null;
  tableSearchParams: URLSearchParams;
  projects: any[];
  fetchNotes: (...args: any[]) => void;
  fetchDiagrams: (...args: any[]) => void;
  fetchFlowcharts: (...args: any[]) => void;
  fetchDrawings: (...args: any[]) => void;
}

// ──────────────────────────────────────────
// View-to-fetch mapping
// ──────────────────────────────────────────
interface PaginationConfig {
  viewName: string;
  fetchFn: (...args: any[]) => void;
  /** 
   * Some fetch functions take different param structures.
   * If true, uses { page } as last param for fetchFlowcharts.
   * If false, uses pageNum as last param.
   */
  usesPageOption?: boolean;
}

const paginationConfigs: PaginationConfig[] = [
  { viewName: 'notes', fetchFn: undefined as any }, // resolved in hook
  { viewName: 'erd', fetchFn: undefined as any },
  { viewName: 'flowchart', fetchFn: undefined as any, usesPageOption: true },
  { viewName: 'drawings', fetchFn: undefined as any },
];

// ──────────────────────────────────────────
// Hook
// ──────────────────────────────────────────
/**
 * Server-side pagination for all 4 table views.
 *
 * Fires one useEffect per feature view (notes, erd, flowchart, drawings)
 * when table params change. Each effect checks: is the current view == this feature?
 * Are we in table mode (no active item)? Is the user authenticated?
 *
 * Extracted from App.tsx to eliminate 4 repetitive useEffect blocks (~52 lines).
 */
export function useTableViewPagination(params: UseTableViewPaginationParams) {
  const {
    view, hasActiveItem, isAuthenticated, isPublicView,
    selectedWorkspaceUid, tableSearchParams, projects,
    fetchNotes, fetchDiagrams, fetchFlowcharts, fetchDrawings,
  } = params;

  const handles = { notes: fetchNotes, erd: fetchDiagrams, flowchart: fetchFlowcharts, drawings: fetchDrawings };

  // 🗂 Server-side pagination: fetch notes
  useEffect(() => {
    const h = handles.notes;
    const isTableMode = view === 'notes' && !hasActiveItem;
    if (!isTableMode || !isAuthenticated || isPublicView) return;

    let projId: string | number | null = 'all';
    if (selectedWorkspaceUid) {
      const p = projects?.find((proj: any) => proj.uid === selectedWorkspaceUid);
      projId = p ? p.id : null;
    }
    const pageNum = parseInt(tableSearchParams.get('page') || '1', 10);
    h(false, projId, '', null, 10, pageNum);
  }, [view, hasActiveItem, selectedWorkspaceUid, tableSearchParams, projects, fetchNotes, isAuthenticated, isPublicView]);

  // 🗂 Server-side pagination: fetch erd
  useEffect(() => {
    const isTableMode = view === 'erd' && !hasActiveItem;
    if (!isTableMode || !isAuthenticated || isPublicView) return;

    let projId: string | number | null = 'all';
    if (selectedWorkspaceUid) {
      const p = projects?.find((proj: any) => proj.uid === selectedWorkspaceUid);
      projId = p ? p.id : null;
    }
    const pageNum = parseInt(tableSearchParams.get('page') || '1', 10);
    fetchDiagrams(false, projId, '', null, 10, pageNum);
  }, [view, hasActiveItem, selectedWorkspaceUid, tableSearchParams, projects, fetchDiagrams, isAuthenticated, isPublicView]);

  // 🗂 Server-side pagination: fetch flowcharts
  useEffect(() => {
    const isTableMode = view === 'flowchart' && !hasActiveItem;
    if (!isTableMode || !isAuthenticated || isPublicView) return;

    let projId: string | number | null = 'all';
    if (selectedWorkspaceUid) {
      const p = projects?.find((proj: any) => proj.uid === selectedWorkspaceUid);
      projId = p ? p.id : null;
    }
    const pageNum = parseInt(tableSearchParams.get('page') || '1', 10);
    fetchFlowcharts(false, projId, '', null, 10, { page: pageNum });
  }, [view, hasActiveItem, selectedWorkspaceUid, tableSearchParams, projects, fetchFlowcharts, isAuthenticated, isPublicView]);

  // 🗂 Server-side pagination: fetch drawings
  useEffect(() => {
    const isTableMode = view === 'drawings' && !hasActiveItem;
    if (!isTableMode || !isAuthenticated || isPublicView) return;

    let projId: string | number | null = 'all';
    if (selectedWorkspaceUid) {
      const p = projects?.find((proj: any) => proj.uid === selectedWorkspaceUid);
      projId = p ? p.id : null;
    }
    const pageNum = parseInt(tableSearchParams.get('page') || '1', 10);
    fetchDrawings(false, projId, '', null, 10, pageNum, { silent: true });
  }, [view, hasActiveItem, selectedWorkspaceUid, tableSearchParams, projects, fetchDrawings, isAuthenticated, isPublicView]);
}
