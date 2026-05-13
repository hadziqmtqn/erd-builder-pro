import { useCallback, useRef } from 'react';
import { DraftType } from '../types';
import { BroadcastMessageType } from './useBroadcastChannel';

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────
export interface UseFlowchartChangeHandlerParams {
  activeFlowchartId: string | number | null;
  /** Refs managed by parent — shared across hooks */
  isIncomingSyncRef: React.MutableRefObject<boolean>;
  flowchartsRef: React.MutableRefObject<any[]>;
  lastLoadedFlowchartIdRef: React.MutableRefObject<any>;
  /** Timestamp of last save — shared across all document types for focus fetch throttling */
  lastSaveCallRef: React.MutableRefObject<number>;
  /** Parent state setters */
  setIsLocalSaving: (val: boolean) => void;
  saveFlowchart: (flowchart: any) => Promise<any>;
  setFlowcharts: React.Dispatch<React.SetStateAction<any[]>>;
  broadcastMessage: (type: any, draftType: any, id: any) => void;
  triggerDebouncedSync: () => void;
  /** Parent state values */
  isRefreshing: boolean;
  isFlowchartItemLoading: boolean;
}

// ──────────────────────────────────────────
// Return type
// ──────────────────────────────────────────
export interface UseFlowchartChangeHandlerReturn {
  handleFlowchartChange: (nodesData: any[], edgesData: any[]) => void;
  /** Timeout ref for auto-save — shared with useAutoSave for flushPendingSaves */
  flowchartsSaveTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

// ──────────────────────────────────────────
// Hook
// ──────────────────────────────────────────
/**
 * Manages flowchart content change lifecycle with debounced auto-save.
 *
 * Extracted from App.tsx to keep flowchart-specific saving logic contained.
 */
export function useFlowchartChangeHandler(params: UseFlowchartChangeHandlerParams): UseFlowchartChangeHandlerReturn {
  const {
    activeFlowchartId,
    isIncomingSyncRef,
    flowchartsRef,
    lastLoadedFlowchartIdRef,
    lastSaveCallRef,
    setIsLocalSaving,
    saveFlowchart,
    setFlowcharts,
    broadcastMessage,
    triggerDebouncedSync,
    isRefreshing,
    isFlowchartItemLoading,
  } = params;

  const flowchartsSaveTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleFlowchartChange = useCallback((nodesData: any[], edgesData: any[]) => {
    if (!activeFlowchartId) return;

    // Prevent loop: If this change came from another tab's sync, DON'T save it back
    if (isIncomingSyncRef.current) return;

    const flowchartId = activeFlowchartId;
    const dataString = JSON.stringify({ nodes: nodesData, edges: edgesData });

    // Skip if data hasn't actually changed (prevents re-render loop)
    setFlowcharts(prev => {
      const existing = prev.find(f => String(f.uid ?? f.id) === String(flowchartId));
      if (existing && existing.data === dataString) return prev;
      return prev.map(f => String(f.uid ?? f.id) === String(flowchartId) ? { ...f, data: dataString } : f);
    });

    setIsLocalSaving(true);
    if (flowchartsSaveTimeout.current) clearTimeout(flowchartsSaveTimeout.current);

    // SAFETY: Flowchart ID Validation Guard
    if (lastLoadedFlowchartIdRef.current !== activeFlowchartId) return;

    flowchartsSaveTimeout.current = setTimeout(async () => {
      // SAFETY: Wait if still loading/refreshing
      if (isRefreshing || isFlowchartItemLoading) return;

      const currentFlowchart = flowchartsRef.current.find(f => String(f.uid ?? f.id) === String(flowchartId));
      if (!currentFlowchart) return;

      await saveFlowchart({
        ...currentFlowchart,
        data: dataString
      } as any);

      lastSaveCallRef.current = Date.now();
      setIsLocalSaving(false);
      triggerDebouncedSync();
      broadcastMessage(BroadcastMessageType.DRAFT_UPDATED, DraftType.FLOWCHART, flowchartId);
    }, 1500);
  }, [activeFlowchartId, saveFlowchart, setFlowcharts, triggerDebouncedSync, isRefreshing, isFlowchartItemLoading, broadcastMessage, isIncomingSyncRef, flowchartsRef, lastLoadedFlowchartIdRef, lastSaveCallRef, setIsLocalSaving]);

  return { handleFlowchartChange, flowchartsSaveTimeoutRef: flowchartsSaveTimeout };
}
