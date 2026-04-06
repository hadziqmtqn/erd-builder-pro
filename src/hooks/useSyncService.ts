import { useEffect, useCallback } from 'react';
import { localPersistence } from '../lib/localPersistence';
import { DraftType } from '../types';
import { toast } from 'sonner';

export function useSyncService(isAuthenticated: boolean | null) {
  const syncDrafts = useCallback(async () => {
    if (!isAuthenticated || !navigator.onLine) return;

    try {
      const pendingSyncs = await localPersistence.getAllPendingSyncs();
      if (pendingSyncs.length === 0) return;

      console.log(`Starting sync for ${pendingSyncs.length} pending items...`);
      
      let successCount = 0;

      for (const draft of pendingSyncs) {
        try {
          let endpoint = '';
          let body = {};
          const parsedData = JSON.parse(draft.data);

          if (draft.type === DraftType.NOTES) {
            endpoint = `/api/notes/${draft.id}`;
            body = { title: parsedData.title, content: parsedData.content, project_id: parsedData.project_id };
          } else if (draft.type === DraftType.ERD) {
            endpoint = `/api/files/save/${draft.id}`;
            // ERD save expects entities and relationships
            const entities = parsedData.nodes.map((n: any) => ({
              ...n.data,
              x: n.position.x,
              y: n.position.y,
            }));
            const relationships = parsedData.edges.map((e: any) => ({
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
            body = { title: parsedData.title, data: parsedData.data, project_id: parsedData.project_id };
          } else if (draft.type === DraftType.DRAWINGS) {
            endpoint = `/api/drawings/${draft.id}`;
            body = { title: parsedData.title, data: parsedData.data, project_id: parsedData.project_id };
          }

          if (endpoint) {
            const res = await fetch(endpoint, {
              method: draft.type === DraftType.ERD ? 'POST' : 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });

            if (res.ok) {
              await localPersistence.saveDraft(draft.type, draft.id, draft.data, false);
              successCount++;
            }
          }
        } catch (err) {
          console.warn(`Failed to sync item ${draft.id} (${draft.type}):`, err);
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully synced ${successCount} items to cloud`, {
          description: "Your local changes have been merged.",
        });
      }
    } catch (err) {
      console.error('Sync service error:', err);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    // Initial sync check on mount if online
    if (navigator.onLine && isAuthenticated) {
      syncDrafts();
    }

    // Listener for coming back online
    const handleOnline = () => {
      console.log('App is back online. Triggering sync...');
      syncDrafts();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncDrafts, isAuthenticated]);

  return { syncDrafts };
}
