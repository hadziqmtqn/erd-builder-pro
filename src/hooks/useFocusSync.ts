import { useEffect, useRef } from 'react';
import { localPersistence } from '../lib/localPersistence';
import { getCachedDiagramVersion } from '../lib/diagramVersioning';
import { DraftType } from '../types';

const RESUME_CHECK_DELAY = 60_000;
const RESUME_CHECK_THROTTLE = 120_000;

export interface UseFocusSyncParams {
  isOnline: boolean;
  isAuthenticated: boolean | null;
  isPublicView: boolean;
  isRefreshing: boolean;
  isSyncing: boolean;
  isLocalSaving: boolean;
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

type ItemSnapshot = {
  version: number | null;
  updatedAt: number;
};

function readVersion(item: any): number | null {
  const value = Number(item?._version ?? item?.version);
  return Number.isFinite(value) ? value : null;
}

function readUpdatedAt(item: any): number {
  const value = item?.updated_at ?? item?.updatedAt;
  if (typeof value === 'number') return value;
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function snapshot(item: any): ItemSnapshot {
  return { version: readVersion(item), updatedAt: readUpdatedAt(item) };
}

function isRemoteNewer(remote: ItemSnapshot, baseline: ItemSnapshot): boolean {
  if (remote.version !== null && baseline.version !== null) {
    return remote.version > baseline.version;
  }
  return remote.updatedAt > baseline.updatedAt;
}

function isEditingControlFocused(): boolean {
  const active = document.activeElement;
  return !!active?.closest('input, textarea, [contenteditable="true"], .cm-editor');
}

/**
 * Refreshes only after a meaningful absence from the app.
 *
 * ERD uses a read-only version probe first. Other document types retain their
 * existing draft-staleness check, but never reload while a local save is active.
 */
export function useFocusSync(params: UseFocusSyncParams) {
  const {
    isOnline,
    isAuthenticated,
    isPublicView,
    isRefreshing,
    isSyncing,
    isLocalSaving,
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

  const lastFocusFetchRef = useRef(0);
  const lastInactiveAtRef = useRef(Date.now());
  const focusSyncRunningRef = useRef(false);
  const lastSeenDiagramRef = useRef<Record<string, ItemSnapshot>>({});

  useEffect(() => {
    const markInactive = () => {
      lastInactiveAtRef.current = Date.now();
    };

    const handleResume = async () => {
      const now = Date.now();
      if (document.visibilityState === 'hidden') return;
      if (now - lastInactiveAtRef.current < RESUME_CHECK_DELAY) return;
      if (!isOnline || !isAuthenticated || isPublicView || isRefreshing || isSyncing || isLocalSaving) return;
      if (focusSyncRunningRef.current || now - lastFocusFetchRef.current < RESUME_CHECK_THROTTLE) return;
      if (now - lastSaveCallRef.current < 10_000 || isEditingControlFocused()) return;

      lastFocusFetchRef.current = now;
      lastInactiveAtRef.current = now;
      focusSyncRunningRef.current = true;
      let didRefresh = false;
      const beginRefresh = () => {
        didRefresh = true;
        setIsRefreshing(true);
      };

      try {
        if (view === 'erd' && activeDiagramId) {
          if (await localPersistence.hasPendingSync(DraftType.ERD, activeDiagramId)) return;

          const remote = await selectDiagram(activeDiagramId, setActiveDiagramId, { silent: true, probe: true });
          if (!remote) return;

          const key = String(activeDiagramId);
          const current = diagrams.find(d => String(d.id) === key || String(d.uid) === key);
          const cachedVersion = await getCachedDiagramVersion(activeDiagramId);
          const baseline = lastSeenDiagramRef.current[key] || {
            version: cachedVersion ?? readVersion(current),
            updatedAt: readUpdatedAt(current),
          };
          const remoteSnapshot = snapshot(remote);

          if (isRemoteNewer(remoteSnapshot, baseline)) {
            beginRefresh();
            const refreshed = await selectDiagram(activeDiagramId, setActiveDiagramId, { silent: true });
            if (refreshed) lastSeenDiagramRef.current[key] = remoteSnapshot;
          } else {
            lastSeenDiagramRef.current[key] = remoteSnapshot;
          }
        } else if (view === 'notes' && activeNoteUid) {
          const draft = await localPersistence.getDraft(DraftType.NOTES, activeNoteUid);
          const cloudItem = notes.find(n => String(n.uid) === String(activeNoteUid));
          const isStale = cloudItem && draft && !draft.sync_pending && readUpdatedAt(cloudItem) > draft.updated_at;
          if (isStale) {
            beginRefresh();
            await localPersistence.deleteDraft(DraftType.NOTES, activeNoteUid);
            await selectNote(activeNoteUid, { silent: true, contentVersionAtStart: getContentVersion() });
          }
        } else if (view === 'drawings' && activeDrawingId) {
          const draft = await localPersistence.getDraft(DraftType.DRAWINGS, activeDrawingId);
          const cloudItem = drawings.find(d => String(d.id) === String(activeDrawingId) || (d.uid && String(d.uid) === String(activeDrawingId)));
          const isStale = cloudItem && draft && !draft.sync_pending && readUpdatedAt(cloudItem) > draft.updated_at;
          if (isStale) {
            beginRefresh();
            await localPersistence.deleteDraft(DraftType.DRAWINGS, activeDrawingId);
            await selectDrawing(activeDrawingId, { silent: true });
          }
        } else if (view === 'flowchart' && activeFlowchartId) {
          const draft = await localPersistence.getDraft(DraftType.FLOWCHART, activeFlowchartId);
          const cloudItem = flowcharts.find(f => String(f.id) === String(activeFlowchartId) || (f.uid && String(f.uid) === String(activeFlowchartId)));
          const isStale = cloudItem && draft && !draft.sync_pending && readUpdatedAt(cloudItem) > draft.updated_at;
          if (isStale) {
            beginRefresh();
            await localPersistence.deleteDraft(DraftType.FLOWCHART, activeFlowchartId);
            await selectFlowchart(String(activeFlowchartId), { silent: true });
          }
        }
      } catch (err) {
        console.warn('Background refresh on focus failed:', err);
      } finally {
        if (didRefresh) setIsRefreshing(false);
        focusSyncRunningRef.current = false;
      }
    };

    window.addEventListener('blur', markInactive);
    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', handleResume);
    return () => {
      window.removeEventListener('blur', markInactive);
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [
    isOnline, isAuthenticated, isPublicView, isRefreshing, isSyncing, isLocalSaving,
    view, activeDiagramId, activeNoteUid, activeDrawingId, activeFlowchartId,
    selectDiagram, selectNote, selectDrawing, selectFlowchart,
    setActiveDiagramId, diagrams, notes, drawings, flowcharts,
    setIsRefreshing, getContentVersion, lastSaveCallRef,
  ]);
}
