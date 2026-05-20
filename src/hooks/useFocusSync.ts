import { useEffect, useRef } from 'react';
import { localPersistence } from '../lib/localPersistence';
import { DraftType } from '../types';

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────
export interface UseFocusSyncParams {
  isOnline: boolean;
  isAuthenticated: boolean | null;
  isPublicView: boolean;
  isRefreshing: boolean;
  isSyncing: boolean;
  view: string;
  activeDiagramId: number | string | null;
  activeNoteUid: string | null;
  activeDrawingId: string | null;
  activeFlowchartId: number | string | null;
  selectDiagram: (...args: any[]) => any;
  selectNote: (...args: any[]) => any;
  selectDrawing: (...args: any[]) => any;
  selectFlowchart: (...args: any[]) => any;
  setActiveDiagramId: (id: any) => void;
  diagrams: any[];
  notes: any[];
  drawings: any[];
  flowcharts: any[];
  setIsRefreshing: (v: boolean) => void;
  getContentVersion: () => number;
  /** Shared ref for timing last save — set by auto-save hooks */
  lastSaveCallRef: React.MutableRefObject<number>;
}

// ──────────────────────────────────────────
// Hook
// ──────────────────────────────────────────
/**
 * Intelligent Fetch on Focus: Refresh data when returning to tab.
 *
 * - Only refreshes when online, authenticated, and not in public view
 * - Throttled: at most once per 120 seconds
 * - Checks stale drafts: if cloud is newer than local draft, reloads from server
 *
 * Extracted from App.tsx to keep focus sync logic contained.
 */
export function useFocusSync(params: UseFocusSyncParams) {
  const {
    isOnline,
    isAuthenticated,
    isPublicView,
    isRefreshing,
    isSyncing,
    view,
    activeDiagramId,
    activeNoteUid,
    activeDrawingId,
    activeFlowchartId,
    selectDiagram,
    selectNote,
    selectDrawing,
    selectFlowchart,
    setActiveDiagramId,
    diagrams,
    notes,
    drawings,
    flowcharts,
    setIsRefreshing,
    getContentVersion,
    lastSaveCallRef,
  } = params;

  const lastFocusFetchRef = useRef<number>(0);

  useEffect(() => {
    const handleFocus = async () => {
      // Only refresh if online, authenticated, not in public view, and not currently saving/syncing
      if (!isOnline || !isAuthenticated || isPublicView || isRefreshing || isSyncing) return;

      // Throttle: don't refresh more than once every 120 seconds (2 minutes)
      const now = Date.now();
      if (now - lastFocusFetchRef.current < 120000) return;

      // SAFETY: Don't refresh if we have a very recent local save (within 10 seconds)
      if (now - lastSaveCallRef.current < 10000) return;

      lastFocusFetchRef.current = now;

      try {
        // Only check stale drafts for active document — no full project refetch
        if (view === 'erd') {
          if (activeDiagramId) {
            const draft = await localPersistence.getDraft(DraftType.ERD, activeDiagramId);
            const cloudItem = diagrams.find(d => String(d.id) === String(activeDiagramId));
            const isStale = cloudItem && draft && !draft.sync_pending && (new Date(cloudItem.updated_at).getTime() > draft.updated_at);

            if (isStale) {
              console.log("[FocusSync] Cloud is newer, reloading ERD...");
              setIsRefreshing(true);
              await localPersistence.deleteDraft(DraftType.ERD, activeDiagramId);
              await selectDiagram(activeDiagramId, setActiveDiagramId, { silent: true });
              setIsRefreshing(false);
            } else if (!(await localPersistence.hasPendingSync(DraftType.ERD, activeDiagramId))) {
              await selectDiagram(activeDiagramId, setActiveDiagramId, { silent: true });
            }
          }
        } else if (view === 'notes') {
          if (activeNoteUid) {
            const draft = await localPersistence.getDraft(DraftType.NOTES, activeNoteUid);
            const cloudItem = notes.find(n => String(n.uid) === String(activeNoteUid));
            const isStale = cloudItem && draft && !draft.sync_pending && (new Date(cloudItem.updated_at).getTime() > draft.updated_at);

            if (isStale) {
              console.log("[FocusSync] Cloud is newer, reloading Note...");
              setIsRefreshing(true);
              await localPersistence.deleteDraft(DraftType.NOTES, activeNoteUid);
              await selectNote(activeNoteUid, { silent: true, contentVersionAtStart: getContentVersion() });
              setIsRefreshing(false);
            } else if (!(await localPersistence.hasPendingSync(DraftType.NOTES, activeNoteUid))) {
              await selectNote(activeNoteUid, { silent: true, contentVersionAtStart: getContentVersion() });
            }
          }
        } else if (view === 'drawings') {
          if (activeDrawingId) {
            const draft = await localPersistence.getDraft(DraftType.DRAWINGS, activeDrawingId);
            const cloudItem = drawings.find(d => String(d.id) === String(activeDrawingId) || (d.uid && String(d.uid) === String(activeDrawingId)));
            const isStale = cloudItem && draft && !draft.sync_pending && (new Date(cloudItem.updated_at).getTime() > draft.updated_at);

            if (isStale) {
              await localPersistence.deleteDraft(DraftType.DRAWINGS, activeDrawingId);
              await selectDrawing(activeDrawingId, { silent: true });
            } else if (!(await localPersistence.hasPendingSync(DraftType.DRAWINGS, activeDrawingId))) {
              await selectDrawing(activeDrawingId, { silent: true });
            }
          }
        } else if (view === 'flowchart') {
          if (activeFlowchartId) {
            const draft = await localPersistence.getDraft(DraftType.FLOWCHART, activeFlowchartId);
            const cloudItem = flowcharts.find(f => String(f.id) === String(activeFlowchartId) || (f.uid && String(f.uid) === String(activeFlowchartId)));
            const isStale = cloudItem && draft && !draft.sync_pending && (new Date(cloudItem.updated_at).getTime() > draft.updated_at);

            if (isStale) {
              await localPersistence.deleteDraft(DraftType.FLOWCHART, activeFlowchartId);
              await selectFlowchart(String(activeFlowchartId), { silent: true });
            } else if (!(await localPersistence.hasPendingSync(DraftType.FLOWCHART, activeFlowchartId))) {
              await selectFlowchart(String(activeFlowchartId), { silent: true });
            }
          }
        }
      } catch (err) {
        console.warn("Background refresh on focus failed:", err);
      } finally {
        setIsRefreshing(false);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [
    isOnline, isAuthenticated, isPublicView, isRefreshing, isSyncing,
    view,
    activeDiagramId, activeNoteUid, activeDrawingId, activeFlowchartId,
    selectDiagram, selectNote, selectDrawing, selectFlowchart,
    setActiveDiagramId,
    diagrams, notes, drawings, flowcharts,
    setIsRefreshing,
    getContentVersion,
    lastSaveCallRef,
  ]);
}
