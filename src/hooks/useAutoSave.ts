import { useEffect, useRef } from 'react';
import { Node, Edge } from '@xyflow/react';
import { Entity, DraftType } from '@/types';
import { BroadcastMessageType } from './useBroadcastChannel';

export interface UseAutoSaveParams {
  saveCounter: number;
  isLocalSavingRef: { current: boolean };
  isIncomingSyncRef: { current: boolean };
  lastLoadedDiagramIdRef: { current: number | string | null };
  lastSaveCallRef: { current: number };
  isAuthenticated: boolean | null;
  isGuest: boolean;
  view: string;
  isPublicView: boolean;
  activeDiagramId: any;
  viewportRef: { current: any };
  saveDiagram: (nodes: Node<Entity>[], edges: Edge[], viewport: any) => Promise<void | boolean>;
  setIsLocalSaving: (val: boolean) => void;
  triggerDebouncedSync: () => void;
  broadcastMessage: (type: any, draftType: any, id: any) => void;
  isRefreshing: boolean;
  isERDItemLoading: boolean;
  // For visibility change flush
  activeNoteUid: any;
  notes: any[];
  saveNote: (note: any) => Promise<boolean>;
  activeDrawingId: any;
  drawings: any[];
  saveDrawing: (drawing: any) => Promise<boolean>;
  activeFlowchartId: any;
  flowcharts: any[];
  saveFlowchart: (flowchart: any) => Promise<any>;
  // For flushPendingSaves
  // For flushPendingSaves
  notesSaveTimeoutRef: { current: NodeJS.Timeout | null };
  drawingsSaveTimeoutRef: { current: NodeJS.Timeout | null };
  flowchartsSaveTimeoutRef: { current: NodeJS.Timeout | null };
  syncDrafts: () => Promise<void>;
  nodes: Node<Entity>[];
  edges: Edge[];
}

export function useAutoSave(params: UseAutoSaveParams) {
  const {
    saveCounter,
    isLocalSavingRef,
    isIncomingSyncRef,
    lastLoadedDiagramIdRef,
    lastSaveCallRef,
    isAuthenticated, isGuest, view, isPublicView,
    activeDiagramId, nodes, edges, viewportRef,
    saveDiagram, setIsLocalSaving, triggerDebouncedSync, broadcastMessage,
    isRefreshing, isERDItemLoading,
    activeNoteUid, notes, saveNote,
    activeDrawingId, drawings, saveDrawing,
    activeFlowchartId, flowcharts, saveFlowchart,
    notesSaveTimeoutRef, drawingsSaveTimeoutRef, flowchartsSaveTimeoutRef,
    syncDrafts,
  } = params;

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 🛡️ Track last processed saveCounter to skip effect on diagram navigation (no actual edits)
  const lastProcessedCounterRef = useRef(0);

  // Emergency Flush: Save immediately when switching tabs or minimizing
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isLocalSavingRef.current) {
        if (view === 'erd' && activeDiagramId) {
          saveDiagram(nodes, edges, viewportRef.current).then(() => {
            setIsLocalSaving(false);
            triggerDebouncedSync();
          });
        } else if (view === 'notes' && activeNoteUid) {
          const n = notes.find(n => String(n.uid) === String(activeNoteUid));
          if (n) {
            saveNote(n).then(() => {
              setIsLocalSaving(false);
              triggerDebouncedSync();
            });
          }
        } else if (view === 'drawings' && activeDrawingId) {
          const d = drawings.find(d => String(d.id) === String(activeDrawingId));
          if (d) {
            saveDrawing(d).then(() => {
              setIsLocalSaving(false);
              triggerDebouncedSync();
            });
          }
        } else if (view === 'flowchart' && activeFlowchartId) {
          const f = flowcharts.find(f => String(f.id) === String(activeFlowchartId) || (f.uid && String(f.uid) === String(activeFlowchartId)));
          if (f) {
            saveFlowchart(f).then(() => {
              setIsLocalSaving(false);
              triggerDebouncedSync();
            });
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [
    view, activeDiagramId, activeNoteUid, activeDrawingId, activeFlowchartId,
    nodes, edges, saveDiagram, saveNote, saveDrawing, saveFlowchart,
    triggerDebouncedSync, notes, drawings, flowcharts,
    isLocalSavingRef, setIsLocalSaving, viewportRef,
  ]);

  // 🔄 Track nodes/edges via refs to avoid re-triggering the effect on every change
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // ERD Auto-save
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    // 🛡️ Guard 1: Only trigger if saveCounter actually changed
    if (saveCounter === lastProcessedCounterRef.current) return;

    // Keep the counter pending until the open diagram is ready. The sidebar list's
    // loading state is unrelated: it may never load on a direct /diagrams/:id visit.
    if (!activeDiagramId || isRefreshing || isERDItemLoading) return;

    if (isIncomingSyncRef.current) return;
    
    // 🛡️ Guard 2: If we just saved (via handleEntityUpdate's immediate path), skip —
    // the save is already complete; consuming the counter prevents the duplicate auto-save.
    if (Date.now() - lastSaveCallRef.current < 100) {
      lastProcessedCounterRef.current = saveCounter;
      return;
    }

    if (!((isAuthenticated || isGuest) && view === 'erd' && !isPublicView)) {
      lastProcessedCounterRef.current = saveCounter;
      return;
    }

    setIsLocalSaving(true);

    saveTimeoutRef.current = setTimeout(async () => {
      // Only consume the counter once the timer really fires. If a dependency change
      // cancels this timer first, the next run must still see the edit as pending.
      lastProcessedCounterRef.current = saveCounter;

      if (Date.now() - lastSaveCallRef.current < 500) {
        setIsLocalSaving(false);
        return;
      }

      if (lastLoadedDiagramIdRef.current !== activeDiagramId) {
        setIsLocalSaving(false);
        return;
      }

      if (isRefreshing || isERDItemLoading) {
        setIsLocalSaving(false);
        return;
      }

      if (nodesRef.current.length === 0) {
        setIsLocalSaving(false);
        return;
      }

      await saveDiagram(nodesRef.current, edgesRef.current, viewportRef.current);
      lastSaveCallRef.current = Date.now();
      setIsLocalSaving(false);
      triggerDebouncedSync();
      broadcastMessage(BroadcastMessageType.DRAFT_UPDATED, DraftType.ERD, activeDiagramId);
    }, 800);
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      setIsLocalSaving(false);
    };
  }, [
    saveCounter, activeDiagramId, isAuthenticated, isGuest, view, saveDiagram,
    isPublicView, triggerDebouncedSync, broadcastMessage,
    isRefreshing, isERDItemLoading,
  ]);

  async function flushPendingSaves() {
    if (!isLocalSavingRef.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (notesSaveTimeoutRef.current) clearTimeout(notesSaveTimeoutRef.current);
    if (drawingsSaveTimeoutRef.current) clearTimeout(drawingsSaveTimeoutRef.current);
    if (flowchartsSaveTimeoutRef.current) clearTimeout(flowchartsSaveTimeoutRef.current);

    try {
      if (view === 'erd' && activeDiagramId) {
        if (await saveDiagram(nodes, edges, viewportRef.current) === false) throw new Error('Could not save the diagram.');
      } else if (view === 'notes' && activeNoteUid) {
        const n = notes.find(n => String(n.uid) === String(activeNoteUid));
        if (!n || !await saveNote(n)) throw new Error('Could not save the note.');
      } else if (view === 'drawings' && activeDrawingId) {
        const d = drawings.find(d => String(d.id) === String(activeDrawingId) || String(d.uid) === String(activeDrawingId));
        if (!d || !await saveDrawing(d)) throw new Error('Could not save the drawing.');
      } else if (view === 'flowchart' && activeFlowchartId) {
        const f = flowcharts.find(f => String(f.id) === String(activeFlowchartId) || (f.uid && String(f.uid) === String(activeFlowchartId)));
        if (!f || !await saveFlowchart(f)) throw new Error('Could not save the flowchart.');
      }
    } catch (err) {
      console.warn('[AutoSave] Flush save failed:', err);
      throw err;
    }

    lastSaveCallRef.current = Date.now();
    setIsLocalSaving(false);
    await syncDrafts();
  }

  return {
    saveTimeoutRef,
    flushPendingSaves,
  };
}
