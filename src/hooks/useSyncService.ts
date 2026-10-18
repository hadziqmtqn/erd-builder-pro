import { useEffect, useCallback, useRef, useState } from 'react';
import { localPersistence } from '../lib/localPersistence';
import { DraftType } from '../types';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { getCachedDiagramVersion, updateCachedDiagramVersion, clearCachedDiagramVersion, documentVersionKey } from '../lib/diagramVersioning';
import { edgeToRelationship } from '../lib/diagram-payload';
import { mergeServerCommentAnchors } from '../lib/noteAnchorMerge';

export function useSyncService(isAuthenticated: boolean | null, isGuest: boolean = false) {
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const [syncError, setSyncError] = useState<boolean>(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Drafts the server rejected as based on an old version. They wait for the user's choice instead of being re-sent.
  const conflictedDraftsRef = useRef(new Set<string>());

  const healDraftData = useCallback((draftData: string, type: DraftType): string => {
    if (!draftData) return draftData;

    try {
      if (type === DraftType.DRAWINGS) {
        let parsed;
        try {
          parsed = JSON.parse(draftData);
        } catch (e) {
          return draftData;
        }

        const isNewFormat = parsed && typeof parsed === 'object' && 'data' in parsed;
        if (isNewFormat && typeof parsed.data === 'string') {
          try {
            const drawingData = JSON.parse(parsed.data);
            if (drawingData.files) {
              let hasCorruption = false;
              const sanitizedFiles = { ...drawingData.files };

              Object.keys(sanitizedFiles).forEach(id => {
                const file = sanitizedFiles[id];
                if (file && typeof file.dataURL === 'string') {
                  const cleanUrl = file.dataURL.replace(/\\n/g, '').replace(/\\r/g, '').trim();
                  const isDataURL = cleanUrl.startsWith('data:');
                  const isValidHttpUrl = cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://');

                  if (isValidHttpUrl && cleanUrl !== file.dataURL) {
                    sanitizedFiles[id] = { ...file, dataURL: cleanUrl };
                    hasCorruption = true;
                  } else if (!isDataURL && !isValidHttpUrl) {
                    delete sanitizedFiles[id];
                    hasCorruption = true;
                  }
                }
              });

              if (hasCorruption) {
                console.warn(`Healing corrupted files map in Drawing draft`);
                parsed.data = JSON.stringify({ ...drawingData, files: sanitizedFiles });
                return JSON.stringify(parsed);
              }
            }
          } catch (e) {
          }
        }
      }
    } catch (err) {
      console.error("Error during draft healing:", err);
    }
    return draftData;
  }, []);

  const [hasPendingSyncs, setHasPendingSyncs] = useState(false);
  const isGuestRef = useRef(isGuest);
  useEffect(() => { isGuestRef.current = isGuest; }, [isGuest]);
  const isGuestCheck = (): boolean =>
    isGuestRef.current || sessionStorage.getItem('auth_mode') === 'guest';
  const syncNeededRef = useRef(false);

  // Helper to check for pending syncs across all types
  const refreshPendingStatus = useCallback(async () => {
    try {
      const pending = await localPersistence.getAllPendingSyncs();
      setHasPendingSyncs(pending.length > 0);
    } catch (err) {
      console.warn("Failed to check pending sync status:", err);
    }
  }, []);

  const baseVersion = async (draft: { type: DraftType; id: string | number }): Promise<number | undefined> =>
    (await getCachedDiagramVersion(documentVersionKey(draft.type, draft.id))) ?? undefined;

  const syncDrafts = useCallback(async () => {
    if (!isAuthenticated || !navigator.onLine || isGuestCheck()) return;
    
    if (isSyncingRef.current) {
      syncNeededRef.current = true;
      return;
    }
    
    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncError(false);

    try {
      let hasMoreToSync = true;
      const mergedAnchorKeys = new Set<string>();
      while (hasMoreToSync) {
        syncNeededRef.current = false;
        const pendingSyncs = await localPersistence.getAllPendingSyncs();
        
        if (pendingSyncs.length > 0) {
          
          for (const draft of pendingSyncs) {
            if (conflictedDraftsRef.current.has(`${draft.type}:${draft.id}`)) continue;
            try {
              let endpoint = '';
              let body = {};
              let parsedData: any = {};
              
              const healedData = healDraftData(draft.data, draft.type);
              
              try {
                parsedData = JSON.parse(healedData);
              } catch (e) {
                if (draft.type !== DraftType.DRAWINGS && draft.type !== DraftType.FLOWCHART) {
                  throw new Error("Critical JSON parse error");
                }
              }

              if (draft.type === DraftType.NOTES) {
                endpoint = `/api/notes/${draft.id}`;
                body = { title: parsedData.title, content: parsedData.content, project_id: parsedData.project_id, expectedVersion: await baseVersion(draft) };
              } else if (draft.type === DraftType.ERD) {
                endpoint = `/api/diagrams/save/${draft.id}`;
                
                // Check if this is a production DB diagram (lightweight format)
                if (parsedData._type === 'production_db_positions') {
                  // Production DB: send positions only
                  const cachedVersion = await getCachedDiagramVersion(draft.id);
                  body = { 
                    data: { nodes: parsedData.nodes, viewport: parsedData.viewport, _type: parsedData._type },
                    viewport: parsedData.viewport,
                    dbml_source: parsedData.dbml_source ?? '',
                    expectedVersion: cachedVersion !== null ? cachedVersion : undefined 
                  };
                } else {
                  // Scratch diagram: send full entities + relationships
                  const entities = (parsedData.nodes || []).map((n: any) => ({
                    ...n.data,
                    x: n.position?.x || 0,
                    y: n.position?.y || 0,
                  }));
                  const relationships = (parsedData.edges || []).map(edgeToRelationship);
                  
                  const cachedVersion = await getCachedDiagramVersion(draft.id);
                  body = {
                    entities,
                    relationships,
                    viewport: parsedData.viewport,
                    dbml_source: parsedData.dbml_source ?? '',
                    expectedVersion: cachedVersion !== null ? cachedVersion : undefined,
                  };
                }
              } else if (draft.type === DraftType.FLOWCHART) {
                endpoint = `/api/flowcharts/${draft.id}`;
                body = { title: parsedData.title, data: parsedData.data || draft.data, project_id: parsedData.project_id, expectedVersion: await baseVersion(draft) };
              } else if (draft.type === DraftType.DRAWINGS) {
                endpoint = `/api/drawings/${draft.id}`;
                body = { title: parsedData.title, data: parsedData.data || draft.data, project_id: parsedData.project_id, expectedVersion: await baseVersion(draft) };
              }

              if (endpoint) {
                const lastUpdated = draft.updated_at;
                const res = await apiFetch(endpoint, {
                  method: draft.type === DraftType.ERD ? 'POST' : 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                });

                if (res.status === 429) {
                  hasMoreToSync = false;
                  break;
                }

                if (res.status === 409 && draft.type === DraftType.NOTES && await mergeNewCommentAnchors(draft, parsedData, mergedAnchorKeys)) {
                  // Another member only added comment anchors: they were copied onto this draft, which is sent again next round.
                  syncNeededRef.current = true;
                  continue;
                }

                if (res.status === 409) {
                  // Someone else saved first. Re-sending would overwrite their work, so keep the draft and ask (DATA-004).
                  const key = `${draft.type}:${draft.id}`;
                  if (!conflictedDraftsRef.current.has(key)) {
                    conflictedDraftsRef.current.add(key);
                    announceConflict(draft.type, draft.id, conflictedDraftsRef.current);
                  }
                  continue;
                }

                if (res.status === 404) {
                  // Removed, moved to another Team, or access revoked: keep the draft pending so the work is not lost silently.
                  console.warn(`[SyncService] ${draft.type}#${draft.id} returned 404; kept as a pending draft`);
                  setSyncError(true);
                  continue;
                }

                if (res.ok) {
                  const responseData = await res.json();
                  if (responseData.version !== undefined && responseData.version !== null) {
                    await updateCachedDiagramVersion(documentVersionKey(draft.type, draft.id), responseData.version);
                  }
                  await localPersistence.markSynced(draft.type, draft.id, lastUpdated);
                } else {
                  // 401/403/5xx: the draft stays pending in IndexedDB; surface it instead of failing silently.
                  console.warn(`[SyncService] ${draft.type}#${draft.id} not saved (HTTP ${res.status}); kept as a pending draft`);
                  setSyncError(true);
                }
              }
            } catch (err) {
              setSyncError(true);
            }
          }
        }
        
        hasMoreToSync = syncNeededRef.current;
      }
    } catch (err) {
      setSyncError(true);
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
      refreshPendingStatus(); // Update the UI status at the end
    }
  }, [isAuthenticated, isGuest, healDraftData, refreshPendingStatus]);

  const triggerDebouncedSync = useCallback(() => {
    // Guest mode saves directly to IndexedDB — no cloud sync needed
    if (isGuestCheck()) return;
    // Optimistically show pending status as soon as a change is made
    setHasPendingSyncs(true);
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      syncDrafts();
    }, 800);
  }, [syncDrafts]);

  useEffect(() => {
    // Initial check on mount
    refreshPendingStatus();
    
    const initialSyncTimer = setTimeout(() => {
      if (navigator.onLine && isAuthenticated && !isGuest) {
        syncDrafts();
      }
    }, 2000);

    // Listener for coming back online
    const handleOnline = () => {
      syncDrafts();
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    }
  }, [syncDrafts, isAuthenticated, isGuest]);

  // A pending draft is unsaved work, so a newer server timestamp (compared across two clocks) never discards it.
  // Real conflicts are found by version when the draft is synced.
  const checkAndClearStaleDrafts = useCallback(async (_type: DraftType, _cloudItems: { id: string | number, updated_at: string | number }[]) => {}, []);

  // One-time migration: Clear legacy 'diagram' drafts from IndexedDB
  useEffect(() => {
    const runMigration = async () => {
      if (!isAuthenticated || isGuest) return;
      const migrationFlag = localStorage.getItem('erd-builder-migration-diagram-to-erd');
      if (migrationFlag === 'done') return;

      try {
        const pendingSyncs = await localPersistence.getAllPendingSyncs();
        // Since DraftType.DIAGRAM is removed from the enum, we use the string 'diagram' directly
        const legacyDrafts = pendingSyncs.filter((d: any) => d.type === 'diagram');
        
        if (legacyDrafts.length > 0) {
          for (const draft of legacyDrafts) {
            await (localPersistence.deleteDraft as any)('diagram', draft.id);
          }
        }
        localStorage.setItem('erd-builder-migration-diagram-to-erd', 'done');
      } catch (err) {
        console.error("Migration failed:", err);
      }
    };
    runMigration();
  }, [isAuthenticated, isGuest]);

  return { syncDrafts, triggerDebouncedSync, isSyncing, syncError, healDraftData, checkAndClearStaleDrafts, hasPendingSyncs, refreshPendingStatus };
}


/** Tell the user a save was refused and let them load the newer version; their local copy is kept as a recovery draft. */
function announceConflict(type: DraftType, id: string | number, conflicts: Set<string>) {
  toast.error('This file was changed by someone else', {
    id: `conflict:${type}:${id}`,
    duration: Infinity,
    description: 'Your unsaved changes were not sent so nothing is overwritten.',
    action: {
      label: 'Load latest',
      onClick: async () => {
        const draft = await localPersistence.getDraft(type, id);
        if (draft) await localPersistence.saveDraft(type, `${id}:recovery`, draft.data, false);
        await localPersistence.deleteDraft(type, id);
        await clearCachedDiagramVersion(documentVersionKey(type, id));
        conflicts.delete(`${type}:${id}`);
        window.dispatchEvent(new CustomEvent('document-conflict-resolved'));
      },
    },
  });
}


/**
 * A Note save refused with 409 may only be missing comment anchors that another member added. In that case copy them
 * onto the creator's draft and adopt the server version. Returns false (a real conflict) when anchors cannot be placed.
 */
async function mergeNewCommentAnchors(
  draft: { id: string | number },
  parsedData: any,
  attempted: Set<string>,
): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/notes/${draft.id}`);
    if (!res.ok) return false;
    const server = await res.json();
    const key = `${draft.id}:${server.version}`;
    if (attempted.has(key) || typeof server.content !== 'string' || typeof parsedData?.content !== 'string') return false;
    if (server.title !== parsedData.title || String(server.project_id) !== String(parsedData.project_id)) return false;
    attempted.add(key);
    const merged = mergeServerCommentAnchors(server.content, parsedData.content);
    if (merged === null || !Number.isInteger(server.version)) return false;
    await updateCachedDiagramVersion(documentVersionKey(DraftType.NOTES, draft.id), server.version);
    await localPersistence.saveDraft(DraftType.NOTES, draft.id, JSON.stringify({ ...parsedData, content: merged }));
    return true;
  } catch {
    return false;
  }
}
