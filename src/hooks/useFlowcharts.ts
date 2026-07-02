import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Flowchart, DraftType } from '../types';
import { localPersistence } from '../lib/localPersistence';
import { apiFetch } from '../lib/api';

export function useFlowcharts(isGuest: boolean = false) {
  const [flowcharts, setFlowcharts] = useState<Flowchart[]>([]);
  const [activeFlowchartId, setActiveFlowchartId] = useState<number | string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isItemLoading, setIsItemLoading] = useState(false);

  const [flowchartsTotal, setFlowchartsTotal] = useState(0);
  const [hasMoreFlowcharts, setHasMoreFlowcharts] = useState(false);
  const flowchartsRef = useRef<Flowchart[]>(flowcharts);
  const activeFlowchartIdRef = useRef(activeFlowchartId);

  // Keep refs in sync
  flowchartsRef.current = flowcharts;
  activeFlowchartIdRef.current = activeFlowchartId;

  const matchesFlowchartId = (flowchart: Flowchart, uid: string | number) => {
    return String(flowchart.id) === String(uid) || String(flowchart.uid) === String(uid);
  };

  const mergeFlowchartRecord = (existing: Flowchart | undefined, incoming: Flowchart) => {
    if (!existing) return incoming;
    return {
      ...existing,
      ...incoming,
      // List fetches usually omit `data`; preserve the fully loaded payload
      // so an active flowchart does not fall back to the default template.
      data: incoming.data !== undefined ? incoming.data : existing.data,
    };
  };

  const parseFlowchartPayload = (raw?: string) => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  };

  const fetchFlowcharts = useCallback(async (
    isLoadMore = false,
    projectId: number | null | string = 'all',
    searchQuery = '',
    isPublic: boolean | null = null,
    limit = 10,
    options?: { silent?: boolean; page?: number },
  ) => {
    if (isGuest) {
      const localFlowcharts = await localPersistence.getAllResources('flowchart');
      let filtered = localFlowcharts.filter(f => !f.is_deleted);
      if (projectId !== 'all') {
        filtered = filtered.filter(f => f.project_id === projectId);
      }
      if (searchQuery) {
        filtered = filtered.filter(f => f.title.toLowerCase().includes(searchQuery.toLowerCase()));
      }
      filtered.sort((a: any, b: any) => {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return db - da;
      });

      const pageNum = options?.page ?? 1;
      const startIdx = (pageNum - 1) * limit;
      const paged = filtered.slice(startIdx, startIdx + limit);

      setFlowcharts(paged);
      setFlowchartsTotal(filtered.length);
      setHasMoreFlowcharts(false);
      setIsLoading(false);
      return;
    }

    if (!options?.silent) setIsLoading(true);
    try {
      const offset = options?.page !== undefined ? (options.page - 1) * limit : (isLoadMore ? flowchartsRef.current.length : 0);
      const projIdParam = (projectId === null || projectId === 'null' || projectId === 'none') ? 'null' : projectId;
      const qParam = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const publicParam = isPublic !== null ? `&is_public=${isPublic}` : '';
      const res = await apiFetch(`/api/flowcharts?limit=${limit}&offset=${offset}&project_id=${projIdParam}${qParam}${publicParam}`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data !== undefined ? json.data : json;
        const total = json.total !== undefined ? json.total : (Array.isArray(data) ? data.length : 0);

        const flowchartsListData = Array.isArray(data) ? data : [];
        setFlowcharts(prev => {
          const mergedList = flowchartsListData.map((incoming: Flowchart) => {
            const existing = prev.find(item => matchesFlowchartId(item, incoming.uid ?? incoming.id));
            return mergeFlowchartRecord(existing, incoming);
          });

          if (isLoadMore) {
            const existingIds = new Set(mergedList.map(item => String(item.uid ?? item.id)));
            const preservedPrev = prev.filter(item => !existingIds.has(String(item.uid ?? item.id)));
            return [...preservedPrev, ...mergedList];
          }

          const activeId = activeFlowchartIdRef.current;
          if (activeId != null && !mergedList.some(f => String(f.id) === String(activeId) || (f.uid && String(f.uid) === String(activeId)))) {
            const existing = prev.find(f => String(f.id) === String(activeId) || (f.uid && String(f.uid) === String(activeId)));
            if (existing) return [...mergedList, existing];
          }
          return mergedList;
        });
        setFlowchartsTotal(total);
        setHasMoreFlowcharts((flowchartsListData.length + offset) < total);
      }
    } catch (err) {
      console.error('Error fetching flowcharts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isGuest]);

  const createFlowchart = async (title: string, projectId?: number | string | null, data?: string) => {
    const effectiveProjectId = (projectId === 'none' || projectId === 'uncategorized') ? null : projectId;

    if (isGuest) {
      const newFlowchart = {
        id: Math.random().toString(36).substring(2, 9),
        uid: crypto.randomUUID(),
        title,
        data: data || '',
        project_id: effectiveProjectId || null,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        type: 'flowchart',
      } as Flowchart & { type: string };
      await localPersistence.saveResource(newFlowchart);
      setFlowcharts(prev => [newFlowchart, ...prev]);
      toast.success('Flowchart created locally');
      return newFlowchart;
    }

    try {
      const flowchartUid = crypto.randomUUID();
      const res = await apiFetch('/api/flowcharts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, project_id: effectiveProjectId, data: data || "", uid: flowchartUid }),
      });
      if (res.ok) {
        const newFlowchart = await res.json();
        if (!newFlowchart.uid) {
          newFlowchart.uid = flowchartUid;
        }
        setFlowcharts(prev => [newFlowchart, ...prev]);
        toast.success('Flowchart created successfully');
        return newFlowchart;
      }
    } catch (err) {}
    return null;
  };

  // All mutation/CRUD functions use uid (UUID) for API calls.
  // The server endpoint now requires /api/flowcharts/:uid.

  const updateFlowchart = async (uid: string, title: string, options?: { silent?: boolean }) => {
    if (isGuest) {
      const flowchart = await localPersistence.getResource(uid);
      if (flowchart) {
        flowchart.title = title;
        flowchart.updated_at = new Date().toISOString();
        await localPersistence.saveResource(flowchart);
        setFlowcharts(prev => prev.map(f => matchesFlowchartId(f, uid) ? { ...f, title } : f));
        if (!options?.silent) toast.success('Flowchart renamed locally');
      }
      return;
    }

    try {
      const res = await apiFetch(`/api/flowcharts/${uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setFlowcharts(prev => prev.map(f => matchesFlowchartId(f, uid) ? { ...f, title } : f));
        if (!options?.silent) toast.success('Flowchart renamed successfully');
      }
    } catch (err) {}
  };

  const deleteFlowchart = async (uid: string) => {
    if (isGuest) {
      let flowchart = await localPersistence.getResource(uid);
      if (!flowchart) {
        flowchart = flowchartsRef.current.find(f => matchesFlowchartId(f, uid)) || null;
      }
      if (flowchart) {
        flowchart.is_deleted = true;
        flowchart.deleted_at = new Date().toISOString();
        await localPersistence.saveResource(flowchart);
        setFlowcharts(prev => prev.filter(f => matchesFlowchartId(f, uid)));
        setFlowchartsTotal(prev => Math.max(0, prev - 1));
        if (activeFlowchartId !== null) {
          const fc = flowchartsRef.current.find(f => matchesFlowchartId(f, uid));
          if (fc && String(activeFlowchartId) === String(fc.id)) setActiveFlowchartId(null);
        }
        toast.success('Flowchart moved to local trash');
      }
      return;
    }

    try {
      const flowchart = flowchartsRef.current.find(f => matchesFlowchartId(f, uid));
      const identifier = flowchart?.uid || uid;
      const res = await apiFetch(`/api/flowcharts/${identifier}`, { method: 'DELETE' });
      if (res.ok) {
        setFlowcharts(prev => prev.filter(f => matchesFlowchartId(f, uid)));
        setFlowchartsTotal(prev => Math.max(0, prev - 1));
        if (activeFlowchartId !== null) {
          const fc = flowchartsRef.current.find(f => matchesFlowchartId(f, uid));
          if (fc && String(activeFlowchartId) === String(fc.id)) setActiveFlowchartId(null);
        }
        toast.success('Flowchart moved to trash');
      }
    } catch (err) {}
  };

  const moveFlowchartToProject = async (uid: string, projectId: number | string | null, options?: { silent?: boolean }) => {
    if (isGuest) {
      const flowchart = await localPersistence.getResource(uid);
      if (flowchart) {
        flowchart.project_id = projectId;
        await localPersistence.saveResource(flowchart);
        setFlowcharts(prev => prev.map(f => matchesFlowchartId(f, uid) ? { ...f, project_id: projectId } : f));
        if (!options?.silent) toast.success('Flowchart moved to project locally');
      }
      return true;
    }

    try {
      const res = await apiFetch(`/api/flowcharts/${uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (res.ok) {
        setFlowcharts(prev => prev.map(f => matchesFlowchartId(f, uid) ? { ...f, project_id: projectId } : f));
        if (!options?.silent) toast.success('Flowchart moved to project');
        return true;
      }
    } catch (err) {}
    return false;
  };

  const saveFlowchart = useCallback(async (flowchart: Flowchart) => {
    if (!flowchart.id && !flowchart.uid) return false;
    
    try {
      const isSyncPending = !isGuest;
      // We need to save as JSON because useSyncService expects a JSON string with {title, data, project_id}
      const payload = {
        title: flowchart.title,
        data: flowchart.data || '',
        project_id: flowchart.project_id || null
      };
      const dataToSave = JSON.stringify(payload);
      
      if (isGuest) {
        const localFlowchart = await localPersistence.getResource(flowchart.id);
        if (localFlowchart) {
          localFlowchart.data = flowchart.data;
          localFlowchart.updated_at = new Date().toISOString();
          await localPersistence.saveResource(localFlowchart);
        }
        // Sync React state so activeFlowchart.data reflects saved data immediately
        setFlowcharts(prev => prev.map(f =>
          matchesFlowchartId(f, flowchart.uid ?? flowchart.id)
            ? { ...f, data: flowchart.data || '' }
            : f
        ));
      }

      // Use uid for draft so sync service builds the correct /api/flowcharts/:uid endpoint
      const draftId = flowchart.uid || flowchart.id;
      await localPersistence.saveDraft(DraftType.FLOWCHART, draftId, dataToSave, isSyncPending);
      return true;
    } catch (err) {
      console.error('Error in local saveFlowchart:', err);
      return false;
    }
  }, [isGuest]);

  const restoreFlowchart = async (uid: string) => {
    if (isGuest) {
      let flowchart = await localPersistence.getResource(uid);
      if (!flowchart) {
        flowchart = flowchartsRef.current.find(f => matchesFlowchartId(f, uid)) || null;
      }
      if (flowchart) {
        flowchart.is_deleted = false;
        flowchart.deleted_at = undefined;
        await localPersistence.saveResource(flowchart);
        setFlowcharts(prev => prev.map(f => matchesFlowchartId(f, uid) ? { ...f, is_deleted: false } : f));
        toast.success('Flowchart restored locally');
      }
      return;
    }

    try {
      const flowchart = flowchartsRef.current.find(f => matchesFlowchartId(f, uid));
      const identifier = flowchart?.uid || uid;
      const res = await apiFetch(`/api/flowcharts/${identifier}/restore`, { method: 'POST' });
      if (res.ok) {
        setFlowcharts(prev => prev.map(f => matchesFlowchartId(f, uid) ? { ...f, is_deleted: false } : f));
        toast.success('Flowchart restored successfully');
      }
    } catch (err) {}
  };

  const deleteFlowchartPermanent = async (uid: string) => {
    if (isGuest) {
      let flowchart = await localPersistence.getResource(uid);
      if (!flowchart) {
        flowchart = flowchartsRef.current.find(f => matchesFlowchartId(f, uid)) || null;
      }
      const resourceId = flowchart?.id || uid;
      const draftId = flowchart?.uid || uid;
      await localPersistence.deleteResource(resourceId);
      await localPersistence.clearDraft(DraftType.FLOWCHART, draftId);
      setFlowcharts(prev => prev.filter(f => matchesFlowchartId(f, uid)));
      toast.success('Flowchart permanently deleted from local');
      return;
    }

    try {
      const flowchart = flowchartsRef.current.find(f => matchesFlowchartId(f, uid));
      const identifier = flowchart?.uid || uid;
      const res = await apiFetch(`/api/flowcharts/${identifier}/permanent`, { method: 'DELETE' });
      if (res.ok) {
        setFlowcharts(prev => prev.filter(f => matchesFlowchartId(f, uid)));
        toast.success('Flowchart permanently deleted');
      }
    } catch (err) {}
  };

  const selectFlowchart = async (uid: string, options?: { silent?: boolean; fallbackFlowchart?: any }) => {
    if (!options?.silent) setIsItemLoading(true);
    try {
      const localDraft = await localPersistence.getDraft(DraftType.FLOWCHART, uid);
      const draftPayload = localDraft ? parseFlowchartPayload(localDraft.data) : null;
      const draftShouldWin = !!localDraft?.sync_pending;
      const draftFlowchartData = draftPayload?.data;
      const draftTitle = draftPayload?.title;
      const draftProjectId = draftPayload?.project_id;

      if (isGuest) {
        let localData = await localPersistence.getResource(uid);
        // Fallback: Guest mode resources keyed by numeric `id`, not `uid` — search by uid in array
        if (!localData) {
          localData = flowchartsRef.current.find(f => matchesFlowchartId(f, uid)) || null;
        }
        if (!localData || localData.is_deleted) return;
        setFlowcharts(prev => {
          const exists = prev.some(existing => matchesFlowchartId(existing, uid));
          const merged = {
            ...localData,
            ...draftPayload,
            data: draftFlowchartData ?? localData.data ?? '',
          };
          return exists
            ? prev.map(existing => matchesFlowchartId(existing, uid) ? { ...existing, ...merged } : existing)
            : [...prev, merged];
        });
        setActiveFlowchartId(localData.uid ?? uid);
      } else {
        const res = await apiFetch(`/api/flowcharts/${uid}`);
        if (res.ok) {
          const f = await res.json();
          if (!f.is_deleted) {
            const mergedFlowchart = draftShouldWin
              ? {
                  ...f,
                  title: draftTitle ?? f.title,
                  data: draftFlowchartData ?? f.data,
                  project_id: draftProjectId ?? f.project_id,
                }
              : f;

            setFlowcharts(prev => {
              // Check by uid first, fallback to numeric id
              const exists = prev.some(
                existing => (existing.uid && String(existing.uid) === String(mergedFlowchart.uid)) || String(existing.id) === String(mergedFlowchart.id)
              );
              if (exists) {
                return prev.map(existing =>
                  (existing.uid && String(existing.uid) === String(mergedFlowchart.uid)) || String(existing.id) === String(mergedFlowchart.id)
                    ? { ...existing, ...mergedFlowchart }
                    : existing
                );
              } else {
                // Flowchart not in local state yet — add it (e.g. initial URL load)
                return [...prev, mergedFlowchart];
              }
            });
            setActiveFlowchartId(mergedFlowchart.uid ?? uid);
          } else if (draftShouldWin && draftPayload) {
            const fallback = options?.fallbackFlowchart || {};
            const mergedFlowchart = {
              ...fallback,
              ...draftPayload,
              uid: fallback.uid ?? uid,
              id: fallback.id ?? uid,
              data: draftFlowchartData ?? fallback.data ?? '',
            };
            setFlowcharts(prev => {
              const exists = prev.some(existing => matchesFlowchartId(existing, uid));
              return exists
                ? prev.map(existing => matchesFlowchartId(existing, uid) ? { ...existing, ...mergedFlowchart } : existing)
                : [...prev, mergedFlowchart];
            });
            setActiveFlowchartId(String(mergedFlowchart.uid ?? uid));
          }
        } else if (draftShouldWin && draftPayload) {
          const fallback = options?.fallbackFlowchart || {};
          const mergedFlowchart = {
            ...fallback,
            ...draftPayload,
            uid: fallback.uid ?? uid,
            id: fallback.id ?? uid,
            data: draftFlowchartData ?? fallback.data ?? '',
          };
          setFlowcharts(prev => {
            const exists = prev.some(existing => matchesFlowchartId(existing, uid));
            return exists
              ? prev.map(existing => matchesFlowchartId(existing, uid) ? { ...existing, ...mergedFlowchart } : existing)
              : [...prev, mergedFlowchart];
          });
          setActiveFlowchartId(String(mergedFlowchart.uid ?? uid));
        }
      }
    } finally {
      setIsItemLoading(false);
    }
  };

  return {
    flowcharts,
    setFlowcharts,
    activeFlowchartId,
    setActiveFlowchartId,
    fetchFlowcharts,
    createFlowchart,
    updateFlowchart,
    deleteFlowchart,
    moveFlowchartToProject,
    saveFlowchart,
    restoreFlowchart,
    deleteFlowchartPermanent,
    hasMoreFlowcharts,
    flowchartsTotal,
    isLoading,
    isItemLoading,
    selectFlowchart
  };
}
