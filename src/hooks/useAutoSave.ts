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
  lastDiagramLoadTimestampRef: { current: number };
  isAuthenticated: boolean | null;
  isGuest: boolean;
  view: string;
  isPublicView: boolean;
  activeDiagramId: any;
  viewportRef: { current: any };
  saveDiagram: (nodes: Node<Entity>[], edges: Edge[], viewport: any) => Promise<void>;
  setIsLocalSaving: (val: boolean) => void;
  triggerDebouncedSync: () => void;
  broadcastMessage: (type: any, draftType: any, id: any) => void;
  isRefreshing: boolean;
  isERDItemLoading: boolean;
  isDiagramsLoading: boolean;
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
    lastDiagramLoadTimestampRef,
    isAuthenticated, isGuest, view, isPublicView,
    activeDiagramId, nodes, edges, viewportRef,
    saveDiagram, setIsLocalSaving, triggerDebouncedSync, broadcastMessage,
    isRefreshing, isERDItemLoading, isDiagramsLoading,
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
          const f = flowcharts.find(f => String(f.id) === String(activeFlowchartId));
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
    
    // 🛡️ Guard 2: Ignore any changes (like initial viewport jumps) for the first 2 seconds after load
    if (Date.now() - lastDiagramLoadTimestampRef.current < 2000) {
      lastProcessedCounterRef.current = saveCounter; // Consume the counter so it doesn't trigger later
      return;
    }

    lastProcessedCounterRef.current = saveCounter;

    if (activeDiagramId && (isAuthenticated || isGuest) && view === 'erd' && !isPublicView) {
      if (isIncomingSyncRef.current) {
        return;
      }

      setIsLocalSaving(true);

      saveTimeoutRef.current = setTimeout(async () => {
        // Double check load timestamp inside timeout just in case
        if (Date.now() - lastDiagramLoadTimestampRef.current < 2000) {
          setIsLocalSaving(false);
          return;
        }

        if (Date.now() - lastSaveCallRef.current < 500) {
          setIsLocalSaving(false);
          return;
        }

        if (lastLoadedDiagramIdRef.current !== activeDiagramId) {
          setIsLocalSaving(false);
          return;
        }

        if (isRefreshing || isERDItemLoading || isDiagramsLoading) {
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
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      setIsLocalSaving(false);
    };
  }, [saveCounter, activeDiagramId, isAuthenticated, isGuest, view, saveDiagram, isPublicView, triggerDebouncedSync, broadcastMessage, lastDiagramLoadTimestampRef]);

  async function flushPendingSaves() {
    if (!isLocalSavingRef.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (notesSaveTimeoutRef.current) clearTimeout(notesSaveTimeoutRef.current);
    if (drawingsSaveTimeoutRef.current) clearTimeout(drawingsSaveTimeoutRef.current);
    if (flowchartsSaveTimeoutRef.current) clearTimeout(flowchartsSaveTimeoutRef.current);

    try {
      if (view === 'erd' && activeDiagramId) {
        await saveDiagram(nodes, edges, viewportRef.current);
      } else if (view === 'notes' && activeNoteUid) {
        const n = notes.find(n => String(n.uid) === String(activeNoteUid));
        if (n) await saveNote(n);
      } else if (view === 'drawings' && activeDrawingId) {
        const d = drawings.find(d => String(d.id) === String(activeDrawingId));
        if (d) await saveDrawing(d);
      } else if (view === 'flowchart' && activeFlowchartId) {
        const f = flowcharts.find(f => String(f.id) === String(activeFlowchartId));
        if (f) await saveFlowchart(f);
      }
    } catch (err) {
      console.warn('[AutoSave] Flush save failed:', err);
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
