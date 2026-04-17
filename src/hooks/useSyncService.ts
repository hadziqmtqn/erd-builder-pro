import { useEffect, useCallback, useRef, useState } from 'react';
import { localPersistence } from '../lib/localPersistence';
import { DraftType } from '../types';
import { toast } from 'sonner';

export function useSyncService(isAuthenticated: boolean | null, isGuest: boolean = false) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<boolean>(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const healDraftData = useCallback((draftData: string, type: DraftType): string => {
    if (!draftData) return draftData;

    try {
      if (type === DraftType.DRAWINGS) {
        let parsed;
        try {
          parsed = JSON.parse(draftData);
        } catch (e) {
          return draftData; // Not JSON, could be legacy raw
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
                  // Sanitize URL - remove escaped newlines and trim whitespace
                  // JSON stores \n as literal characters, not actual newlines
                  const cleanUrl = file.dataURL.replace(/\\n/g, '').replace(/\\r/g, '').trim();
                  const isDataURL = cleanUrl.startsWith('data:');
                  const isValidHttpUrl = cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://');
                  
                  if (isValidHttpUrl && cleanUrl !== file.dataURL) {
                    // URL had whitespace - sanitize it instead of deleting
                    sanitizedFiles[id] = { ...file, dataURL: cleanUrl };
                    hasCorruption = true;
                  } else if (!isDataURL && !isValidHttpUrl) {
                    // Invalid format - could crash Excalidraw
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
            // Keep original
          }
        }
      }
    } catch (err) {
      console.error("Error during draft healing:", err);
    }
    return draftData;
  }, []);

  const syncDrafts = useCallback(async () => {
    if (!isAuthenticated || !navigator.onLine || isGuest) return;

    setIsSyncing(true);
    setSyncError(false);

    try {
      const pendingSyncs = await localPersistence.getAllPendingSyncs();
      if (pendingSyncs.length === 0) return;

      console.log(`Starting sync for ${pendingSyncs.length} pending items...`);
      
      let successCount = 0;

      for (const draft of pendingSyncs) {
        try {
          let endpoint = '';
          let body = {};
          let parsedData: any = {};
          
          // Apply healing layer to fix corrupted local state before syncing
          const healedData = healDraftData(draft.data, draft.type);
          
          try {
            parsedData = JSON.parse(healedData);
          } catch (e) {
            console.warn(`Malformed JSON in draft ${draft.id} (${draft.type}). Attempting recovery...`);
            // For Draw/Flowchart, we can treat the raw data as the drawing content
            if (draft.type !== DraftType.DRAWINGS && draft.type !== DraftType.FLOWCHART) {
              throw new Error("Critical JSON parse error in non-whiteboard draft");
            }
          }

          if (draft.type === DraftType.NOTES) {
            endpoint = `/api/notes/${draft.id}`;
            body = { title: parsedData.title, content: parsedData.content, project_id: parsedData.project_id };
          } else if (draft.type === DraftType.ERD) {
            endpoint = `/api/diagrams/save/${draft.id}`;
            // ERD save expects entities and relationships
            const entities = (parsedData.nodes || []).map((n: any) => ({
              ...n.data,
              x: n.position?.x || 0,
              y: n.position?.y || 0,
            }));
            const relationships = (parsedData.edges || []).map((e: any) => ({
              id: e.id,
              source_entity_id: e.source,
              target_entity_id: e.target,
              source_column_id: e.sourceHandle ? e.sourceHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') : undefined,
              target_column_id: e.targetHandle ? e.targetHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') : undefined,
              source_handle: e.sourceHandle || undefined,
              target_handle: e.targetHandle || undefined,
              type: 'one-to-many',
              label: e.label,
            }));
            body = { entities, relationships, viewport: parsedData.viewport };
          } else if (draft.type === DraftType.FLOWCHART) {
            endpoint = `/api/flowcharts/${draft.id}`;
            body = { 
              title: parsedData.title || 'Untitled Flowchart', 
              data: parsedData.data || (typeof parsedData === 'string' ? parsedData : draft.data), 
              project_id: parsedData.project_id || null 
            };
          } else if (draft.type === DraftType.DRAWINGS) {
            endpoint = `/api/drawings/${draft.id}`;
            body = { 
              title: parsedData.title || 'Untitled Drawing', 
              data: parsedData.data || (typeof parsedData === 'string' ? parsedData : draft.data), 
              project_id: parsedData.project_id || null 
            };
          }

          if (endpoint) {
            const res = await fetch(endpoint, {
              method: draft.type === DraftType.ERD ? 'POST' : 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });

            if (res.ok) {
              await localPersistence.saveDraft(draft.type, draft.id, healedData, false);
              successCount++;
            }
          }
        } catch (err) {
          console.warn(`Failed to sync item ${draft.id} (${draft.type}):`, err);
          setSyncError(true);
        }
      }

      if (successCount > 0) {
        // Only notify sparingly for quiet background syncs to avoid spam
        console.log(`Successfully synced ${successCount} items to cloud`);
      }
    } catch (err) {
      console.error('Sync service error:', err);
      setSyncError(true);
    } finally {
      setIsSyncing(false);
    }
  }, [isAuthenticated, isGuest, healDraftData]);

  // Debounced trigger to queue syncs (3000ms pause)
  const triggerDebouncedSync = useCallback(() => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      syncDrafts();
    }, 800);
  }, [syncDrafts]);

  useEffect(() => {
    // Initial sync check on mount if online
    if (navigator.onLine && isAuthenticated && !isGuest) {
      syncDrafts();
    }

    // Listener for coming back online
    const handleOnline = () => {
      console.log('App is back online. Triggering sync...');
      syncDrafts();
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    }
  }, [syncDrafts, isAuthenticated, isGuest]);

  return { syncDrafts, triggerDebouncedSync, isSyncing, syncError, healDraftData };
}
