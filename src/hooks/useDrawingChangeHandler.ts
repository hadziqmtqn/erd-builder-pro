import { useCallback, useRef } from 'react';
import { DraftType } from '../types';
import { BroadcastMessageType } from './useBroadcastChannel';

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────
export interface UseDrawingChangeHandlerParams {
  activeDrawingId: string | null;
  /** Refs managed by parent — shared across hooks */
  isIncomingSyncRef: React.MutableRefObject<boolean>;
  drawingsRef: React.MutableRefObject<any[]>;
  lastLoadedDrawingIdRef: React.MutableRefObject<string | null>;
  /** Timestamp of last save — shared across all document types for focus fetch throttling */
  lastSaveCallRef: React.MutableRefObject<number>;
  /** Parent state setters */
  setIsLocalSaving: (val: boolean) => void;
  saveDrawing: (drawing: any) => Promise<any>;
  setDrawings: React.Dispatch<React.SetStateAction<any[]>>;
  broadcastMessage: (type: any, draftType: any, id: any) => void;
  triggerDebouncedSync: () => void;
  /** Parent state values */
  isRefreshing: boolean;
  isDrawingItemLoading: boolean;
}

// ──────────────────────────────────────────
// Return type
// ──────────────────────────────────────────
export interface UseDrawingChangeHandlerReturn {
  handleDrawingChange: (data: string) => void;
  /** Timeout ref for auto-save — shared with useAutoSave for flushPendingSaves */
  drawingsSaveTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

// ──────────────────────────────────────────
// Hook
// ──────────────────────────────────────────
/**
 * Manages drawing content change lifecycle with:
 *  - Data dedup (skip unchanged data)
 *  - Max save interval (3s throttle)
 *  - Regular debounced save (300ms interval / 1500ms regular)
 *
 * Extracted from App.tsx to keep drawing-specific saving logic contained.
 */
export function useDrawingChangeHandler(params: UseDrawingChangeHandlerParams): UseDrawingChangeHandlerReturn {
  const {
    activeDrawingId,
    isIncomingSyncRef,
    drawingsRef,
    lastLoadedDrawingIdRef,
    lastSaveCallRef,
    setIsLocalSaving,
    saveDrawing,
    setDrawings,
    broadcastMessage,
    triggerDebouncedSync,
    isRefreshing,
    isDrawingItemLoading,
  } = params;

  // ── Timeout & guard refs (owned by this hook) ──
  const drawingsSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const drawingIsSavingRef = useRef(false);
  const lastDrawingDataRef = useRef<string | null>(null);
  const lastDrawingSaveTimeRef = useRef(0); // For maxSaveInterval (3s)
  const drawingSavePendingRef = useRef(false); // Track if a save is already queued

  const handleDrawingChange = useCallback((data: string) => {
    if (!activeDrawingId) return;

    // Prevent loop: If this change came from another tab's sync, DON'T save it back
    if (isIncomingSyncRef.current) return;

    const drawingId = activeDrawingId;

    // 1️⃣ Data dedup: skip entirely if data hasn't changed
    if (data === lastDrawingDataRef.current) return;
    lastDrawingDataRef.current = data;

    setDrawings(prev => prev.map(d => String(d.id) === String(drawingId) || (d.uid && String(d.uid) === String(drawingId)) ? { ...d, data } : d));

    // 2️⃣ Max save interval: force save at most once per 3s even during continuous editing
    const now = Date.now();
    if (now - lastDrawingSaveTimeRef.current > 3000 && !drawingSavePendingRef.current) {
      // Save immediately (throttled)
      drawingSavePendingRef.current = true;
      setIsLocalSaving(true);
      drawingsSaveTimeout.current = setTimeout(async () => {
        drawingSavePendingRef.current = false;
        // SAFETY: Drawing ID Validation Guard
        if (lastLoadedDrawingIdRef.current !== activeDrawingId) { setIsLocalSaving(false); return; }
        if (isRefreshing || isDrawingItemLoading) { setIsLocalSaving(false); return; }
        if (drawingIsSavingRef.current) { setIsLocalSaving(false); return; }

        const currentDrawing = drawingsRef.current.find(d => String(d.id) === String(drawingId) || (d.uid && String(d.uid) === String(drawingId)));
        if (!currentDrawing) { setIsLocalSaving(false); return; }

        drawingIsSavingRef.current = true;
        try {
          await saveDrawing({ ...currentDrawing, data });
          lastDrawingSaveTimeRef.current = Date.now();
          lastSaveCallRef.current = Date.now();
          triggerDebouncedSync();
          broadcastMessage(BroadcastMessageType.DRAFT_UPDATED, DraftType.DRAWINGS, drawingId);
        } finally {
          drawingIsSavingRef.current = false;
          setIsLocalSaving(false);
        }
      }, 300); // shorter debounce for interval save
      return;
    }

    // 3️⃣ Regular debounced save: 1500ms after last change
    setIsLocalSaving(true);
    if (drawingsSaveTimeout.current) clearTimeout(drawingsSaveTimeout.current);

    // SAFETY: Drawing ID Validation Guard
    if (lastLoadedDrawingIdRef.current !== activeDrawingId) return;

    drawingsSaveTimeout.current = setTimeout(async () => {
      // SAFETY: Wait if still loading/refreshing
      if (isRefreshing || isDrawingItemLoading) return;
      if (drawingIsSavingRef.current) return;

      const currentDrawing = drawingsRef.current.find(d => String(d.id) === String(drawingId) || (d.uid && String(d.uid) === String(drawingId)));
      if (!currentDrawing) return;

      drawingIsSavingRef.current = true;
      try {
        await saveDrawing({ ...currentDrawing, data });
        lastDrawingSaveTimeRef.current = Date.now();
        lastSaveCallRef.current = Date.now();
        triggerDebouncedSync();
        broadcastMessage(BroadcastMessageType.DRAFT_UPDATED, DraftType.DRAWINGS, drawingId);
      } finally {
        drawingIsSavingRef.current = false;
        setIsLocalSaving(false);
      }
    }, 1500);
  }, [activeDrawingId, saveDrawing, setDrawings, triggerDebouncedSync, isRefreshing, isDrawingItemLoading, broadcastMessage, isIncomingSyncRef, drawingsRef, lastLoadedDrawingIdRef, lastSaveCallRef, setIsLocalSaving]);

  return { handleDrawingChange, drawingsSaveTimeoutRef: drawingsSaveTimeout };
}
