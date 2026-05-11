import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Drawing, DraftType } from '../types';
import { localPersistence } from '../lib/localPersistence';

export function useDrawings(isGuest: boolean = false) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [activeDrawingUid, setActiveDrawingUid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isItemLoading, setIsItemLoading] = useState(false);

  const [drawingsTotal, setDrawingsTotal] = useState(0);
  const [hasMoreDrawings, setHasMoreFiles] = useState(false);
  const drawingsRef = useRef<Drawing[]>(drawings);

  // Keep ref in sync
  drawingsRef.current = drawings;

  const fetchDrawings = useCallback(async (isLoadMore = false, projectId: number | null | string = 'all', searchQuery = '', isPublic: boolean | null = null, limit = 10, options?: { silent?: boolean }) => {
    if (isGuest) {
      const localDrawings = await localPersistence.getAllResources('drawings');
      let filtered = localDrawings.filter(d => !d.is_deleted);
      if (projectId !== 'all') {
        filtered = filtered.filter(d => d.project_id === projectId);
      }
      if (searchQuery) {
        filtered = filtered.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase()));
      }
      setDrawings(filtered);
      setDrawingsTotal(filtered.length);
      setHasMoreFiles(false);
      return;
    }

    if (!options?.silent) setIsLoading(true);
    try {
      const offset = isLoadMore ? drawingsRef.current.length : 0;
      const projIdParam = (projectId === null || projectId === 'null' || projectId === 'none') ? 'null' : projectId;
      const qParam = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const publicParam = isPublic !== null ? `&is_public=${isPublic}` : '';
      const res = await fetch(`/api/drawings?limit=${limit}&offset=${offset}&project_id=${projIdParam}${qParam}${publicParam}`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data !== undefined ? json.data : json;
        const total = json.total !== undefined ? json.total : (Array.isArray(data) ? data.length : 0);

        const drawingsListData = Array.isArray(data) ? data : [];
        if (isLoadMore) {
          setDrawings(prev => [...prev, ...drawingsListData]);
        } else {
          setDrawings(drawingsListData);
        }
        setDrawingsTotal(total);
        setHasMoreFiles((drawingsListData.length + offset) < total);
      }
    } catch (err) {
      console.error('Error fetching drawings:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isGuest]);

  const createDrawing = async (title: string, projectId?: number | string | null, data?: string) => {
    const effectiveProjectId = (projectId === 'none' || projectId === 'uncategorized') ? null : projectId;

    if (isGuest) {
      const newDrawing: Drawing = {
        id: Math.random().toString(36).substr(2, 9) as any,
        title,
        data: data || '',
        project_id: effectiveProjectId || null,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      // @ts-ignore
      newDrawing.type = 'drawings';
      await localPersistence.saveResource(newDrawing);
      setDrawings(prev => [newDrawing, ...prev]);
      toast.success('Drawing created locally');
      return newDrawing;
    }

    try {
      const res = await fetch('/api/drawings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, project_id: effectiveProjectId, data: data || "" }),
      });
      if (res.ok) {
        const newDrawing = await res.json();
        setDrawings(prev => [newDrawing, ...prev]);
        toast.success('Drawing created successfully');
        return newDrawing;
      }
    } catch (err) {}
    return null;
  };

  const duplicateDrawing = async (uid: string, newTitle: string) => {
    const sourceDrawing = drawingsRef.current.find(d => String(d.uid ?? d.id) === uid);
    if (!sourceDrawing) {
      toast.error('Source drawing not found');
      return null;
    }

    let data = sourceDrawing.data;
    const draft = await localPersistence.getDraft(DraftType.DRAWINGS, uid);
    if (draft) {
      try {
        const parsed = JSON.parse(draft.data);
        if (parsed.data) data = parsed.data;
      } catch (e) {}
    }

    return await createDrawing(newTitle, sourceDrawing.project_id, data);
  };

  const updateDrawing = async (uid: string, title: string, options?: { silent?: boolean }) => {
    if (isGuest) {
      const drawing = await localPersistence.getResource(uid);
      if (drawing) {
        drawing.title = title;
        drawing.updated_at = new Date().toISOString();
        await localPersistence.saveResource(drawing);
        setDrawings(prev => prev.map(d => String(d.uid ?? d.id) === uid ? { ...d, title } : d));
        if (!options?.silent) toast.success('Drawing renamed locally');
      }
      return;
    }

    try {
      const res = await fetch(`/api/drawings/${uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setDrawings(prev => prev.map(d => String(d.uid ?? d.id) === uid ? { ...d, title } : d));
        if (!options?.silent) toast.success('Drawing renamed successfully');
      }
    } catch (err) {}
  };

  const deleteDrawing = async (uid: string) => {
    if (isGuest) {
      const drawing = await localPersistence.getResource(uid);
      if (drawing) {
        drawing.is_deleted = true;
        drawing.deleted_at = new Date().toISOString();
        await localPersistence.saveResource(drawing);
        setDrawings(prev => prev.map(d => String(d.uid ?? d.id) === uid ? { ...d, is_deleted: true } : d));
        if (activeDrawingUid === uid) setActiveDrawingUid(null);
        toast.success('Drawing moved to local trash');
      }
      return;
    }

    try {
      const res = await fetch(`/api/drawings/${uid}`, { method: 'DELETE' });
      if (res.ok) {
        setDrawings(prev => prev.map(d => String(d.uid ?? d.id) === uid ? { ...d, is_deleted: true } : d));
        if (activeDrawingUid === uid) setActiveDrawingUid(null);
        toast.success('Drawing moved to trash');
      }
    } catch (err) {}
  };

  const moveDrawingToProject = async (uid: string, projectId: number | string | null, options?: { silent?: boolean }) => {
    if (isGuest) {
      const drawing = await localPersistence.getResource(uid);
      if (drawing) {
        drawing.project_id = projectId;
        await localPersistence.saveResource(drawing);
        setDrawings(prev => prev.map(d => String(d.uid ?? d.id) === uid ? { ...d, project_id: projectId } : d));
        if (!options?.silent) toast.success('Drawing moved to project locally');
      }
      return true;
    }

    try {
      const res = await fetch(`/api/drawings/${uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (res.ok) {
        setDrawings(prev => prev.map(d => String(d.uid ?? d.id) === uid ? { ...d, project_id: projectId } : d));
        if (!options?.silent) toast.success('Drawing moved to project');
        return true;
      }
    } catch (err) {}
    return false;
  };

  const saveDrawing = async (drawing: Drawing) => {
    if (!drawing.uid) return false;
    
    try {
      const isSyncPending = !isGuest;
      // We need to save as JSON because useSyncService expects a JSON string with {title, data, project_id}
      const payload = {
        title: drawing.title,
        data: drawing.data || '',
        project_id: drawing.project_id || null
      };
      const dataToSave = JSON.stringify(payload);
      
      if (isGuest) {
        const localDrawing = await localPersistence.getResource(drawing.uid);
        if (localDrawing) {
          localDrawing.data = drawing.data;
          localDrawing.updated_at = new Date().toISOString();
          await localPersistence.saveResource(localDrawing);
        }
      }

      await localPersistence.saveDraft(DraftType.DRAWINGS, drawing.uid, dataToSave, isSyncPending);
      return true;
    } catch (err) {
      console.error('Error in local saveDrawing:', err);
      return false;
    }
  };

  const restoreDrawing = async (uid: string) => {
    if (isGuest) {
      const drawing = await localPersistence.getResource(uid);
      if (drawing) {
        drawing.is_deleted = false;
        drawing.deleted_at = undefined;
        await localPersistence.saveResource(drawing);
        setDrawings(prev => prev.map(d => String(d.uid ?? d.id) === uid ? { ...d, is_deleted: false } : d));
        toast.success('Drawing restored locally');
      }
      return;
    }

    try {
      const res = await fetch(`/api/drawings/${uid}/restore`, { method: 'POST' });
      if (res.ok) {
        setDrawings(prev => prev.map(d => String(d.uid ?? d.id) === uid ? { ...d, is_deleted: false } : d));
        toast.success('Drawing restored successfully');
      }
    } catch (err) {}
  };

  const deleteDrawingPermanent = async (uid: string) => {
    if (isGuest) {
      await localPersistence.deleteResource(uid);
      await localPersistence.clearDraft(DraftType.DRAWINGS, uid);
      toast.success('Drawing permanently deleted from local');
      return;
    }

    try {
      const res = await fetch(`/api/drawings/${uid}/permanent`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Drawing permanently deleted');
      }
    } catch (err) {}
  };

  const selectDrawing = async (uid: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setIsItemLoading(true);
    try {
      if (isGuest) {
        const localData = await localPersistence.getResource(uid);
        if (!localData || localData.is_deleted) return;
        setActiveDrawingUid(uid);
      } else {
        // Helper: try to read local draft data for this drawing
        const tryGetDraftData = async (numericFallbackId?: string | number): Promise<string | null> => {
          const checkDraft = async (id: string | number): Promise<string | null> => {
            try {
              const draft = await localPersistence.getDraft(DraftType.DRAWINGS, id);
              if (draft && draft.data) {
                const parsedDraft = JSON.parse(draft.data);
                if (parsedDraft && typeof parsedDraft.data === 'string') {
                  const excalidrawData = JSON.parse(parsedDraft.data);
                  if (excalidrawData?.elements?.length > 0) {
                    return parsedDraft.data;
                  }
                }
              }
            } catch (e) { /* ignore parse errors */ }
            return null;
          };

          // Check under UUID first, then numeric ID fallback
          const uuidResult = await checkDraft(uid);
          if (uuidResult) return uuidResult;
          if (numericFallbackId != null && String(numericFallbackId) !== uid) {
            return await checkDraft(numericFallbackId);
          }
          return null;
        };

        let effectiveData: string | null = null;
        let fetchFailed = false;
        let serverDrawing: any = null;

        try {
          const res = await fetch(`/api/drawings/${uid}`);
          if (res.ok) {
            const d = await res.json();
            if (!d.is_deleted) {
              serverDrawing = d;
              effectiveData = d.data;
              // Prefer draft data if it has actual elements (sync may not have run)
              const draftData = await tryGetDraftData(d.id);
              if (draftData) effectiveData = draftData;
            }
          } else {
            fetchFailed = true;
          }
        } catch (err) {
          // Network/server failure — fall back to local draft entirely
          fetchFailed = true;
        }

        if (fetchFailed) {
          const draftData = await tryGetDraftData();
          if (draftData) effectiveData = draftData;
          // Still set the active drawing even without server data
          // so the user can at least see the Excalidraw editor
          if (!effectiveData) effectiveData = '';
        }

        // Only proceed if we have a valid drawing (even with empty data)
        if (effectiveData !== null) {
          setDrawings(prev => {
            const exists = prev.some(existing => String(existing.uid ?? existing.id) === uid);
            if (exists) {
              return prev.map(existing => String(existing.uid ?? existing.id) === uid
                ? { ...existing, data: effectiveData }
                : existing
              );
            }
            // Drawing not yet in state — use server response if available, else minimal entry
            if (serverDrawing) {
              return [{ ...serverDrawing, data: effectiveData }, ...prev];
            }
            return [{ id: uid as any, uid, data: effectiveData, title: '', is_deleted: false } as Drawing, ...prev];
          });
          setActiveDrawingUid(uid);
        }
      }
    } finally {
      setIsItemLoading(false);
    }
  };

  return {
    drawings,
    setDrawings,
    activeDrawingUid,
    setActiveDrawingUid,
    fetchDrawings,
    createDrawing,
    updateDrawing,
    deleteDrawing,
    moveDrawingToProject,
    saveDrawing,
    restoreDrawing,
    deleteDrawingPermanent,
    hasMoreDrawings,
    drawingsTotal,
    duplicateDrawing,
    selectDrawing,
    isLoading,
    isItemLoading,
  };
}
