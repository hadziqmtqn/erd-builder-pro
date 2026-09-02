import { useEffect } from 'react';

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────
export interface UseTableViewPaginationParams {
  view: string;
  pathname: string;
  hasActiveItem: boolean;
  isAuthenticated: boolean | null;
  isPublicView: boolean;
  selectedWorkspaceUid: string | null;
  tableSearchParams: URLSearchParams;
  projects: any[];
  fileSearchQuery?: string;
  fetchNotes: (...args: any[]) => void;
  fetchDiagrams: (...args: any[]) => void;
  fetchFlowcharts: (...args: any[]) => void;
  fetchDrawings: (...args: any[]) => void;
  tableRefreshKey: number;
  tableLoadingState: 'idle' | 'loading';
  setTableLoadingState: (state: 'idle' | 'loading') => void;
}

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
 * Loading spinner shows only when tableLoadingState='loading' (user-initiated actions
 * like delete, page change, workspace filter). Passive changes (search debounce, auth,
 * initial mount) use silent fetch to avoid flicker.
 */
export function useTableViewPagination(params: UseTableViewPaginationParams) {
  const {
    view, pathname, hasActiveItem, isAuthenticated, isPublicView,
    selectedWorkspaceUid, tableSearchParams, projects,
    fileSearchQuery = '',
    fetchNotes, fetchDiagrams, fetchFlowcharts, fetchDrawings,
    tableRefreshKey,
    tableLoadingState, setTableLoadingState,
  } = params;

  // Only fetch paginated data when on an actual table route. Editor routes load
  // their selected item directly and must not compete with an unused list request.
  const isTableView = pathname.startsWith('/table/');
  const isDbClientTable = pathname === '/table/db-client';

  // Resolve workspace filter identifier (uid or numeric id) to a project id
  // for the API call. Falls back to id when uid is null (e.g. SQLite).
  function resolveProjectId(uid: string | null): string | number | null {
    if (!uid) return 'all';
    const p = projects?.find((proj: any) =>
      proj.uid === uid || String(proj.id) === uid
    );
    return p ? p.id : 'all';
  }

  const handles = { notes: fetchNotes, erd: fetchDiagrams, flowchart: fetchFlowcharts, drawings: fetchDrawings };

  function computeOpts(silent: boolean, pageNum?: number) {
    if (silent) return pageNum !== undefined ? { silent: true, page: pageNum } : { silent: true };
    return pageNum !== undefined ? { page: pageNum } : {};
  }

  function triggerFetch(
    h: (...args: any[]) => any,
    projId: string | number | null,
    pageNum: number,
    opts: Record<string, any>
  ) {
    const isUserAction = tableLoadingState === 'loading';
    const options = isUserAction ? computeOpts(false, opts.page) : computeOpts(true, opts.page);
    const result = h(false, projId, fileSearchQuery, null, 10, pageNum, options);
    if (isUserAction && result?.then) {
      result.then(() => setTableLoadingState('idle')).catch(() => setTableLoadingState('idle'));
    }
  }

  // 🗂 Server-side pagination: fetch notes
  useEffect(() => {
    const h = handles.notes;
    const isTableMode = view === 'notes' && !hasActiveItem && isTableView;
    if (!isTableMode || !isAuthenticated || isPublicView) return;

    const projId = resolveProjectId(selectedWorkspaceUid);
    const pageNum = parseInt(tableSearchParams.get('page') || '1', 10);
    triggerFetch(h, projId, pageNum, {});
  }, [view, pathname, hasActiveItem, selectedWorkspaceUid, tableSearchParams, projects, fetchNotes, isAuthenticated, isPublicView, fileSearchQuery, tableRefreshKey]);

  // 🗂 Server-side pagination: fetch erd
  useEffect(() => {
    const isTableMode = view === 'erd' && !hasActiveItem && isTableView && !isDbClientTable;
    if (!isTableMode || !isAuthenticated || isPublicView) return;

    const projId = resolveProjectId(selectedWorkspaceUid);
    const pageNum = parseInt(tableSearchParams.get('page') || '1', 10);
    const isUserAction = tableLoadingState === 'loading';
    const options = isUserAction ? { page: pageNum, sourceType: 'blank' } : { silent: true, page: pageNum, sourceType: 'blank' };
    const promise = (fetchDiagrams as (...args: any[]) => Promise<any>)(false, projId, fileSearchQuery, null, 10, pageNum, options);
    if (isUserAction && promise?.then) promise.then(() => setTableLoadingState('idle')).catch(() => setTableLoadingState('idle'));
  }, [view, pathname, hasActiveItem, selectedWorkspaceUid, tableSearchParams, projects, fetchDiagrams, isAuthenticated, isPublicView, fileSearchQuery, tableRefreshKey, isDbClientTable, tableLoadingState]);

  // 🗂 Server-side pagination: fetch flowcharts
  useEffect(() => {
    const isTableMode = view === 'flowchart' && !hasActiveItem && isTableView;
    if (!isTableMode || !isAuthenticated || isPublicView) return;

    const projId = resolveProjectId(selectedWorkspaceUid);
    const pageNum = parseInt(tableSearchParams.get('page') || '1', 10);
    const isUserAction = tableLoadingState === 'loading';
    const options = isUserAction ? { page: pageNum } : { silent: true, page: pageNum };
    const promise = (fetchFlowcharts as (...args: any[]) => Promise<any>)(false, projId, fileSearchQuery, null, 10, options);
    if (isUserAction && promise?.then) {
      promise.then(() => setTableLoadingState('idle')).catch(() => setTableLoadingState('idle'));
    }
  }, [view, pathname, hasActiveItem, selectedWorkspaceUid, tableSearchParams, projects, fetchFlowcharts, isAuthenticated, isPublicView, fileSearchQuery, tableRefreshKey]);

  // 🗂 Server-side pagination: fetch drawings
  useEffect(() => {
    const isTableMode = view === 'drawings' && !hasActiveItem && isTableView;
    if (!isTableMode || !isAuthenticated || isPublicView) return;

    const projId = resolveProjectId(selectedWorkspaceUid);
    const pageNum = parseInt(tableSearchParams.get('page') || '1', 10);
    triggerFetch(fetchDrawings, projId, pageNum, {});
  }, [view, pathname, hasActiveItem, selectedWorkspaceUid, tableSearchParams, projects, fetchDrawings, isAuthenticated, isPublicView, fileSearchQuery, tableRefreshKey]);
}
